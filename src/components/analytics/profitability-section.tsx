"use client"

import { PremiumCard } from "@/components/ui/premium-card"
import { ChartContainer } from "@/components/ui/chart-container"
import { useLanguage } from "@/components/providers/language-provider"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Cell,
  PieChart,
  Pie
} from 'recharts'
import { Coins, TrendingUp, Truck, Activity, Zap, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import { getVehicleJobDetails } from "@/lib/supabase/analytics"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"

type VehicleProfitData = {
    plate: string
    revenue: number
    driverCost: number
    fuelCost: number
    maintenanceCost: number
    totalCost: number
    netProfit: number
    totalKm?: number
    count?: number
}

type Props = {
    data: (VehicleProfitData & { predictedFuel: number, predictedMaintenance: number })[]
    financials: {
        revenue: number
        cost: {
            total: number
            driver: number
            fuel: number
            maintenance: number
            predictedFuel?: number
            predictedMaintenance?: number
        }
    }
    startDate?: string
    endDate?: string
}

interface JobDetail {
    Job_ID: string
    Customer_Name: string
    Route_Name: string
    Price_Cust_Total: number
    Job_Status: string
}

function JobDetailsModal({ 
    plate, 
    isOpen, 
    onClose,
    startDate,
    endDate 
}: { 
    plate: string | null, 
    isOpen: boolean, 
    onClose: () => void,
    startDate?: string,
    endDate?: string
}) {
    const { t } = useLanguage()
    const [jobs, setJobs] = useState<JobDetail[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isOpen && plate) {
            const timer = setTimeout(() => {
                setLoading(true)
                getVehicleJobDetails(plate, startDate, endDate)
                    .then(res => setJobs(res as JobDetail[]))
                    .finally(() => setLoading(false))
            }, 0)
            return () => clearTimeout(timer)
        }
    }, [isOpen, plate, startDate, endDate])

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl bg-card border border-border text-foreground rounded-2xl overflow-hidden p-0 shadow-lg">
                <DialogHeader className="p-4 border-b border-border bg-muted/30">
                    <DialogTitle className="text-sm font-black flex items-center gap-2.5">
                        <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
                            <Truck size={14} />
                        </div>
                        {t('analytics.vehicle_audit') || 'Vehicle Mission Audit'}: <span className="text-primary">{plate}</span>
                    </DialogTitle>
                </DialogHeader>
                <div className="p-5 max-h-[60vh] overflow-y-auto">
                    {loading ? (
                        <div className="py-10 text-center text-muted-foreground text-xs font-bold uppercase tracking-wider">{t('common.loading') || 'Accessing Data...'}</div>
                    ) : (
                        <div className="space-y-3">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-border">
                                        <th className="py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('common.job_id') || 'JOB ID'}</th>
                                        <th className="py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('common.customer') || 'CUSTOMER'}</th>
                                        <th className="py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">{t('common.revenue') || 'REVENUE'}</th>
                                        <th className="py-2.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">{t('common.status') || 'STATUS'}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {jobs.map(job => (
                                        <tr key={job.Job_ID} className="group hover:bg-muted/10 transition-colors">
                                            <td className="py-2 text-xs text-muted-foreground font-medium">{job.Job_ID}</td>
                                            <td className="py-2 text-xs">
                                                <div className="font-bold text-foreground">{job.Customer_Name}</div>
                                                <div className="text-[9px] text-muted-foreground uppercase font-bold">{job.Route_Name}</div>
                                            </td>
                                            <td className="py-2 text-right font-black text-primary text-xs">฿{job.Price_Cust_Total?.toLocaleString()}</td>
                                            <td className="py-2 text-center">
                                                <Badge className={cn(
                                                    "bg-transparent border uppercase text-[9px] font-bold px-1.5 py-0.5",
                                                    job.Job_Status === 'Completed' ? "border-emerald-500/30 text-emerald-500" : "border-amber-500/30 text-amber-500"
                                                )}>
                                                    {job.Job_Status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

export function ProfitabilitySection({ data = [], financials, startDate, endDate }: Props) {
    const { t } = useLanguage()
    const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)

    // Sort by profit for the chart
    const topPerformers = [...data].sort((a, b) => b.netProfit - a.netProfit).slice(0, 5)
    
    const costBreakdownData = [
        { name: t('common.driver_payout'), value: financials?.cost?.driver || 0, color: '#10b981' },
        { name: `Actual Fuel`, value: financials?.cost?.fuel || 0, color: '#3b82f6' },
        { name: `Actual Maint`, value: financials?.cost?.maintenance || 0, color: '#f59e0b' },
        { name: `Forecast Fuel`, value: financials?.cost?.predictedFuel || 0, color: '#3b82f6', isForecast: true },
        { name: `Forecast Maint`, value: financials?.cost?.predictedMaintenance || 0, color: '#f59e0b', isForecast: true }
    ]

    return (
        <div className="space-y-6">
            <JobDetailsModal 
                plate={selectedVehicle} 
                isOpen={!!selectedVehicle} 
                onClose={() => setSelectedVehicle(null)}
                startDate={startDate}
                endDate={endDate}
            />

            {/* Sub-Section Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-xl text-primary border border-border/80 shadow-sm">
                    <TrendingUp size={16} />
                </div>
                <div className="space-y-0.5">
                    <h3 className="text-lg font-black text-foreground uppercase tracking-tight">{t('analytics.profitability_matrix')}</h3>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Vehicle Profitability Chart */}
                <PremiumCard className="lg:col-span-2 bg-card border border-border shadow-sm p-0 overflow-hidden rounded-2xl">
                    <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 relative z-10">
                            <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
                                <Truck size={14} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-foreground">{t('dashboard.asset_yield_spectrum')}</h3>
                                <p className="text-primary text-[10px] font-bold uppercase tracking-wider">{t('dashboard.strategic_revenue_distribution')}</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-6">
                        <ChartContainer height={350}>
                            <BarChart data={topPerformers} layout="vertical" margin={{ left: 20, right: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                                <XAxis type="number" stroke="#94a3b8" fontSize={10} fontWeight="normal" tickLine={false} axisLine={false} />
                                <YAxis dataKey="plate" type="category" stroke="#94a3b8" width={80} fontSize={10} fontWeight="bold" tickLine={false} axisLine={false} className="uppercase" />
                                <Tooltip 
                                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                    contentStyle={{ 
                                        backgroundColor: 'hsl(var(--card))', 
                                        borderColor: 'hsl(var(--border))', 
                                        borderRadius: '12px', 
                                        border: '1px solid hsl(var(--border))',
                                        color: 'hsl(var(--foreground))',
                                        padding: '12px'
                                    }}
                                    labelStyle={{ color: 'hsl(var(--foreground))', marginBottom: '4px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '4px', fontWeight: 'bold' }}
                                    itemStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: 'hsl(var(--foreground))' }}
                                    formatter={(value: unknown) => [`฿${Number(value || 0).toLocaleString()}`, t('common.net_margin')]}
                                />
                                <Bar dataKey="netProfit" radius={[0, 4, 4, 0]} barSize={20}>
                                    {topPerformers.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.netProfit > 0 ? '#10b981' : '#f43f5e'} fillOpacity={0.8} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </div>
                </PremiumCard>

                {/* Cost Structure Analysis */}
                <PremiumCard className="bg-card border border-border shadow-sm p-0 overflow-hidden rounded-2xl relative flex flex-col justify-between">
                    <div>
                        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                            <div className="flex items-center gap-2.5 relative z-10">
                                <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
                                    <Coins size={14} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-foreground">{t('dashboard.cost_composition_matrix')}</h3>
                                    <p className="text-primary text-[10px] font-bold uppercase tracking-wider">{t('dashboard.operational_expenditure_analytics')}</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 relative">
                            <ChartContainer height={200}>
                                    <PieChart>
                                        <Pie
                                            data={costBreakdownData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={75}
                                            paddingAngle={4}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {costBreakdownData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            contentStyle={{ 
                                                backgroundColor: 'hsl(var(--card))', 
                                                borderColor: 'hsl(var(--border))', 
                                                borderRadius: '12px',
                                                border: '1px solid hsl(var(--border))',
                                                color: 'hsl(var(--foreground))'
                                            }}
                                            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                                            itemStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: 'hsl(var(--foreground))' }}
                                            formatter={(value: unknown) => [`฿${Number(value || 0).toLocaleString()}`, t('settings.items.accounting')]}
                                        />
                                    </PieChart>
                            </ChartContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-2">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">TOTAL OpEx</span>
                                <span className="text-lg font-black text-foreground">
                                    ฿{(financials.cost.total / 1000).toFixed(0)}K
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-4 pt-0 space-y-2">
                        {costBreakdownData.map((item) => (
                            <div key={item.name} className="flex items-center justify-between p-2.5 bg-muted/20 rounded-xl border border-border hover:bg-muted/30 transition-all">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-xs text-muted-foreground font-medium uppercase">{item.name}</span>
                                </div>
                                <span className="text-xs font-black text-foreground">
                                    {financials.cost.total > 0 ? ((item.value / financials.cost.total) * 100).toFixed(1) : 0}%
                                </span>
                            </div>
                        ))}
                    </div>
                </PremiumCard>

                {/* Performance Ledger Table - Full Width with Advanced Metrics */}
                <PremiumCard className="lg:col-span-3 bg-card border border-border shadow-sm p-0 overflow-hidden rounded-2xl">
                    <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                        <div className="flex items-center gap-2.5 relative z-10">
                            <div className="p-1.5 bg-muted rounded-lg text-foreground border border-border">
                                <Activity size={14} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-foreground uppercase">{t('analytics.performance_ledger')}</h4>
                                <p className="text-primary text-[10px] font-bold uppercase tracking-wider">{t('analytics.detailed_audit')}</p>
                            </div>
                        </div>
                        <div className="hidden md:flex items-center gap-4 bg-muted px-4 py-2 rounded-xl border border-border">
                            <div className="flex items-center gap-2">
                                <Truck size={14} className="text-primary" />
                                <span className="text-xs font-black text-foreground">{data.length} <span className="text-muted-foreground text-[9px] uppercase">{t('common.vehicles')}</span></span>
                            </div>
                            <div className="h-4 w-px bg-border" />
                            <div className="flex items-center gap-2">
                                <Zap size={12} className="text-primary" />
                                <span className="text-xs font-bold text-muted-foreground uppercase">{t('analytics.live_uplink')}</span>
                            </div>
                        </div>
                    </div>
                    <div className="p-0 overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                            <thead>
                                <tr className="border-b border-border bg-muted/20">
                                    <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t('common.asset_id')}</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">Trips</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">{t('common.revenue_yield')}</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">Actual Driver</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-blue-500 uppercase tracking-wider text-right">Forecast Fuel</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-amber-500 uppercase tracking-wider text-right">Forecast Maint</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-foreground uppercase tracking-wider text-right">{t('common.net_margin')}</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-emerald-500 uppercase tracking-wider text-right">Total KM</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-primary uppercase tracking-wider text-right">Yield/KM</th>
                                    <th className="px-4 py-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">{t('common.efficiency_rating')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {data.slice(0, 15).map((item) => (
                                    <tr 
                                        key={item.plate} 
                                        className="group/row hover:bg-muted/10 transition-all border-l-4 border-transparent hover:border-primary cursor-pointer"
                                        onClick={() => setSelectedVehicle(item.plate)}
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-foreground text-sm uppercase transition-transform duration-300">{item.plate}</span>
                                                <Info size={12} className="text-primary opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <Badge className="bg-primary/10 text-primary border-primary/20 font-bold px-2 py-0.5 text-[10px]">
                                                {item.count || 0}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-primary text-sm">฿{item.revenue.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-bold text-muted-foreground text-sm">฿{item.driverCost.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-bold text-blue-500/70 text-sm">฿{Math.round(item.predictedFuel || 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-bold text-amber-500/70 text-sm">฿{Math.round(item.predictedMaintenance || 0).toLocaleString()}</td>
                                        <td className={cn(
                                            "px-4 py-3 text-right font-black text-sm",
                                            item.netProfit > 0 ? 'text-emerald-500' : 'text-destructive'
                                        )}>
                                            ฿{item.netProfit.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-emerald-500/80 text-sm">
                                            {item.totalKm?.toLocaleString()} <span className="text-[9px] text-muted-foreground uppercase font-bold">KM</span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-primary text-sm">
                                            ฿{item.totalKm && item.totalKm > 0 ? (item.netProfit / item.totalKm).toFixed(1) : 0}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className={cn(
                                                "inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border",
                                                item.revenue > 0 && (item.netProfit / item.revenue) > 0.2 
                                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' 
                                                    : item.revenue > 0 && (item.netProfit / item.revenue) > 0.1 
                                                        ? 'bg-primary/10 text-primary border-primary/30' 
                                                        : 'bg-destructive/10 text-destructive border-destructive/30'
                                            )}>
                                                {item.revenue > 0 ? ((item.netProfit / item.revenue) * 100).toFixed(1) : 0}% {t('common.yield')}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </PremiumCard>
            </div>
        </div>
    )
}
