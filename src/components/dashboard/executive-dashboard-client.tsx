"use client"

import { useState, useEffect, useMemo } from "react"
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

interface ExecutiveDashboardClientProps {
    initialData: any
    initialRemark: string
    branchId: string
    currentMonth: string
}

export function ExecutiveDashboardClient({ initialData, initialRemark, branchId, currentMonth }: ExecutiveDashboardClientProps) {
    const { t } = useLanguage()
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

            setData((prev: any) => ({ ...prev, ...unifiedData, fuelAlerts }))
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

    return (
        <div className="space-y-10 pb-20">
            {/* Header Command Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-background/50 backdrop-blur-xl p-8 rounded-[3rem] border border-border/5 shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent pointer-events-none" />
                
                <div className="relative z-10">
                    <h1 className="text-4xl font-black text-foreground tracking-tight flex items-center gap-3">
                        <Target className="text-primary" size={32} />
                        {t('dashboard.title')}
                    </h1>
                    <p className="text-primary/80 font-bold mt-1 uppercase tracking-widest text-base font-bold">{t('dashboard.subtitle')}</p>
                </div>
                <div className="flex flex-col items-end gap-2 relative z-10">
                    <RealtimeIndicator isLive={true} className="bg-muted/50 border-border/10 text-foreground" />
                    <div className="flex items-center gap-3 bg-muted/50 p-2 px-4 rounded-2xl border border-border/10">
                        <Calendar className="text-primary" size={18} />
                        <span className="text-white font-black text-xl uppercase tracking-tighter">
                            {new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                        </span>
                    </div>
                </div>
            </div>

            {/* Primary KPIs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <KpiCard 
                    title={t('dashboard.revenue')} 
                    value={data.financial.revenue} 
                    unit="THB" 
                    icon={<TrendingUp className="text-emerald-500" />}
                    growth={data.kpi.revenue.growth}
                />
                <KpiCard 
                    title={t('dashboard.profit')} 
                    value={data.financial.netProfit} 
                    unit="THB" 
                    icon={<Zap className="text-blue-500" />}
                    growth={data.kpi.profit.growth}
                />
                <KpiCard 
                    title="ยอดสินค้า" 
                    value={data.kpi.totalQty?.current || data.financial.totalQty || 0} 
                    growth={data.kpi.totalQty?.growth}
                    unit="ชิ้น" 
                    icon={<BarChart3 className="text-emerald-400" />}
                />
                <KpiCard 
                    title={t('dashboard.margin')} 
                    value={data.kpi.margin.current} 
                    growth={data.kpi.margin.growth} 
                    unit="%" 
                    icon={<PieIcon className="text-amber-500" />}
                    isPercentage
                />
                <KpiCard 
                    title={t('dashboard.jobs')} 
                    value={data.kpi.jobs.current} 
                    growth={data.kpi.jobs.growth} 
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
                            <AreaChart data={data.trend}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ff1e85" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#ff1e85" stopOpacity={0}/>
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
                                    contentStyle={{ backgroundColor: '#050110', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem' }}
                                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                />
                                <Area type="monotone" dataKey="revenue" stroke="#ff1e85" strokeWidth={4} fillOpacity={1} fill="url(#colorRev)" />
                            </AreaChart>
                        </ChartContainer>
                    </div>
                </PremiumCard>

                {/* Top Profitable Vehicles */}
                <PremiumCard className="p-8" title={t('dashboard.top_vehicles')}>
                    <div className="mt-6 space-y-6">
                        {(data.vehicles || []).map((v: any, i: number) => (
                            <div key={v.plate} className="flex items-center justify-between group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-2xl bg-muted/50 flex items-center justify-center font-black text-primary border border-border/5 group-hover:border-primary/30 transition-colors">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <p className="font-black text-white uppercase tracking-tighter">{v.plate}</p>
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

function KpiCard({ title, value, unit, icon, growth, isPercentage = false }: any) {
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
