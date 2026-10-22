"use client"

import { 
    ScatterChart, 
    Scatter, 
    XAxis, 
    YAxis, 
    ZAxis,
    CartesianGrid, 
    Tooltip, 
    Cell
} from 'recharts'
import { PremiumCard } from "@/components/ui/premium-card"
import { ChartContainer } from "@/components/ui/chart-container"
import { TrendingUp, Target, BarChart3 } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"

export function EfficiencyCharts({ data }: { data: { date: string; revenue: number; cost: number; jobCount?: number; job_count?: number; total?: number; completed?: number }[] }) {
  const { t } = useLanguage()
  // Process data for correlation (Revenue vs Cost per Job)
  const correlationData = (data || [])
    .map(d => {
      const count = Number(d.jobCount ?? d.job_count ?? d.completed ?? d.total ?? 0)
      return {
        name: d.date,
        revenuePerJob: count > 0 ? (Number(d.revenue) || 0) / count : 0,
        costPerJob: count > 0 ? (Number(d.cost) || 0) / count : 0,
        jobCount: count
      }
    })
    .filter(d => d.jobCount > 0)

  const avgMargin = correlationData.length > 0 
    ? (correlationData.reduce((acc, curr) => acc + (curr.revenuePerJob - curr.costPerJob), 0) / correlationData.length) / 
      (correlationData.reduce((acc, curr) => acc + curr.revenuePerJob, 0) / correlationData.length) * 100
    : 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Revenue vs Cost Correlation - Large Matrix */}
      <PremiumCard className="lg:col-span-2 bg-muted/50 border border-border/10 shadow-3xl p-0 overflow-hidden rounded-br-[5rem] rounded-tl-[3rem]">
        <div className="p-8 border-b border-border/5 bg-gradient-to-r from-blue-500/20 via-blue-500/5 to-transparent backdrop-blur-md relative overflow-hidden flex items-center justify-between">
           <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent pointer-events-none" />
           <div className="flex items-center gap-3 relative z-10">
             <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg">
               <BarChart3 size={16} />
             </div>
             <div>
               <h3 className="text-lg font-black text-foreground tracking-tight italic uppercase">{t('charts.yield_optimization')}</h3>
               <p className="text-blue-400 text-base font-bold font-bold uppercase tracking-[0.2em]">{t('dashboard.operational_throughput')}</p>
             </div>
           </div>
        </div>
        <div className="p-10">
          <ChartContainer height={450}>
            <ScatterChart margin={{ top: 40, right: 40, bottom: 40, left: 0 }}>
              <defs>
                <linearGradient id="scatterGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis 
                type="number" 
                dataKey="costPerJob" 
                name={t('charts.unit_cost')} 
                unit="฿" 
                stroke="#64748b" 
                fontSize={10}
                fontWeight="900"
                tickLine={false}
                axisLine={false}
                label={{ value: t('charts.unit_cost').toUpperCase() + ' (฿)', position: 'insideBottom', offset: -20, fontSize: 10, fontWeight: 900, fill: '#94a3b8' }}
              />
              <YAxis 
                type="number" 
                dataKey="revenuePerJob" 
                name={t('charts.unit_revenue')} 
                unit="฿" 
                stroke="#64748b" 
                fontSize={10}
                fontWeight="900"
                tickLine={false}
                axisLine={false}
                label={{ value: t('charts.unit_revenue').toUpperCase() + ' (฿)', angle: -90, position: 'insideLeft', offset: 20, fontSize: 10, fontWeight: 900, fill: '#94a3b8' }}
              />
              <ZAxis type="number" dataKey="jobCount" range={[100, 1000]} name={t('charts.mission_volume')} />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3', stroke: '#3b82f6' }} 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900/95 p-6 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-md">
                        <p className="text-base font-bold font-black text-blue-400 uppercase tracking-widest mb-2 italic">{data.name}</p>
                        <div className="space-y-4">
                            <div className="flex justify-between gap-8">
                                <span className="text-white/60 text-base font-bold uppercase">{t('charts.unit_cost')}</span>
                                <span className="text-white font-black italic">฿{data.costPerJob.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between gap-8">
                                <span className="text-white/60 text-base font-bold uppercase">{t('charts.unit_revenue')}</span>
                                <span className="text-white font-black italic">฿{data.revenuePerJob.toLocaleString()}</span>
                            </div>
                            <div className="pt-2 border-t border-slate-800 flex justify-between gap-8">
                                <span className="text-emerald-400 text-base font-bold font-black uppercase">{t('charts.margin_yield')}</span>
                                <span className="text-emerald-400 font-black italic">+{((data.revenuePerJob - data.costPerJob) / data.revenuePerJob * 100).toFixed(1)}%</span>
                            </div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter name="Days" data={correlationData}>
                {correlationData.map((entry, index) => (
                    <Cell 
                        key={`cell-${index}`} 
                        fill={entry.revenuePerJob > entry.costPerJob ? '#10b981' : '#ef4444'} 
                        fillOpacity={0.8}
                        stroke={entry.revenuePerJob > entry.costPerJob ? '#059669' : '#dc2626'}
                        strokeWidth={2}
                    />
                ))}
              </Scatter>
            </ScatterChart>
          </ChartContainer>
        </div>
      </PremiumCard>

      {/* Efficiency Intelligence Hub */}
      <div className="flex flex-col gap-6 h-full">
        <PremiumCard className="bg-background border-none shadow-2xl relative overflow-hidden group p-8 rounded-br-[3rem] rounded-tl-[1.5rem] flex-1 flex flex-col justify-between">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent pointer-events-none" />
            <div className="flex items-center justify-between mb-8 relative z-10">
              <div className="space-y-1">
                <span className="text-emerald-400 text-base font-bold font-black uppercase tracking-[0.2em] italic">{t('charts.yield_index')}</span>
                <p className="text-base font-bold text-muted-foreground font-bold uppercase tracking-widest italic">{t('charts.temporal_revenue')}</p>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 shadow-xl shadow-emerald-500/10">
                <Target size={24} />
              </div>
            </div>
            
            <div className="space-y-8 relative z-10">
                <div>
                   <div className="text-5xl font-black text-foreground tracking-tighter italic">{avgMargin.toFixed(1)}%</div>
                   <p className="text-base font-bold text-emerald-400 font-black uppercase tracking-widest mt-2">{t('charts.margin_yield')}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-border">
                    <div>
                        <p className="text-base font-bold text-muted-foreground font-black uppercase tracking-widest mb-1">{t('charts.volatility')}</p>
                        <p className="text-xl font-black text-foreground italic">{t('charts.low_stable')}</p>
                    </div>
                    <div>
                        <p className="text-base font-bold text-muted-foreground font-black uppercase tracking-widest mb-1">{t('charts.optimization')}</p>
                        <p className="text-xl font-black text-emerald-400 italic">{t('charts.peak')}</p>
                    </div>
                </div>

                <div className="bg-card/50 p-6 rounded-2xl border border-slate-800">
                    <p className="text-base font-bold text-muted-foreground font-bold leading-relaxed italic">
                        {t('analytics.operational_cost_mapping')}
                    </p>
                </div>
            </div>
        </PremiumCard>

        <PremiumCard className="bg-indigo-600 border-none shadow-2xl relative overflow-hidden group p-8 rounded-br-[3rem] rounded-tl-[1.5rem]">
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
            <div className="flex items-center gap-4 relative z-10">
                <div className="p-2 bg-muted/80 rounded-xl text-foreground">
                    <TrendingUp size={16} />
                </div>
                <div className="text-xl font-black text-white tracking-tight italic uppercase">{t('charts.recommendation')}</div>
            </div>
            <p className="text-base font-bold text-indigo-100 font-bold mt-4 relative z-10 italic leading-tight">
                {t('analytics.strategic_recommendation')}
            </p>
        </PremiumCard>
      </div>
    </div>
  )
}

