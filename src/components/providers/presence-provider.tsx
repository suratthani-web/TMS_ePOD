"use client"

import { useEffect, createContext, useContext, useState, useMemo } from "react"
import { createClient } from "@/utils/supabase/client"
import { UserData } from "@/lib/actions/user-actions"

interface PresenceState {
    user: UserData | null
    onlineUsers: PresenceUser[]
}

const PresenceContext = createContext<PresenceState>({ user: null, onlineUsers: [] })

export type PresenceUser = {
    username?: string
    name?: string
    role?: string
    role_id?: number | null
    branch?: string | null
    avatar_url?: string | null
    online_at?: string
    session_id?: string
}

function resolveRoleLabel(role?: string | null, roleId?: number | null): string {
    if (role?.trim()) return role.trim()
    switch (roleId) {
        case 1: return 'Super Admin'
        case 2: return 'Admin'
        case 3: return 'Executive'
        case 4: return 'Accountant'
        case 5: return 'Staff'
        case 6: return 'Driver'
        case 7: return 'Customer'
        default: return 'User'
    }
}

export function PresenceProvider({ children, user }: { children: React.ReactNode, user: UserData | null }) {
    const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        if (!user) {
            setOnlineUsers([])
            return
        }

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
                const users = Object.values(state).flat() as PresenceUser[]
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
                        role: resolveRoleLabel(user.Role, user.Role_ID),
                        role_id: user.Role_ID ?? null,
                        branch: user.Branch_ID,
                        avatar_url: user.Avatar_Url && !user.Avatar_Url.startsWith('data:') ? user.Avatar_Url : null,
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
