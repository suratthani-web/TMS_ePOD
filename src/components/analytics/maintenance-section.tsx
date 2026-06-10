"use client"

import { PremiumCard } from "@/components/ui/premium-card"
import { MaintenanceScheduleData } from "@/lib/supabase/maintenance-schedule"
import { Wrench, AlertTriangle, CheckCircle2, Truck, Activity, Clock, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"

function formatCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `฿${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `฿${(abs / 1_000).toFixed(0)}K`
  return `฿${Math.round(abs).toLocaleString('th-TH')}`
}

export function MaintenanceSection({ data }: { data: MaintenanceScheduleData }) {
  const { t } = useLanguage()
  const {
    overdue = [],
    dueSoon = [],
    activeRepairs = 0,
    completedThisMonth = 0,
    totalCostThisMonth = 0,
    vehicleHealthSummary = [],
  } = data || {}

  const safeCost = Number(totalCostThisMonth) || 0
  const hasCritical = overdue.length > 0

  return (
    <div className="space-y-6">

      {/* ── Section Title ── */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-muted rounded-xl text-primary border border-border/80 shadow-sm">
          <Wrench size={16} />
        </div>
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight">
          {t('common.maintenance_protocol')}
        </h3>
      </div>

      {/* ── 4-Card KPI Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">

        {/* Active Repairs */}
        <PremiumCard className="bg-card border border-border p-4 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex flex-col gap-2 relative z-10">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary shrink-0">
                <Wrench size={13} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-primary text-[10px] font-bold uppercase tracking-wider">{t('dashboard.active_hangar')}</p>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{t('dashboard.live_repair_log')}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 mt-1">
              <span className="text-2xl font-black text-foreground tracking-tight leading-none">
                {activeRepairs}
              </span>
              <span className="text-[9px] text-primary font-bold uppercase shrink-0 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                {t('dashboard.assets_label')}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground font-medium mt-1 truncate">{t('dashboard.mission_inactive')}</p>
          </div>
        </PremiumCard>

        {/* Critical — Overdue */}
        <PremiumCard className={cn(
          "border p-4 rounded-2xl shadow-sm relative overflow-hidden transition-all duration-300",
          hasCritical
            ? "bg-destructive/10 text-destructive border-destructive"
            : "bg-card text-foreground border-border"
        )}>
          <div className="flex flex-col gap-2 relative z-10">
            <div className="flex items-start gap-2.5">
              <div className={cn(
                "p-1.5 rounded-lg border shrink-0",
                hasCritical
                  ? "bg-destructive/10 border-destructive/20 text-destructive"
                  : "bg-muted border-border/80 text-muted-foreground"
              )}>
                <AlertTriangle size={13} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  hasCritical ? "text-destructive" : "text-muted-foreground"
                )}>{t('dashboard.overdue_exposure')}</p>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{t('dashboard.strategic_service_breach')}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 mt-1">
              <span className="text-2xl font-black text-foreground tracking-tight leading-none">
                {overdue.length}
              </span>
              {hasCritical && (
                <span className="text-[9px] font-bold text-destructive shrink-0 uppercase">
                  ⚠ {t('dashboard.critical_review')}
                </span>
              )}
            </div>
            <p className={cn(
              "text-[9px] uppercase font-bold mt-1 truncate",
              hasCritical ? "text-destructive" : "text-muted-foreground/50"
            )}>
              {hasCritical ? `${overdue.length} ${t('dashboard.alerts_label')} — ${t('dashboard.strict_breach')}` : t('dashboard.system_optimal')}
            </p>
          </div>
        </PremiumCard>

        {/* Completed This Month */}
        <PremiumCard className="bg-card border border-border p-4 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex flex-col gap-2 relative z-10">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-success/15 border border-success/20 text-success shrink-0">
                <CheckCircle2 size={13} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-success text-[10px] font-bold uppercase tracking-wider">{t('dashboard.mission_ready')}</p>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{t('dashboard.restored_assets_30d')}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 mt-1">
              <span className="text-2xl font-black text-foreground tracking-tight leading-none">
                {completedThisMonth}
              </span>
              <span className="text-[9px] text-success font-bold shrink-0 uppercase flex items-center gap-1">
                <ShieldCheck size={9} /> {t('dashboard.restoration_verified')}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground uppercase opacity-50 font-bold mt-1">30 วันล่าสุด</p>
          </div>
        </PremiumCard>

        {/* Cost This Month */}
        <PremiumCard className="bg-card border border-border p-4 rounded-2xl shadow-sm relative overflow-hidden">
          <div className="flex flex-col gap-2 relative z-10">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-destructive/15 border border-destructive/20 text-destructive shrink-0">
                <Activity size={13} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-destructive text-[10px] font-bold uppercase tracking-wider">{t('dashboard.fleet_burn_rate')}</p>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">{t('dashboard.total_restoration_expenditure')}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 mt-1">
              <span className="text-2xl font-black text-foreground tracking-tight leading-none">
                {formatCompact(safeCost)}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground uppercase opacity-50 font-bold mt-1">{t('maintenance.allocated_budget_nominal')}</p>
          </div>
        </PremiumCard>
      </div>

      {/* ── Charts Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Due Soon Timeline */}
        <PremiumCard className="bg-card border border-border p-0 overflow-hidden rounded-2xl shadow-sm">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2.5">
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20 shrink-0"><Clock size={13} /></div>
            <div>
              <h3 className="text-sm font-black text-foreground">{t('dashboard.asset_compliance_feed')}</h3>
              <p className="text-[9px] text-primary uppercase font-bold tracking-wider">{t('dashboard.temporal_maintenance_scheduler')}</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {[...overdue, ...dueSoon.slice(0, 5)].length === 0 ? (
              <div className="p-8 text-center">
                <ShieldCheck size={36} strokeWidth={1.5} className="mx-auto mb-3 text-success opacity-60" />
                <p className="text-xs font-bold text-muted-foreground uppercase">{t('maintenance.all_assets_ready')}</p>
              </div>
            ) : (
              [...overdue, ...dueSoon.slice(0, 5)].map((item, i) => (
                <div
                  key={`${item.vehicle_plate}-${item.service_type}-${i}`}
                  className="px-4 py-2.5 flex items-center justify-between group hover:bg-muted/20 transition-colors border-l-4 border-transparent hover:border-primary"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 border uppercase",
                      item.status === 'overdue'
                        ? 'bg-destructive border-destructive text-destructive-foreground'
                        : 'bg-muted border-border text-foreground'
                    )}>
                      {item.days_until <= 0 ? '!' : item.days_until}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-foreground uppercase truncate">{item.vehicle_plate}</p>
                      <p className="text-[9px] text-primary font-bold uppercase truncate">{item.service_type}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={cn(
                      "text-[10px] font-bold uppercase",
                      item.status === 'overdue' ? 'text-destructive' : 'text-primary'
                    )}>
                      {item.status === 'overdue' ? t('dashboard.strict_breach') : `${item.days_until}d`}
                    </p>
                    <p className="text-[9px] text-muted-foreground opacity-60">
                      {new Date(item.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </PremiumCard>

        {/* Fleet Health */}
        <PremiumCard className="bg-card border border-border p-0 overflow-hidden rounded-2xl shadow-sm">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2.5">
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20 shrink-0"><Truck size={13} /></div>
            <div>
              <h3 className="text-sm font-black text-foreground">{t('dashboard.asset_health_matrix')}</h3>
              <p className="text-[9px] text-primary uppercase font-bold tracking-wider">{t('dashboard.operational_integrity_breakdown')}</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {vehicleHealthSummary.length === 0 ? (
              <div className="p-8 text-center">
                <Activity size={36} strokeWidth={1.5} className="mx-auto mb-3 text-success opacity-60" />
                <p className="text-xs font-bold text-muted-foreground uppercase">{t('maintenance.fleet_integrity_nominal')}</p>
              </div>
            ) : (
              vehicleHealthSummary.slice(0, 6).map((v) => (
                <div
                  key={v.vehicle_plate}
                  className="px-4 py-2.5 flex items-center justify-between group hover:bg-muted/20 transition-colors border-l-4 border-transparent hover:border-primary"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-muted border border-border flex items-center justify-center text-[10px] font-black text-foreground shrink-0 uppercase">
                      {(v.vehicle_plate || '').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-foreground uppercase truncate">{v.vehicle_plate}</p>
                      <span className="inline-flex text-[9px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded border border-destructive/20 uppercase">
                        {v.openTickets} {t('dashboard.active_tickets')}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-black text-foreground tabular-nums">{formatCompact(v.totalCost)}</p>
                    <p className="text-[9px] text-muted-foreground opacity-60 uppercase">{t('maintenance.cumulative_cost')}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </PremiumCard>

      </div>
    </div>
  )
}
