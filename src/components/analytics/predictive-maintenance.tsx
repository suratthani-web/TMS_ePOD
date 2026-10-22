"use client"

import { VehicleRisk } from "@/lib/supabase/predictive-analytics"
import { AlertTriangle, CheckCircle2, AlertOctagon, Gauge } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"
import { StatCard, SectionCard, EmptyState } from "@/components/analytics/analytics-subpage"
import { cn } from "@/lib/utils"

const COPY = {
  th: {
    title: 'ความเสี่ยงซ่อมบำรุงรายคัน', subtitle: 'ประเมินจากเลขไมล์ อายุรถ ระยะวิ่งต่อวัน และประวัติซ่อม',
    critical: 'เสี่ยงสูง', criticalSub: 'ควรเข้าตรวจทันที', warning: 'เฝ้าระวัง', warningSub: 'เริ่มมีสัญญาณ', healthy: 'ปกติ', healthySub: 'อยู่ในเกณฑ์',
    list: 'รถที่ควรวางแผนซ่อม', score: 'คะแนนสุขภาพ', issue: 'คาดการณ์', unknownIssue: 'ไม่ระบุ', service: 'ถึงรอบเข้าศูนย์ใน', days: 'วัน', empty: 'ไม่พบรถที่มีความเสี่ยงในขณะนี้',
  },
  en: {
    title: 'Vehicle maintenance risk', subtitle: 'From mileage, vehicle age, daily distance and repair history',
    critical: 'Critical', criticalSub: 'Inspect now', warning: 'Warning', warningSub: 'Early signs', healthy: 'Healthy', healthySub: 'Within range',
    list: 'Vehicles to schedule for service', score: 'Health score', issue: 'Predicted', unknownIssue: 'Unspecified', service: 'Service due in', days: 'days', empty: 'No at-risk vehicles right now',
  },
}

export function PredictiveMaintenance({ risks }: { risks: VehicleRisk[] }) {
  const { language } = useLanguage()
  const c = COPY[language === 'en' ? 'en' : 'th']
  const critical = risks.filter(r => r.risk_level === 'Critical')
  const warning = risks.filter(r => r.risk_level === 'Warning')
  const flagged = [...critical, ...warning]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label={c.critical} value={critical.length} sub={c.criticalSub} tone="negative" icon={AlertOctagon} />
        <StatCard label={c.warning} value={warning.length} sub={c.warningSub} tone="warning" icon={AlertTriangle} />
        <StatCard label={c.healthy} value={risks.length - flagged.length} sub={c.healthySub} tone="positive" icon={CheckCircle2} />
      </div>

      <SectionCard title={c.list} subtitle={c.subtitle} icon={Gauge}>
        {flagged.length === 0 ? (
          <EmptyState icon={CheckCircle2} text={c.empty} />
        ) : (
          <div className="divide-y divide-border">
            {flagged.slice(0, 10).map(r => (
              <div key={r.vehicle_plate} className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-muted/30">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={cn(
                    "w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-sm font-semibold border",
                    r.risk_level === 'Critical' ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30" : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                  )} title={c.score}>
                    {r.risk_score}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{r.vehicle_plate} <span className="text-xs font-normal text-muted-foreground">({r.vehicle_type})</span></p>
                    <p className="text-xs text-muted-foreground truncate">{c.issue}: {r.predicted_issue || c.unknownIssue}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{c.service}</p>
                  <p className={cn("font-semibold", r.days_to_service < 14 ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>{r.days_to_service} {c.days}</p>
                  <p className="text-[11px] text-muted-foreground">{r.current_mileage.toLocaleString()} km</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
