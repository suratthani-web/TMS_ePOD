"use client"

// Building blocks for the specialized analytics reports, in the same card style
// as the main analytics page (bg-card / rounded-2xl / border / shadow-sm).
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { ArrowLeft, ShieldAlert } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"
import { PremiumButton } from "@/components/ui/premium-button"
import { SpecializedReportsNav } from "./specialized-reports-nav"
import { cn } from "@/lib/utils"

export function AnalyticsSubHeader({ icon: Icon, title, subtitle, right }: {
  icon: LucideIcon
  title: string
  subtitle?: string
  right?: React.ReactNode
}) {
  const { t } = useLanguage()
  return (
    <div className="bg-card p-6 lg:p-8 rounded-2xl border border-border shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <Link href="/admin/analytics" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors mb-5 w-fit">
            <div className="p-1.5 bg-primary/10 rounded-lg"><ArrowLeft className="w-4 h-4" /></div>
            <span className="text-sm font-semibold">{t('navigation.analytics')}</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 text-primary shrink-0">
              <Icon size={28} strokeWidth={2.25} />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-semibold text-foreground tracking-tight leading-tight">{title}</h1>
              {subtitle && <p className="text-sm font-medium text-muted-foreground mt-1">{subtitle}</p>}
            </div>
          </div>
        </div>
        {right && <div className="flex flex-wrap items-center gap-3">{right}</div>}
      </div>
      <div className="pt-5 mt-6 border-t border-border">
        <SpecializedReportsNav showOverview />
      </div>
    </div>
  )
}

export function StatCard({ label, value, sub, tone = "default", icon: Icon }: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: "default" | "primary" | "positive" | "negative" | "warning"
  icon?: LucideIcon
}) {
  const color = {
    default: "text-foreground",
    primary: "text-primary",
    positive: "text-emerald-600 dark:text-emerald-400",
    negative: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
  }[tone]
  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon size={16} className="text-muted-foreground" />}
      </div>
      <p className={cn("text-2xl font-semibold", color)}>{value}</p>
      {sub && <p className="text-xs font-medium text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

export function SectionCard({ title, subtitle, icon: Icon, children, right }: {
  title: string
  subtitle?: string
  icon?: LucideIcon
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {Icon && <div className="p-2 bg-primary/10 rounded-lg text-primary"><Icon size={16} /></div>}
          <div>
            <h2 className="font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="text-xs font-medium text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

export function AnalyticsAccessDenied() {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center bg-card rounded-2xl border border-border m-4 lg:m-10 p-10">
      <div className="p-6 bg-rose-500/10 rounded-full text-rose-500 border border-rose-500/20">
        <ShieldAlert size={56} />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">{t('analytics.access_unauthorized')}</h1>
        <p className="text-muted-foreground text-base">{t('analytics.insufficient_credentials')}</p>
      </div>
      <Link href="/dashboard">
        <PremiumButton variant="outline" className="h-12 px-8 rounded-xl">{t('analytics.return_terminal')}</PremiumButton>
      </Link>
    </div>
  )
}

export function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="p-12 text-center text-muted-foreground">
      <Icon size={44} strokeWidth={1.5} className="mx-auto mb-3" />
      <p className="font-medium">{text}</p>
    </div>
  )
}

/** "฿12,345" — full baht, no K/M shorthand, so executives see exact figures */
export const baht = (n: number) => `฿${Math.round(n || 0).toLocaleString('th-TH')}`
