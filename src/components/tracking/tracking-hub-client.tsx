"use client"

import { useState, useEffect, useTransition, useMemo } from "react"
import { 
  Search, Package, Truck, MapPin, Clock, ChevronRight, Loader2,
  Activity, Navigation, ExternalLink, ShieldCheck, Target, Cpu, 
  Layers, TrendingUp, AlertTriangle, Info, DollarSign, User, 
  CheckCircle2, Calendar, Phone, Smartphone, Box, Scale, Maximize2, 
  RefreshCw, ArrowRight, Eye, PenTool, ArrowLeft, Send
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
import { LineShareButton } from "@/components/admin/line-share-button"
import { AdminJobActions } from "@/components/admin/admin-job-actions"

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
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'NEW'>('ACTIVE')

  // Sync with URL & Initial Load
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) handleSearch(q)
  }, [searchParams]) 

  useEffect(() => {
    setActiveJobs(initialActiveJobs)
  }, [initialActiveJobs])

  // Categorize Jobs
  const categorizedJobs = useMemo(() => {
    return {
        NEW: activeJobs.filter(j => ['New', 'Assigned', 'Pending'].includes(j.status)),
        ACTIVE: activeJobs.filter(j => !['New', 'Assigned', 'Pending'].includes(j.status))
    }
  }, [activeJobs])

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
  // Ensure we fall back to 0 if undefined, or to total if base is missing but total exists.
  const priceCustTotal = Number(selectedJob?.priceCustTotal || 0)
  const costDriverTotal = Number(selectedJob?.costDriverTotal || 0)
  const priceCustBase = Number(selectedJob?.priceCustBase || priceCustTotal) // Fallback to total if base is 0
  const costDriverBase = Number(selectedJob?.costDriverBase || costDriverTotal) // Fallback to total if base is 0
  const netMargin = priceCustTotal - costDriverTotal

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

        {/* Status Tabs */}
        <div className="flex bg-muted/20 p-1 rounded-xl border border-border/40">
            <button 
                onClick={() => setActiveTab('ACTIVE')}
                className={cn(
                    "flex-1 py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === 'ACTIVE' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
            >
                <div className="flex items-center justify-center gap-2">
                    <Activity size={10} className={activeTab === 'ACTIVE' ? "animate-pulse" : ""} />
                    Active Fleet ({categorizedJobs.ACTIVE.length})
                </div>
            </button>
            <button 
                onClick={() => setActiveTab('NEW')}
                className={cn(
                    "flex-1 py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    activeTab === 'NEW' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
            >
                <div className="flex items-center justify-center gap-2">
                    <Package size={10} />
                    New Missions ({categorizedJobs.NEW.length})
                </div>
            </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-10">
          <div className="flex items-center justify-between px-2 py-2">
             <h3 className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em] italic">
                {activeTab === 'ACTIVE' ? 'REAL-TIME TRACKING' : 'PENDING DISPATCH'}
             </h3>
             <button onClick={() => router.refresh()} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><RefreshCw size={12} /></button>
          </div>

          {(activeTab === 'ACTIVE' ? categorizedJobs.ACTIVE : categorizedJobs.NEW).map((job) => (
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
                  {job.jobId.split(',')[0]}
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

          {(activeTab === 'ACTIVE' ? categorizedJobs.ACTIVE : categorizedJobs.NEW).length === 0 && (
            <div className="py-20 text-center opacity-30">
                <p className="text-[9px] font-black uppercase tracking-widest italic">NO {activeTab} UNITS FOUND</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Unified Mission Command Center */}
      <div className="flex-1 overflow-y-auto custom-scrollbar rounded-3xl border border-border/40 bg-card shadow-xl relative overflow-x-hidden">
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
                                        }} variant="icon" />
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
                            vehiclePlate={selectedJob.vehiclePlate}
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
                                    "border-2 rounded-3xl overflow-hidden shadow-xl bg-card",
                                    selectedJob.sensorVerified === 'Verified' ? 'border-emerald-500/20' : 'border-amber-500/20'
                                )}>
                                    <div className="p-8 border-b border-border/40 flex items-center justify-between bg-muted/10">
                                        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3 italic">
                                            <Layers size={18} className="text-primary" /> ตรวจขึ้นชั้น 2-3 (SENSOR DATA)
                                        </h3>
                                        <Badge className={cn("px-4 py-1.5 text-xs font-black uppercase", selectedJob.sensorVerified === 'Verified' ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")}>
                                            {selectedJob.sensorVerified === 'Verified' ? 'VERIFIED' : 'PENDING'}
                                        </Badge>
                                    </div>
                                    <div className="p-8 space-y-10">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                            <div className="space-y-4">
                                                <div className="flex justify-between text-xs font-black text-muted-foreground uppercase tracking-widest">
                                                    <span>ผลต่างความสูงสะสม (เมตร)</span>
                                                    <span className="text-foreground text-sm">ปัจจุบัน {selectedJob.sensorMaxElevationDiff?.toFixed(2) || '0.00'} / <span className="text-primary opacity-60">เป้าหมาย 2.8</span></span>
                                                </div>
                                                <div className="h-3 bg-muted rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${Math.min(((selectedJob.sensorMaxElevationDiff || 0) / 2.8) * 100, 100)}%` }} />
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <div className="flex justify-between text-xs font-black text-muted-foreground uppercase tracking-widest">
                                                    <span>ก้าวเดินขึ้นบันได (ก้าว)</span>
                                                    <span className="text-foreground text-sm">ปัจจุบัน {selectedJob.sensorTotalStepsUpward || '0'} / <span className="text-primary opacity-60">เป้าหมาย 15</span></span>
                                                </div>
                                                <div className="h-3 bg-muted rounded-full overflow-hidden">
                                                    <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${Math.min(((selectedJob.sensorTotalStepsUpward || 0) / 15) * 100, 100)}%` }} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Admin Override Controls */}
                                        {!customerMode && (
                                            <div className="pt-8 border-t border-border/40 space-y-5">
                                                <div className="flex items-center gap-2">
                                                    <ShieldCheck size={14} className="text-primary" />
                                                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">MISSION OVERRIDE PROTOCOL</span>
                                                </div>
                                                <div className="flex gap-4">
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm('ยืนยันการอนุมัติจ่ายเงินพิเศษ?')) {
                                                                const { adminOverrideSensorVerification } = await import('@/app/admin/jobs/actions')
                                                                const res = await adminOverrideSensorVerification(selectedJob.jobId, 'Verified', '[แอดมินยืนยันผ่าน Tracking Hub]')
                                                                if (res.success) selectJobFromRadar(selectedJob)
                                                            }
                                                        }}
                                                        className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20"
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
                                                        className="flex-1 py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-rose-500/20"
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
                             <PremiumCard className="rounded-[2.5rem] border-2 border-border/40 shadow-xl overflow-hidden flex flex-col bg-card">
                                <div className="p-8 border-b border-border/40 bg-muted/10">
                                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3 italic text-emerald-600">
                                        <DollarSign size={18} /> FINANCIAL LEDGER
                                    </h3>
                                </div>
                                <div className="p-8 space-y-6">
                                    <LedgerRow label="ค่าขนส่งหลัก" cust={priceCustBase} driver={costDriverBase} />
                                    {extraCostsList.map((c, i) => {
                                        // Auto-translate common extra costs if possible
                                        let displayType = c.type || 'อื่นๆ'
                                        if (displayType === 'labor') displayType = 'ค่าแรงลงของ'
                                        if (displayType === 'wait') displayType = 'ค่าเสียเวลา'
                                        if (displayType === 'return') displayType = 'ค่าตีกลับ'
                                        if (displayType === 'fuel') displayType = 'ค่าปรับน้ำมัน'
                                        if (displayType === 'trailer') displayType = 'ค่าพ่วง'
                                        return <LedgerRow key={i} label={`└ ${displayType}`} cust={c.charge_cust} driver={c.cost_driver} sub />
                                    })}
                                    <div className="pt-6 border-t-2 border-border/40 space-y-5">
                                        <div className="flex justify-between text-xs font-black uppercase italic tracking-wider">
                                            <span className="text-muted-foreground">TOTAL REVENUE</span>
                                            <span className="text-emerald-600 font-display text-xl">฿{priceCustTotal.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-xs font-bold uppercase italic border-b border-border/40 pb-5 tracking-wider">
                                            <span className="text-muted-foreground opacity-60">DRIVER PAYOUT</span>
                                            <span className="text-rose-500 font-display text-lg">฿{costDriverTotal.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-muted/20 p-4 rounded-2xl">
                                            <span className="text-xs font-black text-foreground uppercase tracking-[0.2em] italic">NET MARGIN</span>
                                            <Badge className={cn("text-white border-none text-2xl font-black font-display italic px-6 py-2 rounded-xl shadow-xl", netMargin >= 0 ? "bg-emerald-500" : "bg-rose-500")}>
                                                ฿{netMargin.toLocaleString()}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-8 bg-muted/10 border-t border-border/40 space-y-4">
                                    <PODDownloadButton job={selectedJob} />
                                    <button className="w-full h-16 bg-primary hover:bg-primary/90 text-white rounded-3xl text-xs font-black uppercase tracking-widest italic flex items-center justify-center gap-3 transition-all shadow-2xl shadow-primary/20">
                                        <Phone size={18} /> CONNECT OPERATOR UPLINK
                                    </button>
                                </div>
                             </PremiumCard>

                             {selectedJob.notes && (
                                <div className="p-8 bg-amber-500/5 rounded-[2.5rem] border border-amber-500/20 space-y-4">
                                    <div className="flex items-center gap-2 text-[10px] font-black text-amber-600 uppercase tracking-widest italic">
                                        <Info size={14} /> TACTICAL NOTES
                                    </div>
                                    <p className="text-sm font-bold text-foreground/80 italic leading-relaxed">{selectedJob.notes}</p>
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
        <Badge className={cn("px-8 py-3 rounded-2xl text-sm font-black uppercase tracking-widest italic border-none shadow-xl", color)}>
            {status.toUpperCase()}
        </Badge>
    )
}

function InfoCard({ label, value, icon, color }: { label: string, value: string, icon: any, color: "primary" | "indigo" }) {
    return (
        <div className="p-8 bg-card border-2 border-border/40 rounded-[2.5rem] shadow-sm relative overflow-hidden group">
            <div className={cn("absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity", color === 'primary' ? "text-primary" : "text-indigo-500")}>
                {icon}
            </div>
            <p className={cn("text-[10px] font-black uppercase tracking-[0.3em] mb-4 italic", color === 'primary' ? "text-primary" : "text-indigo-500")}>{label}</p>
            <p className="text-xl font-black text-foreground tracking-tighter uppercase italic leading-tight">{value}</p>
        </div>
    )
}

function MetricBox({ icon, label, value }: { icon: any, label: string, value: string }) {
    return (
        <div className="p-5 bg-muted/20 border-2 border-border/40 rounded-3xl flex flex-col items-center gap-3 text-center transition-all hover:bg-muted/30">
            <div className="text-primary/60">{icon}</div>
            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-60">{label}</span>
            <span className="text-sm font-black uppercase italic text-foreground">{value}</span>
        </div>
    )
}

function LedgerRow({ label, cust, driver, sub }: { label: string, cust: any, driver: any, sub?: boolean }) {
    return (
        <div className={cn("flex justify-between items-center text-xs", sub ? "pl-4 opacity-70 italic font-bold" : "font-black text-muted-foreground tracking-wide uppercase")}>
            <span>{label}</span>
            <div className="flex gap-8 font-mono font-black">
                <span className="text-emerald-600">฿{(Number(cust) || 0).toLocaleString()}</span>
                <span className="text-rose-500">฿{(Number(driver) || 0).toLocaleString()}</span>
            </div>
        </div>
    )
}

function EvidenceBox({ label, photos, signature, phase }: { label: string, photos: string[], signature: string | null, phase: string }) {
    return (
        <div className="p-8 bg-muted/10 border-2 border-border/40 rounded-[2.5rem] space-y-6">
            <div className="flex items-center justify-between">
                <p className="text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] italic">{label}</p>
                <Badge variant="outline" className="px-3 py-1 text-[9px] border-border/60 font-black opacity-60 uppercase tracking-widest">{phase}</Badge>
            </div>
            <div className="flex flex-wrap gap-4">
                {photos.map((p, i) => (
                    <div key={i} className="w-20 h-20 rounded-2xl border-2 border-border shadow-md overflow-hidden bg-black relative group/img cursor-pointer transition-transform hover:scale-110">
                        <Image src={p} alt="Proof" fill className="object-cover group-hover/img:scale-110 transition-transform duration-700" />
                        <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center"><Eye size={20} className="text-white" /></div>
                    </div>
                ))}
                {signature && (
                    <div className="w-20 h-20 rounded-2xl border-2 border-border shadow-md overflow-hidden bg-white p-2 relative flex items-center justify-center transition-transform hover:scale-110">
                        <Image src={signature} alt="Sig" fill className="object-contain" />
                    </div>
                )}
                {photos.length === 0 && !signature && (
                    <div className="h-20 flex items-center px-6 bg-muted/40 rounded-2xl border-2 border-dashed border-border/60">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest italic opacity-40">AWAITING_INTEL</p>
                    </div>
                )}
            </div>
        </div>
    )
}
