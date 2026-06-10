"use client"

import { PremiumCard } from "@/components/ui/premium-card"
import { TreePine, Leaf, Wind, Activity, TrendingDown } from "lucide-react"
import { ESGStats } from "@/lib/supabase/esg-analytics"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"

export function ESGSection({ data }: { data: ESGStats }) {
  const { t } = useLanguage()

  return (
    <div className="space-y-6">
      {/* Sub-Section Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-muted rounded-xl text-success border border-border/80 shadow-sm">
          <Leaf size={16} />
        </div>
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight">{t('dashboard.esg_intel')}</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Main ESG KPI */}
        <PremiumCard className="lg:col-span-2 bg-card border border-border p-6 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="space-y-1">
                    <span className="text-success text-[10px] font-bold uppercase tracking-wider">{t('dashboard.env_impact_realized')}</span>
                    <h4 className="text-base font-black text-foreground">{t('dashboard.co2_offset')}</h4>
                </div>
                <div className="p-2 bg-success/10 rounded-xl text-success border border-success/20">
                    <Wind size={20} />
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-6 relative z-10">
                <div>
                     <div className="text-3xl font-black text-foreground tracking-tight">
                        {data.co2SavedKg.toLocaleString()}<span className="text-xs ml-1 text-muted-foreground">kg</span>
                     </div>
                     <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-2 flex items-center gap-1.5">
                        <TrendingDown size={12} className="text-success" /> {t('dashboard.emission_reduction_aggregate')}
                     </p>
                </div>
                <div className="border-l border-border pl-6">
                     <div className="text-3xl font-black text-success tracking-tight">
                        {data.treesSaved.toLocaleString()}
                     </div>
                     <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-2 flex items-center gap-1.5">
                        <TreePine size={12} className="text-success" /> {t('dashboard.tree_equivalence_index')}
                     </p>
                </div>
            </div>

            <div className="mt-6 pt-4 border-t border-border relative z-10">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground font-medium">{t('dashboard.optimization_efficiency')}</span>
                    <span className="text-success text-sm font-black">+{data.efficiencyRate}% {t('dashboard.target_sync')}</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-success rounded-full" style={{ width: `${data.efficiencyRate}%` }} />
                </div>
            </div>
        </PremiumCard>

        {/* Small Detail Cards */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5">
             <PremiumCard className="bg-card border border-border p-5 rounded-2xl shadow-sm hover:border-primary/30 transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-muted rounded-xl text-primary border border-border/80 shadow-sm">
                        <Activity size={16} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-foreground">{t('dashboard.saved_distance')}</h4>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('dashboard.fleet_optimization')}</p>
                    </div>
                </div>
                <div className="text-2xl font-black text-foreground tracking-tight">
                    {data.totalSavedKm.toLocaleString()}<span className="text-xs ml-1 text-muted-foreground">km</span>
                </div>
             </PremiumCard>

             <PremiumCard className="bg-card border border-border p-5 rounded-2xl shadow-sm hover:border-success/30 transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-success/10 rounded-xl text-success border border-success/20">
                        <Leaf size={16} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-foreground">{t('dashboard.green_protocol')}</h4>
                        <p className="text-[10px] text-success uppercase font-bold tracking-wider">{t('dashboard.esg_compliance_registry')}</p>
                    </div>
                </div>
                <div className="text-2xl font-black text-foreground tracking-tight">
                    {t('dashboard.active_label')}
                </div>
             </PremiumCard>

             <PremiumCard className="md:col-span-2 bg-card border border-border p-5 rounded-2xl shadow-sm flex items-center justify-between">
                <div className="space-y-0.5">
                    <h4 className="text-sm font-black text-foreground">{t('dashboard.industrial_esg_rating')}</h4>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t('dashboard.structural_sustainability_index')}</p>
                </div>
                <div className="flex items-center gap-1.5">
                    {[1,2,3,4,5].map(i => (
                        <div key={i} className={cn(
                            "w-2 h-4 rounded-sm bg-muted",
                            i <= 4 ? "bg-success" : ""
                        )} />
                    ))}
                    <span className="ml-2 text-xl font-black text-foreground">A+</span>
                </div>
             </PremiumCard>
        </div>
      </div>
    </div>
  )
}

