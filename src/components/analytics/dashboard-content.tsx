"use client"

import { 
  getFinancialStats, 
  getRevenueTrend, 
  getTopCustomers,
  getOperationalStats,
  getJobStatusDistribution,
  getBranchPerformance,
  getSubcontractorPerformance,
  getExecutiveKPIs,
  getRouteEfficiency,
  getDriverLeaderboard,
  getVehicleProfitability,
  getDelayRootCause,
  getRevenueForecast
} from "@/lib/supabase/analytics"
import { getBillingAnalytics } from "@/lib/supabase/billing-analytics"
import { getFuelAnalytics } from "@/lib/supabase/fuel-analytics"
import { getMaintenanceSchedule } from "@/lib/supabase/maintenance-schedule"
import { getSafetyAnalytics } from "@/lib/supabase/safety-analytics"
import { getWorkforceAnalytics } from "@/lib/supabase/workforce-analytics"
import { getESGStats } from "@/lib/supabase/esg-analytics"
import { getExecutiveDashboardUnified } from "@/lib/supabase/financial-analytics"
import { ESGSection } from "@/components/analytics/esg-section"
import { StatusDistributionChart } from "@/components/analytics/status-distribution-chart"

import { FinancialSummaryCards } from "@/components/analytics/summary-cards"
import { RevenueTrendChart } from "@/components/analytics/revenue-chart"
import { PerformanceCharts } from "@/components/analytics/performance-charts"
import { EfficiencyCharts } from "@/components/analytics/efficiency-charts"
import { ExecutiveSectorHealth } from "@/components/analytics/health-scorecards"
import { BillingSection } from "@/components/analytics/billing-section"
import { FuelSection } from "@/components/analytics/fuel-section"
import { MaintenanceSection } from "@/components/analytics/maintenance-section"
import { SafetySection } from "@/components/analytics/safety-section"
import { WorkforceSection } from "@/components/analytics/workforce-section"
import { CustomerRouteSection } from "@/components/analytics/customer-route-section"
import { ExportAllButton } from "@/components/analytics/export-all-button"
import { ProfitabilitySection } from "@/components/analytics/profitability-section"
import { DelayAnalysis } from "@/components/analytics/delay-analysis"
import { RevenueForecastChart } from "@/components/analytics/revenue-forecast-chart"
import { ActivityFeed } from "@/components/dashboard/activity-feed"

import { PremiumCard } from "@/components/ui/premium-card"
import { BarChart3, TrendingUp, Truck, ShieldAlert, Layers, Trophy, Star, Zap, Activity, Users } from "lucide-react"
import { cn } from "@/lib/utils"

interface DriverStats {
  name: string
  completedJobs: number
  onTimeRate: number
  revenue: number
}

import { useState, useEffect, useCallback } from "react"
import { useLanguage } from "@/components/providers/language-provider"

interface DashboardContentProps {
  startDate?: string
  endDate?: string
  branchId?: string
}

// Split state into two priority layers
interface PriorityData {
  financials: any
  revenueTrend: any[]
  forecastData: any[]
  exeKPIs: any
  opStats: any
  statusDist: any[]
  driverLeaderboard: any[]
  vehicleProfitability: any[]
  branchPerf: any[]
}

interface SecondaryData {
  topCustomers: any[]
  subPerf: any[]
  routes: any[]
  billing: any
  fuel: any
  maintenance: any
  safety: any
  workforce: any
  esgStats: any
  delayRootCause: any[]
}

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const SectionSkeleton = () => (
    <div className="w-full h-[300px] bg-muted/10 animate-pulse rounded-2xl border border-border/5 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 opacity-20">
            <Activity className="w-8 h-8 text-primary animate-bounce" />
            <div className="h-1.5 w-24 bg-primary/40 rounded-full" />
        </div>
    </div>
)

export function DashboardContent({ 
  startDate,
  endDate,
  branchId,
}: DashboardContentProps) {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState("overview")

  const [priority, setPriority] = useState<PriorityData | null>(null)
  const [secondary, setSecondary] = useState<SecondaryData | null>(null)
  const [loadingPrimary, setLoadingPrimary] = useState(true)
  const [loadingSecondary, setLoadingSecondary] = useState(false)

  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set())

  const loadTabData = useCallback(async (tab: string) => {
    if (loadedTabs.has(tab)) return
    
    if (tab === 'overview' && !priority) {
        setLoadingPrimary(true)
        try {
            const [unifiedData, forecastData, opStats, driverLeaderboard, vehicleProfitability, branchPerf] = await Promise.all([
              getExecutiveDashboardUnified(branchId, startDate, endDate),
              getRevenueForecast(branchId),
              getOperationalStats(branchId, startDate, endDate),
              getDriverLeaderboard(startDate, endDate, branchId),
              getVehicleProfitability(startDate, endDate, branchId),
              getBranchPerformance(startDate, endDate),
            ])

            setPriority({ 
                financials: unifiedData?.financial || { revenue: 0, netProfit: 0, cost: { total: 0, driver: 0, fuel: 0, maintenance: 0 } }, 
                revenueTrend: unifiedData?.trend || [], 
                forecastData: forecastData || [], 
                exeKPIs: { 
                    ...(unifiedData?.kpi || { 
                        revenue: { current: 0, growth: 0 }, 
                        profit: { current: 0, growth: 0 }, 
                        margin: { current: 0, growth: 0 },
                        jobs: { current: 0, growth: 0 }
                    }), 
                    revenue_pipeline: unifiedData?.financial?.revenuePipeline || 0,
                    predicted_fuel: unifiedData?.financial?.cost?.predictedFuel || 0,
                    predicted_maintenance: unifiedData?.financial?.cost?.predictedMaintenance || 0
                }, 
                opStats: opStats || {}, 
                statusDist: unifiedData?.statusDist || [], 
                driverLeaderboard: driverLeaderboard || [], 
                vehicleProfitability: vehicleProfitability || [], 
                branchPerf: branchPerf || [] 
            })
        } catch (err) {
            console.error("Failed to load primary analytics:", err)
        } finally {
            setLoadingPrimary(false)
        }
    } else if (tab !== 'overview') {
        setLoadingSecondary(true)
        try {
            // Only fetch data relevant to the active tab to speed up loading
            let results: any = {}
            if (tab === 'financial') {
              const [topCustomers, billing] = await Promise.all([
                getTopCustomers(startDate, endDate, branchId),
                getBillingAnalytics(startDate, endDate, branchId)
              ])
              results = { topCustomers, billing }
            } else if (tab === 'operations') {
              const [fuel, routes, delayRootCause, maintenance] = await Promise.all([
                getFuelAnalytics(startDate, endDate),
                getRouteEfficiency(startDate, endDate, branchId),
                getDelayRootCause(startDate, endDate, branchId),
                getMaintenanceSchedule()
              ])
              results = { fuel, routes, delayRootCause, maintenance }
            } else if (tab === 'drivers') {
              const [workforce, driverLeaderboard] = await Promise.all([
                getWorkforceAnalytics(startDate, endDate, branchId),
                getDriverLeaderboard(startDate, endDate, branchId)
              ])
              results = { workforce, driverLeaderboard }
            } else if (tab === 'safety') {
              const [safety, esgStats] = await Promise.all([
                getSafetyAnalytics(startDate, endDate, branchId),
                getESGStats(startDate, endDate, branchId)
              ])
              results = { safety, esgStats }
            }
            setSecondary(prev => ({ ...prev, ...results }))
        } finally {
            setLoadingSecondary(false)
        }
    }

    setLoadedTabs(prev => new Set(prev).add(tab))
  }, [startDate, endDate, branchId, priority, loadedTabs])

  useEffect(() => {
    setLoadedTabs(new Set())
    setPriority(null)
    setSecondary(null)
    loadTabData("overview")
  }, [startDate, endDate, branchId])

  useEffect(() => {
    loadTabData(activeTab)
  }, [activeTab, loadTabData])

  const isInitialLoading = loadingPrimary && activeTab === "overview"

  const {
    financials = { totalRevenue: 0, totalProfit: 0, margin: 0, growth: 0, cost: { total: 0, driver: 0, fuel: 0, maintenance: 0, predictedFuel: 0, predictedMaintenance: 0 } } as any,
    revenueTrend = [],
    forecastData = [],
    exeKPIs = { revenue: { current: 0, growth: 0 }, profit: { current: 0, growth: 0 }, margin: { current: 0, growth: 0 } } as any,
    opStats = { fleet: { onTimeDelivery: 0, utilization: 0, health: 0 } } as any,
    statusDist = [],
    driverLeaderboard = [],
    vehicleProfitability = [],
    branchPerf = [],
  } = priority || {}

  const {
    topCustomers = [],
    subPerf = [],
    routes = [],
    billing = { 
      accountsReceivable: { totalOutstanding: 0, invoiceCount: 0, aging: { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }, recentUnpaid: [] },
      accountsPayable: { totalOutstanding: 0, paymentCount: 0 },
      collectionRate: 0,
      revenueVsPayout: []
    } as any,
    fuel = { 
      totalLiters: 0, 
      totalCost: 0, 
      avgCostPerLiter: 0, 
      avgKmPerLiter: 0,
      monthlyTrends: [],
      vehicleBreakdown: [],
      anomalies: [] 
    } as any,
    maintenance = { upcoming: [], overdue: [], dueSoon: [], activeRepairs: 0, completedThisMonth: 0, totalCostThisMonth: 0, vehicleHealthSummary: [] } as any,
    safety = {
      sos: { total: 0, active: 0, resolved: 0, byReason: [], recentAlerts: [] },
      pod: { totalCompleted: 0, withPhoto: 0, withSignature: 0, complianceRate: 0 }
    } as any,
    workforce = {
      kpis: { totalBox: 0, activeToday: 0, licenseExpiring: 0, licenseExpired: 0 },
      topPerformers: [],
      driversWithIssues: []
    } as any,
    esgStats = { co2SavedKg: 0, treesSaved: 0, totalSavedKm: 0, efficiencyRate: 0, historicalData: [] } as any,
    delayRootCause = [],
  } = secondary ?? {}

  const allData = {
    financials, revenueTrend, topCustomers, statusDist,
    branchPerf, subPerf, billing, fuel, maintenance,
    safety, workforce, routes, driverLeaderboard, vehicleProfitability,
    esgStats, opStats, delayRootCause
  }

  if (isInitialLoading) {
    return <div className="py-20 text-center uppercase font-black text-primary animate-pulse tracking-widest text-sm italic">Initialising_Intelligence_Core...</div>
  }

  return (
    <div className="space-y-6">
        {/* Navigation Interface */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-background/40 backdrop-blur-3xl border border-border/5 rounded-xl shadow-lg relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
            <div className="flex items-center gap-3 relative z-10">
                <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center text-primary border border-primary/30 group-hover:scale-110 transition-all">
                    <Zap size={16} className="animate-pulse" />
                </div>
                <div>
                    <h3 className="text-xs font-black text-foreground uppercase italic leading-none mb-0.5">{t('common.tactical_cluster')}</h3>
                    <p className="text-[9px] font-bold font-black text-muted-foreground uppercase italic opacity-60 tracking-widest">SIGNAL_STATUS: NOMINAL</p>
                </div>
            </div>
            
            <div className="flex items-center gap-2 relative z-10">
                <ExportAllButton data={allData} />
            </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-muted/50 p-1 rounded-lg border border-border/5 inline-flex h-auto">
                <TabsTrigger value="overview" className="px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all italic">
                    {t('common.overview')}
                </TabsTrigger>
                <TabsTrigger value="financial" className="px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-emerald-600 data-[state=active]:text-white transition-all italic">
                    {t('common.financial_node')}
                </TabsTrigger>
                <TabsTrigger value="operations" className="px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all italic">
                    {t('common.mission_node')}
                </TabsTrigger>
                <TabsTrigger value="drivers" className="px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all italic">
                    {t('navigation.drivers')}
                </TabsTrigger>
                <TabsTrigger value="safety" className="px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-rose-600 data-[state=active]:text-white transition-all italic">
                    {t('common.safety_esg')}
                </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="outline-none">
                <div className="grid grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="col-span-12 lg:col-span-9">
                        <ExecutiveSectorHealth 
                            sectors={[
                                {
                                    title: t('dashboard.tactical_flux'),
                                    icon: "layers",
                                    href: "/planning",
                                    metrics: [
                                        { label: t('dashboard.sync_success'), value: `${(opStats as any).fleet?.onTimeDelivery?.toFixed(1) || 0}%`, status: (opStats as any).fleet?.onTimeDelivery > 90 ? 'good' : 'warning' },
                                        { label: t('dashboard.current_pipeline'), value: statusDist.reduce((a: number, b: any) => a + (Number(b.value) || 0), 0), status: 'good' }
                                    ]
                                },
                                {
                                    title: t('dashboard.asset_readiness'),
                                    icon: "truck",
                                    href: "/vehicles",
                                    metrics: [
                                        { label: t('dashboard.fleet_capacity'), value: `${(opStats as any).fleet?.utilization?.toFixed(1) || 0}%`, status: (opStats as any).fleet?.utilization > 70 ? 'good' : 'warning' },
                                        { 
                                            label: t('dashboard.technical_status'), 
                                            value: (opStats as any).fleet?.health >= 90 ? t('dashboard.status_optimal') : (opStats as any).fleet?.health >= 50 ? t('dashboard.status_degraded') : t('dashboard.status_critical'), 
                                            status: (opStats as any).fleet?.health >= 90 ? 'good' : (opStats as any).fleet?.health >= 50 ? 'warning' : 'critical' 
                                        }
                                    ]
                                },
                                {
                                    title: t('dashboard.regional_node_index'),
                                    icon: "building",
                                    href: "/admin/analytics/regional",
                                    metrics: [
                                        { label: t('dashboard.active_branches'), value: branchPerf.length, status: 'good' },
                                        { label: t('dashboard.apex_vector'), value: (branchPerf[0] as any)?.branchName || 'N/A', status: 'good' }
                                    ]
                                }
                            ]}
                        />
                    </div>

                    <div className="col-span-12 lg:col-span-3">
                         <PremiumCard className="h-full overflow-hidden p-0 bg-background border border-border/5 shadow-xl rounded-2xl group/feed">
                             <div className="p-4 border-b border-border/5 bg-black/20 flex items-center justify-between">
                                <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest italic">{t('dashboard.operational_stream')}</h3>
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                             </div>
                             <div className="h-[210px] overflow-hidden">
                                <ActivityFeed 
                                    jobStats={{
                                        total: statusDist.reduce((a: number, b: any) => a + (Number(b.value) || 0), 0) || 0,
                                        pending: statusDist.find((x: any) => x.name === 'Pending' || x.name === 'New' || x.name === 'Draft')?.value || 0,
                                        inProgress: statusDist.find((x: any) => x.name === 'In Transit' || x.name === 'Picked Up' || x.name === 'Accepted')?.value || 0,
                                        delivered: statusDist.find((x: any) => x.name === 'Completed' || x.name === 'Delivered')?.value || 0
                                    }}
                                    sosCount={0}
                                    logs={[]}
                                />
                             </div>
                        </PremiumCard>
                    </div>

                    <div className="col-span-12">
                         <FinancialSummaryCards data={exeKPIs as any} />
                    </div>

                    <PremiumCard className="col-span-12 lg:col-span-8 p-6 bg-background border border-border/5 rounded-2xl shadow-xl overflow-hidden relative group">
                        <div className="absolute top-0 right-0 p-6 text-primary/5 pointer-events-none transition-transform group-hover:scale-110 duration-700"><BarChart3 size={100} /></div>
                        <h3 className="text-base font-black text-foreground uppercase tracking-widest italic mb-6 flex items-center gap-2">
                           <div className="w-1 h-4 bg-primary rounded-full" />
                           Pipeline Integrity
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {(statusDist || []).length === 0 ? (
                                <div className="col-span-full py-10 text-center text-[10px] font-black text-muted-foreground uppercase italic opacity-40">No data signals detected</div>
                            ) : statusDist.filter(Boolean).map((item: any) => (
                                <div key={item?.name || Math.random()} className="p-3 bg-muted/30 rounded-xl border border-border/5 group-hover:bg-muted/50 transition-colors">
                                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1 truncate">{item?.name || 'N/A'}</p>
                                    <p className="text-2xl font-black text-foreground italic">{item?.value || 0}</p>
                                </div>
                            ))}
                        </div>
                    </PremiumCard>

                    <div className="col-span-12 lg:col-span-4">
                         <PremiumCard className="h-full bg-black/40 border border-border/5 p-6 rounded-2xl">
                            <h3 className="text-sm font-black text-foreground italic uppercase mb-6 flex items-center gap-2">
                                <div className="w-1 h-4 bg-primary rounded-full" />
                                {t('dashboard.performance_kpi')}
                            </h3>
                            <div className="h-[200px] flex items-center justify-center">
                                <StatusDistributionChart data={statusDist} />
                            </div>
                         </PremiumCard>
                    </div>

                    {/* Driver Leaderboard — unique to overview, data from priority batch */}
                    <div className="col-span-12 lg:col-span-6">
                        <PremiumCard className="h-full bg-background border border-border/5 p-0 overflow-hidden rounded-2xl shadow-xl">
                            <div className="px-5 py-4 border-b border-border/5 bg-black/20 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 bg-amber-600 rounded-lg text-white shrink-0">
                                        <Trophy size={13} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-foreground uppercase">{t('dashboard.operator_elite')}</h3>
                                        <p className="text-[9px] text-amber-400 uppercase font-semibold tracking-wide">{t('dashboard.high_yield_performance_metrics')}</p>
                                    </div>
                                </div>
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            </div>
                            <div className="divide-y divide-white/[0.04]">
                                {(driverLeaderboard || []).length === 0 ? (
                                    <div className="py-12 text-center">
                                        <Users size={32} strokeWidth={1} className="mx-auto mb-3 text-muted-foreground/30" />
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{t('dashboard.performance_data_recalibrating')}</p>
                                    </div>
                                ) : (driverLeaderboard || []).filter(Boolean).slice(0, 5).map((d: any, i: number) => (
                                    <div key={i} className="px-5 py-3 flex items-center justify-between group hover:bg-muted/20 transition-colors border-l-2 border-transparent hover:border-amber-500/50">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={cn(
                                                "w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black shrink-0 border",
                                                i === 0 ? "bg-amber-500/20 border-amber-500/30 text-amber-300" : "bg-background border-border/20 text-muted-foreground"
                                            )}>#{i + 1}</div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-black text-foreground uppercase truncate">{d.name || d.driverName || 'Driver'}</p>
                                                <p className="text-[9px] text-emerald-400 font-semibold truncate">
                                                    {d.jobCount || d.trips || 0} {t('dashboard.missions_completed_prefix')}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 ml-3">
                                            <p className="text-sm font-black text-foreground tabular-nums">
                                                ฿{Math.round((d.revenue || d.earnings || 0) / 1000)}K
                                            </p>
                                            <p className="text-[9px] text-muted-foreground opacity-50 uppercase">yield</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </PremiumCard>
                    </div>

                    {/* Vehicle Profitability — unique to overview, data from priority batch */}
                    <div className="col-span-12 lg:col-span-6">
                        <PremiumCard className="h-full bg-background border border-border/5 p-0 overflow-hidden rounded-2xl shadow-xl">
                            <div className="px-5 py-4 border-b border-border/5 bg-black/20 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 bg-blue-600 rounded-lg text-white shrink-0">
                                        <Truck size={13} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-foreground uppercase">{t('dashboard.asset_readiness')}</h3>
                                        <p className="text-[9px] text-blue-400 uppercase font-semibold tracking-wide">{t('dashboard.fleet_capacity')}</p>
                                    </div>
                                </div>
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            </div>
                            <div className="divide-y divide-white/[0.04]">
                                {(vehicleProfitability || []).length === 0 ? (
                                    <div className="py-12 text-center">
                                        <Truck size={32} strokeWidth={1} className="mx-auto mb-3 text-muted-foreground/30" />
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{t('dashboard.performance_data_recalibrating')}</p>
                                    </div>
                                ) : (vehicleProfitability || []).filter(Boolean).slice(0, 5).map((v: any, i: number) => {
                                    const maxProfit = Math.max(...(vehicleProfitability || []).filter(Boolean).map((x: any) => x.netProfit || 0), 1)
                                    const pct = Math.max(0, Math.min(((v.netProfit || 0) / maxProfit) * 100, 100))
                                    return (
                                        <div key={i} className="px-5 py-3 group hover:bg-muted/20 transition-colors border-l-2 border-transparent hover:border-blue-500/50">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className="w-7 h-7 rounded-lg bg-background border border-border/20 flex items-center justify-center text-[9px] font-black text-foreground shrink-0">
                                                        {(v.plate || 'N/A').slice(0, 2)}
                                                    </div>
                                                    <p className="text-sm font-black text-foreground uppercase truncate">{v.plate}</p>
                                                </div>
                                                <div className="text-right shrink-0 ml-3">
                                                    <p className={cn("text-sm font-black tabular-nums", (v.netProfit || 0) >= 0 ? 'text-foreground' : 'text-rose-400')}>
                                                        ฿{Math.round(Math.abs(v.netProfit || 0) / 1000)}K
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-700"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </PremiumCard>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="financial" className="outline-none">
                <div className="grid grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="col-span-12">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-500 border border-emerald-500/30 group-hover/h:rotate-6 transition-transform">
                                <TrendingUp size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-foreground italic uppercase">{t('common.financial_node')}</h2>
                                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest opacity-60 italic">{t('analytics.commercial_monitoring')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-12">
                        <FinancialSummaryCards data={exeKPIs} />
                    </div>

                    <PremiumCard className="col-span-12 lg:col-span-8 overflow-hidden p-0 bg-background border border-border/5 shadow-xl rounded-2xl">
                        <div className="p-5 border-b border-border/5 bg-black/40 flex items-center justify-between">
                            <h3 className="text-sm font-black text-foreground italic uppercase flex items-center gap-2">
                                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                                Revenue Growth Vector
                            </h3>
                            <BarChart3 className="text-primary/40" size={16} />
                        </div>
                        <div className="p-6 h-[350px]"><RevenueTrendChart data={revenueTrend} /></div>
                    </PremiumCard>

                    <div className="col-span-12 lg:col-span-4">
                        {loadingSecondary ? <SectionSkeleton /> : <BillingSection data={billing} />}
                    </div>

                    <div className="col-span-12">
                        <RevenueForecastChart data={forecastData} />
                    </div>

                    <div className="col-span-12">
                        {loadingSecondary ? <SectionSkeleton /> : <CustomerRouteSection customers={topCustomers} routes={routes} />}
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="operations" className="outline-none">
                <div className="grid grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="col-span-12">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-blue-500/20 rounded-lg text-blue-500 border border-blue-500/30 group-hover/h:rotate-6 transition-transform">
                                <Truck size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-foreground italic uppercase">{t('common.mission_node')}</h2>
                                <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest opacity-60 italic">{t('analytics.fleet_deployment')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-12">
                        {loadingSecondary ? <SectionSkeleton /> : <FuelSection data={fuel} />}
                    </div>

                    <div className="col-span-12">
                        <ProfitabilitySection data={vehicleProfitability} financials={financials} />
                    </div>

                    <div className="col-span-12 lg:col-span-5">
                        {loadingSecondary ? <SectionSkeleton /> : <DelayAnalysis data={delayRootCause} />}
                    </div>

                    <div className="col-span-12">
                         {loadingSecondary ? <SectionSkeleton /> : <EfficiencyCharts data={revenueTrend} />}
                    </div>

                    <div className="col-span-12">
                         {loadingSecondary ? <SectionSkeleton /> : <MaintenanceSection data={maintenance} />}
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="drivers" className="outline-none">
                <div className="grid grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="col-span-12">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-500 border border-indigo-500/30 group-hover/h:rotate-6 transition-transform">
                                <Trophy size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-foreground italic uppercase">Operator Intelligence</h2>
                                <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest opacity-60 italic">Human Capital Performance Matrix</p>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-12 lg:col-span-4">
                        {loadingSecondary ? <SectionSkeleton /> : <WorkforceSection data={workforce} />}
                    </div>

                    <PremiumCard className="col-span-12 lg:col-span-8 overflow-hidden p-0 bg-background border border-border/5 shadow-xl rounded-2xl group/leaderboard">
                        <div className="p-5 border-b border-border/5 bg-black/40 flex items-center justify-between">
                            <h3 className="text-sm font-black text-foreground italic uppercase flex items-center gap-2">
                                <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                                Elite Asset Registry
                            </h3>
                            <Star className="text-amber-500 animate-pulse" size={16} />
                        </div>
                        <div className="divide-y divide-white/[0.03]">
                            {driverLeaderboard.length === 0 ? (
                                <div className="py-20 text-center text-[10px] font-black text-muted-foreground uppercase italic opacity-40">Awaiting operator telemetry data</div>
                            ) : ((driverLeaderboard || []).slice(0, 8) as any[]).map((driver: DriverStats, idx: number) => (
                                <div key={driver.name} className="px-6 py-3.5 flex items-center justify-between hover:bg-muted/30 transition-all group/item">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-black text-[10px] italic border border-border/5 transition-transform group-hover/item:scale-110">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-foreground uppercase italic leading-tight">{driver.name}</p>
                                            <p className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.2em]">{driver.completedJobs} Missions • {driver.onTimeRate?.toFixed(0) || 0}% Sync</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-black text-primary italic tracking-tight bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">฿{Math.round((driver.revenue || 0) / 1000)}K</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </PremiumCard>
                </div>
            </TabsContent>

            <TabsContent value="safety" className="outline-none">
                <div className="grid grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="col-span-12">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-rose-500/20 rounded-lg text-rose-500 border border-rose-500/30 group-hover/h:rotate-6 transition-transform">
                                <ShieldAlert size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-foreground italic uppercase">Integrity & ESG</h2>
                                <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest opacity-60 italic">Security Protocols & Environmental Metrics</p>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-12 space-y-6">
                        {loadingSecondary ? <><SectionSkeleton /><SectionSkeleton /></> : (
                            <>
                                <SafetySection data={safety} />
                                <ESGSection data={esgStats} />
                            </>
                        )}
                    </div>
                </div>
            </TabsContent>
        </Tabs>

        {/* Tactical Footer */}
        <div className="p-10 bg-background rounded-2xl border border-border/5 flex flex-col items-center text-center space-y-4 mt-16 relative overflow-hidden group shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
            <div className="p-2.5 bg-primary/20 rounded-xl shadow-lg border border-primary/30 group-hover:scale-110 transition-all duration-700">
                <Activity size={20} className="text-primary" />
            </div>
            <div className="space-y-1">
                <h4 className="text-sm font-black text-foreground uppercase tracking-[0.4em] italic leading-tight">{t('common.intel_engine')}</h4>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.2em] max-w-xl leading-relaxed opacity-60">
                    System cycle complete. Data nodes synchronized across regional clusters. <br/>
                    Neural processing accuracy maintained at 99.8%.
                </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-full border border-border/10">
               <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
               <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{t('common.sync_complete')}</span>
            </div>
        </div>
    </div>
  )
}
