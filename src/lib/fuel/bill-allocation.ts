// Real fuel bills → jobs. Shared by the fuel page and the Trip Performance report
// so both show the same fuel cost and real distance per job.
//
// The fill loop drivers follow: a trip may have "enroute" top-ups, and the "end"
// fill (right after the trip, the next morning before pickup, or days later after
// a holiday) brings the tank back to full and closes the LATEST job(s) not yet
// closed. So:
//   1. Fill cycles: enroute bills accumulate; an end bill closes the cycle. Cycle
//      km = odometer span (each bill refills what was burned since the previous
//      bill; the last bill before the period anchors the first one).
//   2. Each closing end fill takes every not-yet-closed job that ran before it —
//      Plan_Date earlier than the fill's date, or the same date with the fill
//      at/after noon (an end fill on the morning of D closes the jobs before D).
//   3. Odometer check: a job should burn ~its round trip (2 × Est_Distance_KM).
//      Labels/dates are keyed by hand and sometimes slip one slot (an end fill
//      mid-trip, a job dated a day off), which shows up as adjacent groups that
//      are over then under. Such neighbours are merged into one group when that
//      makes the km fit; the end fill at the seam is flagged for admin review.
//   4. Within a group, cost/litres/km are split by job distance share.
// Groups with no job (truck ran with no job in the system) stay unallocated and
// are reported separately instead of being dumped onto unrelated jobs.

export type FuelBillLog = {
  Log_ID?: string | null
  Vehicle_Plate: string | null
  Date_Time: string | null
  Price_Total: number | null
  Liters: number | null
  Odometer: number | null
  /** "enroute" = mid-trip top-up (doesn't close a cycle); "end"/unset closes it */
  Trip_Fill_Type?: string | null
  /** Admin link: job(s) this end fill closes, comma-separated (overrides the auto rule) */
  Closes_Job_ID?: string | null
}

export type RunJob = {
  Job_ID?: string | null
  Vehicle_Plate?: string | null
  Plan_Date?: string | null
  Est_Distance_KM?: number | string | null
}

type Pool = { cost: number; liters: number; km: number; count: number }

export type VehicleBillTotals = {
  /** every bill in the period */
  total: Pool
  /** bills that landed on jobs */
  covered: Pool
  /** bills of groups with no job (incl. a leading cycle that closes a job from before the period) */
  uncovered: Pool & { dates: string[] }
  /** job km (Est_Distance_KM) of the vehicle's jobs in the period */
  jobKm: number
  /** bills after the period pulled in because an admin linked them to a job in the period (inside total/covered) */
  trailing: Pool
  /** bills dated in the period that belong to a job before it (linked, or the leading cycle) — inside uncovered */
  beforePeriod: Pool
}

/** confirmed = closing fill linked to the job by an admin */
export type FuelConfidence = 'confirmed' | 'high' | 'medium' | 'low'

export type JobBillShare = {
  fuelCost: number
  liters: number
  /** 0 when the group has no odometer span */
  realKm: number
  confidence: FuelConfidence
  /** group odometer km ÷ group round-trip job km (0 when unknown) */
  ratio: number
  /** jobs sharing the matched fills (1 = the fills belong to this job alone) */
  groupJobs: number
  /** matched fills, e.g. "29/10 14:05 ระหว่างทาง" */
  fills: string[]
  /** the group's cycle has no end fill yet in the period — fuel so far only */
  open: boolean
}

export type FuelFlagKind = 'end_mid_trip' | 'no_job' | 'km_mismatch' | 'no_odometer' | 'link_conflict'

export type FuelFlag = {
  plate: string
  at: string
  logId: string | null
  kind: FuelFlagKind
  message: string
  jobIds: string[]
}

/** Statuses of jobs that put km on the truck — the denominator for spreading bills. */
export const FUEL_RUN_STATUSES = ['Completed', 'Delivered', 'Finished', 'Closed', 'Billed', 'Paid', 'Verified', 'In Transit']

/** Est_Distance_KM is one-way; the truck comes back empty. */
const ROUND_TRIP = 2
/** An end fill before this hour on day D is the "fill before pickup" closing jobs before D. */
const MORNING_CUTOFF_HOUR = 12
/** A group fits when odometer km is within these ratios of round-trip job km. */
const FIT = { high: [0.8, 1.25], medium: [0.67, 1.5] } as const
const MAX_GROUP_CYCLES = 6

/** Closes_Job_ID holds one or more job ids, comma-separated. */
export const parseJobLinks = (v?: string | null): string[] =>
  Array.from(new Set(String(v || '').split(',').map(s => s.trim()).filter(Boolean)))

export const normalizePlate = (plate?: string | null) => (plate || '').replace(/\s+/g, '').trim()

/** Bill timestamps are mostly local ("2026-10-01T14:49:12") but some are UTC ("…Z"). → "YYYY-MM-DDTHH:MM" local */
function localStamp(dt: string | null): string {
  const s = dt || ''
  if (/[zZ]$|[+-]\d\d:\d\d$/.test(s)) {
    const t = new Date(s).getTime()
    if (!isNaN(t)) return new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 16)
  }
  return s.slice(0, 16)
}

const fmtFill = (stamp: string, type?: string | null) =>
  `${stamp.slice(8, 10)}/${stamp.slice(5, 7)} ${stamp.slice(11, 16)} ${type === 'enroute' ? 'ระหว่างทาง' : 'จบงาน'}`

const emptyPool = (): Pool => ({ cost: 0, liters: 0, km: 0, count: 0 })

type Job = { id: string; date: string; km: number }
type Cycle = Pool & { bills: FuelBillLog[]; stamps: string[]; closed: boolean; linkedJobs: string[] }
/** leading = closes a job from before the period (not a no-job run) */
type Group = { cycles: Cycle[]; jobs: Job[]; leading: boolean }
const isLinked = (g: Group) => g.cycles.some(c => c.linkedJobs.length > 0)

const groupKm = (g: Group) => g.cycles.reduce((s, c) => s + c.km, 0)
const groupExpected = (g: Group) => g.jobs.reduce((s, j) => s + j.km * ROUND_TRIP, 0)
const groupErr = (g: Group) => Math.abs(groupKm(g) - groupExpected(g))
const ratioOf = (g: Group) => (groupExpected(g) > 0 && groupKm(g) > 0 ? groupKm(g) / groupExpected(g) : 0)
const fits = (g: Group, [lo, hi]: readonly [number, number]) => { const r = ratioOf(g); return r >= lo && r <= hi }
/** Worth re-grouping: a job group outside the high band, or km run with no job (merge itself must cut the error ≥40%). */
const isOff = (g: Group) => (g.jobs.length ? !fits(g, FIT.high) : groupKm(g) > 0)

/**
 * @param logs      bills dated inside the period
 * @param priorLogs bills before the period — the latest per vehicle anchors the odometer
 * @param runJobs   every job of these vehicles in the period (all customers, FUEL_RUN_STATUSES),
 *                  not just the rows on screen — otherwise a filtered view absorbs the whole bill
 * @param trailingLogs bills after the period (a couple of weeks). Only those up to the last end fill
 *                  linked to a job in the period are used — the fill that closes the period's last
 *                  job often comes the next morning or after a holiday. Linked-only, so the next
 *                  period never counts the same bill (there it is linked to a job outside its range).
 */
export function allocateFuelBills(logs: FuelBillLog[], priorLogs: FuelBillLog[], runJobs: RunJob[], trailingLogs: FuelBillLog[] = []) {
  const jobsByPlate = new Map<string, Job[]>()
  for (const j of runJobs) {
    const plate = normalizePlate(j.Vehicle_Plate)
    if (!plate) continue
    jobsByPlate.set(plate, [...(jobsByPlate.get(plate) || []), { id: String(j.Job_ID || ''), date: String(j.Plan_Date || '').slice(0, 10), km: Number(j.Est_Distance_KM) || 0 }])
  }

  const anchor = new Map<string, FuelBillLog>()
  for (const l of priorLogs) {
    const plate = normalizePlate(l.Vehicle_Plate)
    if (!plate || !(Number(l.Odometer) > 0)) continue
    const cur = anchor.get(plate)
    if (!cur || (l.Date_Time || '') > (cur.Date_Time || '')) anchor.set(plate, l)
  }

  const periodJobIds = new Set(runJobs.map(j => String(j.Job_ID || '')).filter(Boolean))
  const trailingSet = new Set<FuelBillLog>()
  const trailingByPlate = new Map<string, FuelBillLog[]>()
  for (const l of trailingLogs) {
    const plate = normalizePlate(l.Vehicle_Plate)
    if (plate) trailingByPlate.set(plate, [...(trailingByPlate.get(plate) || []), l])
  }
  trailingByPlate.forEach(list => {
    const sorted = [...list].sort((a, b) => localStamp(a.Date_Time).localeCompare(localStamp(b.Date_Time)))
    let lastIdx = -1
    sorted.forEach((b, i) => { if (b.Trip_Fill_Type !== 'enroute' && parseJobLinks(b.Closes_Job_ID).some(id => periodJobIds.has(id))) lastIdx = i })
    sorted.slice(0, lastIdx + 1).forEach(b => { trailingSet.add(b); logs = [...logs, b] })
  })

  const byPlate = new Map<string, FuelBillLog[]>()
  for (const l of logs) {
    const plate = normalizePlate(l.Vehicle_Plate)
    if (plate) byPlate.set(plate, [...(byPlate.get(plate) || []), l])
  }

  const vehicles = new Map<string, VehicleBillTotals>()
  const shares = new Map<string, JobBillShare>()
  const flags: FuelFlag[] = []

  byPlate.forEach((list, plate) => {
    const bills = [...list].sort((a, b) => localStamp(a.Date_Time).localeCompare(localStamp(b.Date_Time)))
    const jobs = [...(jobsByPlate.get(plate) || [])].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

    // 1. fill cycles
    const cycles: Cycle[] = []
    let prevOdo = Number(anchor.get(plate)?.Odometer) || 0
    let cur: Cycle = { ...emptyPool(), bills: [], stamps: [], closed: false, linkedJobs: [] }
    for (const b of bills) {
      const odo = Number(b.Odometer) || 0
      cur.cost += Number(b.Price_Total) || 0
      cur.liters += Number(b.Liters) || 0
      cur.km += odo > 0 && prevOdo > 0 && odo > prevOdo ? odo - prevOdo : 0
      cur.count += 1
      cur.bills.push(b)
      cur.stamps.push(localStamp(b.Date_Time))
      if (odo > 0) prevOdo = odo // a bill without odometer can't anchor the next span
      else flags.push({ plate, at: localStamp(b.Date_Time), logId: b.Log_ID ?? null, kind: 'no_odometer', message: 'บิลไม่มีเลขไมล์ — ระยะของรอบนี้ไปรวมกับรอบถัดไป', jobIds: [] })
      if (b.Trip_Fill_Type !== 'enroute') { cur.closed = true; cur.linkedJobs = parseJobLinks(b.Closes_Job_ID); cycles.push(cur); cur = { ...emptyPool(), bills: [], stamps: [], closed: false, linkedJobs: [] } }
    }
    if (cur.count) cycles.push(cur) // trailing enroute fills, no end fill yet

    // 2. each end fill closes the latest not-yet-closed jobs.
    //    Admin links (Closes_Job_ID) are hard boundaries and work both ways:
    //    - one fill → several jobs (short runs cut in one fill)
    //    - several fills → one job (all their fuel goes to that job)
    //    A linked fill takes its linked jobs plus every earlier unclosed job;
    //    auto-matched fills never take a linked job nor pass a job that a later
    //    fill is linked to.
    const jobIndex = new Map(jobs.map((j, i) => [j.id, i]))
    const linkers = new Map<number, number[]>() // job index → cycle indexes linking it
    cycles.forEach((c, ci) => c.linkedJobs.forEach(id => {
      const k = jobIndex.get(id)
      if (k !== undefined) linkers.set(k, [...(linkers.get(k) || []), ci])
    }))
    const jobGroup = new Map<number, Group>() // job index → group that took it

    const groups: Group[] = []
    cycles.forEach((c, ci) => {
      const last = c.stamps[c.stamps.length - 1]
      const endBill = c.bills[c.bills.length - 1]

      if (c.linkedJobs.length) {
        const ks = c.linkedJobs.map(id => jobIndex.get(id)).filter((k): k is number => k !== undefined)
        if (!ks.length) {
          // linked only to jobs outside this period (e.g. the day before it starts)
          groups.push({ cycles: [c], jobs: [], leading: true })
          return
        }
        const maxK = Math.max(...ks)
        const fresh: number[] = []
        for (let i = 0; i <= maxK; i++) {
          if (jobGroup.has(i)) continue
          const by = linkers.get(i)
          if (!by || by.includes(ci)) fresh.push(i) // unlinked earlier job, or linked here
        }
        // a linked job already taken by an earlier linked fill → this fill joins that group
        const joined = Array.from(new Set(ks.map(k => jobGroup.get(k)).filter((g): g is Group => !!g)))
        const target = joined[0]
        if (joined.length > 1) {
          flags.push({ plate, at: last, logId: endBill.Log_ID ?? null, kind: 'link_conflict', message: `บิลนี้ผูกกับงานที่อยู่คนละรอบการตัดน้ำมัน (${c.linkedJobs.join(', ')}) — ตรวจการผูก`, jobIds: c.linkedJobs })
        }
        if (target) {
          target.cycles.push(c)
          fresh.forEach(i => { target.jobs.push(jobs[i]); jobGroup.set(i, target) })
        } else {
          const g: Group = { cycles: [c], jobs: fresh.map(i => jobs[i]), leading: false }
          fresh.forEach(i => jobGroup.set(i, g))
          groups.push(g)
        }
        return
      }

      const fillDate = last.slice(0, 10)
      const hour = Number(last.slice(11, 13)) || 0
      const ranBefore = (d: string) => d < fillDate || (d === fillDate && (hour >= MORNING_CUTOFF_HOUR || !c.closed))
      const taken: number[] = []
      for (let i = 0; i < jobs.length; i++) {
        if (jobGroup.has(i)) continue
        const by = linkers.get(i)
        if (by) { if (Math.min(...by) > ci) break; continue } // reserved by a linked fill
        if (!ranBefore(jobs[i].date)) break
        taken.push(i)
      }
      const g: Group = { cycles: [c], jobs: taken.map(i => jobs[i]), leading: groups.length === 0 && taken.length === 0 }
      taken.forEach(i => jobGroup.set(i, g))
      groups.push(g)
    })
    // jobs after the last fill have no closing bill yet → caller estimates them

    // 3. merge adjacent over/under neighbours while it clearly improves the km fit
    for (;;) {
      let bestIdx = -1, bestGain = 0
      for (let i = 0; i < groups.length - 1; i++) {
        const a = groups[i], b = groups[i + 1]
        // admin-linked groups are ground truth — never re-grouped
        if (a.leading || isLinked(a) || isLinked(b) || !isOff(a) || !isOff(b)) continue
        if (a.cycles.length + b.cycles.length > MAX_GROUP_CYCLES) continue
        const merged: Group = { cycles: [...a.cycles, ...b.cycles], jobs: [...a.jobs, ...b.jobs], leading: false }
        if (!merged.jobs.length) continue
        const before = groupErr(a) + groupErr(b), after = groupErr(merged)
        const gain = before - after
        if (after < before * 0.6 && gain > 100 && gain > bestGain) { bestGain = gain; bestIdx = i }
      }
      if (bestIdx < 0) break
      const a = groups[bestIdx], b = groups[bestIdx + 1]
      // the end fill at the seam closed "too early" — likely an enroute fill or a job dated off
      const seam = a.cycles[a.cycles.length - 1]
      const seamBill = seam.bills[seam.bills.length - 1]
      flags.push({
        plate, at: localStamp(seamBill.Date_Time), logId: seamBill.Log_ID ?? null, kind: 'end_mid_trip',
        message: `บิล "จบงาน" แต่ไมล์รอบนี้ไม่ตรงกับงาน — น่าจะเป็นเติมระหว่างทาง หรือวันที่งานคลาด (ระบบรวมกับรอบถัดไปให้แล้ว)`,
        jobIds: [...a.jobs, ...b.jobs].map(j => j.id),
      })
      groups.splice(bestIdx, 2, { cycles: [...a.cycles, ...b.cycles], jobs: [...a.jobs, ...b.jobs], leading: false })
    }

    // 4. totals, per-job shares, remaining flags
    const v: VehicleBillTotals = { total: emptyPool(), covered: emptyPool(), uncovered: { ...emptyPool(), dates: [] }, jobKm: round2(jobs.reduce((s, j) => s + j.km, 0)), trailing: emptyPool(), beforePeriod: emptyPool() }
    for (const g of groups) {
      const pool: Pool = g.cycles.reduce((p, c) => ({ cost: p.cost + c.cost, liters: p.liters + c.liters, km: p.km + c.km, count: p.count + c.count }), emptyPool())
      const lastStamp = g.cycles[g.cycles.length - 1].stamps.slice(-1)[0]
      for (const t of [v.total, g.jobs.length ? v.covered : v.uncovered]) { t.cost += pool.cost; t.liters += pool.liters; t.km += pool.km; t.count += pool.count }
      for (const b of g.cycles.flatMap(c => c.bills)) {
        if (!trailingSet.has(b)) continue
        v.trailing.cost += Number(b.Price_Total) || 0; v.trailing.liters += Number(b.Liters) || 0; v.trailing.count += 1
      }

      if (!g.jobs.length) {
        if (g.leading) { const b = v.beforePeriod; b.cost += pool.cost; b.liters += pool.liters; b.km += pool.km; b.count += pool.count }
        if (!v.uncovered.dates.includes(lastStamp.slice(0, 10))) v.uncovered.dates.push(lastStamp.slice(0, 10))
        if (!g.leading && pool.km > 0) {
          const endBill = g.cycles[g.cycles.length - 1].bills.slice(-1)[0]
          flags.push({ plate, at: lastStamp, logId: endBill.Log_ID ?? null, kind: 'no_job', message: `รถวิ่ง ${Math.round(pool.km)} กม. (฿${Math.round(pool.cost).toLocaleString()}) แต่ไม่มีงานในระบบ — ลืมเปิดงาน หรือป้ายเติมผิด`, jobIds: [] })
        }
        continue
      }

      const ratio = round2(ratioOf(g))
      const open = !g.cycles[g.cycles.length - 1].closed
      const merged = g.cycles.length > 1 && g.cycles.some((c, i) => i < g.cycles.length - 1 && c.closed)
      const confidence: FuelConfidence = isLinked(g) && !open ? 'confirmed'
        : open ? 'low'
        : fits(g, FIT.high) && !merged && g.jobs.length === 1 ? 'high'
        : fits(g, FIT.medium) ? 'medium' : 'low'
      if (!open && ratio > 0 && !fits(g, FIT.medium)) {
        flags.push({ plate, at: lastStamp, logId: g.cycles[g.cycles.length - 1].bills.slice(-1)[0].Log_ID ?? null, kind: 'km_mismatch', message: `ไมล์จริง ${Math.round(groupKm(g))} กม. vs ระยะงานไป-กลับ ${Math.round(groupExpected(g))} กม. (${Math.round(ratio * 100)}%) — ตรวจระยะงาน วันที่งาน หรือบิลที่ขาด`, jobIds: g.jobs.map(j => j.id) })
      }
      const fills = g.cycles.flatMap(c => c.bills.map((b, i) => fmtFill(c.stamps[i], b.Trip_Fill_Type)))
      const gKm = g.jobs.reduce((s, j) => s + j.km, 0)
      for (const j of g.jobs) {
        const s = gKm > 0 ? j.km / gKm : 1 / g.jobs.length
        shares.set(j.id, { fuelCost: round2(pool.cost * s), liters: round2(pool.liters * s), realKm: round2(pool.km * s), confidence, ratio, groupJobs: g.jobs.length, fills, open })
      }
    }
    for (const t of [v.total, v.covered, v.uncovered, v.trailing, v.beforePeriod]) { t.cost = round2(t.cost); t.liters = round2(t.liters); t.km = round2(t.km) }
    vehicles.set(plate, v)
  })

  /** The job's share of its matched fills; null when no fill has closed it yet (caller estimates). */
  const share = (jobId: string | null | undefined): JobBillShare | null => shares.get(String(jobId || '')) ?? null

  flags.sort((a, b) => a.at.localeCompare(b.at))
  return { vehicles, share, flags }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
