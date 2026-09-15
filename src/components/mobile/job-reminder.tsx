"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { getDriverReminder } from "@/app/mobile/actions"

// เตือนคนขับเป็นระยะถ้ายังมีงานที่ต้องทำวันนี้ (ยังไม่รับ/ยังไม่ปิด).
// ทำงานฝั่ง client ขณะเปิดแอป: แจ้งเตือน (Notification) + เสียง + สั่น ทุก ~10 นาที.
// เงียบทันทีเมื่อไม่มีงานค้าง.

const INTERVAL_MS = 10 * 60 * 1000 // 10 นาที
const FIRST_DELAY_MS = 45 * 1000   // เช็คครั้งแรกหลังเปิดแอป 45 วิ (กันรบกวนตอนเพิ่งเข้า)

function beep() {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
    if (!Ctx) return
    const ctx = new Ctx()
    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = freq
      osc.connect(gain); gain.connect(ctx.destination)
      const t = ctx.currentTime + start
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.start(t); osc.stop(t + dur)
    }
    // จังหวะเตือนสองโน้ต
    play(880, 0, 0.18)
    play(1174, 0.22, 0.22)
    setTimeout(() => { try { ctx.close() } catch {} }, 800)
  } catch { /* เงียบถ้าเล่นเสียงไม่ได้ */ }
}

export function JobReminder({ driverId }: { driverId: string }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const first = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!driverId) return
    // ขอสิทธิ์แจ้งเตือนแบบ best-effort
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {})
      }
    } catch { /* ไม่รองรับ */ }

    const check = async () => {
      // เงียบตอนไม่ได้เปิดแอปอยู่หน้าจอ (กันเด้งซ้อนตอนพับ) — ยังเตือนได้รอบถัดไป
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      const r = await getDriverReminder(driverId).catch(() => null)
      if (!r || r.total <= 0) return

      const parts: string[] = []
      if (r.notStarted > 0) parts.push(`ยังไม่รับ/เริ่ม ${r.notStarted} งาน`)
      if (r.inProgress > 0) parts.push(`ค้างยังไม่ปิด ${r.inProgress} งาน`)
      const body = parts.join(" · ")

      beep()
      try { navigator.vibrate?.([200, 100, 200]) } catch {}
      toast.warning("⏰ เตือนงานค้าง", { description: body, duration: 8000 })
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const n = new Notification("⏰ มีงานที่ต้องทำ", { body, tag: "job-reminder", renotify: true } as NotificationOptions)
          n.onclick = () => { try { window.focus() } catch {}; window.location.href = "/mobile/jobs"; n.close() }
        }
      } catch { /* ไม่รองรับ */ }
    }

    first.current = setTimeout(check, FIRST_DELAY_MS)
    timer.current = setInterval(check, INTERVAL_MS)
    return () => {
      if (first.current) clearTimeout(first.current)
      if (timer.current) clearInterval(timer.current)
    }
  }, [driverId])

  return null
}
