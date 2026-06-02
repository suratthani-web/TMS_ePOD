"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bell, Info, CheckCircle2, AlertTriangle, XCircle, CheckCheck } from "lucide-react"
import { DriverNotification, markNotificationRead, markAllNotificationsRead } from "@/lib/actions/notification-actions"
import { createClient } from "@/utils/supabase/client"

interface NotificationsContentProps {
  notifications: DriverNotification[]
  driverId: string
}

export function NotificationsContent({ notifications: initialNotifications, driverId }: NotificationsContentProps) {
  const router = useRouter()
  const [notifications, setNotifications] = useState(initialNotifications)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const channel = supabase.channel('mobile-notifications-list')
      .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'Notifications',
          filter: `Driver_ID=eq.${driverId}`
      }, async () => {
          // Re-fetch to get complete formatted data with fallback ordering
          const { getDriverNotifications } = await import('@/lib/actions/notification-actions')
          const updated = await getDriverNotifications(driverId)
          setNotifications(updated)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [driverId])

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 size={16} className="text-emerald-400" />
      case 'warning': return <AlertTriangle size={16} className="text-amber-400" />
      case 'error': return <XCircle size={16} className="text-red-400" />
      default: return <Info size={16} className="text-emerald-500" />
    }
  }

  const handleMarkRead = async (id: number) => {
    await markNotificationRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, Is_Read: true } : n))
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead(driverId)
    setNotifications(prev => prev.map(n => ({ ...n, Is_Read: true })))
  }

  const unreadCount = notifications.filter(n => !n.Is_Read).length

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "เมื่อสักครู่"
    if (minutes < 60) return `${minutes} นาทีที่แล้ว`
    if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`
    if (days < 7) return `${days} วันที่แล้ว`
    return date.toLocaleDateString('th-TH')
  }

  return (
    <div className="space-y-4">
      {/* Header with mark all read */}
      {unreadCount > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-xl text-muted-foreground">ยังไม่อ่าน {unreadCount} รายการ</span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-emerald-500 hover:text-blue-300 h-7 text-lg font-bold"
            onClick={handleMarkAllRead}
          >
            <CheckCheck size={14} className="mr-1" />
            อ่านทั้งหมด
          </Button>
        </div>
      )}

      {notifications.length === 0 ? (
        <div className="text-center py-20">
          <Bell className="mx-auto text-gray-400 mb-3" size={48} />
          <p className="text-gray-400">ยังไม่มีการแจ้งเตือน</p>
        </div>
      ) : (
        notifications.map((notif) => (
          <div
            key={notif.id} 
            className="cursor-pointer active:scale-[0.98] transition-all"
            onClick={() => {
              if (!notif.Is_Read) handleMarkRead(notif.id)
              if (notif.Link) router.push(notif.Link)
            }}
          >
            <Card 
              className={`border-gray-200 ${
                notif.Is_Read 
                  ? 'bg-white/80' 
                  : 'bg-white border-l-4 border-l-blue-500'
              }`}
            >
              <CardContent className="p-4 flex gap-3">
                <div className="mt-1 bg-gray-100 p-2 rounded-full h-fit">
                  {getIcon(notif.Type)}
                </div>
                <div className="flex-1">
                  <h4 className={`font-medium ${notif.Is_Read ? 'text-gray-700' : 'text-foreground'}`}>
                    {notif.Title}
                  </h4>
                  <p className="text-xl text-muted-foreground mt-1">{notif.Message}</p>
                  <p className="text-lg font-bold text-gray-400 mt-2">{formatTime(notif.Created_At)}</p>
                </div>
                {!notif.Is_Read && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                )}
              </CardContent>
            </Card>
          </div>
        ))
      )}
    </div>
  )
}

