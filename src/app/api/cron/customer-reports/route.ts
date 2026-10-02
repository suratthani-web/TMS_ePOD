import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { lastCompletedPeriod, periodLabel } from '@/lib/reports/period'
import { generateReports, sendReadyReports } from '@/lib/reports/customer-report-service'
import { sendPushToAdmins } from '@/lib/actions/push-actions'

// Weekly (Mon 07:00) / monthly (1st 08:00) customer reports — schedule on cron-job.org:
//   GET /api/cron/customer-reports?type=weekly   (Authorization: Bearer CRON_SECRET)
//   GET /api/cron/customer-reports?type=monthly
// Builds drafts for the period that just ended, auto-sends only customers with
// Auto_Send on AND no warning flags, then pings admins to review the rest.
export const maxDuration = 300

export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get('authorization')
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const type = new URL(req.url).searchParams.get('type') === 'monthly' ? 'monthly' : 'weekly'
        const period = lastCompletedPeriod(type)
        const db = createAdminClient()

        const gen = await generateReports(db, { type, start: period.start })
        const auto = await sendReadyReports(db, { type, start: period.start, sentBy: 'auto (cron)', onlyAutoSend: true })

        const pending = gen.created - auto.sent
        if (gen.created > 0) {
            await sendPushToAdmins({
                title: `📊 รายงานลูกค้า ${periodLabel(period)}`,
                body: `${auto.sent ? `ส่งอัตโนมัติแล้ว ${auto.sent} ราย · ` : ''}รอแอดมินตรวจ/ส่ง ${pending} ราย`,
                url: `/reports/customer-reports?type=${type}&start=${period.start}`,
            })
        }
        return NextResponse.json({ status: 'ok', period, generated: gen, autoSent: auto })
    } catch (error: unknown) {
        console.error('[CRON customer-reports] Error:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
}
