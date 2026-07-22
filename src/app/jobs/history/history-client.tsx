"use client"

import { SearchInput } from "@/components/ui/search-input"
import { Pagination } from "@/components/ui/pagination"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { todayTH } from "@/lib/utils/date-th"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { 
  History, 
  Truck,
  MapPin,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowLeft,
  XCircle,
  ListFilter,
  ImageIcon,
  Zap,
  Eye,
  Loader2,
  ExternalLink
} from "lucide-react"
import { ExcelExport } from "@/components/ui/excel-export"
import { JobHistoryActions } from "@/components/jobs/job-history-actions"
import { HistoryStatusFilter } from "@/components/jobs/history-status-filter"
import { CustomerCancelButton } from "@/components/jobs/customer-cancel-button"
import NextImage from "next/image"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useLanguage } from "@/components/providers/language-provider"
import { getAllJobs } from "@/lib/supabase/jobs"
import * as XLSX from "xlsx"
import { useState, useEffect } from "react"
import { Job } from "@/lib/supabase/jobs"
import { Driver } from "@/lib/supabase/drivers"
import { Vehicle } from "@/lib/supabase/vehicles"
import { Customer } from "@/lib/supabase/customers"
import { Route } from "@/lib/supabase/routes"
import { Subcontractor } from "@/types/subcontractor"

interface HistoryClientProps {
  jobs: Job[]
  count: number
  stats: { success: number, failed: number, cancelled: number, total: number, withPhoto: number, withSignature: number }
  drivers: Driver[]
  vehicles: Vehicle[]
  customers: Customer[]
  routes: Route[]
  subcontractors: Subcontractor[]
  customerMode: boolean
  canViewPrice: boolean
  canDelete: boolean
  canExport: boolean
  dateFrom: string
  dateTo: string
  status: string
  query: string
  limit: number
}

export function HistoryClient({ 
  jobs, 
  count, 
  stats,
  drivers, 
  vehicles, 
  customers, 
  routes,
  subcontractors,
  customerMode,
  canViewPrice,
  canDelete,
  canExport,
  dateFrom,
  dateTo,
  status,
  query,
  limit
}: HistoryClientProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [isExporting, setIsExporting] = useState(false)

  const handleExportAll = async () => {
    setIsExporting(true)
    try {
        // Fetch all jobs matching the filters (limit 10,000)
        const result = await getAllJobs(1, 10000, query, status, dateFrom, dateTo)
        const allJobs = result.data

        if (!allJobs || allJobs.length === 0) {
            alert("No data to export")
            return
        }

        // Prepare data for Excel
        const exportData = allJobs.map(job => {
            let origin = (job.Origin_Location || '').trim()
            let dest = (job.Dest_Location || '').trim()
            
            // Fallback for Route Name
            if ((!origin || !dest) && job.Route_Name) {
                const parts = job.Route_Name.split(/[-→/]/)
                if (parts.length >= 2) {
                    if (!origin) origin = parts[0].trim()
                    if (!dest) dest = parts.slice(1).join(' - ').trim()
                }
            }

            return {
                'Job ID': job.Job_ID,
                'Status': job.Job_Status,
                'Plan Date': job.Plan_Date,
                'Customer': job.Customer_Name,
                'Route': job.Route_Name,
                'Origin': origin,
                'Destination': dest,
                'Vehicle': job.Vehicle_Plate,
                'Driver': job.Driver_Name,
                'Total Qty': job.Loaded_Qty || 0,
                'Distance (KM)': job.Est_Distance_KM || 0,
                'Verification': job.Verification_Status || 'Pending'
            }
        })

        const wb = XLSX.utils.book_new()
        const ws = XLSX.utils.json_to_sheet(exportData)
        XLSX.utils.book_append_sheet(wb, ws, "Mission History")
        XLSX.writeFile(wb, `mission_history_${todayTH()}.xlsx`)
    } catch (error) {
        console.error("Export failed:", error)
        alert("Failed to export data")
    } finally {
        setIsExporting(false)
    }
  }

  const [fromInput, setFromInput] = useState(dateFrom)
  const [toInput, setToInput] = useState(dateTo)

  useEffect(() => {
    setFromInput(dateFrom)
  }, [dateFrom])

  useEffect(() => {
    setToInput(dateTo)
  }, [dateTo])

  useEffect(() => {
    const timer = setTimeout(() => {
      const currentFrom = searchParams.get('from') || ''
      const currentTo = searchParams.get('to') || ''
      if (currentFrom === fromInput && currentTo === toInput) return

      const params = new URLSearchParams(searchParams.toString())
      if (fromInput) params.set('from', fromInput)
      else params.delete('from')

      if (toInput) params.set('to', toInput)
      else params.delete('to')

      params.set('page', '1')
      router.push(`${pathname}?${params.toString()}`)
    }, 600)

    return () => clearTimeout(timer)
  }, [fromInput, toInput, router, pathname, searchParams])

  const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    New: { label: t('common.pending'), color: "text-primary bg-primary/10 border-primary/20", icon: <Package size={14} /> },
    Assigned: { label: t('common.pending'), color: "text-primary bg-primary/20 border-primary/30", icon: <Truck size={14} /> },
    "Picked Up": { label: t('common.loading'), color: "text-accent bg-accent/20 border-accent/30", icon: <Package size={14} /> },
    "In Transit": { label: t('common.loading'), color: "text-accent bg-accent/20 border-accent/30", icon: <Truck size={14} /> },
    Delivered: { label: t('common.success'), color: "text-primary bg-primary/10 border-primary/20", icon: <CheckCircle2 size={14} /> },
    Completed: { label: t('common.success'), color: "text-primary bg-primary/20 border-primary/30", icon: <CheckCircle2 size={14} /> },
    Complete: { label: t('common.success'), color: "text-primary bg-primary/20 border-primary/30", icon: <CheckCircle2 size={14} /> },
    Failed: { label: t('common.failed'), color: "text-rose-500 bg-rose-500/10 border-rose-500/20", icon: <AlertCircle size={14} /> },
    Cancelled: { label: t('common.cancelled'), color: "text-muted-foreground bg-muted/50 border-border/10", icon: <XCircle size={14} /> },
  }

  return (
    <>
      {/* Elite Tactical Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10 bg-background/60 backdrop-blur-3xl p-8 rounded-3xl border border-border/5 shadow-xl relative group ring-1 ring-border/5 hover:ring-primary/20 transition-all duration-700">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary/20 rounded-lg shadow-lg">
                    <History className="text-primary" size={16} />
                </div>
                <h2 className="text-xs font-bold font-black text-primary uppercase tracking-[0.4em]">{t('navigation.reports')} {t('history.intel_archives')}</h2>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-tighter flex items-center gap-4 uppercase premium-text-gradient italic leading-none">
                {customerMode ? t('navigation.reports') : t('navigation.history')}
            </h1>
            <p className="text-muted-foreground font-bold text-sm tracking-wide opacity-80 uppercase leading-relaxed italic">
              {customerMode ? t('history.fleet_matrix') : t('dashboard.subtitle')}
            </p>
        </div>

        <div className="flex flex-wrap gap-3 relative z-10">
          <Link href={customerMode ? "/dashboard" : "/planning"}>
            <PremiumButton variant="outline" className="h-11 px-6 rounded-xl border-border/5 bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all text-xs font-black uppercase tracking-widest">
              <ArrowLeft size={16} className="mr-2 opacity-50" />
              {t('common.back')}
            </PremiumButton>
          </Link>
          {canExport && (
            <PremiumButton 
                variant="secondary" 
                className="h-11 px-6 rounded-xl bg-primary text-foreground shadow-lg text-xs font-black uppercase tracking-widest disabled:opacity-50"
                onClick={handleExportAll}
                disabled={isExporting}
            >
                {isExporting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('common.loading')}...</>
                ) : (
                    <><Download className="w-4 h-4 mr-2" /> {t('common.download_report')}</>
                )}
            </PremiumButton>
          )}
        </div>
      </div>

      {/* Metrics Matrix */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-10">
        {[
          { label: t('navigation.pod'), value: stats.total || 0, icon: Package, color: "text-muted-foreground", bg: "bg-muted/50", border: "border-border/5" },
          { label: t('common.success'), value: stats.success || 0, icon: CheckCircle2, color: "text-primary", bg: "bg-primary/20", border: "border-primary/20" },
          { label: t('common.failed'), value: stats.failed || 0, icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" },
          { label: t('common.cancelled'), value: stats.cancelled || 0, icon: XCircle, color: "text-muted-foreground", bg: "bg-muted/50", border: "border-border/5" },
          { label: t('pod.visual_proof'), value: stats.withPhoto || 0, icon: ImageIcon, color: "text-primary", bg: "bg-primary/20", border: "border-primary/20" },
          { label: t('pod.auth_sig'), value: stats.withSignature || 0, icon: Eye, color: "text-primary", bg: "bg-primary/20", border: "border-primary/20" },
        ].map((stat, idx) => (
          <div key={idx} className={cn(
                  "p-6 rounded-2xl border backdrop-blur-3xl shadow-xl relative overflow-hidden group transition-all hover:scale-[1.02] bg-background/40",
                  stat.border
              )}>
                <div className="flex items-center justify-between mb-6">
                    <div className={cn(
                        "p-3 rounded-xl shadow-lg transition-all duration-700 group-hover:scale-110 group-hover:rotate-6",
                        stat.bg, stat.color
                    )}>
                        <stat.icon size={20} strokeWidth={2.5} />
                    </div>
                </div>
                <div className="relative z-10">
                    <p className="text-muted-foreground font-black text-[10px] font-bold uppercase tracking-[0.3em] mb-1">{stat.label}</p>
                    <p className="text-2xl font-black text-foreground tracking-tighter leading-none">{stat.value}</p>
                </div>
          </div>
        ))}
      </div>

      {/* Advanced Command Grid */}
      <div className="glass-panel rounded-3xl border-border/5 shadow-xl overflow-hidden bg-background/20 group/archives">
          {/* Tactical Filter Header */}
          <div className="p-8 border-b border-border/5 bg-background/60 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
            <div className="flex items-center gap-3 mb-8 relative z-10">
                <div className="p-2 bg-primary/20 rounded-xl text-primary shadow-lg shadow-primary/10">
                    <ListFilter size={18} />
                </div>
                <div>
                    <h2 className="text-xl font-black text-foreground tracking-tight uppercase italic">{t('navigation.reports')} {t('history.archive_filtering')}</h2>
                    <p className="text-primary text-[10px] font-black uppercase tracking-[0.3em] mt-0.5 opacity-70 italic">{t('history.metadata_search')}</p>
                </div>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10">
                <div className="md:col-span-12 lg:col-span-5">
                    <div className="glass-panel rounded-xl p-0.5 border-border/5">
                        <SearchInput placeholder={t('common.search')} className="bg-transparent border-none text-foreground h-12 px-6 text-sm font-black tracking-widest uppercase placeholder:text-muted-foreground" />
                    </div>
                </div>
                <div className="md:col-span-4 lg:col-span-2 space-y-2">
                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] ml-1">{t('common.date')}</Label>
                    <input
                        type="date"
                        value={fromInput}
                        name="from"
                        onChange={(e) => setFromInput(e.target.value)}
                        className="h-12 w-full bg-muted/50 border-border/5 text-foreground font-black rounded-xl shadow-inner focus:ring-primary/40 transition-all px-6 text-xs font-bold uppercase tracking-widest outline-none"
                    />
                </div>
                <div className="md:col-span-4 lg:col-span-2 space-y-2">
                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] ml-1">{t('common.date')}</Label>
                    <input
                        type="date"
                        value={toInput}
                        name="to"
                        onChange={(e) => setToInput(e.target.value)}
                        className="h-12 w-full bg-muted/50 border-border/5 text-foreground font-black rounded-xl shadow-inner focus:ring-primary/40 transition-all px-6 text-xs font-bold uppercase tracking-widest outline-none"
                    />
                </div>
                <div className="md:col-span-4 lg:col-span-3 space-y-2">
                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] ml-1">{t('navigation.settings')}</Label>
                    <HistoryStatusFilter initialValue={status} />
                </div>
                <button type="submit" className="hidden" /> 
            </form>
          </div>

          {/* Operation Log Feed */}
          <div className="p-6 border-b border-border/5 flex items-center justify-between bg-muted/30">
            <div className="flex items-center gap-3">
                <div className="w-1 h-8 bg-primary rounded-full shadow-[0_0_15px_rgba(255,30,133,0.8)]" />
                <div>
                    <h3 className="text-xl font-black text-foreground tracking-tighter uppercase italic">{t('navigation.history')} Log</h3>
                    <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.4em] mt-0.5 italic">{t('history.profiles_found').replace('{count}', count.toString())} • {t('history.historical_node')}</p>
                </div>
            </div>
            <Zap size={18} className="text-primary/20 opacity-50" />
          </div>

          <div className="relative min-h-[400px]">
          {jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-6">
              <div className="w-24 h-24 rounded-2xl bg-muted/50 flex items-center justify-center border border-dashed border-border/10 group-hover/archives:border-primary/30 transition-all group-hover/archives:scale-110 duration-700">
                <Package className="w-12 h-12 text-muted-foreground opacity-20" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-muted-foreground font-bold text-base uppercase tracking-widest">{t('common.pending')}</p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              {/* Header Row (Hidden on small screens) */}
              <div className="hidden lg:grid lg:grid-cols-[1.5fr_1.5fr_1.2fr_1fr_0.8fr_1fr_1fr_0.8fr] gap-4 px-6 py-4 bg-muted/40 rounded-xl mb-4 border border-white/5 items-center">
                <div className="text-2xl font-black text-accent uppercase tracking-wider">{t('jobs.col_id')}</div>
                <div className="text-2xl font-black text-accent uppercase tracking-wider">รายละเอียด</div>
                <div className="text-2xl font-black text-accent uppercase tracking-wider">ทะเบียน</div>
                <div className="text-center text-2xl font-black text-accent uppercase tracking-wider">ตรวจสอบ</div>
                <div className="text-center text-2xl font-black text-accent uppercase tracking-wider">POD</div>
                {canViewPrice && <div className="text-right text-2xl font-black text-accent uppercase tracking-wider">{t('history.price_matrix')}</div>}
                <div className="text-center text-2xl font-black text-accent uppercase tracking-wider">{t('common.status')}</div>
                <div className="text-right text-2xl font-black text-accent uppercase tracking-wider">{t('common.action')}</div>
              </div>

              {/* Cards List */}
              <div className="flex flex-col gap-3">
                {(jobs || []).map((job: Job) => (
                    <div 
                        key={job.Job_ID} 
                        className="group/row transition-all duration-500 bg-background/40 hover:bg-primary/[0.03] border border-white/5 hover:border-primary/20 rounded-2xl p-4 lg:p-0 relative overflow-hidden shadow-sm"
                    >
                        {/* Hover Highlight Accent */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary opacity-0 group-hover/row:opacity-100 transition-opacity shadow-[0_0_15px_rgba(255,30,133,0.5)]" />
                        
                        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1.5fr_1.2fr_1fr_0.8fr_1fr_1fr_0.8fr] gap-4 lg:items-center px-2 lg:px-6 py-2 lg:py-4">
                            {/* Section 1: ID & Date */}
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-muted/50 border border-border/5 flex items-center justify-center group-hover/row:bg-primary group-hover/row:text-foreground transition-all duration-500 shadow-lg group-hover/row:-rotate-3 shrink-0">
                                    <Package size={16} strokeWidth={2.5} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <Link 
                                            href={customerMode ? `/dashboard/tracking?q=${job.Job_ID}` : `/admin/tracking?q=${job.Job_ID}`}
                                            className="text-foreground font-black text-sm tracking-tighter hover:text-primary transition-colors font-display uppercase truncate hover:underline"
                                        >
                                            {job.Job_ID}
                                        </Link>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <Clock size={10} className="text-muted-foreground" />
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{job.Plan_Date || t('common.pending')}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Customer & Route */}
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <p className="text-foreground font-black text-sm tracking-tight uppercase group-hover/row:text-primary transition-colors leading-tight truncate">{job.Customer_Name || "-"}</p>
                                <div className="flex items-center gap-1.5 text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                                    <MapPin size={10} className="text-primary/60 shrink-0" />
                                    <span className="truncate">{job.Route_Name || "DIRECT VECTOR"}</span>
                                </div>
                            </div>

                            {/* Section 3: Vehicle & Driver */}
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <div className="flex items-center gap-2">
                                    <div className="p-1 bg-muted/50 rounded-md text-muted-foreground group-hover/row:text-primary transition-colors shrink-0">
                                        <Truck size={10} strokeWidth={2.5} />
                                    </div>
                                    <p className="text-foreground font-black text-sm tracking-tight uppercase leading-tight truncate">{job.Vehicle_Plate || "-"}</p>
                                </div>
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-1 truncate">
                                    {job.Driver_Name || (job.Driver_ID ? (drivers.find(d => d.Driver_ID === job.Driver_ID)?.Driver_Name || t('common.pending')) : t('common.pending'))}
                                </p>
                            </div>

                            {/* Section 4: Integrity Status */}
                            <div className="flex lg:flex-col items-center justify-center gap-1 min-w-[100px]">
                                {(job.Verification_Status || (job.Job_Status === 'Verified' ? 'Verified' : job.Job_Status === 'Rejected' ? 'Rejected' : null)) ? (
                                    <Badge className={cn(
                                        "rounded-lg px-2 py-0.5 font-black text-[9px] border-none shadow-md tracking-widest uppercase shrink-0",
                                        (job.Verification_Status === 'Verified' || job.Job_Status === 'Verified') ? "bg-primary text-foreground shadow-primary/20" :
                                        (job.Verification_Status === 'Rejected' || job.Job_Status === 'Rejected') ? "bg-rose-500 text-foreground shadow-rose-500/20" : "bg-accent text-foreground shadow-accent/20"
                                    )}>
                                        {(job.Verification_Status === 'Verified' || job.Job_Status === 'Verified') ? t('common.success') : (job.Verification_Status === 'Rejected' || job.Job_Status === 'Rejected') ? t('common.error') : (job.Verification_Status || job.Job_Status)}
                                    </Badge>
                                ) : (
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-1 h-1 rounded-full bg-slate-700 animate-ping" />
                                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest italic shrink-0">รอตรวจ</span>
                                    </div>
                                )}
                                {job.Verified_At && (
                                    <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest truncate w-full text-center hidden lg:block">
                                        {t('history.agent')} {job.Verified_By?.split('@')[0]}
                                    </p>
                                )}
                            </div>

                            {/* Section 5: Pickup & POD Photos */}
                            <div className="flex items-center justify-center gap-3 shrink-0">
                                {/* Pickup Evidence */}
                                <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-1">
                                        {job.Pickup_Photo_Url ? (
                                            <div className="relative w-7 h-7 rounded-lg border border-border/10 shadow-lg overflow-hidden bg-muted/50 group/img ring-2 ring-indigo-500/0 hover:ring-indigo-500/40 transition-all duration-500">
                                                <img 
                                                    src={job.Pickup_Photo_Url.split(',')[0]} 
                                                    alt="Pickup Photo" 
                                                    className="w-full h-full object-cover group-hover/img:scale-125 transition-transform duration-1000" 
                                                />
                                                <a href={job.Pickup_Photo_Url.split(',')[0]} target="_blank" rel="noreferrer" className="absolute inset-0 z-10 flex items-center justify-center bg-indigo-500/40 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                                    <Eye size={10} className="text-foreground" />
                                                </a>
                                            </div>
                                        ) : (
                                            <div className="w-7 h-7 rounded-lg border border-dashed border-border/5 flex items-center justify-center text-muted-foreground/30">
                                                <ImageIcon size={10} strokeWidth={1.5} />
                                            </div>
                                        )}
                                        {job.Pickup_Signature_Url ? (
                                            <div className="relative w-9 h-7 rounded-lg border border-border/10 shadow-lg overflow-hidden bg-white p-1 group/sig ring-2 ring-indigo-500/0 hover:ring-indigo-500/40 transition-all duration-500">
                                                <img 
                                                    src={job.Pickup_Signature_Url} 
                                                    alt="Pickup Sig" 
                                                    className="w-full h-full object-contain p-0.5" 
                                                />
                                                <a href={job.Pickup_Signature_Url} target="_blank" rel="noreferrer" className="absolute inset-0 z-10 flex items-center justify-center bg-indigo-500/40 opacity-0 group-hover/img:opacity-100 transition-opacity" />
                                            </div>
                                        ) : (
                                            <div className="w-9 h-7 rounded-lg border border-dashed border-border/5" />
                                        )}
                                    </div>
                                    <span className="text-[7px] font-black text-indigo-400 uppercase tracking-widest leading-none">PICKUP</span>
                                </div>

                                <div className="h-6 w-px bg-white/5 mx-1" />

                                {/* Delivery Evidence */}
                                <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-1">
                                        {job.Photo_Proof_Url ? (
                                            <div className="relative w-7 h-7 rounded-lg border border-border/10 shadow-lg overflow-hidden bg-muted/50 group/img ring-2 ring-primary/0 hover:ring-primary/40 transition-all duration-500">
                                                <img 
                                                    src={job.Photo_Proof_Url.split(',')[0]} 
                                                    alt="POD Photo" 
                                                    className="w-full h-full object-cover group-hover/img:scale-125 transition-transform duration-1000" 
                                                />
                                                <a href={job.Photo_Proof_Url.split(',')[0]} target="_blank" rel="noreferrer" className="absolute inset-0 z-10 flex items-center justify-center bg-primary/40 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                                    <Eye size={10} className="text-foreground" />
                                                </a>
                                            </div>
                                        ) : (
                                            <div className="w-7 h-7 rounded-lg border border-dashed border-border/5 flex items-center justify-center text-muted-foreground/30">
                                                <ImageIcon size={10} strokeWidth={1.5} />
                                            </div>
                                        )}
                                        {job.Signature_Url ? (
                                            <div className="relative w-9 h-7 rounded-lg border border-border/10 shadow-lg overflow-hidden bg-white p-1 group/sig ring-2 ring-accent/0 hover:ring-accent/40 transition-all duration-500">
                                                <img 
                                                    src={job.Signature_Url} 
                                                    alt="Signature" 
                                                    className="w-full h-full object-contain p-0.5 group-hover/sig:scale-110 transition-transform duration-700" 
                                                />
                                                <a href={job.Signature_Url} target="_blank" rel="noreferrer" className="absolute inset-0 z-10 flex items-center justify-center bg-accent/40 opacity-0 group-hover/sig:opacity-100 transition-opacity" />
                                            </div>
                                        ) : (
                                            <div className="w-9 h-7 rounded-lg border border-dashed border-border/5 transition-colors group-hover/row:border-accent/20" />
                                        )}
                                    </div>
                                    <span className="text-[7px] font-black text-primary uppercase tracking-widest leading-none">DELIVERY</span>
                                </div>
                            </div>

                            {/* Section 6: Pricing Matrix */}
                            {canViewPrice && (
                                <div className="flex flex-col items-end shrink-0">
                                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary/10 rounded-md border border-primary/20">
                                        <span className="text-foreground font-black text-xs tracking-tighter">
                                            {typeof job.Price_Cust_Total === 'number' 
                                                ? job.Price_Cust_Total.toLocaleString() 
                                                : (Number(job.Price_Cust_Total) || 0).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="pr-1 flex items-center gap-1.5">
                                        <span className="text-[8px] font-black text-muted-foreground tracking-tighter">
                                            {typeof job.Cost_Driver_Total === 'number' 
                                                ? job.Cost_Driver_Total.toLocaleString() 
                                                : (Number(job.Cost_Driver_Total) || 0).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Section 7: Job Status Badge */}
                            <div className="flex justify-center shrink-0">
                                <span className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border shadow-lg transition-all duration-500 group-hover/row:scale-105",
                                    statusConfig[job.Job_Status || '']?.color || 'bg-muted/50 text-muted-foreground border-border/10'
                                )}>
                                    <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
                                    {statusConfig[job.Job_Status || '']?.label || job.Job_Status}
                                </span>
                            </div>

                            {/* Section 8: Actions */}
                            <div className="flex justify-end lg:justify-end gap-2 shrink-0">
                                {!customerMode && (
                                    <div className="transition-all duration-500 scale-90 origin-right">
                                        <JobHistoryActions 
                                            job={job}
                                            drivers={drivers}
                                            vehicles={vehicles}
                                            customers={customers}
                                            routes={routes}
                                            subcontractors={subcontractors}
                                            canViewPrice={canViewPrice}
                                            canDelete={canDelete}
                                        />
                                    </div>
                                )}
                                {customerMode && (
                                    <div className="scale-90 origin-right">
                                        <CustomerCancelButton jobId={job.Job_ID} jobStatus={job.Job_Status || ''} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
              </div>
            </div>
          )}
          </div>
          
          <div className="p-6 border-t border-border/5 bg-muted/30">
             <Pagination totalItems={count || 0} limit={limit} />
          </div>
      </div>
    </>
  )
}

