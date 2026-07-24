"use client"

import { PremiumCard } from "@/components/ui/premium-card"
import { ChartContainer } from "@/components/ui/chart-container"
import { useLanguage } from "@/components/providers/language-provider"
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  Legend 
} from 'recharts'
import { AlertCircle, ShieldAlert } from "lucide-react"

type DelayData = {
    name: string
    value: number
}

type Props = {
    data: DelayData[]
}

const COLORS = [
    '#f43f5e', // rose
    '#fbbf24', // amber
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#10b981', // emerald
]

export function DelayAnalysis({ data = [] }: Props) {
    const { t } = useLanguage()
    
    const total = data.reduce((sum, item) => sum + item.value, 0)

    if (data.length === 0) {
        return (
            <PremiumCard className="bg-muted/50 border border-border/10 shadow-3xl p-12 text-center rounded-br-[4rem] rounded-tl-[2rem]">
                <div className="flex flex-col items-center gap-4 text-muted-foreground">
                    <ShieldAlert size={48} strokeWidth={1} />
                    <p className="text-base font-bold font-black uppercase italic">{t('analytics.no_delay_data') || 'No Delay Root Cause Data'}</p>
                </div>
            </PremiumCard>
        )
    }

    return (
        <PremiumCard className="bg-muted/50 border border-border/10 shadow-3xl p-0 overflow-hidden rounded-br-[4rem] rounded-tl-[2rem] group/delays">
            <div className="p-10 border-b border-border/5 bg-gradient-to-r from-rose-500/20 via-rose-500/5 to-transparent backdrop-blur-md relative overflow-hidden flex items-center justify-between">
                <div className="absolute inset-0 bg-gradient-to-r from-rose-500/10 to-transparent pointer-events-none" />
                <div className="flex items-center gap-5 relative z-10">
                    <div className="p-3 bg-rose-500/20 rounded-2xl text-rose-500 border border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.2)]">
                        <AlertCircle size={22} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-foreground tracking-tighter italic uppercase">{t('analytics.delay_root_cause') || 'Analysis of Delays'}</h3>
                        <p className="text-rose-500 text-base font-bold font-black uppercase italic">{t('analytics.failure_distribution') || 'Job Failure Distribution'}</p>
                    </div>
                </div>
            </div>
            
            <div className="p-10">
                <ChartContainer height={350}>
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={110}
                                paddingAngle={5}
                                dataKey="value"
                                stroke="none"
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} fillOpacity={0.8} />
                                ))}
                            </Pie>
                            <Tooltip 
                                contentStyle={{ 
                                    backgroundColor: 'rgba(2, 6, 23, 0.95)', 
                                    border: '2px solid rgba(255,255,255,0.1)', 
                                    borderRadius: '24px', 
                                    backdropFilter: 'blur(12px)',
                                    padding: '15px'
                                }}
                                labelStyle={{ 
                                    color: '#fff', 
                                    fontSize: '12px', 
                                    fontWeight: '900', 
                                    marginBottom: '8px',
                                    textTransform: 'uppercase',
                                    fontStyle: 'italic',
                                    borderBottom: '1px solid rgba(244, 63, 94, 0.2)',
                                    paddingBottom: '8px'
                                }}
                                itemStyle={{ fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', color: '#fff' }}
                                formatter={(value) => [`${value ?? 0} ${t('common.units')}`, t('common.status')]}
                            />
                            <Legend 
                                layout="vertical" 
                                align="right" 
                                verticalAlign="middle"
                                iconType="circle"
                                formatter={(value) => <span className="text-[11px] font-black text-muted-foreground uppercase italic ml-2">{value}</span>}
                            />
                        </PieChart>
                </ChartContainer>
                    <div className="text-center mt-4 pointer-events-none">
                        <span className="text-base font-bold font-black text-muted-foreground uppercase leading-none mb-1">TOTAL</span>
                        <span className="text-4xl font-black text-foreground tracking-tighter italic ml-2">{total}</span>
                    </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-8">
                    {data.slice(0, 6).map((item, index) => (
                        <div key={item.name} className="p-4 bg-muted/30 rounded-2xl border border-border/5 flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                <span className="text-[10px] font-black text-muted-foreground uppercase truncate">{item.name}</span>
                            </div>
                            <div className="text-foreground italic">
                                {((item.value / total) * 100).toFixed(1)}%
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </PremiumCard>
    )
}
