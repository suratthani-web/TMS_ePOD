// Abnormal fuel use per fill cycle (bill-to-bill), kept as history in Fuel_Cycles.
//
// Each closed group from allocateFuelBills (enroute fills… → end fill, matched to its
// jobs) becomes one row: odometer km, litres, cost. A cycle is compared with the same
// truck's other cycles of similar distance (km within ±10%, ±90 days); when there are
// too few, with the truck's own distance band, then with trucks of the same type.
// Litres above what the baseline km/L predicts → watch (≥20%) / critical (≥35%),
// both only when the excess is at least 10 L.
//
// Admins review a flagged cycle: "ok" (explained, e.g. heavy load / detour) keeps it
// as history; "confirmed_issue" also drops it from every baseline.
// Recomputed after any bill is added/edited/linked and by /api/cron/fuel-cycles.
// Everything tolerates the table not existing yet (SQL 20261022_fuel_cycles).
import { after } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { fetchAllRows } from '@/lib/supabase/analytics-helpers'
import { allocateFuelBills, normalizePlate, FUEL_RUN_STATUSES, type FuelBillLog, type FuelFlag, type FuelGroupSummary, type RunJob } from './bill-allocation'

export type FuelCycleStatus = 'normal' | 'watch' | 'critical' | 'insufficient'
export type FuelCycleReview = 'ok' | 'confirmed_issue'

export type FuelCycleRow = {
  Cycle_ID: string
  Vehicle_Plate: string
  Branch_ID: string | null
  Start_Time: string
  End_Time: string
  Bill_Log_IDs: string[]
  Job_IDs: string[]
  Drop_Count: number
  Km: number
  Liters: number
  Cost: number
  Km_Per_Liter: number
  Distance_Band: string
  Baseline_Km_Per_Liter: number | null
  Baseline_Source: 'peers' | 'band' | 'type' | 'none'
  Peer_Count: number
  Peer_Example: string | null
  Expected_Liters: number | null
  Excess_Liters: number | null
  Excess_Pct: number | null
  Excess_Cost: number | null
  Status: FuelCycleStatus
  Review_Status?: FuelCycleReview | null
  Review_Note?: string | null
  Reviewed_By?: string | null
  Reviewed_At?: string | null
  Notified_At?: string | null
}

const DAY = 24 * 60 * 60 * 1000
/** cycles kept in sync (older rows stay as they are) */
const SYNC_DAYS = 150
/** baseline window either side of a cycle */
const BASE_DAYS = 90
const MIN_PEERS = 3
const MIN_BAND = 5
/** shorter spans are too noisy to judge (tank level at "full" varies a few litres) */
const MIN_KM = 60
const WATCH_PCT = 0.2
const CRITICAL_PCT = 0.35
const MIN_EXCESS_L = 10
/** only recent cycles notify — the first sync must not spam the backlog */
const NOTIFY_DAYS = 7
/** km/L this far above the truck's median = a bill missing from the cycle, not real economy → never a baseline */
const IMPLAUSIBLE_RATIO = 1.4

export function distanceBand(km: number) {
  return km <= 250 ? '≤250' : km <= 500 ? '251-500' : km <= 800 ? '501-800' : '>800'
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const dm = (stamp: string) => `${Number(stamp.slice(8, 10))}/${Number(stamp.slice(5, 7))}`
const ts = (stamp: string) => new Date(`${stamp.slice(0, 16)}:00`).getTime()
const isConfirmedIssue = (r: Pick<FuelCycleRow, 'Review_Status'>) => r.Review_Status === 'confirmed_issue'

/** "ใช้มากกว่าปกติ 23.5 ล. (~฿1,000) เทียบรอบ 29/9 532 กม. 54.9 ล." */
export function fuelCycleMessage(r: Pick<FuelCycleRow, 'Excess_Liters' | 'Excess_Cost' | 'Excess_Pct' | 'Peer_Example' | 'Baseline_Km_Per_Liter' | 'Baseline_Source' | 'Km_Per_Liter'>) {
  const vs = r.Baseline_Source === 'peers' && r.Peer_Example ? `เทียบรอบ ${r.Peer_Example}`
    : r.Baseline_Source === 'type' ? `เทียบรถประเภทเดียวกัน ~${round(Number(r.Baseline_Km_Per_Liter), 1)} กม./ล.`
    : `เทียบค่าปกติของรถคันนี้ ~${round(Number(r.Baseline_Km_Per_Liter), 1)} กม./ล.`
  return `ใช้มากกว่าปกติ ${round(r.Excess_Liters || 0, 1)} ล. (+${Math.round((r.Excess_Pct || 0) * 100)}%, ~฿${Math.round(r.Excess_Cost || 0).toLocaleString()}) — ${round(Number(r.Km_Per_Liter), 1)} กม./ล. ${vs}`
}

type Base = Pick<FuelCycleRow, 'Cycle_ID' | 'Vehicle_Plate' | 'End_Time' | 'Km' | 'Liters' | 'Cost' | 'Km_Per_Liter' | 'Distance_Band' | 'Review_Status'>

/** Baseline + status for one cycle against the history (all trucks; the cycle itself is skipped). */
export function evaluateCycle(c: Base, history: Base[], typeOf: (plate: string) => string | null) {
  const t = ts(c.End_Time)
  const plateMedian = new Map<string, number>()
  const medianOf = (plate: string) => {
    if (!plateMedian.has(plate)) {
      const xs = history.filter(h => h.Vehicle_Plate === plate && !isConfirmedIssue(h) && h.Km_Per_Liter > 0).map(h => h.Km_Per_Liter)
      plateMedian.set(plate, xs.length ? median(xs) : 0)
    }
    return plateMedian.get(plate)!
  }
  const plausible = (h: Base) => { const m = medianOf(h.Vehicle_Plate); return !m || h.Km_Per_Liter <= m * IMPLAUSIBLE_RATIO }
  const near = (h: Base) => h.Cycle_ID !== c.Cycle_ID && !isConfirmedIssue(h) && Math.abs(ts(h.End_Time) - t) <= BASE_DAYS * DAY && h.Km_Per_Liter > 0 && plausible(h)
  const own = history.filter(h => h.Vehicle_Plate === c.Vehicle_Plate && near(h))
  const tol = Math.max(c.Km * 0.1, 30)
  const peers = own.filter(h => Math.abs(h.Km - c.Km) <= tol)

  let baseline: number | null = null
  let source: FuelCycleRow['Baseline_Source'] = 'none'
  let peerCount = 0
  let example: string | null = null
  if (peers.length >= MIN_PEERS) {
    baseline = median(peers.map(h => h.Km_Per_Liter)); source = 'peers'; peerCount = peers.length
    // the concrete "compare with" example: a typical peer (economy near the baseline) of about the same distance
    const score = (h: Base) => Math.abs(h.Km_Per_Liter - baseline!) / baseline! + Math.abs(h.Km - c.Km) / c.Km
    const ex = [...peers].sort((a, b) => score(a) - score(b))[0]
    example = `${dm(ex.End_Time)} ${Math.round(ex.Km)} กม. ${round(ex.Liters, 1)} ล.`
  } else {
    const band = own.filter(h => h.Distance_Band === c.Distance_Band)
    if (band.length >= MIN_BAND) {
      baseline = median(band.map(h => h.Km_Per_Liter)); source = 'band'; peerCount = band.length
    } else {
      const type = typeOf(c.Vehicle_Plate)
      const same = type ? history.filter(h => h.Vehicle_Plate !== c.Vehicle_Plate && typeOf(h.Vehicle_Plate) === type && h.Distance_Band === c.Distance_Band && near(h)) : []
      if (same.length >= MIN_BAND) { baseline = median(same.map(h => h.Km_Per_Liter)); source = 'type'; peerCount = same.length }
    }
  }

  if (!baseline) {
    return { Baseline_Km_Per_Liter: null, Baseline_Source: source, Peer_Count: peerCount, Peer_Example: null, Expected_Liters: null, Excess_Liters: null, Excess_Pct: null, Excess_Cost: null, Status: 'insufficient' as FuelCycleStatus }
  }
  const expected = c.Km / baseline
  const excess = c.Liters - expected
  const pct = expected > 0 ? excess / expected : 0
  const ppl = c.Liters > 0 ? c.Cost / c.Liters : 0
  const status: FuelCycleStatus = excess >= MIN_EXCESS_L && pct >= CRITICAL_PCT ? 'critical'
    : excess >= MIN_EXCESS_L && pct >= WATCH_PCT ? 'watch' : 'normal'
  return {
    Baseline_Km_Per_Liter: round(baseline, 3), Baseline_Source: source, Peer_Count: peerCount, Peer_Example: example,
    Expected_Liters: round(expected), Excess_Liters: round(excess), Excess_Pct: round(pct, 4), Excess_Cost: round(excess * ppl),
    Status: status,
  }
}

type JobRow = RunJob & { Job_ID: string; Total_Drop?: number | null; original_destinations_json?: string | unknown[] | null }

function dropsOf(j: JobRow) {
  let v: unknown = j.original_destinations_json
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { v = null } }
  const n = Array.isArray(v) ? v.filter(d => String((d as { name?: unknown })?.name ?? '').trim()).length : 0
  return n || Number(j.Total_Drop) || 1
}

/**
 * Rebuilds the recent cycles of the whole fleet (cheap: a few months of bills) and
 * upserts them; review fields and Notified_At are never overwritten. With notify,
 * new watch/critical cycles from the last few days alert the admins (web push + Telegram).
 */
export async function syncFuelCycles(opts: { notify?: boolean; dryRun?: boolean } = {}) {
  const supabase = createAdminClient()
  const now = Date.now()
  const start = new Date(now - SYNC_DAYS * DAY).toISOString().slice(0, 10)
  const anchorFrom = new Date(now - (SYNC_DAYS + 60) * DAY).toISOString().slice(0, 10)

  const [logs, prior, jobs, vehiclesRes, existingRes] = await Promise.all([
    fetchAllRows<FuelBillLog & { Branch_ID?: string | null }>(() => supabase.from('Fuel_Logs').select('*').gte('Date_Time', `${start}T00:00:00`)),
    fetchAllRows<FuelBillLog>(() => supabase.from('Fuel_Logs').select('Log_ID, Vehicle_Plate, Date_Time, Price_Total, Liters, Odometer, Trip_Fill_Type')
      .gte('Date_Time', `${anchorFrom}T00:00:00`).lt('Date_Time', `${start}T00:00:00`)),
    fetchAllRows<JobRow>(() => supabase.from('Jobs_Main').select('Job_ID, Vehicle_Plate, Plan_Date, Est_Distance_KM, Total_Drop, original_destinations_json')
      .in('Job_Status', FUEL_RUN_STATUSES).gte('Plan_Date', start)),
    supabase.from('Master_Vehicles').select('*'),
    supabase.from('Fuel_Cycles').select('*').gte('End_Time', new Date(now - (SYNC_DAYS + BASE_DAYS) * DAY).toISOString().slice(0, 10)),
  ])
  if (existingRes.error && !opts.dryRun) return { success: false as const, error: existingRes.error.message }

  const vehicleInfo = new Map<string, { type: string | null; branch: string | null }>()
  for (const v of (vehiclesRes.data || []) as { Vehicle_Plate?: string; Vehicle_Type?: string | null; Branch_ID?: string | null }[]) {
    vehicleInfo.set(normalizePlate(v.Vehicle_Plate), { type: v.Vehicle_Type || null, branch: v.Branch_ID || null })
  }
  const typeOf = (plate: string) => vehicleInfo.get(normalizePlate(plate))?.type ?? null
  const jobById = new Map(jobs.map(j => [j.Job_ID, j]))
  const billBranch = new Map(logs.map(l => [String(l.Log_ID || ''), l.Branch_ID || null]))

  const { groups } = allocateFuelBills(logs, prior, jobs)
  const fresh: FuelCycleRow[] = []
  for (const g of groups as FuelGroupSummary[]) {
    if (!g.closed || !g.complete || !g.endLogId || g.km < MIN_KM || g.liters <= 0) continue
    fresh.push({
      Cycle_ID: g.endLogId,
      Vehicle_Plate: g.plate,
      Branch_ID: vehicleInfo.get(g.plate)?.branch || billBranch.get(g.endLogId) || null,
      Start_Time: g.startStamp,
      End_Time: g.endStamp,
      Bill_Log_IDs: g.billLogIds,
      Job_IDs: g.jobIds,
      Drop_Count: g.jobIds.reduce((s, id) => s + (jobById.has(id) ? dropsOf(jobById.get(id)!) : 0), 0),
      Km: g.km,
      Liters: g.liters,
      Cost: g.cost,
      Km_Per_Liter: round(g.km / g.liters, 3),
      Distance_Band: distanceBand(g.km),
    } as FuelCycleRow)
  }

  const existing = (existingRes.data || []) as FuelCycleRow[]
  const existingById = new Map(existing.map(r => [r.Cycle_ID, r]))
  fresh.forEach(r => { r.Review_Status = existingById.get(r.Cycle_ID)?.Review_Status ?? null })
  // older history (outside the sync window) still counts toward baselines
  const freshIds = new Set(fresh.map(r => r.Cycle_ID))
  const history: Base[] = [...fresh, ...existing.filter(r => !freshIds.has(r.Cycle_ID) && r.End_Time < start)]

  const rows = fresh.map(c => {
    const { Review_Status: _r, ...rest } = c
    void _r
    return { ...rest, ...evaluateCycle(c, history, typeOf), Computed_At: new Date().toISOString() }
  })

  if (opts.dryRun) return { success: true as const, rows }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('Fuel_Cycles').upsert(rows.slice(i, i + 500), { onConflict: 'Cycle_ID' })
    if (error) return { success: false as const, error: error.message }
  }
  // regrouped cycles (an end fill re-labelled, a bill deleted) leave stale rows behind
  const stale = existing.filter(r => r.End_Time >= start && !freshIds.has(r.Cycle_ID)).map(r => r.Cycle_ID)
  if (stale.length) await supabase.from('Fuel_Cycles').delete().in('Cycle_ID', stale)

  let notified = 0
  if (opts.notify) {
    const since = now - NOTIFY_DAYS * DAY
    const due = rows.filter(r => (r.Status === 'watch' || r.Status === 'critical') && ts(r.End_Time) >= since
      && !existingById.get(r.Cycle_ID)?.Notified_At && !existingById.get(r.Cycle_ID)?.Review_Status)
    if (due.length) {
      const { sendPushToAdmins } = await import('@/lib/actions/push-actions')
      for (const r of due) {
        await sendPushToAdmins({
          title: `${r.Status === 'critical' ? '🔴' : '🟠'} น้ำมันผิดปกติ ${r.Vehicle_Plate}`,
          body: `รอบ ${dm(r.Start_Time)}–${dm(r.End_Time)} ${Math.round(r.Km)} กม. ${round(r.Liters, 1)} ล. — ${fuelCycleMessage(r)}`,
          url: '/fuel',
          type: 'fuel_excess',
          tag: `fuel-cycle-${r.Cycle_ID}`,
        }, r.Branch_ID).catch(() => null)
        await supabase.from('Fuel_Cycles').update({ Notified_At: new Date().toISOString() }).eq('Cycle_ID', r.Cycle_ID)
        notified++
      }
    }
  }

  return {
    success: true as const,
    cycles: rows.length,
    watch: rows.filter(r => r.Status === 'watch').length,
    critical: rows.filter(r => r.Status === 'critical').length,
    removed: stale.length,
    notified,
  }
}

/** Fire-and-forget after a bill changes; never throws (table may not exist yet). */
export function scheduleFuelCycleSync() {
  const run = () => syncFuelCycles({ notify: true }).catch(err => console.error('[fuel-cycles] sync failed', err))
  try { after(run) } catch { void run() } // outside a request scope (scripts) → run now
}

/** Cycles ending in [start, end] (End_Time is local "YYYY-MM-DDTHH:MM"); [] if the table isn't there. */
export async function getFuelCycles(opts: { start?: string; end?: string; plates?: string[]; flaggedOnly?: boolean } = {}): Promise<FuelCycleRow[]> {
  const supabase = createAdminClient()
  const res = await fetchAllRows<FuelCycleRow>(() => {
    let q = supabase.from('Fuel_Cycles').select('*').order('End_Time', { ascending: true })
    if (opts.start) q = q.gte('End_Time', opts.start)
    if (opts.end) q = q.lte('End_Time', `${opts.end}T23:59`)
    if (opts.plates?.length) q = q.in('Vehicle_Plate', opts.plates)
    if (opts.flaggedOnly) q = q.in('Status', ['watch', 'critical'])
    return q
  }).catch(() => [] as FuelCycleRow[])
  return res
}

/** Unreviewed abnormal cycles ending in the period, as review flags (fuel page / Trip Performance). */
export async function fuelExcessFlags(opts: { start: string; end: string; plates?: string[] }): Promise<FuelFlag[]> {
  const rows = await getFuelCycles({ start: opts.start, end: opts.end, flaggedOnly: true })
  const plates = opts.plates?.length ? new Set(opts.plates.map(normalizePlate)) : null
  return rows
    .filter(r => !r.Review_Status && (!plates || plates.has(normalizePlate(r.Vehicle_Plate))))
    .map(r => ({
      plate: r.Vehicle_Plate,
      at: r.End_Time,
      logId: r.Cycle_ID,
      kind: 'fuel_excess' as const,
      message: `${r.Status === 'critical' ? '🔴' : '🟠'} รอบ ${dm(r.Start_Time)}–${dm(r.End_Time)} ${Math.round(r.Km)} กม. ${round(Number(r.Liters), 1)} ล. — ${fuelCycleMessage(r)}`,
      jobIds: r.Job_IDs || [],
    }))
}

/** Cycles closed by these end bills (Cycle_ID = end Log_ID) — for the ledger rows. */
export async function getFuelCyclesByIds(ids: string[]): Promise<FuelCycleRow[]> {
  if (!ids.length) return []
  const { data, error } = await createAdminClient().from('Fuel_Cycles').select('*').in('Cycle_ID', ids)
  return error ? [] : ((data || []) as FuelCycleRow[])
}
