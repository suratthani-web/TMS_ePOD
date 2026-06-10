"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { useLanguage } from "@/components/providers/language-provider"

interface StatusDistributionChartProps {
  data: Array<{ name: string; value: number }>
}

const COLORS = [
  '#FF1E85', // primary
  '#10B981', // emerald
  '#3B82F6', // blue
  '#6366F1', // indigo
  '#F59E0B', // amber
  '#EC4899', // pink
  '#8B5CF6', // violet
]

export function StatusDistributionChart({ data }: StatusDistributionChartProps) {
  const { t } = useLanguage()

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-30 italic text-[10px] font-black uppercase tracking-widest">
        No Signal Detected
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={5}
          dataKey="value"
          stroke="none"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            border: 'none',
            borderRadius: '12px',
            fontSize: '10px',
            fontWeight: '900',
            textTransform: 'uppercase',
            color: '#fff',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
          }}
          itemStyle={{ color: '#fff' }}
          cursor={{ fill: 'transparent' }}
        />
        <Legend 
            verticalAlign="bottom" 
            height={36}
            content={({ payload }) => (
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4">
                    {payload?.map((entry: { color?: string; value?: string | number }, index: number) => (
                        <div key={`item-${index}`} className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider italic">
                                {entry.value}: {data[index]?.value || 0}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
