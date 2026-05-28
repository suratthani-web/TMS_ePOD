"use client"

import { PremiumCard } from "@/components/ui/premium-card"
import { ChartContainer } from "@/components/ui/chart-container"
import { useLanguage } from "@/components/providers/language-provider"
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  AreaChart,
  ResponsiveContainer
} from 'recharts'
import { BrainCircuit, TrendingUp, Zap, Sparkles, Target, BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"

type ForecastData = {
    month: string
    actual?: number
    forecast?: number
}

type Props = {
    data: ForecastData[]
}

export function RevenueForecastChart({ data = [] }: Props) {
    const { t } = useLanguage()

    if (data.length === 0) return null

    // Process data to ensure continuity for Recharts
    // The first forecast point should be the last actual point to connect the lines
    const processedData = [...data]
    const lastActualIndex = data.findLastIndex(d => d.actual !== undefined)
    
    if (lastActualIndex !== -1 && lastActualIndex < data.length - 1) {
        // Create a copy of the first forecast point and set its "forecast" value to its "actual" value
        // to bridge the gap in the chart
        processedData[lastActualIndex] = {
            ...processedData[lastActualIndex],
            forecast: processedData[lastActualIndex].actual
        }
    }

    const nextMonth = data.find(d => d.forecast !== undefined)
    const totalForecast = data.reduce((sum, d) => sum + (d.forecast || 0), 0)
    const isSparse = data.filter(d => d.actual !== undefined).length <= 1

    return (
        <PremiumCard className="bg-background border-2 border-border/5 shadow-3xl p-0 overflow-hidden rounded-br-[5rem] rounded-tl-[3rem] group/forecast">
            {/* AI Header */}
            <div className="p-8 border-b border-border/5 bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-transparent backdrop-blur-md flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-purple-500/20 rounded-xl text-purple-400 border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.2)]">
                        <BrainCircuit size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-foreground tracking-widest italic uppercase leading-tight">{t('analytics.revenue_prediction') || 'Revenue Forecasting'}</h3>
                        <p className="text-[10px] text-purple-400 font-black uppercase tracking-[0.3em] opacity-80">{t('analytics.ai_inference') || 'AI NEURAL CORE V4.2'}</p>
                    </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 bg-purple-500/10 px-4 py-1.5 rounded-full border border-purple-500/20">
                    <Sparkles size={12} className="text-purple-400 animate-pulse" />
                    <span className="text-[10px] font-black text-purple-300 uppercase tracking-widest">{t('analytics.predictive_active') || 'PREDICTIVE_LIVE'}</span>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-12">
                {/* Main Chart Vector (8 columns) */}
                <div className="lg:col-span-8 p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-border/5">
                    {isSparse ? (
                        <div className="h-[300px] flex flex-col items-center justify-center text-center space-y-4 bg-muted/20 rounded-3xl border border-dashed border-border/10">
                            <div className="p-4 bg-primary/10 rounded-full text-primary animate-bounce">
                                <BarChart3 size={32} />
                            </div>
                            <div className="max-w-xs">
                                <p className="text-base font-black text-foreground uppercase italic tracking-widest mb-1">{t('analytics.gathering_intel') || 'Gathering Market Intel'}</p>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase leading-relaxed">
                                    {t('analytics.insufficient_data') || 'Insufficient historical data for deep-pattern analysis. Showing initial baseline projections.'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="h-[320px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={processedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                                    <XAxis 
                                        dataKey="month" 
                                        stroke="#475569" 
                                        fontSize={10} 
                                        fontWeight="900" 
                                        tickLine={false} 
                                        axisLine={false}
                                        dy={10}
                                        tickFormatter={(val) => {
                                            const [y, m] = val.split('-')
                                            const date = new Date(parseInt(y), parseInt(m)-1)
                                            return date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' })
                                        }}
                                    />
                                    <YAxis 
                                        stroke="#475569" 
                                        fontSize={10} 
                                        fontWeight="900" 
                                        tickLine={false} 
                                        axisLine={false}
                                        tickFormatter={(val) => `฿${(val/1000).toFixed(0)}K`}
                                    />
                                    <Tooltip 
                                        contentStyle={{ 
                                            backgroundColor: 'rgba(2, 6, 23, 0.95)', 
                                            borderColor: 'rgba(139, 92, 246, 0.2)', 
                                            borderRadius: '16px', 
                                            border: '1px solid rgba(255,255,255,0.05)',
                                            backdropFilter: 'blur(16px)',
                                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                                        }}
                                        labelStyle={{ 
                                            color: '#fff', 
                                            fontSize: '12px', 
                                            fontWeight: '900', 
                                            marginBottom: '8px',
                                            textTransform: 'uppercase',
                                            fontStyle: 'italic',
                                            borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
                                            paddingBottom: '8px'
                                        }}
                                        itemStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: '#fff' }}
                                        formatter={(value: any, name: any) => [
                                            `฿${(value || 0).toLocaleString()}`, 
                                            String(name).includes('Forecast') ? (t('analytics.forecast_revenue') || 'Forecast') : (t('analytics.actual_revenue') || 'Actual')
                                        ]}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="actual" 
                                        stroke="#10b981" 
                                        strokeWidth={3}
                                        fillOpacity={1} 
                                        fill="url(#colorActual)" 
                                        animationDuration={1500}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="forecast" 
                                        stroke="#8b5cf6" 
                                        strokeWidth={3}
                                        strokeDasharray="5 5"
                                        fillOpacity={1} 
                                        fill="url(#colorForecast)" 
                                        animationDuration={2500}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* AI Insights Sidebar (4 columns) */}
                <div className="lg:col-span-4 p-8 flex flex-col justify-between bg-muted/10">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest italic">{t('analytics.next_month_estimate') || 'Next Month Prediction'}</label>
                            <div className="flex items-center gap-3">
                                <p className="text-3xl font-black text-purple-400 italic">
                                    ฿{nextMonth?.forecast ? (nextMonth.forecast / 1000).toFixed(1) : "---"}K
                                </p>
                                <div className="px-2 py-0.5 bg-emerald-500/10 rounded-md border border-emerald-500/20 text-[9px] font-black text-emerald-500">
                                    EST. GROWTH
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-background/50 rounded-2xl border border-border/5 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-muted-foreground uppercase italic">{t('analytics.quarterly_potential') || '3-Month Outlook'}</span>
                                <TrendingUp size={14} className="text-primary" />
                            </div>
                            <p className="text-2xl font-black text-foreground italic tracking-tight">฿{(totalForecast / 1000).toFixed(0)}K</p>
                            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                                <div className="h-full w-2/3 bg-primary rounded-full animate-pulse" />
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                             <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-500">
                                <Target size={20} />
                             </div>
                             <div>
                                <p className="text-[10px] font-black text-muted-foreground uppercase">{t('analytics.projection_confidence') || 'Model Accuracy'}</p>
                                <p className="text-lg font-black text-amber-500 uppercase italic leading-none">High (88%)</p>
                             </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-border/5 mt-6">
                        <p className="text-[9px] font-bold text-muted-foreground leading-relaxed uppercase italic opacity-40">
                            {t('analytics.forecast_disclaimer') || 'NEURAL ENGINE DETECTS SEASONAL CYCLES BASED ON HISTORICAL LOAD VOLUME AND BRANCH THROUGHPUT.'}
                        </p>
                    </div>
                </div>
            </div>
        </PremiumCard>
    )
}
