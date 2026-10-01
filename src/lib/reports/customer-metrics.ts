// Customer report metrics — the ONE place the weekly/monthly customer numbers are
// computed. The web dashboard, the email and the admin flags all read this, so a
// customer never sees two different on-time figures for the same week.
// Note: No "use server" — callers pass a server Supabase client.

import { fetchAllRows, REVENUE_STATUSES } from '@/lib/supabase/analytics-helpers'
import { computeTripCarbon } from '@/lib/utils/job-carbon'
import type { CarbonFactors } from '@/lib/utils/esg-utils'
import { eachDay, previousPeriod, thaiShortDate, weeksInMonth, type ReportPeriod } from './period'

/**
 * On-time policy. A job is on time when the POD lands on/before its due date, or
 * before this hour of the next morning (overnight runs dispatched on the due day).
 */
export const OVERNIGHT_CUTOFF_HOUR = 8
/**
 * Pickup and delivery recorded within this many minutes of each other = the driver
 * closed the job after the fact. The POD time is an upload time, so it is only an
 * upper bound on the real delivery: before the deadline still proves on-time, but
 * after it the real time is unknown — left unmeasured rather than counted late.
 */
export const BACKFILL_MAX_MINUTES = 10

const DONE_STATUSES = new Set([...REVENUE_STATUSES, 'Verified', 'Billed', 'Paid', 'verified', 'billed', 'paid'])
const CANCELLED = /cancel|ยกเลิก/i
const FAILED = /fail|ไม่สำเร็จ|ตีกลับ|return/i

type JobRow = {
    Job_ID: string
    Job_Status: string | null
    Plan_Date: string | null
    Delivery_Date: string | null
    Pickup_Date: string | null
    Actual_Delivery_Time: string | null
    Dest_Location: string | null
    Route_Name: string | null
    Total_Drop: number | string | null
    Loaded_Qty: number | string | null
    Weight_Kg: number | string | null
    Est_Distance_KM: number | string | null
    Vehicle_Type: string | null
    Photo_Proof_Url: string | null
    Signature_Url: string | null
    POD_Drops_Json: unknown
    Failed_Reason: string | null
}

const JOB_COLUMNS = 'Job_ID, Job_Status, Plan_Date, Delivery_Date, Pickup_Date, Actual_Delivery_Time, Dest_Location, Route_Name, Total_Drop, Loaded_Qty, Weight_Kg, Est_Distance_KM, Vehicle_Type, Photo_Proof_Url, Signature_Url, POD_Drops_Json, Failed_Reason'

export type ReportFlag = { level: 'warning' | 'info'; code: string; message: string }

export type JobLine = { jobId: string; date: string; destination: string; detail: string }

export type PeriodSummary = {
    jobs: number
    delivered: number
    failed: number
    open: number
    drops: number
    qty: number
    distanceKm: number
    onTimeMeasured: number
    onTime: number
    onTimePct: number | null
    podComplete: number
    podPct: number | null
    avgLeadTimeHours: number | null
}

export type CustomerReportData = {
    customerId: string
    customerName: string
    period: ReportPeriod
    summary: PeriodSummary
    previous: PeriodSummary
    /** weekly → one row per day; monthly → one row per Mon–Sun week */
    series: { label: string; start: string; end: string; jobs: number; onTime: number; late: number; onTimePct: number | null }[]
    topDestinations: { name: string; jobs: number }[]
    provinces: { name: string; jobs: number }[]
    lateJobs: JobLine[]
    failedJobs: JobLine[]
    openJobs: JobLine[]
    podMissing: JobLine[]
    carbon: { co2Kg: number; trees: number; jobsCounted: number; kgPerJob: number | null } | null
    flags: ReportFlag[]
    generatedAt: string
}

// ── per-job helpers ────────────────────────────────────────────────────────────

function parseJson(raw: unknown): unknown {
    let v = raw
    for (let i = 0; i < 2 && typeof v === 'string'; i++) {
        try { v = JSON.parse(v) } catch { return null }
    }
    return v
}


/**
 * When the goods were actually delivered. POD photo/signature file names carry the
 * capture time in epoch ms ("…_1789901654545_pod_0.jpg") — the only reliable full
 * timestamp, since Actual_Delivery_Time is time-of-day only and Delivery_Date can
 * be the planned date. Falls back to Delivery_Date + Actual_Delivery_Time.
 */
export function actualDeliveredAt(job: Pick<JobRow, 'POD_Drops_Json' | 'Photo_Proof_Url' | 'Signature_Url' | 'Delivery_Date' | 'Actual_Delivery_Time'>): number | null {
    const text = `${typeof job.POD_Drops_Json === 'string' ? job.POD_Drops_Json : JSON.stringify(job.POD_Drops_Json ?? '')} ${job.Photo_Proof_Url || ''} ${job.Signature_Url || ''}`
    let latest = 0
    for (const m of text.matchAll(/_(1[6-9]\d{11})_/g)) {
        const ms = Number(m[1])
        if (ms > latest) latest = ms
    }
    if (latest) return latest
    if (job.Delivery_Date && job.Actual_Delivery_Time && /^\d{1,2}:\d{2}/.test(job.Actual_Delivery_Time)) {
        const t = new Date(`${job.Delivery_Date.slice(0, 10)}T${job.Actual_Delivery_Time.slice(0, 8).padStart(8, '0')}+07:00`).getTime()
        return Number.isFinite(t) ? t : null
    }
    return null
}

function hasPod(job: JobRow): boolean {
    if (job.Photo_Proof_Url || job.Signature_Url) return true
    const drops = parseJson(job.POD_Drops_Json)
    return Array.isArray(drops) && drops.some((d: { photos?: unknown[]; signature?: string }) => (Array.isArray(d?.photos) && d.photos.length > 0) || !!d?.signature)
}

function jobState(job: JobRow): 'cancelled' | 'failed' | 'delivered' | 'open' {
    const s = String(job.Job_Status || '')
    if (CANCELLED.test(s)) return 'cancelled'
    if (FAILED.test(s) || (job.Failed_Reason && !DONE_STATUSES.has(s))) return 'failed'
    if (DONE_STATUSES.has(s)) return 'delivered'
    return 'open'
}

/** "PCG สุราษฯ → ร้าน ก (อ.เมือง จ.ชุมพร)" → "ร้าน ก (อ.เมือง จ.ชุมพร)" */
function destinationName(job: JobRow): string {
    const raw = (job.Dest_Location || job.Route_Name || '').trim()
    const parts = raw.split(/→|->/)
    return (parts[parts.length - 1] || raw).trim() || 'ไม่ระบุ'
}

function provinceOf(dest: string): string {
    const m = dest.match(/จ\.\s*([^\s)]+)/) || dest.match(/จังหวัด\s*([^\s)]+)/)
    return m ? m[1] : 'ไม่ระบุจังหวัด'
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null)

type Evaluated = {
    job: JobRow
    state: ReturnType<typeof jobState>
    date: string
    deliveredAt: number | null
    onTime: boolean | null
    backfilled: boolean
    pod: boolean
}

function evaluate(job: JobRow): Evaluated {
    const state = jobState(job)
    const date = String(job.Plan_Date || '').slice(0, 10)
    const deliveredAt = state === 'delivered' ? actualDeliveredAt(job) : null
    // ส่งตรงเวลา = ส่งถึงภายในวันส่งที่กำหนด (Delivery_Date, ถ้าไม่มีใช้ Plan_Date)
    // หรือก่อน OVERNIGHT_CUTOFF_HOUR ของเช้าวันถัดไป (รอบวิ่งกลางคืน)
    const promised = String(job.Delivery_Date || job.Plan_Date || '').slice(0, 10)
    const pickedAt = job.Pickup_Date ? new Date(job.Pickup_Date).getTime() : NaN
    const backfilled = !!deliveredAt && Number.isFinite(pickedAt) && Math.abs(deliveredAt - pickedAt) < BACKFILL_MAX_MINUTES * 60_000
    let onTime: boolean | null = null
    if (deliveredAt && promised) {
        const deadline = new Date(`${promised}T${String(OVERNIGHT_CUTOFF_HOUR).padStart(2, '0')}:00:00+07:00`).getTime() + 24 * 3600_000
        onTime = deliveredAt < deadline ? true : backfilled ? null : false
    }
    return { job, state, date, deliveredAt, onTime, backfilled, pod: state === 'delivered' && hasPod(job) }
}

function summarize(rows: Evaluated[]): PeriodSummary {
    const active = rows.filter(r => r.state !== 'cancelled')
    const delivered = active.filter(r => r.state === 'delivered')
    const measured = delivered.filter(r => r.onTime !== null)
    const onTime = measured.filter(r => r.onTime).length
    const podComplete = delivered.filter(r => r.pod).length
    const leads = delivered
        .filter(r => !r.backfilled)
        .map(r => {
            const picked = r.job.Pickup_Date ? new Date(r.job.Pickup_Date).getTime() : NaN
            return r.deliveredAt && Number.isFinite(picked) ? (r.deliveredAt - picked) / 3600_000 : NaN
        })
        .filter(h => Number.isFinite(h) && h >= 0 && h < 24 * 14)
    return {
        jobs: active.length,
        delivered: delivered.length,
        failed: active.filter(r => r.state === 'failed').length,
        open: active.filter(r => r.state === 'open').length,
        drops: active.reduce((s, r) => s + (Number(r.job.Total_Drop) || 1), 0),
        qty: active.reduce((s, r) => s + (Number(r.job.Loaded_Qty) || 0), 0),
        distanceKm: Math.round(active.reduce((s, r) => s + (Number(r.job.Est_Distance_KM) || 0), 0)),
        onTimeMeasured: measured.length,
        onTime,
        onTimePct: pct(onTime, measured.length),
        podComplete,
        podPct: pct(podComplete, delivered.length),
        avgLeadTimeHours: leads.length ? Math.round((leads.reduce((a, b) => a + b, 0) / leads.length) * 10) / 10 : null,
    }
}

const line = (r: Evaluated, detail: string): JobLine => ({ jobId: r.job.Job_ID, date: r.date, destination: destinationName(r.job), detail })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJobs(supabase: any, customerId: string, start: string, end: string): Promise<JobRow[]> {
    return fetchAllRows<JobRow>(() =>
        supabase
            .from('Jobs_Main')
            .select(JOB_COLUMNS)
            .eq('Customer_ID', customerId)
            .gte('Plan_Date', start)
            .lte('Plan_Date', end)
            .order('Plan_Date', { ascending: true }))
}

export async function computeCustomerReport(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    opts: { customerId: string; customerName: string; period: ReportPeriod; carbonFactors?: CarbonFactors },
): Promise<CustomerReportData> {
    const { customerId, period } = opts
    const prev = previousPeriod(period)
    const [jobs, prevJobs] = await Promise.all([
        fetchJobs(supabase, customerId, period.start, period.end),
        fetchJobs(supabase, customerId, prev.start, prev.end),
    ])
    const rows = jobs.map(evaluate)
    const active = rows.filter(r => r.state !== 'cancelled')
    const summary = summarize(rows)

    const buckets = period.type === 'weekly'
        ? eachDay(period).map(d => ({ start: d, end: d }))
        : weeksInMonth(period)
    const series = buckets.map((b, i) => {
        const inB = active.filter(r => r.date >= b.start && r.date <= b.end)
        const measured = inB.filter(r => r.onTime !== null)
        const onTime = measured.filter(r => r.onTime).length
        return {
            label: period.type === 'weekly' ? b.start : `สัปดาห์ ${i + 1}`,
            start: b.start,
            end: b.end,
            jobs: inB.length,
            onTime,
            late: measured.length - onTime,
            onTimePct: pct(onTime, measured.length),
        }
    })

    const count = (keyOf: (r: Evaluated) => string) => {
        const m = new Map<string, number>()
        for (const r of active) m.set(keyOf(r), (m.get(keyOf(r)) || 0) + 1)
        return [...m.entries()].map(([name, n]) => ({ name, jobs: n })).sort((a, b) => b.jobs - a.jobs)
    }

    const fmtTime = (ms: number) => new Date(ms).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    const lateJobs = active.filter(r => r.onTime === false).map(r => line(r, `กำหนดส่ง ${thaiShortDate(String(r.job.Delivery_Date || r.job.Plan_Date).slice(0, 10))} · ส่งถึง ${fmtTime(r.deliveredAt!)}`))
    const failedJobs = active.filter(r => r.state === 'failed').map(r => line(r, r.job.Failed_Reason || 'ส่งไม่สำเร็จ'))
    const openJobs = active.filter(r => r.state === 'open').map(r => line(r, `สถานะ: ${r.job.Job_Status || '-'}`))
    const podMissing = active.filter(r => r.state === 'delivered' && !r.pod).map(r => line(r, 'ไม่มีรูป/ลายเซ็นหลักฐานการส่ง'))

    let carbon: CustomerReportData['carbon'] = null
    if (opts.carbonFactors) {
        let co2 = 0, trees = 0, n = 0
        for (const r of active) {
            const c = computeTripCarbon(r.job, opts.carbonFactors)
            if (!c) continue
            co2 += c.co2Kg; trees += c.trees; n++
        }
        if (n > 0) carbon = { co2Kg: Math.round(co2 * 10) / 10, trees: Math.round(trees * 10) / 10, jobsCounted: n, kgPerJob: Math.round((co2 / n) * 10) / 10 }
    }

    // ธงเตือนให้แอดมินตรวจก่อนส่ง — มีธง warning = ห้ามส่งอัตโนมัติ
    const flags: ReportFlag[] = []
    if (summary.jobs === 0) flags.push({ level: 'info', code: 'no_jobs', message: 'ไม่มีงานในช่วงนี้' })
    if (openJobs.length) flags.push({ level: 'warning', code: 'open_jobs', message: `มีงานยังไม่ปิด ${openJobs.length} งาน` })
    if (podMissing.length) flags.push({ level: 'warning', code: 'pod_missing', message: `งานส่งแล้วแต่ไม่มีหลักฐาน ${podMissing.length} งาน` })
    if (summary.onTimePct !== null && summary.onTimePct < 80) flags.push({ level: 'warning', code: 'low_on_time', message: `ส่งตรงเวลาต่ำ (${summary.onTimePct}%)` })
    const backfilledLate = active.filter(r => r.backfilled && r.onTime === null && r.deliveredAt).length
    if (backfilledLate) flags.push({ level: 'info', code: 'backfilled', message: `ปิดงานย้อนหลังเลยกำหนด ${backfilledLate} งาน (ไม่ทราบเวลาส่งจริง จึงไม่นับ)` })
    if (summary.delivered > 0 && summary.onTimeMeasured < summary.delivered * 0.5) {
        flags.push({ level: 'warning', code: 'on_time_unmeasured', message: `วัดเวลาส่งได้แค่ ${summary.onTimeMeasured}/${summary.delivered} งาน (ไม่มีเวลาส่งจริง)` })
    }

    return {
        customerId,
        customerName: opts.customerName,
        period,
        summary,
        previous: summarize(prevJobs.map(evaluate)),
        series,
        topDestinations: count(r => destinationName(r.job)).slice(0, 10),
        provinces: count(r => provinceOf(destinationName(r.job))).slice(0, 8),
        lateJobs: lateJobs.slice(0, 30),
        failedJobs: failedJobs.slice(0, 30),
        openJobs: openJobs.slice(0, 30),
        podMissing: podMissing.slice(0, 30),
        carbon,
        flags,
        generatedAt: new Date().toISOString(),
    }
}
