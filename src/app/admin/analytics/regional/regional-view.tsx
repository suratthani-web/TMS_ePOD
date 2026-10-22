"use client"

import { Suspense } from "react"
import { Building2, TrendingUp, TrendingDown, MapPin } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"
import { MonthFilter } from "@/components/analytics/month-filter"
import { AnalyticsSubHeader, StatCard, SectionCard, EmptyState, baht } from "@/components/analytics/analytics-subpage"
import { cn } from "@/lib/utils"

export type RegionalBranch = {
  branchId: string
  branchName: string
  jobsCount: number
  revenue: number
  driverCost?: number
  fuelCost?: number
  profit: number
  revenueGrowth: number
  previousRevenue: number
}

const COPY = {
  th: {
    title: 'วิเคราะห์รายสาขา',
    subtitle: 'เปรียบเทียบรายได้ ต้นทุน และกำไรของแต่ละสาขา เทียบกับช่วงก่อนหน้า',
    branches: 'สาขาที่มีงาน', revenue: 'รายได้รวม', jobs: 'จำนวนเที่ยว', profit: 'กำไรรวม',
    profitSub: 'หักค่าคนขับ (รวมค่าใช้จ่ายอื่น) + น้ำมันจากบิลจริง',
    table: 'ผลประกอบการรายสาขา', tableSub: 'เรียงตามรายได้ · น้ำมันใช้บิลจริงที่จับคู่กับงานของสาขา',
    colBranch: 'สาขา', colJobs: 'เที่ยว', colRevenue: 'รายได้', colDriver: 'ค่าคนขับ', colFuel: 'น้ำมัน (บิลจริง)', colProfit: 'กำไร', colMargin: 'Margin', colGrowth: 'รายได้เทียบช่วงก่อน',
    prev: 'ช่วงก่อน', empty: 'ไม่มีข้อมูลสาขาในช่วงเวลาที่เลือก',
  },
  en: {
    title: 'Regional Analytics',
    subtitle: 'Revenue, cost and profit per branch, compared with the previous period',
    branches: 'Active branches', revenue: 'Total revenue', jobs: 'Trips', profit: 'Total profit',
    profitSub: 'After driver pay (incl. extras) + fuel from actual bills',
    table: 'Branch performance', tableSub: 'Sorted by revenue · fuel = actual bills matched to the branch\'s jobs',
    colBranch: 'Branch', colJobs: 'Trips', colRevenue: 'Revenue', colDriver: 'Driver pay', colFuel: 'Fuel (bills)', colProfit: 'Profit', colMargin: 'Margin', colGrowth: 'Revenue vs prev.',
    prev: 'Prev.', empty: 'No branch data for the selected period',
  },
}

export function RegionalView({ branches }: { branches: RegionalBranch[] }) {
  const { language } = useLanguage()
  const c = COPY[language === 'en' ? 'en' : 'th']
  const active = branches.filter(b => b.jobsCount > 0 || b.revenue > 0)
  const totalRevenue = active.reduce((s, b) => s + b.revenue, 0)
  const totalJobs = active.reduce((s, b) => s + b.jobsCount, 0)
  const totalProfit = active.reduce((s, b) => s + b.profit, 0)
  const maxRevenue = Math.max(...active.map(b => b.revenue), 1)

  return (
    <div className="space-y-6">
      <AnalyticsSubHeader
        icon={Building2}
        title={c.title}
        subtitle={c.subtitle}
        right={<Suspense fallback={null}><MonthFilter /></Suspense>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={c.branches} value={active.length} />
        <StatCard label={c.revenue} value={baht(totalRevenue)} tone="primary" />
        <StatCard label={c.jobs} value={totalJobs.toLocaleString()} />
        <StatCard label={c.profit} value={baht(totalProfit)} tone={totalProfit >= 0 ? 'positive' : 'negative'} sub={c.profitSub} />
      </div>

      <SectionCard title={c.table} subtitle={c.tableSub} icon={MapPin}>
        {active.length === 0 ? (
          <EmptyState icon={Building2} text={c.empty} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-xs font-medium text-muted-foreground border-b border-border">
                  <th className="text-left px-4 py-3">{c.colBranch}</th>
                  <th className="text-right px-4 py-3">{c.colJobs}</th>
                  <th className="text-right px-4 py-3">{c.colRevenue}</th>
                  <th className="text-right px-4 py-3">{c.colDriver}</th>
                  <th className="text-right px-4 py-3">{c.colFuel}</th>
                  <th className="text-right px-4 py-3">{c.colProfit}</th>
                  <th className="text-right px-4 py-3">{c.colMargin}</th>
                  <th className="text-right px-4 py-3">{c.colGrowth}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.map((b, i) => {
                  const margin = b.revenue > 0 ? (b.profit / b.revenue) * 100 : 0
                  const up = b.revenueGrowth >= 0
                  return (
                    <tr key={b.branchId} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-md bg-muted text-xs font-semibold flex items-center justify-center text-muted-foreground">{i + 1}</span>
                          <div className="min-w-[140px]">
                            <p className="font-semibold text-foreground">{b.branchName}</p>
                            <div className="h-1.5 mt-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${(b.revenue / maxRevenue) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">{b.jobsCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-semibold text-primary whitespace-nowrap">{baht(b.revenue)}</td>
                      <td className="px-4 py-3 text-right text-foreground whitespace-nowrap">{baht(b.driverCost || 0)}</td>
                      <td className="px-4 py-3 text-right text-foreground whitespace-nowrap">{baht(b.fuelCost || 0)}</td>
                      <td className={cn("px-4 py-3 text-right font-semibold whitespace-nowrap", b.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{baht(b.profit)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{margin.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className={cn("inline-flex items-center gap-1 font-semibold", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                          {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          {up ? '+' : ''}{b.revenueGrowth.toFixed(1)}%
                        </span>
                        <p className="text-[11px] text-muted-foreground">{c.prev} {baht(b.previousRevenue)}</p>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
