"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { 
    Truck, MapPin, 
    Bell, Clock, Banknote, 
    ChevronRight, ArrowUpRight, ShieldCheck
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { createClient } from "@/utils/supabase/client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import Link from "next/link"
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
    const supabase = useMemo(() => createClient(), [])
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const greeting = useMemo(() => {
        const hour = new Date().getHours()
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
                                onClick: () => window.location.href = '/mobile/chat'
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
    }, [session.driverId, supabase])

    const secondaryJobs = activeJobs.filter(j => j.Job_ID !== currentJob?.Job_ID)

    return (
        <motion.div 
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-6 pb-32 pt-[env(safe-area-inset-top)] px-4"
        >
            {/* HEADER */}
            <motion.div variants={item} className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Link href="/mobile/profile">
                            <Avatar className="h-12 w-12 border border-border shadow-sm active:scale-95 transition-transform">
                                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${session.driverName}`} />
                                <AvatarFallback className="bg-primary/10 text-primary font-bold">{session.driverName?.charAt(0)}</AvatarFallback>
                            </Avatar>
                        </Link>
                        <div className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 w-3 h-3 rounded-full border-2 border-background" />
                    </div>
                    <div>
                        <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-0.5">
                            {greeting || "สวัสดีคุณ"}
                        </p>
                        <h1 className="text-lg font-bold text-foreground truncate max-w-[180px]">
                            {session.driverName}
                        </h1>
                    </div>
                </div>
            </motion.div>

            {/* KEY STATS */}
            <motion.div variants={item} className="grid grid-cols-2 gap-4">
                <div className="bg-card border border-border rounded-xl p-4 relative overflow-hidden shadow-sm">
                    <div className="relative z-10 space-y-1">
                        <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">งานที่ต้องทำ</p>
                        <div className="text-3xl font-bold text-foreground">
                            {activeJobs.length < 10 ? `0${activeJobs.length}` : activeJobs.length}
                        </div>
                    </div>
                    <div className="absolute -right-3 -bottom-3 opacity-5 text-muted-foreground">
                         <Truck size={64} />
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 relative overflow-hidden shadow-sm">
                    <div className="relative z-10 space-y-1">
                        <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">รายได้วันนี้</p>
                        <div className="text-3xl font-bold text-foreground">
                            ฿{todayIncome.toLocaleString()}
                        </div>
                    </div>
                    <div className="absolute -right-3 -bottom-3 opacity-5 text-muted-foreground">
                         <Banknote size={64} />
                    </div>
                </div>
            </motion.div>

            {/* CURRENT JOB */}
            <motion.div variants={item} className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-foreground uppercase flex items-center gap-2">
                        <div className="w-1 h-4 bg-primary rounded-full" />
                        งานปัจจุบัน
                    </h2>
                    {activeJobs.length > 0 && (
                        <Link href="/mobile/jobs" className="text-primary text-xs font-semibold flex items-center gap-1">
                            ดูทั้งหมด <ChevronRight size={14} />
                        </Link>
                    )}
                </div>

                <AnimatePresence mode="wait">
                {currentJob ? (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-card rounded-xl p-5 border border-border shadow-sm space-y-4 relative overflow-hidden"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                                    <Truck size={16} />
                                </div>
                                <span className="text-xs font-semibold text-muted-foreground">งานปัจจุบัน</span>
                            </div>
                            <div className={cn(
                                "px-2.5 py-0.5 rounded text-[10px] font-semibold",
                                ['In Progress', 'In Transit', 'Arrived Pickup', 'Arrived Dropoff'].includes(currentJob.Job_Status)
                                ? "bg-primary/10 text-primary border border-primary/20"
                                : "bg-muted text-muted-foreground"
                            )}>
                                {currentJob.Job_Status === 'Assigned' || currentJob.Job_Status === 'New' ? 'รอเริ่มงาน' : 'กำลังดำเนินการ'}
                            </div>
                        </div>

                        <div className="space-y-0.5">
                            <h4 className="text-lg font-bold text-foreground leading-tight">{currentJob.Customer_Name}</h4>
                            <p className="text-xs text-primary font-medium">#{String(currentJob.Job_ID).slice(-8).toUpperCase()}</p>
                        </div>

                        <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg border border-border/50">
                            <MapPin size={14} className="text-primary shrink-0" />
                            <p className="text-xs text-foreground truncate flex-1">
                                {currentJob.Dest_Location || currentJob.Route_Name}
                            </p>
                        </div>

                        <Link href={`/mobile/jobs/${currentJob.Job_ID}`} className="block">
                            <Button className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow-sm active:scale-95 transition-all gap-1.5 flex items-center justify-center">
                                จัดการงานนี้ <ArrowUpRight className="w-4 h-4" />
                            </Button>
                        </Link>
                    </motion.div>
                ) : (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-12 px-6 bg-card border border-dashed border-border rounded-xl"
                    >
                         <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                             <Truck size={28} className="text-muted-foreground/45" />
                         </div>
                         <h3 className="text-foreground font-bold text-lg mb-1">พร้อมรับงานใหม่?</h3>
                         <p className="text-muted-foreground text-xs">ขณะนี้คุณยังไม่มีภารกิจค้างในระบบ</p>
                    </motion.div>
                )}
                </AnimatePresence>
            </motion.div>

            {/* QUEUE */}
            {secondaryJobs.length > 0 && (
                <motion.div variants={item} className="space-y-3">
                    <h2 className="text-base font-bold text-foreground uppercase flex items-center gap-2">
                        <div className="w-1 h-4 bg-muted-foreground/30 rounded-full" />
                        คิวงานถัดไป ({secondaryJobs.length})
                    </h2>
                    <div className="space-y-3">
                        {secondaryJobs.map((job) => (
                            <Link key={job.Job_ID} href={`/mobile/jobs/${job.Job_ID}`}>
                                <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between active:scale-[0.98] transition-all shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
                                            <Clock size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-foreground">#{(job.Job_ID || '').slice(-6).toUpperCase()}</h4>
                                            <p className="text-muted-foreground text-xs truncate max-w-[180px]">
                                                {job.Customer_Name}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                        <div className="p-1.5 bg-muted/40 rounded-full">
                                            <ChevronRight size={16} className="text-muted-foreground" />
                                        </div>
                                        {mounted && (() => {
                                            const dateInfo = getJobDateInfo(job.Plan_Date ?? null)
                                            if (!dateInfo.label) return null
                                            return (
                                                <span className={cn(
                                                    "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                                                    dateInfo.type === 'today' ? "bg-emerald-500 text-white border-emerald-400" :
                                                    dateInfo.type === 'tomorrow' ? "bg-yellow-500 text-black border-yellow-400" :
                                                    "bg-primary/5 text-primary border-primary/10"
                                                )}>
                                                    {dateInfo.label}
                                                </span>
                                            )
                                        })()}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* RANK CARD */}
            <motion.div variants={item} className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shadow-sm">
                             <ShieldCheck size={20} />
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider leading-none mb-1">คะแนนสะสม</p>
                            <h4 className="text-sm font-bold text-foreground">{gamification.rank}</h4>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xl font-bold text-primary leading-none">{gamification.points}</div>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Points</p>
                    </div>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden border border-border">
                    <div 
                        className="h-full bg-amber-500 rounded-full transition-all duration-1000" 
                        style={{ width: `${(gamification.points / gamification.nextRankPoints) * 100}%` }} 
                    />
                </div>
            </motion.div>

        </motion.div>
    )
}
