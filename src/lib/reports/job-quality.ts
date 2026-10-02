// Internal job-quality metrics (admins / management only — never shown to customers).
// Tracks the paperwork side of each job: created after its plan date, closed after
// the deadline, closed after the fact (pickup + POD recorded together), delivered
// without POD, and jobs still open past their due date. Grouped per driver so it can
// be used to coach drivers and spot admin slips.
// Note: No "use server" — callers pass a server Supabase client.

import { fetchAllRows } from '@/lib/supabase/analytics-helpers'
import {
    actualDeliveredAt, deliveryDeadline, destinationName, hasPod, isBackfilled, jobState,
} from './customer-metrics'

type Row = {
    Job_ID: string
    Job_Status: string | null
    Plan_Date: string | null
    Delivery_Date: string | null
    Pickup_Date: string | null
    Created_At: string | null
    Actual_Delivery_Time: string | null
    Customer_Name: string | null
    Driver_ID: string | null
    Driver_Name: string | null
    Dest_Location: string | null
    Route_Name: string | null
    Photo_Proof_Url: string | null
    Signature_Url: string | null
    POD_Drops_Json: unknown
    Failed_Reason: string | null
}

const COLUMNS = 'Job_ID, Job_Status, Plan_Date, Delivery_Date, Pickup_Date, Created_At, Actual_Delivery_Time, Customer_Name, Driver_ID, Driver_Name, Dest_Location, Route_Name, Photo_Proof_Url, Signature_Url, POD_Drops_Json, Failed_Reason'

export type QualityIssue = 'created_late' | 'closed_late' | 'backfilled' | 'pod_missing' | 'stuck_open'

export type QualityLine = {
    jobId: string
    date: string
    driverKey: string
    driver: string
    customer: string
    destination: string
    detail: string
    /** sort weight: days late / hours late */
    weight: number
}

export type DriverQuality = {
    key: string
    name: string
    jobs: number
    delivered: number
    createdLate: number
    closedLate: number
    backfilled: number
    podMissing: number
    stuckOpen: number
    /** delivered jobs closed in real time before the deadline, % of delivered */
    onTimeClosePct: number | null
    /** delivered jobs whose pickup was pressed at real pickup time (not together with POD), % */
    pickupCompliancePct: number | null
    /** createdLate + closedLate + podMissing + stuckOpen. Backfilled pickup is a habit
     *  metric (most jobs today), tracked as pickupCompliancePct, not counted as an issue. */
    issues: number
}

export type JobQualityData = {
    start: string
    end: string
    totals: Omit<DriverQuality, 'key' | 'name'>
    drivers: DriverQuality[]
    lists: Record<QualityIssue, QualityLine[]>
    generatedAt: string
}

const DAY = 24 * 3600_000
const bkkYmd = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY)
const fmtDelay = (hours: number) => (hours >= 24 ? `${Math.round((hours / 24) * 10) / 10} วัน` : `${Math.max(1, Math.round(hours))} ชม.`)
const thDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export async function computeJobQuality(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
    opts: { start: string; end: string; branchId?: string | null; now?: Date },
): Promise<JobQualityData> {
    const rows = await fetchAllRows<Row>(() => {
        let q = db.from('Jobs_Main').select(COLUMNS).gte('Plan_Date', opts.start).lte('Plan_Date', opts.end)
        if (opts.branchId) q = q.eq('Branch_ID', opts.branchId)
        return q.order('Plan_Date', { ascending: true })
    })
    const now = (opts.now ?? new Date()).getTime()

    const lists: Record<QualityIssue, QualityLine[]> = { created_late: [], closed_late: [], backfilled: [], pod_missing: [], stuck_open: [] }
    const byDriver = new Map<string, DriverQuality & { _onTimeClose: number }>()

    for (const job of rows) {
        const state = jobState(job)
        if (state === 'cancelled') continue
        const date = String(job.Plan_Date || '').slice(0, 10)
        const due = String(job.Delivery_Date || job.Plan_Date || '').slice(0, 10)
        const driverKey = job.Driver_ID || job.Driver_Name || '—'
        const base = {
            jobId: job.Job_ID,
            date,
            driverKey,
            driver: job.Driver_Name || 'ไม่ระบุคนขับ',
            customer: job.Customer_Name || '-',
            destination: destinationName(job),
        }
        let d = byDriver.get(driverKey)
        if (!d) {
            d = { key: driverKey, name: base.driver, jobs: 0, delivered: 0, createdLate: 0, closedLate: 0, backfilled: 0, podMissing: 0, stuckOpen: 0, onTimeClosePct: null, pickupCompliancePct: null, issues: 0, _onTimeClose: 0 }
            byDriver.set(driverKey, d)
        }
        d.jobs++

        // 1) สร้างงานย้อนหลัง: สร้างในระบบหลังวันที่วางแผนไว้
        if (job.Created_At && date) {
            const lateDays = daysBetween(date, bkkYmd(Date.parse(job.Created_At)))
            if (lateDays >= 1) {
                d.createdLate++
                lists.created_late.push({ ...base, detail: `สร้างเมื่อ ${thDate(bkkYmd(Date.parse(job.Created_At)))} (ช้า ${lateDays} วัน)`, weight: lateDays })
            }
        }

        if (state === 'delivered') {
            d.delivered++
            const deliveredAt = actualDeliveredAt(job)
            const deadline = deliveryDeadline(due)
            const backfilled = isBackfilled(job, deliveredAt)
            // 2) ปิดงานย้อนหลัง: กดรับ + ส่งพร้อมกัน (ไม่ได้กดตามจริงหน้างาน)
            if (backfilled) {
                d.backfilled++
                lists.backfilled.push({ ...base, detail: `กดรับ-ส่งพร้อมกันเมื่อ ${new Date(deliveredAt!).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, weight: deadline && deliveredAt! > deadline ? (deliveredAt! - deadline) / 3600_000 : 0 })
            }
            // 3) ปิดงานช้า: POD เข้าระบบหลังกำหนด (วันส่ง + 08:00 เช้าวันถัดไป)
            if (deliveredAt && deadline && deliveredAt > deadline) {
                const hours = (deliveredAt - deadline) / 3600_000
                d.closedLate++
                lists.closed_late.push({ ...base, detail: `กำหนด ${thDate(due)} · ปิดช้า ${fmtDelay(hours)}${backfilled ? ' (ปิดย้อนหลัง)' : ''}`, weight: hours })
            } else if (deliveredAt && !backfilled) {
                d._onTimeClose++
            }
            // 4) ส่งแล้วแต่ไม่มีรูป/ลายเซ็น
            if (!hasPod(job)) {
                d.podMissing++
                lists.pod_missing.push({ ...base, detail: `สถานะ ${job.Job_Status || '-'} แต่ไม่มีรูป/ลายเซ็น`, weight: 0 })
            }
        } else if (state === 'open') {
            // 5) งานค้าง: ยังไม่ปิดทั้งที่เลยกำหนดแล้ว
            const deadline = deliveryDeadline(due)
            if (deadline && now > deadline) {
                const days = Math.max(1, Math.floor((now - deadline) / DAY) + 1)
                d.stuckOpen++
                lists.stuck_open.push({ ...base, detail: `สถานะ ${job.Job_Status || '-'} · เลยกำหนด ${days} วัน`, weight: days })
            }
        }
    }

    const onTimeClose = [...byDriver.values()].reduce((s, d) => s + d._onTimeClose, 0)
    const drivers = [...byDriver.values()].map(({ _onTimeClose, ...d }) => ({
        ...d,
        onTimeClosePct: d.delivered ? Math.round((_onTimeClose / d.delivered) * 1000) / 10 : null,
        pickupCompliancePct: d.delivered ? Math.round(((d.delivered - d.backfilled) / d.delivered) * 1000) / 10 : null,
        issues: d.createdLate + d.closedLate + d.podMissing + d.stuckOpen,
    })).sort((a, b) => b.issues - a.issues || b.jobs - a.jobs)

    for (const k of Object.keys(lists) as QualityIssue[]) lists[k].sort((a, b) => b.weight - a.weight || a.date.localeCompare(b.date))

    const sum = (f: (d: DriverQuality) => number) => drivers.reduce((s, d) => s + f(d), 0)
    const delivered = sum(d => d.delivered)
    return {
        start: opts.start,
        end: opts.end,
        totals: {
            jobs: sum(d => d.jobs),
            delivered,
            createdLate: sum(d => d.createdLate),
            closedLate: sum(d => d.closedLate),
            backfilled: sum(d => d.backfilled),
            podMissing: sum(d => d.podMissing),
            stuckOpen: sum(d => d.stuckOpen),
            onTimeClosePct: delivered ? Math.round((onTimeClose / delivered) * 1000) / 10 : null,
            pickupCompliancePct: delivered ? Math.round(((delivered - sum(d => d.backfilled)) / delivered) * 1000) / 10 : null,
            issues: sum(d => d.issues),
        },
        drivers,
        lists,
        generatedAt: new Date().toISOString(),
    }
}
