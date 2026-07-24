"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  FileText, 
  Search,
  Image as ImageIcon,
  PenTool,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  Filter,
  ArrowRight
} from "lucide-react"
import { getAllPODs, getPODStats } from "@/lib/supabase/pod"
import { PODExport } from "@/components/pod/pod-export"
import { useLanguage } from "@/components/providers/language-provider"
import Link from "next/link"
import NextImage from "next/image"
import { cn } from "@/lib/utils"
import { PremiumButton } from "@/components/ui/premium-button"
import { PremiumCard } from "@/components/ui/premium-card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Pagination } from "@/components/ui/pagination"
import type { PODRecord } from "@/lib/supabase/pod"

type PODPageProps = {
  pods: PODRecord[]
  stats: Awaited<ReturnType<typeof getPODStats>>
  count: number
  limit: number
  searchParams: { q?: string; from?: string; to?: string; page?: string | number }
}

export default function PODPage({ pods, stats, count, limit, searchParams }: PODPageProps) {
  const { t } = useLanguage()
  const [filterQuery, setFilterQuery] = useState('')
  
  const statusConfig: Record<string, { label: string; color: string; glow: string; icon: React.ReactNode }> = {
    Delivered: { label: t('common.success'), color: "text-emerald-400 bg-emerald-500/10", glow: "shadow-[0_0_15px_rgba(16,185,129,0.3)]", icon: <CheckCircle2 size={12} /> },
    Complete: { label: t('common.success'), color: "text-emerald-400 bg-emerald-500/10", glow: "shadow-[0_0_15px_rgba(16,185,129,0.3)]", icon: <CheckCircle2 size={12} /> },
    Completed: { label: t('common.success'), color: "text-emerald-400 bg-emerald-500/10", glow: "shadow-[0_0_15px_rgba(16,185,129,0.3)]", icon: <CheckCircle2 size={12} /> },
    "In Transit": { label: t('jobs.status_in_transit'), color: "text-primary bg-primary/10", glow: "shadow-[0_0_15px_rgba(255,30,133,0.3)]", icon: <Clock size={12} /> },
    "Picked Up": { label: t('jobs.status_picked_up'), color: "text-primary/80 bg-primary/5", glow: "shadow-none", icon: <Clock size={12} /> },
    Failed: { label: t('common.error'), color: "text-rose-400 bg-rose-500/10", glow: "shadow-[0_0_15px_rgba(244,63,94,0.3)]", icon: <AlertCircle size={12} /> },
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Tactical Hub Header */}
      <div className="bg-background p-8 rounded-3xl border border-border/5 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          <div>
            <div className="flex items-center gap-4 mb-2">
               <div className="p-2 bg-primary/20 rounded-xl border-2 border-primary/30 shadow-[0_0_20px_rgba(255,30,133,0.2)] text-primary">
                  <FileText size={24} strokeWidth={2.5} />
               </div>
               <div>
                  <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-widest uppercase leading-none mb-1 italic premium-text-gradient">{t('navigation.pod')}</h1>
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.6em] opacity-80 italic">{t('dashboard.subtitle')}</p>
               </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
             <PODExport data={pods} />
          </div>
        </div>
      </div>

      {/* Intelligence Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('pod.total'), value: stats.total, icon: FileText, color: "text-primary" },
          { label: t('pod.completed'), value: stats.complete, icon: CheckCircle2, color: "text-emerald-400" },
          { label: t('pod.visual_proof'), value: stats.withPhoto, icon: ImageIcon, color: "text-primary", unit: true },
          { label: t('pod.auth_sig'), value: stats.withSignature, icon: PenTool, color: "text-primary", unit: true },
        ].map((stat, i) => (
          <PremiumCard key={i} className="p-5 group hover:border-primary/50 transition-all duration-500 border-border/5 bg-muted/50 rounded-xl">
             <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">{stat.label}</span>
                <stat.icon className={cn(stat.color, "opacity-20 group-hover:opacity-100 transition-opacity")} size={16} />
             </div>
             <div className="flex items-baseline gap-2">
                <p className={cn("text-3xl font-black italic tracking-tighter mb-1", stat.color)}>{stat.value}</p>
                {stat.unit && <span className="text-[10px] font-bold font-black text-muted-foreground uppercase">{t('common.units')}</span>}
             </div>
             <div className="h-0.5 w-8 bg-primary/40 rounded-full" />
          </PremiumCard>
        ))}
      </div>

      {/* Filter Matrix */}
      <div className="bg-background p-6 rounded-2xl border border-border/5 shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
        <form className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end relative z-10">
          <div className="md:col-span-1 space-y-2">
             <Label className="text-[10px] font-black text-primary uppercase tracking-[0.4em] ml-2">{t('common.search')}</Label>
             <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-hover:text-primary" size={16} />
                <Input 
                   name="q"
                   placeholder={t('common.search')} 
                   className="pl-11 h-11 bg-muted/50 border-border/5 text-foreground font-black uppercase tracking-widest rounded-xl focus:bg-muted/80 transition-all text-xs outline-none" 
                   defaultValue={searchParams.q as string || ''}
                />
             </div>
          </div>
          <div className="space-y-2">
             <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-2">{t('common.date')}</Label>
             <Input 
                type="date" 
                name="from" 
                defaultValue={searchParams.from as string || ''} 
                className="h-11 bg-muted/50 border-border/5 text-foreground font-black rounded-xl focus:bg-muted/80 transition-all text-xs" 
             />
          </div>
          <div className="space-y-2">
             <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-2">{t('common.date')}</Label>
             <Input 
                type="date" 
                name="to" 
                defaultValue={searchParams.to as string || ''} 
                className="h-11 bg-muted/50 border-border/5 text-foreground font-black rounded-xl focus:bg-muted/80 transition-all text-xs" 
             />
          </div>
          <PremiumButton type="submit" className="h-11 rounded-xl gap-2 shadow-lg text-xs font-black uppercase tracking-widest">
             <Filter size={16} /> {t('common.search')}
          </PremiumButton>
        </form>
      </div>

      {/* POD Repository Table */}
      <div className="bg-background rounded-3xl border border-border/5 shadow-xl overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/5 bg-muted/30">
                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest italic">{t('jobs.col_id')}</th>
                <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest italic">{t('common.date')}</th>
                <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest italic">{t('navigation.customers')}</th>
                <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest italic">{t('navigation.drivers')}</th>
                <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest italic text-center">{t('pod.pickup_evidence') || 'PICKUP PROOF'}</th>
                <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest italic text-center">{t('pod.visual_proof')} (POD)</th>
                <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest italic text-center">{t('common.status')}</th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-muted-foreground uppercase tracking-widest italic">{t('common.action')}</th>
              </tr>
            </thead>
            <tbody>
              {pods.map((pod) => (
                <tr key={pod.Job_ID} className="border-b border-white/[0.02] hover:bg-muted/40 transition-all group">
                  <td className="px-6 py-3">
                    <Link href={`/admin/jobs/${pod.Job_ID}?from=pod`}>
                       <span className="text-primary font-black text-sm tracking-tighter uppercase group-hover:scale-105 block origin-left transition-transform font-display">
                          {pod.Job_ID}
                       </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                       <span className="text-xs font-black text-foreground uppercase tracking-tight italic">
                          {pod.Plan_Date ? new Date(pod.Plan_Date).toLocaleDateString('th-TH') : "N/A"}
                       </span>
                       <span className="text-[9px] font-black text-muted-foreground uppercase opacity-60 tracking-widest">SYNCED</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                     <span className="text-xs font-black text-foreground uppercase tracking-tight truncate max-w-[180px] block italic">
                        {pod.Customer_Name || t('common.loading')}
                     </span>
                  </td>
                  <td className="px-4 py-3">
                     <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-black text-primary border border-primary/30">
                           {pod.Driver_Name?.slice(0,1) || "A"}
                        </div>
                        <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest italic">{pod.Driver_Name || t('common.auto')}</span>
                     </div>
                  </td>
                  {/* Pickup Evidence */}
                  <td className="px-4 py-3 text-center">
                     <div className="flex items-center justify-center gap-2">
                        {pod.Pickup_Photo_Url ? (
                           <div className="group/visual relative">
                              <div className="w-8 h-8 rounded-lg border border-border/10 overflow-hidden bg-black shadow-lg relative transition-all group-hover/visual:scale-125 z-10 group-hover/visual:border-indigo-500">
                                 <img 
                                    src={pod.Pickup_Photo_Url.split(',')[0]} 
                                    alt="Pickup Photo" 
                                    className="w-full h-full object-cover opacity-80 group-hover/visual:opacity-100 transition-opacity" 
                                 />
                              </div>
                           </div>
                        ) : (
                           <div className="w-4 h-px bg-muted/20" />
                        )}
                        {pod.Pickup_Signature_Url ? (
                           <div className="group/sig relative cursor-pointer" onClick={() => window.open(pod.Pickup_Signature_Url!.split(',')[0], '_blank')}>
                              <div className="w-10 h-7 rounded border border-border/10 overflow-hidden bg-white shadow-lg relative transition-all group-hover/sig:scale-125 z-10 group-hover/sig:border-indigo-500">
                                 <img 
                                    src={pod.Pickup_Signature_Url.split(',')[0]} 
                                    alt="Pickup Sig" 
                                    className="w-full h-full object-contain p-0.5" 
                                 />
                              </div>
                           </div>
                        ) : (
                           <div className="w-4 h-px bg-muted/20" />
                        )}
                     </div>
                  </td>
                  {/* Delivery Evidence */}
                  <td className="px-4 py-3 text-center">
                     <div className="flex items-center justify-center gap-2">
                        {pod.Photo_Proof_Url ? (
                           <div className="group/visual relative cursor-pointer" onClick={() => window.open(pod.Photo_Proof_Url!.split(',')[0], '_blank')}>
                              <div className="w-8 h-8 rounded-lg border border-border/10 overflow-hidden bg-black shadow-lg relative transition-all group-hover/visual:scale-125 z-10 group-hover/visual:border-primary">
                                 <img 
                                    src={pod.Photo_Proof_Url.split(',')[0]} 
                                    alt={t('pod.visual_proof')} 
                                    className="w-full h-full object-cover opacity-80 group-hover/visual:opacity-100 transition-opacity" 
                                 />
                              </div>
                           </div>
                        ) : (
                           <div className="w-4 h-px bg-muted/20" />
                        )}
                        {pod.Signature_Url ? (
                           <div className="group/sig relative cursor-pointer" onClick={() => window.open(pod.Signature_Url!.split(',')[0], '_blank')}>
                              <div className="w-10 h-7 rounded border border-border/10 overflow-hidden bg-white shadow-lg relative transition-all group-hover/sig:scale-125 z-10 group-hover/sig:border-primary">
                                 <img 
                                    src={pod.Signature_Url.split(',')[0]} 
                                    alt={t('pod.auth_sig')} 
                                    className="w-full h-full object-contain p-0.5" 
                                 />
                              </div>
                           </div>
                        ) : (
                           <div className="w-4 h-px bg-muted/20" />
                        )}
                     </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className={cn(
                      "inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/5 ml-auto",
                      statusConfig[pod.Job_Status]?.color || 'text-muted-foreground bg-muted/50'
                    )}>
                       <span className="text-[9px] font-black uppercase tracking-widest italic whitespace-nowrap">
                          {statusConfig[pod.Job_Status]?.label || pod.Job_Status}
                       </span>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Link href={`/admin/jobs/${pod.Job_ID}?from=pod`}>
                       <button className="p-2 rounded-lg bg-muted/50 hover:bg-primary hover:text-black text-muted-foreground transition-all border border-transparent group/btn">
                          <ArrowRight size={16} className="transition-transform group-hover/btn:translate-x-1" />
                       </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pods.length === 0 && (
          <div className="py-24 text-center opacity-30">
             <FileText size={48} className="mx-auto mb-4 text-muted-foreground" />
             <p className="text-sm font-black uppercase tracking-[0.4em] text-foreground">{t('common.no_data')}</p>
          </div>
        )}
      </div>

      <div className="p-4 bg-muted/30 border-t border-border/5 rounded-b-3xl flex justify-center">
         <Pagination totalItems={count} limit={limit} />
      </div>
    </div>
  )
}

