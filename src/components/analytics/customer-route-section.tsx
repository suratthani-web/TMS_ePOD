"use client"

import { PremiumCard } from "@/components/ui/premium-card"
import { Building2, MapPin, TrendingUp, Activity } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"

type CustomerStat = {
  name: string
  revenue: number
  jobCount: number
}

type RouteStat = {
  route: string
  revenue: number
  cost: number
  count: number
  margin: number // Percentage
}

export function CustomerRouteSection({ 
  customers, 
  routes 
}: { 
  customers: CustomerStat[]
  routes: RouteStat[] 
}) {
  const { t } = useLanguage()

  return (
    <div className="space-y-6">
      {/* Sub-Section Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-muted rounded-xl text-primary border border-border/80 shadow-sm">
          <MapPin size={16} />
        </div>
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight">{t('dashboard.customer_route_header')}</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Customers Elite */}
        <PremiumCard className="bg-card border border-border p-0 overflow-hidden rounded-2xl shadow-sm">
           <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20 shrink-0">
                  <Building2 size={14} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground">{t('dashboard.market_command')}</h3>
                  <p className="text-primary text-[10px] font-bold uppercase tracking-wider">{t('dashboard.customer_yield')}</p>
                </div>
              </div>
           </div>
           <div className="p-0">
              <div className="divide-y divide-border">
                {customers.map((c, i) => (
                    <div key={i} className="p-4 flex items-center justify-between group/cust hover:bg-muted/20 transition-all border-l-4 border-transparent hover:border-primary">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black border transition-all uppercase",
                                i < 3 ? "bg-primary/15 text-primary border-primary/25" : "bg-muted text-muted-foreground border-border"
                            )}>
                                #{i + 1}
                            </div>
                            <div>
                                <div className="text-foreground font-black text-sm group-hover/cust:text-primary transition-colors">{c.name}</div>
                                <div className="text-xs text-muted-foreground font-medium mt-0.5">
                                    {t('dashboard.mission_volume')}: {c.jobCount}
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                             <div className="text-foreground font-black text-base">฿{c.revenue.toLocaleString()}</div>
                              <div className="text-[9px] text-muted-foreground font-bold uppercase mt-0.5">{t('dashboard.aggregate_revenue')}</div>
                        </div>
                    </div>
                ))}
                {customers.length === 0 && (
                     <div className="p-12 text-center">
                        <Building2 size={36} strokeWidth={1.5} className="mx-auto mb-3 text-muted-foreground opacity-60" />
                        <p className="text-xs font-bold text-muted-foreground uppercase">{t('dashboard.awaiting_market')}</p>
                    </div>
                )}
              </div>
           </div>
        </PremiumCard>

        {/* Route Profitability Elite */}
        <PremiumCard className="bg-card border border-border p-0 overflow-hidden rounded-2xl shadow-sm">
           <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-success/15 rounded-lg text-success border border-success/20 shrink-0">
                  <TrendingUp size={14} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground">{t('dashboard.corridor_yield')}</h3>
                  <p className="text-success text-[10px] font-bold uppercase tracking-wider">{t('dashboard.route_margin')}</p>
                </div>
              </div>
           </div>
           <div className="p-0">
              <div className="divide-y divide-border">
                {routes.slice(0, 5).map((r, i) => (
                    <div key={i} className="p-4 flex items-center justify-between group/route hover:bg-muted/20 transition-all border-l-4 border-transparent hover:border-success">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-muted text-muted-foreground border border-border flex items-center justify-center text-xs font-black uppercase">
                                {r.route.slice(0, 2)}
                            </div>
                            <div>
                                <div className="text-foreground font-black text-sm">{r.route}</div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border font-bold uppercase">
                                        {r.count} {t('dashboard.missions')}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground font-medium">COST: ฿{r.cost.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                             <div className="text-base font-black text-success">+{r.margin.toFixed(1)}%</div>
                              <div className="text-[9px] text-muted-foreground font-bold uppercase mt-0.5">{t('dashboard.net_margin')}</div>
                        </div>
                    </div>
                ))}
                {routes.length === 0 && (
                     <div className="p-12 text-center">
                        <Activity size={36} strokeWidth={1.5} className="mx-auto mb-3 text-muted-foreground opacity-60" />
                        <p className="text-xs font-bold text-muted-foreground uppercase">{t('dashboard.sector_nominal')}</p>
                    </div>
                )}
              </div>
           </div>
        </PremiumCard>
      </div>
    </div>
  )
}
