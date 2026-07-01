"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { saveGPSLog } from "@/lib/supabase/gps"
import { getDriverActiveJob } from "@/lib/actions/gps-actions"
import { Geolocation } from '@capacitor/geolocation'
import { registerPlugin, Capacitor } from '@capacitor/core'
import { toast } from "sonner"
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation'
import { MapPin } from "lucide-react"
import { TRACKING_EVENT, readCachedActiveJob, writeCachedActiveJob } from "@/lib/tracking-state"

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

const UPDATE_INTERVAL = 300000 // Update every 5 minutes
const MIN_DISTANCE = 0.0005 // Approx 50 meters — each move past this writes a GPS
                            // log (a server action). 50m keeps a usable trail
                            // while roughly halving writes vs the old ~20-30m.

export function LocationTracker({ driverId }: { driverId?: string, branchId?: string }) {
  const [status, setStatus] = useState<"idle" | "tracking" | "error">("idle")
  // The job currently in progress for this driver. While null, tracking is
  // paused — we only record location between "เริ่มงาน" and delivery confirm.
  // Starts null to match SSR; the cache is read post-mount in Effect 1.
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  const lastUpdateRef = useRef<number>(0)
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const watchIdRef = useRef<string | null>(null)

  const isNative = Capacitor.isNativePlatform()

  // ── Effect 1: resolve whether a job is in progress (server is the truth) ──
  const refreshActiveJob = useCallback(async () => {
    if (!driverId) return
    try {
      const jobId = await getDriverActiveJob(driverId)
      writeCachedActiveJob(driverId, jobId)
      setActiveJobId(jobId)
    } catch {
      // Offline (e.g. APK resumed with no signal): fall back to the last known
      // job so tracking can still resume after the OS killed the app.
      setActiveJobId(readCachedActiveJob(driverId))
    }
  }, [driverId])

  useEffect(() => {
    if (!driverId) return

    // refreshActiveJob only calls setState after an await, so this is async —
    // not the synchronous cascading render the lint heuristic assumes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshActiveJob()

    const onTrackingEvent = () => refreshActiveJob()
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshActiveJob()
    }

    window.addEventListener(TRACKING_EVENT, onTrackingEvent)
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      window.removeEventListener(TRACKING_EVENT, onTrackingEvent)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [driverId, refreshActiveJob])

  // ── Effect 2: run the GPS watcher only while a job is in progress ──
  useEffect(() => {
    if (!driverId || !activeJobId) return

    const processLocationUpdate = async (lat: number, lng: number, speed: number) => {
      const now = Date.now()
      const timeDiff = now - lastUpdateRef.current
      const isTime = timeDiff > UPDATE_INTERVAL
      const isDistance = lastPosRef.current
        ? Math.abs(lat - lastPosRef.current.lat) + Math.abs(lng - lastPosRef.current.lng) > MIN_DISTANCE
        : true

      if (isTime || isDistance) {
        lastUpdateRef.current = now
        lastPosRef.current = { lat, lng }

        try {
          const res = await saveGPSLog({
            driverId: driverId!,
            lat,
            lng,
            speed,
            jobId: activeJobId,
          })

          if (res.success) setStatus("tracking")
          else setStatus("error")
        } catch {
          setStatus("error")
        }
      }
    }

    // 1. Setup Tracking
    const startTracking = async () => {
      if (isNative) {
        try {
          const permissions = await Geolocation.checkPermissions()
          if (permissions.location !== 'granted') {
            await Geolocation.requestPermissions()
          }

          // Native foreground service — keeps tracking even when the app is
          // backgrounded, the screen is off, or the OS kills the WebView.
          const id = await BackgroundGeolocation.addWatcher(
            {
              backgroundTitle: "LOGIS Driver - บันทึกพิกัด",
              backgroundMessage: "กำลังบันทึกตำแหน่งสำหรับการส่งงานของคุณในเบื้องหลัง",
              requestPermissions: true,
              stale: false,
              distanceFilter: 50 // Update position every 50 meters (fewer GPS-log writes)
            },
            (position: any, err: any) => {
              if (err) {
                console.error('[Capacitor Background] Watch error:', err)
                return
              }
              if (position) {
                processLocationUpdate(
                  position.latitude,
                  position.longitude,
                  position.speed || 0
                )
              }
            }
          )
          watchIdRef.current = id
          console.log("[Capacitor Background] Native tracking initiated for job", activeJobId)
        } catch (err) {
          console.error("[Capacitor Background] Failed to start native tracking:", err)
          toast.error("Native Background GPS tracking failed to initialize")
        }
      } else {
        // Web Fallback — only runs while the PWA is open/foreground; browsers
        // cannot track continuously once the app is closed. setupPersistence()
        // and the resume catch-up below extend this as far as the web allows.
        const id = navigator.geolocation.watchPosition(
          (pos) => processLocationUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.speed || 0),
          (err) => {
            console.warn('[Web] Geolocation error:', err)
            setStatus("error")
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        )
        watchIdRef.current = String(id)
        console.log("[Web] Browser tracking initiated for job", activeJobId)
      }
    }

    // 2. Background persistence hacks (web only — native uses the foreground service)
    const setupPersistence = async () => {
      if (isNative) return

      // Screen Wake Lock
      if ('wakeLock' in navigator) {
        try {
          wakeLockRef.current = await (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> } }).wakeLock?.request('screen') ?? null
          console.log("[PWA] Screen Wake Lock acquired")
        } catch (err) {
          console.warn("[PWA] Wake Lock failed:", err)
        }
      }

      // Silent Audio Loop Hack (to prevent OS from killing background process)
      if (!audioRef.current) {
        const silentMp3 = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=="
        audioRef.current = new Audio(silentMp3)
        audioRef.current.loop = true
        audioRef.current.volume = 0.01 // Minimal volume

        // Interaction required to play audio in most browsers
        const playAudio = () => {
          audioRef.current?.play().catch(() => {
            console.log("[PWA] Audio play failed, waiting for interaction")
          })
          document.removeEventListener('click', playAudio)
        }
        document.addEventListener('click', playAudio)
      }
    }

    // 3. On returning to foreground, grab a fresh position and re-arm persistence
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (!isNative) {
          navigator.geolocation.getCurrentPosition(
            (pos) => processLocationUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.speed || 0),
            null,
            { enableHighAccuracy: true }
          )
        }
        setupPersistence()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    startTracking()
    setupPersistence()

    return () => {
      if (watchIdRef.current) {
        if (isNative) {
          BackgroundGeolocation.removeWatcher({ id: watchIdRef.current }).catch(err => {
            console.error('[Capacitor Background] Remove watcher error:', err)
          })
        } else {
          navigator.geolocation.clearWatch(Number(watchIdRef.current))
        }
        watchIdRef.current = null
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange)

      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {})
        wakeLockRef.current = null
      }

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }

      // Job ended (or component unmounted) — clear the live indicator.
      setStatus("idle")
    }
  }, [driverId, activeJobId, isNative])

  if (!driverId) return null

  return (
    <>
      <div className="fixed top-2 right-2 z-50 pointer-events-none flex flex-col items-end gap-1">
        {status === "tracking" && (
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        )}

        {status === "error" && (
          <span className="h-2 w-2 rounded-full bg-red-500 shadow-sm shadow-red-500/50"></span>
        )}
      </div>

      {/* On PWA, the browser can't track once the app is closed — tell the driver. */}
      {activeJobId && !isNative && (
        <div className="fixed top-0 inset-x-0 z-40 pointer-events-none flex justify-center px-3 pt-[env(safe-area-inset-top)]">
          <div className="mt-1 flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary border border-primary/20">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>กำลังบันทึกตำแหน่งระหว่างส่งงาน — เปิดแอปค้างไว้</span>
          </div>
        </div>
      )}
    </>
  )
}
