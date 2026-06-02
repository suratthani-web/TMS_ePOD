"use client"

import { useState, useEffect, useMemo } from "react"
import { Bell } from "lucide-react"
import Link from "next/link"
import { RealtimeChannel } from "@supabase/supabase-js"
import { getDriverSession } from "@/lib/actions/auth-actions"
import { createClient } from "@/utils/supabase/client"

export function MobileNotificationBadge() {
  const [hasUnread, setHasUnread] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let isMounted = true

    async function init() {
      try {
        const session = await getDriverSession()
        if (!session || !isMounted) return
        
        const checkUnread = async () => {
          const { count } = await supabase
              .from('Notifications')
              .select('*', { count: 'exact', head: true })
              .eq('Driver_ID', session.driverId)
              .eq('Is_Read', false)
          
          if (isMounted) {
            setHasUnread(Number(count) > 0)
          }
        }
        
        await checkUnread()
        
        channel = supabase.channel('mobile-notifications-badge')
          .on('postgres_changes', { 
              event: '*', 
              schema: 'public', 
              table: 'Notifications',
              filter: `Driver_ID=eq.${session.driverId}`
          }, () => checkUnread())
          .subscribe()
      } catch {
        // Continue without logging
      }
    }
    
    init()
    
    return () => { 
      isMounted = false
      if (channel) supabase.removeChannel(channel) 
    }
  }, [])

  return (
    <Link href="/mobile/notifications" className="text-muted-foreground hover:text-foreground relative transition-colors">
        <Bell size={24} />
        {hasUnread && (
            <span className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-background animate-pulse" />
        )}
    </Link>
  )
}
