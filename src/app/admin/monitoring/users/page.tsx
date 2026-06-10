"use client"

import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { usePresence } from "@/components/providers/presence-provider"
import { PremiumCard } from "@/components/ui/premium-card"
import { Activity, Shield, Users, Clock, MapPin, Globe } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"

export default function UserMonitorPage() {
    const { onlineUsers, user } = usePresence()
    const { t } = useLanguage()
    const [currentTime, setCurrentTime] = useState(new Date())

    const isSuper = user?.Role === 'Super Admin'
    const userBranch = user?.Branch_ID

    const filteredUsers = onlineUsers.filter(u => {
        if (isSuper) return true
        // If not super admin, only show users from the same branch
        return u.branch === userBranch
    })

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    return (
        <div className="space-y-8 p-4 lg:p-10">
            {/* Real-time Status Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-background/60 backdrop-blur-3xl p-8 rounded-3xl border border-border/5 shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
                
                <div className="relative z-10 space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-emerald-500/20 rounded-xl border-2 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)] text-emerald-400 group-hover:scale-110 transition-all duration-500">
                            <Globe size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-3xl lg:text-4xl font-black text-foreground uppercase leading-none italic premium-text-gradient">
                                LIVE_USER_MONITOR
                            </h1>
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-wide mt-1 opacity-80 italic">REAL-TIME SYSTEM PRESENCE TRACKING</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-end relative z-10">
                    <div className="text-2xl font-black text-foreground tabular-nums">{currentTime.toLocaleTimeString('th-TH')}</div>
                    <div className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{currentTime.toLocaleDateString('th-TH', { dateStyle: 'full' })}</div>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <PremiumCard className="p-6 bg-background/40 border-border/5">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-primary/10 rounded-xl text-primary">
                            <Users size={20} />
                        </div>
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest animate-pulse">Online</span>
                    </div>
                    <p className="text-muted-foreground text-xs font-black uppercase tracking-widest mb-1">Active Sessions ({isSuper ? 'GLOBAL' : 'BRANCH'})</p>
                    <p className="text-4xl font-black text-foreground">{filteredUsers.length}</p>
                </PremiumCard>

                <PremiumCard className="p-6 bg-background/40 border-border/5">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400">
                            <Shield size={20} />
                        </div>
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Security</span>
                    </div>
                    <p className="text-muted-foreground text-xs font-black uppercase tracking-widest mb-1">Active Admins</p>
                    <p className="text-4xl font-black text-foreground">
                        {filteredUsers.filter(u => u.role === 'Super Admin' || u.role === 'Admin').length}
                    </p>
                </PremiumCard>

                <PremiumCard className="p-6 bg-background/40 border-border/5">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
                            <Activity size={20} />
                        </div>
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Active</span>
                    </div>
                    <p className="text-muted-foreground text-xs font-black uppercase tracking-widest mb-1">Active Branches</p>
                    <p className="text-4xl font-black text-foreground">
                        {new Set(filteredUsers.map(u => u.branch)).size}
                    </p>
                </PremiumCard>
            </div>

            {/* User List */}
            <PremiumCard className="bg-background/40 border border-border/5 shadow-xl rounded-3xl overflow-hidden">
                <div className="p-6 border-b border-border/5 bg-black/40 flex items-center gap-4">
                    <Activity size={20} className="text-emerald-400 animate-pulse" />
                    <h2 className="text-lg font-black text-foreground tracking-normal uppercase italic">ACTIVE_USER_REGISTRY</h2>
                </div>

                <div className="relative w-full overflow-auto custom-scrollbar">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead>
                            <tr className="bg-black/20 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/5 italic">
                                <th className="px-8 py-4">USER_IDENTITY</th>
                                <th className="px-6 py-4">ROLE_CLASS</th>
                                <th className="px-6 py-4">OPERATIONAL_HUB</th>
                                <th className="px-6 py-4">SESSION_START</th>
                                <th className="px-8 py-4 text-right">STATUS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.02]">
                            {filteredUsers.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-20 opacity-30 italic font-black text-foreground">NO ACTIVE SESSIONS DETECTED</td></tr>
                            ) : (
                                filteredUsers.map((session, idx) => (
                                    <tr key={idx} className="group/row hover:bg-emerald-500/5 transition-all duration-300">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black">
                                                    {(session.name || session.username || '?').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-black text-foreground uppercase italic leading-none">{session.name || 'Unknown'}</div>
                                                    <div className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter mt-1">@{session.username}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className={cn(
                                                "px-3 py-1 rounded-lg border text-[10px] font-black uppercase italic w-fit",
                                                (session.role === 'Super Admin' || session.role === 'Admin') 
                                                    ? 'bg-primary/10 border-primary/20 text-primary shadow-[0_0_10px_rgba(255,30,133,0.1)]'
                                                    : 'bg-muted/50 border-border/10 text-muted-foreground'
                                            )}>
                                                {session.role || 'User'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-muted-foreground font-black uppercase text-xs">
                                                <MapPin size={12} className="text-emerald-400" />
                                                {session.branch || 'GLOBAL'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-muted-foreground font-black uppercase text-xs">
                                                <Clock size={12} />
                                                {session.online_at ? new Date(session.online_at).toLocaleTimeString('th-TH') : '-'}
                                            </div>
                                        </td>
                                        <td className="px-8 py-4 text-right">
                                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 text-[9px] font-black uppercase italic animate-pulse">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                Online Now
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </PremiumCard>
        </div>
    )
}
