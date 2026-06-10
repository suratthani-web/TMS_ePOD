"use client"

import { useEffect, useRef } from "react"
import { recoverDriverSession } from "@/lib/actions/auth-actions"
import { useRouter } from "next/navigation"
import type { PluginListenerHandle } from "@capacitor/core"

const STORAGE_KEY = "logis_driver_session_v1"
const REFRESH_THROTTLE = 5000 // 5 seconds

interface Session {
  driverId: string;
  driverName: string;
  branchId?: string;
  role: string;
  permissions?: unknown;
}

export function SessionStabilizer({ session }: { session: Session | null }) {
  const router = useRouter()
  const isRecoveringRef = useRef(false)
  const lastRefreshRef = useRef(0)

  // 1. Sync session to localStorage
  useEffect(() => {
    if (session?.driverId) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        driverId: session.driverId,
        timestamp: Date.now()
      }))
    }
  }, [session])

  // 2. Recovery & Refresh Logic
  useEffect(() => {
    const triggerRefresh = () => {
      const now = Date.now()
      if (now - lastRefreshRef.current > REFRESH_THROTTLE) {
        lastRefreshRef.current = now
        console.log("[Stabilizer] Refreshing data...")
        router.refresh()
      }
    }

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        if (!session && !isRecoveringRef.current) {
          const stored = localStorage.getItem(STORAGE_KEY)
          if (stored) {
            try {
              const { driverId, timestamp } = JSON.parse(stored)
              const thirtyDays = 30 * 24 * 60 * 60 * 1000
              if (Date.now() - timestamp < thirtyDays) {
                console.log("[PWA] Attempting session recovery for:", driverId)
                isRecoveringRef.current = true
                const result = await recoverDriverSession(driverId)
                if (result.success) {
                  window.location.reload()
                }
              }
            } catch (e) {
              console.error("[PWA] Recovery failed:", e)
            } finally {
               isRecoveringRef.current = false
            }
          }
        } else if (session) {
          triggerRefresh()
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    
    // Capacitor App State handling
    let appStateListener: PluginListenerHandle | null = null
    
    import('@capacitor/core').then(({ Capacitor }) => {
        if (Capacitor.isNativePlatform()) {
            import('@capacitor/app').then(({ App }) => {
                App.addListener('appStateChange', ({ isActive }) => {
                    if (isActive && session) {
                        console.log("[APK] App foregrounded")
                        triggerRefresh()
                    }
                }).then(listener => {
                    appStateListener = listener
                })
            })
        }
    })

    // Initial check on mount
    if (session) {
       // We don't necessarily want to refresh immediately on mount as it might be the initial load
       // but we check visibility state
       if (document.visibilityState === "visible") {
          lastRefreshRef.current = Date.now() // Mark current time to prevent immediate double refresh
       }
    } else {
       handleVisibilityChange()
    }

    return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange)
        if (appStateListener) {
            appStateListener.remove()
        }
    }
  }, [session, router])

  return null
}
