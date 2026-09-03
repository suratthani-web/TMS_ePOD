"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, getCustomerId, isAdmin } from "@/lib/permissions"
import { fetchAllRows } from "@/lib/supabase/analytics-helpers"

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
  Cost_Customer_Total: number
  Cost_Driver_Total: number
  fuel_real: number
  maint_real: number
  fuel_est: number
  maint_est: number
  toll_cost: number
  extra_cost: number
  total_cost: number
  profit: number
  profit_pct: number
  distance_km: number
  loaded_qty: number | null
  fuel_price: number | null
}

export interface CostSummary {
  totalTrips: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  totalDistance: number
  avgProfitPerTrip: number
  avgProfitPct: number
  avgCostPerKm: number
}

type CostTripSourceRow = {
  Plan_Date?: string | null
  Est_Distance_KM?: number | string | null
  Price_Cust_Total?: number | string | null
  Cost_Driver_Total?: number | string | null
  Cost_Driver_Extra?: number | string | null
  Price_Cust_Extra?: number | string | null
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
}

type FuelPriceRow = {
  Date: string
  Price: number
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
      .select('Job_ID, Plan_Date, Customer_Name, Route_Name, Origin_Location, Dest_Location, Driver_Name, Vehicle_Plate, Job_Status, Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, Est_Distance_KM, Loaded_Qty')
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

  // Fetch all unique fuel prices for the relevant dates in one go
  const rows = data as CostTripSourceRow[]
  const uniqueDates = Array.from(new Set(rows.map((d) => d.Plan_Date).filter(Boolean))) as string[]
  const uniquePlates = Array.from(new Set(rows.map((d) => d.Vehicle_Plate).filter(Boolean))) as string[]

  const { data: fuelData } = await supabase
    .from('daily_fuel_prices')
    .select('Date, Price')
    .in('Date', uniqueDates)
  
  const fuelMap = new Map((fuelData as FuelPriceRow[] | null)?.map((f) => [f.Date, f.Price]) || [])
  
  // Get latest price as global fallback
  const { data: latestFuel } = await supabase
    .from('daily_fuel_prices')
    .select('Price')
    .order('Date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const globalFallbackPrice = latestFuel?.Price || 35.0 // Baht/Litre

  // Fetch actual Fuel Logs for the vehicles & date range
  let fuelLogs: { Vehicle_Plate: string | null; Date_Time: string | null; Price_Total: number | null; Liters: number | null; Odometer: number | null }[] = []
  if (uniquePlates.length > 0) {
    fuelLogs = await fetchAllRows(() => {
      let fQuery = supabase
        .from('Fuel_Logs')
        .select('Vehicle_Plate, Date_Time, Price_Total, Liters, Odometer')
        .in('Vehicle_Plate', uniquePlates)
        .gte('Date_Time', `${start}T00:00:00`)
        .lte('Date_Time', `${end}T23:59:59`)
      return fQuery
    })
  }

  // Fetch actual Repair/Maintenance Tickets for the vehicles & date range
  let maintLogs: { Vehicle_Plate: string | null; Date_Report: string | null; Cost_Total: number | null }[] = []
  if (uniquePlates.length > 0) {
    maintLogs = await fetchAllRows(() => {
      let mQuery = supabase
        .from('Repair_Tickets')
        .select('Vehicle_Plate, Date_Report, Cost_Total')
        .in('Vehicle_Plate', uniquePlates)
        .eq('Status', 'completed')
        .gte('Date_Report', start)
        .lte('Date_Report', end)
      return mQuery
    })
  }

  const normalizePlate = (plate?: string | null) => (plate || '').replace(/\s+/g, '').trim()

  // 1. Compute Vehicle-Level Baselines (Actual km/L and unit price from Refuels)
  const vehicleRefuels = new Map<string, typeof fuelLogs>()
  for (const log of fuelLogs) {
    if (!log.Vehicle_Plate) continue
    const norm = normalizePlate(log.Vehicle_Plate)
    const list = vehicleRefuels.get(norm) || []
    list.push(log)
    vehicleRefuels.set(norm, list)
  }

  const vehicleEfficiencyMap = new Map<string, { kmPerLiter: number; avgUnitPrice: number }>()
  vehicleRefuels.forEach((logs, plateNorm) => {
    const sorted = [...logs].sort((a, b) => (a.Date_Time || '').localeCompare(b.Date_Time || ''))
    let totalDist = 0
    let totalLiters = 0
    let totalCost = 0

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      if (prev.Odometer && curr.Odometer && curr.Odometer > prev.Odometer && (Number(curr.Liters) || 0) > 0) {
        totalDist += (curr.Odometer - prev.Odometer)
        totalLiters += Number(curr.Liters) || 0
      }
    }

    logs.forEach(l => {
      totalCost += Number(l.Price_Total) || 0
      if (!totalLiters) totalLiters += Number(l.Liters) || 0
    })

    const kmPerLiter = totalDist > 0 && totalLiters > 0 ? +(totalDist / totalLiters).toFixed(2) : 8.5
    const avgUnitPrice = totalCost > 0 && totalLiters > 0 ? +(totalCost / totalLiters).toFixed(2) : 38.0
    vehicleEfficiencyMap.set(plateNorm, { kmPerLiter, avgUnitPrice })
  })

  // Map Maintenance Logs by (Vehicle_Plate | YYYY-MM-DD)
  const vehicleDayMaint = new Map<string, number>()
  for (const m of maintLogs) {
    if (!m.Vehicle_Plate || !m.Date_Report) continue
    const date = m.Date_Report.slice(0, 10)
    const key = `${normalizePlate(m.Vehicle_Plate)}|${date}`
    const curr = vehicleDayMaint.get(key) || 0
    vehicleDayMaint.set(key, curr + (Number(m.Cost_Total) || 0))
  }

  // Calculate day total distance & trip count per vehicle-day for maintenance cost allocation
  const dayEstDistance = new Map<string, number>()
  const dayTripCount = new Map<string, number>()
  for (const r of rows) {
    const normPlate = normalizePlate(r.Vehicle_Plate)
    const date = String(r.Plan_Date || '').slice(0, 10)
    const key = `${normPlate}|${date}`
    const dist = Number(r.Est_Distance_KM) || 0
    dayEstDistance.set(key, (dayEstDistance.get(key) || 0) + dist)
    dayTripCount.set(key, (dayTripCount.get(key) || 0) + 1)
  }

  const trips: TripCost[] = rows.map((d) => {
    const dist = Number(d.Est_Distance_KM) || 0
    const planDate = d.Plan_Date || null
    const loadedQty = Number(d.Loaded_Qty) || 0
    const normPlate = normalizePlate(d.Vehicle_Plate)
    const bucketKey = planDate ? `${normPlate}|${planDate}` : ''

    // Estimates (For reference only)
    const dailyPrice = planDate ? fuelMap.get(planDate) || 0 : 0
    const fuelEst = dist > 0 ? dist * 3.5 : 0
    const maintEst = dist * 1.25

    // Real fuel cost: calculated from actual vehicle efficiency (KM/L) & actual unit fuel price
    const eff = vehicleEfficiencyMap.get(normPlate) || { kmPerLiter: 8.5, avgUnitPrice: 38.0 }
    let fuelReal = 0
    if (dist > 0) {
      const consumedLiters = +(dist / eff.kmPerLiter).toFixed(2)
      fuelReal = Math.round(consumedLiters * eff.avgUnitPrice)
    }

    // Real maintenance cost from Repair_Tickets
    let maintReal = 0
    const maintBucketCost = (bucketKey ? vehicleDayMaint.get(bucketKey) : null) || 0
    if (maintBucketCost > 0) {
      const totalDayDist = dayEstDistance.get(bucketKey) || 0
      const totalDayTrips = dayTripCount.get(bucketKey) || 1
      const share = totalDayDist > 0 ? (dist / totalDayDist) : (1 / totalDayTrips)
      maintReal = Math.round(maintBucketCost * share)
    }

    const tollCost = 0
    const driverCost = Number(d.Cost_Driver_Total) || 0
    const extraCost = Number(d.Cost_Driver_Extra) || 0
    
    const revenue = (Number(d.Price_Cust_Total) || 0) + (Number(d.Price_Cust_Extra) || 0)
    
    // Total cost now includes actual allocated fuel and actual maintenance
    const totalCost = driverCost + fuelReal + maintReal + tollCost + extraCost
    const profit = revenue - totalCost
    const profitPct = revenue > 0 ? (profit / revenue) * 100 : 0

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
      fuel_real: fuelReal,
      maint_real: maintReal,
      fuel_est: fuelEst,
      maint_est: maintEst,
      toll_cost: tollCost,
      extra_cost: extraCost,
      total_cost: totalCost,
      profit,
      profit_pct: Math.round(profitPct * 10) / 10,
      distance_km: dist,
      loaded_qty: loadedQty,
      fuel_price: (planDate ? fuelMap.get(planDate) : 0) || (loadedQty > 0 ? (revenue / loadedQty) : globalFallbackPrice)
    }
  })

  const totalTrips = trips.length
  const totalRevenue = trips.reduce((s, t) => s + t.Cost_Customer_Total, 0)
  const totalCostSum = trips.reduce((s, t) => s + t.total_cost, 0)
  const totalProfit = totalRevenue - totalCostSum
  const totalDistance = trips.reduce((s, t) => s + t.distance_km, 0)

  const summary: CostSummary = {
    totalTrips,
    totalRevenue,
    totalCost: totalCostSum,
    totalProfit,
    totalDistance,
    avgProfitPerTrip: totalTrips > 0 ? totalProfit / totalTrips : 0,
    avgProfitPct: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    avgCostPerKm: totalDistance > 0 ? totalCostSum / totalDistance : 0
  }

  return { trips, summary }
}

function emptySummary(): CostSummary {
  return { totalTrips: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, totalDistance: 0, avgProfitPerTrip: 0, avgProfitPct: 0, avgCostPerKm: 0 }
}
