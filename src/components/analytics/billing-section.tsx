"use client"

import { PremiumCard } from "@/components/ui/premium-card"
import { BillingAnalytics } from "@/lib/supabase/billing-analytics"
import {
  Wallet, Percent, FileText, AlertCircle, Clock, ArrowRightLeft,
  ShieldCheck, ArrowUpRight, ArrowDownRight, TrendingDown
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"

function formatCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}฿${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}฿${(abs / 1_000).toFixed(0)}K`
  return `${sign}฿${Math.round(abs).toLocaleString('th-TH')}`
}

export function BillingSection({ data }: { data: BillingAnalytics }) {
  const { t } = useLanguage()
  
  if (!data || !data.accountsReceivable) return null
  
  const { accountsReceivable, accountsPayable, collectionRate } = data
  const agingData = accountsReceivable.aging || { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }

  const maxAging = Math.max(
    agingData['0-30']  || 0,
    agingData['31-60'] || 0,
    agingData['61-90'] || 0,
    agingData['90+']   || 0,
  ) || 1

  const criticalAmt = agingData['90+'] || 0
  const isCritical  = criticalAmt > 50_000
  const isWarning   = criticalAmt > 0 && !isCritical

  return (
    <div className="space-y-6">

      {/* ── Section Title ── */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-background rounded-xl text-emerald-400 shadow-lg border border-slate-800">
          <Wallet size={16} />
        </div>
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight premium-text-gradient">
          {t('billing.registry_header')}
        </h3>
      </div>

      {/* ── 4-Card KPI Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">

        {/* AR */}
        <PremiumCard className="relative overflow-hidden p-0 border border-border/10 border-l-[3px] border-l-blue-500 bg-background/60 backdrop-blur-sm group hover:shadow-[0_0_25px_rgba(59,130,246,0.1)] transition-shadow duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/6 to-transparent pointer-events-none" />
          <div className="p-4 flex flex-col gap-2.5 relative z-10">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-500/15 border border-blue-500/20 text-blue-400 shrink-0 group-hover:scale-110 transition-transform duration-300">
                <FileText size={13} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black text-blue-400 uppercase leading-tight truncate">{t('billing.accounts_receivable')}</p>
                <p className="text-[9px] text-muted-foreground leading-tight opacity-50 truncate">{t('billing.asset_exposure')}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-[1.65rem] font-black text-foreground tracking-tight leading-none">
                {formatCompact(accountsReceivable.totalOutstanding)}
              </span>
              <span className="text-[9px] text-muted-foreground shrink-0 font-medium">
                {accountsReceivable.invoiceCount} {t('billing.active_entities')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 pt-0.5 border-t border-border">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <p className="text-[9px] text-blue-400 font-semibold uppercase truncate opacity-70">{t('billing.active_entities')}</p>
            </div>
          </div>
        </PremiumCard>

        {/* AP */}
        <PremiumCard className="relative overflow-hidden p-0 border border-border/10 border-l-[3px] border-l-indigo-500 bg-background/60 backdrop-blur-sm group hover:shadow-[0_0_25px_rgba(99,102,241,0.1)] transition-shadow duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/6 to-transparent pointer-events-none" />
          <div className="p-4 flex flex-col gap-2.5 relative z-10">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/20 text-indigo-400 shrink-0 group-hover:scale-110 transition-transform duration-300">
                <ArrowRightLeft size={13} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black text-indigo-400 uppercase leading-tight truncate">{t('billing.accounts_payable')}</p>
                <p className="text-[9px] text-muted-foreground leading-tight opacity-50 truncate">{t('billing.liability_registry')}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-[1.65rem] font-black text-foreground tracking-tight leading-none">
                {formatCompact(accountsPayable.totalOutstanding)}
              </span>
              <span className="text-[9px] text-muted-foreground shrink-0 font-medium">
                {accountsPayable.paymentCount} {t('billing.pending_disbursements')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 pt-0.5 border-t border-border">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
              <p className="text-[9px] text-indigo-400 font-semibold uppercase truncate opacity-70">{t('billing.pending_disbursements')}</p>
            </div>
          </div>
        </PremiumCard>

        {/* Collection Rate */}
        <PremiumCard className="relative overflow-hidden p-0 border border-border/10 border-l-[3px] border-l-emerald-500 bg-background/60 backdrop-blur-sm group hover:shadow-[0_0_25px_rgba(16,185,129,0.1)] transition-shadow duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/6 to-transparent pointer-events-none" />
          <div className="p-4 flex flex-col gap-2.5 relative z-10">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 shrink-0 group-hover:scale-110 transition-transform duration-300">
                <Percent size={13} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black text-emerald-400 uppercase leading-tight truncate">{t('billing.collection_rate')}</p>
                <p className="text-[9px] text-muted-foreground leading-tight opacity-50 truncate">{t('billing.yield_conversion')}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className="text-[1.65rem] font-black text-foreground tracking-tight leading-none">
                {collectionRate.toFixed(1)}%
              </span>
              <span className={cn(
                "text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded-full border",
                collectionRate > 90
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : collectionRate > 70
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
              )}>
                {collectionRate > 90 ? '✓ ดี' : collectionRate > 70 ? '⚠ ปานกลาง' : '✗ ต่ำ'}
              </span>
            </div>
            <div className="pt-0.5">
              <div className="h-[3px] bg-muted/40 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-1000",
                    collectionRate > 90
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-300'
                      : collectionRate > 70
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-300'
                        : 'bg-gradient-to-r from-rose-600 to-rose-400'
                  )}
                  style={{ width: `${Math.min(collectionRate, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </PremiumCard>

        {/* Critical Overdue */}
        <PremiumCard className={cn(
          "relative overflow-hidden p-0 border border-l-[3px] transition-all duration-500 group",
          isCritical
            ? "bg-rose-950/80 border-border/10 border-l-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.2)]"
            : isWarning
              ? "bg-amber-950/40 border-border/10 border-l-amber-500"
              : "bg-background/60 border-border/10 border-l-slate-600 backdrop-blur-sm"
        )}>
          <div className={cn(
            "absolute inset-0 bg-gradient-to-br to-transparent pointer-events-none",
            isCritical ? 'from-rose-500/10' : isWarning ? 'from-amber-500/6' : 'from-muted/5'
          )} />
          <div className="p-4 flex flex-col gap-2.5 relative z-10">
            <div className="flex items-start gap-2.5">
              <div className={cn(
                "p-1.5 rounded-lg border shrink-0 group-hover:scale-110 transition-transform duration-300",
                isCritical
                  ? "bg-rose-500/20 border-rose-500/30 text-rose-300"
                  : isWarning
                    ? "bg-amber-500/20 border-amber-500/30 text-amber-300"
                    : "bg-muted/20 border-border/20 text-muted-foreground"
              )}>
                <AlertCircle size={13} strokeWidth={2.5} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-[11px] font-black uppercase leading-tight truncate",
                  isCritical ? 'text-rose-300' : isWarning ? 'text-amber-300' : 'text-muted-foreground'
                )}>{t('billing.critical_exposure')}</p>
                <p className="text-[9px] text-muted-foreground leading-tight opacity-50 truncate">{t('billing.strategic_risk')}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2">
              <span className={cn(
                "text-[1.65rem] font-black tracking-tight leading-none",
                isCritical || isWarning ? 'text-foreground' : 'text-muted-foreground/30'
              )}>
                {formatCompact(criticalAmt)}
              </span>
              {(isCritical || isWarning) && (
                <span className="text-[9px] font-bold text-rose-300 shrink-0 flex items-center gap-1 animate-pulse">
                  <Clock size={9} /> {t('billing.recovery_required')}
                </span>
              )}
            </div>
            <div className={cn(
              "text-[9px] uppercase font-semibold tracking-wide pt-0.5 border-t",
              isCritical ? 'text-rose-400 border-rose-500/20' : isWarning ? 'text-amber-400 border-amber-500/20' : 'text-muted-foreground/40 border-border'
            )}>
              {isCritical ? '⚠ ต้องดำเนินการทันที' : isWarning ? '⚡ ติดตามหนี้ด่วน' : '✓ ไม่มีหนี้เกินกำหนด'}
            </div>
          </div>
        </PremiumCard>
      </div>

      {/* ── Charts Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* AR Aging Timeline */}
        <PremiumCard className="bg-muted/30 border border-border/10 p-0 overflow-hidden rounded-2xl">
          <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center gap-3">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white shrink-0">
              <Clock size={13} />
            </div>
            <div>
              <h3 className="text-sm font-black text-foreground">{t('billing.ar_aging')}</h3>
              <p className="text-[9px] text-blue-400 uppercase font-semibold tracking-wide">{t('billing.temporal_exposure')}</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {Object.entries(agingData).map(([range, amount]) => {
              const pct = (amount / (maxAging as number)) * 100
              const colorBar =
                range === '90+'   ? 'bg-gradient-to-r from-rose-600 to-rose-400'
                : range === '61-90' ? 'bg-gradient-to-r from-orange-500 to-amber-400'
                : range === '31-60' ? 'bg-gradient-to-r from-amber-400 to-yellow-300'
                : 'bg-gradient-to-r from-blue-500 to-blue-300'
              return (
                <div key={range} className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wide">
                      {range} {t('billing.days_exposure')}
                    </span>
                    <span className="text-[13px] font-black text-foreground tabular-nums shrink-0">
                      {formatCompact(amount as number)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-700", colorBar, range === '90+' && 'animate-pulse')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </PremiumCard>

        {/* Recent Unpaid */}
        <PremiumCard className="bg-muted/30 border border-border/10 p-0 overflow-hidden rounded-2xl">
          <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center gap-3">
            <div className="p-1.5 bg-rose-600 rounded-lg text-white shrink-0">
              <AlertCircle size={13} />
            </div>
            <div>
              <h3 className="text-sm font-black text-foreground">{t('billing.critical_log')}</h3>
              <p className="text-[9px] text-rose-400 uppercase font-semibold tracking-wide">{t('billing.recovery_assets')}</p>
            </div>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {accountsReceivable.recentUnpaid.length === 0 ? (
              <div className="p-10 text-center">
                <ShieldCheck size={36} strokeWidth={1} className="mx-auto mb-3 text-emerald-500/40" />
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{t('billing.minimal_exposure')}</p>
              </div>
            ) : (
              accountsReceivable.recentUnpaid.map((inv) => (
                <div
                  key={inv.id}
                  className="px-5 py-3.5 flex items-center justify-between group hover:bg-rose-500/5 transition-colors border-l-2 border-transparent hover:border-rose-500/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-foreground uppercase truncate group-hover:text-rose-400 transition-colors">
                      {inv.customer}
                    </p>
                    <span className="inline-flex items-center gap-1 mt-1 text-[9px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 uppercase">
                      <TrendingDown size={8} /> {t('billing.exposure_relative')}: {inv.daysOverdue}d
                    </span>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-base font-black text-foreground tabular-nums">{formatCompact(inv.amount)}</p>
                    <p className="text-[9px] text-muted-foreground font-medium opacity-50">#{inv.id}</p>
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
