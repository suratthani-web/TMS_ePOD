// Fuel cost of a period from the REAL fuel bills — the one source every P&L view
// (executive dashboard, financial stats, vehicle profitability) uses, so they all
// agree with the fuel page and Trip Performance.
//
// Accrual basis: a period's fuel = bills matched to the period's jobs (allocateFuelBills:
// end fill closes the latest jobs / admin links, incl. the closing fill after the
// period), plus — for fleet-wide views — bills of trucks that ran with no job in the
// system during the period. Bills in the period that belong to a job before it are
// excluded (they count in that job's period). Company trucks whose job has no
// closing bill yet get a distance estimate; subcontracted trucks (รถร่วม) = 0.
import { createAdminClient } from '@/utils/supabase/server'
import { fetchAllRows } from '@/lib/supabase/analytics-helpers'
import { allocateFuelBills, normalizePlate, FUEL_RUN_STATUSES, type FuelBillLog, type RunJob } from './bill-allocation'

export type PeriodFuel = {
  /** fuel cost for the period's P&L */
  total: number
  /** bills matched to the period's (in-scope) jobs */
  matchedToJobs: number
  /** distance estimates for company-truck jobs with no closing bill yet */
  estimated: number
  estimatedJobs: number
  /** bills of trucks running with no job in the system (fleet-wide views only) */
  noJobRunning: number
  /** bills dated in the period (cash view, for reference) */
  billsInPeriod: number
  byJob: Map<string, number>
  /** by job Plan_Date */
  byDate: Map<string, number>
  /** by normalized plate */
  byPlate: Map<string, number>
}

type ScopedJob = RunJob & { Job_ID: string; Customer_ID?: string | null; Customer_Name?: string | null; Branch_ID?: string | null }

const DAY = 24 * 60 * 60 * 1000
const shift = (d: string, days: number) => new Date(new Date(`${d}T00:00:00`).getTime() + days * DAY).toISOString().slice(0, 10)
const round2 = (n: number) => Math.round(n * 100) / 100

export async function getPeriodFuel(opts: {
  start: string
  end: string
  branchId?: string | null
  customerId?: string | null
  customerNames?: string[]
}): Promise<PeriodFuel> {
  const { start, end } = opts
  const branchId = opts.branchId && opts.branchId !== 'All' ? opts.branchId : null
  const scopedToCustomer = !!opts.customerId || !!opts.customerNames?.length
  const supabase = createAdminClient()

  // Jobs in scope (what the P&L counts)
  const scoped = await fetchAllRows<ScopedJob>(() => {
    let q = supabase
      .from('Jobs_Main')
      .select('Job_ID, Vehicle_Plate, Plan_Date, Est_Distance_KM, Customer_ID, Customer_Name, Branch_ID')
      .in('Job_Status', FUEL_RUN_STATUSES)
      .gte('Plan_Date', start)
      .lte('Plan_Date', end)
    if (branchId) q = q.ilike('Branch_ID', branchId)
    if (opts.customerId) q = q.eq('Customer_ID', opts.customerId)
    if (opts.customerNames?.length) q = q.in('Customer_Name', opts.customerNames)
    return q
  })

  // Trucks: those of the scoped jobs + (fleet-wide) trucks with bills in the period
  const plates = new Set(scoped.map(j => j.Vehicle_Plate).filter(Boolean) as string[])
  if (!scopedToCustomer) {
    const billPlates = await fetchAllRows<{ Vehicle_Plate: string | null }>(() => {
      let q = supabase.from('Fuel_Logs').select('Vehicle_Plate').gte('Date_Time', `${start}T00:00:00`).lte('Date_Time', `${end}T23:59:59`)
      if (branchId) q = q.ilike('Branch_ID', branchId)
      return q
    })
    billPlates.forEach(b => { if (b.Vehicle_Plate) plates.add(b.Vehicle_Plate) })
  }
  const plateList = Array.from(plates)
  const empty: PeriodFuel = { total: 0, matchedToJobs: 0, estimated: 0, estimatedJobs: 0, noJobRunning: 0, billsInPeriod: 0, byJob: new Map(), byDate: new Map(), byPlate: new Map() }
  if (!plateList.length) return empty

  const [logs, prior, trailing, runJobs, vehicles] = await Promise.all([
    fetchAllRows<FuelBillLog>(() => supabase.from('Fuel_Logs').select('*').in('Vehicle_Plate', plateList)
      .gte('Date_Time', `${start}T00:00:00`).lte('Date_Time', `${end}T23:59:59`)),
    fetchAllRows<FuelBillLog>(() => supabase.from('Fuel_Logs').select('Log_ID, Vehicle_Plate, Date_Time, Price_Total, Liters, Odometer, Trip_Fill_Type').in('Vehicle_Plate', plateList)
      .gte('Date_Time', `${shift(start, -60)}T00:00:00`).lt('Date_Time', `${start}T00:00:00`)),
    fetchAllRows<FuelBillLog>(() => supabase.from('Fuel_Logs').select('*').in('Vehicle_Plate', plateList)
      .gt('Date_Time', `${end}T23:59:59`).lte('Date_Time', `${shift(end, 21)}T23:59:59`)),
    // every job of these trucks in the period (all customers) — the allocation denominator
    fetchAllRows<RunJob>(() => supabase.from('Jobs_Main').select('Job_ID, Vehicle_Plate, Plan_Date, Est_Distance_KM').in('Vehicle_Plate', plateList)
      .in('Job_Status', FUEL_RUN_STATUSES).gte('Plan_Date', start).lte('Plan_Date', end)),
    supabase.from('Master_Vehicles').select('Vehicle_Plate, Owner_Type').in('Vehicle_Plate', plateList),
  ])

  const { vehicles: bills, share } = allocateFuelBills(logs, prior, runJobs, trailing)
  const company = new Set(((vehicles.data || []) as { Vehicle_Plate: string; Owner_Type?: string | null }[])
    .filter(v => String(v.Owner_Type || '').toLowerCase() === 'company').map(v => normalizePlate(v.Vehicle_Plate)))

  const out = { ...empty, byJob: new Map<string, number>(), byDate: new Map<string, number>(), byPlate: new Map<string, number>() }
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, round2((m.get(k) || 0) + v))

  for (const j of scoped) {
    const plate = normalizePlate(j.Vehicle_Plate)
    const s = share(j.Job_ID)
    let cost = 0
    if (s) {
      cost = s.fuelCost
      out.matchedToJobs += cost
    } else if (company.has(plate)) {
      // closing bill not in yet — estimate from the truck's own bills (฿/L, km/L)
      const b = bills.get(plate)
      const kmpl = b && b.total.liters > 0 && b.total.km > 0 ? b.total.km / b.total.liters : 8.5
      const ppl = b && b.total.liters > 0 ? b.total.cost / b.total.liters : 38
      cost = round2(((Number(j.Est_Distance_KM) || 0) * 2 / kmpl) * ppl) // job km is one-way
      out.estimated += cost
      out.estimatedJobs += 1
    }
    if (!cost) continue
    add(out.byJob, j.Job_ID, cost)
    add(out.byDate, String(j.Plan_Date || '').slice(0, 10), cost)
    add(out.byPlate, plate, cost)
  }

  bills.forEach((b, plate) => {
    out.billsInPeriod += b.total.cost - b.trailing.cost
    if (!scopedToCustomer) {
      const noJob = b.uncovered.cost - b.beforePeriod.cost
      if (noJob > 0) { out.noJobRunning += noJob; add(out.byPlate, plate, noJob) }
    }
  })

  out.matchedToJobs = round2(out.matchedToJobs)
  out.estimated = round2(out.estimated)
  out.noJobRunning = round2(out.noJobRunning)
  out.billsInPeriod = round2(out.billsInPeriod)
  out.total = round2(out.matchedToJobs + out.estimated + out.noJobRunning)
  return out
}
