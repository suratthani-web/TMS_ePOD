"use client"

import { useState, useEffect, useMemo, type ReactNode } from "react"
import { PremiumCard } from "@/components/ui/premium-card"
import { 
    TrendingUp, 
    Zap, 
    Truck, 
    PieChart as PieIcon, 
    Calendar,
    Target,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Filter,
    BarChart3
} from "lucide-react"
import { 
    getExecutiveDashboardUnified,
    getFuelAnomalyAlerts
} from "@/lib/supabase/financial-analytics"
import { saveSetting } from "@/lib/supabase/settings"
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    AreaChart, 
    Area,
    Cell,
    PieChart,
    Pie
} from 'recharts'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useRealtime } from "@/hooks/useRealtime"
import { RealtimeIndicator } from "@/components/ui/realtime-indicator"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { ChartContainer } from "@/components/ui/chart-container"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

type RevenueTrendPoint = {
    date?: string
    revenue?: number
    cost?: number
    profit?: number
}

type ExecutiveVehicle = {
    plate: string
    netProfit: number
    revenue: number
}

type ExecutiveDashboardData = {
    financial?: {
        revenue?: number
        netProfit?: number
        totalQty?: number
    }
    kpi?: {
        revenue?: { growth?: number }
        profit?: { growth?: number }
        totalQty?: { current?: number; growth?: number }
        margin?: { current?: number; growth?: number }
        jobs?: { current?: number; growth?: number }
    }
    trend?: RevenueTrendPoint[]
    totalRevenue?: number
    totalProfit?: number
    totalCost?: number
    profitMargin?: number
    completedJobs?: number
    pendingJobs?: number
    activeJobs?: number
    avgJobValue?: number
    revenueTrend?: RevenueTrendPoint[]
    vehicles?: ExecutiveVehicle[]
    fuelAlerts?: unknown[]
    [key: string]: unknown
}

interface ExecutiveDashboardClientProps {
    initialData: ExecutiveDashboardData
    initialRemark: string
    branchId: string
    currentMonth: string
}

export function ExecutiveDashboardClient({ initialData, initialRemark, branchId, currentMonth }: ExecutiveDashboardClientProps) {
    const { t, language } = useLanguage()
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [savingRemark, setSavingRemark] = useState(false)
    const [data, setData] = useState(initialData)
    const [remark, setRemark] = useState(initialRemark)

    // Update internal state when props change (server-side refresh)
    useEffect(() => {
        setData(initialData)
        setRemark(initialRemark)
    }, [initialData, initialRemark])

    const loadData = async (showLoading = true) => {
        if (showLoading) setLoading(true)
        try {
            const [
                unifiedData,
                fuelAlerts,
            ] = await Promise.all([
                getExecutiveDashboardUnified(branchId),
                getFuelAnomalyAlerts(branchId),
            ])

            setData((prev) => ({ ...prev, ...unifiedData, fuelAlerts }))
        } catch (e) {
            toast.error("Failed to refresh executive data")
        } finally {
            if (showLoading) setLoading(false)
        }
    }

    // Real-time: Jobs_Main (Throttled to protect Vercel Serverless quota)
    const throttledLoadData = useMemo(() => {
        let inThrottle = false;
        return () => {
            if (!inThrottle) {
                loadData(false)
                inThrottle = true
                setTimeout(() => { inThrottle = false }, 15000) // 15 seconds cooldown
            }
        }
    }, [])

    useRealtime('Jobs_Main', throttledLoadData)

    const handleSaveRemark = async () => {
        setSavingRemark(true)
        try {
            await saveSetting(`exec_remark_${currentMonth}_${branchId}`, remark)
            toast.success("Executive insights updated")
        } catch {
            toast.error("Failed to save remark")
        } finally {
            setSavingRemark(false)
        }
    }

    const financial = data.financial ?? {}
    const kpi = data.kpi ?? {}
    const trend = data.trend ?? []

    return (
        <div className="space-y-10 pb-20">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-2xl border border-border shadow-sm relative overflow-hidden">
                
                <div className="relative z-10">
                    <h1 className="text-4xl font-black text-foreground tracking-tight flex items-center gap-3">
                        <Target className="text-primary" size={32} />
                        {t('dashboard.title')}
                    </h1>
                    <p className="text-primary font-bold mt-1 uppercase tracking-widest text-sm">{t('dashboard.subtitle')}</p>
                </div>
                <div className="flex flex-col items-end gap-2 relative z-10">
                    <RealtimeIndicator isLive={true} className="bg-muted/50 border-border/10 text-foreground" />
                    <div className="flex items-center gap-3 bg-muted/30 p-2 px-4 rounded-xl border border-border">
                        <Calendar className="text-primary" size={18} />
                        <span className="text-foreground font-black text-lg uppercase tracking-tighter">
                            {new Date().toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', { month: 'long', year: 'numeric' })}
                        </span>
                    </div>
                </div>
            </div>

            {/* Primary KPIs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <KpiCard 
                    title={t('dashboard.revenue')} 
                    value={financial.revenue || 0} 
                    unit="THB" 
                    icon={<TrendingUp className="text-emerald-500" />}
                    growth={kpi.revenue?.growth}
                />
                <KpiCard 
                    title={t('dashboard.profit')} 
                    value={financial.netProfit || 0} 
                    unit="THB" 
                    icon={<Zap className="text-blue-500" />}
                    growth={kpi.profit?.growth}
                />
                <KpiCard 
                    title="ยอดสินค้า" 
                    value={kpi.totalQty?.current || financial.totalQty || 0} 
                    growth={kpi.totalQty?.growth}
                    unit="ชิ้น" 
                    icon={<BarChart3 className="text-emerald-400" />}
                />
                <KpiCard 
                    title={t('dashboard.margin')} 
                    value={kpi.margin?.current || 0} 
                    growth={kpi.margin?.growth} 
                    unit="%" 
                    icon={<PieIcon className="text-amber-500" />}
                    isPercentage
                />
                <KpiCard 
                    title={t('dashboard.jobs')} 
                    value={kpi.jobs?.current || 0} 
                    growth={kpi.jobs?.growth} 
                    unit="TRIPS" 
                    icon={<Truck className="text-rose-500" />}
                />
            </div>

            {/* Data Matrix Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Revenue Trend Chart */}
                <PremiumCard className="lg:col-span-2 p-8" title={t('dashboard.revenue_trend')}>
                    <div className="mt-6">
                        <ChartContainer height={350}>
                            <AreaChart data={trend}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00279C" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#00279C" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis 
                                    dataKey="date" 
                                    stroke="#64748b" 
                                    fontSize={10} 
                                    tickLine={false} 
                                    axisLine={false}
                                    tickFormatter={(val) => val.split('-').slice(1).join('/')}
                                />
                                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `฿${val/1000}k`} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.75rem' }}
                                    itemStyle={{ color: 'hsl(var(--foreground))', fontSize: '12px', fontWeight: 'bold' }}
                                />
                                <Area type="monotone" dataKey="revenue" stroke="#00279C" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                            </AreaChart>
                        </ChartContainer>
                    </div>
                </PremiumCard>

                {/* Top Profitable Vehicles */}
                <PremiumCard className="p-8" title={t('dashboard.top_vehicles')}>
                    <div className="mt-6 space-y-6">
                        {(data.vehicles || []).map((v, i: number) => (
                            <div key={v.plate} className="flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-muted/50 flex items-center justify-center font-black text-primary border border-border/5 group-hover:border-primary/30 transition-colors">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <p className="font-black text-foreground uppercase tracking-tighter">{v.plate}</p>
                                        <p className="text-base font-bold text-muted-foreground font-bold uppercase tracking-widest">
                                            {t('dashboard.profit')}: <AnimatedNumber value={v.netProfit} prefix="฿" />
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-primary font-black tracking-tighter">
                                        <AnimatedNumber value={v.revenue} prefix="฿" />
                                    </p>
                                    <p className="text-base font-bold text-muted-foreground font-bold uppercase tracking-widest">{t('dashboard.revenue')}</p>
                                </div>
                            </div>
                        ))}
                        {(!data.vehicles || data.vehicles.length === 0) && (
                            <div className="text-center py-10 opacity-30 italic">No vehicle data available</div>
                        )}
                    </div>
                </PremiumCard>
            </div>
        </div>
    )
}

type KpiCardProps = {
    title: string
    value: number
    unit?: string
    icon: ReactNode
    growth?: number
    isPercentage?: boolean
}

function KpiCard({ title, value, unit, icon, growth, isPercentage = false }: KpiCardProps) {
    const { t } = useLanguage();
    return (
        <PremiumCard className="p-6 relative overflow-hidden group hover:scale-[1.02] transition-transform duration-500">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                {icon}
            </div>
            <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.2em] mb-4">{title}</p>
            <div className="flex items-baseline gap-2">
                <h3 className="text-3xl font-black text-foreground tracking-tighter">
                    {isPercentage ? (
                        <AnimatedNumber value={value} decimals={1} suffix="%" />
                    ) : (
                        <AnimatedNumber value={value} prefix="฿" />
                    )}
                </h3>
                <span className="text-muted-foreground text-base font-bold font-black uppercase">{unit}</span>
            </div>
            {growth !== undefined && (
                <div className={cn(
                    "flex items-center mt-4 text-base font-bold font-black px-2 py-1 rounded-lg w-fit",
                    growth >= 0 ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
                )}>
                    {growth >= 0 ? <ArrowUpRight size={12} className="mr-1" /> : <ArrowDownRight size={12} className="mr-1" />}
                    <span>{Math.abs(growth).toFixed(1)}%</span>
                    <span className="opacity-50 ml-1 uppercase tracking-tighter">{t('dashboard.vs_last_month')}</span>
                </div>
            )}
        </PremiumCard>
    )
}
