import { Suspense } from "react"
import { getDetailedDriverAnalytics } from "@/lib/supabase/analytics"
import { cookies } from "next/headers"
import { isSuperAdmin } from "@/lib/permissions"
import { evaluateDriverPerformance } from "@/services/driver-evaluation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Trophy, Medal, Star, TrendingUp, Package, Clock, ShieldCheck, MapPin, Search, Zap, Target, Cpu, Activity, User, Coins, FileCheck } from "lucide-react"
import { MonthFilter } from "@/components/analytics/month-filter"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const dynamic = "force-dynamic"

export default async function DriverLeaderboardPage(props: {
  searchParams: Promise<{ [key: string]: string | undefined }>
}) {
  const searchParams = await props.searchParams
  const cookieStore = await cookies()
  const branchId = searchParams.branch || cookieStore.get("selectedBranch")?.value || "All"
  const isAdmin = await isSuperAdmin()

  if (!isAdmin) {
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

  const rawDrivers = await getDetailedDriverAnalytics(startDate, endDate, branchId)
  
  const drivers = rawDrivers.map(d => {
    const evaluation = evaluateDriverPerformance({
        completedJobs: d.completedJobs,
        totalJobs: d.totalJobs,
        onTimeJobs: d.onTimeJobs,
        avgRating: d.avgRating,
        totalEarnings: d.totalEarnings,
        isSubcontractor: !!d.subId
    })
    return { ...d, evaluation }
  })

  const topThree = drivers.slice(0, 3)
  const rest = drivers.slice(3)

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
                  <Trophy size={40} strokeWidth={2.5} />
                </div>
                <div>
                  <h1 className="text-5xl font-black text-foreground tracking-widest uppercase leading-none italic premium-text-gradient">Operator Matrix</h1>
                  <p className="text-base font-bold font-black text-primary uppercase tracking-[0.6em] mt-2 opacity-80 italic">Performance Intelligence & Rewards {branchId !== 'All' ? `// ${branchId}` : ''}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-muted/50 border border-border/10 p-4 rounded-3xl backdrop-blur-xl">
              <MonthFilter />
            </div>
          </div>
        </div>

        {/* Podium Module (Top 3 Operators) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 px-4">
          {topThree.map((driver, idx) => (
            <PremiumCard key={driver.driverId} className={cn(
              "relative p-10 overflow-hidden group border-2 bg-background/60 rounded-[3.5rem] transition-all duration-700 hover:scale-[1.05]",
              idx === 0 ? "border-primary/50 shadow-[0_0_50px_rgba(255,30,133,0.2)] md:-translate-y-4 z-10" : 
              idx === 1 ? "border-slate-300/30" : "border-amber-700/30"
            )}>
              {/* Rank Designation */}
              <div className={cn(
                  "absolute top-6 right-6 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl border-2 transition-transform group-hover:rotate-12",
                  idx === 0 ? "bg-primary text-white border-primary/40 shadow-primary/20" :
                  idx === 1 ? "bg-slate-300 text-black border-slate-200/40" : "bg-amber-700 text-white border-amber-600/40"
              )}>
                  <span className="text-xl font-black">{driver.evaluation.grade}</span>
              </div>

              <div className="flex flex-col items-center text-center mt-6">
                  <div className="w-28 h-28 rounded-[2.5rem] bg-muted/50 mb-8 flex items-center justify-center text-4xl font-black text-foreground italic border-4 border-border/10 shadow-3xl relative group/avatar overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent group-hover/avatar:opacity-0 transition-opacity" />
                      {driver.name.slice(0, 1)}
                  </div>
                  <h3 className="text-3xl font-black text-foreground uppercase tracking-tight mb-2 group-hover:text-primary transition-colors">{driver.name}</h3>
                  <Badge variant="outline" className={cn(
                    "font-black uppercase tracking-widest px-4 py-1.5 rounded-xl mb-8 shadow-sm",
                    driver.subId ? "bg-amber-500/10 border-amber-500/20 text-amber-500" : "bg-primary/10 border-primary/20 text-primary"
                  )}>
                      {driver.subId ? "Subcontractor Unit" : "Company Asset"}
                  </Badge>

                  <div className="w-full space-y-4 mb-8">
                    {driver.subId ? (
                        <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Renewal Index</p>
                            <p className="text-2xl font-black text-emerald-400 italic">{driver.evaluation.renewalIndex}%</p>
                        </div>
                    ) : (
                        <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Estimated Incentive</p>
                            <p className="text-2xl font-black text-indigo-400 italic">฿{driver.evaluation.incentiveAmount?.toLocaleString()}</p>
                        </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-6 w-full pt-8 border-t border-border/5">
                      <div className="space-y-1">
                          <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">Missions</p>
                          <p className="text-3xl font-black text-foreground tracking-tighter italic">{(driver as any).jobsCount}</p>
                      </div>
                      <div className="space-y-1">
                          <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">Efficiency</p>
                          <p className="text-3xl font-black text-foreground tracking-tighter italic">{driver.evaluation.score}%</p>
                      </div>
                  </div>
              </div>
            </PremiumCard>
          ))}
        </div>

        {/* Detailed Register */}
        <PremiumCard className="bg-background/40 border-2 border-border/5 shadow-3xl rounded-[4rem] overflow-hidden group/register">
          <div className="p-12 border-b border-border/5 bg-black/40 flex items-center justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-full bg-primary/[0.03] blur-3xl pointer-events-none" />
            <div className="flex items-center gap-6 relative z-10">
              <div className="p-4 bg-muted/50 rounded-2xl text-primary border border-border/10 shadow-inner group-hover/register:rotate-12 transition-transform duration-500">
                <Activity size={28} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-foreground tracking-[0.2em] uppercase italic">Operative Register</h2>
                <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.5em] mt-2 italic">Full performance metrics for all tactical units</p>
              </div>
            </div>
          </div>

          <div className="p-0">
            <Table>
              <TableHeader className="bg-black/20 border-b border-border/5">
                <TableRow className="hover:bg-transparent border-none">
                  <TableHead className="h-20 px-12 text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">Unit Designation</TableHead>
                  <TableHead className="h-20 px-8 text-center text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">Efficiency</TableHead>
                  <TableHead className="h-20 px-8 text-right text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">Type</TableHead>
                  <TableHead className="h-20 px-8 text-center text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">Admin Review</TableHead>
                  <TableHead className="h-20 px-12 text-right text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">Incentive / Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rest.map((driver) => (
                  <TableRow key={driver.driverId} className="group hover:bg-primary/[0.03] border-border/5 transition-colors">
                    <TableCell className="py-10 px-12">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center font-black text-xl italic border border-border/5 group-hover:border-primary/30 transition-all">
                          {driver.evaluation.grade}
                        </div>
                        <div>
                          <p className="text-xl font-black text-foreground uppercase italic tracking-tight">{driver.name}</p>
                          <p className="text-base font-bold font-bold text-muted-foreground uppercase tracking-widest italic">PLATE: {driver.plate}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center py-10 px-8">
                        <div className="flex flex-col items-center gap-3">
                            <span className="text-base font-bold font-black text-primary">{driver.evaluation.score}%</span>
                            <div className="w-24 h-1.5 bg-background rounded-full overflow-hidden border border-border/5">
                                <div className={cn(
                                    "h-full rounded-full transition-all duration-1000",
                                    driver.evaluation.score > 80 ? "bg-emerald-500" : driver.evaluation.score > 60 ? "bg-amber-500" : "bg-rose-500"
                                )} style={{ width: `${driver.evaluation.score}%` }} />
                            </div>
                        </div>
                    </TableCell>
                    <TableCell className="text-right py-10 px-8">
                        <Badge variant="outline" className={cn(
                            "font-black uppercase tracking-widest",
                            driver.subId ? "border-amber-500/30 text-amber-500" : "border-indigo-500/30 text-indigo-500"
                        )}>
                            {driver.subId ? "Subcon" : "Company"}
                        </Badge>
                    </TableCell>
                    <TableCell className="py-10 px-8">
                        <div className="flex flex-col items-center gap-1">
                            {driver.subId ? (
                                <>
                                    <FileCheck className={cn("w-5 h-5", driver.evaluation.renewalIndex! > 75 ? "text-emerald-500" : "text-amber-500")} />
                                    <span className="text-[10px] font-black uppercase text-muted-foreground">Renewal Score: {driver.evaluation.renewalIndex}%</span>
                                </>
                            ) : (
                                <>
                                    <Coins className="w-5 h-5 text-indigo-500" />
                                    <span className="text-[10px] font-black uppercase text-muted-foreground">Grade Point {driver.evaluation.grade}</span>
                                </>
                            )}
                        </div>
                    </TableCell>
                    <TableCell className="py-10 px-12 text-right">
                        {driver.subId ? (
                            <span className={cn(
                                "text-xl font-black italic",
                                driver.evaluation.renewalIndex! > 75 ? "text-emerald-400" : "text-rose-400"
                            )}>
                                {driver.evaluation.renewalIndex! > 75 ? "RECOMMEND_RENEW" : "REVIEW_CONTRACT"}
                            </span>
                        ) : (
                            <span className="text-xl font-black text-indigo-400 italic">
                                ฿{driver.evaluation.incentiveAmount?.toLocaleString()}
                            </span>
                        )}
                    </TableCell>
                  </TableRow>
                ))}
                {drivers.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={5} className="h-80 text-center">
                            <div className="flex flex-col items-center gap-6 opacity-20">
                                <Activity size={64} strokeWidth={1} />
                                <p className="text-xl font-black uppercase tracking-widest italic">No Performance Data Logged</p>
                            </div>
                        </TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </PremiumCard>

        {/* Intelligence Advisory */}
        <div className="py-24 border-t border-border/5 flex flex-col items-center opacity-30 hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-6 mb-6">
                <Target size={28} className="text-primary animate-pulse" />
                <div className="h-px w-64 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <Cpu size={28} className="text-indigo-500" />
            </div>
            <p className="text-[12px] font-black text-white uppercase tracking-[0.8em] italic mb-6">Operative Sentiment Grid // v12.2-STABLE</p>
            <p className="text-base font-bold text-muted-foreground uppercase tracking-widest italic leading-relaxed text-center max-w-3xl px-12">
                All performance vectors are recalculated via real-time personnel synchronization. <br />
                Metrics include mission delta, safety adherence, and client satisfaction scores.
            </p>
      </div>
    </div>
  )
}
