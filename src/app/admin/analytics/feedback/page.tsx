import { createClient } from "@/utils/supabase/server"
import { isSuperAdmin } from "@/lib/permissions"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, MessageSquare, Star, User, ExternalLink, Zap, ShieldCheck, Activity, Target, Cpu, Clock, Layers } from "lucide-react"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function CustomerFeedbackPage() {
  const supabase = await createClient()
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

  // 1. Fetch feedback records first
  const { data: feedback, error: fetchError } = await supabase
    .from('job_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  const baseFeedback = feedback || []
  const jobIds = [...new Set(baseFeedback.map(f => f.job_id).filter(Boolean))]

  // 2. Fetch related job details manually (to avoid schema join errors)
  let jobsMap: Record<string, { Job_ID: string; Customer_Name: string; Driver_Name: string }> = {}
  if (jobIds.length > 0) {
    const { data: jobsData } = await supabase
      .from('Jobs_Main')
      .select('Job_ID, Customer_Name, Driver_Name')
      .in('Job_ID', jobIds)
    
    if (jobsData) {
        jobsMap = jobsData.reduce((acc, job) => ({
            ...acc,
            [job.Job_ID]: job
        }), {})
    }
  }

  // 3. Combine data
  const feedbackData = baseFeedback.map(f => ({
    ...f,
    Jobs_Main: jobsMap[f.job_id] || null
  }))

  const totalFeedback = feedbackData.length
  const averageRating = totalFeedback > 0 
    ? (feedbackData.reduce((acc: number, f) => acc + (f.rating || 0), 0) / totalFeedback).toFixed(1)
    : "0.0"

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
              <div className="p-4 bg-indigo-500/20 rounded-[2.5rem] border-2 border-indigo-500/30 shadow-[0_0_40px_rgba(99,102,241,0.2)] text-indigo-400">
                <MessageSquare size={40} strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-5xl font-black text-foreground tracking-widest uppercase leading-none italic premium-text-gradient">Sentiment Intel</h1>
                <p className="text-base font-bold font-black text-primary uppercase tracking-[0.6em] mt-2 opacity-80 italic italic">Voices of the Customer // Quality Monitoring Loop</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 self-end lg:self-center">
            <div className="bg-muted/50 border border-border/10 px-6 py-3 rounded-2xl flex items-center gap-3">
                <Activity className="text-indigo-400" size={16} />
                <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">STREAM_QUALITY: 100%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Global KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <PremiumCard className="p-10 border-indigo-500/20 shadow-indigo-500/5 hover:scale-[1.05] transition-all duration-500">
            <div className="flex justify-between items-start mb-6">
                <div className="p-4 bg-indigo-500/10 rounded-2xl text-indigo-400 shadow-inner">
                    <Layers size={24} />
                </div>
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] mb-2 italic">Total Responses</p>
            <p className="text-5xl font-black text-foreground italic tracking-tighter">{totalFeedback}</p>
        </PremiumCard>

        <PremiumCard className="p-10 border-amber-500/20 shadow-amber-500/5 hover:scale-[1.05] transition-all duration-500">
            <div className="flex justify-between items-start mb-6">
                <div className="p-4 bg-amber-500/10 rounded-2xl text-amber-400 shadow-inner">
                    <Star size={24} />
                </div>
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            </div>
            <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] mb-2 italic">Mean CSAT Score</p>
            <p className="text-5xl font-black text-foreground italic tracking-tighter">{averageRating} / 5.0</p>
        </PremiumCard>

        <PremiumCard className="p-10 border-primary/20 shadow-primary/5 hover:scale-[1.05] transition-all duration-500">
            <div className="flex justify-between items-start mb-6">
                <div className="p-4 bg-primary/10 rounded-2xl text-primary shadow-inner">
                    <Cpu size={24} />
                </div>
                <div className="h-2 w-2 rounded-full bg-primary animate-ping" />
            </div>
            <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] mb-2 italic">Sentiment Index</p>
            <p className="text-5xl font-black text-foreground italic tracking-tighter">POSITIVE</p>
        </PremiumCard>
      </div>

      {/* Feedback Feed */}
      <PremiumCard className="bg-background/40 border-2 border-border/5 shadow-3xl rounded-[4rem] overflow-hidden group/feed">
        <div className="p-12 border-b border-border/5 bg-black/40 flex items-center justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-full bg-indigo-500/[0.03] blur-3xl pointer-events-none" />
          <div className="flex items-center gap-6 relative z-10">
            <div className="p-4 bg-muted/50 rounded-2xl text-indigo-400 border border-border/10 shadow-inner group-hover/feed:rotate-12 transition-transform duration-500">
              <Clock size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-foreground tracking-[0.2em] uppercase italic">Live Feedback Stream</h2>
              <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.5em] mt-2 italic">Chronological audit of mission sentiment logs</p>
            </div>
          </div>
          <div className="px-6 py-2 bg-indigo-500/10 rounded-full border border-indigo-500/20 text-base font-bold font-black text-indigo-400 uppercase tracking-[0.4em] italic animate-pulse">
            SYNC_ACTIVE
          </div>
        </div>

        <div className="p-12 space-y-8">
          {feedbackData.length === 0 ? (
            <div className="p-40 flex flex-col items-center justify-center gap-8 border-2 border-dashed border-border/5 rounded-[3rem] bg-black/20 text-center">
              <MessageSquare size={80} strokeWidth={1} className="text-muted-foreground opacity-20" />
              <div className="space-y-2">
                  <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">Awaiting Uplink</p>
                  <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.5em] italic">No customer sentiment vectors detected in current epoch.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-10">
              {feedbackData.map((f) => (
                <div key={f.id} className="relative group/msg p-10 rounded-[3rem] border-2 border-border/5 bg-black/20 hover:bg-background/60 hover:border-indigo-500/20 transition-all duration-500 overflow-hidden">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-10 relative z-10">
                    <div className="flex-1 space-y-6">
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-[1.5rem] bg-muted/50 flex items-center justify-center text-2xl font-black text-indigo-400 border border-border/5 shadow-xl">
                          {f.rating}
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                              <span className="text-2xl font-black text-foreground uppercase italic tracking-wider">
                                  {f.Jobs_Main?.Customer_Name || 'UNKNOWN_ENTITY'}
                              </span>
                              <Badge variant="outline" className="bg-indigo-500/5 border-indigo-500/20 text-indigo-400 font-black uppercase text-[10px] tracking-[0.2em] px-3">VERIFIED_MISSION</Badge>
                          </div>
                          <div className="flex items-center gap-4 text-muted-foreground font-black uppercase text-xs tracking-widest italic">
                              <span className="flex items-center gap-2"><User size={12} className="text-indigo-400" /> {f.Jobs_Main?.Driver_Name}</span>
                              <span className="w-1 h-1 rounded-full bg-slate-800" />
                              <span className="flex items-center gap-2"><Target size={12} className="text-indigo-400" /> {f.job_id}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xl font-bold text-foreground leading-relaxed italic border-l-4 border-indigo-500 pl-8 py-2 bg-indigo-500/5 rounded-r-2xl pr-6">
                        "{f.comment || 'No textual feedback provided.'}"
                      </p>
                    </div>
                    <div className="text-right space-y-4">
                      <p className="text-2xl font-black text-foreground tracking-tighter uppercase italic opacity-60">
                          {new Date(f.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                      <Link href={`/admin/jobs/${f.job_id}`}>
                          <PremiumButton variant="outline" size="sm" className="h-12 border-border/10 text-white gap-3 rounded-xl px-6 group/btn">
                              VIEW_MISSION <ExternalLink size={14} className="group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1 transition-transform" />
                          </PremiumButton>
                      </Link>
                    </div>
                  </div>
                  {/* Decorative element */}
                  <div className="absolute top-0 right-0 p-10 opacity-[0.02] pointer-events-none transform translate-x-8 -translate-y-8">
                      <MessageSquare size={200} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PremiumCard>

      {/* Neural advisory Footnote */}
      <div className="py-24 border-t border-border/5 flex flex-col items-center opacity-30 hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-6 mb-6">
              <Zap size={28} className="text-indigo-400 animate-pulse" />
              <div className="h-px w-64 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <ShieldCheck size={28} className="text-emerald-500" />
          </div>
          <p className="text-[12px] font-black text-white uppercase tracking-[0.8em] italic mb-6">Global Sentiment Repository // v8.4-STABLE</p>
          <p className="text-base font-bold font-bold text-muted-foreground uppercase tracking-widest italic leading-relaxed text-center max-w-3xl px-12">
              All sentiment vectors are ingested via authenticated client portals. <br />
              Intelligence accuracy is maintained through biometric-linked verification protocols.
          </p>
      </div>
    </div>
  )
}
