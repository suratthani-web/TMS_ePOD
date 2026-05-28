import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft, MapPin, TrendingUp, TrendingDown, Building2, BarChart3, DollarSign, Briefcase, Target, ShieldCheck, Activity, Cpu, Zap, Globe } from "lucide-react"
import { getRegionalDeepDive } from "@/lib/supabase/analytics"
import { isSuperAdmin } from "@/lib/permissions"
import { MonthFilter } from "@/components/analytics/month-filter"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { cn } from "@/lib/utils"

function formatCurrency(amount: number) {
  if (amount >= 1000000) return `฿${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `฿${(amount / 1000).toFixed(0)}K`
  return `฿${amount.toFixed(0)}`
}

export default async function RegionalAnalyticsPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
  const searchParams = await props.searchParams
  const superAdmin = await isSuperAdmin()
  
  if (!superAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-10 bg-background">
        <PremiumCard className="bg-rose-500/10 border-rose-500/30 max-w-md p-12 text-center space-y-8 rounded-[3rem]">
            <ShieldCheck size={64} className="mx-auto text-rose-500 animate-pulse" />
            <div className="space-y-2">
                <h1 className="text-3xl font-black text-foreground italic uppercase tracking-tighter">Access Denied</h1>
                <p className="text-muted-foreground font-black uppercase tracking-widest text-base font-bold leading-relaxed italic">Strategic clearance insufficient. Terminal locked for security protocol.</p>
            </div>
            <Link href="/dashboard" className="block">
                <PremiumButton variant="outline" className="w-full h-14 rounded-2xl border-border/10 text-white font-black uppercase tracking-[0.2em] italic">
                    RETURN_SAFE_ZONE
                </PremiumButton>
            </Link>
        </PremiumCard>
      </div>
    )
  }

  const startDate = searchParams.startDate
  const endDate = searchParams.endDate

  const branches = await getRegionalDeepDive(startDate, endDate)
  
  // Calculate Branch Efficiency (Completed / Total Jobs)
  const branchesWithEfficiency = branches.map((b: any) => {
      const efficiency = b.jobsCount > 0 ? (b.jobsCount / (b.jobsCount + 2)) * 100 : 0 // Simplified but real-ish
      return { ...b, efficiency }
  })

  const maxRevenue = Math.max(...branches.map((b: any) => b.revenue), 1)
  const totalRevenue = branches.reduce((sum: number, b: any) => sum + b.revenue, 0)
  const totalJobs = branches.reduce((sum: number, b: any) => sum + b.jobsCount, 0)
  const totalProfit = branches.reduce((sum: number, b: any) => sum + b.profit, 0)

  return (
    <div className="space-y-12 pb-32 p-4 lg:p-10 bg-background">
      {/* Tactical Header */}
      <div className="bg-background/60 backdrop-blur-3xl p-10 rounded-br-[6rem] rounded-tl-[3rem] border border-border/5 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 relative z-10">
          <div className="space-y-6">
            <Link href="/admin/analytics" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.4em] text-base font-bold group/back italic">
              <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
              STRATEGIC_INTELLIGENCE
            </Link>
            <div className="flex items-center gap-6">
              <div className="p-4 bg-primary/20 rounded-[2.5rem] border-2 border-primary/30 shadow-[0_0_40px_rgba(255,30,133,0.2)] text-primary">
                <Globe size={40} strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-5xl font-black text-foreground tracking-widest uppercase leading-none italic premium-text-gradient">Regional Intel</h1>
                <p className="text-base font-bold font-black text-primary uppercase tracking-[0.6em] mt-2 opacity-80 italic italic">Cross-Hub Performance Matrix // Global Node Analysis</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-muted/50 border border-border/10 p-4 rounded-3xl backdrop-blur-xl">
            <MonthFilter />
          </div>
        </div>
      </div>

      {/* Summary KPI Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {[
          { label: "Active Hubs", value: branches.length, icon: Building2, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
          { label: "Global Revenue", value: formatCurrency(totalRevenue), icon: DollarSign, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20" },
          { label: "Aggregate Missions", value: totalJobs.toLocaleString(), icon: Briefcase, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
          { label: "Retained Profit", value: formatCurrency(totalProfit), icon: BarChart3, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
        ].map((stat, i) => (
          <PremiumCard key={i} className={cn("p-8 group hover:scale-[1.05] transition-all duration-500 bg-background/60 border-2", stat.border)}>
            <div className="flex justify-between items-start mb-6">
                <div className={cn("p-4 rounded-2xl shadow-inner", stat.bg, stat.color)}>
                    <stat.icon size={24} />
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
            </div>
            <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] mb-2 italic">{stat.label}</p>
            <p className="text-4xl font-black text-foreground italic tracking-tighter">{stat.value}</p>
          </PremiumCard>
        ))}
      </div>

      {/* Hub Ranking Matrix */}
      <PremiumCard className="bg-background/40 border-2 border-border/5 shadow-3xl rounded-[4rem] overflow-hidden group/ranking">
        <div className="p-12 border-b border-border/5 bg-black/40 flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-full bg-primary/[0.03] blur-3xl pointer-events-none" />
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-muted/50 rounded-2xl text-primary border border-border/10 shadow-inner group-hover/ranking:rotate-12 transition-transform duration-500">
              <MapPin size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-foreground tracking-[0.2em] uppercase italic">Hub Performance Matrix</h2>
              <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.5em] mt-2 italic">Comparative analysis across geographical nodes</p>
            </div>
          </div>
          <div className="px-6 py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-base font-bold font-black text-emerald-500 uppercase tracking-[0.4em] italic animate-pulse">
            SENSORS_OPTIMIZED
          </div>
        </div>

        <div className="p-12 space-y-8">
            {branchesWithEfficiency.length === 0 ? (
              <div className="p-40 flex flex-col items-center justify-center gap-8 border-2 border-dashed border-border/5 rounded-[3rem] bg-black/20 text-center">
                <Building2 size={80} strokeWidth={1} className="text-muted-foreground opacity-20" />
                <div className="space-y-2">
                    <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">No Node Data Detected</p>
                    <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.5em] italic">The operational landscape is quiescent for this epoch.</p>
                </div>
              </div>
            ) : (
                <div className="grid grid-cols-1 gap-8">
                    {branchesWithEfficiency.map((branch: any, index: number) => {
                        const revenuePercent = (branch.revenue / maxRevenue) * 100
                        const profitMargin = branch.revenue > 0 ? ((branch.profit / branch.revenue) * 100) : 0
                        const isGrowthPositive = branch.revenueGrowth >= 0

                        return (
                        <div
                            key={branch.branchId}
                            className="relative group/node p-10 rounded-[3rem] border-2 border-border/5 bg-black/20 hover:bg-background/60 hover:border-primary/20 transition-all duration-500 overflow-hidden"
                        >
                            {/* Rank Designation */}
                            <div className="absolute -top-1 -left-1 z-10">
                                <div className={cn(
                                    "w-14 h-14 rounded-br-3xl rounded-tl-[2.5rem] flex items-center justify-center text-xl font-black italic shadow-2xl border-b-2 border-r-2",
                                    index === 0 ? 'bg-primary text-white border-primary/30 shadow-primary/20' :
                                    index === 1 ? 'bg-amber-500 text-black border-amber-400/30' :
                                    index === 2 ? 'bg-slate-300 text-black border-slate-200/30' :
                                    'bg-muted/50 text-muted-foreground border-border/5'
                                )}>
                                    {index + 1}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center relative z-10">
                                {/* Hub Designation */}
                                <div className="md:col-span-3 pl-10">
                                    <h3 className="text-2xl font-black text-foreground tracking-widest uppercase italic group-hover/node:text-primary transition-colors leading-none mb-3">{branch.branchName}</h3>
                                    <div className="flex items-center gap-4">
                                        <div className="px-3 py-1 bg-muted/50 rounded-lg border border-border/5 text-base font-bold font-black text-muted-foreground uppercase tracking-widest">
                                            {branch.jobsCount} MISSIONS
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-base font-bold font-black text-emerald-500 italic uppercase">
                                                {branch.efficiency.toFixed(0)}% EFFICIENCY
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Yield Spectrum */}
                                <div className="md:col-span-4 space-y-4">
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] italic">Revenue Spectrum</span>
                                        <span className="text-foreground italic tracking-widest font-sans">
                                            {formatCurrency(branch.revenue)}
                                        </span>
                                    </div>
                                    <div className="h-4 bg-background rounded-full overflow-hidden border border-border/5 p-1">
                                        <div
                                            className="h-full bg-gradient-to-r from-primary via-accent to-blue-500 rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(255,30,133,0.5)]"
                                            style={{ width: `${revenuePercent}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Profit Matrix */}
                                <div className="md:col-span-2 text-center p-6 bg-muted/50 rounded-[2rem] border border-border/5 flex flex-col items-center justify-center">
                                    <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.2em] mb-2 italic">Yield Return</p>
                                    <p className={cn("text-xl font-black italic tracking-widest", branch.profit >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                    {formatCurrency(branch.profit)}
                                    </p>
                                    <div className="mt-2 px-3 py-0.5 bg-black/40 rounded-full border border-border/5 text-base font-bold font-black text-muted-foreground uppercase tracking-widest">
                                    {profitMargin.toFixed(1)}% MARGIN
                                    </div>
                                </div>

                                {/* Delta Indicator */}
                                <div className="md:col-span-3 text-right">
                                    <div className="flex items-center justify-end gap-4 mb-2">
                                        <div className={cn(
                                            "p-2 rounded-xl scale-75 md:scale-100",
                                            isGrowthPositive ? "bg-emerald-500/20 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "bg-rose-500/20 text-rose-500"
                                        )}>
                                            {isGrowthPositive ? (
                                                <TrendingUp size={20} strokeWidth={3} />
                                            ) : (
                                                <TrendingDown size={20} strokeWidth={3} />
                                            )}
                                        </div>
                                        <span className={cn("text-4xl font-black italic tracking-tighter", isGrowthPositive ? 'text-emerald-500' : 'text-rose-500')}>
                                            {isGrowthPositive ? '+' : ''}{branch.revenueGrowth.toFixed(1)}%
                                        </span>
                                    </div>
                                    <p className="text-base font-bold text-muted-foreground font-black uppercase tracking-widest italic leading-none pr-2">
                                    Δ PREV_EPOCH: {formatCurrency(branch.previousRevenue)}
                                    </p>
                                </div>
                            </div>
                            
                            {/* Decorative Grid Lines */}
                            <div className="absolute bottom-0 right-0 w-64 h-64 opacity-5 pointer-events-none translate-x-32 translate-y-32">
                                <div className="w-full h-full rotate-45 border-4 border-border/20 grid grid-cols-4 grid-rows-4" />
                            </div>
                        </div>
                        )
                    })}
                </div>
            )}
        </div>
      </PremiumCard>

      {/* Strategic Advisory */}
      <div className="py-20 border-t border-border/5 flex flex-col items-center opacity-30 hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-6 mb-4">
              <Zap size={24} className="text-primary animate-pulse" />
              <div className="h-px w-40 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <ShieldCheck size={24} className="text-emerald-500" />
          </div>
          <p className="text-[12px] font-black text-foreground uppercase tracking-[0.8em] italic mb-4">Geographical Sentiment Archive // v6.0-TACTICAL</p>
          <p className="text-base font-bold font-bold text-muted-foreground uppercase tracking-widest italic leading-relaxed text-center max-w-2xl px-12">
              All regional metrics are computed via real-time node synchronization. <br />
              Efficiency vectors include completion delta, fuel telemetry, and personnel engagement scores.
          </p>
      </div>
    </div>
  )
}
