"use client"

import { Suspense } from "react"
import { Trophy, Users } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"
import { MonthFilter } from "@/components/analytics/month-filter"
import { AnalyticsSubHeader, StatCard, SectionCard, EmptyState, baht } from "@/components/analytics/analytics-subpage"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type DriverRow = {
  driverId: string
  name: string
  plate: string
  subId: string | null
  totalJobs: number
  completedJobs: number
  cancelledJobs: number
  totalEarnings: number
  totalDistance: number
  onTimeRate: number
  avgRating: number
  evaluation: { score: number; grade: string; onTimeRate: number; successRate: number; renewalIndex?: number; incentiveAmount?: number }
}

const COPY = {
  th: {
    title: 'ผลงานคนขับเชิงลึก',
    subtitle: 'คะแนนประเมินจากความตรงเวลา (40%) อัตราสำเร็จ (40%) และคะแนนลูกค้า (20%)',
    drivers: 'คนขับที่มีงาน', jobs: 'เที่ยวที่สำเร็จ', pay: 'ค่าเที่ยวรวม', paySub: 'รวมค่าใช้จ่ายอื่นฝั่งคนขับ', avgScore: 'คะแนนเฉลี่ย',
    top: 'อันดับสูงสุด', table: 'ผลงานคนขับทั้งหมด', tableSub: 'เรียงตามจำนวนเที่ยวที่สำเร็จ',
    colDriver: 'คนขับ / ทะเบียน', colType: 'ประเภท', colJobs: 'เที่ยว', colOnTime: 'ตรงเวลา', colRating: 'คะแนนลูกค้า', colScore: 'คะแนนประเมิน', colPay: 'ค่าเที่ยว', colAction: 'ข้อเสนอ',
    company: 'พนักงานบริษัท', sub: 'รถร่วม', incentive: 'เบี้ยขยัน', renew: 'ต่อสัญญา', review: 'ทบทวนสัญญา', noRating: 'ยังไม่มี',
    empty: 'ไม่มีข้อมูลผลงานคนขับในช่วงเวลาที่เลือก', of: 'จาก',
  },
  en: {
    title: 'Driver Performance',
    subtitle: 'Score from on-time rate (40%), completion rate (40%) and customer rating (20%)',
    drivers: 'Active drivers', jobs: 'Completed trips', pay: 'Total driver pay', paySub: 'Incl. driver-side extras', avgScore: 'Average score',
    top: 'Top performers', table: 'All drivers', tableSub: 'Sorted by completed trips',
    colDriver: 'Driver / Plate', colType: 'Type', colJobs: 'Trips', colOnTime: 'On time', colRating: 'Rating', colScore: 'Score', colPay: 'Pay', colAction: 'Recommendation',
    company: 'Company', sub: 'Subcontractor', incentive: 'Incentive', renew: 'Renew', review: 'Review contract', noRating: 'None',
    empty: 'No driver performance data for the selected period', of: 'of',
  },
}

const gradeTone = (g: string) =>
  g === 'A' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
  : g === 'B' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30'
  : g === 'C' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
  : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'

export function DriversView({ drivers, branchId }: { drivers: DriverRow[]; branchId: string }) {
  const { language } = useLanguage()
  const c = COPY[language === 'en' ? 'en' : 'th']
  const active = drivers.filter(d => d.totalJobs > 0)
  const completed = active.reduce((s, d) => s + d.completedJobs, 0)
  const pay = active.reduce((s, d) => s + d.totalEarnings, 0)
  const avgScore = active.length ? Math.round(active.reduce((s, d) => s + d.evaluation.score, 0) / active.length) : 0
  const top = active.slice(0, 3)

  return (
    <div className="space-y-6">
      <AnalyticsSubHeader
        icon={Users}
        title={c.title}
        subtitle={`${c.subtitle}${branchId && branchId !== 'All' ? ` · ${branchId}` : ''}`}
        right={<Suspense fallback={null}><MonthFilter /></Suspense>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={c.drivers} value={active.length} />
        <StatCard label={c.jobs} value={completed.toLocaleString()} tone="primary" />
        <StatCard label={c.pay} value={baht(pay)} sub={c.paySub} />
        <StatCard label={c.avgScore} value={`${avgScore}/100`} tone={avgScore >= 80 ? 'positive' : avgScore >= 60 ? 'warning' : 'negative'} />
      </div>

      {top.length > 0 && (
        <SectionCard title={c.top} icon={Trophy}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
            {top.map((d, i) => (
              <div key={d.driverId} className="rounded-xl border border-border p-4 flex items-center gap-4">
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-lg font-semibold border", gradeTone(d.evaluation.grade))}>{d.evaluation.grade}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">#{i + 1}</p>
                  <p className="font-semibold text-foreground truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.completedJobs} {c.colJobs} · {c.colOnTime} {d.evaluation.onTimeRate}% · {d.evaluation.score}/100</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title={c.table} subtitle={c.tableSub} icon={Users}>
        {active.length === 0 ? (
          <EmptyState icon={Users} text={c.empty} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-xs font-medium text-muted-foreground border-b border-border">
                  <th className="text-left px-4 py-3">{c.colDriver}</th>
                  <th className="text-left px-4 py-3">{c.colType}</th>
                  <th className="text-right px-4 py-3">{c.colJobs}</th>
                  <th className="text-right px-4 py-3">{c.colOnTime}</th>
                  <th className="text-right px-4 py-3">{c.colRating}</th>
                  <th className="text-center px-4 py-3">{c.colScore}</th>
                  <th className="text-right px-4 py-3">{c.colPay}</th>
                  <th className="text-right px-4 py-3">{c.colAction}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.map(d => (
                  <tr key={d.driverId} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{d.name}</p>
                      <p className="text-xs text-muted-foreground">{d.plate}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={d.subId ? "border-amber-500/30 text-amber-700 dark:text-amber-400" : "border-primary/30 text-primary"}>
                        {d.subId ? c.sub : c.company}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">{d.completedJobs}<span className="text-xs text-muted-foreground"> {c.of} {d.totalJobs - d.cancelledJobs}</span></td>
                    <td className="px-4 py-3 text-right text-foreground">{d.evaluation.onTimeRate}%</td>
                    <td className="px-4 py-3 text-right text-foreground">{d.avgRating > 0 ? d.avgRating.toFixed(1) : <span className="text-muted-foreground">{c.noRating}</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <span className={cn("w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold border", gradeTone(d.evaluation.grade))}>{d.evaluation.grade}</span>
                        <div className="w-20">
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full", d.evaluation.score >= 80 ? "bg-emerald-500" : d.evaluation.score >= 60 ? "bg-amber-500" : "bg-rose-500")} style={{ width: `${d.evaluation.score}%` }} />
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{d.evaluation.score}/100</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground whitespace-nowrap">{baht(d.totalEarnings)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {d.subId ? (
                        <span className={cn("text-xs font-semibold", (d.evaluation.renewalIndex || 0) > 75 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                          {(d.evaluation.renewalIndex || 0) > 75 ? c.renew : c.review} · {d.evaluation.renewalIndex}%
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-foreground">{c.incentive} {baht(d.evaluation.incentiveAmount || 0)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
