"use client"

import { motion, AnimatePresence } from "framer-motion"
import {
  AlertTriangle,
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  User,
  Truck,
  ShieldAlert,
  Activity,
  ArrowRight,
  Zap
} from "lucide-react"
import { getAllSOSAlerts, getSOSCount, SOSAlert } from "@/lib/supabase/sos"
import { PremiumButton } from "@/components/ui/premium-button"
import { PremiumCard } from "@/components/ui/premium-card"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"
import Link from "next/link"
import { useState, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"

interface SOSPageProps {
  alerts: SOSAlert[]
  activeCount: number
}

export default function SOSPage({ alerts: initialAlerts, activeCount: initialCount }: SOSPageProps) {
  const { t } = useLanguage()
  const [alerts, setAlerts] = useState<SOSAlert[]>(initialAlerts)
  const [activeCount, setActiveCount] = useState(initialCount)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('sos-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Jobs_Main'
      }, async (payload) => {
        // If status changed to SOS or an SOS alert was updated/deleted
        const newRecord = payload.new as Record<string, unknown> | undefined
        const oldRecord = payload.old as Record<string, unknown> | undefined
        const isSOS = newRecord?.Job_Status === 'SOS' || oldRecord?.Job_Status === 'SOS'
        
        if (isSOS) {
          const [freshAlerts, freshCount] = await Promise.all([
            getAllSOSAlerts(),
            getSOSCount()
          ])
          setAlerts(freshAlerts)
          setActiveCount(freshCount)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
  return (
    <div className="space-y-8 pb-20">
      {/* Strategic SOS Hub Header */}
      <div className="bg-card p-8 rounded-3xl border border-rose-500/20 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-80 h-80 bg-rose-500/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          <div>
            <div className="flex items-center gap-4 mb-2">
               <div className="p-2 bg-rose-500/20 rounded-xl border-2 border-rose-500/30 shadow-[0_0_20px_rgba(244,63,94,0.3)] text-rose-500 animate-pulse">
                  <ShieldAlert size={24} strokeWidth={2.5} />
               </div>
               <div>
                  <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-widest uppercase leading-none mb-1 premium-text-gradient italic">
                    {t('navigation.sos')}
                  </h1>
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.6em] opacity-80 italic">{t('dashboard.subtitle')}</p>
               </div>
            </div>
          </div>
          
          {activeCount > 0 && (
            <div className="bg-rose-500/10 border border-rose-500/30 px-5 py-2 rounded-xl flex items-center gap-3 backdrop-blur-md shadow-lg">
               <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping shadow-[0_0_10px_rgba(244,63,94,1)]" />
               <span className="text-xs font-black text-rose-500 uppercase tracking-widest italic">
                  {activeCount} {t('monitoring.alerts')}
               </span>
            </div>
          )}
        </div>
      </div>

      {/* Rapid Intelligence Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         {[
           { label: t('monitoring.alerts'), value: activeCount, icon: Activity, color: "text-rose-400", bg: "bg-rose-500/5", border: "border-rose-500/20" },
           { label: t('planning.stats_pending'), value: alerts.filter((a: SOSAlert) => a.Job_Status === 'Failed').length, icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/5", border: "border-amber-500/20" },
           { label: t('planning.stats_delivered'), value: alerts.length, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-muted/5", border: "border-border/5" }
         ].map((stat, i) => (
           <PremiumCard key={i} className={cn("p-5 transition-all shadow-lg rounded-xl border", stat.bg, stat.border)}>
              <div className="flex justify-between items-start mb-3">
                 <span className="text-[10px] font-black uppercase tracking-widest leading-none text-muted-foreground">{stat.label}</span>
                 <stat.icon className={cn(stat.color, "opacity-30")} size={16} />
              </div>
              <p className="text-3xl font-black text-foreground italic tracking-tighter mb-1">{stat.value}</p>
              <div className={cn("h-0.5 w-8 rounded-full", stat.color.replace('text-', 'bg-'))} />
           </PremiumCard>
         ))}
      </div>

      {/* SOS Signal Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {alerts.length === 0 ? (
          <div className="col-span-full py-24 text-center opacity-20 bg-background/40 rounded-3xl border-2 border-dashed border-border/5">
            <Zap size={48} className="mx-auto text-emerald-500 mb-4 animate-pulse" />
            <h3 className="text-sm font-black text-foreground uppercase tracking-[0.8em]">{t('dashboard.system_integrity')}</h3>
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em] mt-2">{t('common.success')}</p>
          </div>
        ) : alerts.map((alert: SOSAlert) => (
          <motion.div 
            key={alert.Job_ID}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ y: -5 }}
            className={cn(
               "p-6 rounded-2xl border bg-background/40 backdrop-blur-3xl relative overflow-hidden transition-all duration-500 shadow-xl",
               alert.Job_Status === 'SOS' 
                 ? "border-rose-500/30 ring-1 ring-rose-500/10 shadow-[0_15px_40px_rgba(244,63,94,0.1)]" 
                 : "border-border/5 hover:border-border/20 shadow-lg"
            )}
          >
            {/* Status Glint */}
            <div className={cn(
               "absolute top-0 right-8 w-16 h-1 rounded-b-full shadow-[0_0_15px_currentColor]",
               alert.Job_Status === 'SOS' ? "bg-rose-500 text-rose-500" : "bg-amber-500 text-amber-500"
            )} />

            <div className="flex items-start justify-between mb-6">
               <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-rose-500 uppercase tracking-[0.4em]">{t('sos.sig_analysis')}</span>
                  <p className="text-sm font-black text-muted-foreground uppercase tracking-widest italic">#{alert.Job_ID}</p>
               </div>
               <div className={cn(
                  "p-2.5 rounded-xl border",
                  alert.Job_Status === 'SOS' ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
               )}>
                  <ShieldAlert size={18} className={alert.Job_Status === 'SOS' ? "animate-pulse" : ""} />
               </div>
            </div>

            <h3 className="text-xl font-black text-foreground uppercase tracking-tighter mb-6 leading-none italic">
               {alert.Job_Status === 'SOS' ? t('navigation.sos') : t('common.error')}
            </h3>

            <div className="space-y-3 border-t border-border/5 pt-6">
               <div className="flex items-center gap-3 group/item">
                  <div className="p-1.5 bg-muted/5 rounded-lg border border-border/5 group-hover/item:bg-primary/20 transition-colors">
                     <User size={12} className="text-muted-foreground group-hover/item:text-primary" />
                  </div>
                  <span className="text-xs font-black text-foreground uppercase tracking-widest italic">{alert.Driver_Name || t('common.no_data')}</span>
               </div>
               <div className="flex items-center gap-3 group/item">
                  <div className="p-1.5 bg-muted/5 rounded-lg border border-border/5 group-hover/item:bg-primary/20 transition-colors">
                     <Truck size={12} className="text-muted-foreground group-hover/item:text-primary" />
                  </div>
                  <span className="text-xs font-black text-foreground uppercase tracking-widest italic">{alert.Vehicle_Plate || t('common.no_data')}</span>
               </div>
               <div className="flex items-center gap-3 group/item">
                  <div className="p-1.5 bg-muted/5 rounded-lg border border-border/5 group-hover/item:bg-primary/20 transition-colors">
                     <MapPin size={12} className="text-muted-foreground group-hover/item:text-primary" />
                  </div>
                  <span className="text-[11px] font-black text-muted-foreground uppercase tracking-tight truncate max-w-[180px] italic">{alert.Route_Name || "N/A"}</span>
               </div>
            </div>

            {alert.Failed_Reason && (
               <div className="mt-6 p-4 bg-rose-500/5 border border-rose-500/10 rounded-xl relative overflow-hidden group/reason">
                  <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-1.5">{t('common.error')}</p>
                  <p className="text-xs font-black text-foreground uppercase leading-relaxed font-sans italic opacity-80">{alert.Failed_Reason}</p>
               </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-2">
               <PremiumButton variant="outline" className="h-10 rounded-xl border-border/10 hover:border-rose-500/50 text-muted-foreground text-[10px] font-black uppercase tracking-widest gap-2">
                  <Phone size={12} /> {t('navigation.chat')}
               </PremiumButton>
               <Link href={`/admin/jobs/${alert.Job_ID}`} className="block">
                  <PremiumButton className="h-10 rounded-xl w-full gap-2 shadow-lg text-[10px] font-black uppercase tracking-widest">
                     <Target className="w-3.5 h-3.5" /> {t('common.view_details')}
                  </PremiumButton>
               </Link>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function Target({ className }: { className?: string }) {
  return (
    <svg 
      className={className}
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

