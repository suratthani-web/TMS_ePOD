"use client"

import { useState, useEffect } from "react"
import { motion, Variants } from "framer-motion"
import {
  Activity,
  TrendingUp,
  Truck,
  Leaf,
  LayoutGrid,
  Calendar,
  X,
  FileSpreadsheet
} from "lucide-react"
import { WeeklyShipmentChart } from "@/components/dashboard/charts/weekly-shipment-chart"
import { DriverTimelineScheduler } from "@/components/dashboard/driver-timeline-scheduler"
import { OrderBidding } from "@/components/logistics/order-bidding"
import { DailySummary } from "@/components/dashboard/daily-summary"
import { Job } from "@/lib/supabase/jobs"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"
import { RequestShipmentDialog } from "./request-shipment-dialog"
import { useRouter } from "next/navigation"
import { ExcelExport } from "@/components/ui/excel-export"

import { CustomerSummaryWidget } from "@/components/dashboard/customer-summary-widget"

const container: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05,
            delayChildren: 0.1
        }
    }
}

const item: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
}

interface DriverStatus {
    Driver_ID: string
    Driver_Name: string
    Vehicle_Plate: string
    Last_Update: string | null
    Latitude: number | null
    Longitude: number | null
}

interface DashboardClientProps {
    branchId: string
    customerMode: boolean
    customerId?: string
    userName?: string | null
    jobStats: {
        total: number
        delivered: number
        inProgress: number
        pending: number
        sos?: number
        totalQty?: number
    }
    driverStats: {
        total: number
        active: number
        onJob: number
    }
    sosCount: number
    fleetAlertsCount: number
    weeklyStats: {
        date: string
        total: number
        completed: number
    }[]
    fleetStatus: DriverStatus[] 
    marketplaceJobs: Job[]
    heatmapJobs?: any[]
    activeJobs?: any[]
    fleetHealth: number
    esg?: {
        fuelSaved: number
        co2Saved: number
        treesSaved: number
    }
    initialStart?: string
    initialEnd?: string
    allCustomers?: any[]
    isAdminUser?: boolean
    // ปิด = ซ่อนแผนที่ตำแหน่งรถ + ปุ่มติดตามสด บนหน้าลูกค้า (ตั้งค่ารายลูกค้า)
    showLiveTracking?: boolean
}

export function DashboardClient({ 
    branchId, 
    customerMode, 
    customerId,
    userName,
    jobStats, 
    driverStats,
    sosCount,
    fleetAlertsCount,
    weeklyStats, 
    marketplaceJobs,
    activeJobs = [],
    esg,
    initialStart = "",
    initialEnd = "",
    allCustomers = [],
    isAdminUser = false,
    showLiveTracking = true
}: DashboardClientProps) {
    // ลูกค้าที่ถูกปิดการแสดงตำแหน่งรถ → ซ่อนแผนที่ live + ปุ่มติดตามสด (แอดมินเห็นเสมอ)
    const hideLiveTracking = customerMode && !showLiveTracking
    const { t, language } = useLanguage()
    const router = useRouter()
    const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false)
    const [startDate, setStartDate] = useState(initialStart)
    const [endDate, setEndDate] = useState(initialEnd)
    const [isSyncing, setIsSyncing] = useState(false)
    // Sync local state if props change (e.g. navigation)
    useEffect(() => {
        setStartDate(initialStart)
        setEndDate(initialEnd)
    }, [initialStart, initialEnd])

    const handleSync = () => {
        setIsSyncing(true)
        const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
        if (startDate) params.set('start', startDate)
        else params.delete('start')
        
        if (endDate) params.set('end', endDate)
        else params.delete('end')
        
        router.push(`/dashboard?${params.toString()}`)
        setTimeout(() => setIsSyncing(false), 1000)
    }

    const handleReset = () => {
        setStartDate("")
        setEndDate("")
        const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
        params.delete('start')
        params.delete('end')
        router.push(`/dashboard?${params.toString()}`)
    }

    // Fallback to static values if data is not available
    const esgData = esg || { fuelSaved: 285, co2Saved: 1420, treesSaved: 68.2 }

    return (
        <div className="space-y-5 font-sans">
            <RequestShipmentDialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen} />

            {/* Row 1: Unified Compact Command Bar (Header + Date Range + Export) */}
            <div className="bg-card rounded-2xl border border-border shadow-sm px-5 py-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                {/* Left: Icon + Page Title + Branch Pill */}
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-primary/10 rounded-xl border border-primary/20 text-primary shrink-0">
                        <LayoutGrid size={18} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight truncate">
                            {customerMode ? `${t('navigation.dashboard')}: ${userName || 'User'}` : t('dashboard.title')}
                        </h1>
                        {!customerMode && (
                            <span className="px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold uppercase tracking-wider text-primary whitespace-nowrap">
                                {branchId || "Global"}
                            </span>
                        )}
                    </div>
                </div>

                {/* Right: Inline Start/End Dates, Reset, Sync & Excel Export */}
                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center gap-1.5 bg-muted/30 border border-border rounded-xl px-2.5 h-9 hover:border-primary/30 transition-all">
                        <Calendar size={13} className="text-muted-foreground shrink-0" />
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap">START:</span>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-xs font-bold text-foreground w-32 cursor-pointer p-0"
                        />
                    </div>
                    <div className="flex items-center gap-1.5 bg-muted/30 border border-border rounded-xl px-2.5 h-9 hover:border-primary/30 transition-all">
                        <Calendar size={13} className="text-muted-foreground shrink-0" />
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap">END:</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-xs font-bold text-foreground w-32 cursor-pointer p-0"
                        />
                    </div>

                    {(startDate || endDate) && (
                        <button
                            onClick={handleReset}
                            className="h-9 px-2.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl hover:bg-rose-500 hover:text-white transition-all flex items-center gap-1 text-[10px] font-black uppercase tracking-wider group/reset"
                            title="Reset Range"
                        >
                            <X size={14} className="group-hover/reset:rotate-90 transition-transform" />
                            <span>Reset</span>
                        </button>
                    )}

                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={cn(
                            "px-4 h-9 bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-primary/80 transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap",
                            isSyncing && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <Activity size={12} strokeWidth={3} />
                        {isSyncing ? (language === 'th' ? "กำลังดึงข้อมูล..." : "SYNCING...") : (language === 'th' ? "ดึงข้อมูล" : "SYNC DATA")}
                    </button>

                    <ExcelExport
                        data={weeklyStats.length ? weeklyStats : [{ message: "No data in selected range" }]}
                        filename="droutemind_dashboard_summary"
                        trigger={
                            <button className="px-4 h-9 bg-emerald-500/10 text-emerald-500 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-1.5 border border-emerald-500/20 shadow-sm whitespace-nowrap">
                                <FileSpreadsheet size={14} />
                                {language === 'th' ? "Export Excel" : "EXPORT"}
                            </button>
                        }
                    />
                </div>
            </div>

            {/* Row 2: KPI Summary Strip (DailySummary) */}
            <div className="w-full space-y-2.5">
                {jobStats.total === 0 && (
                    <div className="flex justify-center">
                        <div className="px-4 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full">
                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest italic">
                                {startDate || endDate
                                    ? (language === 'th' ? "ไม่พบงานในเวลาที่เลือก" : "No missions found for selected range")
                                    : (language === 'th' ? "ไม่มีงานที่กำหนดในวันนี้" : "No missions scheduled for today")}
                            </p>
                        </div>
                    </div>
                )}
                <DailySummary
                    stats={jobStats}
                    driverStats={driverStats}
                    biddingCount={marketplaceJobs.length}
                    sosCount={sosCount}
                    fleetAlertsCount={fleetAlertsCount}
                    customerMode={customerMode}
                />
            </div>

            {/* Ongoing missions (customer) — active jobs that carry across days */}
            {customerMode && !hideLiveTracking && activeJobs && activeJobs.length > 0 && (
                <button
                    onClick={() => router.push('/dashboard/tracking')}
                    className="w-full text-left group relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all shadow-sm p-4 flex items-center gap-4"
                >
                    <div className="relative z-10 shrink-0 w-12 h-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center shadow-sm">
                        <Truck size={22} strokeWidth={2.5} />
                    </div>
                    <div className="relative z-10 flex-1 min-w-0">
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.25em] mb-0.5 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            {language === 'th' ? "งานที่กำลังวิ่งอยู่" : "Missions On The Road"}
                        </p>
                        <p className="text-foreground font-bold text-sm tracking-tight leading-snug">
                            {language === 'th'
                                ? `มี ${activeJobs.length} งานที่กำลังดำเนินการ (รวมงานที่ค้างข้ามวัน) — แตะเพื่อติดตามสด`
                                : `${activeJobs.length} mission(s) in progress (including carry-over jobs) — tap to track live`}
                        </p>
                    </div>
                    <div className="relative z-10 shrink-0 text-right">
                        <p className="text-3xl font-black text-primary tracking-tighter leading-none">{activeJobs.length}</p>
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">
                            {language === 'th' ? "กำลังวิ่ง" : "Active"}
                        </p>
                    </div>
                </button>
            )}

            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="space-y-5"
            >
                {/* Row 3: Hero Workspace — DriverTimelineScheduler Full Width (12 Columns) */}
                {!hideLiveTracking && (
                    <motion.div variants={item} className="w-full min-h-[500px]">
                        <DriverTimelineScheduler
                            branchId={branchId || undefined}
                            customerId={customerId || undefined}
                            customerMode={customerMode}
                            initialJobs={activeJobs as Job[] | undefined}
                        />
                    </motion.div>
                )}

                {/* Row 4: Secondary Actionable Grid (6 + 6 Split) */}
                <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {!customerMode && (
                        <div className="lg:col-span-6 bg-card rounded-3xl border border-border shadow-sm overflow-hidden p-1">
                            <OrderBidding orders={marketplaceJobs} />
                        </div>
                    )}

                    <div className={cn(
                        "bg-card rounded-3xl border border-border shadow-sm overflow-hidden p-5 sm:p-6 group hover:border-primary/25 transition-all",
                        customerMode ? "lg:col-span-12" : "lg:col-span-6"
                    )}>
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <h3 className="text-base sm:text-lg font-black text-foreground tracking-tight flex items-center gap-2.5">
                                <div className="p-2 bg-primary/10 rounded-xl text-primary border border-primary/20">
                                    <TrendingUp size={18} />
                                </div>
                                {t('dashboard.growth_analytics')}
                            </h3>
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                {t('dashboard.performance_spectrum')}
                            </span>
                        </div>
                        <div className="text-foreground h-[260px]">
                            <WeeklyShipmentChart data={weeklyStats} />
                        </div>
                    </div>
                </motion.div>

                {/* Row 5: Tertiary / Bottom Summary */}
                {!customerMode && allCustomers && allCustomers.length > 0 && (
                    <motion.div variants={item}>
                        <CustomerSummaryWidget customers={allCustomers} isAdminUser={isAdminUser} />
                    </motion.div>
                )}

                {/* Compact 1-Row ESG Strip */}
                <motion.div
                    variants={item}
                    className="bg-card rounded-2xl border border-border shadow-sm px-5 py-3.5 flex flex-wrap items-center justify-between gap-4"
                >
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            <Leaf size={16} />
                        </div>
                        <span className="text-sm font-black text-foreground tracking-tight">
                            Green Logistics (ESG)
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-5 sm:gap-8">
                        <div className="flex items-baseline gap-2">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">CO2 Saved</span>
                            <span className="text-base font-black text-emerald-500 tracking-tight">
                                {esgData.co2Saved.toLocaleString()} kg
                            </span>
                        </div>
                        <div className="hidden sm:block w-px h-4 bg-border" />
                        <div className="flex items-baseline gap-2">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Trees Offset</span>
                            <span className="text-base font-black text-emerald-500 tracking-tight">
                                {(esgData.treesSaved || 0).toFixed(1)}
                            </span>
                        </div>
                        <div className="hidden sm:block w-px h-4 bg-border" />
                        <div className="flex items-baseline gap-2">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Fuel Saved</span>
                            <span className="text-base font-black text-emerald-500 tracking-tight">
                                {esgData.fuelSaved.toLocaleString()} L
                            </span>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    )
}
