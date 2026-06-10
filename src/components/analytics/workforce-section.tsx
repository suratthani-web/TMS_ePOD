"use client"

import { PremiumCard } from "@/components/ui/premium-card"
import { WorkforceAnalytics } from "@/lib/supabase/workforce-analytics"
import { Users, UserCheck, AlertOctagon, Trophy, FileWarning, ShieldCheck, Activity } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"

export function WorkforceSection({ data }: { data: WorkforceAnalytics }) {
  const { t } = useLanguage()
  const { kpis, topPerformers, driversWithIssues } = data

  const hasExpired = kpis.licenseExpired > 0

  return (
    <div className="space-y-6">

      {/* ── Section Title ── */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-muted rounded-xl text-primary border border-border/80 shadow-sm">
          <Users size={16} />
        </div>
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight">
          {t('dashboard.workforce_intel')}
        </h3>
      </div>

      {/* ── 4-Card KPI Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">

        {/* Total Drivers */}
        <PremiumCard className="bg-card border border-border p-4 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="p-0 flex flex-col gap-2 relative z-10">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0">
                <Users size={13} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-primary text-[10px] font-bold uppercase tracking-wider">{t('dashboard.active_duty_roster')}</p>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{t('dashboard.workforce_matrix')}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 mt-1">
              <span className="text-2xl font-black text-foreground tracking-tight leading-none">
                {kpis.totalBox}
              </span>
              <span className="text-[9px] text-primary font-bold uppercase shrink-0">{t('dashboard.personnel_label')}</span>
            </div>
            <p className="text-[9px] text-muted-foreground font-medium mt-1 truncate">{t('dashboard.optimal_utilization_label')}</p>
          </div>
        </PremiumCard>

        {/* Active Today */}
        <PremiumCard className="bg-card border border-border p-4 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="p-0 flex flex-col gap-2 relative z-10">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-success/15 border border-success/20 text-success shrink-0">
                <UserCheck size={13} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-success text-[10px] font-bold uppercase tracking-wider">{t('dashboard.driver_active')}</p>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{t('dashboard.labor_optimization_index')}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 mt-1">
              <span className="text-2xl font-black text-foreground tracking-tight leading-none">
                {kpis.activeToday}
              </span>
              <span className="text-[9px] text-success font-bold shrink-0 uppercase flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-success" /> {t('dashboard.active_label')}
              </span>
            </div>
            <p className="text-[9px] text-success font-bold mt-1 truncate">{t('workforce.deployed_to_field')}</p>
          </div>
        </PremiumCard>

        {/* License Expiring */}
        <PremiumCard className="bg-card border border-border p-4 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="p-0 flex flex-col gap-2 relative z-10">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                <FileWarning size={13} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-amber-600 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider">{t('dashboard.fatigue_risk_threshold')}</p>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{t('dashboard.operator_health_index')}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 mt-1">
              <span className="text-2xl font-black text-foreground tracking-tight leading-none">
                {kpis.licenseExpiring}
              </span>
              <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold shrink-0 uppercase">{t('dashboard.at_risk_label')}</span>
            </div>
            <p className="text-[9px] text-muted-foreground font-medium mt-1 truncate flex items-center gap-1">
              <Activity size={8} /> {t('workforce.compliance_window')}
            </p>
          </div>
        </PremiumCard>

        {/* License Expired (Critical) */}
        <PremiumCard className={cn(
          "border p-4 rounded-2xl shadow-sm relative overflow-hidden transition-all duration-300",
          hasExpired
            ? "bg-destructive/10 text-destructive border-destructive"
            : "bg-card text-foreground border-border"
        )}>
          <div className="p-0 flex flex-col gap-2 relative z-10">
            <div className="flex items-start gap-2.5">
              <div className={cn(
                "p-1.5 rounded-lg border shrink-0",
                hasExpired
                  ? "bg-destructive/10 border-destructive/20 text-destructive"
                  : "bg-muted border-border/80 text-muted-foreground"
              )}>
                <AlertOctagon size={13} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  hasExpired ? "text-destructive" : "text-muted-foreground"
                )}>{t('dashboard.critical_breach')}</p>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{t('dashboard.operational_suspension_log')}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 mt-1">
              <span className="text-2xl font-black text-foreground tracking-tight leading-none">
                {kpis.licenseExpired}
              </span>
              {hasExpired && (
                <span className="text-[9px] font-bold text-destructive shrink-0 uppercase">
                  {t('dashboard.halted_label')}
                </span>
              )}
            </div>
            <p className={cn(
              "text-[9px] uppercase font-bold mt-1 truncate",
              hasExpired ? "text-destructive" : "text-muted-foreground/50"
            )}>
              {hasExpired ? t('dashboard.lockout_active_label') : '✓ ' + t('dashboard.compliance_perimeter_secure')}
            </p>
          </div>
        </PremiumCard>
      </div>

      {/* ── Lists Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Top Performers */}
        <PremiumCard className="bg-card border border-border p-0 overflow-hidden rounded-2xl shadow-sm">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2.5">
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20 shrink-0"><Trophy size={13} /></div>
            <div>
              <h3 className="text-sm font-black text-foreground">{t('dashboard.operator_elite')}</h3>
              <p className="text-[9px] text-primary uppercase font-bold tracking-wider">{t('dashboard.high_yield_performance_metrics')}</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {topPerformers.length === 0 ? (
              <div className="p-8 text-center">
                <Users size={36} strokeWidth={1.5} className="mx-auto mb-3 text-muted-foreground opacity-60" />
                <p className="text-xs font-bold text-muted-foreground uppercase">{t('dashboard.performance_data_recalibrating')}</p>
              </div>
            ) : (
              topPerformers.map((d, i) => (
                <div
                  key={i}
                  className="px-4 py-2.5 flex items-center justify-between group hover:bg-muted/20 transition-colors border-l-4 border-transparent hover:border-primary"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 border",
                      i === 0
                        ? "bg-primary/10 border-primary/20 text-primary"
                        : "bg-muted border-border text-muted-foreground"
                    )}>
                      #{i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-foreground uppercase truncate">{d.name}</p>
                      <span className="text-[9px] font-bold text-success bg-success/15 px-1.5 py-0.5 rounded border border-success/20">
                        {d.successRate.toFixed(0)}% {t('common.sync')} · {d.jobCount} {t('dashboard.missions_completed_prefix')}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-black text-foreground tabular-nums">฿{Math.round(d.revenue / 1000)}K</p>
                    <p className="text-[9px] text-muted-foreground opacity-60 uppercase">{t('dashboard.gross_yield')}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </PremiumCard>

        {/* Compliance Alerts */}
        <PremiumCard className="bg-card border border-border p-0 overflow-hidden rounded-2xl shadow-sm">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2.5">
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20 shrink-0"><ShieldCheck size={13} /></div>
            <div>
              <h3 className="text-sm font-black text-foreground">{t('dashboard.compliance_registry')}</h3>
              <p className="text-[9px] text-primary uppercase font-bold tracking-wider">{t('dashboard.operational_risk_audit')}</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {driversWithIssues.length === 0 ? (
              <div className="p-8 text-center">
                <ShieldCheck size={36} strokeWidth={1.5} className="mx-auto mb-3 text-success opacity-60" />
                <p className="text-xs font-bold text-muted-foreground uppercase">{t('dashboard.compliance_perimeter_secure')}</p>
              </div>
            ) : (
              driversWithIssues.map((d) => {
                const isExpired = d.issue === 'ใบขับขี่หมดอายุ'
                return (
                  <div
                    key={d.id}
                    className="px-4 py-2.5 flex items-center justify-between group hover:bg-muted/20 transition-colors border-l-4 border-transparent hover:border-primary"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-muted border border-border flex items-center justify-center text-[10px] font-black text-foreground shrink-0 uppercase">
                        {(d.name || '').slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-foreground uppercase truncate">{d.name}</p>
                        <span className={cn(
                          "inline-flex text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase",
                          isExpired
                            ? "text-destructive bg-destructive/10 border-destructive/20"
                            : "text-amber-600 bg-amber-500/10 border-amber-500/20"
                        )}>
                          {t('dashboard.breach_label')} {d.issue}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className={cn(
                        "text-sm font-black uppercase tabular-nums",
                        isExpired ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                      )}>
                        {isExpired ? `${t('common.expired')} ${d.daysAuth}D` : `${t('common.expiry')}: ${d.daysAuth}D`}
                      </p>
                      <p className="text-[9px] text-muted-foreground opacity-60 uppercase">{t('dashboard.immediate_rectification_reqd')}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </PremiumCard>

      </div>
    </div>
  )
}
