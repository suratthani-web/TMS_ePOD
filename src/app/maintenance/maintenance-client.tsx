"use client"

import { 
  Wrench, 
  Plus,
  AlertTriangle,
  Clock,
  Filter,
  CheckCircle2,
  Loader2,
  Activity,
  ArrowRight,
  ShieldAlert,
  Zap
} from "lucide-react"
import { MaintenanceDialog } from "@/components/maintenance/maintenance-dialog"
import { MaintenanceActions } from "@/components/maintenance/maintenance-actions"
import { MaintenanceScheduleDashboard } from "@/components/maintenance/maintenance-schedule-dashboard"
import { SearchInput } from "@/components/ui/search-input"
import { Pagination } from "@/components/ui/pagination"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { useLanguage } from "@/components/providers/language-provider"
import type { RepairTicket } from "@/lib/supabase/maintenance"
import type { Driver } from "@/lib/supabase/drivers"
import type { MaintenanceScheduleData } from "@/lib/supabase/maintenance-schedule"

interface MaintenanceClientProps {
  tickets: RepairTicket[]
  count: number
  stats: {
    total: number
    pending: number
    inProgress: number
    completed: number
  }
  drivers: Driver[]
  vehicles: { Vehicle_Plate?: string | null; Vehicle_Type?: string | null }[]
  schedule: MaintenanceScheduleData
  limit: number
  startDate: string
  endDate: string
  status: string
}

export function MaintenanceClient({ 
  tickets, 
  count, 
  stats, 
  drivers, 
  vehicles, 
  schedule, 
  limit,
  startDate,
  endDate,
  status
}: MaintenanceClientProps) {
  const { t } = useLanguage()
  const vehicleOptions = vehicles
    .filter((vehicle): vehicle is { Vehicle_Plate: string; Vehicle_Type?: string | null } => Boolean(vehicle.Vehicle_Plate))
    .map((vehicle) => ({
      Vehicle_Plate: vehicle.Vehicle_Plate,
      Vehicle_Type: vehicle.Vehicle_Type ?? null,
    }))

  return (
    <div className="space-y-10 pb-20">
      {/* Tactical Maintenance Header */}
      <div className="bg-background p-8 rounded-3xl border border-border shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          <div>
            <div className="flex items-center gap-4 mb-2">
               <div className="p-2 bg-amber-500/20 rounded-xl border-2 border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.2)] text-amber-500 group-hover:scale-110 transition-all duration-500">
                  <Wrench size={24} strokeWidth={2.5} />
               </div>
               <div>
                  <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-widest uppercase leading-none mb-1 italic">
                    {t('maintenance.title')}
                  </h1>
                  <p className="text-xs font-bold font-black text-amber-500 uppercase tracking-[0.6em] opacity-80 italic">{t('dashboard.subtitle')}</p>
               </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <MaintenanceDialog 
                drivers={drivers}
                vehicles={vehicleOptions}
                trigger={
                    <PremiumButton className="h-12 px-8 rounded-xl shadow-lg gap-2 bg-amber-600 hover:bg-amber-500 text-foreground font-black italic tracking-widest text-sm">
                        <Plus size={20} strokeWidth={3} />
                        {t('maintenance.issue_ticket')}
                    </PremiumButton>
                }
            />
          </div>
        </div>
      </div>

      {/* KPI Stats Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: t('maintenance.stats.total'), value: stats.total, icon: Wrench, color: "amber" },
          { label: t('maintenance.stats.pending'), value: stats.pending, icon: AlertTriangle, color: "rose" },
          { label: t('maintenance.stats.active'), value: stats.inProgress, icon: Clock, color: "blue" },
          { label: t('maintenance.stats.complete'), value: stats.completed, icon: CheckCircle2, color: "emerald" },
        ].map((stat, idx) => (
          <PremiumCard key={idx} className="bg-background border-2 border-border p-6 relative overflow-hidden group hover:border-border/20 transition-all">
            <div className="flex items-center justify-between mb-6">
                <div className={cn(
                    "p-3 rounded-xl shadow-lg transition-all duration-500 group-hover:scale-110 group-hover:rotate-3",
                    stat.color === 'amber' ? "bg-amber-500/20 text-amber-500 border border-amber-500/30 shadow-amber-500/10" :
                    stat.color === 'rose' ? "bg-rose-500/20 text-rose-500 border border-rose-500/30 shadow-rose-500/10" :
                    stat.color === 'blue' ? "bg-blue-500/20 text-blue-500 border border-blue-500/30 shadow-blue-500/10" : 
                    "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-emerald-500/10"
                )}>
                    <stat.icon size={20} />
                </div>
                <div className="flex items-center gap-2 px-2 py-0.5 bg-muted/50 rounded-full border border-border/10">
                    <Activity size={10} className="text-muted-foreground" />
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest italic">{t('maintenance.node_status')}</span>
                </div>
            </div>
            <div className="relative z-10">
                <p className="text-muted-foreground font-black text-[10px] font-bold uppercase tracking-[0.4em] mb-1">{stat.label}</p>
                <div className="flex items-end gap-2">
                   <p className="text-3xl font-black text-foreground italic tracking-tighter leading-none">{stat.value}</p>
                   <span className="text-[10px] font-bold font-black text-muted-foreground uppercase mb-0.5">{t('common.units')}</span>
                </div>
            </div>
          </PremiumCard>
        ))}
      </div>

      {/* Signal Filtering Matrix */}
      <div className="space-y-6 bg-background p-8 rounded-3xl border border-border shadow-xl">
        <div className="flex items-center gap-4 mb-1">
            <div className="p-2 bg-muted/50 rounded-xl text-muted-foreground">
                <Filter size={16} />
            </div>
            <h3 className="text-base font-black text-foreground uppercase tracking-[0.4em] italic leading-none">{t('maintenance.filter_hub')}</h3>
        </div>
        
        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1">
              <SearchInput 
                placeholder={t('common.search')} 
                className="h-12 bg-black/60 border-border rounded-xl text-foreground font-black text-sm"
              />
          </div>
          <form className="flex flex-wrap lg:flex-nowrap gap-3 items-center">
              <div className="flex items-center gap-3 bg-black/60 border border-border p-1.5 rounded-xl">
                <input 
                    type="date" 
                    name="startDate"
                    defaultValue={startDate}
                    className="h-10 bg-transparent border-none text-foreground focus:ring-0 uppercase font-black text-xs font-bold outline-none"
                />
                <ArrowRight size={14} className="text-muted-foreground" />
                <input 
                    type="date" 
                    name="endDate"
                    defaultValue={endDate}
                    className="h-10 bg-transparent border-none text-foreground focus:ring-0 uppercase font-black text-xs font-bold outline-none"
                />
              </div>
              <select 
                  name="status" 
                  defaultValue={status}
                  className="h-12 min-w-[150px] rounded-xl border border-border bg-black/60 px-4 text-xs font-bold font-black text-foreground uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xl outline-none"
              >
                  <option value="">{t('common.all')}</option>
                  <option value="Pending">{t('maintenance.stats.pending')}</option>
                  <option value="In Progress">{t('maintenance.stats.active')}</option>
                  <option value="Completed">{t('maintenance.stats.complete')}</option>
              </select>
              <PremiumButton type="submit" variant="secondary" className="h-12 px-6 rounded-xl border-border bg-muted/80 hover:bg-white/20 text-foreground font-black uppercase tracking-widest italic outline-none text-xs">
                  {t('maintenance.refresh')}
              </PremiumButton>
          </form>
        </div>
      </div>

      {/* Ticket Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tickets.length === 0 ? (
          <div className="col-span-full text-center py-24 bg-background/50 rounded-3xl border-2 border-dashed border-border">
             <ShieldAlert className="w-16 h-16 text-foreground/5 mx-auto mb-4 animate-pulse" />
             <p className="text-muted-foreground font-black uppercase tracking-[0.4em] text-sm font-bold">{t('common.no_data')}</p>
          </div>
        ) : tickets.map((ticket: RepairTicket) => {
          // Extract priority from Description if possible (e.g. "[Priority: High] ...")
          const priorityMatch = ticket.Description?.match(/\[Priority: (\w+)\]/)
          const effectivePriority = priorityMatch ? priorityMatch[1] : 'Medium'

          return (
            <PremiumCard key={ticket.Ticket_ID} className="bg-background p-0 overflow-hidden group border-2 border-border rounded-2xl shadow-xl relative hover:border-amber-500/30 transition-all duration-500">
              <div className="absolute top-4 right-4 z-20">
                  <MaintenanceActions 
                      ticket={{ ...ticket, Priority: effectivePriority } as RepairTicket} 
                      drivers={drivers} 
                      vehicles={vehicleOptions} 
                  />
              </div>
              
              <div className="p-6 space-y-6">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-110 group-hover:-rotate-3 transition-all duration-700 border-2",
                    effectivePriority === 'High' ? 'bg-rose-500/20 border-rose-500/30 text-rose-500 shadow-rose-500/10' : 'bg-muted/50 border-border/10 text-foreground'
                  )}>
                    {effectivePriority === 'High' ? <AlertTriangle size={24} className="animate-pulse" /> : <Wrench size={24} />}
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-foreground italic tracking-widest uppercase leading-none">{ticket.Driver_Name || "UNASSIGNED"}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[9px] font-black text-primary font-mono tracking-widest uppercase italic bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/10">{ticket.Vehicle_Plate || "VOID_PLATE"}</span>
                        <span className="text-[9px] font-black text-muted-foreground font-mono tracking-widest uppercase italic bg-muted/50 px-1.5 py-0.5 rounded-md border border-border">ID: {ticket.Ticket_ID}</span>
                        <span className="text-[9px] font-black text-amber-500/80 uppercase tracking-widest bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/10">{ticket.Issue_Type}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">{t('common.status')}</span>
                  </div>
                  <span className={cn(
                      "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all duration-500 shadow-lg",
                      ticket.Status === 'Completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-emerald-500/10' :
                      ticket.Status === 'In Progress' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 shadow-blue-500/10' :
                      ticket.Status === 'Rejected' ? 'bg-rose-500/20 text-rose-500 border-rose-500/30 shadow-rose-500/10' :
                      'bg-amber-500/20 text-amber-500 border-amber-500/30 shadow-amber-500/10'
                  )}>
                      {ticket.Status === 'Completed' ? t('maintenance.stats.complete') : 
                      ticket.Status === 'In Progress' ? t('maintenance.stats.active') :
                      ticket.Status === 'Pending' ? t('maintenance.stats.pending') : ticket.Status?.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-4">
                  {ticket.Photo_Url && (
                      <div className="relative w-full h-40 rounded-2xl overflow-hidden border-2 border-border/10 bg-muted/30 shadow-inner group-hover:border-primary/40 transition-all duration-700">
                          <Image 
                              src={(() => {
                                  try {
                                      if (ticket.Photo_Url.startsWith('[') && ticket.Photo_Url.endsWith(']')) {
                                          const parsed = JSON.parse(ticket.Photo_Url)
                                          return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : ticket.Photo_Url
                                      }
                                      return ticket.Photo_Url
                                  } catch {
                                      return ticket.Photo_Url
                                  }
                              })()}
                              alt="Issue Photo" 
                              fill 
                              className="object-cover transform group-hover:scale-110 transition-transform duration-1000"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                  )}
                  <div className="relative">
                      <p className="text-sm text-muted-foreground font-black italic uppercase leading-relaxed bg-muted/50 p-4 rounded-xl border-2 border-border relative overflow-hidden group-hover:bg-muted/80 transition-all duration-500 min-h-[80px]">
                          <span className="absolute -top-2 -left-1 text-4xl text-foreground/5 font-black leading-none select-none tracking-tighter italic">ISSUE</span>
                          <span className="relative z-10">{ticket.Description || t('common.no_data')}</span>
                      </p>
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold pt-4 border-t border-border">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-muted/50 rounded-lg border border-border/10">
                          <Clock size={12} className="text-muted-foreground" />
                        </div>
                        <span className="font-black uppercase tracking-[0.2em] text-[10px] text-muted-foreground">
                          {ticket.Date_Report ? new Date(ticket.Date_Report).toLocaleDateString(t('common.loading') === 'กำลังประมวลผล...' ? 'th-TH' : 'en-US') : "VOID_DATE"}
                        </span>
                      </div>
                      {Number(ticket.Cost_Total) > 0 ? (
                          <div className="bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20 shadow-lg group-hover:scale-110 transition-transform">
                              <span className="text-emerald-400 font-black text-sm tracking-tighter italic leading-none">฿{Number(ticket.Cost_Total).toLocaleString()}</span>
                          </div>
                      ) : (
                          <div className="flex items-center gap-2 font-black text-muted-foreground uppercase tracking-[0.4em] text-[9px] italic">
                            {t('maintenance.cost_tbd')}
                          </div>
                      )}
                  </div>
                </div>
              </div>
            </PremiumCard>
          )
        })}
      </div>
      
      <div className="flex justify-center pt-6">
         <Pagination totalItems={count || 0} limit={limit} />
      </div>

      {/* Technical Workflow Dashboard */}
      <section className="mt-8 space-y-6">
         <div className="flex items-center gap-4 group/h">
            <div className="p-3 bg-primary/20 rounded-xl text-primary border-2 border-primary/30 shadow-[0_0_20px_rgba(255,30,133,0.2)] group-hover/h:scale-110 transition-transform">
                <Zap size={20} strokeWidth={2.5} />
            </div>
            <div>
                <h2 className="text-xl font-black text-foreground tracking-[0.2em] uppercase italic">{t('maintenance.workflow_pulse')}</h2>
                <p className="text-xs font-bold font-black text-primary uppercase tracking-[0.6em] opacity-60">{t('maintenance.workflow_matrix')}</p>
            </div>
         </div>
         <MaintenanceScheduleDashboard schedule={schedule} />
      </section>

      {/* Tactical Footer */}
      <div className="p-10 bg-background rounded-3xl border-2 border-border flex flex-col items-center text-center space-y-4 mt-16 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />
          <div className="p-3 bg-amber-500/20 rounded-2xl shadow-[0_0_20px_rgba(245,158,11,0.2)] border-2 border-amber-500/30 group-hover:scale-110 transition-all duration-700">
              <Wrench size={24} className="text-amber-500" />
          </div>
          <div className="space-y-2">
              <h4 className="text-base font-black text-foreground uppercase tracking-[0.4em] italic">{t('maintenance.readiness_engine')}</h4>
              <p className="text-xs font-bold text-muted-foreground font-black uppercase tracking-[0.2em] max-w-2xl leading-relaxed">
                  {t('maintenance.integrity_desc')} <br />
                  {t('maintenance.capability_verified')}
              </p>
          </div>
          <div className="px-4 py-1 bg-muted/50 rounded-full border border-border/10 flex items-center gap-2">
             <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{t('maintenance.integrity_index')}: 0.988</span>
          </div>
      </div>
    </div>
  )
}
