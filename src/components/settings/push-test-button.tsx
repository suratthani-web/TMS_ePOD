"use client"

import { useState, useEffect } from "react"
import { Send, Loader2, ShieldCheck, AlertCircle, Bell } from "lucide-react"
import { PremiumButton } from "@/components/ui/premium-button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
// Note: Server actions are imported dynamically below to avoid build errors with server-only dependencies

interface Props {
  driverId?: string | null
  userId?: string | null
}

type PushDebug = {
  vapidConfigured?: boolean
  firebaseInitialized?: boolean
  envVapidPublic?: boolean
  envVapidPrivate?: boolean
}

export function PushTestButton({ driverId: initialDriverId, userId: initialUserId }: Props) {
  const [loading, setLoading] = useState(false)
  const [identifying, setIdentifying] = useState(!initialDriverId && !initialUserId)
  const [registering, setRegistering] = useState(false)
  const [userId, setUserId] = useState<string | null>(initialUserId || null)
  const [driverId, setDriverId] = useState<string | null>(initialDriverId || null)
  const [lastResult, setLastResult] = useState<{ success: boolean; reason?: string; debug?: PushDebug } | null>(null)

  // Helper for manual reg
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

  // Self-identify if props are missing
  useEffect(() => {
    if (initialDriverId || initialUserId) return;

    const identifyUser = async () => {
      try {
        const { getPushIdentityAction } = await import("@/lib/actions/auth-actions")
        const session = await getPushIdentityAction()
        if (session) {
          if (session.isDriver && session.driverId) {
            setDriverId(session.driverId)
          } else if (session.userId) {
            setUserId(session.userId)
          }
        }
      } catch (err) {
        console.error("Failed to identify user for push test:", err)
      } finally {
        setIdentifying(false)
      }
    }

    identifyUser()
  }, [initialDriverId, initialUserId])

  const handleRegister = async () => {
    try {
      setRegistering(true)
      const targetId = driverId || userId
      if (!targetId) {
          toast.error("ไม่สามารถระบุตัวตนของคุณได้")
          return
      }

      // 1. Request Browser Permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error("ไม่ได้รับสิทธิ์แจ้งเตือน กรุณาเปิดในการตั้งค่าเบราว์เซอร์")
        return
      }

      // 2. Register Service Worker (Standard check)
      const reg = await navigator.serviceWorker.ready
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
          toast.error("VAPID KEY is missing")
          return
      }

      // 3. Get/Create Subscription
      const existing = await reg.pushManager.getSubscription()
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      })

      // 4. Sync with server
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            userId: !driverId ? targetId : undefined, 
            driverId: driverId ? targetId : undefined,
            subscription: sub.toJSON() 
        })
      })

      if (res.ok) {
        toast.success("ลงทะเบียนเครื่องนี้เรียบร้อยแล้ว! ลองกดทดสอบอีกครั้งครับ")
        setLastResult(null) // clear error to encourage retest
      } else {
        toast.error("ไม่สามารถลงทะเบียนได้ในขณะนี้")
      }
    } catch (err) {
      console.error("Manual reg error:", err)
      toast.error("เกิดข้อผิดพลาดในการลงทะเบียนเครื่อง")
    } finally {
      setRegistering(false)
    }
  }

  const handleTest = async () => {
    if (identifying) return;

    if (!driverId && !userId) {
      toast.error("ไม่สามารถระบุตัวตนของคุณเพื่อส่งสัญญาณทดสอบได้")
      return
    }

    setLoading(true)
    setLastResult(null)
    
    try {
      // 1. Check browser support / permission first
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission !== 'granted') {
          toast.error("กรุณาเปิดสิทธื์การแจ้งเตือนในเบราว์เซอร์ก่อนทดสอบ")
          setLoading(false)
          return
        }
      }

      const { testPushNotification } = await import("@/lib/actions/push-actions")
      const result = await testPushNotification({ 
        driverId: driverId || undefined, 
        userId: userId || undefined 
      })

      setLastResult(result)
      
      if (result.success) {
        toast.success("ส่งสัญญาณทดสอบเรียบร้อยแล้ว! กรุณารอรับการแจ้งเตือนบนเครื่องของคุณ")
      } else {
        const errorMsg = result.reason === 'no_subscription' 
          ? "ไม่พบรหัสเครื่องในระบบ กรุณากดลงทะเบียนเครื่องก่อน" 
          : "ส่งไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต"
        toast.error(errorMsg)
      }
    } catch (err) {
      console.error("Test push error:", err)
      toast.error("ระบบขัดข้องในการส่งสัญญาณทดสอบ")
    } finally {
      setLoading(false)
    }
  }

  const btnDisabled = loading || identifying || registering;

  return (
    <div className="space-y-6">
      <PremiumButton
        onClick={handleTest}
        disabled={btnDisabled}
        variant="outline"
        className="w-full h-16 rounded-2xl border-primary/20 hover:border-primary/40 bg-primary/5 text-primary font-black uppercase tracking-widest italic group/test"
      >
        {loading || identifying ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Send className="w-5 h-5 group-hover/test:translate-x-1 group-hover/test:-translate-y-1 transition-transform" />
        )}
        <span className="ml-3">
          {identifying ? "กำลังระบุตัวตน..." : "ส่งสัญญาณทดสอบ (Push Test)"}
        </span>
      </PremiumButton>

      {lastResult && (
        <div className={cn(
          "p-6 rounded-2xl border-2 animate-in fade-in slide-in-from-top-2 duration-500",
          lastResult.success 
            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-500" 
            : "bg-rose-500/5 border-rose-500/20 text-rose-500"
        )}>
          <div className="flex items-center gap-4 mb-4">
            {lastResult.success ? <ShieldCheck size={24} /> : <AlertCircle size={24} />}
            <div className="text-sm font-bold uppercase tracking-tight">
              <p className="font-black italic">{lastResult.success ? 'SIGNAL_SENT: OK' : 'SIGNAL_FAILED'}</p>
              <p className="opacity-70 mt-1 leading-relaxed">
                {lastResult.success 
                  ? "สัญญาณถูกส่งจาก Server แล้ว หากไม่มีการแจ้งเตือนเด้งขึ้นมา ให้ตรวจสอบการตั้งค่า Browser หรือ PWA" 
                  : lastResult.reason === 'no_subscription' 
                    ? "เครื่องนี้ยังไม่ได้ลงทะเบียนรับแจ้งเตือนสำหรับผู้ใช้งานคนนี้" 
                    : "เกิดข้อผิดพลาดในการนำส่งสัญญาณ"}
              </p>
            </div>
          </div>

          {lastResult.debug && !lastResult.success && (
              <div className="mt-4 p-4 bg-black/20 rounded-xl font-mono text-[10px] space-y-1">
                  <p className="font-bold border-b border-white/10 pb-1 mb-2">DEBUG INFO (SERVER):</p>
                  <p>VAPID Config: {lastResult.debug.vapidConfigured ? '✅' : '❌'}</p>
                  <p>FCM Config: {lastResult.debug.firebaseInitialized ? '✅' : '❌'}</p>
                  <p>Public Key: {lastResult.debug.envVapidPublic ? '✅' : '❌'}</p>
                  <p>Private Key: {lastResult.debug.envVapidPrivate ? '✅' : '❌'}</p>
              </div>
          )}

          {!lastResult.success && lastResult.reason === 'no_subscription' && (
              <PremiumButton
                onClick={handleRegister}
                disabled={registering}
                variant="primary"
                className="w-full bg-rose-500 hover:bg-rose-600 text-white border-0 py-4 h-auto shadow-lg shadow-rose-500/25"
              >
                  {registering ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                      <Bell className="w-4 h-4 mr-2" />
                  )}
                  {registering ? "กำลังบันทึกรหัสเครื่อง..." : "คลิกเพื่อลงทะเบียนเครื่องนี้ใหม่"}
              </PremiumButton>
          )}
        </div>
      )}
    </div>
  )
}
