"use client"

import { PremiumCard } from "@/components/ui/premium-card"
import { SafetyAnalytics } from "@/lib/supabase/safety-analytics"
import { ShieldAlert, FileCheck, AlertOctagon, CheckCircle, ShieldCheck, Activity } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"

export function SafetySection({ data }: { data: SafetyAnalytics }) {
  const { t } = useLanguage()
  const { sos, pod } = data

  return (
    <div className="space-y-6">
      {/* Sub-Section Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted rounded-xl text-destructive border border-border/80 shadow-sm">
            <ShieldAlert size={16} />
          </div>
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight">{t('dashboard.safety_intel_registry')}</h3>
        </div>

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total SOS */}
        <PremiumCard className="bg-card border border-border p-5 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="space-y-0.5">
                <span className="text-destructive text-[10px] font-bold uppercase tracking-wider">{t('dashboard.distress_events')}</span>
                <p className="text-xs text-muted-foreground font-medium">{t('dashboard.sos_trigger_log')}</p>
              </div>
              <div className="p-1.5 bg-destructive/10 rounded-lg text-destructive border border-destructive/20">
                <AlertOctagon size={14} />
              </div>
            </div>
            <div className="text-2xl font-black text-foreground relative z-10">{sos.total}</div>
            <div className="flex items-center gap-1.5 mt-3 relative z-10">
                <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                <p className="text-xs text-destructive font-bold">{sos.active} {t('dashboard.active_interventions_label')}</p>
            </div>
        </PremiumCard>

        {/* POD Compliance */}
        <PremiumCard className="bg-card border border-border p-5 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="space-y-0.5">
                <span className="text-success text-[10px] font-bold uppercase tracking-wider">{t('dashboard.pod_integrity')}</span>
                <p className="text-xs text-muted-foreground font-medium">{t('dashboard.strategic_compliance_index')}</p>
              </div>
              <div className="p-1.5 bg-success/15 rounded-lg text-success border border-success/20">
                <FileCheck size={14} />
              </div>
            </div>
            <div className="text-2xl font-black text-foreground relative z-10">{pod.complianceRate.toFixed(1)}%</div>
            <div className="flex items-center gap-2 mt-4 relative z-10">
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div className="bg-success h-full rounded-full" style={{ width: `${pod.complianceRate}%` }} />
                </div>
            </div>
        </PremiumCard>

        {/* Jobs Finished */}
        <PremiumCard className="bg-card border border-border p-5 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="space-y-0.5">
                <span className="text-primary text-[10px] font-bold uppercase tracking-wider">{t('dashboard.mission_resolution')}</span>
                <p className="text-xs text-muted-foreground font-medium">{t('dashboard.operational_closure_registry')}</p>
              </div>
              <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
                <CheckCircle size={14} />
              </div>
            </div>
            <div className="text-2xl font-black text-foreground relative z-10">{pod.totalCompleted}</div>
            <div className="flex items-center gap-2 mt-3 relative z-10 opacity-60">
                <p className="text-xs text-muted-foreground font-medium">{t('dashboard.success_index')}</p>
            </div>
        </PremiumCard>

        {/* Global Security Status */}
        <PremiumCard className="bg-success text-success-foreground border border-success p-5 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="space-y-0.5">
                <span className="text-success-foreground/80 text-[10px] font-bold uppercase tracking-wider">{t('dashboard.security_status_label')}</span>
                <p className="text-xs mt-0.5 font-medium">{t('dashboard.environmental_safety_thresh')}</p>
              </div>
              <div className="p-1.5 bg-card text-success border border-border rounded-lg">
                <ShieldCheck size={14} />
              </div>
            </div>
            <div className="text-2xl font-black relative z-10">{t('dashboard.nominal')}</div>
            <div className="flex items-center gap-1.5 mt-3 relative z-10">
                <p className="text-success-foreground font-bold text-xs flex items-center gap-1.5">
                    <Activity size={10} strokeWidth={3} /> {t('dashboard.biometric_sync_active')}
                </p>
            </div>
        </PremiumCard>
      </div>

      {/* Safety Intelligence Elite Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* SOS Breakdown Elite */}
        <PremiumCard className="bg-card border border-border p-0 overflow-hidden rounded-2xl shadow-sm">
           <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5 relative z-10">
                <div className="p-1.5 bg-destructive/10 rounded-lg text-destructive border border-destructive/20">
                  <AlertOctagon size={14} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground">{t('dashboard.incident_taxonomy')}</h3>
                  <p className="text-destructive text-[10px] font-bold uppercase tracking-wider">{t('dashboard.distress_category_distribution')}</p>
                </div>
              </div>
           </div>
           <div className="p-6 space-y-5">
              {sos.byReason.slice(0, 6).map((item, i) => (
                <div key={i} className="space-y-2 group/item">
                  <div className="flex justify-between items-end">
                     <span className="text-xs text-muted-foreground font-medium uppercase">{item.reason}</span>
                     <span className="text-xs font-bold text-foreground bg-muted px-2 py-0.5 rounded border border-border transition-colors group-hover/item:text-destructive">{item.count} {t('dashboard.events_label')}</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                     <div 
                        className="h-full bg-destructive rounded-full transition-all duration-700"
                        style={{ width: `${(item.count / Math.max(sos.total, 1)) * 100}%` }}
                     />
                  </div>
                </div>
              ))}
              {sos.byReason.length === 0 && (
                <div className="p-12 text-center">
                    <ShieldCheck size={36} strokeWidth={1.5} className="mx-auto mb-3 text-success opacity-60" />
                    <p className="text-xs font-bold text-muted-foreground uppercase">{t('dashboard.no_incident_data')}</p>
                </div>
              )}
           </div>
        </PremiumCard>

        {/* Recent Incidents Activity Log */}
        <PremiumCard className="bg-card border border-border p-0 overflow-hidden rounded-2xl shadow-sm">
           <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5 relative z-10">
                <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
                  <Activity size={14} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground">{t('dashboard.real_time_alert_log')}</h3>
                  <p className="text-primary text-[10px] font-bold uppercase tracking-wider">{t('dashboard.live_security_feed')}</p>
                </div>
              </div>
           </div>
           <div className="p-0">
              <div className="divide-y divide-border">
                {sos.recentAlerts.map((alert) => (
                    <div key={alert.id} className="p-4 flex items-center justify-between group/alert hover:bg-muted/20 transition-all border-l-4 border-transparent hover:border-primary">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center text-xs font-black text-foreground uppercase">
                                {(alert.vehicle || '').slice(0, 2)}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-foreground font-black text-sm uppercase">{alert.driver}</span>
                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border font-medium">{alert.vehicle}</span>
                                </div>
                                <div className="text-[10px] font-bold text-destructive mt-1.5 bg-destructive/10 px-2 py-0.5 rounded border border-destructive/20 w-fit uppercase">
                                   {t('dashboard.entry_label')} {alert.reason}
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-bold text-foreground">
                                {new Date(alert.time).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                            </div>
                            <div className="text-[10px] font-bold text-primary mt-1 bg-primary/10 px-2 py-0.5 rounded border border-primary/20 uppercase">
                                {new Date(alert.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                    </div>
                ))}
                {sos.recentAlerts.length === 0 && (
                     <div className="p-12 text-center">
                        <CheckCircle size={36} strokeWidth={1.5} className="mx-auto mb-3 text-success opacity-60" />
                        <p className="text-xs font-bold text-muted-foreground uppercase">{t('safety.perimeter_secure')}</p>
                    </div>
                )}
              </div>
           </div>
        </PremiumCard>
      </div>
    </div>
  )
}

