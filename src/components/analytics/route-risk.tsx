"use client"

import { RouteRisk } from "@/lib/supabase/predictive-analytics"
import { AlertTriangle, MapPin } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"
import { SectionCard, EmptyState } from "@/components/analytics/analytics-subpage"
import { cn } from "@/lib/utils"

const COPY = {
  th: {
    title: 'เส้นทางที่มีความเสี่ยง', subtitle: 'จากประวัติงานล้มเหลว/SOS และงานล่าช้าของแต่ละเส้นทาง',
    jobs: 'งาน', incidents: 'เหตุขัดข้อง', reliability: 'ความน่าเชื่อถือ', score: 'คะแนน',
    level: { High: 'เสี่ยงสูง', Medium: 'เสี่ยงปานกลาง', Low: 'เสี่ยงต่ำ' }, empty: 'ไม่พบข้อมูลความเสี่ยงในช่วงเวลานี้',
  },
  en: {
    title: 'Route risk', subtitle: 'From failed/SOS and late jobs on each route',
    jobs: 'jobs', incidents: 'incidents', reliability: 'Reliability', score: 'Score',
    level: { High: 'High risk', Medium: 'Medium risk', Low: 'Low risk' }, empty: 'No route risk data for this period',
  },
}

export function RouteRiskAnalysis({ risks }: { risks: RouteRisk[] }) {
  const { language } = useLanguage()
  const c = COPY[language === 'en' ? 'en' : 'th']

  return (
    <SectionCard title={c.title} subtitle={c.subtitle} icon={MapPin}>
      {risks.length === 0 ? (
        <EmptyState icon={AlertTriangle} text={c.empty} />
      ) : (
        <div className="divide-y divide-border">
          {risks.slice(0, 10).map(r => {
            const failPct = r.total_jobs > 0 ? (r.failure_count / r.total_jobs) * 100 : 0
            const reliability = Math.max(0, 100 - Math.round(failPct))
            const scoreColor = r.risk_level === 'High' ? 'text-rose-600 dark:text-rose-400' : r.risk_level === 'Medium' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
            return (
              <div key={r.route_name} className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-muted/30">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="text-center min-w-[2.75rem]">
                    <p className={cn("text-lg font-semibold", scoreColor)}>{r.risk_score}</p>
                    <p className="text-[10px] text-muted-foreground">{c.score}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{r.route_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.total_jobs} {c.jobs} · <span className="text-rose-600 dark:text-rose-400">{r.failure_count} {c.incidents} ({failPct.toFixed(1)}%)</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="hidden md:block w-28">
                    <div className="flex justify-between text-[11px] text-muted-foreground"><span>{c.reliability}</span><span>{reliability}%</span></div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                      <div className={cn("h-full rounded-full", r.risk_level === 'High' ? "bg-rose-500" : r.risk_level === 'Medium' ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${reliability}%` }} />
                    </div>
                  </div>
                  <span className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-semibold border",
                    r.risk_level === 'High' ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-400"
                      : r.risk_level === 'Medium' ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
                      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  )}>
                    {c.level[r.risk_level]}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
