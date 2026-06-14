"use client"

import { useEffect } from "react"

/**
 * Keeps the installed PWA from running stale code for days.
 *
 * It does NOT change any caching strategy (so the offline POD queue is
 * untouched). It only asks the browser to check for a newer service worker
 * on app open / focus, and reloads once when a new worker takes control —
 * so a fresh deploy auto-refreshes every device instead of leaving some
 * drivers stuck on an old version.
 */
export function SWUpdater() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV === "development") return // SW is disabled in dev

    let refreshing = false
    // Only auto-reload when an *existing* controller is replaced (a real
    // update) — not on the very first install of a fresh page.
    const hadController = !!navigator.serviceWorker.controller

    const onControllerChange = () => {
      if (!hadController || refreshing) return
      refreshing = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)

    const checkForUpdate = () => {
      navigator.serviceWorker.getRegistration()
        .then((reg) => reg?.update())
        .catch(() => {})
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate()
    }
    document.addEventListener("visibilitychange", onVisible)

    // Check on open, then periodically while the app stays open.
    checkForUpdate()
    const interval = setInterval(checkForUpdate, 60_000)

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
      document.removeEventListener("visibilitychange", onVisible)
      clearInterval(interval)
    }
  }, [])

  return null
}
