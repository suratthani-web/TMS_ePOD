"use client"

import { useState, useEffect } from "react"
import { LogOut, Loader2 } from "lucide-react"
import { getUserProfile, UserProfile } from "@/lib/supabase/users"
import Image from "next/image"
import { cn } from "@/lib/utils"

export function SidebarProfile({ collapsed }: { collapsed: boolean }) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
        try {
            const data = await getUserProfile()
            setProfile(data)
        } catch {
            // Continue without logging
        } finally {
            setLoading(false)
        }
    }
    load()
  }, [])

  if (loading) return (
    <div className={`flex items-center gap-4 p-4 rounded-2xl bg-muted border border-border ${collapsed ? 'justify-center' : ''}`}>
        <Loader2 className="animate-spin text-primary" size={20} />
    </div>
  )

  const displayName = profile 
    ? `${profile.First_Name || ""} ${profile.Last_Name || ""}`.trim() || profile.Username 
    : "User"
  
  const role = profile?.Role || "Staff"
  const avatarUrl = profile?.Avatar_Url

  return (
    <div className={cn(
        "flex items-center gap-4 p-4 rounded-3xl bg-muted border border-border relative overflow-hidden group transition-all hover:bg-muted/80 hover:border-primary/20",
        collapsed ? "justify-center p-3" : ""
    )}>
      {/* Visual Accent */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-primary opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-tr from-primary to-accent p-[2px] shadow-lg shadow-primary/10 transition-transform group-hover:scale-105 shrink-0 overflow-hidden">
        <div className="w-full h-full rounded-[inherit] bg-background flex items-center justify-center text-foreground overflow-hidden relative">
            {avatarUrl ? (
                <Image src={avatarUrl} alt={displayName} fill className="object-cover" />
            ) : (
                <span className="font-black text-lg tracking-tighter">{(displayName || "U").charAt(0).toUpperCase()}</span>
            )}
        </div>
      </div>
      
      {!collapsed && (
        <div className="flex-1 min-w-0">
          <p className="text-xl font-black text-foreground truncate tracking-tight">{displayName}</p>
          <p className="text-sm font-bold text-primary truncate mt-0.5">{role}</p>
        </div>
      )}

      {!collapsed && (
        <button 
          onClick={() => window.location.href = '/api/auth/logout'}
          className="p-2.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all active:scale-90"
          title="Sign Out"
        >
          <LogOut size={18} strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}

