"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { hourTH, fmtDateTH } from "@/lib/utils/date-th"
import { Button } from "@/components/ui/button"
import {
    Truck, MapPin,
    Clock, Banknote, Package, CalendarCheck,
    ChevronRight, ArrowUpRight, ShieldCheck, CheckCircle2
} from "lucide-react"
import { EntityAvatar } from "@/components/ui/entity-avatar"
import { createClient } from "@/utils/supabase/client"
import { toast } from "sonner"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format, isToday, isTomorrow, parseISO } from "date-fns"
import { th } from "date-fns/locale"

type MobileDashboardJob = {
    Job_ID: string
    Customer_Name?: string | null
    Job_Status?: string | null
    Origin_Location?: string | null
    Dest_Location?: string | null
    Route_Name?: string | null
    Plan_Date?: string | null
    Cost_Driver_Total?: number | string | null
    Show_Price_To_Driver?: boolean | null
    Total_Drop?: number | string | null
    Signature_Url?: string | null
    Photo_Proof_Url?: string | null
}

interface DashboardClientProps {
    session: {
        driverId: string
        driverName: string
    }
    stats: {
        total: number
        completed: number
    }
    currentJob: {
        Job_ID: string
        Customer_Name: string
        Job_Status: string
        Origin_Location?: string
        Dest_Location?: string
        Route_Name?: string
        Pickup_Date?: string | null
        Delivery_Date?: string | null
    } | null
    activeJobs?: MobileDashboardJob[]
    gamification: {
        points: number
        rank: string
        nextRankPoints: number
        monthlyCompleted: number
    }
    todayIncome: number
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
}

const item = {
    hidden: { opacity: 0 },
    show: { opacity: 1 }
}

export function DashboardClient({ session, currentJob, activeJobs = [], gamification, todayIncome }: Omit<DashboardClientProps, 'stats'>) {
    const router = useRouter()
    const supabase = useMemo(() => createClient(), [])
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const greeting = useMemo(() => {
        const hour = hourTH()
        if (hour >= 5 && hour < 12) return "สวัสดีตอนเช้า"
        if (hour >= 12 && hour < 17) return "สวัสดีตอนบ่าย"
        return "สวัสดีตอนเย็น"
    }, [])

    const getJobDateInfo = (dateStr: string | null) => {
        if (!dateStr) return { label: "", type: 'other' }
        try {
            const date = parseISO(dateStr)
            const datePart = format(date, "d MMM", { locale: th })
            if (isToday(date)) return { label: `วันนี้ (${datePart})`, type: 'today' }
            if (isTomorrow(date)) return { label: `พรุ่งนี้ (${datePart})`, type: 'tomorrow' }
            return { label: datePart, type: 'other' }
        } catch {
            return { label: dateStr, type: 'other' }
        }
    }

    // Real-time Chat Notification for Driver
    useEffect(() => {
        if (!session.driverId) return

        const channel = supabase
            .channel('driver_chat_noti_dashboard')
            .on('postgres_changes', 
                { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'Chat_Messages', 
                    filter: `receiver_id=eq.${session.driverId}` 
                }, 
                (payload) => {
                    const newMsg = payload.new
                    if (newMsg.sender_id === 'admin') {
                        toast.info("ข้อความใหม่จากแอดมิน", {
                            description: newMsg.message.startsWith('[IMAGE]') ? '📷 ส่งรูปภาพ' : newMsg.message,
                            action: {
                                label: 'อ่านแชท',
                                onClick: () => router.push('/mobile/chat')
                            }
                        })
                        try { 
                            const audio = new Audio('/sounds/notification.mp3')
                            audio.play().catch(() => {}) 
                        } catch {}
                    }
                }
            ).subscribe()
        
        return () => { supabase.removeChannel(channel) }
    }, [session.driverId, supabase, router])

    const secondaryJobs = activeJobs.filter(j => j.Job_ID !== currentJob?.Job_ID)
    const isRolling = currentJob
        ? ['In Progress', 'In Transit', 'Arrived Pickup', 'Arrived Dropoff'].includes(currentJob.Job_Status)
        : false
    const rankPct = Math.min(100, Math.max(0, gamification.nextRankPoints > 0
        ? (gamification.points / gamification.nextRankPoints) * 100 : 0))
    const currentDrops = activeJobs.find(j => j.Job_ID === currentJob?.Job_ID)?.Total_Drop

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-4 pb-32 pt-[env(safe-area-inset-top)] px-4"
        >
            {/* IDENTITY + SHIFT: header merged into the payload */}
            <motion.div variants={item} className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Link href="/mobile/profile">
                            <EntityAvatar
                                kind="driver"
                                id={session.driverId}
                                name={session.driverName}
                                className="h-11 w-11 rounded-[13px] border-0 bg-foreground active:scale-95 transition-transform [&_span]:text-background [&_span]:text-sm"
                            />
                        </Link>
                        <div
                            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[2.5px] border-background"
                            style={{ background: 'var(--pd-go)' }}
                        />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-base font-bold text-foreground leading-tight truncate max-w-[190px]">
                            {session.driverName}
                        </h1>
                        <p className="text-muted-foreground text-[11px] font-medium mt-0.5">
                            {greeting} · พร้อมวิ่งงาน
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* LIVE STAT STRIP: real numbers, above the fold, merged into one card */}
            <motion.div
                variants={item}
                className="grid grid-cols-3 bg-card border border-border rounded-2xl overflow-hidden"
                style={{ boxShadow: 'var(--pd-lift-1)' }}
            >
                <div className="p-3.5" style={{ borderRight: '1px solid var(--pd-line-2)' }}>
                    <p className="text-muted-foreground text-[9.5px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Truck size={11} /> งานค้าง
                    </p>
                    <p className="text-[22px] font-bold text-foreground leading-none pd-num">{activeJobs.length}</p>
                </div>
                <div className="p-3.5" style={{ borderRight: '1px solid var(--pd-line-2)' }}>
                    <p className="text-muted-foreground text-[9.5px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Banknote size={11} /> รายได้วันนี้
                    </p>
                    <p className="text-[22px] font-bold text-foreground leading-none pd-num">
                        {todayIncome.toLocaleString()}<span className="text-sm text-muted-foreground font-semibold"> ฿</span>
                    </p>
                </div>
                <div className="p-3.5">
                    <p className="text-muted-foreground text-[9.5px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <CalendarCheck size={11} /> จบเดือนนี้
                    </p>
                    <p className="text-[22px] font-bold text-foreground leading-none pd-num">{gamification.monthlyCompleted}</p>
                </div>
            </motion.div>

            {/* CURRENT JOB */}
            <motion.div variants={item} className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--pd-hi)' }} />
                        {isRolling ? 'งานที่กำลังวิ่ง' : 'งานปัจจุบัน'}
                    </h2>
                    {activeJobs.length > 0 && (
                        <Link href="/mobile/jobs" className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: 'var(--pd-hi-ink)' }}>
                            คิวทั้งหมด <ChevronRight size={13} />
                        </Link>
                    )}
                </div>

                <AnimatePresence mode="wait">
                {currentJob ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-card rounded-2xl p-4 border border-border"
                        style={{ boxShadow: 'var(--pd-lift-2)' }}
                    >
                        <div className="flex items-center justify-between mb-2.5">
                            {isRolling ? (
                                <span
                                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                                    style={{ background: 'var(--pd-go-wash)', color: 'var(--pd-go)' }}
                                >
                                    <span className="pd-livedot" style={{ background: 'var(--pd-go)' }} />
                                    กำลังดำเนินการ
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                                    <Clock size={12} /> รอเริ่มงาน
                                </span>
                            )}
                            <span className="text-[12px] font-semibold text-muted-foreground pd-num">
                                #{String(currentJob.Job_ID).slice(-8).toUpperCase()}
                            </span>
                        </div>

                        <h4 className="text-[17px] font-bold text-foreground leading-tight mb-2.5">{currentJob.Customer_Name}</h4>

                        {/* route legs: pickup and dropoff as facts */}
                        <div className="flex gap-2 mb-3">
                            <div className="flex-1 rounded-xl p-2.5" style={{ background: 'var(--pd-paper)', border: '1px solid var(--pd-line-2)' }}>
                                <p className="text-[9.5px] uppercase tracking-wide font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                                    <span className="w-1.5 h-1.5 rounded-sm" style={{ background: 'var(--pd-go)' }} /> จุดรับ
                                </p>
                                <p className="text-[12.5px] font-semibold text-foreground truncate">{currentJob.Origin_Location || currentJob.Route_Name || '—'}</p>
                                {currentJob.Pickup_Date && (
                                    <p className="text-[11px] font-semibold text-muted-foreground mt-0.5 pd-num">{fmtDateTH(currentJob.Pickup_Date)}</p>
                                )}
                            </div>
                            <div className="flex-1 rounded-xl p-2.5" style={{ background: 'var(--pd-paper)', border: '1px solid var(--pd-line-2)' }}>
                                <p className="text-[9.5px] uppercase tracking-wide font-semibold text-muted-foreground flex items-center gap-1 mb-1">
                                    <span className="w-1.5 h-1.5 rounded-sm" style={{ background: 'var(--pd-hi)' }} /> จุดส่ง
                                </p>
                                <p className="text-[12.5px] font-semibold text-foreground truncate">{currentJob.Dest_Location || '—'}</p>
                                {currentJob.Delivery_Date && (
                                    <p className="text-[11px] font-semibold text-muted-foreground mt-0.5 pd-num">{fmtDateTH(currentJob.Delivery_Date)}</p>
                                )}
                            </div>
                        </div>

                        {currentDrops != null && Number(currentDrops) > 0 && (
                            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground mb-3">
                                <Package size={13} /> ทั้งหมด {Number(currentDrops)} จุดส่ง
                            </div>
                        )}

                        <Link href={`/mobile/jobs/${currentJob.Job_ID}`} className="block">
                            <Button
                                className="w-full h-12 rounded-xl text-primary-foreground font-bold text-sm active:scale-[0.98] transition-all gap-1.5 flex items-center justify-center"
                                style={{ background: 'var(--pd-hi)', boxShadow: '0 4px 12px rgba(232,100,26,.28)' }}
                            >
                                {isRolling ? 'ไปต่อที่งานนี้' : 'เริ่มจัดการงานนี้'} <ArrowUpRight className="w-4 h-4" />
                            </Button>
                        </Link>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-10 px-6 bg-card rounded-2xl"
                        style={{ border: '1px dashed var(--pd-line)' }}
                    >
                         <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--pd-paper)' }}>
                             <CheckCircle2 size={26} style={{ color: 'var(--pd-go)' }} />
                         </div>
                         <h3 className="text-foreground font-bold text-base mb-1">เคลียร์งานหมดแล้ว</h3>
                         <p className="text-muted-foreground text-xs">ยังไม่มีงานค้างในระบบ รอแอดมินจ่ายงานถัดไป</p>
                    </motion.div>
                )}
                </AnimatePresence>
            </motion.div>

            {/* QUEUE */}
            {secondaryJobs.length > 0 && (
                <motion.div variants={item} className="space-y-2.5 pt-1">
                    <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                        คิวถัดไป ({secondaryJobs.length})
                    </h2>
                    <div className="space-y-2">
                        {secondaryJobs.map((job, idx) => (
                            <Link key={job.Job_ID} href={`/mobile/jobs/${job.Job_ID}`}>
                                <div
                                    className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 active:scale-[0.98] transition-all"
                                    style={{ boxShadow: 'var(--pd-lift-1)' }}
                                >
                                    <div
                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-bold text-muted-foreground pd-num shrink-0"
                                        style={{ background: 'var(--pd-paper)', border: '1px solid var(--pd-line-2)' }}
                                    >
                                        {String(idx + 2).padStart(2, '0')}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="text-[13.5px] font-semibold text-foreground truncate">{job.Customer_Name || 'ไม่ระบุลูกค้า'}</h4>
                                        <p className="text-muted-foreground text-[11px] truncate pd-num">
                                            #{(job.Job_ID || '').slice(-6).toUpperCase()}{job.Route_Name ? ` · ${job.Route_Name}` : ''}
                                        </p>
                                    </div>
                                    {mounted && (() => {
                                        const dateInfo = getJobDateInfo(job.Plan_Date ?? null)
                                        if (!dateInfo.label) return null
                                        return (
                                            <span
                                                className="text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap shrink-0"
                                                style={
                                                    dateInfo.type === 'today'
                                                        ? { background: 'var(--pd-hi-wash)', color: 'var(--pd-hi-ink)' }
                                                        : dateInfo.type === 'tomorrow'
                                                        ? { background: 'var(--pd-paper)', color: 'var(--pd-ink-2)', border: '1px solid var(--pd-line)' }
                                                        : { background: 'var(--pd-paper)', color: 'var(--pd-ink-3)', border: '1px solid var(--pd-line-2)' }
                                                }
                                            >
                                                {dateInfo.label}
                                            </span>
                                        )
                                    })()}
                                </div>
                            </Link>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* RANK CARD */}
            <motion.div
                variants={item}
                className="bg-card border border-border rounded-2xl p-4 mt-1"
                style={{ boxShadow: 'var(--pd-lift-1)' }}
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: 'var(--pd-hi-wash)', color: 'var(--pd-hi-ink)' }}
                        >
                             <ShieldCheck size={19} />
                        </div>
                        <div>
                            <p className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wide leading-none mb-1">อันดับคนขับ</p>
                            <h4 className="text-sm font-bold text-foreground">{gamification.rank}</h4>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-bold leading-none pd-num" style={{ color: 'var(--pd-hi-ink)' }}>{gamification.points.toLocaleString()}</div>
                        <p className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">คะแนน</p>
                    </div>
                </div>
                <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--pd-line)' }}>
                    <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${rankPct}%`, background: 'var(--pd-hi)' }}
                    />
                </div>
                {gamification.nextRankPoints > gamification.points && (
                    <p className="text-[10.5px] text-muted-foreground mt-2 pd-num">
                        อีก {(gamification.nextRankPoints - gamification.points).toLocaleString()} คะแนนถึงอันดับถัดไป
                    </p>
                )}
            </motion.div>

        </motion.div>
    )
}
