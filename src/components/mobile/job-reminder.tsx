"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { getDriverReminder } from "@/app/mobile/actions"

// เตือนคนขับเป็นระยะเฉพาะกรณีมีงานค้างส่งจริง (จากวันก่อนหน้า) หรือแจ้งเตือนปิดงานรอบค่ำ
// จะไม่ส่งเสียงหรือแจ้งเตือน "งานค้าง" เมื่อคนขับเพิ่งกดรับงานหรือกำลังส่งงานตามปกติในเวลากลางวัน

const INTERVAL_MS = 15 * 60 * 1000 // เช็คทุก 15 นาที
const FIRST_DELAY_MS = 60 * 1000   // เช็คครั้งแรกหลังเปิดแอป 1 นาที

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

    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {})
      }
    } catch { /* ไม่รองรับ */ }

    const check = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      const r = await getDriverReminder(driverId).catch(() => null)
      if (!r) return

      // 1. งานค้างส่งจริงจากวันก่อนหน้าที่ยังไม่ปิด POD
      if (r.backlog > 0) {
        beep()
        try { navigator.vibrate?.([200, 100, 200]) } catch {}
        toast.warning("⏰ มีงานค้างส่งจากวันก่อน", {
          description: `มีงานค้างที่ยังไม่ปิด POD ${r.backlog} งาน กรุณาตรวจสอบและดำเนินการปิดงาน`,
          duration: 8000,
        })
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const n = new Notification("⏰ มีงานค้างส่งจากวันก่อน", {
              body: `มีงานค้าง ${r.backlog} งานที่ยังไม่ปิด POD`,
              tag: "job-reminder-backlog",
              renotify: true,
            } as NotificationOptions)
            n.onclick = () => { try { window.focus() } catch {}; window.location.href = "/mobile/jobs"; n.close() }
          }
        } catch { /* ไม่รองรับ */ }
        return
      }

      // 2. เตือนช่วงค่ำ (หลัง 19:00 น.) หากยังมีงานของวันนี้ที่ยังไม่ได้ปิด POD
      if (r.isLateHours && r.inProgress > 0) {
        beep()
        try { navigator.vibrate?.([200, 100, 200]) } catch {}
        toast.info("🌙 สรุปงานประจำวัน", {
          description: `ยังมีงานที่กำลังดำเนินการ ${r.inProgress} งาน อย่าลืมส่ง POD เพื่อปิดงานประจำวัน`,
          duration: 7000,
        })
        return
      }

      // ในช่วงกลางวันปกติ: การกดรับงานหรือมีงานกำลังส่งอยู่ ถือเป็นการทำงานปกติ ไม่ส่งเสียงหรือเด้งเตือนว่าค้างส่ง
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
