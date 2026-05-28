"use client"

import { useState, useEffect, useTransition } from "react"
import { 
  Search, Package, Truck, MapPin, Clock, ChevronRight, Loader2,
  Activity, Navigation, ExternalLink, ShieldCheck, Target, Cpu, 
  Layers, TrendingUp, AlertTriangle, Info, DollarSign, User, 
  CheckCircle2, Calendar, Phone, Smartphone, Box, Scale, Maximize2, 
  RefreshCw, ArrowRight, Eye, PenTool, ArrowLeft
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { CardContent } from "@/components/ui/card"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { TrackingMap } from "@/components/tracking/tracking-map"
import { PODDownloadButton } from "@/components/tracking/pod-download"
import { FeedbackForm } from "@/components/tracking/feedback-form"
import { getPublicJobDetails, PublicJobDetails } from "@/lib/actions/tracking-actions"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { useLanguage } from "@/components/providers/language-provider"

interface TrackingHubClientProps {
  initialActiveJobs: PublicJobDetails[]
  customerMode?: boolean
}

export function TrackingHubClient({ initialActiveJobs, customerMode = false }: TrackingHubClientProps) {
  const router = useRouter()
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const [activeJobs, setActiveJobs] = useState<PublicJobDetails[]>(initialActiveJobs)
  const [selectedJob, setSelectedJob] = useState<PublicJobDetails | null>(null)
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
  const [isSearching, startSearch] = useTransition()
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)

  // Sync with URL & Initial Load
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) handleSearch(q)
  }, [])

  useEffect(() => {
    setActiveJobs(initialActiveJobs)
  }, [initialActiveJobs])

  const handleSearch = async (query: string) => {
    if (!query.trim()) return
    startSearch(async () => {
        const result = await getPublicJobDetails(query)
        if (result) {
            setSelectedJob(result)
            if (!activeJobs.find(j => j.jobId === result.jobId)) {
                setActiveJobs(prev => [result, ...prev])
            }
        } else {
            alert("ไม่พบข้อมูลงานที่ระบุ")
        }
    })
  }

  const selectJobFromRadar = async (job: PublicJobDetails) => {
    setIsLoadingDetails(true)
    try {
        const fullJob = await getPublicJobDetails(job.jobId)
        setSelectedJob(fullJob || job)
    } finally {
        setIsLoadingDetails(false)
    }
  }

  const steps = [
    { key: 'New', label: 'รับงาน', icon: <Calendar size={14} /> },
    { key: 'Assigned', label: 'จัดรถแล้ว', icon: <User size={14} /> },
    { key: 'Picked Up', label: 'รับสินค้าแล้ว', icon: <Package size={14} /> },
    { key: 'In Transit', label: 'กำลังจัดส่ง', icon: <Truck size={14} /> },
    { key: 'Completed', label: 'ส่งสำเร็จ', icon: <CheckCircle2 size={14} /> },
  ]

  const getCurrentStepIndex = (status: string) => {
    const s = status?.toLowerCase()
    if (['delivered', 'completed', 'complete', 'success'].includes(s)) return 4
    if (s === 'in transit' || s === 'en route' || s === 'en-route' || s === 'arrived') return 3
    if (s === 'picked up') return 2
    if (s === 'assigned') return 1
    return 0
  }

  // Financial Helpers
  const priceCust = Number(selectedJob?.priceCustTotal || 0)
  const costDriver = Number(selectedJob?.costDriverTotal || 0)
  const netMargin = priceCust - costDriver

  let extraCostsList: any[] = []
  if (selectedJob?.extraCostsJson) {
    try {
      const parsed = typeof selectedJob.extraCostsJson === 'string'
        ? JSON.parse(selectedJob.extraCostsJson)
        : selectedJob.extraCostsJson
      if (Array.isArray(parsed)) extraCostsList = parsed
    } catch {}
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] gap-6 overflow-hidden bg-background">
      
      {/* LEFT PANEL: Radar Control */}
      <div className="w-full lg:w-[350px] flex flex-col gap-4 overflow-hidden shrink-0">
        <div className="p-1 rounded-2xl bg-muted/30 border border-border/40 shadow-sm">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
            <Input 
              placeholder="SEARCH ID / SO..." 
              className="pl-12 h-12 bg-transparent border-none font-bold uppercase tracking-widest text-xs rounded-xl focus-visible:ring-0"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
            />
            {(isSearching || isLoadingDetails) && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-10">
          <div className="flex items-center justify-between px-2 py-2">
             <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] italic flex items-center gap-2">
                <Activity size={12} className="text-primary animate-pulse" /> LIVE RADAR
             </h3>
             <button onClick={() => router.refresh()} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><RefreshCw size={12} /></button>
          </div>

          {activeJobs.map((job) => (
            <div 
              key={job.jobId}
              onClick={() => selectJobFromRadar(job)}
              className={cn(
                "group cursor-pointer p-4 rounded-2xl border transition-all duration-300 relative",
                selectedJob?.jobId === job.jobId 
                ? "bg-primary/5 border-primary/40 shadow-md" 
                : "bg-card border-border/40 hover:border-primary/20 hover:bg-muted/50"
              )}
            >
              {selectedJob?.jobId === job.jobId && <div className="absolute left-0 top-3 bottom-3 w-1 bg-primary rounded-r-full" />}
              <div className="flex justify-between items-start mb-2">
                <span className={cn("text-xs font-black tracking-tighter uppercase font-display", selectedJob?.jobId === job.jobId ? "text-primary" : "text-foreground")}>
                  {job.jobId}
                </span>
                <Badge className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 bg-muted text-muted-foreground border-none">
                  {job.status}
                </Badge>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase truncate">
                  <MapPin size={10} className="text-primary/50" />
                  <span className="truncate">{job.destination}</span>
                </div>
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
                      <Truck size={10} /> <span>{job.vehiclePlate}</span>
                   </div>
                   <ChevronRight size={12} className={cn("transition-all", selectedJob?.jobId === job.jobId ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2")} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL: Unified Mission Command Center */}
      <div className="flex-1 overflow-y-auto custom-scrollbar rounded-3xl border border-border/40 bg-card/30 shadow-xl relative overflow-x-hidden">
        {!selectedJob ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12">
                <div className="w-24 h-24 rounded-full bg-primary/5 flex items-center justify-center mb-8 relative">
                    <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full animate-pulse" />
                    <Navigation size={40} className="text-primary/40 relative z-10" />
                </div>
                <h3 className="text-xl font-black text-foreground uppercase tracking-tight italic">COMMAND INTERFACE READY</h3>
                <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.4em] mt-2">SELECT A VECTOR TO BEGIN TRACKING</p>
            </div>
        ) : (
            <div className="flex flex-col min-h-full">
                {/* 1. Header & Navigation */}
                <div className="p-8 lg:p-10 border-b border-border/40 bg-muted/10">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                        <div className="space-y-6 flex-1 min-w-0">
                            <div className="flex items-center gap-4">
                                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-black italic uppercase tracking-widest">
                                    MISSION_ACTIVE
                                </Badge>
                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] opacity-40">UTC_SYNC: OK</span>
                                
                                {/* Unified Action Controls */}
                                {!customerMode && (
                                    <div className="flex items-center gap-3 ml-4 pl-4 border-l border-border/40">
                                        <LineShareButton job={{
                                            Job_ID: selectedJob.jobId,
                                            Customer_Name: selectedJob.customerName,
                                            Job_Status: selectedJob.status
                                        }} />
                                        <AdminJobActions jobId={selectedJob.jobId} currentStatus={selectedJob.status} />
                                    </div>
                                )}
                            </div>
                            <h1 className="text-2xl md:text-4xl lg:text-5xl font-black text-foreground tracking-tighter uppercase italic leading-none font-display break-all">
                                {selectedJob.jobId}
                            </h1>
                            <div className="flex flex-wrap items-center gap-6 text-xs font-black text-muted-foreground uppercase tracking-widest italic">
                                <div className="flex items-center gap-2"><User size={14} className="text-primary" /> {selectedJob.driverName}</div>
                                <div className="flex items-center gap-2"><Smartphone size={14} className="text-primary" /> {selectedJob.vehiclePlate}</div>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-3 shrink-0">
                             <StatusBadge status={selectedJob.status} />
                             <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest italic flex items-center gap-2">
                                <Clock size={12} className="text-emerald-500" /> LAST PING: {new Date().toLocaleTimeString('th-TH', { hour12: false })}
                             </div>
                        </div>
                    </div>
                </div>

                {/* 2. Operational Telemetry (Map & Stepper) */}
                <div className="p-8 lg:p-10 space-y-10">
                    <div className="aspect-[21/9] rounded-[2rem] border border-border/40 overflow-hidden shadow-lg relative min-h-[350px]">
                        <TrackingMap 
                            lastLocation={selectedJob.lastLocation}
                            driverName={selectedJob.driverName}
                            status={selectedJob.status}
                            pickup={{ lat: selectedJob.pickupLat ?? null, lng: selectedJob.pickupLon ?? null, name: selectedJob.origin }}
                            dropoff={{ lat: selectedJob.dropoffLat ?? null, lng: selectedJob.dropoffLon ?? null, name: selectedJob.destination }}
                        />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 relative py-6">
                        <div className="absolute top-1/2 left-10 right-10 h-0.5 bg-muted -translate-y-1/2 z-0 hidden md:block" />
                        {(() => {
                            const currentIdx = getCurrentStepIndex(selectedJob.status)
                            return steps.map((step, idx) => {
                                const isCompleted = idx <= currentIdx
                                const isCurrent = idx === currentIdx
                                return (
                                    <div key={step.key} className="relative z-10 flex flex-col items-center gap-3">
                                        <div className={cn(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border-2",
                                            isCurrent ? "bg-primary border-primary text-white scale-110 shadow-lg" :
                                            isCompleted ? "bg-emerald-500 border-emerald-500 text-white shadow-sm" :
                                            "bg-card border-border text-muted-foreground opacity-40"
                                        )}>
                                            {step.icon}
                                        </div>
                                        <p className={cn("text-[9px] font-black uppercase tracking-widest", isCurrent ? "text-primary" : isCompleted ? "text-emerald-600" : "text-muted-foreground opacity-40")}>
                                            {step.label}
                                        </p>
                                    </div>
                                )
                            })
                        })()}
                    </div>

                    {/* 3. Deep Mission Intelligence (Stair Climbing & Evidence) */}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                        
                        {/* Left Matrix: Operational Specs */}
                        <div className="xl:col-span-8 space-y-8">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <InfoCard label="INCEPTION POINT" value={selectedJob.origin} icon={<Target size={16} />} color="primary" />
                                <InfoCard label="TERMINATION POINT" value={selectedJob.destination} icon={<MapPin size={16} />} color="indigo" />
                             </div>

                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <MetricBox icon={<Box size={14} />} label="CARGO" value={selectedJob.cargoType || 'GENERAL'} />
                                <MetricBox icon={<Scale size={14} />} label="WEIGHT" value={`${selectedJob.weight?.toLocaleString() || '0'} KG`} />
                                <MetricBox icon={<Layers size={14} />} label="VOLUME" value={`${selectedJob.volume?.toLocaleString() || '0'} CBM`} />
                                <MetricBox icon={<Info size={14} />} label="ASSET" value={selectedJob.vehicleType || '-'} />
                             </div>

                             {/* Stair Incentive Module (Integrated from Detail Page) */}
                             {(selectedJob.incentiveClaimed || selectedJob.requiresIncentiveCheck) && (
                                <PremiumCard className={cn(
                                    "border rounded-3xl overflow-hidden shadow-md bg-muted/10",
                                    selectedJob.sensorVerified === 'Verified' ? 'border-emerald-500/20' : 'border-amber-500/20'
                                )}>
                                    <div className="p-6 border-b border-border/40 flex items-center justify-between bg-muted/20">
                                        <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 italic">
                                            <Layers size={14} className="text-primary" /> ตรวจขึ้นชั้น 2-3 (SENSOR DATA)
                                        </h3>
                                        <Badge className={cn("text-[8px] font-black uppercase", selectedJob.sensorVerified === 'Verified' ? "bg-emerald-500" : "bg-amber-500")}>
                                            {selectedJob.sensorVerified === 'Verified' ? 'VERIFIED' : 'PENDING'}
                                        </Badge>
                                    </div>
                                    <div className="p-6 space-y-8">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-3">
                                                <div className="flex justify-between text-[10px] font-black text-muted-foreground uppercase">
                                                    <span>ผลต่างความสูงสะสม</span>
                                                    <span className="text-foreground">{selectedJob.sensorMaxElevationDiff?.toFixed(2) || '0.00'} / 2.8ม.</span>
                                                </div>
                                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${Math.min(((selectedJob.sensorMaxElevationDiff || 0) / 2.8) * 100, 100)}%` }} />
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex justify-between text-[10px] font-black text-muted-foreground uppercase">
                                                    <span>ก้าวเดินขึ้นบันได</span>
                                                    <span className="text-foreground">{selectedJob.sensorTotalStepsUpward || '0'} / 15ก้าว</span>
                                                </div>
                                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                    <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${Math.min(((selectedJob.sensorTotalStepsUpward || 0) / 15) * 100, 100)}%` }} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Admin Override Controls */}
                                        {!customerMode && (
                                            <div className="pt-6 border-t border-border/40 space-y-4">
                                                <div className="flex items-center gap-2">
                                                    <ShieldCheck size={12} className="text-primary" />
                                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Command Override Panel</span>
                                                </div>
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm('ยืนยันการอนุมัติจ่ายเงินพิเศษ?')) {
                                                                const { adminOverrideSensorVerification } = await import('@/app/admin/jobs/actions')
                                                                const res = await adminOverrideSensorVerification(selectedJob.jobId, 'Verified', '[แอดมินยืนยันผ่าน Tracking Hub]')
                                                                if (res.success) selectJobFromRadar(selectedJob)
                                                            }
                                                        }}
                                                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                                                    >
                                                        อนุมัติจ่ายเงิน
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm('ระบุเป็นข้อมูลต้องสงสัย?')) {
                                                                const { adminOverrideSensorVerification } = await import('@/app/admin/jobs/actions')
                                                                const res = await adminOverrideSensorVerification(selectedJob.jobId, 'Suspect', '[แอดมินระบุต้องสงสัยผ่าน Tracking Hub]')
                                                                if (res.success) selectJobFromRadar(selectedJob)
                                                            }
                                                        }}
                                                        className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                                                    >
                                                        ปฏิเสธการจ่าย
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </PremiumCard>
                             )}

                             {/* Evidence Matrix */}
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <EvidenceBox label="PICKUP PROOF" photos={selectedJob.pickupPhotos} signature={selectedJob.pickupSignature} phase="P-01" />
                                <EvidenceBox label="DELIVERY PROOF" photos={selectedJob.podPhotos} signature={selectedJob.signature} phase="P-02" />
                             </div>
                        </div>

                        {/* Right Matrix: Financial Ledger & Actions */}
                        <div className="xl:col-span-4 space-y-8">
                             <PremiumCard className="rounded-3xl border-border/40 shadow-lg overflow-hidden flex flex-col">
                                <div className="p-6 border-b border-border/40 bg-muted/20">
                                    <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 italic text-emerald-600">
                                        <DollarSign size={14} /> FINANCIAL LEDGER
                                    </h3>
                                </div>
                                <div className="p-6 space-y-4">
                                    <LedgerRow label="ค่าขนส่งหลัก" cust={selectedJob.priceCustBase} driver={selectedJob.costDriverBase} />
                                    {extraCostsList.map((c, i) => (
                                        <LedgerRow key={i} label={`└ ${c.type || 'อื่นๆ'}`} cust={c.charge_cust} driver={c.cost_driver} sub />
                                    ))}
                                    <div className="pt-4 border-t border-border/40 space-y-3">
                                        <div className="flex justify-between text-xs font-black uppercase italic">
                                            <span className="text-muted-foreground">TOTAL REVENUE</span>
                                            <span className="text-emerald-600 font-display text-base">฿{priceCust.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-[10px] font-bold uppercase italic border-b border-border/40 pb-3">
                                            <span className="text-muted-foreground opacity-60">DRIVER PAYOUT</span>
                                            <span className="text-rose-500">฿{costDriver.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-black text-foreground uppercase tracking-widest italic">NET MARGIN</span>
                                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-lg font-black font-display italic">
                                                ฿{netMargin.toLocaleString()}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6 bg-muted/10 border-t border-border/40 space-y-4">
                                    <PODDownloadButton job={selectedJob} />
                                    <button className="w-full h-12 bg-primary hover:bg-primary/90 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest italic flex items-center justify-center gap-3 transition-all shadow-lg shadow-primary/10">
                                        <Phone size={14} /> CONNECT OPERATOR UPLINK
                                    </button>
                                </div>
                             </PremiumCard>

                             {selectedJob.notes && (
                                <div className="p-6 bg-amber-500/5 rounded-3xl border border-amber-500/10 space-y-3">
                                    <div className="flex items-center gap-2 text-[10px] font-black text-amber-600 uppercase tracking-widest italic">
                                        <Info size={12} /> TACTICAL NOTES
                                    </div>
                                    <p className="text-xs font-medium text-foreground/70 italic leading-relaxed">{selectedJob.notes}</p>
                                </div>
                             )}

                             {getCurrentStepIndex(selectedJob.status) === 4 && (
                                <div className="animate-in fade-in slide-in-from-bottom-5">
                                    <FeedbackForm jobId={selectedJob.jobId} />
                                </div>
                             )}
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
    const s = status?.toLowerCase()
    let color = "bg-muted text-muted-foreground"
    if (['delivered', 'completed', 'complete', 'success'].includes(s)) color = "bg-emerald-500 text-white shadow-emerald-500/20"
    else if (['assigned', 'picked up', 'in transit', 'en route', 'arrived'].includes(s)) color = "bg-primary text-white shadow-primary/20 animate-pulse"
    else if (['failed', 'cancelled'].includes(s)) color = "bg-rose-500 text-white"

    return (
        <Badge className={cn("px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest italic border-none shadow-lg", color)}>
            {status.toUpperCase()}
        </Badge>
    )
}

function InfoCard({ label, value, icon, color }: { label: string, value: string, icon: any, color: "primary" | "indigo" }) {
    return (
        <div className="p-6 bg-card border border-border/40 rounded-[2rem] shadow-sm relative overflow-hidden group">
            <div className={cn("absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity", color === 'primary' ? "text-primary" : "text-indigo-500")}>
                {icon}
            </div>
            <p className={cn("text-[9px] font-black uppercase tracking-[0.25em] mb-3 italic", color === 'primary' ? "text-primary" : "text-indigo-500")}>{label}</p>
            <p className="text-lg font-black text-foreground tracking-tighter uppercase italic leading-tight">{value}</p>
        </div>
    )
}

function MetricBox({ icon, label, value }: { icon: any, label: string, value: string }) {
    return (
        <div className="p-4 bg-muted/20 border border-border/40 rounded-2xl flex flex-col items-center gap-2 text-center">
            <div className="text-primary/60">{icon}</div>
            <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">{label}</span>
            <span className="text-xs font-black uppercase italic text-foreground">{value}</span>
        </div>
    )
}

function LedgerRow({ label, cust, driver, sub }: { label: string, cust: any, driver: any, sub?: boolean }) {
    return (
        <div className={cn("flex justify-between items-center text-[11px]", sub ? "pl-2 opacity-70 italic" : "font-bold text-muted-foreground")}>
            <span>{label}</span>
            <div className="flex gap-6 font-mono font-black">
                <span className="text-emerald-600">฿{(Number(cust) || 0).toLocaleString()}</span>
                <span className="text-rose-500">฿{(Number(driver) || 0).toLocaleString()}</span>
            </div>
        </div>
    )
}

function EvidenceBox({ label, photos, signature, phase }: { label: string, photos: string[], signature: string | null, phase: string }) {
    return (
        <div className="p-6 bg-muted/10 border border-border/40 rounded-[2rem] space-y-5">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest italic">{label}</p>
                <Badge variant="outline" className="text-[8px] border-border/40 font-black opacity-40 uppercase tracking-widest">{phase}</Badge>
            </div>
            <div className="flex flex-wrap gap-3">
                {photos.map((p, i) => (
                    <div key={i} className="w-16 h-16 rounded-2xl border border-border shadow-sm overflow-hidden bg-black relative group/img cursor-pointer">
                        <Image src={p} alt="Proof" fill className="object-cover group-hover/img:scale-110 transition-transform" />
                        <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center"><Eye size={16} className="text-white" /></div>
                    </div>
                ))}
                {signature && (
                    <div className="w-16 h-16 rounded-2xl border border-border shadow-sm overflow-hidden bg-white p-1 relative flex items-center justify-center">
                        <Image src={signature} alt="Sig" fill className="object-contain" />
                    </div>
                )}
                {photos.length === 0 && !signature && (
                    <div className="h-16 flex items-center px-4 bg-muted/40 rounded-2xl border border-dashed border-border/60">
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest italic opacity-40">WAITING_INTEL</p>
                    </div>
                )}
            </div>
        </div>
    )
}
