"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { getUserProfile } from "@/lib/supabase/users"
import { PresenceProvider } from "./presence-provider"
import { UserData } from "@/lib/actions/user-actions"

export function UserPresenceFetcher({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const [user, setUser] = useState<UserData | null>(null)
    const [, setLoading] = useState(true)

    useEffect(() => {
        let active = true

        if (pathname === '/login') {
            setUser(null)
            setLoading(false)
            return () => { active = false }
        }

        if (user) {
            setLoading(false)
            return () => { active = false }
        }

        async function loadUser() {
            try {
                const profile = await getUserProfile()
                if (active) {
                    setUser(profile ? (profile as unknown as UserData) : null)
                }
            } catch (error) {
                console.error("Failed to load user for presence:", error)
            } finally {
                if (active) setLoading(false)
            }
        }
        loadUser()

        return () => { active = false }
    }, [pathname, user])

    return (
        <PresenceProvider user={user}>
            {children}
        </PresenceProvider>
    )
}
