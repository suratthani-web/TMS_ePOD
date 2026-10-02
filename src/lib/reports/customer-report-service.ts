// Customer report workflow (generate drafts → admin review → send), shared by the
// admin page's server actions and the weekly/monthly cron. No auth here — callers
// check permissions. Note: No "use server".

import { getCarbonFactors } from '@/lib/actions/carbon-factors'
import { fetchAllRows } from '@/lib/supabase/analytics-helpers'
import { sendBillingEmail } from '@/lib/actions/email-actions'
import { computeCustomerReport, type CustomerReportData, type ReportFlag } from './customer-metrics'
import { buildCustomerReportEmail } from './customer-report-email'
import type { PeriodType, ReportPeriod } from './period'
import { periodOf } from './period'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

export type ReportSettings = {
    Customer_ID: string
    Recipients_To: string[]
    Recipients_Cc: string[]
    Weekly_Enabled: boolean
    Monthly_Enabled: boolean
    Auto_Send: boolean
}

export type ReportRow = {
    Report_ID: string
    Customer_ID: string
    Customer_Name: string | null
    Branch_ID: string | null
    Period_Type: PeriodType
    Period_Start: string
    Period_End: string
    Status: 'draft' | 'sent' | 'failed' | 'skipped'
    Metrics_Json: CustomerReportData | null
    Flags_Json: ReportFlag[]
    Admin_Note: string | null
    Sent_At: string | null
    Sent_To: string | null
    Error: string | null
}

export const defaultSettings = (customerId: string): ReportSettings => ({
    Customer_ID: customerId,
    Recipients_To: [],
    Recipients_Cc: [],
    Weekly_Enabled: true,
    Monthly_Enabled: true,
    Auto_Send: false,
})

export const isValidEmail = (e: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e)

export async function loadSettings(db: DB, customerIds: string[]): Promise<Map<string, ReportSettings>> {
    const map = new Map<string, ReportSettings>()
    if (customerIds.length === 0) return map
    const { data } = await db.from('Customer_Report_Settings').select('*').in('Customer_ID', customerIds)
    for (const id of customerIds) map.set(id, defaultSettings(id))
    for (const r of (data || []) as ReportSettings[]) map.set(r.Customer_ID, { ...defaultSettings(r.Customer_ID), ...r })
    return map
}

export async function getCompanyName(db: DB): Promise<string> {
    const { data } = await db.from('System_Settings').select('key, value').in('key', ['accounting_profile', 'company_profile'])
    for (const key of ['accounting_profile', 'company_profile']) {
        const raw = (data || []).find((r: { key: string }) => r.key === key)?.value
        try {
            const v = typeof raw === 'string' ? JSON.parse(raw) : raw
            const name = v?.company_name_th || v?.company_name
            if (name) return name
        } catch { /* next */ }
    }
    return 'DD Service and Transport'
}

/** Customers that had jobs in the period (optionally one branch). */
async function customersWithJobs(db: DB, period: ReportPeriod, branchId?: string | null): Promise<{ Customer_ID: string; Customer_Name: string; Branch_ID: string | null }[]> {
    const rows = await fetchAllRows<{ Customer_ID: string | null }>(() => {
        let q = db.from('Jobs_Main').select('Customer_ID').gte('Plan_Date', period.start).lte('Plan_Date', period.end).not('Customer_ID', 'is', null)
        if (branchId) q = q.eq('Branch_ID', branchId)
        return q
    })
    const ids = new Set<string>()
    for (const r of rows) if (r.Customer_ID) ids.add(String(r.Customer_ID))
    if (ids.size === 0) return []
    const { data: customers } = await db.from('Master_Customers').select('Customer_ID, Customer_Name, Branch_ID').in('Customer_ID', [...ids])
    return (customers || []) as { Customer_ID: string; Customer_Name: string; Branch_ID: string | null }[]
}

/**
 * Create/refresh draft reports for every customer with jobs in the period.
 * Already-sent reports are left untouched unless `force`.
 */
export async function generateReports(db: DB, opts: { type: PeriodType; start: string; branchId?: string | null; customerIds?: string[]; force?: boolean }) {
    const period = periodOf(opts.type, opts.start)
    let customers = await customersWithJobs(db, period, opts.branchId)
    if (opts.customerIds?.length) {
        const want = new Set(opts.customerIds)
        customers = customers.filter(c => want.has(c.Customer_ID))
    }
    const settings = await loadSettings(db, customers.map(c => c.Customer_ID))
    const { data: existing } = await db.from('Customer_Reports').select('Customer_ID, Status')
        .eq('Period_Type', period.type).eq('Period_Start', period.start)
    const sent = new Set(((existing || []) as { Customer_ID: string; Status: string }[]).filter(r => r.Status === 'sent').map(r => r.Customer_ID))
    const carbonFactors = await getCarbonFactors().catch(() => undefined)

    let created = 0, skippedDisabled = 0, keptSent = 0
    for (const c of customers) {
        const st = settings.get(c.Customer_ID)!
        if (period.type === 'weekly' ? !st.Weekly_Enabled : !st.Monthly_Enabled) { skippedDisabled++; continue }
        if (sent.has(c.Customer_ID) && !opts.force) { keptSent++; continue }
        const data = await computeCustomerReport(db, { customerId: c.Customer_ID, customerName: c.Customer_Name, period, carbonFactors })
        const flags = [...data.flags]
        if (st.Recipients_To.length === 0) flags.push({ level: 'warning', code: 'no_recipients', message: 'ยังไม่ได้ตั้งอีเมลผู้รับ' })
        const { error } = await db.from('Customer_Reports').upsert({
            Customer_ID: c.Customer_ID,
            Customer_Name: c.Customer_Name,
            Branch_ID: c.Branch_ID,
            Period_Type: period.type,
            Period_Start: period.start,
            Period_End: period.end,
            Status: data.summary.jobs === 0 ? 'skipped' : 'draft',
            Metrics_Json: data,
            Flags_Json: flags,
            Error: null,
            Updated_At: new Date().toISOString(),
        }, { onConflict: 'Customer_ID,Period_Type,Period_Start' })
        if (error) throw new Error(`บันทึกรายงาน ${c.Customer_Name} ไม่สำเร็จ: ${error.message}`)
        created++
    }
    return { period, created, skippedDisabled, keptSent, customers: customers.length }
}

export const hasBlockingFlags = (flags: ReportFlag[] | null | undefined) => (flags || []).some(f => f.level === 'warning')

export async function sendReport(db: DB, reportId: string, opts: { sentBy: string; note?: string | null }) {
    const { data: row } = await db.from('Customer_Reports').select('*').eq('Report_ID', reportId).single()
    const report = row as ReportRow | null
    if (!report || !report.Metrics_Json) return { success: false, error: 'ไม่พบรายงาน' }
    if (report.Status === 'skipped') return { success: false, error: 'ไม่มีงานในช่วงนี้ ไม่ต้องส่ง' }

    const st = (await loadSettings(db, [report.Customer_ID])).get(report.Customer_ID)!
    const to = st.Recipients_To.filter(isValidEmail)
    if (to.length === 0) return { success: false, error: 'ยังไม่ได้ตั้งอีเมลผู้รับ' }
    const cc = [...to.slice(1), ...st.Recipients_Cc.filter(isValidEmail)]

    const note = opts.note !== undefined ? opts.note : report.Admin_Note
    const { data: branch } = report.Branch_ID
        ? await db.from('Master_Branches').select('Email').eq('Branch_ID', report.Branch_ID).maybeSingle()
        : { data: null }
    const companyName = await getCompanyName(db)
    const { subject, html } = buildCustomerReportEmail(report.Metrics_Json, { companyName, adminNote: note })

    const result = await sendBillingEmail({ from: branch?.Email || undefined, to: to[0], cc: cc.join(',') || undefined, subject, html })
    const now = new Date().toISOString()
    await db.from('Customer_Reports').update(result.success
        ? { Status: 'sent', Sent_At: now, Sent_To: [...to, ...cc].join(', '), Sent_By: opts.sentBy, Admin_Note: note ?? null, Error: null, Updated_At: now }
        : { Status: 'failed', Error: String(result.error || 'ส่งไม่สำเร็จ'), Admin_Note: note ?? null, Updated_At: now },
    ).eq('Report_ID', reportId)
    return result.success ? { success: true } : { success: false, error: String(result.error || 'ส่งไม่สำเร็จ') }
}

/** Sends every draft in the period that has recipients and no warning flags. */
export async function sendReadyReports(db: DB, opts: { type: PeriodType; start: string; branchId?: string | null; sentBy: string; onlyAutoSend?: boolean }) {
    const period = periodOf(opts.type, opts.start)
    let q = db.from('Customer_Reports').select('Report_ID, Customer_ID, Status, Flags_Json').eq('Period_Type', period.type).eq('Period_Start', period.start).in('Status', ['draft', 'failed'])
    if (opts.branchId) q = q.eq('Branch_ID', opts.branchId)
    const { data } = await q
    const rows = (data || []) as Pick<ReportRow, 'Report_ID' | 'Customer_ID' | 'Status' | 'Flags_Json'>[]
    const settings = await loadSettings(db, rows.map(r => r.Customer_ID))
    let sent = 0, failed = 0, held = 0
    const errors: string[] = []
    for (const r of rows) {
        const st = settings.get(r.Customer_ID)!
        if (hasBlockingFlags(r.Flags_Json) || (opts.onlyAutoSend && !st.Auto_Send)) { held++; continue }
        const res = await sendReport(db, r.Report_ID, { sentBy: opts.sentBy })
        if (res.success) sent++
        else { failed++; errors.push(res.error || '') }
    }
    return { sent, failed, held, errors }
}
