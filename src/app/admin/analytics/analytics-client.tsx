"use client"

import { useLanguage } from "@/components/providers/language-provider"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AlertTriangle, ArrowLeft, ShieldAlert, BarChart3, Zap, Building2, Users, MessageSquare, BrainCircuit } from "lucide-react"
import { PremiumButton } from "@/components/ui/premium-button"
import { MonthFilter } from "@/components/analytics/month-filter"
import { Suspense } from "react"
import { cn } from "@/lib/utils"

interface AnalyticsClientProps {
  overdueCount: number
  isSuperAdmin: boolean
}

export function AnalyticsClient({ overdueCount, isSuperAdmin }: AnalyticsClientProps) {
  const { t } = useLanguage()
  const pathname = usePathname()
  const content = !isSuperAdmin ? (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center bg-card rounded-2xl border border-border m-10 p-10">
      <div className="p-6 bg-rose-500/10 rounded-full text-rose-500 border border-rose-500/20">
        <ShieldAlert size={56} />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">{t('analytics.access_unauthorized')}</h1>
        <p className="text-muted-foreground text-base">
          {t('analytics.insufficient_credentials')}
        </p>
      </div>
      <Link href="/dashboard">
        <PremiumButton variant="outline" className="h-12 px-8 rounded-xl">
          {t('analytics.return_terminal')}
        </PremiumButton>
      </Link>
    </div>
  ) : (
    <div className="space-y-8">
      {overdueCount > 0 && (
        <div className="bg-card border border-rose-500/30 p-6 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm relative">
          <div className="flex items-center gap-5 relative z-10">
            <div className="p-4 bg-rose-600 rounded-2xl text-white shrink-0">
              <AlertTriangle size={28} />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground leading-tight">{t('analytics.critical_divergence')}: {overdueCount} {t('common.units')}</p>
              <p className="text-rose-500 text-sm font-medium mt-1">{t('analytics.structural_intervention')}</p>
            </div>
          </div>
          <Link href="/maintenance" className="relative z-10">
            <PremiumButton className="bg-rose-600 hover:bg-rose-700 text-white font-semibold">
              {t('analytics.initiate_recovery')}
            </PremiumButton>
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="bg-card p-8 rounded-2xl border border-border shadow-sm relative">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div>
            <Link href="/dashboard" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors mb-6 w-fit">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <ArrowLeft className="w-4 h-4" />
              </div>
              <span className="text-sm font-semibold">{t('common.back')}</span>
            </Link>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 text-primary shrink-0">
                <BarChart3 size={32} strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-3xl lg:text-4xl font-semibold text-foreground tracking-tight leading-tight mb-1">{t('navigation.analytics')}</h1>
                <p className="text-sm font-medium text-muted-foreground">{t('analytics.registry_subtitle')}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Suspense fallback={
              <div className={cn("flex items-center gap-1 h-10 px-4 rounded-xl bg-muted/50 border border-border")}>
                <div className="w-32 h-3 bg-muted/40 rounded-full" />
              </div>
            }>
              <MonthFilter />
            </Suspense>
            <div className="px-4 py-2.5 bg-muted/50 rounded-xl border border-border flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-muted-foreground">{t('analytics.live_feed')}</span>
            </div>
          </div>
        </div>

        {/* Specialized Analytics Sub-tabs (Matching Main Tabs UX/UI & i18n) */}
        <div className="relative z-10 pt-6 mt-6 border-t border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span>{t('analytics.specialized_reports')}</span>
          </div>

          <div className="bg-muted/50 p-1 rounded-lg border border-border inline-flex flex-wrap items-center gap-1 h-auto">
            <Link
              href="/admin/analytics/regional"
              className={cn(
                "px-4 py-2 rounded-md text-xs font-semibold transition-all inline-flex items-center gap-2",
                pathname === "/admin/analytics/regional"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-background/80"
              )}
            >
              <Building2 size={15} className={pathname === "/admin/analytics/regional" ? "text-white" : "text-emerald-500"} />
              <span>{t('analytics.deep_dive_regional')}</span>
            </Link>

            <Link
              href="/admin/analytics/drivers"
              className={cn(
                "px-4 py-2 rounded-md text-xs font-semibold transition-all inline-flex items-center gap-2",
                pathname === "/admin/analytics/drivers"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-background/80"
              )}
            >
              <Users size={15} className={pathname === "/admin/analytics/drivers" ? "text-white" : "text-indigo-500"} />
              <span>{t('analytics.deep_dive_drivers')}</span>
            </Link>

            <Link
              href="/admin/analytics/feedback"
              className={cn(
                "px-4 py-2 rounded-md text-xs font-semibold transition-all inline-flex items-center gap-2",
                pathname === "/admin/analytics/feedback"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-background/80"
              )}
            >
              <MessageSquare size={15} className={pathname === "/admin/analytics/feedback" ? "text-white" : "text-amber-500"} />
              <span>{t('analytics.deep_dive_feedback')}</span>
            </Link>

            <Link
              href="/admin/analytics/intelligence"
              className={cn(
                "px-4 py-2 rounded-md text-xs font-semibold transition-all inline-flex items-center gap-2",
                pathname === "/admin/analytics/intelligence"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-purple-600 dark:hover:text-purple-400 hover:bg-background/80"
              )}
            >
              <BrainCircuit size={15} className={pathname === "/admin/analytics/intelligence" ? "text-white" : "text-purple-500"} />
              <span>{t('analytics.deep_dive_intelligence')}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  return content;
}

