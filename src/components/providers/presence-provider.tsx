"use client"

import { useEffect, createContext, useContext, useState, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { UserData } from "@/lib/actions/user-actions"

interface PresenceState {
    user: UserData | null
    onlineUsers: any[]
}

const PresenceContext = createContext<PresenceState>({ user: null, onlineUsers: [] })

import { useIdle } from "@/components/providers/idle-provider"

export function PresenceProvider({ children, user }: { children: React.ReactNode, user: UserData | null }) {
    const { isIdle } = useIdle()
    const [onlineUsers, setOnlineUsers] = useState<any[]>([])
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        if (!user || isIdle) return

        // Generate a unique session ID for this tab/instance
        const sessionId = Math.random().toString(36).substring(2, 10)
        
        console.log(`[Presence] Initializing for user: ${user.Username}, session: ${sessionId}`)

        const channel = supabase.channel('online-users', {
            config: {
                presence: {
                    key: `${user.Username}:${sessionId}`,
                },
            },
        })

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState()
                const users = Object.values(state).flat()
                console.log(`[Presence] Sync: ${users.length} users online`)
                setOnlineUsers(users)
            })
            .on('presence', { event: 'join' }, ({ newPresences }) => {
                console.log('[Presence] New users joined:', newPresences)
            })
            .on('presence', { event: 'leave' }, ({ leftPresences }) => {
                console.log('[Presence] Users left:', leftPresences)
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[Presence] Subscribed successfully, tracking...')
                    await channel.track({
                        username: user.Username,
                        name: user.Name,
                        role: user.Role,
                        branch: user.Branch_ID,
                        online_at: new Date().toISOString(),
                        session_id: sessionId
                    })
                } else {
                    console.warn(`[Presence] Subscription status: ${status}`)
                }
            })

        return () => {
            console.log('[Presence] Unsubscribing...')
            channel.unsubscribe()
        }
    }, [user, supabase])

    return (
        <PresenceContext.Provider value={{ user, onlineUsers }}>
            {children}
        </PresenceContext.Provider>
    )
}

export const usePresence = () => useContext(PresenceContext)
