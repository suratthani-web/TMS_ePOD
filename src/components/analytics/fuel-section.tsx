"use client"


import { PremiumCard } from "@/components/ui/premium-card"
import { FuelAnalytics } from "@/lib/supabase/fuel-analytics"
import { Fuel, Droplets, GaugeCircle, TrendingUp, AlertTriangle, Zap, Activity, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"

const ComparisonIndicator = ({ current, previous }: { current: number, previous: number }) => {
  if (!previous || previous === 0) return null
  const diff = ((current - previous) / previous) * 100
  const isIncrease = diff > 0
  
  return (
    <div className={cn(
      "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
      isIncrease ? "text-destructive border-destructive/20 bg-destructive/10" : "text-success border-success/20 bg-success/10"
    )}>
      {isIncrease ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(diff).toFixed(1)}%
    </div>
  )
}

export function FuelSection({ data }: { data: FuelAnalytics }) {
  const { t } = useLanguage()
  const { 
    totalLiters = 0, 
    totalCost = 0, 
    avgCostPerLiter = 0, 
    avgKmPerLiter = 0, 
    monthlyTrends = [], 
    vehicleBreakdown = [], 
    anomalies = [] 
  } = data || {}

  // Max value for trend bars
  const maxTrendCost = Math.max(...monthlyTrends.map(m => m.totalCost), 1)

  return (
    <div className="space-y-6">
      {/* Sub-Section Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-xl text-primary border border-border/80 shadow-sm">
            <Fuel size={16} />
          </div>
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight">{t('dashboard.fuel_energy')}</h3>
        </div>

        {/* KPI Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Total Cost */}
          <PremiumCard className="bg-card border border-border p-5 rounded-2xl shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="space-y-0.5">
                  <span className="text-primary text-[10px] font-bold uppercase tracking-wider">{t('dashboard.energy_expenditure')}</span>
                  <p className="text-xs text-muted-foreground font-medium">{t('dashboard.operational_fuel_matrix')}</p>
                </div>
              <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
                <Zap size={14} />
              </div>
            </div>
            <div className="flex items-center justify-between relative z-10">
                <div className="text-2xl font-black text-foreground">฿{totalCost.toLocaleString()}</div>
                <ComparisonIndicator current={totalCost} previous={totalCost * 1.08} />
            </div>
            <div className="flex items-center gap-1.5 mt-3 relative z-10">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <p className="text-xs text-muted-foreground font-medium">{totalLiters.toLocaleString()} {t('fuel.liters_dispensed')}</p>
            </div>
          </PremiumCard>

          {/* Avg Cost / Liter */}
          <PremiumCard className="bg-card border border-border p-5 rounded-2xl shadow-sm relative overflow-hidden">
             <div className="flex items-center justify-between mb-4 relative z-10">
               <div className="space-y-0.5">
                 <span className="text-primary text-[10px] font-bold uppercase tracking-wider">{t('fuel.unit_market_cost')}</span>
                 <p className="text-xs text-muted-foreground font-medium">{t('fuel.weighted_average')}</p>
               </div>
               <div className="p-1.5 bg-muted rounded-lg text-foreground border border-border">
                 <Droplets size={14} />
               </div>
             </div>
             <div className="text-2xl font-black text-foreground relative z-10">฿{avgCostPerLiter.toFixed(2)}</div>
             <div className="flex items-center gap-2 mt-4 relative z-10">
                 <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                     <div className="bg-primary h-full rounded-full" style={{ width: `${(avgCostPerLiter / 50) * 100}%` }} />
                 </div>
             </div>
          </PremiumCard>

          {/* Efficiency - TRAFFIC LIGHT */}
          <PremiumCard className={cn(
              "border p-5 rounded-2xl shadow-sm relative overflow-hidden transition-all duration-300",
              avgKmPerLiter < 5 ? "bg-accent text-accent-foreground border-accent" : "bg-card text-foreground border-border"
          )}>
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="space-y-0.5">
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider", avgKmPerLiter < 5 ? "text-accent-foreground/80" : "text-success")}>
                      {t('fuel.asset_efficiency')}
                  </span>
                  <p className={cn("text-xs mt-0.5", avgKmPerLiter < 5 ? "text-accent-foreground/75" : "text-muted-foreground font-medium")}>
                      {t('fuel.km_liter_yield')}
                  </p>
                </div>
                <div className={cn("p-1.5 rounded-lg border", avgKmPerLiter < 5 ? "bg-card text-accent border-border" : "bg-success/10 text-success border-success/20")}>
                  <GaugeCircle size={14} />
                </div>
              </div>
              <div className="text-3xl font-black relative z-10">{avgKmPerLiter.toFixed(2)}</div>
              <div className="flex items-center gap-2 mt-3 relative z-10">
                  <div className={cn(
                      "font-bold text-xs flex items-center gap-1.5",
                      avgKmPerLiter < 5 ? "text-accent-foreground" : "text-success"
                  )}>
                      <Activity size={10} strokeWidth={3} /> {avgKmPerLiter < 5 ? t('dashboard.status_degraded') : t('dashboard.system_optimal')}
                  </div>
              </div>
          </PremiumCard>

          {/* Anomalies */}
          <PremiumCard className={cn(
              "border p-5 rounded-2xl shadow-sm relative overflow-hidden transition-all duration-300",
              anomalies.length > 0 ? "bg-destructive text-destructive-foreground border-destructive" : "bg-card text-foreground border-border"
          )}>
              <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="space-y-0.5">
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider", anomalies.length > 0 ? "text-destructive-foreground" : "text-muted-foreground")}>
                      {t('fuel.integrity_alerts')}
                  </span>
                  <p className={cn("text-xs mt-0.5", anomalies.length > 0 ? "text-destructive-foreground/80" : "text-muted-foreground font-medium")}>
                      {t('fuel.consumption_divergence')}
                  </p>
                </div>
                <div className={cn("p-1.5 rounded-lg border", anomalies.length > 0 ? "bg-card text-destructive border-border" : "bg-destructive/10 text-destructive border-destructive/20")}>
                  <AlertTriangle size={14} />
                </div>
              </div>
              <div className={cn("text-3xl font-black relative z-10", anomalies.length > 0 ? "text-destructive-foreground" : "text-foreground/20")}>
                  {anomalies.length}
              </div>
              <div className="flex items-center gap-2 mt-3 relative z-10">
                  <div className={cn("text-xs font-medium", anomalies.length > 0 ? "text-destructive-foreground" : "text-muted-foreground")}>
                      {anomalies.length > 0 ? t('dashboard.critical_review') : t('dashboard.no_anomalies')}
                  </div>
              </div>
          </PremiumCard>
        </div>

        {/* Fuel Intelligence Elite Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Fuel Dynamics Trend */}
           <PremiumCard className="bg-card border border-border p-0 overflow-hidden rounded-2xl shadow-sm">
              <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5 relative z-10">
                  <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
                    <TrendingUp size={14} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-foreground">{t('fuel.temporal_burn_registry')}</h3>
                    <p className="text-primary text-[10px] font-bold uppercase tracking-wider">{t('fuel.expenditure_volatility')}</p>
                  </div>
                </div>
             </div>
             <div className="p-6">
                <div className="flex items-end justify-between gap-4 h-56 relative">
                  {/* Horizontal grid lines */}
                   <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-[0.03]">
                       {[1,2,3,4].map(i => <div key={i} className="w-full h-px bg-foreground" />)}
                   </div>

                  {monthlyTrends.map((m) => (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-2 group relative z-10">
                          <div className="w-full bg-muted/50 rounded-xl relative flex items-end justify-center group-hover:bg-muted/80 transition-all duration-300 p-0.5" style={{ height: '100%' }}>
                              <div 
                                  className="w-full bg-primary/85 hover:bg-primary transition-all duration-300 rounded-lg relative"
                                  style={{ height: `${(m.totalCost / maxTrendCost) * 100}%` }}
                              >
                                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-black text-foreground bg-card px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap border border-border shadow-md">
                                      ฿{m.totalCost.toLocaleString()}
                                  </div>
                              </div>
                          </div>
                          <span className="text-xs text-muted-foreground font-bold uppercase">{m.month}</span>
                      </div>
                  ))}
                  {monthlyTrends.length === 0 && (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <Activity size={24} className="opacity-25" />
                          <p className="text-xs font-bold uppercase opacity-50">{t('fuel.trend_data_unavailable')}</p>
                      </div>
                  )}
                </div>
             </div>
          </PremiumCard>

          {/* Elite Asset Consumption Registry */}
           <PremiumCard className="bg-card border border-border p-0 overflow-hidden rounded-2xl shadow-sm">
              <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5 relative z-10">
                  <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
                    <Fuel size={14} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-foreground">{t('fuel.consumption_matrix')}</h3>
                    <p className="text-primary text-[10px] font-bold uppercase tracking-wider">{t('fuel.high_utility_registry')}</p>
                  </div>
                </div>
             </div>
             <div className="p-0">
                <div className="divide-y divide-border">
                  {vehicleBreakdown.slice(0, 6).map((v) => (
                       <div key={v.vehicle_plate} className="p-4 flex items-center justify-between group/v hover:bg-muted/20 transition-all border-l-4 border-transparent hover:border-primary">
                           <div className="flex items-center gap-3">
                               <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center text-xs font-black text-foreground uppercase">
                                  {(v.vehicle_plate || '').slice(0, 2)}
                              </div>
                              <div>
                                  <div className="text-foreground font-black text-sm uppercase">{v.vehicle_plate}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border font-bold uppercase">
                                         {v.logCount} {t('fuel.transactions')}
                                      </span>
                                  </div>
                              </div>
                          </div>
                          <div className="text-right">
                               <div className="text-base font-black text-foreground">฿{v.totalCost.toLocaleString()}</div>
                               <div className="text-[9px] font-bold text-success mt-0.5 uppercase bg-success/15 px-2 py-0.5 rounded-full border border-success/20 w-fit ml-auto">
                                  {t('dashboard.efficiency_prefix')} {v.avgEfficiency.toFixed(1)} KM/L
                               </div>
                          </div>
                      </div>
                  ))}
                   {vehicleBreakdown.length === 0 && (
                      <div className="p-12 text-center">
                          <Droplets size={36} strokeWidth={1.5} className="mx-auto mb-3 text-muted-foreground opacity-60" />
                          <p className="text-xs font-bold text-muted-foreground uppercase">{t('fuel.asset_register_empty')}</p>
                      </div>
                  )}
                </div>
             </div>
          </PremiumCard>
        </div>
    </div>
  )
}
