"use client"

import { motion } from "framer-motion"
import {
  Fuel,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  Gauge,
  DollarSign,
  Droplets,
  Activity,
  Target
} from "lucide-react"
import type { FuelAnalytics } from "@/lib/supabase/fuel-analytics"
import { PremiumCard } from "@/components/ui/premium-card"
import { cn } from "@/lib/utils"

export function FuelAnalyticsDashboard({ analytics }: { analytics: FuelAnalytics }) {
  const maxCost = Math.max(...analytics.vehicleBreakdown.map(v => v.totalCost), 1)
  const maxMonthCost = Math.max(...analytics.monthlyTrends.map(m => m.totalCost), 1)

  return (
    <div className="space-y-8">
      {/* Tactical KPI Hub */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Volume", value: `${analytics.totalLiters.toLocaleString()} L`, sub: `${analytics.totalLogs} SYNC NODES`, icon: Droplets, color: "text-primary" },
          { label: "Net Expenditure", value: `฿${analytics.totalCost.toLocaleString()}`, sub: "TOTAL_COST", icon: DollarSign, color: "text-primary/80" },
          { label: "Unit Valuation", value: `฿${analytics.avgCostPerLiter.toFixed(2)}`, sub: "AVG_PRICE/L", icon: Fuel, color: "text-blue-400" },
          { label: "Fleet Efficiency", value: analytics.avgKmPerLiter || 'SECURE', sub: "AVG_KM/L", icon: Gauge, color: "text-accent/80", isEfficiency: true },
          { label: "Anomalies", value: analytics.anomalies.length, sub: "DIVERGENT", icon: AlertTriangle, color: "text-rose-500", isAnomaly: true }
        ].map((stat, i) => (
          <PremiumCard key={i} className={cn(
            "bg-background border border-border p-5 relative overflow-hidden group rounded-xl",
            stat.isAnomaly && analytics.anomalies.length > 0 && "border-rose-500/20 bg-rose-500/5 shadow-[0_0_20px_rgba(244,63,94,0.05)]"
          )}>
            <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">{stat.label}</span>
                <stat.icon size={14} className={cn(stat.color, "opacity-30 group-hover:opacity-100 transition-opacity")} />
            </div>
            <p className={cn("text-2xl font-black italic tracking-tighter mb-0.5", stat.isAnomaly && analytics.anomalies.length > 0 ? "text-rose-500" : "text-foreground")}>
                {stat.value}
                {stat.isEfficiency && <span className="text-[10px] ml-1">Km/L</span>}
            </p>
            <p className={cn("text-[9px] font-black uppercase tracking-widest opacity-60", stat.isAnomaly && "text-rose-700")}>{stat.sub}</p>
            <div className={cn("absolute bottom-0 left-0 h-0.5 w-8 rounded-full", stat.isAnomaly ? "bg-rose-500" : "bg-accent/40")} />
          </PremiumCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Temporal Trends */}
        <PremiumCard className="bg-background border border-border p-0 overflow-hidden rounded-2xl shadow-xl">
          <div className="p-5 border-b border-border bg-muted/30 flex items-center justify-between">
             <h3 className="text-sm font-black text-accent uppercase tracking-[0.4em] flex items-center gap-3 italic">
                <BarChart3 className="text-accent" size={16} />
                Temporal Drift
             </h3>
             <Activity className="text-primary/30" size={14} />
          </div>
          <div className="p-6 space-y-5">
            {analytics.monthlyTrends.length === 0 ? (
              <p className="text-xs font-black text-muted-foreground text-center py-10 uppercase tracking-widest">No temporal data detected</p>
            ) : (
              <div className="space-y-5">
                {analytics.monthlyTrends.map((month, i) => {
                  const prev = analytics.monthlyTrends[i - 1]
                  const change = prev ? ((month.totalCost - prev.totalCost) / prev.totalCost * 100) : 0
                  return (
                    <div key={month.month} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">{month.month}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{month.totalLiters.toLocaleString()} L</span>
                          <span className="text-sm font-black text-foreground italic">฿{month.totalCost.toLocaleString()}</span>
                          {prev && (
                            <div className={cn(
                               "px-1.5 py-0.5 rounded-md text-[9px] font-black flex items-center gap-1",
                               change > 0 ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-400'
                            )}>
                              {change > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                              {Math.abs(change).toFixed(0)}%
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden border border-border p-0.5">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(month.totalCost / maxMonthCost) * 100}%` }}
                          className="h-full bg-gradient-to-r from-primary to-purple-600 rounded-full shadow-[0_0_10px_rgba(255,30,133,0.3)]"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </PremiumCard>

        {/* Asset Yield Ranking */}
        <PremiumCard className="bg-background border border-border p-0 overflow-hidden rounded-2xl shadow-xl">
          <div className="p-5 border-b border-border bg-muted/30 flex items-center justify-between">
             <h3 className="text-sm font-black text-accent uppercase tracking-[0.4em] flex items-center gap-3 italic">
                <Fuel className="text-accent" size={16} />
                Asset Hierarchy
             </h3>
             <Target className="text-primary/30" size={14} />
          </div>
          <div className="p-6 space-y-4">
            {analytics.vehicleBreakdown.length === 0 ? (
              <p className="text-xs font-black text-muted-foreground text-center py-10 uppercase tracking-widest">No Asset data clusters found</p>
            ) : (
              <div className="space-y-4">
                {analytics.vehicleBreakdown.slice(0, 10).map((v, i) => (
                  <div key={v.vehicle_plate} className="group">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-lg bg-muted/50 border border-border/10 flex items-center justify-center text-[10px] font-black text-primary italic">
                          0{i + 1}
                        </span>
                        <span className="text-sm font-black text-foreground tracking-widest uppercase italic">{v.vehicle_plate}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{v.totalLiters} L</span>
                        {v.avgEfficiency > 0 && (
                          <span className={cn(
                             "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest",
                             v.avgEfficiency >= 8 ? 'bg-emerald-500/10 text-emerald-400' :
                             v.avgEfficiency >= 5 ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'
                          )}>
                            {v.avgEfficiency}
                          </span>
                        )}
                        <span className="text-sm font-black text-accent italic">฿{v.totalCost.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(v.totalCost / maxCost) * 100}%` }}
                        className="h-full bg-gradient-to-r from-primary to-purple-600 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PremiumCard>
      </div>

      {/* Anomalies Warning Console */}
      {analytics.anomalies.length > 0 && (
        <PremiumCard className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-0 overflow-hidden shadow-xl">
          <div className="p-5 bg-rose-500/10 border-b border-rose-500/20 flex items-center gap-3">
             <AlertTriangle className="text-rose-500 animate-pulse" size={18} />
             <h3 className="text-sm font-black text-foreground uppercase tracking-widest italic">Anomalous Consumptions Detected ({analytics.anomalies.length})</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analytics.anomalies.map((a, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-background border border-rose-500/10 hover:border-rose-500/30 transition-all group shadow-md">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20">
                       <AlertTriangle size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-foreground tracking-widest uppercase mb-0.5">{a.vehicle_plate}</p>
                      <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest opacity-80">{a.issue}</p>
                    </div>
                  </div>
                  <div className="text-right space-y-0.5">
                    <p className="text-xs font-black text-foreground italic">฿{a.cost.toLocaleString()}</p>
                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest italic">{a.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </PremiumCard>
      )}
    </div>
  )
}

