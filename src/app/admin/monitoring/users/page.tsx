"use client"

import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { usePresence, type PresenceUser } from "@/components/providers/presence-provider"
import { PremiumCard } from "@/components/ui/premium-card"
import { Activity, Shield, Users, Clock, MapPin, Globe, History } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"
import { getCustomerLoginHistory } from "@/lib/supabase/logs"
import { getUsers } from "@/lib/actions/user-actions"

type CustomerLogin = { username: string; name: string; branch: string | null; loginAt: string; ip: string | null }
type DedupedUser = PresenceUser & { tabCount: number }

const isAdminRole = (u: Pick<PresenceUser, 'role' | 'role_id'>) =>
    u.role_id === 1 ||
    u.role_id === 2 ||
    ['super admin', 'admin', 'branch admin', 'branch manager'].includes((u.role || '').trim().toLowerCase())

export default function UserMonitorPage() {
    const { onlineUsers, user } = usePresence()
    const { t } = useLanguage()
    const [currentTime, setCurrentTime] = useState(new Date())
    const [customerLogins, setCustomerLogins] = useState<CustomerLogin[]>([])
    const [avatarMap, setAvatarMap] = useState<Record<string, string>>({})
    const [brokenAvatars, setBrokenAvatars] = useState<Record<string, boolean>>({})

    // โหลดรูปโปรไฟล์ของ user ครั้งเดียวเพื่อใช้แสดงผลในตารางออนไลน์และประวัติลูกค้า
    useEffect(() => {
        let active = true
        getUsers()
            .then((list) => {
                if (!active || !Array.isArray(list)) return
                const map: Record<string, string> = {}
                for (const u of list) {
                    if (u?.Username && u?.Avatar_Url) {
                        map[String(u.Username).toLowerCase()] = u.Avatar_Url
                    }
                }
                setAvatarMap(map)
            })
            .catch(() => {})
        return () => { active = false }
    }, [])

    // ประวัติการเข้าใช้งานลูกค้า (จาก log จริง) — เชื่อถือได้ ไม่หายเมื่อปิดแท็บ
    useEffect(() => {
        let active = true
        const load = () => getCustomerLoginHistory(50).then(rows => { if (active) setCustomerLogins(rows) }).catch(() => {})
        load()
        const id = setInterval(load, 30000)
        return () => { active = false; clearInterval(id) }
    }, [])

    const isSuper = user?.Role_ID === 1 || (user?.Role || '').trim().toLowerCase() === 'super admin'
    const userBranch = user?.Branch_ID

    const filteredUsers = onlineUsers.filter(u => {
        if (isSuper) return true
        // If not super admin, only show users from the same branch
        return u.branch === userBranch
    })

    const dedupedUsers: DedupedUser[] = []
    const byKey = new Map<string, DedupedUser>()
    for (const u of filteredUsers) {
        const key = u.username ? u.username.trim().toLowerCase() : (u.session_id || `__anon_${dedupedUsers.length}`)
        const existing = byKey.get(key)
        if (!existing) {
            const entry: DedupedUser = { ...u, tabCount: 1 }
            byKey.set(key, entry)
            dedupedUsers.push(entry)
        } else {
            existing.tabCount += 1
            if (u.online_at && (!existing.online_at || u.online_at > existing.online_at)) {
                existing.online_at = u.online_at
            }
            if (!existing.avatar_url && u.avatar_url) existing.avatar_url = u.avatar_url
            if (!existing.name && u.name) existing.name = u.name
            if ((!existing.role || existing.role === 'User') && u.role) existing.role = u.role
            if (existing.role_id == null && u.role_id != null) existing.role_id = u.role_id
            if (!existing.branch && u.branch) existing.branch = u.branch
        }
    }

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
                    <p className="text-4xl font-black text-foreground">{dedupedUsers.length}</p>
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
                        {dedupedUsers.filter(isAdminRole).length}
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
                        {new Set(dedupedUsers.map(u => u.branch).filter(Boolean)).size}
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
                            {dedupedUsers.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-20 opacity-30 italic font-black text-foreground">NO ACTIVE SESSIONS DETECTED</td></tr>
                            ) : (
                                dedupedUsers.map((session, idx) => {
                                    const displayName = session.name || 'Unknown'
                                    const avatarKey = (session.username || '').trim().toLowerCase()
                                    const avatarUrl = session.avatar_url || avatarMap[avatarKey]
                                    const showAvatar = Boolean(avatarUrl && !brokenAvatars[avatarUrl])
                                    return (
                                    <tr key={session.username || session.session_id || idx} className="group/row hover:bg-emerald-500/5 transition-all duration-300">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black">
                                                    {showAvatar && avatarUrl ? (
                                                        <img
                                                            src={avatarUrl}
                                                            alt={displayName}
                                                            className="w-full h-full object-cover"
                                                            onError={() => setBrokenAvatars(prev => ({ ...prev, [avatarUrl]: true }))}
                                                        />
                                                    ) : (
                                                        (session.name || session.username || '?').charAt(0).toUpperCase()
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-black text-foreground uppercase italic leading-none">{displayName}</div>
                                                    <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-tighter mt-1">
                                                        <span>@{session.username}</span>
                                                        {session.tabCount > 1 && (
                                                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 normal-case tracking-normal">
                                                                {session.tabCount} แท็บ
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className={cn(
                                                "px-3 py-1 rounded-lg border text-[10px] font-black uppercase italic w-fit",
                                                isAdminRole(session)
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
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </PremiumCard>

            {/* ประวัติการเข้าใช้งานลูกค้า (จาก System_Logs — ย้อนหลังได้) */}
            <PremiumCard className="bg-background/40 border border-border/5 shadow-xl rounded-3xl overflow-hidden">
                <div className="p-6 border-b border-border/5 bg-black/40 flex items-center gap-4">
                    <History size={20} className="text-indigo-400" />
                    <h2 className="text-lg font-black text-foreground tracking-normal uppercase italic">CUSTOMER_ACCESS_HISTORY</h2>
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">ประวัติการเข้าใช้งานลูกค้า</span>
                </div>

                <div className="relative w-full overflow-auto custom-scrollbar">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead>
                            <tr className="bg-black/20 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/5 italic">
                                <th className="px-8 py-4">ลูกค้า</th>
                                <th className="px-6 py-4">สาขา</th>
                                <th className="px-6 py-4">เข้าใช้งานล่าสุด</th>
                                <th className="px-6 py-4">IP</th>
                                <th className="px-8 py-4 text-right">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.02]">
                            {customerLogins.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-16 opacity-30 italic font-black text-foreground">ยังไม่มีประวัติการเข้าใช้งานของลูกค้า</td></tr>
                            ) : (
                                customerLogins.map((c, idx) => {
                                    const recent = (Date.now() - new Date(c.loginAt).getTime()) < 15 * 60 * 1000
                                    const displayName = c.name || c.username || '?'
                                    const avatarKey = (c.username || '').trim().toLowerCase()
                                    const avatarUrl = avatarMap[avatarKey]
                                    const showAvatar = Boolean(avatarUrl && !brokenAvatars[avatarUrl])
                                    return (
                                        <tr key={idx} className="group/row hover:bg-indigo-500/5 transition-all duration-300">
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-gradient-to-br from-indigo-500/20 to-indigo-500/5 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-black">
                                                        {showAvatar && avatarUrl ? (
                                                            <img
                                                                src={avatarUrl}
                                                                alt={displayName}
                                                                className="w-full h-full object-cover"
                                                                onError={() => setBrokenAvatars(prev => ({ ...prev, [avatarUrl]: true }))}
                                                            />
                                                        ) : (
                                                            displayName.charAt(0).toUpperCase()
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-foreground uppercase italic leading-none">{c.name}</div>
                                                        <div className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter mt-1">@{c.username}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-muted-foreground font-black uppercase text-xs">
                                                    <MapPin size={12} className="text-indigo-400" />
                                                    {c.branch || 'GLOBAL'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-muted-foreground font-black text-xs">
                                                    <Clock size={12} />
                                                    {new Date(c.loginAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-[10px] font-mono text-muted-foreground">{c.ip || '-'}</span>
                                            </td>
                                            <td className="px-8 py-4 text-right">
                                                {recent ? (
                                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 text-[9px] font-black uppercase italic">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                        เพิ่งเข้าใช้งาน
                                                    </div>
                                                ) : (
                                                    <span className="text-[9px] font-black text-muted-foreground uppercase italic opacity-60">เข้าใช้งานแล้ว</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </PremiumCard>
        </div>
    )
}
