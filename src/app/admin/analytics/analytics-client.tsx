"use client"

import { useLanguage } from "@/components/providers/language-provider"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, ShieldAlert, BarChart3 } from "lucide-react"
import { SpecializedReportsNav } from "@/components/analytics/specialized-reports-nav"
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

        {/* Specialized reports */}
        <div className="relative z-10 pt-6 mt-6 border-t border-border">
          <SpecializedReportsNav />
        </div>
      </div>
    </div>
  );

  return content;
}

