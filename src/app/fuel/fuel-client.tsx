"use client"

import { 
  Fuel, 
  Plus,
  TrendingUp,
  Droplets,
  DollarSign,
  Hash,
  Activity,
  Zap,
  Target,
  ArrowRight
} from "lucide-react"
import { FuelDialog } from "@/components/fuel/fuel-dialog"
import { FuelActions } from "@/components/fuel/fuel-actions"
import { FuelAnalyticsDashboard } from "@/components/fuel/fuel-analytics-dashboard"
import { SearchInput } from "@/components/ui/search-input"
import { Pagination } from "@/components/ui/pagination"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"
import NextImage from "next/image"
import type { FuelLog } from "@/lib/supabase/fuel"
import type { FuelAnalytics } from "@/lib/supabase/fuel-analytics"
import type { Driver } from "@/lib/supabase/drivers"

type FuelClientProps = {
  logs: (FuelLog & { Km_Per_Liter?: number })[]
  count: number
  drivers: Driver[]
  vehicles: { Vehicle_Plate?: string | null; Vehicle_Type?: string | null }[]
  analytics: FuelAnalytics
  limit: number
  startDate?: string
  endDate?: string
}

export function FuelClient({ 
  logs, 
  count, 
  drivers, 
  vehicles, 
  analytics, 
  limit,
  startDate,
  endDate
}: FuelClientProps) {
  const { t } = useLanguage()
  const vehicleOptions = vehicles
    .filter((vehicle): vehicle is { Vehicle_Plate: string; Vehicle_Type?: string | null } => Boolean(vehicle.Vehicle_Plate))
    .map((vehicle) => ({
      Vehicle_Plate: vehicle.Vehicle_Plate,
      Vehicle_Type: vehicle.Vehicle_Type ?? null,
    }))

  return (
    <div className="space-y-8 pb-20">
      {/* Tactical Energy Header */}
      <div className="bg-background p-8 rounded-3xl border border-border shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          <div>
            <div className="flex items-center gap-4 mb-2">
               <div className="p-2 bg-primary/20 rounded-xl border-2 border-primary/30 shadow-[0_0_20px_rgba(255,30,133,0.2)] text-primary group-hover:scale-110 transition-all duration-500">
                  <Fuel size={24} strokeWidth={2.5} />
               </div>
               <div>
                  <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-widest uppercase leading-none mb-1 italic premium-text-gradient">
                    {t('navigation.fuel')}
                  </h1>
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.6em] opacity-80 italic italic">{t('dashboard.subtitle')}</p>
               </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <FuelDialog 
                drivers={drivers}
                vehicles={vehicleOptions}
                trigger={
                    <PremiumButton className="h-11 px-8 rounded-xl shadow-lg gap-2 bg-primary hover:bg-primary/90 text-foreground font-black text-xs uppercase tracking-widest italic">
                        <Plus size={18} strokeWidth={3} />
                        {t('request_mission')}
                    </PremiumButton>
                }
            />
          </div>
        </div>
      </div>

      {/* Analytics Dashboard Node */}
      <section className="space-y-6">
         <div className="flex items-center gap-4 mb-2 group/h">
            <div className="p-2.5 bg-primary/20 rounded-xl text-primary border-2 border-primary/30 shadow-[0_0_20px_rgba(255,30,133,0.2)] group-hover/h:scale-110 transition-transform">
                <TrendingUp size={20} strokeWidth={2.5} />
            </div>
            <div>
                <h2 className="text-xl font-black text-foreground tracking-[0.2em] uppercase italic">{t('navigation.analytics')}</h2>
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.6em] opacity-60">{t('dashboard.subtitle')}</p>
            </div>
         </div>
         <FuelAnalyticsDashboard analytics={analytics} />
      </section>

      {/* Signal Filtering Matrix */}
      <div className="space-y-6 bg-background p-8 rounded-3xl border border-border shadow-xl">
        <div className="flex items-center gap-4 mb-1">
            <div className="p-2 bg-blue-500/20 rounded-xl text-blue-500 border border-blue-500/30">
                <Activity size={16} />
            </div>
            <h3 className="text-base font-black text-foreground uppercase tracking-[0.4em] italic">{t('common.search')}</h3>
        </div>
        
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
              <SearchInput 
                placeholder={t('common.search')}
                className="h-12 bg-black/60 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:border-primary/50 transition-all font-black text-sm"
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
              <PremiumButton type="submit" variant="secondary" className="h-12 px-6 rounded-xl border-border bg-muted/80 hover:bg-white/20 text-foreground font-black uppercase tracking-widest italic outline-none text-xs">
                  {t('common.filter')}
              </PremiumButton>
          </form>
        </div>
      </div>

      {/* Fuel Log Ledger */}
      <PremiumCard className="bg-background border-2 border-border p-0 overflow-hidden shadow-xl rounded-2xl">
          <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-transparent" />
            <div className="flex items-center gap-4 relative z-10">
                <div className="p-3 bg-primary/20 rounded-xl text-primary border border-primary/30">
                    <Hash size={18} />
                </div>
                <div>
                    <h2 className="text-xl font-black text-foreground tracking-widest uppercase italic leading-none mb-1">{t('navigation.history')}</h2>
                    <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] opacity-60">{t('dashboard.subtitle')}</p>
                </div>
            </div>
            <div className="hidden lg:flex items-center gap-2 py-1 px-4 bg-muted/50 rounded-full border border-border/10">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">ACTIVE_LOGS</span>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            {logs.length === 0 ? (
                <div className="p-24 text-center space-y-4">
                    <Droplets className="w-16 h-16 text-foreground/5 mx-auto animate-pulse" />
                    <p className="text-muted-foreground font-black uppercase tracking-[0.4em] text-sm font-bold">{t('common.no_data')}</p>
                </div>
            ) : (
                <table className="w-full border-collapse">
                  <thead className="text-[10px] font-black uppercase bg-black/60 text-muted-foreground border-b border-border tracking-[0.3em] italic">
                    <tr>
                      <th className="text-left px-6 py-4">{t('common.date')}</th>
                      <th className="text-left px-4 py-4">{t('navigation.drivers')}</th>
                      <th className="text-left px-4 py-4">{t('common.status')}</th>
                      <th className="text-center px-4 py-4">{t('common.loading')}</th>
                      <th className="text-right px-4 py-4">{t('common.units')} (L)</th>
                      <th className="text-right px-4 py-4">฿ / L</th>
                      <th className="text-right px-4 py-4">{t('finance.total_amount')}</th>
                      <th className="text-right px-4 py-4">{t('vehicles.odometer')}</th>
                      <th className="text-right px-4 py-4">KM/L</th>
                      <th className="px-6 py-4 w-12">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {logs.map((log) => (
                  <tr 
                    key={log.Log_ID} 
                    className="hover:bg-muted/40 transition-all group/row"
                  >
                    <td className="px-6 py-3">
                      <span className="text-foreground font-black text-sm tracking-tighter uppercase italic opacity-90">
                        {log.Date_Time ? new Date(log.Date_Time).toLocaleString('th-TH', { 
                          timeZone: 'Asia/Bangkok',
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : "VOID"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-foreground font-bold text-xs uppercase italic">{log.Driver_Name || "UNASSIGNED"}</span>
                        <span className="text-[9px] text-muted-foreground font-black tracking-widest">{log.Vehicle_Plate || "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                          <span className="text-foreground font-black text-[10px] uppercase">{log.Station_Name || "DEFAULT_HUB"}</span>
                               <span className={cn(
                                 "text-[8px] px-2 py-0.5 rounded-full w-fit font-black uppercase tracking-widest",
                                 log.Status === 'Approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' :
                                 log.Status === 'Rejected' ? 'bg-rose-500/20 text-rose-500 border border-rose-500/20' :
                                 'bg-muted/50 text-muted-foreground border border-border/10'
                              )}>
                                  {log.Status === 'Approved' ? t('fuel.status.synchronized') : 
                                   log.Status === 'Rejected' ? t('fuel.status.denied') : t('common.loading')}
                              </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {log.Photo_Url ? (
                          <div className="relative w-8 h-8 mx-auto rounded-lg overflow-hidden border border-border/10 bg-card group cursor-pointer shadow-lg hover:border-primary/50 transition-all">
                              <NextImage 
                                  src={log.Photo_Url} 
                                  alt="Receipt" 
                                  fill 
                                  className="object-cover group-hover:scale-110 transition-transform duration-500" 
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <a href={log.Photo_Url} target="_blank" rel="noreferrer">
                                      <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center backdrop-blur-md border border-primary/30">
                                          <span className="text-[10px] font-bold text-primary">👁️</span>
                                      </div>
                                  </a>
                              </div>
                          </div>
                      ) : (
                          <span className="text-muted-foreground text-[10px] font-black">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                       <div className="flex flex-col items-end gap-0.5">
                           <span className={cn(
                             "text-xs font-black italic tracking-tighter",
                             log.Capacity_Status === 'Overflow' ? 'text-rose-500' : 'text-foreground'
                           )}>
                               {log.Liters?.toFixed(2)}
                           </span>
                           {log.Capacity_Status === 'Overflow' && (
                               <span className="text-[8px] font-black text-foreground bg-rose-600 px-1 rounded-sm uppercase tracking-widest animate-pulse">
                                   {t('fuel.alerts.overflow')}
                               </span>
                           )}
                       </div>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground font-black text-[10px] tracking-tighter italic">
                        ฿{(log.Price_Total && log.Liters) ? (log.Price_Total / log.Liters).toFixed(2) : "0.00"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-black text-foreground italic tracking-tighter bg-primary/10 px-3 py-1 rounded-lg border border-primary/20 group-hover/row:scale-105 transition-transform block w-fit ml-auto shadow-md">
                        ฿{log.Price_Total?.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-foreground font-black italic text-[10px] tracking-tighter opacity-80">{log.Odometer?.toLocaleString() || "VOID"}</td>
                    <td className="px-4 py-3 text-right">
                       {log.Km_Per_Liter && log.Km_Per_Liter > 0 ? (
                           <div className="flex flex-col items-end gap-0.5">
                               <div className={cn(
                                   "flex items-center justify-end gap-1.5",
                                   log.Efficiency_Status === 'Normal' ? 'text-emerald-400' : 
                                   log.Efficiency_Status === 'Warning' ? 'text-amber-400' : 'text-rose-500'
                               )}>
                                   <span className="font-black text-sm italic">{log.Km_Per_Liter.toFixed(1)}</span>
                                   <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Km/L</span>
                               </div>
                               {log.Efficiency_Status !== 'Normal' && (
                                   <span className={cn(
                                       "text-[8px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-widest",
                                       log.Efficiency_Status === 'Warning' ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20' : 'text-rose-500 bg-rose-500/10 border border-rose-500/20'
                                   )}>
                                       {log.Efficiency_Status === 'Warning' ? t('fuel.alerts.low_output') : t('fuel.alerts.critical_drift')}
                                   </span>
                               )}
                           </div>
                       ) : (
                           <span className="text-muted-foreground font-black text-[10px]">NO_METRIC</span>
                       )}
                    </td>
                    <td className="px-6 py-3">
                      <FuelActions 
                          log={log} 
                          drivers={drivers}
                          vehicles={vehicleOptions}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>

          <div className="p-6 border-t border-border bg-muted/30 flex justify-center">
             <Pagination totalItems={count || 0} limit={limit} />
          </div>
      </PremiumCard>
    </div>
  )
}

