"use client"

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { ChartContainer } from "@/components/ui/chart-container"
import { useLanguage } from "@/components/providers/language-provider"

type RevenueData = {
  date: string
  revenue: number
  cost: number
}

export function RevenueTrendChart({ data }: { data: RevenueData[] }) {
  const { t } = useLanguage()

  return (
    <ChartContainer height={500}>
        <AreaChart
          data={data}
          margin={{ top: 40, right: 40, left: 0, bottom: 20 }}
        >
          <defs>
            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ff1e85" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#ff1e85" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7000ff" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#7000ff" stopOpacity={0}/>
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a1b4d" vertical={false} opacity={0.3} />
          <XAxis 
            dataKey="date" 
            stroke="#64748b" 
            fontSize={11} 
            fontWeight="900"
            tickLine={false} 
            axisLine={false}
            dy={20}
            className="uppercase italic"
          />
          <YAxis 
            stroke="#64748b" 
            fontSize={11} 
            fontWeight="900"
            tickLine={false} 
            axisLine={false}
            tickFormatter={(value) => `฿${value >= 1000 ? (value / 1000) + 'K' : value}`}
          />
          <Tooltip 
            cursor={{ stroke: '#ff1e85', strokeWidth: 2, strokeDasharray: '4 4' }}
            contentStyle={{ 
                backgroundColor: 'rgba(5, 1, 16, 0.95)', 
                borderColor: 'rgba(255, 30, 133, 0.3)', 
                borderRadius: '24px', 
                border: '2px solid rgba(255, 30, 133, 0.2)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 30px 60px -12px rgba(0, 0, 0, 0.8)'
            }}
            labelStyle={{ 
                color: '#fff', 
                fontSize: '12px', 
                fontWeight: '900', 
                marginBottom: '8px',
                textTransform: 'uppercase',
                fontStyle: 'italic',
                borderBottom: '1px solid rgba(255, 30, 133, 0.2)',
                paddingBottom: '8px'
            }}
            itemStyle={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', color: '#fff' }}
            formatter={(value) => [
              new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(Number(value || 0)), 
              ''
            ]}
          />
          <Legend 
            verticalAlign="top" 
            align="right" 
            iconType="rect" 
            wrapperStyle={{ paddingBottom: '40px', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', fontStyle: 'italic' }} 
          />
          <Area 
            type="monotone" 
            dataKey="revenue" 
            name={t('charts.mission_revenue')} 
            stroke="#ff1e85" 
            strokeWidth={4}
            fillOpacity={1} 
            fill="url(#colorRev)" 
            filter="url(#glow)"
            className="drop-shadow-[0_0_20px_rgba(255,30,133,0.5)]"
          />
          <Area 
            type="monotone" 
            dataKey="cost" 
            name={t('charts.operational_drift')}
            stroke="#7000ff" 
            strokeWidth={3}
            strokeDasharray="8 4"
            fillOpacity={1} 
            fill="url(#colorCost)" 
            className="drop-shadow-[0_0_15px_rgba(112,0,255,0.3)]"
          />
        </AreaChart>
    </ChartContainer>
  )
}
