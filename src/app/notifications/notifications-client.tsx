"use client"

import { useState, useEffect } from "react"
import { Bell, AlertTriangle, ShieldAlert, Wrench, FileWarning, Truck, ArrowLeft, Activity, Target, Zap, Monitor, CheckCircle2, Info, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { PremiumCard } from "@/components/ui/premium-card"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { useLanguage } from "@/components/providers/language-provider"
import { PremiumButton } from "@/components/ui/premium-button"
import { toast } from "sonner"
import { AdminAlert } from "@/lib/supabase/admin-notifications"

const SEVERITY_STYLES = {
  critical: {
    bg: "bg-rose-500/10 border-rose-500/30",
    text: "text-rose-500",
    glow: "shadow-[0_0_20px_rgba(244,63,94,0.2)]",
    dot: "bg-rose-500 animate-pulse",
    labelKey: "compliance.expired"
  },
  warning: {
    bg: "bg-amber-500/10 border-amber-500/30",
    text: "text-amber-500",
    glow: "shadow-[0_0_20px_rgba(245,158,11,0.2)]",
    dot: "bg-amber-500 animate-pulse",
    labelKey: "compliance.near_expiry"
  },
  info: {
    bg: "bg-blue-500/10 border-blue-500/30",
    text: "text-blue-500",
    glow: "shadow-[0_0_20px_rgba(59,130,246,0.2)]",
    dot: "bg-blue-500",
    labelKey: "compliance.standard"
  },
}

const TYPE_ICONS = {
  expiry: FileWarning,
  inspection_fail: ShieldAlert,
  maintenance: Wrench,
}

const TYPE_LABELS = {
  expiry: "compliance.expiry_decay",
  inspection_fail: "compliance.audit_failure",
  maintenance: "compliance.lifecycle_service",
}

export function NotificationsClient({ alerts = [] }: { alerts: AdminAlert[] }) {
  const [pushStatus, setPushStatus] = useState<string>('default')
  const [isRegistering, setIsRegistering] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushStatus(Notification.permission)
    }

    if (process.env.NODE_ENV === 'development' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister()
        }
      })
    }
  }, [])

  const handleEnablePush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    
    setIsRegistering(true)
    try {
      const permission = await Notification.requestPermission()
      setPushStatus(permission)
      
      if (permission === 'granted' && process.env.NODE_ENV !== 'development') {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        await navigator.serviceWorker.ready
        window.location.reload()
      } else if (permission === 'granted' && process.env.NODE_ENV === 'development') {
         toast.info("Push notifications are disabled in development mode.")
      }
    } finally {
      setIsRegistering(false)
    }
  }

  const criticalCount = alerts?.filter((a: AdminAlert) => a.severity === 'critical').length || 0
  const warningCount = alerts?.filter((a: AdminAlert) => a.severity === 'warning').length || 0
  const infoCount = alerts?.filter((a: AdminAlert) => a.severity === 'info').length || 0

  const grouped: Record<string, AdminAlert[]> = {}
  alerts?.forEach((a: AdminAlert) => {
    if (!grouped[a.type]) grouped[a.type] = []
    grouped[a.type].push(a)
  })

  return (
    <div className="space-y-8 pb-20 p-6 max-w-7xl mx-auto">
      {/* Tactical Alert Header */}
      <div className="bg-card p-10 rounded-3xl border border-border/50 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          <div>
            <Link href="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-all mb-6 text-xs font-bold uppercase tracking-widest group/back">
                <ArrowLeft size={14} className="group-hover/back:-translate-x-1 transition-transform" />
                {t('common.back')}
            </Link>
            <div className="flex items-center gap-5">
               <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary shadow-sm">
                  <ShieldCheck size={32} />
               </div>
               <div>
                  <h1 className="text-3xl font-black text-foreground tracking-tight uppercase leading-none mb-1">{t('compliance.title')}</h1>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-70">{t('compliance.subtitle')}</p>
               </div>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-muted/50 p-4 rounded-2xl border border-border backdrop-blur-sm">
             <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-none mb-1">{t('compliance.status')}</span>
                <span className="text-sm font-black text-foreground uppercase tracking-widest">{criticalCount > 0 ? t('common.error') : t('dashboard.system_integrity')}</span>
             </div>
             <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center text-foreground shadow-sm border",
                criticalCount > 0 ? "bg-rose-500 border-rose-400 text-white animate-pulse" : "bg-emerald-500 border-emerald-400 text-white"
             )}>
                <Activity size={18} />
             </div>
          </div>
        </div>
      </div>

      {/* Summary Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { label: t('compliance.expired'), count: criticalCount, icon: AlertTriangle, color: "rose" },
          { label: t('compliance.near_expiry'), count: warningCount, icon: Zap, color: "amber" },
          { label: t('compliance.standard'), count: infoCount, icon: Info, color: "blue" },
        ].map((stat, idx) => (
          <PremiumCard key={idx} className="p-6 group/stat border-border/50">
            <div className="flex items-center justify-between gap-4">
              <div className={cn(
                "p-3 rounded-xl flex items-center justify-center transition-all duration-300",
                stat.color === 'rose' ? "bg-rose-500/10 text-rose-500 group-hover/stat:bg-rose-500 group-hover/stat:text-white" :
                stat.color === 'amber' ? "bg-amber-500/10 text-amber-500 group-hover/stat:bg-amber-500 group-hover/stat:text-white" :
                "bg-blue-500/10 text-blue-500 group-hover/stat:bg-blue-500 group-hover/stat:text-white"
              )}>
                <stat.icon size={24} />
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{stat.label}</p>
                <p className="text-3xl font-black text-foreground leading-none">{stat.count}</p>
              </div>
            </div>
          </PremiumCard>
        ))}
      </div>

      {/* Desktop Alerts Setup */}
      <PremiumCard className="p-8 border-primary/20 bg-primary/[0.02] overflow-hidden relative group/alerts">
         <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] rounded-full -mr-32 -mt-32 pointer-events-none" />
         
         <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 relative z-10">
            <div className="flex gap-5 max-w-2xl">
               <div className="p-4 bg-background rounded-2xl border border-border text-primary shadow-sm h-fit mt-1">
                  <Monitor size={32} />
               </div>
               <div>
                  <h3 className="text-xl font-black text-foreground uppercase tracking-tight mb-2">{t('compliance.desktop_alerts')}</h3>
                  <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                    {t('compliance.desktop_desc')}
                  </p>
                  
                  <div className="mt-4 flex flex-wrap gap-4">
                     <div className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-bold text-muted-foreground">
                        <Info size={12} /> 
                        {t('compliance.focus_assist_hint')}
                     </div>
                  </div>
               </div>
            </div>

            <div className="flex flex-col items-center gap-4 min-w-[240px]">
               {pushStatus === 'granted' ? (
                  <div className="flex flex-col items-center gap-2">
                     <div className="flex items-center gap-2 text-emerald-500 font-black uppercase tracking-widest text-sm">
                        <CheckCircle2 size={16} />
                        {t('compliance.connected')}
                     </div>
                     <p className="text-[10px] text-muted-foreground font-bold">{t('compliance.background_work')}</p>
                  </div>
               ) : (
                  <PremiumButton 
                     onClick={handleEnablePush}
                     loading={isRegistering}
                     variant="primary" 
                     className="w-full h-14 rounded-xl font-black text-xs uppercase tracking-widest shadow-md"
                  >
                     <Bell className="mr-2" size={16} />
                     {t('compliance.enable_push')}
                  </PremiumButton>
               )}
            </div>
         </div>
      </PremiumCard>

      {/* Categories Matrix */}
      <div className="space-y-12">
        {Object.entries(grouped).length === 0 ? (
          <PremiumCard className="bg-muted/30 p-20 text-center border-dashed border-2 rounded-[3rem]">
              <div className="relative inline-block mb-6 opacity-20">
                <ShieldCheck size={64} className="text-primary" />
              </div>
              <h3 className="text-xl font-black text-foreground tracking-widest uppercase mb-2">{t('dashboard.system_integrity')}</h3>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-[0.4em]">{t('common.no_data')}</p>
          </PremiumCard>
        ) : (
          Object.entries(grouped).map(([type, typeAlerts]) => {
            const TypeIcon = TYPE_ICONS[type as keyof typeof TYPE_ICONS] || Bell
            return (
              <motion.div 
                key={type} 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="bg-card rounded-[2.5rem] border border-border overflow-hidden shadow-sm group/group"
              >
                <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/30 to-transparent" />
                  <div className="flex items-center gap-4 relative z-10">
                    <div className="p-2.5 bg-background rounded-xl text-primary border border-border group-hover/group:bg-primary group-hover/group:text-white transition-all duration-300 shadow-sm">
                       <TypeIcon size={18} />
                    </div>
                    <div>
                       <h2 className="text-lg font-black text-foreground tracking-tight uppercase leading-none mb-1">{t(TYPE_LABELS[type as keyof typeof TYPE_LABELS] || type)}</h2>
                       <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">DOMAIN: {type.toUpperCase()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 py-1.5 px-4 bg-background rounded-full border border-border shadow-sm">
                      <Target size={12} className="text-primary" />
                      <span className="text-[10px] font-black text-foreground uppercase tracking-widest">{typeAlerts.length} {t('common.units')}</span>
                  </div>
                </div>
                
                <div className="divide-y divide-border/50">
                  {typeAlerts.map(alert => {
                    const style = SEVERITY_STYLES[alert.severity as keyof typeof SEVERITY_STYLES] || SEVERITY_STYLES.info
                    return (
                      <div key={alert.id} className={cn(
                         "p-6 flex items-start gap-8 hover:bg-muted/20 transition-all group/item border-l-4 border-transparent",
                         alert.severity === 'critical' ? 'hover:border-rose-500' : 'hover:border-primary'
                      )}>
                        <div className={cn("w-2 h-2 rounded-full mt-2.5 flex-shrink-0", style.dot)} />
                        
                        <div className="flex-1 space-y-2">
                           <div className="flex flex-wrap items-center gap-3">
                            <span className="text-base font-black text-foreground tracking-tight uppercase group-hover/item:text-primary transition-colors">{alert.title}</span>
                            <div className={cn("px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border", style.bg, style.text)}>
                              {t(style.labelKey)}
                            </div>
                          </div>
                          
                          <p className="text-sm font-bold text-muted-foreground leading-relaxed uppercase tracking-tight">{alert.description}</p>
                          
                          {alert.meta?.plate && (
                            <div className="flex items-center gap-2 pt-1">
                               <div className="p-1.5 bg-muted rounded-lg border border-border text-muted-foreground">
                                  <Truck size={12} />
                               </div>
                               <span className="text-[10px] font-black text-foreground uppercase tracking-widest bg-muted px-2.5 py-1 rounded-lg border border-border">{t('vehicles.plate')}: {alert.meta.plate}</span>
                            </div>
                          )}
                        </div>

                        <div className="hidden lg:block">
                           <Link href={alert.href || '#'}>
                              <PremiumButton variant="secondary" className="bg-muted border-border hover:bg-muted/80 text-foreground font-black uppercase tracking-widest text-[10px] h-10 px-6 rounded-xl">
                                  {t('common.view_details')}
                              </PremiumButton>
                           </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      {/* Tactical Hub Utility */}
      <div className="p-8 bg-card rounded-[3rem] border border-border flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
          <div className="flex items-center gap-6 relative z-10">
              <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 group-hover:rotate-6 transition-all duration-500 shadow-sm text-primary">
                  <Activity size={24} />
              </div>
              <div className="text-center md:text-left">
                  <h4 className="text-xl font-black text-foreground uppercase tracking-tight mb-0.5">{t('compliance.title')}</h4>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {t('compliance.subtitle')}
                  </p>
              </div>
          </div>
          <PremiumButton className="h-12 px-10 rounded-xl bg-muted hover:bg-muted/80 text-foreground border-border font-black uppercase tracking-widest text-[10px] group-hover:scale-105 transition-transform">
             {t('common.sync')}
          </PremiumButton>
      </div>
    </div>
  )
}
