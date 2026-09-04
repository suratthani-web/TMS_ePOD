"use client"

import { useCallback, useEffect, useState } from "react"
import { Capacitor, registerPlugin } from "@capacitor/core"
import { Geolocation } from "@capacitor/geolocation"
import { MapPin, Loader2, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"

// reuse the background-geolocation plugin only for its openSettings() deep-link
const BackgroundGeolocation = registerPlugin<{ openSettings?: () => Promise<void> }>("BackgroundGeolocation")

const BG_ACK_KEY = "tms_bg_loc_ack" // one-time ack for the "always" step

type Phase = "checking" | "need_fg" | "need_bg" | "ok"

/**
 * บังคับสิทธิ์ตำแหน่งบน APK (เฉพาะ native) ก่อนใช้งานแอปคนขับ
 * - need_fg: ยังไม่เปิดตำแหน่ง → บล็อกแข็ง จนกว่าจะอนุญาต (ขอในแอปได้)
 * - need_bg: เปิดแล้ว แต่ย้ำให้ตั้ง "อนุญาตตลอดเวลา" ใน Settings (Android ตรวจไม่ได้ → ย้ำครั้งเดียว)
 * fail-open: ถ้า API ตำแหน่ง error จะไม่ล็อกคนขับออกจากงาน
 */
export function LocationGate() {
  const [phase, setPhase] = useState<Phase>("checking")

  const check = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) { setPhase("ok"); return }
    try {
      const p = await Geolocation.checkPermissions()
      if (p.location !== "granted") { setPhase("need_fg"); return }
      let acked = false
      try { acked = localStorage.getItem(BG_ACK_KEY) === "1" } catch {}
      setPhase(acked ? "ok" : "need_bg")
    } catch {
      setPhase("ok") // อย่าล็อกคนขับออกถ้าเช็คสิทธิ์ไม่ได้
    }
  }, [])

  useEffect(() => { check() }, [check])

  // เช็กซ้ำเมื่อกลับมาหน้าแอป (เช่น หลังกลับจาก Settings)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") check() }
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [check])

  const openSettings = () => { BackgroundGeolocation.openSettings?.().catch(() => {}) }

  const requestFg = async () => {
    try {
      const p = await Geolocation.requestPermissions()
      if (p.location === "granted") setPhase("need_bg")
      else openSettings() // ถูกปฏิเสธ/เลือก "ห้ามถามอีก" → พาไปตั้งค่าเอง
    } catch {
      openSettings()
    }
  }

  const ackBg = () => {
    try { localStorage.setItem(BG_ACK_KEY, "1") } catch {}
    setPhase("ok")
  }

  if (phase === "ok" || phase === "checking") return null

  return (
    <div className="fixed inset-0 z-[300] bg-background flex flex-col items-center justify-center p-8 text-center gap-6">
      <div className="w-20 h-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center">
        <MapPin size={40} />
      </div>

      {phase === "need_fg" ? (
        <>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-foreground">ต้องเปิดสิทธิ์ตำแหน่ง</h1>
            <p className="text-sm text-muted-foreground font-medium max-w-xs leading-relaxed">
              แอปคนขับต้องใช้ตำแหน่งเพื่อบันทึกการส่งงานและติดตามการวิ่งจริง
              กรุณาอนุญาตเพื่อใช้งานต่อ
            </p>
          </div>
          <div className="w-full max-w-xs space-y-3">
            <Button onClick={requestFg} className="w-full h-14 rounded-2xl font-black text-base gap-2 shadow-lg active:scale-95">
              <MapPin size={20} /> อนุญาตตำแหน่ง
            </Button>
            <button onClick={openSettings} className="w-full text-sm font-bold text-muted-foreground underline">
              เปิดหน้าตั้งค่าเอง
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <h1 className="text-2xl font-black text-foreground">ตั้งเป็น &quot;อนุญาตตลอดเวลา&quot;</h1>
            <p className="text-sm text-muted-foreground font-medium max-w-xs leading-relaxed">
              เพื่อให้บันทึกพิกัดได้แม้พับจอหรือปิดแอป ให้เปิด Settings แล้วเลือกสิทธิ์ตำแหน่งเป็น
              <span className="text-foreground font-bold"> &quot;อนุญาตตลอดเวลา&quot; </span>
              ระบบจะส่งพิกัดเฉพาะระหว่างมีงาน และหยุดเองเมื่อส่งครบทุกดรอป
            </p>
          </div>
          <div className="w-full max-w-xs space-y-3">
            <Button onClick={openSettings} className="w-full h-14 rounded-2xl font-black text-base gap-2 shadow-lg active:scale-95">
              <Settings size={20} /> เปิดตั้งค่าตำแหน่ง
            </Button>
            <button onClick={ackBg} className="w-full text-sm font-bold text-muted-foreground underline">
              ตั้งค่าเรียบร้อยแล้ว · ดำเนินการต่อ
            </button>
          </div>
        </>
      )}
    </div>
  )
}
