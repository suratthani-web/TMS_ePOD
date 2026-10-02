'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/server'
import { getSession } from '@/lib/session'
import { getUserBranchId, isAdmin } from '@/lib/permissions'
import { getCarbonFactors } from '@/lib/actions/carbon-factors'
import { computeCustomerReport, type CustomerReportData } from '@/lib/reports/customer-metrics'
import { isValidYmd, periodOf, type PeriodType } from '@/lib/reports/period'
import {
    defaultSettings, generateReports, isValidEmail, loadSettings, sendReadyReports, sendReport,
    type ReportRow, type ReportSettings,
} from '@/lib/reports/customer-report-service'

/** Admin's branch scope: null = all branches (super admin without a branch selected). */
async function requireAdminScope(): Promise<{ branchId: string | null; user: string }> {
    if (!(await isAdmin())) throw new Error('ต้องเป็นแอดมินเท่านั้น')
    const session = await getSession()
    const branch = await getUserBranchId()
    return { branchId: branch && branch !== 'All' ? branch : null, user: session?.username || session?.userId || 'admin' }
}

function parseType(t: unknown): PeriodType {
    return t === 'monthly' ? 'monthly' : 'weekly'
}

export type ReportListItem = ReportRow & { settings: ReportSettings }

export async function listCustomerReports(type: PeriodType, start: string): Promise<{ items: ReportListItem[]; error?: string }> {
    try {
        const { branchId } = await requireAdminScope()
        if (!isValidYmd(start)) return { items: [], error: 'วันที่ไม่ถูกต้อง' }
        const period = periodOf(parseType(type), start)
        const db = createAdminClient()
        let q = db.from('Customer_Reports').select('*').eq('Period_Type', period.type).eq('Period_Start', period.start).order('Customer_Name')
        if (branchId) q = q.eq('Branch_ID', branchId)
        const { data, error } = await q
        if (error) return { items: [], error: error.code === 'PGRST205' ? 'ยังไม่ได้รัน SQL 20261002_customer_reports.sql' : error.message }
        const rows = (data || []) as ReportRow[]
        const settings = await loadSettings(db, rows.map(r => r.Customer_ID))
        return { items: rows.map(r => ({ ...r, settings: settings.get(r.Customer_ID) || defaultSettings(r.Customer_ID) })) }
    } catch (e) {
        return { items: [], error: (e as Error).message }
    }
}

export async function generateCustomerReportsAction(type: PeriodType, start: string, customerIds?: string[]) {
    try {
        const { branchId } = await requireAdminScope()
        if (!isValidYmd(start)) return { success: false, message: 'วันที่ไม่ถูกต้อง' }
        const db = createAdminClient()
        // explicit regenerate of specific customers may refresh an already-sent snapshot
        const res = await generateReports(db, { type: parseType(type), start, branchId, customerIds, force: !!customerIds?.length })
        revalidatePath('/reports/customer-reports')
        return { success: true, message: `สร้าง/อัปเดตรายงาน ${res.created} ราย${res.keptSent ? ` (ข้ามที่ส่งแล้ว ${res.keptSent})` : ''}${res.skippedDisabled ? ` (ปิดรอบนี้ ${res.skippedDisabled})` : ''}` }
    } catch (e) {
        return { success: false, message: (e as Error).message }
    }
}

export async function saveReportSettingsAction(customerId: string, input: Partial<ReportSettings>) {
    try {
        const { user } = await requireAdminScope()
        const clean = (list: unknown) => [...new Set((Array.isArray(list) ? list : []).map(e => String(e).trim().toLowerCase()).filter(Boolean))]
        const to = clean(input.Recipients_To)
        const cc = clean(input.Recipients_Cc)
        const bad = [...to, ...cc].filter(e => !isValidEmail(e))
        if (bad.length) return { success: false, message: `อีเมลไม่ถูกต้อง: ${bad.join(', ')}` }
        const db = createAdminClient()
        const { error } = await db.from('Customer_Report_Settings').upsert({
            Customer_ID: customerId,
            Recipients_To: to,
            Recipients_Cc: cc,
            Weekly_Enabled: input.Weekly_Enabled ?? true,
            Monthly_Enabled: input.Monthly_Enabled ?? true,
            Auto_Send: !!input.Auto_Send,
            Updated_At: new Date().toISOString(),
            Updated_By: user,
        }, { onConflict: 'Customer_ID' })
        if (error) return { success: false, message: error.message }
        revalidatePath('/reports/customer-reports')
        return { success: true, message: 'บันทึกการตั้งค่าแล้ว' }
    } catch (e) {
        return { success: false, message: (e as Error).message }
    }
}

export async function saveReportNoteAction(reportId: string, note: string) {
    try {
        await requireAdminScope()
        const db = createAdminClient()
        const { error } = await db.from('Customer_Reports').update({ Admin_Note: note.trim() || null, Updated_At: new Date().toISOString() }).eq('Report_ID', reportId)
        if (error) return { success: false, message: error.message }
        return { success: true, message: 'บันทึกหมายเหตุแล้ว' }
    } catch (e) {
        return { success: false, message: (e as Error).message }
    }
}

export async function sendCustomerReportAction(reportId: string) {
    try {
        const { user, branchId } = await requireAdminScope()
        const db = createAdminClient()
        if (branchId) {
            const { data } = await db.from('Customer_Reports').select('Branch_ID').eq('Report_ID', reportId).single()
            if (data?.Branch_ID !== branchId) return { success: false, message: 'ไม่มีสิทธิ์ส่งรายงานของสาขาอื่น' }
        }
        const res = await sendReport(db, reportId, { sentBy: user })
        revalidatePath('/reports/customer-reports')
        return res.success ? { success: true, message: 'ส่งอีเมลแล้ว' } : { success: false, message: res.error || 'ส่งไม่สำเร็จ' }
    } catch (e) {
        return { success: false, message: (e as Error).message }
    }
}

export async function sendReadyReportsAction(type: PeriodType, start: string) {
    try {
        const { user, branchId } = await requireAdminScope()
        const db = createAdminClient()
        const r = await sendReadyReports(db, { type: parseType(type), start, branchId, sentBy: user })
        revalidatePath('/reports/customer-reports')
        return {
            success: r.failed === 0,
            message: `ส่งแล้ว ${r.sent} ราย${r.held ? ` · รอตรวจ ${r.held} ราย (มีธงเตือน)` : ''}${r.failed ? ` · ส่งไม่สำเร็จ ${r.failed} ราย: ${r.errors[0]}` : ''}`,
        }
    } catch (e) {
        return { success: false, message: (e as Error).message }
    }
}

/**
 * Data for /customer-report. A customer always gets their own report (any
 * customerId argument is ignored); admins may view any customer in their branch.
 * Uses the stored snapshot when one exists (= what was e-mailed), else live.
 */
export async function getCustomerReportDashboard(input: { type?: string; start?: string; customerId?: string }): Promise<{ data?: CustomerReportData; error?: string; customers?: { Customer_ID: string; Customer_Name: string }[] }> {
    const session = await getSession()
    if (!session) return { error: 'กรุณาเข้าสู่ระบบ' }
    const db = createAdminClient()
    const type = parseType(input.type)
    const start = isValidYmd(input.start) ? input.start : new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
    const period = periodOf(type, start)

    const isCustomerViewer = !!session.customerId && session.customerId !== 'FORCED_RESTRICTION'
    // Internal review info (flags, unclosed jobs, missing POD) never reaches a customer
    const forViewer = (d: CustomerReportData): CustomerReportData =>
        isCustomerViewer ? { ...d, flags: [], openJobs: [], podMissing: [] } : d

    let customerId: string | null = null
    let customers: { Customer_ID: string; Customer_Name: string }[] | undefined
    if (isCustomerViewer) {
        customerId = session.customerId
    } else if (await isAdmin()) {
        const branch = await getUserBranchId()
        let q = db.from('Master_Customers').select('Customer_ID, Customer_Name').order('Customer_Name')
        if (branch && branch !== 'All') q = q.eq('Branch_ID', branch)
        const { data } = await q
        customers = (data || []) as { Customer_ID: string; Customer_Name: string }[]
        customerId = input.customerId && customers.some(c => c.Customer_ID === input.customerId) ? input.customerId : null
        if (!customerId) return { customers }
    } else {
        return { error: 'ไม่มีสิทธิ์ดูรายงานนี้' }
    }
    if (!customerId) return { error: 'ไม่พบข้อมูลลูกค้า' }

    const { data: snap } = await db.from('Customer_Reports').select('Metrics_Json')
        .eq('Customer_ID', customerId).eq('Period_Type', period.type).eq('Period_Start', period.start).maybeSingle()
    if (snap?.Metrics_Json) return { data: forViewer(snap.Metrics_Json as CustomerReportData), customers }

    const { data: cust } = await db.from('Master_Customers').select('Customer_Name').eq('Customer_ID', customerId).maybeSingle()
    const data = await computeCustomerReport(db, {
        customerId,
        customerName: cust?.Customer_Name || customerId,
        period,
        carbonFactors: await getCarbonFactors().catch(() => undefined),
    })
    return { data: forViewer(data), customers }
}
