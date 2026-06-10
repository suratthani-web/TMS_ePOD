"use client"

import { useEffect, useRef, useState } from "react"
import { saveGPSLog } from "@/lib/supabase/gps"
import { Geolocation } from '@capacitor/geolocation'
import { Capacitor } from '@capacitor/core'
import { toast } from "sonner"

const UPDATE_INTERVAL = 300000 // Update every 5 minutes
const MIN_DISTANCE = 0.0002 // Approx 20-30 meters

export function LocationTracker({ driverId }: { driverId?: string, branchId?: string }) {
  const [status, setStatus] = useState<"idle" | "tracking" | "error">("idle")
  
  const lastUpdateRef = useRef<number>(0)
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const watchIdRef = useRef<string | null>(null)
  
  useEffect(() => {
    // 1. Setup Tracking
    const startTracking = async () => {
        const isNative = Capacitor.isNativePlatform()
        
        if (isNative) {
            try {
                const permissions = await Geolocation.checkPermissions()
                if (permissions.location !== 'granted') {
                    await Geolocation.requestPermissions()
                }

                const id = await Geolocation.watchPosition(
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 3000
                    },
                    (position, err) => {
                        if (err) {
                            console.error('[Capacitor] Watch error:', err)
                            return
                        }
                        if (position) {
                            processLocationUpdate(
                                position.coords.latitude, 
                                position.coords.longitude, 
                                position.coords.speed || 0
                            )
                        }
                    }
                )
                watchIdRef.current = id
                console.log("[Capacitor] Native tracking initiated")
            } catch (err) {
                console.error("[Capacitor] Failed to start native tracking:", err)
                toast.error("Native GPS tracking failed to initialize")
            }
        } else {
            // Web Fallback
            const id = navigator.geolocation.watchPosition(
                (pos) => processLocationUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.speed || 0),
                (err) => {
                    console.warn('[Web] Geolocation error:', err)
                    setStatus("error")
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
            )
            watchIdRef.current = String(id)
            console.log("[Web] Browser tracking initiated")
        }
    }

    // 2. Setup Visibility Catch-up
    const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
            console.log("[PWA] Resumed: Catching up GPS...")
            if (!Capacitor.isNativePlatform()) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => processLocationUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.speed || 0),
                    null,
                    { enableHighAccuracy: true }
                )
            }
            // Re-acquire wake lock if needed
            setupPersistence()
        }
    }

    // 3. Background Persistence Hacks
    const setupPersistence = async () => {
        // Screen Wake Lock
        if ('wakeLock' in navigator) {
            try {
                wakeLockRef.current = await (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> } }).wakeLock?.request('screen')
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
                    lat: lat,
                    lng: lng,
                    speed: speed,
                })

                if (res.success) setStatus("tracking")
                else setStatus("error")
            } catch {
                setStatus("error")
            }
        }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    startTracking()
    setupPersistence()

    return () => {
        if (watchIdRef.current) {
            if (Capacitor.isNativePlatform()) {
                Geolocation.clearWatch({ id: watchIdRef.current })
            } else {
                navigator.geolocation.clearWatch(Number(watchIdRef.current))
            }
        }
        document.removeEventListener("visibilitychange", handleVisibilityChange)
        
        if (wakeLockRef.current) {
            wakeLockRef.current.release()
            wakeLockRef.current = null
        }

        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current = null
        }
    }
  }, [driverId])

  if (!driverId) return null

  return (
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
  )
}
