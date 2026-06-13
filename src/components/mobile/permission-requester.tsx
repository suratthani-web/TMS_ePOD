"use client"

import { useState, useEffect, useCallback } from "react"
import { Bell, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'

type Props = { driverId: string | null }

// Bind native FCM listeners only once per app session — re-binding on every
// render/registration leaks listeners and can double-register the token.
let fcmListenersBound = false

// Snooze the "enable notifications" prompt after the driver taps "ไว้ก่อน",
// so it doesn't pop up again on every page navigation.
const PROMPT_SNOOZE_KEY = 'tms_push_prompt_snooze_until'
const PROMPT_SNOOZE_MS = 24 * 60 * 60 * 1000 // 24h

function isPromptSnoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(PROMPT_SNOOZE_KEY) || 0)
    return Date.now() < until
  } catch {
    return false
  }
}

function snoozePrompt(): void {
  try {
    localStorage.setItem(PROMPT_SNOOZE_KEY, String(Date.now() + PROMPT_SNOOZE_MS))
  } catch {
    // ignore storage failures
  }
}

async function postFcmToken(driverId: string, token: string) {
  try {
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, subscription: { endpoint: token, isFCM: true } })
    })
  } catch {
    // Silent: registration is best-effort.
  }
}

export function PermissionRequester({ driverId }: Props) {
  const [showPrompt, setShowPrompt] = useState(false)
  const [showDeniedPrompt, setShowDeniedPrompt] = useState(false)

  // Bind the FCM foreground + registration listeners exactly once, then
  // trigger registration (which fires the 'registration' listener).
  const bindAndRegisterFCM = useCallback(async () => {
    if (!driverId) return

    if (!fcmListenersBound) {
      fcmListenersBound = true

      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        toast.success(notification.title || "แจ้งเตือนใหม่", {
          description: notification.body,
          duration: 8000,
        })
        try {
          const audio = new Audio('/sounds/notification.mp3')
          audio.play().catch(() => {})
        } catch {
          // ignore sound failures
        }
      })

      await PushNotifications.addListener('registration', async (token) => {
        if (driverId) await postFcmToken(driverId, token.value)
      })

      await PushNotifications.addListener('registrationError', () => {
        // Silent: nothing to do on registration error.
      })
    }

    try {
      await PushNotifications.register()
    } catch {
      // ignore — register may throw if called before permission is granted
    }
  }, [driverId])

  useEffect(() => {
    if (!driverId) return  // Not logged in yet — skip all registration

    // 1. Native Push (FCM)
    if (Capacitor.isNativePlatform()) {
      // Create channel for Android 8.0+
      try {
        PushNotifications.createChannel({
          id: 'tms-notifications',
          name: 'TMS Notifications',
          description: 'General system notifications',
          importance: 5, // Importance.HIGH
          visibility: 1, // Visibility.PUBLIC
          sound: 'default',
          vibration: true,
        }).catch(() => {})
      } catch {
        // ignore
      }

      PushNotifications.checkPermissions().then(async (status) => {
        if (status.receive === 'granted') {
          // Already granted → silently register FCM token immediately
          await bindAndRegisterFCM()
        } else if (status.receive === 'prompt') {
          if (!isPromptSnoozed()) setTimeout(() => setShowPrompt(true), 2000)
        } else if (status.receive === 'denied') {
          const hasReminded = localStorage.getItem('tms_reminded_denied_push')
          if (!hasReminded) {
            setTimeout(() => setShowDeniedPrompt(true), 2000)
          }
        }
      })
    }
    // 2. Web Push
    else {
      if ('serviceWorker' in navigator) {
        if (process.env.NODE_ENV === 'development') {
          // In development, we don't use PWA/SW, so unregister any leftover workers
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const registration of registrations) {
              registration.unregister()
            }
          })
        } else {
          // Register the MAIN sw.js which now contains our push logic
          navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then((reg) => {
              // Check if we need to update
              reg.update();
            })
            .catch((err) => console.error("SW Register Error:", err))
        }
      }

      if ("Notification" in window) {
        if (Notification.permission === "default") {
          if (!isPromptSnoozed()) setTimeout(() => setShowPrompt(true), 2000)
        } else if (Notification.permission === "denied") {
          const hasReminded = localStorage.getItem('tms_reminded_denied_push')
          if (!hasReminded) {
            setTimeout(() => setShowDeniedPrompt(true), 2000)
          }
        }
      }
    }
  }, [driverId, bindAndRegisterFCM])

  const subscribeToPush = async () => {
    try {
      if (!driverId) { setShowPrompt(false); return }

      if (Capacitor.isNativePlatform()) {
        // --- NATIVE PUSH LOGIC (FCM via Capacitor) ---
        const permStatus = await PushNotifications.requestPermissions()
        if (permStatus.receive === 'granted') {
          // Listeners are bound once inside bindAndRegisterFCM; the token POST
          // happens in the shared 'registration' listener.
          await bindAndRegisterFCM()
        }
        setShowPrompt(false)
        return
      } else {
        // --- WEB PUSH LOGIC ---
        const result = await Notification.requestPermission()
        if (result !== "granted") {
          setShowPrompt(false)
          return
        }

        const reg = await navigator.serviceWorker.ready
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) {
          setShowPrompt(false)
          return
        }

        const urlBase64ToUint8Array = (base64String: string) => {
          const padding = '='.repeat((4 - base64String.length % 4) % 4)
          const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
          const rawData = window.atob(base64)
          const outputArray = new Uint8Array(rawData.length)
          for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i)
          }
          return outputArray
        }

        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        })

        const res = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            driverId: driverId,
            subscription: subscription.toJSON()
          })
        })

        if (res.ok) {
          toast.success("ลงทะเบียนรับแจ้งเตือนเรียบร้อยแล้ว")
        } else {
          const errData = await res.json().catch(() => ({}));
          toast.error(`ลงทะเบียนไม่สำเร็จ: ${errData.error || 'Unknown error'}`)
        }

        setShowPrompt(false)
      }
    } catch (err: unknown) {
      console.error("Push subscription error:", err)
      toast.error(`ข้อผิดพลาด: ${err instanceof Error ? err.message : 'ไม่สามารถเปิดแจ้งเตือนได้'}`)
      setShowPrompt(false)
    }
  }

  if (showDeniedPrompt) {
    return (
      <div className="fixed inset-x-4 bottom-28 z-[200] animate-in slide-in-from-bottom-8 duration-300">
        <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-lg">
          <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-xl bg-red-500/10 text-red-600 flex items-center justify-center border border-red-500/20">
                  <X size={32} />
              </div>

              <div className="space-y-1">
                  <h3 className="text-lg font-bold text-foreground">การแจ้งเตือนถูกปิดกั้น</h3>
                  <p className="text-muted-foreground text-xs leading-relaxed max-w-[240px]">
                      คุณได้ปฏิเสธการรับแจ้งเตือนไปก่อนหน้านี้ กรุณาเปิดรับแจ้งเตือนในระบบตั้งค่าของอุปกรณ์ เพื่อไม่ให้พลาดงานใหม่
                  </p>
              </div>
          </div>

          <Button
              className="w-full h-11 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold active:scale-95 transition-all"
              onClick={() => {
                  localStorage.setItem('tms_reminded_denied_push', 'true')
                  setShowDeniedPrompt(false)
              }}
          >
              รับทราบ
          </Button>
        </div>
      </div>
    )
  }

  if (!showPrompt) return null

  return (
    <div className="fixed inset-x-4 bottom-28 z-[200] animate-in slide-in-from-bottom-8 duration-300">
      <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-lg">
        <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20 relative">
                <Bell size={32} />
                <div className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-red-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold border border-card">
                    !
                </div>
            </div>

            <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground">แจ้งเตือนงานใหม่</h3>
                <p className="text-muted-foreground text-xs leading-relaxed max-w-[240px]">
                    เปิดแจ้งเตือนเพื่อให้คุณรับรู้งานใหม่ และสถานะงานได้ทันทีผ่านมือถือ
                </p>
            </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <Button
                variant="ghost"
                className="h-11 rounded-lg text-muted-foreground font-semibold hover:bg-muted/50 transition-all text-xs"
                onClick={() => { snoozePrompt(); setShowPrompt(false) }}
            >
                ไว้ก่อน
            </Button>
            <Button
                className="h-11 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold active:scale-95 transition-all text-xs"
                onClick={subscribeToPush}
            >
                เปิดเลย
            </Button>
        </div>
      </div>
    </div>
  )
}
