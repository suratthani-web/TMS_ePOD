import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { sendPushToDriver } from '@/lib/actions/push-actions'
import { todayTH } from '@/lib/utils/date-th'

// เตือนคนขับผ่าน Web Push แม้ปิดแอป. ตั้งให้ยิงทุก 10 นาทีจาก cron-job.org.
// กติกา (ตามที่ตกลง):
//  1. งานใหม่วันนี้ยังไม่รับ/เริ่ม  → เริ่มเตือนตั้งแต่ 08:00 (รายชั่วโมง กันรบกวน)
//  2. งานค้างย้อนหลังเกิน 1 วัน      → เตือนทุกรอบ (ทุก 10 นาที)
//  3. งานที่ทำยังไม่เสร็จเกินเวลาที่คำนวณจากระยะทาง (ผิดปกติ) → เตือนกันลืมปิดงาน (ทุกรอบ)

const NOT_STARTED = ['New', 'Assigned', 'Confirmed']
const IN_PROGRESS = ['Accepted', 'Arrived Pickup', 'Picked Up', 'In Transit', 'In Progress', 'Arrived Dropoff']

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // เวลาไทย (UTC+7)
    const now = new Date()
    const th = new Date(now.getTime() + 7 * 3600 * 1000)
    const hour = th.getUTCHours()
    const minute = th.getUTCMinutes()
    const today = todayTH()

    const supabase = createAdminClient()
    // จำกัด backlog ไม่เกิน 30 วันย้อนหลัง เพื่อไม่ให้ query บาน
    const floor = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    const { data: jobs } = await supabase
      .from('Jobs_Main')
      .select('Job_ID, Driver_ID, Job_Status, Plan_Date, Est_Distance_KM')
      .not('Driver_ID', 'is', null)
      .in('Job_Status', [...NOT_STARTED, ...IN_PROGRESS])
      .gte('Plan_Date', floor)

    type Agg = { newToday: number; backlog: number; overdue: number }
    const byDriver = new Map<string, Agg>()
    const get = (d: string) => {
      let a = byDriver.get(d)
      if (!a) { a = { newToday: 0, backlog: 0, overdue: 0 }; byDriver.set(d, a) }
      return a
    }

    for (const j of jobs || []) {
      const driver = j.Driver_ID as string
      if (!driver) continue
      const planDate = (j.Plan_Date as string || '').slice(0, 10)
      const isToday = planDate === today
      const isBacklog = planDate !== '' && planDate < today
      const a = get(driver)

      if (NOT_STARTED.includes(j.Job_Status as string)) {
        if (isBacklog) a.backlog++
        else if (isToday) a.newToday++
      } else {
        // IN_PROGRESS
        if (isBacklog) {
          a.backlog++
        } else if (isToday) {
          // เกินเวลาที่คำนวณจากระยะทางแบบผิดปกติ (proxy: นับจาก 08:00 ของวัน)
          const est = Number(j.Est_Distance_KM) || 0
          const expectedMin = est > 0 ? (est / 40) * 60 + 90 : 240 // 40 กม./ชม. + buffer 90 นาที
          const elapsedMin = hour >= 8 ? (hour - 8) * 60 + minute : 0
          if (elapsedMin > expectedMin * 2 + 60) a.overdue++
        }
      }
    }

    let pushed = 0
    for (const [driver, a] of byDriver) {
      const parts: string[] = []
      // backlog + overdue → เตือนทุกรอบ; งานใหม่วันนี้ → เฉพาะต้นชั่วโมงตั้งแต่ 8 โมง
      if (a.backlog > 0) parts.push(`ค้างข้ามวัน ${a.backlog} งาน`)
      if (a.overdue > 0) parts.push(`เกินเวลา (กันลืมปิด) ${a.overdue} งาน`)
      const newDue = a.newToday > 0 && hour >= 8 && minute < 10
      if (newDue) parts.push(`งานใหม่วันนี้ ${a.newToday} งาน`)

      if (parts.length === 0) continue
      await sendPushToDriver(driver, {
        title: '⏰ เตือนงานค้าง',
        body: parts.join(' · ') + ' — แตะเพื่อเปิดงาน',
        url: '/mobile/jobs',
        tag: 'job-reminder',
      })
      pushed++
    }

    return NextResponse.json({ status: 'ok', drivers: byDriver.size, pushed, th: `${hour}:${String(minute).padStart(2, '0')}` })
  } catch (error: unknown) {
    console.error('[CRON driver-reminders] Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
