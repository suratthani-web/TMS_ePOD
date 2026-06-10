"use client"

import { Fuel, Wrench, ClipboardCheck, Bell, Settings, ChevronRight, LogOut, AlertTriangle, User, Banknote, BookOpen, LayoutGrid, Star, Calendar, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { logoutDriver } from "@/lib/actions/auth-actions"
import { cn } from "@/lib/utils"

interface ProfileContentProps {
  session: {
    driverId: string
    driverName: string
    role?: string
  }
  score?: {
    totalScore: number
    onTimeScore: number
    safetyScore: number
    acceptanceScore: number
  }
  unreadChatCount?: number
}

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform: () => boolean
  }
}

type PushTestResult = {
  subCount: number
  subType: string
}

type ProfileMenuItem = {
  icon: typeof Bell
  label: string
  href?: string
  action?: () => void | Promise<void>
  color?: string
  badge?: number
}

export function ProfileContent({ session, score, unreadChatCount = 0 }: ProfileContentProps) {

  const handleSubscribePush = async () => {
    try {
      // 1. Check for Capacitor (Native APK)
      const isCapacitor = (window as CapacitorWindow).Capacitor?.isNativePlatform();
      
      if (isCapacitor) {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          
          let perm = await PushNotifications.checkPermissions();
          if (perm.receive !== 'granted') {
              perm = await PushNotifications.requestPermissions();
          }
          
          if (perm.receive !== 'granted') {
              toast.error("คุณไม่ได้อนุญาตการแจ้งเตือนในระบบ Android");
              return;
          }

          // Important: Add listeners BEFORE register()
          PushNotifications.removeAllListeners();
          
          PushNotifications.addListener('registration', async (token) => {
              console.log("[APK] Push registered:", token.value);
              const res = await fetch('/api/push/subscribe', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      driverId: session.driverId,
                      subscription: {
                          endpoint: token.value,
                          isFCM: true
                      }
                  })
              });
              if (res.ok) toast.success("ลงทะเบียน APK สำเร็จ! ตอนนี้คุณสามารถรับงานได้แล้ว");
              else toast.error("บันทึก Token ไม่สำเร็จ");
          });

          PushNotifications.addListener('registrationError', (err) => {
              toast.error("เกิดข้อผิดพลาด APK Registration: " + err.error);
          });

          await PushNotifications.register();
          return;
      }

      // 2. Fallback to Web Push (PWA)
      if (!("Notification" in window)) {
        toast.error("เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน")
        return
      }

      const result = await Notification.requestPermission()
      if (result !== "granted") {
        toast.error("คุณต้องอนุญาตการแจ้งเตือนก่อนใช้งาน")
        return
      }

      const reg = await navigator.serviceWorker.ready
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        toast.error("ระบบขัดข้อง: VAPID Key Missing")
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
          driverId: session.driverId,
          subscription: subscription.toJSON()
        })
      })

      if (res.ok) {
        toast.success("เปิดการแจ้งเตือน PWA เรียบร้อยแล้ว!")
      } else {
        toast.error("บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
      }
    } catch (error: unknown) {
      const err = error as Error
      console.error(err)
      toast.error(err.message || "เกิดข้อผิดพลาดในการเปิดแจ้งเตือน")
    }
  }

  const handleTestPush = async () => {
    toast.promise(
      async () => {
        const { testPushNotification } = await import('@/lib/actions/push-actions')
        const result = await testPushNotification({ driverId: session.driverId })
        if (!result.success) throw new Error(result.reason || 'Failed')
        return {
          subCount: result.subCount ?? 0,
          subType: result.subType ?? 'unknown',
        }
      },
      {
        loading: 'กำลังส่งสัญญาณทดสอบ...',
        success: (result: PushTestResult) => {
          if (result.subCount === 0) return '❌ ไม่พบการลงทะเบียนแจ้งเตือน'
          return `ส่งสัญญาณแล้ว! พบ ${result.subCount} อุปกรณ์ (${result.subType})`
        },
        error: (err) => `ส่งไม่สำเร็จ: ${err.message}`
      }
    )
  }

  const menuGroups: { title: string; items: ProfileMenuItem[] }[] = [
    {
      title: "การสื่อสารและการแจ้งเตือน",
      items: [
        { icon: Bell, label: "เปิดรับการแจ้งเตือนงาน", action: handleSubscribePush, color: 'text-primary' },
        { icon: Bell, label: "🧪 ทดสอบระบบแจ้งเตือน", action: handleTestPush, color: 'text-emerald-600 dark:text-emerald-400' },
        { icon: Bell, label: "ประวัติการแจ้งเตือน", href: "/mobile/notifications" },
        { icon: User, label: "แชทกับแอดมิน", href: "/mobile/chat", badge: unreadChatCount },
      ]
    },
    {
      title: "ศูนย์ปฏิบัติการ",
      items: [
        { icon: LayoutGrid, label: "รับงานกลาง (ประมูล)", href: "/mobile/marketplace" },
        { icon: Star, label: "คะแนนและผลงาน", href: "/mobile/kpi" },
        { icon: Banknote, label: "รายได้และเบี้ยเลี้ยง", href: "/mobile/income-summary" },
        { icon: Wrench, label: "แจ้งซ่อม/แจ้งเสีย", href: "/mobile/maintenance" },
        { icon: Fuel, label: "แจ้งเติมน้ำมัน", href: "/mobile/fuel" },
        { icon: ClipboardCheck, label: "ตรวจเช็คสภาพรถ", href: "/mobile/vehicle-check" },
      ]
    },
    {
      title: "รายงานเหตุ",
      items: [
        { icon: ShieldAlert, label: "แจ้งสินค้าเสียหาย", href: "/mobile/damage-report" },
        { icon: Calendar, label: "แจ้งลางาน", href: "/mobile/leave" },
        { icon: AlertTriangle, label: "แจ้งเหตุฉุกเฉิน (SOS)", href: "/mobile/sos", color: 'text-red-600 dark:text-red-400' },
      ]
    },
    {
      title: "ระบบ",
      items: [
        { icon: BookOpen, label: "คู่มือการใช้งาน", href: "/mobile/manual" },
        { icon: Settings, label: "ตั้งค่าระบบ", href: "/mobile/settings" },
      ]
    }
  ]

  const handleItemClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href === "#") {
      e.preventDefault()
      toast.info("ฟีเจอร์นี้กำลังอยู่ในระหว่างการพัฒนาครับ")
    }
  }

  const handleLogout = async () => {
    // Clear session recovery data
    localStorage.removeItem("logis_driver_session_v1")
    await logoutDriver()
  }

  return (
    <div className="px-4 py-2 space-y-4">
      <Card className="bg-card border border-border shadow-sm">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 border border-border shadow-sm">
              <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${session.driverName}`} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {session?.driverName?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-foreground truncate">{session.driverName}</h1>
              <p className="text-xs text-primary font-semibold">รหัสพนักงาน: {session.driverId}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border border-border shadow-sm overflow-hidden">
        <CardContent className="py-4">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h2 className="text-sm font-bold text-foreground">ผลการทำงาน</h2>
                    <p className="text-muted-foreground text-[10px]">สรุปในรอบ 30 วันที่ผ่านมา</p>
                </div>
                <div className={`w-12 h-12 rounded-full flex flex-col items-center justify-center border-2 ${
                    (score?.totalScore || 0) >= 80 ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' :
                    (score?.totalScore || 0) >= 60 ? 'border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-500/10' :
                    'border-red-500 text-red-600 dark:text-red-400 bg-red-500/10'
                }`}>
                    <span className="text-sm font-bold">{score?.totalScore || 0}</span>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center divide-x divide-border">
                <div className="px-1">
                   <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider block">ส่งตรงเวลา</span>
                   <p className={cn(
                       "text-xs font-bold mt-0.5",
                       (score?.onTimeScore || 0) >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                   )}>{score?.onTimeScore || 0}%</p>
                </div>
                <div className="px-1">
                   <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider block">ขับขี่ปลอดภัย</span>
                   <p className="text-xs font-bold mt-0.5 text-foreground">{score?.safetyScore || 0}%</p>
                </div>
                <div className="px-1">
                   <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider block">อัตราการรับงาน</span>
                   <p className={cn(
                       "text-xs font-bold mt-0.5",
                       (score?.acceptanceScore || 0) >= 90 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                   )}>{score?.acceptanceScore || 0}%</p>
                </div>
            </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {menuGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="space-y-1.5">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1">{group.title}</h3>
            <Card className="bg-card border border-border shadow-sm">
              <CardContent className="py-1 px-3">
                {group.items.map((rawItem, index) => {
                  const item = rawItem
                  const Content = (
                    <div className="flex items-center justify-between py-3 border-b border-border last:border-0 active:bg-muted/50 transition-colors w-full text-left">
                      <div className="flex items-center gap-3 text-foreground">
                        <item.icon className={`w-4 h-4 ${item.color || 'text-muted-foreground'}`} />
                        <span className="text-xs font-medium">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.badge && item.badge > 0 && (
                          <span className="bg-primary text-primary-foreground font-semibold px-2 py-0.5 rounded-full min-w-[18px] text-[9px] text-center shadow-sm">
                            {item.badge}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  )

                  if ('action' in item) {
                    return (
                      <button 
                        key={index} 
                        onClick={item.action}
                        className="w-full disabled:opacity-50"
                      >
                        {Content}
                      </button>
                    )
                  }

                  return (
                    <Link 
                      key={index} 
                      href={item.href || "#"}
                      onClick={(e) => handleItemClick(e, item.href || "#")}
                      className="block w-full"
                    >
                      {Content}
                    </Link>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        ))}
      </div>

      <div className="pt-4 pb-12">
        <Button 
          variant="outline" 
          onClick={handleLogout}
          className="w-full border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-600 transition-colors h-11"
        >
          <LogOut className="w-4 h-4 mr-2" />
          ออกจากระบบ
        </Button>
      </div>
    </div>
  )
}
