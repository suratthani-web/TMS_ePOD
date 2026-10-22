"use client"

import Link from "next/link"

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
import { SubcontractorPerformance } from "@/components/analytics/subcontractor-performance"
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

import React from 'react';

// Split state into two priority layers
interface PriorityData {
  financials: React.ComponentProps<typeof ProfitabilitySection>['financials'];
  revenueTrend: React.ComponentProps<typeof RevenueTrendChart>['data'];
  forecastData: React.ComponentProps<typeof RevenueForecastChart>['data'];
  exeKPIs: React.ComponentProps<typeof FinancialSummaryCards>['data'];
  opStats: Record<string, unknown>;
  statusDist: React.ComponentProps<typeof StatusDistributionChart>['data'];
  driverLeaderboard: { name?: string; driverName?: string; jobCount?: number; trips?: number; revenue?: number; earnings?: number; onTimeRate?: number; completedJobs?: number; [key: string]: unknown }[];
  vehicleProfitability: React.ComponentProps<typeof ProfitabilitySection>['data'];
  branchPerf: { branchName?: string; [key: string]: unknown }[];
}

interface SecondaryData {
  topCustomers: React.ComponentProps<typeof CustomerRouteSection>['customers'];
  subPerf: Record<string, unknown>[];
  routes: React.ComponentProps<typeof CustomerRouteSection>['routes'];
  billing: React.ComponentProps<typeof BillingSection>['data'];
  fuel: React.ComponentProps<typeof FuelSection>['data'];
  maintenance: React.ComponentProps<typeof MaintenanceSection>['data'];
  safety: React.ComponentProps<typeof SafetySection>['data'];
  workforce: React.ComponentProps<typeof WorkforceSection>['data'];
  esgStats: React.ComponentProps<typeof ESGSection>['data'];
  delayRootCause: React.ComponentProps<typeof DelayAnalysis>['data'];
  driverLeaderboard?: PriorityData['driverLeaderboard'];
}

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const SectionSkeleton = () => (
    <div className="w-full h-[300px] bg-muted/10 animate-pulse rounded-2xl border border-border flex items-center justify-center">
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

  const now = new Date()
  const defaultStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const defaultEndDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const effectiveStartDate = startDate || defaultStartDate
  const effectiveEndDate = endDate || defaultEndDate

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
              getExecutiveDashboardUnified(branchId, effectiveStartDate, effectiveEndDate),
              getRevenueForecast(branchId),
              getOperationalStats(branchId, effectiveStartDate, effectiveEndDate),
              getDriverLeaderboard(effectiveStartDate, effectiveEndDate, branchId),
              getVehicleProfitability(effectiveStartDate, effectiveEndDate, branchId),
              getBranchPerformance(effectiveStartDate, effectiveEndDate),
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
                vehicleProfitability: (vehicleProfitability || []) as unknown as PriorityData['vehicleProfitability'], 
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
            let results: Partial<SecondaryData> = {}
            if (tab === 'financial') {
              const [topCustomers, billing, routes] = await Promise.all([
                getTopCustomers(effectiveStartDate, effectiveEndDate, branchId),
                getBillingAnalytics(effectiveStartDate, effectiveEndDate, branchId),
                getRouteEfficiency(effectiveStartDate, effectiveEndDate, branchId)
              ])
              results = { topCustomers, billing, routes: routes as unknown as SecondaryData['routes'] }
            } else if (tab === 'operations') {
              const [fuel, routes, delayRootCause, maintenance, subPerf] = await Promise.all([
                getFuelAnalytics(effectiveStartDate, effectiveEndDate, branchId),
                getRouteEfficiency(effectiveStartDate, effectiveEndDate, branchId),
                getDelayRootCause(effectiveStartDate, effectiveEndDate, branchId),
                getMaintenanceSchedule(),
                getSubcontractorPerformance(effectiveStartDate, effectiveEndDate, branchId)
              ])
              results = { fuel, routes: routes as unknown as SecondaryData['routes'], delayRootCause, maintenance, subPerf: (subPerf || []) as unknown as SecondaryData['subPerf'] }
            } else if (tab === 'drivers') {
              const [workforce, driverLeaderboard] = await Promise.all([
                getWorkforceAnalytics(effectiveStartDate, effectiveEndDate, branchId),
                getDriverLeaderboard(effectiveStartDate, effectiveEndDate, branchId)
              ])
              results = { workforce, driverLeaderboard: driverLeaderboard as unknown as PriorityData['driverLeaderboard'] }
            } else if (tab === 'safety') {
              const [safety, esgStats] = await Promise.all([
                getSafetyAnalytics(effectiveStartDate, effectiveEndDate, branchId),
                getESGStats(effectiveStartDate, effectiveEndDate, branchId)
              ])
              results = { safety, esgStats }
            }
            setSecondary(prev => ({ ...(prev || {}), ...results } as SecondaryData))
        } finally {
            setLoadingSecondary(false)
        }
    }

    setLoadedTabs(prev => new Set(prev).add(tab))
  }, [effectiveStartDate, effectiveEndDate, branchId, priority, loadedTabs])

  useEffect(() => {
    setLoadedTabs(new Set())
    setPriority(null)
    setSecondary(null)
    loadTabData("overview")
  }, [effectiveStartDate, effectiveEndDate, branchId])

  useEffect(() => {
    loadTabData(activeTab)
  }, [activeTab, loadTabData])

  const isInitialLoading = loadingPrimary && activeTab === "overview"

  const {
    financials = { totalRevenue: 0, totalProfit: 0, margin: 0, growth: 0, cost: { total: 0, driver: 0, fuel: 0, maintenance: 0, predictedFuel: 0, predictedMaintenance: 0 } } as unknown as PriorityData['financials'],
    revenueTrend = [],
    forecastData = [],
    exeKPIs = { revenue: { current: 0, growth: 0 }, profit: { current: 0, growth: 0 }, margin: { current: 0, growth: 0 } } as unknown as PriorityData['exeKPIs'],
    opStats = { fleet: { onTimeDelivery: 0, utilization: 0, health: 0 } } as unknown as PriorityData['opStats'],
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
    } as unknown as SecondaryData['billing'],
    fuel = { 
      totalLiters: 0, 
      totalCost: 0, 
      avgCostPerLiter: 0, 
      avgKmPerLiter: 0,
      monthlyTrends: [],
      vehicleBreakdown: [],
      anomalies: [] 
    } as unknown as SecondaryData['fuel'],
    maintenance = { upcoming: [], overdue: [], dueSoon: [], activeRepairs: 0, completedThisMonth: 0, totalCostThisMonth: 0, vehicleHealthSummary: [] } as unknown as SecondaryData['maintenance'],
    safety = {
      sos: { total: 0, active: 0, resolved: 0, byReason: [], recentAlerts: [] },
      pod: { totalCompleted: 0, withPhoto: 0, withSignature: 0, complianceRate: 0 }
    } as unknown as SecondaryData['safety'],
    workforce = {
      kpis: { totalBox: 0, activeToday: 0, licenseExpiring: 0, licenseExpired: 0 },
      topPerformers: [],
      driversWithIssues: []
    } as unknown as SecondaryData['workforce'],
    esgStats = { 
      validJobsCount: 0,
      incompleteJobsCount: 0,
      co2EmissionsKg: 0,
      co2SavedKg: 0, 
      treesSaved: 0, 
      fuelConsumedLiters: 0,
      fuelSavedLiters: 0,
      totalSavedKm: 0, 
      efficiencyRate: 0, 
      scope1EmissionsKg: 0,
      scope3EmissionsKg: 0,
      dataTiering: {
        exactVolume: { count: 0, co2Kg: 0, pct: 0 },
        tonneKm: { count: 0, co2Kg: 0, pct: 0 },
        distanceEstimated: { count: 0, co2Kg: 0, pct: 0 },
      },
      tgoMetadata: {} as any,
      historicalData: [] 
    } as unknown as SecondaryData['esgStats'],
    delayRootCause = [],
  } = secondary ?? {}

  const currentDriverLeaderboard = (secondary?.driverLeaderboard && secondary.driverLeaderboard.length > 0)
    ? secondary.driverLeaderboard
    : (driverLeaderboard || [])

  const allData = {
    financials, revenueTrend, topCustomers, statusDist,
    branchPerf, subPerf, billing, fuel, maintenance,
    safety, workforce, routes, driverLeaderboard: currentDriverLeaderboard, vehicleProfitability,
    esgStats, opStats, delayRootCause
  }

  if (isInitialLoading) {
    return <div className="py-20 text-center font-semibold text-muted-foreground animate-pulse text-sm">{t('common.loading')}</div>
  }

  return (
    <div className="space-y-6">
        {/* Navigation Interface */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-card border border-border rounded-xl shadow-sm relative">
            <div className="flex items-center gap-3 relative z-10">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary border border-primary/20">
                    <Zap size={16} />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-foreground leading-none mb-1">{t('analytics.center_title')}</h3>
                    <p className="text-xs font-medium text-muted-foreground">{t('analytics.center_subtitle')}</p>
                </div>
            </div>

            <div className="flex items-center gap-2 relative z-10">
                <ExportAllButton data={allData} />
            </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-muted/50 p-1 rounded-lg border border-border inline-flex h-auto">
                <TabsTrigger value="overview" className="px-4 py-2 rounded-md text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
                    {t('common.overview')}
                </TabsTrigger>
                <TabsTrigger value="financial" className="px-4 py-2 rounded-md text-xs font-semibold data-[state=active]:bg-emerald-600 data-[state=active]:text-white transition-all">
                    {t('common.financial_node')}
                </TabsTrigger>
                <TabsTrigger value="operations" className="px-4 py-2 rounded-md text-xs font-semibold data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all">
                    {t('common.mission_node')}
                </TabsTrigger>
                <TabsTrigger value="drivers" className="px-4 py-2 rounded-md text-xs font-semibold data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all">
                    {t('navigation.drivers')}
                </TabsTrigger>
                <TabsTrigger value="safety" className="px-4 py-2 rounded-md text-xs font-semibold data-[state=active]:bg-rose-600 data-[state=active]:text-white transition-all">
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
                                        { label: t('dashboard.sync_success'), value: `${(opStats as { fleet?: { onTimeDelivery?: number} })?.fleet?.onTimeDelivery?.toFixed(1) || 0}%`, status: ((opStats as { fleet?: { onTimeDelivery?: number } })?.fleet?.onTimeDelivery || 0) > 90 ? 'good' : 'warning' },
                                        { label: t('dashboard.current_pipeline'), value: statusDist.reduce((a: number, b: { value?: number | string }) => a + (Number(b.value) || 0), 0), status: 'good' }
                                    ]
                                },
                                {
                                    title: t('dashboard.asset_readiness'),
                                    icon: "truck",
                                    href: "/vehicles",
                                    metrics: [
                                        { label: t('dashboard.fleet_capacity'), value: `${(opStats as { fleet?: { utilization?: number } })?.fleet?.utilization?.toFixed(1) || 0}%`, status: ((opStats as { fleet?: { utilization?: number } })?.fleet?.utilization || 0) > 70 ? 'good' : 'warning' },
                                        { 
                                            label: t('dashboard.technical_status'), 
                                            value: ((opStats as { fleet?: { health?: number } })?.fleet?.health || 0) >= 90 ? t('dashboard.status_optimal') : ((opStats as { fleet?: { health?: number } })?.fleet?.health || 0) >= 50 ? t('dashboard.status_degraded') : t('dashboard.status_critical'), 
                                            status: ((opStats as { fleet?: { health?: number } })?.fleet?.health || 0) >= 90 ? 'good' : ((opStats as { fleet?: { health?: number } })?.fleet?.health || 0) >= 50 ? 'warning' : 'critical' 
                                        }
                                    ]
                                },
                                {
                                    title: t('dashboard.regional_node_index'),
                                    icon: "building",
                                    href: "/admin/analytics/regional",
                                    metrics: [
                                        { label: t('dashboard.active_branches'), value: branchPerf.length, status: 'good' },
                                        { label: t('dashboard.apex_vector'), value: (branchPerf[0] as {branchName?: string})?.branchName || 'N/A', status: 'good' }
                                    ]
                                }
                            ]}
                        />
                    </div>

                    <div className="col-span-12 lg:col-span-3">
                         <PremiumCard className="h-full overflow-hidden p-0 bg-background border border-border shadow-xl rounded-2xl group/feed">
                             <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
                                <h3 className="text-xs font-semibold text-muted-foreground">{t('dashboard.operational_stream')}</h3>
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                             </div>
                             <div className="h-[210px] overflow-hidden">
                                <ActivityFeed 
                                    jobStats={{
                                        total: statusDist.reduce((a: number, b: { value?: number | string }) => a + (Number(b.value) || 0), 0) || 0,
                                        pending: statusDist.find((x: {name?: string; value?: number}) => x.name === 'Pending' || x.name === 'New' || x.name === 'Draft')?.value || 0,
                                        inProgress: statusDist.find((x: {name?: string; value?: number}) => x.name === 'In Transit' || x.name === 'Picked Up' || x.name === 'Accepted')?.value || 0,
                                        delivered: statusDist.find((x: {name?: string; value?: number}) => x.name === 'Completed' || x.name === 'Delivered')?.value || 0
                                    }}
                                    sosCount={0}
                                    logs={[]}
                                />
                             </div>
                        </PremiumCard>
                    </div>

                    <div className="col-span-12">
                         <FinancialSummaryCards data={exeKPIs} />
                    </div>

                    <PremiumCard className="col-span-12 lg:col-span-8 p-6 bg-background border border-border rounded-2xl shadow-xl overflow-hidden relative group">
                        <div className="absolute top-0 right-0 p-6 text-primary/5 pointer-events-none transition-transform group-hover:scale-110 duration-700"><BarChart3 size={100} /></div>
                        <h3 className="text-base font-semibold text-foreground mb-6 flex items-center gap-2">
                           <div className="w-1 h-4 bg-primary rounded-full" />
                           {t('analytics.pipeline_status')}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {(statusDist || []).length === 0 ? (
                                <div className="col-span-full py-10 text-center text-xs font-medium text-muted-foreground opacity-60">{t('analytics.no_data')}</div>
                            ) : statusDist.filter(Boolean).map((item: {name?: string; value?: number}) => (
                                <div key={item?.name || Math.random()} className="p-3 bg-muted/30 rounded-xl border border-border group-hover:bg-muted/50 transition-colors">
                                    <p className="text-xs font-medium text-muted-foreground mb-1 truncate">{item?.name || 'N/A'}</p>
                                    <p className="text-2xl font-bold text-foreground">{item?.value || 0}</p>
                                </div>
                            ))}
                        </div>
                    </PremiumCard>

                    <div className="col-span-12 lg:col-span-4">
                         <PremiumCard className="h-full bg-muted/30 border border-border p-6 rounded-2xl">
                            <h3 className="text-sm font-semibold text-foreground mb-6 flex items-center gap-2">
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
                        <PremiumCard className="h-full bg-background border border-border p-0 overflow-hidden rounded-2xl shadow-xl">
                            <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 bg-amber-600 rounded-lg text-white shrink-0">
                                        <Trophy size={13} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground">{t('dashboard.operator_elite')}</h3>
                                        <p className="text-[9px] text-amber-400 font-medium">{t('dashboard.high_yield_performance_metrics')}</p>
                                    </div>
                                </div>
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            </div>
                            <div className="divide-y divide-white/[0.04]">
                                {(driverLeaderboard || []).length === 0 ? (
                                    <div className="py-12 text-center">
                                        <Users size={32} strokeWidth={1} className="mx-auto mb-3 text-muted-foreground/30" />
                                        <p className="text-xs font-medium text-muted-foreground">{t('dashboard.performance_data_recalibrating')}</p>
                                    </div>
                                ) : (driverLeaderboard || []).filter(Boolean).slice(0, 5).map((d: {name?: string; driverName?: string; jobCount?: number; trips?: number; revenue?: number; earnings?: number; completedJobs?: number}, i: number) => (
                                    <div key={i} className="px-5 py-3 flex items-center justify-between group hover:bg-muted/20 transition-colors border-l-2 border-transparent hover:border-amber-500/50">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={cn(
                                                "w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold shrink-0 border",
                                                i === 0 ? "bg-amber-500/20 border-amber-500/30 text-amber-300" : "bg-background border-border/20 text-muted-foreground"
                                            )}>#{i + 1}</div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-foreground truncate">{d.name || d.driverName || 'Driver'}</p>
                                                <p className="text-[9px] text-emerald-400 font-semibold truncate">
                                                    {(d.completedJobs ?? d.jobCount ?? d.trips ?? 0)} {t('dashboard.missions_completed_prefix')}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0 ml-3">
                                            <p className="text-sm font-bold text-foreground tabular-nums">
                                                ฿{Math.round((d.revenue || d.earnings || 0) / 1000)}K
                                            </p>
                                            <p className="text-[10px] text-muted-foreground opacity-60">{t('analytics.yield_label')}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </PremiumCard>
                    </div>

                    {/* Vehicle Profitability — unique to overview, data from priority batch */}
                    <div className="col-span-12 lg:col-span-6">
                        <PremiumCard className="h-full bg-background border border-border p-0 overflow-hidden rounded-2xl shadow-xl">
                            <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-1.5 bg-blue-600 rounded-lg text-white shrink-0">
                                        <Truck size={13} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground">{t('dashboard.asset_readiness')}</h3>
                                        <p className="text-[9px] text-blue-400 font-medium">{t('dashboard.fleet_capacity')}</p>
                                    </div>
                                </div>
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            </div>
                            <div className="divide-y divide-white/[0.04]">
                                {(vehicleProfitability || []).length === 0 ? (
                                    <div className="py-12 text-center">
                                        <Truck size={32} strokeWidth={1} className="mx-auto mb-3 text-muted-foreground/30" />
                                        <p className="text-xs font-medium text-muted-foreground">{t('dashboard.performance_data_recalibrating')}</p>
                                    </div>
                                ) : (vehicleProfitability || []).filter(Boolean).slice(0, 5).map((v: {plate?: string; netProfit?: number}, i: number) => {
                                    const maxProfit = Math.max(...(vehicleProfitability || []).filter(Boolean).map((x: PriorityData['vehicleProfitability'][0]) => x.netProfit || 0), 1)
                                    const pct = Math.max(0, Math.min(((v.netProfit || 0) / maxProfit) * 100, 100))
                                    return (
                                        <div key={i} className="px-5 py-3 group hover:bg-muted/20 transition-colors border-l-2 border-transparent hover:border-blue-500/50">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className="w-7 h-7 rounded-lg bg-background border border-border/20 flex items-center justify-center text-[9px] font-bold text-foreground shrink-0">
                                                        {(v.plate || 'N/A').slice(0, 2)}
                                                    </div>
                                                    <p className="text-sm font-semibold text-foreground truncate">{v.plate}</p>
                                                </div>
                                                <div className="text-right shrink-0 ml-3">
                                                    <p className={cn("text-sm font-bold tabular-nums", (v.netProfit || 0) >= 0 ? 'text-foreground' : 'text-rose-400')}>
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
                                <h2 className="text-xl font-semibold text-foreground">{t('common.financial_node')}</h2>
                                <p className="text-xs font-medium text-emerald-500 opacity-80">{t('analytics.commercial_monitoring')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-12">
                        <FinancialSummaryCards data={exeKPIs} />
                    </div>

                    <PremiumCard className="col-span-12 overflow-hidden p-0 bg-background border border-border shadow-xl rounded-2xl">
                        <div className="p-5 border-b border-border bg-muted/30 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                                {t('analytics.revenue_growth')}
                            </h3>
                            <BarChart3 className="text-primary/40" size={16} />
                        </div>
                        <div className="p-6 min-h-[420px]"><RevenueTrendChart data={revenueTrend} /></div>
                    </PremiumCard>

                    <div className="col-span-12">
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
                                <h2 className="text-xl font-semibold text-foreground">{t('common.mission_node')}</h2>
                                <p className="text-xs font-medium text-blue-500 opacity-80">{t('analytics.fleet_deployment')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-12">
                        {loadingSecondary ? <SectionSkeleton /> : <FuelSection data={fuel} />}
                    </div>

                    <div className="col-span-12">
                        <ProfitabilitySection data={vehicleProfitability} financials={financials} startDate={effectiveStartDate} endDate={effectiveEndDate} />
                    </div>

                    <div className="col-span-12 lg:col-span-6">
                        {loadingSecondary ? <SectionSkeleton /> : <DelayAnalysis data={delayRootCause} />}
                    </div>

                    <div className="col-span-12 lg:col-span-6">
                        {loadingSecondary ? <SectionSkeleton /> : (
                            <PremiumCard className="h-full bg-card border border-border p-6 rounded-2xl shadow-sm">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-2 bg-blue-500/10 rounded-xl text-blue-500 border border-blue-500/20">
                                        <Truck size={18} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-foreground">สัดส่วนรถบริษัท vs รถร่วม</h3>
                                        <p className="text-xs text-muted-foreground">Fleet Distribution: Internal vs Subcontractor</p>
                                    </div>
                                </div>
                                <SubcontractorPerformance data={(subPerf || []) as any} />
                            </PremiumCard>
                        )}
                    </div>

                    <div className="col-span-12">
                         {loadingSecondary ? <SectionSkeleton /> : <EfficiencyCharts data={revenueTrend as unknown as React.ComponentProps<typeof EfficiencyCharts>['data']} />}
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
                                <h2 className="text-xl font-semibold text-foreground">{t('analytics.operator_intelligence')}</h2>
                                <p className="text-xs font-medium text-indigo-500 opacity-80">{t('analytics.operator_intelligence_sub')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="col-span-12">
                        {loadingSecondary ? <SectionSkeleton /> : <WorkforceSection data={workforce} />}
                    </div>

                    <PremiumCard className="col-span-12 overflow-hidden p-0 bg-background border border-border shadow-xl rounded-2xl group/leaderboard">
                        <div className="p-5 border-b border-border bg-muted/30 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-4 bg-indigo-500 rounded-full" />
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground">{t('analytics.elite_asset_registry')}</h3>
                                    <p className="text-xs text-muted-foreground">{t('analytics.operator_intelligence_sub')}</p>
                                </div>
                            </div>
                            <Link href="/admin/analytics/drivers" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                                {t('common.view_details') || 'ดูรายงานเชิงลึก'} &rarr;
                            </Link>
                        </div>
                        <div className="divide-y divide-border">
                            {currentDriverLeaderboard.length === 0 ? (
                                <div className="py-16 text-center text-xs font-medium text-muted-foreground opacity-60">{t('analytics.no_operator_data')}</div>
                            ) : (currentDriverLeaderboard.slice(0, 10) as unknown as DriverStats[]).map((driver: DriverStats, idx: number) => (
                                <div key={driver.name || idx} className="px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-all group/item">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-semibold text-[11px] border border-border transition-transform group-hover/item:scale-110">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-foreground leading-tight">{driver.name}</p>
                                            <p className="text-[11px] font-medium text-muted-foreground">{(driver.completedJobs ?? (driver as any).jobCount ?? (driver as any).trips ?? 0)} {t('dashboard.missions_completed_prefix')} • {driver.onTimeRate?.toFixed(0) || 0}% ตรงเวลา</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-md border border-primary/20">฿{Math.round((driver.revenue || 0) / 1000)}K</span>
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
                                <h2 className="text-xl font-semibold text-foreground">{t('analytics.integrity_esg')}</h2>
                                <p className="text-xs font-medium text-rose-500 opacity-80">{t('analytics.integrity_esg_sub')}</p>
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

        {/* Footer */}
        <div className="p-8 bg-card rounded-2xl border border-border flex flex-col items-center text-center space-y-3 mt-16">
            <div className="p-2.5 bg-primary/10 rounded-xl border border-primary/20">
                <Activity size={20} className="text-primary" />
            </div>
            <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground leading-tight">{t('common.intel_engine')}</h4>
                <p className="text-xs font-medium text-muted-foreground max-w-xl leading-relaxed opacity-80">
                    {t('analytics.footer_note')}
                </p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-full border border-border">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
               <span className="text-[11px] font-medium text-muted-foreground">{t('common.sync_complete')}</span>
            </div>
        </div>
    </div>
  )
}
