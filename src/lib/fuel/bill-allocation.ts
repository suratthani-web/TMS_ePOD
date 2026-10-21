// Real fuel bills → jobs. Shared by the fuel page and the Trip Performance report
// so both show the same fuel cost and real distance per job.
//
// Each bill refills what the truck burned since the previous bill (full-to-full),
// so a bill's km = its odometer − the previous bill's odometer (the last bill
// before the period anchors the first one).
//
// Bills are grouped into fill cycles: "enroute" top-ups accumulate and the next
// "end" fill closes the cycle (same rule as the fuel engine's km/L). A cycle is
// "covered" when the vehicle has a job dated between the previous cycle's closing
// fill and this one (inclusive) — that fuel belongs to a job, including the empty
// run back to base. Covered cycles are pooled per vehicle and spread over its jobs
// by job-distance share. Cycles with no job in their window (truck ran but no job
// is in the system — not keyed yet, or non-job use) stay unallocated and are shown
// separately instead of being dumped onto unrelated jobs.

export type FuelBillLog = {
  Vehicle_Plate: string | null
  Date_Time: string | null
  Price_Total: number | null
  Liters: number | null
  Odometer: number | null
  /** "enroute" = mid-trip top-up (doesn't close a cycle); "end"/unset closes it */
  Trip_Fill_Type?: string | null
}

export type RunJob = {
  Vehicle_Plate?: string | null
  Plan_Date?: string | null
  Est_Distance_KM?: number | string | null
}

type Pool = { cost: number; liters: number; km: number; count: number }

export type VehicleBillTotals = {
  /** every bill in the period */
  total: Pool
  /** bills with a job in their window — spread onto jobs */
  covered: Pool
  /** bills with no job in their window */
  uncovered: Pool & { dates: string[] }
  /** job km (Est_Distance_KM) of the vehicle's jobs in the period */
  jobKm: number
}

export type JobBillShare = {
  fuelCost: number
  liters: number
  /** 0 when the vehicle has no odometer span */
  realKm: number
}

/** Statuses of jobs that put km on the truck — the denominator for spreading bills. */
export const FUEL_RUN_STATUSES = ['Completed', 'Delivered', 'Finished', 'Closed', 'Billed', 'Paid', 'Verified', 'In Transit']

export const normalizePlate = (plate?: string | null) => (plate || '').replace(/\s+/g, '').trim()

/** Bill timestamps are mostly local ("2026-10-01T14:49:12") but some are UTC ("…Z"). */
function thaiDate(dt: string | null): string {
  const s = dt || ''
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(s)) {
    const t = new Date(s).getTime()
    if (!isNaN(t)) return new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10)
  }
  return s.slice(0, 10)
}

const emptyPool = (): Pool => ({ cost: 0, liters: 0, km: 0, count: 0 })

/**
 * @param logs      bills dated inside the period
 * @param priorLogs bills before the period — only the latest per vehicle is used (odometer + window anchor)
 * @param runJobs   every job of these vehicles in the period (all customers, FUEL_RUN_STATUSES),
 *                  not just the rows on screen — otherwise a filtered view absorbs the whole bill
 */
export function allocateFuelBills(logs: FuelBillLog[], priorLogs: FuelBillLog[], runJobs: RunJob[]) {
  const jobDates = new Map<string, string[]>()
  const jobKm = new Map<string, number>()
  const jobCount = new Map<string, number>()
  for (const j of runJobs) {
    const plate = normalizePlate(j.Vehicle_Plate)
    if (!plate) continue
    const d = String(j.Plan_Date || '').slice(0, 10)
    if (d) jobDates.set(plate, [...(jobDates.get(plate) || []), d])
    jobKm.set(plate, (jobKm.get(plate) || 0) + (Number(j.Est_Distance_KM) || 0))
    jobCount.set(plate, (jobCount.get(plate) || 0) + 1)
  }

  const anchor = new Map<string, FuelBillLog>()
  for (const l of priorLogs) {
    const plate = normalizePlate(l.Vehicle_Plate)
    if (!plate) continue
    const cur = anchor.get(plate)
    if (!cur || (l.Date_Time || '') > (cur.Date_Time || '')) anchor.set(plate, l)
  }

  const byPlate = new Map<string, FuelBillLog[]>()
  for (const l of logs) {
    const plate = normalizePlate(l.Vehicle_Plate)
    if (!plate) continue
    byPlate.set(plate, [...(byPlate.get(plate) || []), l])
  }

  const vehicles = new Map<string, VehicleBillTotals>()
  byPlate.forEach((list, plate) => {
    const sorted = [...list].sort((a, b) => (a.Date_Time || '').localeCompare(b.Date_Time || ''))
    const dates = jobDates.get(plate) || []
    const v: VehicleBillTotals = { total: emptyPool(), covered: emptyPool(), uncovered: { ...emptyPool(), dates: [] }, jobKm: round2(jobKm.get(plate) || 0) }
    const prior = anchor.get(plate)
    let prevOdo = Number(prior?.Odometer) || 0
    let windowFrom = prior ? thaiDate(prior.Date_Time) : ''
    let cycle: Pool = emptyPool()
    sorted.forEach((bill, i) => {
      const odo = Number(bill.Odometer) || 0
      cycle.cost += Number(bill.Price_Total) || 0
      cycle.liters += Number(bill.Liters) || 0
      cycle.km += odo > 0 && prevOdo > 0 && odo > prevOdo ? odo - prevOdo : 0
      cycle.count += 1
      if (odo > 0) prevOdo = odo // a bill without odometer can't anchor the next span

      const isLast = i === sorted.length - 1
      if (bill.Trip_Fill_Type === 'enroute' && !isLast) return // top-up → keep accumulating

      const to = thaiDate(bill.Date_Time)
      const from = windowFrom || thaiDate(sorted[0].Date_Time)
      const covered = dates.some(d => d >= from && d <= to)
      for (const pool of [v.total, covered ? v.covered : v.uncovered]) {
        pool.cost += cycle.cost
        pool.liters += cycle.liters
        pool.km += cycle.km
        pool.count += cycle.count
      }
      if (!covered && !v.uncovered.dates.includes(to)) v.uncovered.dates.push(to)
      windowFrom = to
      cycle = emptyPool()
    })
    for (const pool of [v.total, v.covered, v.uncovered]) {
      pool.cost = round2(pool.cost)
      pool.liters = round2(pool.liters)
      pool.km = round2(pool.km)
    }
    vehicles.set(plate, v)
  })

  const shareOf = (plate: string, km: number) => {
    const totalKm = jobKm.get(plate) || 0
    if (totalKm > 0) return km / totalKm
    const n = jobCount.get(plate) || 0
    return n > 0 ? 1 / n : 0 // no distances recorded → split evenly
  }

  /** Job's share of its vehicle's covered bills; null when no bill covers the vehicle's jobs in the period. */
  const share = (plate: string | null | undefined, km: number): JobBillShare | null => {
    const p = normalizePlate(plate)
    const v = vehicles.get(p)
    if (!v || v.covered.cost <= 0) return null
    const s = shareOf(p, km)
    return {
      fuelCost: round2(v.covered.cost * s),
      liters: round2(v.covered.liters * s),
      realKm: round2(v.covered.km * s),
    }
  }

  return { vehicles, share }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
