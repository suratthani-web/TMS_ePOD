"use client"

import { useState, useEffect } from "react"
import { PWAInstallHint } from "@/components/mobile/pwa-install-hint"
import { Toaster } from "sonner"
import { AdminPushRequester } from "@/components/layout/admin-push-requester"
import { AdminGlobalNotifier } from "@/components/notifications/admin-global-notifier"

export function GlobalClientComponents() {
  const [adminUserId, setAdminUserId] = useState<string | null>(null)
  const [adminBranchId, setAdminBranchId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    const controller = new AbortController()

    const fetchAdminContext = async () => {
        try {
          const res = await fetch('/api/notifications', { signal: controller.signal })
          if (!res.ok) return
          const data = await res.json()
          
          if (data.userId) {
            setAdminUserId(data.userId)
            setAdminBranchId(data.branchId)
            setIsAdmin(data.isAdmin)
          }
        } catch (e) {
          if ((e as Error).name !== 'AbortError') {
            // Silently fail if not logged in or endpoint not ready
          }
        }
    }
    fetchAdminContext()

    return () => controller.abort()
  }, []) // Fix: Execute only once on mount

  if (!isMounted) return null

  return (
    <>
      <PWAInstallHint />
      <Toaster />
      <AdminPushRequester userId={adminUserId} />
      <AdminGlobalNotifier branchId={adminBranchId} isAdmin={isAdmin} />
    </>
  )
}

