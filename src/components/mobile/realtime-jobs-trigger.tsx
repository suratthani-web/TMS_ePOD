"use client"

import { useEffect, useRef, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"

const REFRESH_THROTTLE = 10000 // 10 seconds

export function RealtimeJobsTrigger({ driverId }: { driverId: string }) {
    const router = useRouter()
    const supabase = useMemo(() => createClient(), [])
    const lastRefreshRef = useRef(0)

    useEffect(() => {
        if (!driverId) return

        const channel = supabase
            .channel(`driver_jobs_${driverId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'Jobs_Main',
                    filter: `Driver_ID=eq.${driverId}`
                },
                (payload) => {
                    console.log('Real-time job change detected:', payload)
                    
                    const isNewJob = payload.eventType === 'INSERT'
                    const isAssignment = payload.eventType === 'UPDATE' && payload.new.Driver_ID === driverId && !payload.old.Driver_ID

                    if (isNewJob || isAssignment) {
                        import("sonner").then(({ toast }) => {
                            toast.success("มีงานใหม่เข้า! รายการอัปเดตแล้ว", {
                                description: `เลขงาน: ${payload.new.Job_ID}`,
                                duration: 5000,
                            })
                        })
                    }

                    // Trigger a server component refresh with throttle
                    const now = Date.now()
                    if (now - lastRefreshRef.current > REFRESH_THROTTLE) {
                        lastRefreshRef.current = now
                        router.refresh()
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [driverId, router])

    return null
}
