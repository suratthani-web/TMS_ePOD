"use client"

import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { ChartContainer } from "@/components/ui/chart-container"

type CostData = {
  driver: number
  fuel: number
  maintenance: number
}

export function CostBreakdownChart({ data }: { data: CostData }) {
  const chartData = [
    { name: 'ค่าจ้างคนขับ (Drivers)', value: data.driver, color: '#3b82f6' }, // blue
    { name: 'ค่าน้ำมัน (Fuel)', value: data.fuel, color: '#f59e0b' },   // amber
    { name: 'ค่าซ่อมบำรุง (Maintenance)', value: data.maintenance, color: '#ef4444' }, // red
  ].filter(item => item.value > 0)

  return (
    <ChartContainer height={450}>
        {chartData.length > 0 ? (
            <PieChart>
                <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={120}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                >
                    {chartData.map((entry, index) => (
                    <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color} 
                        className="hover:opacity-80 transition-opacity cursor-pointer outline-none"
                    />
                    ))}
                </Pie>
                <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                    formatter={(value) => [new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(Number(value || 0)), '']}
                />
                <Legend 
                    verticalAlign="bottom" 
                    align="center"
                    iconType="circle"
                    layout="horizontal"
                    wrapperStyle={{ paddingTop: '20px' }}
                />
            </PieChart>
        ) : (
            <div className="text-gray-400 font-medium">ไม่มีข้อมูลต้นทุนในช่วงเวลานี้</div>
        )}
    </ChartContainer>
  )
}
