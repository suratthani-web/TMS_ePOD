"use client"

// Tabs to the specialized analytics reports — shown on /admin/analytics and on
// every sub-report so users can move between them.
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2, Users, MessageSquare, BrainCircuit, BarChart3 } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/admin/analytics/regional", key: "analytics.deep_dive_regional", icon: Building2 },
  { href: "/admin/analytics/drivers", key: "analytics.deep_dive_drivers", icon: Users },
  { href: "/admin/analytics/feedback", key: "analytics.deep_dive_feedback", icon: MessageSquare },
  { href: "/admin/analytics/intelligence", key: "analytics.deep_dive_intelligence", icon: BrainCircuit },
] as const

export function SpecializedReportsNav({ showOverview = false }: { showOverview?: boolean }) {
  const { t } = useLanguage()
  const pathname = usePathname()
  const tabs = showOverview
    ? [{ href: "/admin/analytics", key: "navigation.analytics", icon: BarChart3 } as const, ...TABS]
    : TABS

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        <span>{t('analytics.specialized_reports')}</span>
      </div>
      <div className="bg-muted/50 p-1 rounded-lg border border-border inline-flex flex-wrap items-center gap-1">
        {tabs.map(tab => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-3.5 py-2 rounded-md text-xs font-semibold transition-colors inline-flex items-center gap-2",
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background"
              )}
            >
              <tab.icon size={15} />
              <span>{t(tab.key)}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
