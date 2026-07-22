"use client"

import { useState, useEffect } from "react"
import { motion, Variants } from "framer-motion"
import {
  Activity,
  TrendingUp,
  Truck,
  Leaf,
  LayoutGrid,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  X,
  FileSpreadsheet,
  Users,
  Star,
  Check
} from "lucide-react"
import { WeeklyShipmentChart } from "@/components/dashboard/charts/weekly-shipment-chart"
import { DashboardMap } from "@/components/dashboard/dashboard-map"
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
}

export function DashboardClient({ 
    branchId, 
    customerMode, 
    userName,
    jobStats, 
    driverStats,
    sosCount,
    fleetAlertsCount,
    weeklyStats, 
    fleetStatus,
    marketplaceJobs,
    heatmapJobs = [],
    activeJobs = [],
    fleetHealth,
    esg,
    initialStart = "",
    initialEnd = "",
    allCustomers = [],
    isAdminUser = false
}: DashboardClientProps) {
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
        <div className="space-y-12 font-sans">
            <RequestShipmentDialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen} />
            
            {/* Date Range Selector - SERVER SYNCED */}
            <div className="mb-6 flex flex-col md:flex-row items-center justify-between gap-4 bg-background p-3 rounded-2xl border border-border shadow-sm group">
                
                <div className="flex items-center gap-3 relative z-10">
                    <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20 text-primary">
                        <Calendar size={18} />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-foreground tracking-widest uppercase leading-none">
                            {language === 'th' ? "ช่วงเวลาข้อมูล" : "Date Range"}
                        </h3>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] leading-none mt-1">
                            {language === 'th' ? "วิเคราะห์ข้อมูลประวัติการขนส่ง" : "Analyze historical transit data"}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 relative z-10 w-full md:w-auto">
                    <div className="flex items-center gap-2 w-full sm:w-48 bg-muted/30 border border-border rounded-xl px-3 h-10 hover:border-primary/30 transition-all group/input">
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap">START:</span>
                        <input 
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-xs font-bold text-foreground w-full cursor-pointer"
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-48 bg-muted/30 border border-border rounded-xl px-3 h-10 hover:border-primary/30 transition-all group/input">
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest whitespace-nowrap">END:</span>
                        <input 
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-xs font-bold text-foreground w-full cursor-pointer"
                        />
                    </div>
                    
                    {(startDate || endDate) && (
                        <button 
                            onClick={handleReset}
                            className="p-2 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl hover:bg-rose-500 hover:text-white transition-all group/reset"
                            title="Reset Range"
                        >
                            <X size={16} className="group-hover/reset:rotate-90 transition-transform" />
                        </button>
                    )}
                    
                    <button 
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={cn(
                            "px-5 h-10 bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-primary/80 transition-all flex items-center gap-2 shadow-sm",
                            isSyncing && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        <Activity size={12} strokeWidth={3} />
                        {isSyncing ? (language === 'th' ? "กำลังดึงข้อมูล..." : "SYNCING...") : (language === 'th' ? "ดึงข้อมูล" : "SYNC DATA")}
                    </button>
                </div>

                <ExcelExport 
                    data={weeklyStats.length ? weeklyStats : [{ message: "No data in selected range" }]}
                    filename="logispro_dashboard_summary"
                    trigger={
                        <button className="px-5 h-10 bg-emerald-500/10 text-emerald-500 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-2 border border-emerald-500/20 shadow-sm">
                            <FileSpreadsheet size={14} />
                            EXPORT
                        </button>
                    }
                />
            </div>

            {/* Command Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-primary/10 rounded-lg">
                            <LayoutGrid className="text-primary" size={18} />
                        </div>
                        <h2 className="text-sm font-bold text-primary uppercase tracking-[0.3em]">{language === 'th' ? "ภาพรวมเครือข่ายการขนส่ง" : "Transport Network Overview"}</h2>
                    </div>
                    <h1 className="text-4xl lg:text-5xl font-black text-foreground tracking-tighter uppercase italic leading-none">
                        {customerMode ? `${t('navigation.dashboard')}: ${userName || 'User'}` : t('dashboard.title')}
                    </h1>
                    <div className="flex items-center gap-3">
                        <div className="px-3 py-1 rounded-full bg-primary/5 border border-primary/10 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-2 text-primary transition-all duration-500">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            {t('dashboard.system_integrity')}
                        </div>
                        {!customerMode && (
                            <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest opacity-60">
                                {t('dashboard.node_execution')} {branchId || "Global"}
                            </p>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    {customerMode && (
                        <button 
                            onClick={() => setIsRequestDialogOpen(true)}
                            className="h-12 px-8 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-sm uppercase tracking-[0.2em] transition-all shadow-sm active:scale-95 border border-primary/30 rounded-xl"
                        >
                            {language === 'th' ? "งานวันนี้" : "Today's Mission"}
                        </button>
                    )}
                    <div className="h-12 px-6 glass-panel rounded-2xl flex items-center gap-4 border-border/5 shadow-sm">
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">{t('dashboard.fleet_utilization')}</p>
                            <p className="text-primary font-black text-xl leading-none">{fleetHealth || 98}%</p>
                        </div>
                        <Activity className="text-primary" size={20} />
                    </div>
                </div>
            </div>

            {/* 1. Summary Cards */}
            <div className="w-full relative">
                {jobStats.total === 0 && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-full animate-pulse">
                        <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest italic">
                            {startDate || endDate 
                                ? (language === 'th' ? "ไม่พบงานในเวลาที่เลือก" : "No missions found for selected range")
                                : (language === 'th' ? "ไม่มีงานที่กำหนดในวันนี้" : "No missions scheduled for today")}
                        </p>
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

            {/* Customer Summary Cards (7 Active Customers Overview) */}
            {!customerMode && allCustomers && allCustomers.length > 0 && (
                <CustomerSummaryWidget customers={allCustomers} isAdminUser={isAdminUser} />
            )}

            {/* Operations Grid */}
            <motion.div 
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
                {/* 1. Live Map Tracker */}
                <motion.div variants={item} className="lg:col-span-8 h-[500px] glass-panel rounded-3xl relative group border border-border shadow-sm overflow-hidden transition-all duration-300">
                    <div className="absolute inset-0 z-0">
                        <DashboardMap drivers={fleetStatus} allJobs={heatmapJobs} activeJobs={activeJobs} />
                    </div>
                    <div className="absolute top-6 left-6 z-10">
                        <div className="px-5 py-3 bg-card rounded-2xl border border-border shadow-sm">
                            <p className="text-xs font-bold text-primary uppercase tracking-[0.2em] mb-1">{t('dashboard.live_matrix')}</p>
                            <h3 className="text-foreground font-black text-lg tracking-tighter">{(fleetStatus || []).length} {t('dashboard.units_deployed')}</h3>
                        </div>
                    </div>
                </motion.div>
 
                {/* 2. Operational KPIs (Right) */}
                <div className="lg:col-span-4 space-y-6 flex flex-col">
                    {/* Performance Analytics Column */}
                    <motion.div variants={item} className="flex-1 bg-card rounded-3xl p-8 flex flex-col justify-center items-center text-center border border-border shadow-sm hover:border-primary/30 transition-all">
                        <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20 group-hover:scale-105 transition-all duration-500">
                            <CheckCircle2 className="text-emerald-500 w-10 h-10" strokeWidth={2.5} />
                        </div>
                        <h3 className="text-muted-foreground font-bold text-sm uppercase tracking-[0.3em] mb-3">{t('dashboard.ops_integrity')}</h3>
                        <p className="text-7xl font-black text-emerald-500 tracking-tighter leading-none mb-4 uppercase italic">A<span className="text-primary">+</span></p>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-4">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: '96%' }}
                                transition={{ duration: 2, ease: "easeOut" }}
                                className="h-full bg-emerald-500" 
                            />
                        </div>
                        <p className="text-emerald-600/80 text-sm font-black uppercase tracking-[0.15em]">{t('dashboard.efficiency_index')} 96.4%</p>
                    </motion.div>
 
                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 gap-6">
                        <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border flex flex-col justify-between h-36 hover:border-rose-500/20 transition-all shadow-sm">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t('monitoring.alerts')}</p>
                            <div className="flex items-end justify-between">
                                <p className={cn("text-4xl font-black tracking-tighter", sosCount > 0 ? "text-rose-500" : "text-foreground")}>{sosCount}</p>
                                <AlertTriangle size={20} className={sosCount > 0 ? "text-rose-500 animate-bounce" : "text-muted-foreground opacity-45"} />
                            </div>
                        </motion.div>
                        <motion.div variants={item} className="bg-card rounded-2xl p-6 border border-border flex flex-col justify-between h-36 hover:border-primary/20 transition-all shadow-sm">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t('navigation.planning')}</p>
                            <div className="flex items-end justify-between">
                                <p className="text-4xl font-black text-foreground tracking-tighter">{jobStats?.inProgress || 0}</p>
                                <CheckCircle2 size={20} className="text-primary" />
                            </div>
                        </motion.div>
                    </div>
                </div>
 
                {/* 3. ESG & Brand Vision - Full Width Banner */}
                <motion.div variants={item} className="lg:col-span-12 bg-card rounded-3xl p-10 border border-border group shadow-sm relative overflow-hidden">
                    <div className="absolute top-6 right-10 text-emerald-500/5 pointer-events-none group-hover:scale-105 transition-transform duration-700">
                        <Leaf size={240} />
                    </div>
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-10 relative z-10">
                        <div className="space-y-6">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 rounded-full text-sm font-bold uppercase tracking-[0.2em] text-primary border border-primary/20">
                                <Leaf size={14} /> {t('dashboard.esg_intelligence')}
                            </div>
                             <h2 className="text-4xl font-black text-foreground tracking-tighter leading-tight uppercase">
                                {t('dashboard.cleaner_future')}<br/>
                                <span className="opacity-40">{t('dashboard.carbon_offset')}</span> <span className="text-emerald-500">{esgData.co2Saved.toLocaleString()} KG CO2</span>
                            </h2>
                            <p className="text-muted-foreground font-bold text-base max-w-2xl leading-relaxed">
                                {t('dashboard.esg_description')}
                            </p>
                        </div>
                        <div className="flex gap-12">
                            <div className="text-center group/stat">
                                <p className="text-5xl font-black text-emerald-500 tracking-tighter mb-1 group-hover/stat:text-primary transition-colors">{(esgData.treesSaved || 0).toFixed(1)}</p>
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('dashboard.trees_saved')}</p>
                            </div>
                            <div className="w-px h-20 bg-muted" />
                            <div className="text-center group/stat">
                                <p className="text-5xl font-black text-emerald-500 tracking-tighter mb-1 group-hover/stat:text-primary transition-colors">{esgData.fuelSaved.toLocaleString()}<span className="text-xl text-muted-foreground ml-1">L</span></p>
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('dashboard.fuel_reclaimed')}</p>
                            </div>
                        </div>
                    </div>
                </motion.div>
 
                {/* 4. ANALYTICS & MARKETPLACE */}
                <motion.div variants={item} className="lg:col-span-12 space-y-6">
                    {!customerMode && (
                        <div className="bg-card rounded-3xl overflow-hidden p-1 border border-border shadow-sm">
                            <OrderBidding orders={marketplaceJobs} />
                        </div>
                    )}
 
                    <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden p-8 group hover:border-primary/25 transition-all">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-xl font-black text-foreground tracking-tight flex items-center gap-3">
                                <div className="p-2.5 bg-primary/10 rounded-xl text-primary border border-primary/20">
                                    <TrendingUp size={20} />
                                </div>
                                {t('dashboard.growth_analytics')}
                            </h3>
                            <span className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em]">{t('dashboard.performance_spectrum')}</span>
                        </div>
                        <div className="text-foreground h-[350px]">
                            <WeeklyShipmentChart data={weeklyStats} />
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    )
}
