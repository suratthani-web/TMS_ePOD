"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, getCustomerId, isAdmin } from "@/lib/permissions"
import { fetchAllRows } from "@/lib/supabase/analytics-helpers"
import { getWearRates, type WearRateSource } from "@/lib/supabase/wear-rate"
import { allocateFuelBills, normalizePlate, FUEL_RUN_STATUSES, type FuelBillLog, type RunJob, type FuelFlag } from "@/lib/fuel/bill-allocation"
import type { FuelMatchInfo } from "@/components/fuel/fuel-match"

export interface TripCost {
  Job_ID: string
  Plan_Date: string | null
  Customer_Name: string | null
  Route_Name: string | null
  Origin_Location: string | null
  Dest_Location: string | null
  Driver_Name: string | null
  Vehicle_Plate: string | null
  Job_Status: string
  /** Revenue = ค่าเที่ยวลูกค้า + extra + ค่าใช้จ่ายอื่นที่เก็บลูกค้า (same basis as the invoice) */
  Cost_Customer_Total: number
  /** ค่าเที่ยวคนขับ (base) */
  Cost_Driver_Total: number
  /** ค่าใช้จ่ายอื่นฝั่งคนขับ (เด็กรถ/ขึ้นชั้น/ทางด่วน ฯลฯ) — base + this = Driver_Payments.Total_Amount */
  extra_cost: number
  extra_items: { type: string; amount: number }[]
  fuel_real: number
  fuel_liters: number
  /** bill = real bills matched to the job; estimate = company truck with no end fill closing it yet; subcontract = รถร่วม (fuel is theirs) */
  fuel_source: 'bill' | 'estimate' | 'subcontract'
  /** How the bills were matched (confidence, odometer fit, fills); null unless fuel_source = bill */
  fuel_match: FuelMatchInfo
  maint_real: number
  /** ฿/km wear rate applied to this trip and where it came from. */
  maint_rate: number
  maint_rate_source: WearRateSource
  toll_cost: number
  total_cost: number
  profit: number
  profit_pct: number
  /** Real km (odometer, bill-to-bill share) when the vehicle has bills; else job km */
  distance_km: number
  /** Planned/system route distance of the job (Est_Distance_KM) */
  est_km: number
  real_km_source: 'odometer' | 'job'
  drop_count: number
  drops: string[]
  loaded_qty: number | null
}

export interface CostSummary {
  totalTrips: number
  totalDrops: number
  totalRevenue: number
  totalDriverCost: number
  totalFuelCost: number
  totalWearCost: number
  totalCost: number
  totalProfit: number
  /** Real km where available (odometer), job km otherwise */
  totalDistance: number
  totalEstKm: number
  avgProfitPerTrip: number
  avgProfitPct: number
  avgCostPerKm: number
  /** Bills of the vehicles in this report vs what landed on the trips shown */
  fuelBills: {
    cost: number
    count: number
    liters: number
    allocatedToTrips: number
    /** Bills with no job in the system between them and the previous bill */
    noJobCost: number
    noJobKm: number
    noJobCount: number
    noJobDates: string[]
    /** bills dated after the period that closed jobs in it (included in allocatedToTrips) */
    trailingCost: number
  }
  /** Fill labels / jobs the admin should review */
  fuelFlags: FuelFlag[]
}

type CostTripSourceRow = {
  Plan_Date?: string | null
  Est_Distance_KM?: number | string | null
  Price_Cust_Total?: number | string | null
  Cost_Driver_Total?: number | string | null
  Cost_Driver_Extra?: number | string | null
  Price_Cust_Extra?: number | string | null
  extra_costs_json?: string | unknown[] | null
  extra_costs?: string | unknown[] | null
  Fuel_Cost?: number | string | null
  Maintenance_Cost?: number | string | null
  Toll_Cost?: number | string | null
  Job_ID?: string | null
  Customer_Name?: string | null
  Route_Name?: string | null
  Origin_Location?: string | null
  Dest_Location?: string | null
  Driver_Name?: string | null
  Vehicle_Plate?: string | null
  Job_Status?: string | null
  Loaded_Qty?: number | string | null
  Total_Drop?: number | string | null
  original_destinations_json?: string | unknown[] | null
}

export async function getCostPerTrip(startDate?: string, endDate?: string, customerNames?: string[]): Promise<{ trips: TripCost[], summary: CostSummary }> {
  const isUserAdmin = await isAdmin()
  const branchId = await getUserBranchId()
  const customerId = await getCustomerId()

  // Use Admin Client to bypass RLS if user is an Admin, otherwise they get 0 rows!
  const supabase = isUserAdmin ? createAdminClient() : await createClient()

  // Default: last 30 days
  const now = new Date()
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const start = startDate || (endDate ? endDate : defaultStart.toISOString().split('T')[0])
  const end = endDate || (startDate ? startDate : now.toISOString().split('T')[0])

  // Page past the 1000-row cap so the profitability report covers the whole
  // filtered range (.limit(1500) was clamped to 1000, truncating trips/costs).
  const data = await fetchAllRows<CostTripSourceRow>(() => {
    let query = supabase
      .from('Jobs_Main')
      .select('Job_ID, Plan_Date, Customer_Name, Route_Name, Origin_Location, Dest_Location, Driver_Name, Vehicle_Plate, Job_Status, Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, extra_costs_json, Est_Distance_KM, Loaded_Qty, Total_Drop, original_destinations_json')
      // Include Billed/Paid and Verified so completed work that has moved into
      // invoicing/verification still counts toward profitability.
      .in('Job_Status', ['Completed', 'Delivered', 'Finished', 'Closed', 'Billed', 'Paid', 'Verified'])
      .gte('Plan_Date', start)
      .lte('Plan_Date', end)
      .order('Plan_Date', { ascending: false })
    if (customerId) {
      query = query.eq('Customer_ID', customerId)
    } else {
      if (branchId && branchId !== 'All') query = query.eq('Branch_ID', branchId)
      if (customerNames && customerNames.length > 0) query = query.in('Customer_Name', customerNames)
    }
    return query
  })
  if (!data) return { trips: [], summary: emptySummary() }

  const rows = data as CostTripSourceRow[]
  const uniquePlates = Array.from(new Set(rows.map((d) => d.Vehicle_Plate).filter(Boolean))) as string[]

  // Fleet-level data (bills, every job of these trucks, wear) is read with the
  // admin client: a customer/branch-scoped client would hide other customers'
  // jobs on the same truck and dump that truck's whole bill onto these rows.
  const admin = createAdminClient()
  const priorFrom = new Date(new Date(`${start}T00:00:00`).getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const trailingTo = new Date(new Date(`${end}T00:00:00`).getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [fuelLogs, priorLogs, trailingLogs, runJobs, wearRates] = await Promise.all([
    uniquePlates.length > 0
      ? fetchAllRows<FuelBillLog>(() => admin
          .from('Fuel_Logs')
          .select('*') // '*' so Closes_Job_ID is picked up once the column exists (an explicit missing column would fail the whole query)
          .in('Vehicle_Plate', uniquePlates)
          .gte('Date_Time', `${start}T00:00:00`)
          .lte('Date_Time', `${end}T23:59:59`))
      : Promise.resolve([] as FuelBillLog[]),
    // Last bill before the period anchors the odometer (bill-to-bill km)
    uniquePlates.length > 0
      ? fetchAllRows<FuelBillLog>(() => admin
          .from('Fuel_Logs')
          .select('Log_ID, Vehicle_Plate, Date_Time, Price_Total, Liters, Odometer, Trip_Fill_Type')
          .in('Vehicle_Plate', uniquePlates)
          .gte('Date_Time', `${priorFrom}T00:00:00`)
          .lt('Date_Time', `${start}T00:00:00`))
      : Promise.resolve([] as FuelBillLog[]),
    // Bills after the period: the end fill closing the period's last job may come
    // the next morning / after a holiday (only admin-linked ones are used)
    uniquePlates.length > 0
      ? fetchAllRows<FuelBillLog>(() => admin
          .from('Fuel_Logs')
          .select('*')
          .in('Vehicle_Plate', uniquePlates)
          .gt('Date_Time', `${end}T23:59:59`)
          .lte('Date_Time', `${trailingTo}T23:59:59`))
      : Promise.resolve([] as FuelBillLog[]),
    // Every job these trucks ran in the period (all customers) — the denominator
    // for spreading each truck's bills
    uniquePlates.length > 0
      ? fetchAllRows<RunJob>(() => admin
          .from('Jobs_Main')
          .select('Job_ID, Vehicle_Plate, Plan_Date, Est_Distance_KM')
          .in('Vehicle_Plate', uniquePlates)
          .in('Job_Status', FUEL_RUN_STATUSES)
          .gte('Plan_Date', start)
          .lte('Plan_Date', end))
      : Promise.resolve([] as RunJob[]),
    // Wear (ค่าสึกหรอ) ฿/km per vehicle from the trailing year of completed repairs
    // + tires, so a big repair is spread over the km it serves instead of hitting
    // only the trips on the day it was reported.
    getWearRates(admin, end),
  ])

  const { vehicles: vehicleBills, share: billShare, flags: fuelFlags } = allocateFuelBills(fuelLogs || [], priorLogs || [], runJobs || [], trailingLogs || [])

  // Baseline km/L + ฿/L per vehicle — only used for company trucks with no covering bill
  const vehicleEff = new Map<string, { kmPerLiter: number; unitPrice: number }>()
  vehicleBills.forEach((b, plate) => {
    if (b.total.liters > 0) vehicleEff.set(plate, { kmPerLiter: b.total.km > 0 ? b.total.km / b.total.liters : 8.5, unitPrice: b.total.cost / b.total.liters })
  })

  const round2 = (n: number) => Math.round(n * 100) / 100

  const trips: TripCost[] = rows.map((d) => {
    const estKm = Number(d.Est_Distance_KM) || 0
    const planDate = d.Plan_Date || null
    const loadedQty = Number(d.Loaded_Qty) || 0
    const wear = wearRates.get(d.Vehicle_Plate)

    // Fuel: real bills matched to this job (end fill closes the latest jobs,
    // odometer-checked). Not closed yet → รถร่วม pays their own fuel (0); a
    // company truck gets an estimate and is flagged as such.
    const share = billShare(d.Job_ID)
    let fuelReal: number
    let fuelLiters: number
    let fuelSource: TripCost['fuel_source']
    if (share) {
      fuelReal = share.fuelCost
      fuelLiters = share.liters
      fuelSource = 'bill'
    } else if (wear.source === 'not_company') {
      fuelReal = 0
      fuelLiters = 0
      fuelSource = 'subcontract'
    } else {
      const eff = vehicleEff.get(normalizePlate(d.Vehicle_Plate)) || { kmPerLiter: 8.5, unitPrice: 38 }
      fuelLiters = estKm > 0 ? round2((estKm * 2) / eff.kmPerLiter) : 0 // job km is one-way; the truck comes back
      fuelReal = round2(fuelLiters * eff.unitPrice)
      fuelSource = 'estimate'
    }
    const realKm = share && share.realKm > 0 ? share.realKm : 0

    // Wear rate is ฿ per job-km (repairs ÷ Est_Distance_KM), so it multiplies job km
    const maintReal = Math.round(estKm * wear.ratePerKm)

    const tollCost = 0
    const driverCost = Number(d.Cost_Driver_Total) || 0

    // "ค่าใช้จ่ายอื่นๆ" line items (extra_costs_json) — the driver-cost portion is
    // folded into extra_cost (shown together with ค่าคนขับ), and the customer-charge
    // portion into revenue. base + driver extras = Driver_Payments.Total_Amount.
    const extraItems = parseExtraCosts(d.extra_costs_json ?? d.extra_costs)
    const extraItemsDriver = extraItems.reduce((s, c) => s + (Number(c?.cost_driver) || 0), 0)
    const extraItemsCharge = extraItems.reduce((s, c) => s + (Number(c?.charge_cust) || 0), 0)
    const extraBreakdown = extraItems
      .filter(c => (Number(c?.cost_driver) || 0) !== 0)
      .map(c => ({ type: String(c?.type || 'อื่นๆ'), amount: Number(c?.cost_driver) || 0 }))
    if (Number(d.Cost_Driver_Extra)) extraBreakdown.push({ type: 'ค่าใช้จ่ายเพิ่ม', amount: Number(d.Cost_Driver_Extra) })

    const extraCost = (Number(d.Cost_Driver_Extra) || 0) + extraItemsDriver

    const revenue = (Number(d.Price_Cust_Total) || 0) + (Number(d.Price_Cust_Extra) || 0) + extraItemsCharge

    const totalCost = driverCost + extraCost + fuelReal + maintReal + tollCost
    const profit = revenue - totalCost
    const profitPct = revenue > 0 ? (profit / revenue) * 100 : 0

    const drops = parseDrops(d.original_destinations_json, d.Dest_Location)
    const dropCount = drops.length || Number(d.Total_Drop) || 1

    return {
      Job_ID: d.Job_ID || "",
      Plan_Date: planDate,
      Customer_Name: d.Customer_Name ?? null,
      Route_Name: d.Route_Name ?? null,
      Origin_Location: d.Origin_Location ?? null,
      Dest_Location: d.Dest_Location ?? null,
      Driver_Name: d.Driver_Name ?? null,
      Vehicle_Plate: d.Vehicle_Plate ?? null,
      Job_Status: d.Job_Status || "",
      Cost_Customer_Total: revenue,
      Cost_Driver_Total: driverCost,
      extra_cost: extraCost,
      extra_items: extraBreakdown,
      fuel_real: fuelReal,
      fuel_liters: fuelLiters,
      fuel_source: fuelSource,
      fuel_match: share ? { confidence: share.confidence, ratio: share.ratio, groupJobs: share.groupJobs, fills: share.fills, open: share.open } : null,
      maint_real: maintReal,
      maint_rate: wear.ratePerKm,
      maint_rate_source: wear.source,
      toll_cost: tollCost,
      total_cost: round2(totalCost),
      profit: round2(profit),
      profit_pct: Math.round(profitPct * 10) / 10,
      distance_km: realKm > 0 ? realKm : estKm,
      est_km: estKm,
      real_km_source: realKm > 0 ? 'odometer' : 'job',
      drop_count: dropCount,
      drops,
      loaded_qty: loadedQty,
    }
  })

  const sum = (f: (t: TripCost) => number) => round2(trips.reduce((s, t) => s + f(t), 0))
  const totalTrips = trips.length
  const totalRevenue = sum(t => t.Cost_Customer_Total)
  const totalCostSum = sum(t => t.total_cost)
  const totalProfit = round2(totalRevenue - totalCostSum)
  const totalDistance = sum(t => t.distance_km)

  // bill totals are for bills dated in the period; trailing (post-period) bills are reported separately
  let billCost = 0, billCount = 0, billLiters = 0, noJobCost = 0, noJobKm = 0, noJobCount = 0, trailingCost = 0
  const noJobDates = new Set<string>()
  vehicleBills.forEach(b => {
    billCost += b.total.cost - b.trailing.cost; billCount += b.total.count - b.trailing.count; billLiters += b.total.liters - b.trailing.liters
    trailingCost += b.trailing.cost
    noJobCost += b.uncovered.cost; noJobKm += b.uncovered.km; noJobCount += b.uncovered.count
    b.uncovered.dates.forEach(d => noJobDates.add(d))
  })

  const summary: CostSummary = {
    totalTrips,
    totalDrops: sum(t => t.drop_count),
    totalRevenue,
    totalDriverCost: sum(t => t.Cost_Driver_Total + t.extra_cost),
    totalFuelCost: sum(t => t.fuel_real),
    totalWearCost: sum(t => t.maint_real),
    totalCost: totalCostSum,
    totalProfit,
    totalDistance,
    totalEstKm: sum(t => t.est_km),
    avgProfitPerTrip: totalTrips > 0 ? totalProfit / totalTrips : 0,
    avgProfitPct: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    avgCostPerKm: totalDistance > 0 ? totalCostSum / totalDistance : 0,
    fuelBills: {
      cost: round2(billCost),
      count: billCount,
      liters: round2(billLiters),
      allocatedToTrips: sum(t => (t.fuel_source === 'bill' ? t.fuel_real : 0)),
      trailingCost: round2(trailingCost),
      noJobCost: round2(noJobCost),
      noJobKm: round2(noJobKm),
      noJobCount,
      noJobDates: Array.from(noJobDates).sort(),
    },
    // Fleet-level review items — internal only
    fuelFlags: customerId ? [] : fuelFlags,
  }

  return { trips, summary }
}

function parseDrops(raw: string | unknown[] | null | undefined, fallback?: string | null): string[] {
  let v: unknown = raw
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { v = null } }
  if (Array.isArray(v)) {
    const names = v.map(d => String((d as { name?: unknown })?.name ?? '').trim()).filter(Boolean)
    if (names.length > 0) return names
  }
  return fallback ? [fallback] : []
}

function parseExtraCosts(raw: string | unknown[] | null | undefined): { type?: string; cost_driver?: number | string; charge_cust?: number | string }[] {
  if (!raw) return []
  try {
    const arr = Array.isArray(raw) ? raw : JSON.parse(String(raw))
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function emptySummary(): CostSummary {
  return { totalTrips: 0, totalDrops: 0, totalRevenue: 0, totalDriverCost: 0, totalFuelCost: 0, totalWearCost: 0, totalCost: 0, totalProfit: 0, totalDistance: 0, totalEstKm: 0, avgProfitPerTrip: 0, avgProfitPct: 0, avgCostPerKm: 0, fuelBills: { cost: 0, count: 0, liters: 0, allocatedToTrips: 0, noJobCost: 0, noJobKm: 0, noJobCount: 0, noJobDates: [], trailingCost: 0 }, fuelFlags: [] }
}
