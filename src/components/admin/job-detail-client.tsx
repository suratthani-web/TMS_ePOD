"use client"

import Link from "next/link"
import { CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  ArrowLeft, Calendar, Truck, User, Phone, Package, FileText, Navigation, 
  Activity, Target, Cpu, Layers, TrendingUp, AlertTriangle, ShieldCheck, Info, DollarSign, Eye
} from "lucide-react"
import JobMapClient from "@/components/maps/job-map-client"
import { AdminJobActions } from "@/components/admin/admin-job-actions"
import { LineShareButton } from "@/components/admin/line-share-button"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"
import { PODDownloadButton } from "@/components/tracking/pod-download"
import { useSearchParams } from "next/navigation"

interface JobDetailClientProps {
  job: any
  routeHistory: [number, number][]
}

export function JobDetailClient({ job, routeHistory }: JobDetailClientProps) {
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const from = searchParams.get('from')

  const backHref = from?.toLowerCase() === 'pod' ? '/pod' : '/jobs/history'
  const backLabel = from?.toLowerCase() === 'pod' ? t('navigation.pod') : t('job_detail.history_link')

  // Smart calculations
  const priceCust = Number(job.Price_Cust_Total || 0)
  const costDriver = Number(job.Cost_Driver_Total || 0)
  const netMargin = priceCust - costDriver

  const priceCustBase = Number(job.Price_Cust_Base || 0)
  const costDriverBase = Number(job.Cost_Driver_Base || 0)

  let extraCostsList: any[] = []
  if (job.extra_costs_json) {
    try {
      const parsed = typeof job.extra_costs_json === 'string'
        ? JSON.parse(job.extra_costs_json)
        : job.extra_costs_json
      if (Array.isArray(parsed)) {
        extraCostsList = parsed
      }
    } catch {}
  }

  return (
    <div className="space-y-10 pb-32 max-w-7xl mx-auto p-4 lg:p-10 bg-background text-foreground">
      
      {/* 1. Tactical Glassmorphic Header */}
      <div className="bg-slate-950/40 backdrop-blur-3xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-primary via-indigo-500 to-emerald-500" />
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
        
        {/* Top Control Bar */}
        <div className="flex justify-between items-center gap-4 mb-6 relative z-10 pb-4 border-b border-white/5">
          <Link href={backHref} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.3em] text-xs group/back italic">
            <ArrowLeft className="w-3.5 h-3.5 group-hover/back:-translate-x-1 transition-transform" /> 
            {backLabel}
          </Link>
          <div className="flex items-center gap-3 shrink-0">
            <LineShareButton job={job} />
            <AdminJobActions jobId={job.Job_ID} currentStatus={job.Job_Status || 'New'} />
          </div>
        </div>

        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-5">
            <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.1)] text-emerald-400 shrink-0">
              <Package size={28} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex flex-wrap items-center gap-3.5 mb-1.5">
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-black tracking-wider uppercase leading-tight italic premium-text-gradient break-all">Mission #{job.Job_ID}</h1>
                  <StatusBadge status={job.Job_Status || ''} />
              </div>
              <p className="text-xs font-black text-emerald-500 uppercase tracking-[0.5em] opacity-80 italic">{t('job_detail.operational_lifecycle')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Horizontal Live Stats Telemetry Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <StatRibbonCard 
          icon={<Calendar className="text-primary" size={18} />} 
          label={t('job_detail.temporal_stamping')}
          value={job.Plan_Date ? new Date(job.Plan_Date).toLocaleDateString("th-TH") : t('job_detail.not_specified')} 
          subtitle="PLAN CYCLE"
        />
        <StatRibbonCard 
          icon={<Navigation className="text-indigo-400 animate-pulse" size={18} />} 
          label={t('job_detail.transit_vector')}
          value={job.Route_Name || '---'} 
          subtitle="ROUTE MATRIX"
        />
        <StatRibbonCard 
          icon={<Cpu className="text-emerald-400" size={18} />} 
          label={t('job_detail.entity_yield')}
          value={`฿${priceCust.toLocaleString()}`} 
          subtitle={t('job_detail.gross_flow')}
          glowColor="emerald"
        />
        <StatRibbonCard 
          icon={<DollarSign className="text-amber-400" size={18} />} 
          label="กำไรสุทธิ (Net Margin)"
          value={`฿${netMargin.toLocaleString()}`} 
          subtitle="PROFIT VALUE"
          glowColor="amber"
        />
      </div>

      {/* 3. Profiles & Ledger Dashboard (Side-by-Side) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Card: Customer & Route Profile */}
        <PremiumCard className="lg:col-span-2 bg-slate-950/20 border border-white/5 shadow-2xl rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-black/40 flex items-center justify-between">
            <h3 className="text-sm font-black text-foreground uppercase tracking-[0.3em] flex items-center gap-2.5 italic">
              <User size={16} className="text-primary" /> {t('job_detail.target_entity_vector')}
            </h3>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 rounded-full border border-primary/20 text-[10px] font-black text-primary uppercase tracking-widest italic animate-pulse">
              {t('job_detail.sync_live')}
            </div>
          </div>
          <CardContent className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 p-5 bg-white/5 rounded-2xl border border-white/5 relative overflow-hidden group/entity">
                  <div className="absolute top-0 right-0 p-3 opacity-5"><User size={32} /></div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.25em] italic block">{t('job_detail.target_entity')}</label>
                  <p className="text-lg font-black text-foreground tracking-widest uppercase italic border-l-3 border-primary pl-4 py-1">{job.Customer_Name}</p>
              </div>
              <div className="space-y-2 p-5 bg-white/5 rounded-2xl border border-white/5 relative overflow-hidden group/vector">
                  <div className="absolute top-0 right-0 p-3 opacity-5"><Navigation size={32} /></div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.25em] italic block">{t('job_detail.transit_vector')}</label>
                  <p className="text-lg font-black text-foreground tracking-widest uppercase italic border-l-3 border-emerald-500 pl-4 py-1">{job.Route_Name}</p>
              </div>
            </div>

            <div className="space-y-5">
               <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] italic block">ROUTE PATHWAY TIMELINE</label>
               <div className="relative pl-6 space-y-6">
                 <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-gradient-to-b from-primary via-slate-800 to-emerald-500" />
                 
                 <div className="flex gap-4 items-start relative z-10">
                    <div className="w-3.5 h-3.5 rounded-full bg-primary shadow-[0_0_8px_rgba(255,30,133,1)] mt-1 shrink-0" />
                    <div>
                        <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest italic">{t('job_detail.origin_node')}</label>
                        <p className="text-base font-black text-muted-foreground uppercase tracking-wider font-sans">{job.Origin_Location || t('job_detail.unexpected_null')}</p>
                    </div>
                 </div>
                 
                 <div className="flex gap-4 items-start relative z-10">
                    <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,1)] mt-1 shrink-0" />
                    <div>
                        <label className="text-[9px] font-black text-muted-foreground uppercase tracking-widest italic">{t('job_detail.termination_node')}</label>
                        <p className="text-base font-black text-foreground uppercase tracking-wider italic font-sans">{job.Dest_Location || t('job_detail.unexpected_null')}</p>
                    </div>
                 </div>
               </div>
            </div>

            {/* Tactical Notes / Operational Log */}
            {job.Notes && (
              <div className="space-y-2 pt-4 border-t border-white/5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] italic block">{t('job_detail.tactical_intel')}</label>
                <div className="relative p-5 bg-slate-950/80 rounded-2xl border border-primary/20 hover:border-primary/40 transition-colors shadow-inner flex items-start gap-4">
                  <div className="p-2 bg-primary/10 rounded-xl border border-primary/20 text-primary animate-pulse mt-0.5 shrink-0">
                    <Target size={14} />
                  </div>
                  <div className="relative overflow-x-auto w-full">
                     <p className="text-xs font-mono font-bold text-muted-foreground leading-relaxed whitespace-pre-line tracking-wide">
                       {job.Notes}
                     </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </PremiumCard>

        {/* Right Card: Operator & Ledger Hub */}
        <PremiumCard className="bg-slate-950/20 border border-white/5 shadow-2xl rounded-3xl overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-6 border-b border-white/5 bg-black/40">
              <h3 className="text-sm font-black text-foreground uppercase tracking-[0.3em] flex items-center gap-2.5 italic">
                <Truck className="h-4 w-4 text-emerald-500" /> {t('job_detail.operator_personnel')}
              </h3>
            </div>
            
            <CardContent className="p-6 space-y-6">
              <div className="flex items-center gap-4 p-3 bg-white/5 rounded-2xl border border-white/5">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-white font-black text-lg italic shadow-xl border border-white/10 relative overflow-hidden group/avatar shrink-0">
                    <div className="absolute inset-0 bg-black/10 group-hover/avatar:bg-transparent transition-colors" />
                    {job.Driver_Name?.charAt(0) || "?"}
                </div>
                <div>
                    <p className="text-base font-black text-foreground uppercase tracking-wider italic leading-tight">{job.Driver_Name || t('job_detail.operator_null')}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">ID:</span>
                        <span className="text-xs font-black text-primary font-mono tracking-wider">{job.Driver_ID || "---"}</span>
                    </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5 text-xs">
                    <span className="font-black text-muted-foreground uppercase tracking-widest italic">{t('job_detail.asset_plate')}</span>
                    <span className="font-black text-foreground uppercase font-mono tracking-wider bg-black/40 px-2.5 py-0.5 rounded border border-white/5">{job.Vehicle_Plate || t('job_detail.field_unit')}</span>
                </div>
                <div className="flex justify-between items-center p-3 text-xs">
                    <span className="font-black text-muted-foreground uppercase tracking-widest italic">{t('job_detail.secure_link')}</span>
                    <span className="font-black text-muted-foreground font-sans tracking-wide italic">@{job.Driver_ID?.toLowerCase() || t('job_detail.node_unbound')}</span>
                </div>
              </div>

              <PremiumButton className="w-full h-12 rounded-2xl text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-emerald-500/10 gap-2 group/call italic">
                  <Phone size={14} className="group-hover:rotate-12 transition-transform" /> {t('job_detail.connect_uplink')}
              </PremiumButton>
            </CardContent>
          </div>

          {/* Integrated Ledger Section */}
          <div className="p-6 border-t border-white/5 bg-black/30 space-y-4">
             <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                <span className="font-black text-foreground uppercase tracking-widest italic">รายละเอียดรายรับ-รายจ่าย</span>
                <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider font-mono">CUST / DRIVER</span>
             </div>
             
             {/* Basic Transit Cost */}
             <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-muted-foreground">ค่าขนส่งหลัก (Base)</span>
                <div className="flex gap-4 font-mono">
                   <span className="text-emerald-400">฿{priceCustBase.toLocaleString()}</span>
                   <span className="text-rose-400">฿{costDriverBase.toLocaleString()}</span>
                </div>
             </div>

             {/* Extra Costs Loop */}
             {extraCostsList.map((c, i) => (
                <div key={i} className="flex justify-between items-center text-xs border-t border-white/5 pt-2">
                   <span className="text-muted-foreground font-medium italic">└ {c.type || 'ค่าใช้จ่ายอื่น'}</span>
                   <div className="flex gap-4 font-mono text-xs">
                      <span className="text-emerald-400/80">฿{Number(c.charge_cust || 0).toLocaleString()}</span>
                      <span className="text-rose-400/80">฿{Number(c.cost_driver || 0).toLocaleString()}</span>
                   </div>
                </div>
             ))}

             {/* Totals */}
             <div className="flex justify-between items-center text-xs border-t border-white/10 pt-3">
                <span className="font-black text-muted-foreground uppercase tracking-widest italic">{t('job_detail.entity_yield')}</span>
                <span className="font-black text-emerald-400 text-sm font-sans tracking-wider">฿{priceCust.toLocaleString()}</span>
             </div>
             <div className="flex justify-between items-center text-xs">
                <span className="font-black text-muted-foreground uppercase tracking-widest italic">{t('job_detail.operator_cost')}</span>
                <span className="font-black text-rose-400 text-sm font-sans tracking-wider">฿{costDriver.toLocaleString()}</span>
             </div>
             <div className="flex justify-between items-center pt-3 border-t border-white/5 text-xs">
                <span className="font-black text-foreground uppercase tracking-widest italic">กำไรสุทธิ (Net Margin)</span>
                <span className="font-black text-amber-400 text-base font-sans tracking-wider">฿{netMargin.toLocaleString()}</span>
             </div>
          </div>
        </PremiumCard>
      </div>

      {/* 4. Execution Telemetry Grid (Map & Stair verification Side-by-Side) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left: GPS Map tracking */}
        <PremiumCard className={cn(
          "bg-slate-950/20 border border-white/5 shadow-2xl rounded-3xl overflow-hidden",
          routeHistory.length > 0 ? "lg:col-span-2" : "lg:col-span-3"
        )}>
            <div className="p-6 border-b border-white/5 bg-black/40 flex items-center justify-between">
                <h3 className="text-sm font-black text-foreground uppercase tracking-[0.3em] flex items-center gap-2.5 italic">
                    <Navigation className="h-4 w-4 text-emerald-500 animate-pulse" /> {t('job_detail.asset_tracking')}
                </h3>
                <div className="px-3 py-1 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-[10px] font-black text-emerald-500 uppercase tracking-widest italic">
                  {t('job_detail.signal_strength')}
                </div>
            </div>
            <div className="h-[400px] relative bg-slate-950/50">
              {routeHistory.length > 0 ? (
                <JobMapClient 
                    routeHistory={routeHistory} 
                    pickup={{ lat: job.Pickup_Lat, lng: job.Pickup_Lon, name: job.Origin_Location || job.Location_Origin_Name }}
                    dropoff={{ lat: job.Dropoff_Lat, lng: job.Dropoff_Lon, name: job.Dest_Location || job.Location_Destination_Name }}
                    status={job.Job_Status}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground text-xs italic font-bold">
                  <Activity size={32} className="text-muted-foreground/30 animate-pulse" />
                  <span>ไม่มีข้อมูลเส้นทางการขับรถในพิกัด GPS สำหรับวันนี้</span>
                </div>
              )}
            </div>
        </PremiumCard>

        {/* Right: Stair Incentive verification HUD */}
        {(job.Incentive_Claimed || job.Requires_Incentive_Check) && (
            <PremiumCard className={cn(
                "border rounded-3xl overflow-hidden shadow-2xl backdrop-blur-3xl transition-all duration-500 bg-slate-950/20 flex flex-col justify-between border-white/5",
                job.Sensor_Verified === 'Verified' ? 'border-emerald-500/20 shadow-emerald-500/5' : 
                job.Sensor_Verified === 'Suspect' ? 'border-rose-500/20 shadow-rose-500/5 animate-pulse' : 
                'border-amber-500/20 shadow-amber-500/5'
            )}>
                {/* HUD Header */}
                <div>
                  <div className="p-6 border-b border-white/5 bg-black/40 flex items-center justify-between gap-4 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-primary to-indigo-500" />
                      <div className="space-y-0.5">
                          <p className="text-[9px] font-black text-primary uppercase tracking-[0.25em] italic">TELEMETRY VERIFICATION</p>
                          <h3 className="text-base font-black text-foreground uppercase tracking-wider flex items-center gap-2 italic">
                              <Layers size={16} className="text-primary animate-pulse" /> ตรวจขึ้นชั้น 2-3
                          </h3>
                      </div>
                      <Badge className={cn(
                          "px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-xl shadow-lg border shrink-0",
                          job.Sensor_Verified === 'Verified' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]' :
                          job.Sensor_Verified === 'Suspect' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]' :
                          'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                      )}>
                          {job.Sensor_Verified === 'Verified' ? '✓ ผ่านระบบ' : 
                           job.Sensor_Verified === 'Suspect' ? '⚠ ผิดปกติ' : '⏳ รอกระบวนการ'}
                      </Badge>
                  </div>

                  <CardContent className="p-6 space-y-6">
                      
                      {/* Meter 1: Elevation Difference */}
                      {(() => {
                          const elev = Number(job.Sensor_Max_Elevation_Diff || 0)
                          const elevPct = Math.min((elev / 2.8) * 100, 100)
                          const isPassed = elev >= 2.8
                          return (
                              <div className="p-4 bg-black/40 rounded-2xl border border-white/5 space-y-3 hover:bg-black/60 transition-all group/item">
                                  <div className="flex justify-between items-start">
                                      <div className="flex items-center gap-3">
                                          <div className={cn(
                                              "p-1.5 rounded-lg border shrink-0 transition-transform group-hover/item:rotate-6 duration-300",
                                              isPassed ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                          )}>
                                              <TrendingUp size={16} />
                                          </div>
                                          <div>
                                              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">ผลต่างความสูงสะสม</span>
                                              <span className={cn(
                                                  "px-2 py-0.2 rounded-full text-[8px] font-black uppercase tracking-wider border inline-block",
                                                  isPassed ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                              )}>
                                                  {isPassed ? "ผ่านเกณฑ์" : "ต่ำกว่าเกณฑ์"}
                                              </span>
                                          </div>
                                      </div>
                                      <div className="text-right">
                                          <span className="text-xl font-black text-foreground italic font-mono">{elev.toFixed(2)}</span>
                                          <span className="text-[10px] font-bold text-muted-foreground ml-1">/ 2.80ม.</span>
                                      </div>
                                  </div>

                                  <div className="space-y-1.5">
                                      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden relative">
                                          <div 
                                              className={cn(
                                                  "h-full rounded-full transition-all duration-1000 ease-out",
                                                  isPassed ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-gradient-to-r from-amber-500 to-orange-400"
                                              )}
                                              style={{ width: `${elevPct}%` }}
                                          />
                                      </div>
                                      <div className="flex justify-between text-[8px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                                          <span>พื้น (0 ม.)</span>
                                          <span className={cn(isPassed && "text-emerald-400 font-black")}>เกณฑ์ขึ้นชั้น 2 (2.8 ม.)</span>
                                      </div>
                                  </div>
                              </div>
                          )
                      })()}

                      {/* Meter 2: Steps count */}
                      {(() => {
                          const steps = Number(job.Sensor_Total_Steps_Upward || 0)
                          const stepsPct = Math.min((steps / 15) * 100, 100)
                          const isPassed = steps >= 15
                          return (
                              <div className="p-4 bg-black/40 rounded-2xl border border-white/5 space-y-3 hover:bg-black/60 transition-all group/item">
                                  <div className="flex justify-between items-start">
                                      <div className="flex items-center gap-3">
                                          <div className={cn(
                                              "p-1.5 rounded-lg border shrink-0 transition-transform group-hover/item:rotate-6 duration-300",
                                              isPassed ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                          )}>
                                              <Activity size={16} />
                                          </div>
                                          <div>
                                              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider block">ก้าวเดินขึ้นบันได</span>
                                              <span className={cn(
                                                  "px-2 py-0.2 rounded-full text-[8px] font-black uppercase tracking-wider border inline-block",
                                                  isPassed ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                              )}>
                                                  {isPassed ? "ผ่านเกณฑ์" : "ต่ำกว่าเกณฑ์"}
                                              </span>
                                          </div>
                                      </div>
                                      <div className="text-right">
                                          <span className="text-xl font-black text-foreground italic font-mono">{steps}</span>
                                          <span className="text-[10px] font-bold text-muted-foreground ml-1">/ 15ก้าว</span>
                                      </div>
                                  </div>

                                  <div className="space-y-1.5">
                                      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden relative">
                                          <div 
                                              className={cn(
                                                  "h-full rounded-full transition-all duration-1000 ease-out",
                                                  isPassed ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-gradient-to-r from-amber-500 to-orange-400"
                                              )}
                                              style={{ width: `${stepsPct}%` }}
                                          />
                                      </div>
                                      <div className="flex justify-between text-[8px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                                          <span>เริ่มต้น</span>
                                          <span className={cn(isPassed && "text-emerald-400 font-black")}>เกณฑ์ก้าวขึ้น (15 ก้าว)</span>
                                      </div>
                                  </div>
                              </div>
                          )
                      })()}
                  </CardContent>
                </div>

                {/* Admin overrides controls */}
                <div className="p-6 border-t border-white/5 bg-black/40 space-y-4">
                    <div className="space-y-1">
                        <h4 className="text-[10px] font-black text-foreground uppercase tracking-widest italic flex items-center gap-1.5">
                            <ShieldCheck size={12} className="text-primary animate-pulse" /> COMMAND OVERRIDE PANEL
                        </h4>
                        <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">การดำเนินการจัดการสิทธิ์โดยแอดมิน (อนุมัติยอดค่าขึ้นชั้นสูงด้วยตนเอง)</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={async () => {
                                if (confirm('คุณต้องการอนุมัติการจ่ายเงินพิเศษนี้ใช่หรือไม่?')) {
                                    const { adminOverrideSensorVerification } = await import('@/app/admin/jobs/actions')
                                    const res = await adminOverrideSensorVerification(job.Job_ID, 'Verified', `${job.Notes || ''}\n[แอดมินยืนยันสิทธิ์ด้วยตนเอง]`)
                                    if (res.success) window.location.reload()
                                }
                            }}
                            className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg hover:shadow-xl flex items-center justify-center gap-1.5 border border-emerald-400/20"
                        >
                            <ShieldCheck size={14} /> อนุมัติจ่ายเงิน
                        </button>
                        <button
                            onClick={async () => {
                                if (confirm('คุณต้องการปฏิเสธการจ่ายเงินพิเศษและระบุเป็นต้องสงสัยใช่หรือไม่?')) {
                                    const { adminOverrideSensorVerification } = await import('@/app/admin/jobs/actions')
                                    const res = await adminOverrideSensorVerification(job.Job_ID, 'Suspect', `${job.Notes || ''}\n[แอดมินปฏิเสธสิทธิ์เนื่องจากข้อมูลต้องสงสัย]`)
                                    if (res.success) window.location.reload()
                                }
                            }}
                            className="flex-1 py-3 bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-lg hover:shadow-xl flex items-center justify-center gap-1.5 border border-rose-400/20"
                        >
                            <AlertTriangle size={14} /> ปฏิเสธการจ่าย
                        </button>
                    </div>
                </div>
            </PremiumCard>
        )}
      </div>

      {/* 5. Proof of Delivery (POD) Hub (Completion Phase) */}
      <PremiumCard className="bg-slate-950/20 border border-white/5 shadow-2xl rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-white/5 bg-black/40 flex items-center justify-between">
          <h3 className="text-sm font-black text-foreground uppercase tracking-[0.3em] flex items-center gap-2.5 italic">
            <FileText className="h-4 w-4 text-primary" /> {t('job_detail.termination_proof')}
          </h3>
          <div className="px-3 py-1 bg-primary/10 rounded-xl border border-primary/20 text-[10px] font-black text-primary uppercase tracking-widest italic">{t('job_detail.verified_signature')}</div>
        </div>
        <CardContent className="p-8">
          {job.Job_Status === "Delivered" || job.Job_Status === "Completed" ? (
            <div className="space-y-8">
                {(() => {
                    const proofUrls = job.Photo_Proof_Url ? job.Photo_Proof_Url.split(',') : []
                    const reportUrl = proofUrls.length > 0 ? proofUrls[0] : null
                    const itemPhotos = proofUrls.length > 1 ? proofUrls.slice(1) : []

                    return (
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                            
                            {/* Digital Report Section (6 Cols) */}
                            <div className="space-y-4 md:col-span-6">
                                <h3 className="text-xs font-black text-foreground uppercase tracking-widest flex items-center gap-2 italic">
                                    <FileText className="h-3.5 w-3.5 text-emerald-500" /> {t('job_detail.digital_transmission')}
                                </h3>
                                {reportUrl ? (
                                    <div className="relative w-full aspect-[1.5/1] bg-slate-950 rounded-2xl overflow-hidden border border-white/5 group/report shadow-2xl">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img 
                                            src={reportUrl} 
                                            alt="Digital POD Report" 
                                            className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-500"
                                        />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                            <a href={reportUrl} target="_blank" rel="noreferrer">
                                                <PremiumButton className="h-10 px-5 rounded-xl font-black uppercase tracking-wider text-xs gap-1.5">
                                                    <Eye size={14} /> {t('job_detail.open_source_intel')}
                                                </PremiumButton>
                                            </a>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="p-8 text-center text-muted-foreground border border-dashed border-white/5 rounded-2xl bg-black/25 italic font-black uppercase tracking-widest text-xs">
                                            {t('job_detail.report_missing')}
                                        </div>
                                        <PODDownloadButton job={{
                                            jobId: job.Job_ID,
                                            trackingCode: job.Job_ID,
                                            customerName: job.Customer_Name,
                                            origin: job.Origin_Location || job.Location_Origin_Name,
                                            destination: job.Dest_Location || job.Location_Destination_Name,
                                            status: job.Job_Status,
                                            planDate: job.Plan_Date,
                                            pickupDate: job.Actual_Pickup_Time || null,
                                            deliveryDate: job.Actual_Delivery_Time ? `${job.Delivery_Date} ${job.Actual_Delivery_Time}` : job.Delivery_Date,
                                            driverName: job.Driver_Name,
                                            driverPhone: job.Customer_Phone || '-',
                                            vehiclePlate: job.Vehicle_Plate,
                                            pickupPhotos: job.Pickup_Photo_Url ? job.Pickup_Photo_Url.split(',') : [],
                                            podPhotos: job.Photo_Proof_Url ? job.Photo_Proof_Url.split(',') : [],
                                            signature: job.Signature_Url,
                                            pickupSignature: job.Pickup_Signature_Url,
                                            notes: job.Notes
                                        }} />
                                    </div>
                                )}
                            </div>

                            {/* Personnel Authentication (Signature) (6 Cols) */}
                            <div className="space-y-4 md:col-span-6">
                                 <h3 className="text-xs font-black text-foreground uppercase tracking-widest flex items-center gap-2 italic">
                                    <FileText className="h-3.5 w-3.5 text-indigo-400" /> {t('job_detail.personnel_signature')}
                                </h3>
                                {job.Signature_Url ? (
                                     <div className="relative aspect-[1.5/1] w-full bg-white rounded-2xl overflow-hidden border-2 border-primary/20 shadow-2xl flex items-center justify-center p-8 group">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img 
                                            src={job.Signature_Url} 
                                            alt="Customer Signature" 
                                            className="w-full h-full object-contain filter contrast-125"
                                        />
                                        <div className="absolute bottom-4 right-4 px-3 py-1 bg-slate-950 rounded-xl border border-primary/20 text-[9px] font-black text-primary uppercase tracking-widest italic shadow-lg">
                                          {t('job_detail.authenticated_bio')}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-[200px] w-full rounded-2xl border border-dashed border-white/5 flex flex-col items-center justify-center gap-3 text-muted-foreground bg-black/25 italic font-black uppercase tracking-widest text-xs">
                                        <Layers className="text-muted-foreground/30" size={24} />
                                        {t('job_detail.signature_null')}
                                    </div>
                                )}
                            </div>

                            {/* Supplementary inventory items (12 Cols) */}
                            {itemPhotos.length > 0 && (
                                <div className="md:col-span-12 space-y-4 pt-6 border-t border-white/5">
                                    <h3 className="text-xs font-black text-foreground uppercase tracking-widest flex items-center gap-2 italic">
                                        <Package className="h-3.5 w-3.5 text-primary" /> {t('job_detail.supplemental_intel')} ({itemPhotos.length})
                                    </h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                        {itemPhotos.map((url: string, i: number) => (
                                            <div key={i} className="relative aspect-square bg-slate-950 rounded-2xl overflow-hidden border border-white/5 group cursor-pointer shadow-xl">
                                                 {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img 
                                                    src={url} 
                                                    alt={`Product ${i+1}`} 
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                                 <div className="absolute inset-0 bg-primary/25 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                                    <a href={url} target="_blank" rel="noreferrer" className="transform group-hover:rotate-12 transition-transform">
                                                        <div className="p-3 bg-white rounded-full text-primary shadow-2xl">
                                                            <Eye className="h-4 w-4" />
                                                        </div>
                                                    </a>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })()}
            </div>
          ) : (
            <div className="p-20 flex flex-col items-center justify-center gap-6 border border-dashed border-white/5 rounded-3xl bg-black/25 relative overflow-hidden group/empty">
                <div className="absolute inset-0 bg-primary/[0.01] animate-pulse" />
                <Activity size={48} strokeWidth={1} className="text-muted-foreground/30 group-hover:text-primary transition-colors duration-500" />
                <div className="text-center space-y-1 relative z-10">
                    <p className="text-sm font-black text-muted-foreground uppercase tracking-[0.3em] italic group-hover:text-foreground transition-colors">{t('job_detail.awaiting_delivery')}</p>
                    <p className="text-xs font-bold text-muted-foreground/50 uppercase tracking-[0.4em] italic">{t('job_detail.pod_not_initialized')}</p>
                </div>
            </div>
          )}
        </CardContent>
      </PremiumCard>
    </div>
  )
}

/* Stat Ribbon helper component */
function StatRibbonCard({ 
  icon, label, value, subtitle, glowColor = "primary" 
}: { 
  icon: React.ReactNode, label: string, value: string, subtitle: string, glowColor?: "primary" | "emerald" | "amber" 
}) {
  return (
    <div className={cn(
      "bg-slate-950/40 backdrop-blur-md p-5 rounded-2xl border border-white/5 flex items-center gap-4 transition-all relative overflow-hidden shadow-lg",
      glowColor === "primary" ? "hover:border-primary/20 hover:shadow-primary/5" :
      glowColor === "emerald" ? "hover:border-emerald-500/20 hover:shadow-emerald-500/5" :
      "hover:border-amber-500/20 hover:shadow-amber-500/5"
    )}>
       <div className={cn(
         "p-2.5 rounded-xl border shrink-0",
         glowColor === "primary" ? "bg-primary/5 border-primary/10 text-primary" :
         glowColor === "emerald" ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400" :
         "bg-amber-500/5 border-amber-500/10 text-amber-400"
       )}>
         {icon}
       </div>
       <div>
         <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-0.5 leading-none">{label}</span>
         <span className="text-lg font-black text-foreground italic leading-tight tracking-wide font-display">{value}</span>
         <span className="text-[8px] font-black text-muted-foreground/40 block mt-0.5 tracking-wider leading-none uppercase">{subtitle}</span>
       </div>
    </div>
  )
}

/* Status badge helper */
function StatusBadge({ status }: { status: string }) {
    let colorClass = "bg-slate-500/10 text-muted-foreground border-border/10"
  
    switch (status) {
      case "New": colorClass = "bg-primary/10 text-primary border-primary/20 shadow-[0_0_15px_rgba(255,30,133,0.1)]"; break
      case "Assigned": colorClass = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"; break
      case "Picked Up":
      case "In Progress":
      case "In Transit": colorClass = "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse"; break
      case "Delivered":
      case "Completed": colorClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]"; break
      case "Cancelled": colorClass = "bg-slate-800/50 text-muted-foreground border-white/5"; break
      case "Failed": colorClass = "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)] animate-pulse"; break
    }
  
    return (
      <Badge variant="outline" className={cn("border px-3 py-1 text-xs font-black uppercase tracking-wider rounded-full italic transition-all shadow-md leading-none shrink-0", colorClass)}>
        {status.toUpperCase()}
      </Badge>
    )
}
