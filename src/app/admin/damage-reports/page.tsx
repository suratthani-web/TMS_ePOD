export const dynamic = 'force-dynamic'

import { getDamageReports } from "@/lib/supabase/damage-reports"
import { AlertOctagon, ArrowLeft, User, CheckCircle2, XCircle, Clock, Truck, FileText, Search, ShieldAlert, Target, ShieldCheck, Zap, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string; icon: LucideIcon; glow: string }> = {
  Pending: { 
    bg: 'bg-amber-500/10', 
    text: 'text-amber-500', 
    label: 'PENDING_MONITOR', 
    icon: Clock,
    glow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]'
  },
  Reviewing: { 
    bg: 'bg-blue-500/10', 
    text: 'text-blue-500', 
    label: 'ACTIVE_REVIEW', 
    icon: Search,
    glow: 'shadow-[0_0_15px_rgba(59,130,246,0.2)]'
  },
  Resolved: { 
    bg: 'bg-emerald-500/10', 
    text: 'text-emerald-500', 
    label: 'RESOLVED_OPS', 
    icon: CheckCircle2,
    glow: 'shadow-[0_0_15px_rgba(16,185,129,0.2)]'
  },
  Rejected: { 
    bg: 'bg-rose-500/10', 
    text: 'text-rose-500', 
    label: 'REJECTED_VOID', 
    icon: XCircle,
    glow: 'shadow-[0_0_15px_rgba(244,63,94,0.2)]'
  },
}

const CATEGORY_STYLES: Record<string, string> = {
  'อุบัติเหตุ': 'bg-rose-500/10 text-rose-500 border-rose-500/30',
  'สินค้าชำรุด': 'bg-primary/10 text-primary border-primary/30',
  'สินค้าสูญหาย': 'bg-accent/10 text-accent border-accent/30',
  'อื่นๆ': 'bg-muted/50 text-muted-foreground border-border/10',
}

export default async function DamageReportsPage() {
  const rawReports = await getDamageReports()
  
  const reports = rawReports.map(r => ({
    id: r.id,
    Job_ID: r.Job_ID,
    Status: r.Status || 'Pending',
    Reason_Category: r.Reason_Category || 'อื่นๆ',
    Description: r.Description,
    Created_At: r.Created_At,
    Incident_Date: r.Incident_Date,
    Driver_Name: r.Driver_Name,
    Driver_ID: r.Driver_ID,
    Vehicle_Plate: r.Vehicle_Plate
  }))

  const pendingCount = reports.filter(r => r.Status === 'Pending').length

  return (
    <div className="space-y-12 pb-20 p-4 lg:p-10">
        {/* Tactical Elite Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 bg-background/60 backdrop-blur-3xl p-10 rounded-br-[6rem] rounded-tl-[3rem] border border-rose-500/20 shadow-[0_30px_60px_rgba(244,63,94,0.15)] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
            
            <div className="relative z-10 space-y-8">
                <Link href="/reports" className="inline-flex items-center gap-2 text-muted-foreground hover:text-rose-500 transition-all font-black uppercase tracking-[0.4em] text-base font-bold group/back italic">
                    <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                    Reporting Center
                </Link>
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-rose-500/20 rounded-[2.5rem] border-2 border-rose-500/30 shadow-[0_0_40px_rgba(244,63,94,0.3)] text-rose-500 group-hover:scale-110 transition-all duration-500">
                        <AlertOctagon size={42} strokeWidth={2.5} className="animate-pulse" />
                    </div>
                    <div>
                        <h1 className="text-5xl font-black text-foreground tracking-widest uppercase leading-none italic premium-text-gradient">
                            Damage Intel
                        </h1>
                        <p className="text-base font-bold font-black text-rose-500 uppercase tracking-[0.6em] mt-2 opacity-80 italic italic">Asset Integrity & Logistical Fault Management</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-end gap-4 relative z-10">
                <div className="bg-rose-500/10 border border-rose-500/20 px-8 py-4 rounded-2xl flex items-center gap-4 backdrop-blur-md">
                    <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping shadow-[0_0_15px_rgba(244,63,94,1)]" />
                    <span className="text-xl font-black text-rose-500 uppercase tracking-widest italic">{pendingCount} CRITICAL INCIDENTS DETECTED</span>
                </div>
                <div className="flex items-center gap-4 bg-muted/50 p-4 rounded-2xl border border-border/10">
                   <ShieldAlert className="text-rose-500" size={18} />
                   <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.3em]">Threat Intelligence: ACTIVE</span>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { label: "Pending Review", value: pendingCount.toString().padStart(2, '0'), icon: Clock, color: "rose" },
              { label: "Resolved Today", value: "14", icon: ShieldCheck, color: "emerald" },
              { label: "Damaged Assets", value: "05", icon: Truck, color: "amber" },
              { label: "Lost Cargo", value: "01", icon: Zap, color: "primary" },
            ].map((stat, i) => (
               <PremiumCard key={i} className="p-8 group hover:border-rose-500/40 transition-all duration-500 border-border/5 bg-background/40 backdrop-blur-xl">
                   <div className="flex justify-between items-start mb-4">
                      <span className={cn("text-base font-bold font-black uppercase tracking-widest", stat.color === 'rose' ? 'text-rose-500' : 'text-muted-foreground')}>{stat.label}</span>
                      <stat.icon className="text-rose-500 opacity-20 group-hover:opacity-100 transition-opacity" size={20} />
                   </div>
                   <p className="text-4xl font-black text-foreground italic tracking-tighter mb-2">{stat.value}</p>
                   <div className={cn("h-1 w-12 rounded-full shadow-lg", stat.color === 'rose' ? 'bg-rose-500 shadow-rose-500/20' : 'bg-slate-700')} />
               </PremiumCard>
            ))}
        </div>

        {/* Registry Feed */}
        <PremiumCard className="bg-background/40 border-2 border-border/5 shadow-3xl rounded-[4rem] overflow-hidden group/feed">
          <div className="p-10 border-b border-border/5 bg-black/40 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-10">
            <div className="absolute top-0 left-0 w-80 h-80 bg-rose-500/5 blur-[100px] pointer-events-none" />
            <div className="flex items-center gap-5 relative z-10">
                <div className="p-4 bg-rose-500/20 rounded-2xl text-rose-500 border border-rose-500/30 shadow-inner group-hover/feed:scale-110 transition-transform duration-500">
                    <ShieldAlert size={28} />
                </div>
                <div>
                    <h2 className="text-3xl font-black text-foreground tracking-[0.2em] uppercase italic">Incident Registry</h2>
                    <p className="text-base font-bold font-black text-rose-500/60 uppercase tracking-[0.5em] mt-2 italic italic">Zero-parity fault stream telemetry</p>
                </div>
            </div>

            <div className="relative z-10 w-full md:w-96 group/search">
              <Search size={22} className="absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within/search:text-rose-500 transition-colors" />
              <input 
                placeholder="SCAN_PROTOCOL_OR_ASSET..." 
                className="w-full h-18 bg-background border-border/5 rounded-3xl pl-16 pr-8 text-lg font-bold font-black uppercase tracking-[0.2em] focus:border-rose-500/50 transition-all text-foreground placeholder:text-muted-foreground italic shadow-inner"
              />
            </div>
          </div>

          <div className="divide-y divide-white/[0.03]">
            {reports.length === 0 ? (
              <div className="p-40 text-center opacity-20">
                <AlertOctagon size={80} strokeWidth={1} className="mx-auto mb-8 text-rose-500 animate-pulse" />
                <p className="text-xl font-black text-white uppercase tracking-[0.8em]">All Channels Clear // No Intercepts</p>
              </div>
            ) : (
              reports.map((report) => {
                const statusStyle = STATUS_STYLES[report.Status] || STATUS_STYLES.Pending
                const categoryStyle = CATEGORY_STYLES[report.Reason_Category] || 'bg-muted/50 text-muted-foreground border-border/10'
                const date = new Date(report.Created_At)

                return (
                  <div key={report.id} className="p-12 flex flex-col lg:flex-row gap-12 group/row hover:bg-muted/30 transition-all duration-500 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-0 group-hover/row:h-full bg-rose-500 transition-all duration-700 shadow-[0_0_20px_rgba(244,63,94,0.5)]" />
                    
                    <div className="flex-shrink-0">
                         <div className={cn(
                             "w-20 h-20 rounded-3xl flex items-center justify-center shadow-3xl border-2 transition-all duration-700 group-hover/row:rotate-6 group-hover/row:scale-110",
                             statusStyle.bg, statusStyle.text, statusStyle.glow, "border-border/5"
                         )}>
                              <statusStyle.icon size={32} strokeWidth={2.5} />
                         </div>
                    </div>
                    
                    <div className="flex-1 space-y-8 min-w-0">
                      <div className="flex flex-wrap items-center gap-6">
                        <Link href={`/admin/jobs/${report.Job_ID}`} className="group/link">
                          <span className="text-rose-500 font-black text-lg tracking-widest uppercase italic border-b-2 border-rose-500/20 group-hover/link:border-rose-500 transition-all">
                            ID: {report.Job_ID}
                          </span>
                        </Link>
                        <div className={cn("px-5 py-2 rounded-full text-base font-bold font-black border uppercase tracking-widest italic", categoryStyle)}>
                          {report.Reason_Category}
                        </div>
                        <div className={cn("px-6 py-2 rounded-full text-base font-bold font-black uppercase tracking-[0.2em] shadow-lg italic", statusStyle.bg, statusStyle.text)}>
                          {statusStyle.label}
                        </div>
                        <div className="flex items-center gap-3 ml-auto opacity-40 group-hover/row:opacity-100 transition-opacity">
                             <Clock size={16} className="text-muted-foreground" />
                             <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">
                               TS: {date.toLocaleDateString('th-TH')} {date.toLocaleTimeString('th-TH')}
                             </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                           <div className="flex items-center gap-5 p-6 bg-muted/50 rounded-3xl border border-border/5 shadow-inner group-hover/row:border-border/10 transition-all">
                                <div className="p-3 bg-gradient-to-br from-primary to-accent rounded-2xl text-white shadow-xl group-hover/row:rotate-12 transition-transform">
                                     <User size={18} strokeWidth={2.5} />
                                </div>
                                <div className="flex flex-col">
                                     <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] mb-1">Signal Source</span>
                                     <span className="text-foreground tracking-widest uppercase italic">{report.Driver_Name || "OP_ALPHA"}</span>
                                </div>
                           </div>
                           <div className="flex items-center gap-5 p-6 bg-muted/50 rounded-3xl border border-border/5 shadow-inner group-hover/row:border-border/10 transition-all">
                                <div className="p-3 bg-slate-800 rounded-2xl text-primary shadow-xl group-hover/row:-rotate-12 transition-transform">
                                     <Truck size={18} strokeWidth={2.5} />
                                </div>
                                <div className="flex flex-col">
                                     <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] mb-1">Asset Entity</span>
                                     <span className="text-foreground tracking-widest uppercase italic font-sans">{report.Vehicle_Plate || "FIELD_UNIT"}</span>
                                </div>
                           </div>
                      </div>

                      <div className="bg-black/40 p-10 rounded-[2.5rem] border border-border/5 shadow-inner relative group/intel">
                           <div className="absolute top-4 right-6 flex items-center gap-3 opacity-20 group-hover/intel:opacity-100 transition-opacity">
                                <FileText size={14} className="text-rose-500" />
                                <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.5em]">Intel Narrative</span>
                           </div>
                           <p className="text-foreground transition-colors duration-500">
                                {report.Description || 'Registry transmission incomplete // No narrative provided.'}
                           </p>
                      </div>
                    </div>

                    <div className="lg:w-72 flex flex-col items-center lg:items-end justify-between gap-10 lg:pl-12 lg:border-l border-border/5">
                         <div className="text-right">
                              <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.5em] block mb-2">INCIDENT_TS</span>
                              <span className="text-foreground tracking-widest uppercase italic bg-rose-500/5 px-6 py-2 rounded-2xl border border-rose-500/10 block w-fit ml-auto">
                                {new Date(report.Incident_Date).toLocaleDateString('th-TH')}
                              </span>
                         </div>
                         <PremiumButton className="w-full h-18 rounded-3xl gap-4 shadow-[0_20px_50px_rgba(244,63,94,0.3)] group-hover/row:scale-105 transition-all text-xl tracking-widest bg-rose-600 hover:bg-rose-700 border-0">
                              <Target size={20} /> ANALYZE VECTOR
                         </PremiumButton>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </PremiumCard>
      </div>
  )
}

