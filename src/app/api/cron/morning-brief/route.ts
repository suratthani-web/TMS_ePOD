import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { sendPushToAdminUser } from '@/lib/actions/push-actions'
import { aiToolExecutors } from '@/lib/ai/tools'

export async function GET(req: Request) {
    try {
        // Simple security check (optional - can be authenticated via Vercel CRON secret header)
        const authHeader = req.headers.get('authorization')
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = createAdminClient()

        // 1. Get admins to brief. Web Push (free) replaces LINE here, so we brief
        // every admin — sendPushToAdminUser simply no-ops for those without a
        // push subscription.
        const { data: admins, error: adminError } = await supabase
            .from('Master_Users')
            .select('Name, Branch_ID, Username, User_ID')

        if (adminError || !admins || admins.length === 0) {
            return NextResponse.json({ status: 'no_admins_to_brief' })
        }

        const now = new Date()
        const dateDisplay = now.toLocaleDateString('th-TH', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            timeZone: 'Asia/Bangkok'
        })

        let briefCount = 0

        // 2. Query summary and push to each admin
        for (const admin of admins) {
            const adminId = admin.Username || admin.User_ID
            if (!adminId) continue

            const branchId = admin.Branch_ID === 'HQ' ? undefined : admin.Branch_ID
            const today = await aiToolExecutors.get_today_summary({ branchId })

            const active = today.stats.active || 0
            const pending = today.stats.pending || 0
            const completed = today.stats.completed || 0
            const cancelled = today.stats.cancelled || 0
            const total = today.todayJobCount || 0

            const readinessRate = total > 0 ? Math.round(((completed + active) / total) * 100) : 100

            const text = [
                `☀️ สวัสดีตอนเช้าครับ คุณ${admin.Name}!`,
                `📅 วัน${dateDisplay} | ⏰ เวลา 06:30 น.`,
                '',
                `📊 [สรุปแผนการขนส่งของสาขา ${admin.Branch_ID || 'ส่วนกลาง'}]`,
                `📝 งานจัดส่งทั้งหมดวันนี้: ${total} รายการ`,
                `⏳ รอการดำเนินการ: ${pending} งาน`,
                `🚛 กำลังเดินทางจัดส่ง: ${active} งาน`,
                `✅ ส่งสำเร็จเรียบร้อย: ${completed} งาน`,
                `❌ ยกเลิก/ล้มเหลว: ${cancelled} งาน`,
                '',
                `📈 อัตราความพร้อมส่งมอบสินค้า: ${readinessRate}%`,
                `ขอให้เป็นวันที่ดีและปลอดภัยในการขนส่งทุกเส้นทางครับ! 🚛💨✨`
            ].join('\n')

            const res = await sendPushToAdminUser(adminId, {
                title: `☀️ สรุปเช้านี้ • ${admin.Branch_ID || 'ส่วนกลาง'}`,
                body: text,
                url: '/dashboard',
                type: 'morning_brief',
                tag: 'morning_brief',
            })
            if (res.success) briefCount++
        }

        return NextResponse.json({ status: 'ok', briefedAdmins: briefCount })
    } catch (err) {
        console.error('[CRON Morning Brief] Error:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
