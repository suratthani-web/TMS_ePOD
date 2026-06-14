"use client"

import { MobileNotificationBadge } from "./notification-badge"
import { ChevronLeft, RefreshCcw } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import { useEffect, useRef, useTransition } from "react"
import { toast } from "sonner"

type Props = {
  title: string
  showBack?: boolean
  rightElement?: React.ReactNode
}

export function MobileHeader({ title, showBack, rightElement }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isRefreshing, startRefresh] = useTransition()
  const refreshRequestedRef = useRef(false)

  const handleRefresh = () => {
    // Stay pending until the server actually re-renders, so the toast is honest.
    refreshRequestedRef.current = true
    startRefresh(() => router.refresh())
  }

  useEffect(() => {
    if (!isRefreshing && refreshRequestedRef.current) {
      refreshRequestedRef.current = false
      toast.success("อัปเดตข้อมูลแล้ว", { duration: 1500, position: 'top-center' })
    }
  }, [isRefreshing])

  const isMainTab = ['/mobile/dashboard', '/mobile/jobs', '/mobile/profile', '/mobile/login'].includes(pathname)
  const shouldShowBack = showBack !== undefined ? showBack : !isMainTab

  const clearCache = async () => {
    if (!window.confirm("ล้างแคชแอปและโหลดใหม่? ใช้เมื่อแอปมีปัญหาเท่านั้น")) return
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
      // Also drop cached responses so stale pages aren't served after reload.
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    } catch {
      // ignore — reload regardless
    }
    window.location.reload()
  }

  return (
    <header className="fixed top-0 left-0 right-0 h-[calc(56px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] bg-background/80 backdrop-blur-2xl border-b border-border flex items-center justify-between px-6 z-[100] transition-colors duration-300">
      <div className="flex items-center gap-4">
        {shouldShowBack && (
            <button 
                onClick={() => router.back()}
                className="w-10 h-10 rounded-2xl bg-card border border-border flex items-center justify-center text-muted-foreground active:scale-95"
            >
                <ChevronLeft size={20} />
            </button>
        )}
        <div className="flex flex-col min-w-0">
            <h1 className="font-black text-accent text-xl tracking-tighter uppercase leading-none italic truncate">{title}</h1>
            <span 
                onClick={clearCache}
                className="text-[8px] font-black text-primary italic cursor-pointer hover:opacity-80 transition-opacity uppercase tracking-[0.2em] mt-0.5"
            >
                LOGIS-PRO v1.2.5
            </span>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-10 h-10 rounded-2xl bg-card border border-border flex items-center justify-center text-muted-foreground active:scale-95 transition-all disabled:opacity-50"
        >
            <RefreshCcw size={18} className={isRefreshing ? "animate-spin text-primary" : ""} />
        </button>

        {rightElement ? (
          rightElement
        ) : (
          <div className="w-10 h-10 rounded-2xl bg-muted/50 border border-border/10 flex items-center justify-center">
            <MobileNotificationBadge />
          </div>
        )}
      </div>
    </header>
  )
}

