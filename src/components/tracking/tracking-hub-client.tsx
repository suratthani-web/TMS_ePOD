"use client"

import { useState, useEffect, useTransition } from "react"
import { 
  Search, 
  Package, 
  Truck, 
  MapPin, 
  Clock, 
  ChevronRight, 
  Loader2,
  Activity,
  Navigation,
  ExternalLink,
  ShieldCheck,
  Target,
  User,
  CheckCircle2,
  Calendar,
  X,
  Smartphone,
  Phone,
  ArrowRight,
  Maximize2,
  RefreshCw,
  Box,
  Scale,
  Layers,
  Map,
  Info
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { PremiumCard } from "@/components/ui/premium-card"
import { TrackingMap } from "@/components/tracking/tracking-map"
import { PODDownloadButton } from "@/components/tracking/pod-download"
import { FeedbackForm } from "@/components/tracking/feedback-form"
import { getPublicJobDetails, PublicJobDetails, getActiveJobs } from "@/lib/actions/tracking-actions"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"

interface TrackingHubClientProps {
  initialActiveJobs: PublicJobDetails[]
  customerMode?: boolean
}

export function TrackingHubClient({ initialActiveJobs, customerMode = false }: TrackingHubClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeJobs, setActiveJobs] = useState<PublicJobDetails[]>(initialActiveJobs)
  const [selectedJob, setSelectedJob] = useState<PublicJobDetails | null>(null)
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
  const [isSearching, startSearch] = useTransition()
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  // Handle Initial Search from URL
  useEffect(() => {
    const q = searchParams.get('q')
    if (q) {
        handleSearch(q)
    }
    setIsLoaded(true)
  }, [])

  // Update activeJobs when initialActiveJobs changes (e.g. after branch switch)
  useEffect(() => {
    setActiveJobs(initialActiveJobs)
  }, [initialActiveJobs])

  const handleSearch = async (query: string) => {
    if (!query.trim()) return
    
    startSearch(async () => {
        const result = await getPublicJobDetails(query)
        if (result) {
            setSelectedJob(result)
            // If it's not in the active list, add it temporarily
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
        // Fetch full details including latest GPS for the clicked job
        const fullJob = await getPublicJobDetails(job.jobId)
        if (fullJob) {
            setSelectedJob(fullJob)
        } else {
            setSelectedJob(job) // Fallback to basic info
        }
    } catch (err) {
        setSelectedJob(job)
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

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-160px)] gap-6 overflow-hidden">
      {/* LEFT PANEL: Search & Active List */}
      <div className="w-full lg:w-96 flex flex-col gap-4 overflow-hidden shrink-0">
        <div className="p-1 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-3xl shadow-2xl">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-all duration-300" size={18} />
            <Input 
              placeholder="SEARCH JOB ID / SO..." 
              className="pl-12 h-14 bg-transparent border-none font-black uppercase tracking-[0.1em] text-sm rounded-xl focus-visible:ring-0 placeholder:text-muted-foreground/30"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(searchQuery)}
            />
            {(isSearching || isLoadingDetails) && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2 pb-10">
          <div className="flex items-center justify-between px-3 py-2">
             <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                <h3 className="text-[11px] font-black text-foreground/80 uppercase tracking-[0.3em] italic">TODAY&apos;S MISSIONS</h3>
             </div>
             <button 
                onClick={() => router.refresh()} 
                className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-primary transition-colors"
                title="Sync Branch Data"
             >
                <RefreshCw size={14} className={isSearching ? "animate-spin" : ""} />
             </button>
          </div>

          {activeJobs.map((job) => {
            const isSelected = selectedJob?.jobId === job.jobId;
            return (
                <div 
                  key={job.jobId}
                  onClick={() => selectJobFromRadar(job)}
                  className={cn(
                    "group cursor-pointer p-5 rounded-[2rem] border transition-all duration-700 relative overflow-hidden",
                    isSelected 
                    ? "bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border-primary/40 shadow-2xl shadow-primary/20 scale-[1.02] z-10" 
                    : "bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.05] grayscale hover:grayscale-0"
                  )}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col">
                        <span className={cn(
                            "text-sm font-black tracking-tighter uppercase transition-all duration-500 font-display italic",
                            isSelected ? "text-primary scale-110 origin-left" : "text-foreground"
                        )}>
                          {job.jobId}
                        </span>
                        <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1 opacity-50">{job.customerName}</span>
                    </div>
                    <Badge variant={isSelected ? "default" : "outline"} className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border-none",
                        isSelected ? "bg-primary text-foreground shadow-lg" : "bg-white/5 text-muted-foreground"
                    )}>
                      {job.status}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-[10px] font-black text-muted-foreground/80 uppercase tracking-widest">
                      <div className="p-1.5 rounded-lg bg-white/5">
                        <MapPin size={12} className="text-primary/60" />
                      </div>
                      <span className="truncate flex-1">{job.destination}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-[10px] font-black text-muted-foreground/80 uppercase tracking-widest">
                        <div className="p-1.5 rounded-lg bg-white/5">
                            <Truck size={12} />
                        </div>
                        <span>{job.vehiclePlate}</span>
                      </div>
                      <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center transition-all duration-700",
                          isSelected ? "bg-primary text-foreground rotate-0 scale-100" : "bg-white/5 text-muted-foreground -rotate-45 scale-75 opacity-0"
                      )}>
                        <ArrowRight size={16} />
                      </div>
                    </div>
                  </div>
                </div>
            )
          })}

          {activeJobs.length === 0 && (
            <div className="py-24 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 border border-dashed border-white/10 flex items-center justify-center mx-auto mb-6">
                    <Package className="text-muted-foreground/20" size={32} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/40 italic">NO MISSIONS FOUND TODAY</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Details & Map */}
      <div className="flex-1 overflow-y-auto custom-scrollbar rounded-[2.5rem] border border-white/10 bg-black/40 backdrop-blur-3xl relative shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden">
        {!selectedJob ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 relative">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />
                <div className="w-48 h-48 rounded-full border border-white/5 flex items-center justify-center relative mb-12">
                    <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full animate-pulse" />
                    <div className="absolute inset-0 border-2 border-primary/20 rounded-full animate-[ping_3s_linear_infinite]" />
                    <Navigation size={64} className="text-primary/60 relative z-10 animate-bounce" />
                </div>
                <div className="space-y-4 relative z-10">
                    <h3 className="text-4xl font-black text-foreground uppercase tracking-tighter italic premium-text-gradient">COMM_HUB READY</h3>
                    <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.5em] opacity-40 italic">SELECT AN ACTIVE VECTOR TO INITIATE TRACKING</p>
                </div>
            </div>
        ) : (
            <div className="min-h-full flex flex-col">
                {/* Visual Header */}
                <div className="p-8 lg:p-12 pb-0 flex flex-col sm:flex-row justify-between items-start gap-8">
                    <div className="space-y-6 w-full max-w-[80%]">
                        <div className="flex items-center gap-4">
                            <div className="px-4 py-1.5 bg-primary/20 rounded-full border border-primary/30 text-[10px] font-black text-primary uppercase tracking-[0.2em] italic flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                LIVE SIGNAL_ESTABLISHED
                            </div>
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] italic opacity-30">TRACKING_UID: {selectedJob.jobId.slice(-8)}</span>
                        </div>
                        <h1 className="text-3xl lg:text-5xl font-black text-foreground tracking-tighter uppercase italic leading-[1.1] font-display break-all">
                            {selectedJob.jobId}
                        </h1>
                        <div className="flex flex-wrap items-center gap-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                                    <User size={16} className="text-primary" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-50">OPERATOR</span>
                                    <span className="text-xs font-black uppercase tracking-tight italic">{selectedJob.driverName}</span>
                                </div>
                            </div>
                            <div className="w-px h-8 bg-white/10" />
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-white/5 border border-white/5">
                                    <Smartphone size={16} className="text-primary" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-50">ASSET_PLATE</span>
                                    <span className="text-xs font-black uppercase tracking-tight italic">{selectedJob.vehiclePlate}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-4 shrink-0">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] mb-2 opacity-40">MISSION_STATUS</span>
                            <Badge className="px-8 py-3 rounded-[1.5rem] text-lg font-black uppercase tracking-[0.1em] italic border-2 shadow-2xl bg-primary text-foreground border-white/10 hover:bg-primary/80 transition-all">
                                {selectedJob.status}
                            </Badge>
                        </div>
                        <div className="text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest italic flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/5">
                            <Clock size={12} className="text-emerald-500" />
                            UPLINK: {new Date().toLocaleTimeString('th-TH', { hour12: false })}
                        </div>
                    </div>
                </div>

                {/* Map View */}
                <div className="mt-12 mx-8 lg:mx-12 aspect-[21/9] rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl relative group min-h-[300px]">
                    <TrackingMap 
                        lastLocation={selectedJob.lastLocation || null}
                        driverName={selectedJob.driverName}
                        status={selectedJob.status}
                        pickup={{ lat: selectedJob.pickupLat ?? null, lng: selectedJob.pickupLon ?? null, name: selectedJob.origin }}
                        dropoff={{ lat: selectedJob.dropoffLat ?? null, lng: selectedJob.dropoffLon ?? null, name: selectedJob.destination }}
                    />
                    <div className="absolute top-6 left-6 z-10">
                        <div className="px-4 py-2 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center gap-3 shadow-2xl">
                            <div className={cn("w-2 h-2 rounded-full animate-[ping_1.5s_infinite]", selectedJob.lastLocation ? "bg-emerald-500" : "bg-rose-500")} />
                            <span className="text-[10px] font-black text-foreground uppercase tracking-widest italic">
                                GEOSPATIAL SYNC: {selectedJob.lastLocation ? 'NOMINAL' : 'AWAITING UPLINK'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Main Content Scrollable Area */}
                <div className="p-8 lg:p-12 space-y-12">
                    {/* Cargo Specs Matrix */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-5 bg-white/5 rounded-3xl border border-white/5 flex flex-col items-center gap-2">
                             <Box size={16} className="text-primary/60" />
                             <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-50">CARGO_TYPE</span>
                             <span className="text-sm font-black uppercase italic">{selectedJob.cargoType || 'GENERAL'}</span>
                        </div>
                        <div className="p-5 bg-white/5 rounded-3xl border border-white/5 flex flex-col items-center gap-2">
                             <Scale size={16} className="text-primary/60" />
                             <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-50">WEIGHT_KG</span>
                             <span className="text-sm font-black uppercase italic">{selectedJob.weight?.toLocaleString() || '0'} KG</span>
                        </div>
                        <div className="p-5 bg-white/5 rounded-3xl border border-white/5 flex flex-col items-center gap-2">
                             <Layers size={16} className="text-primary/60" />
                             <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-50">VOLUME_CBM</span>
                             <span className="text-sm font-black uppercase italic">{selectedJob.volume?.toLocaleString() || '0'} CBM</span>
                        </div>
                        <div className="p-5 bg-white/5 rounded-3xl border border-white/5 flex flex-col items-center gap-2">
                             <Info size={16} className="text-primary/60" />
                             <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest opacity-50">VEHICLE_TYPE</span>
                             <span className="text-sm font-black uppercase italic">{selectedJob.vehicleType || '-'}</span>
                        </div>
                    </div>

                    {/* Tracking Progress */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-6 relative">
                        <div className="absolute top-8 left-10 right-10 h-0.5 bg-white/5 -translate-y-1/2 z-0 hidden md:block" />
                        {(() => {
                            const currentIdx = getCurrentStepIndex(selectedJob.status)
                            return steps.map((step, idx) => {
                                const isCompleted = idx <= currentIdx
                                const isCurrent = idx === currentIdx
                                return (
                                    <div key={step.key} className="relative z-10 flex flex-col items-center gap-4 group/step">
                                        <div className={cn(
                                            "w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all duration-700 border-2",
                                            isCurrent 
                                            ? "bg-primary border-white/20 text-foreground scale-110 shadow-[0_0_50px_rgba(255,30,133,0.5)]" 
                                            : isCompleted 
                                            ? "bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-lg shadow-emerald-500/20" 
                                            : "bg-white/[0.02] border-white/5 text-muted-foreground opacity-30"
                                        )}>
                                            {step.icon}
                                        </div>
                                        <div className="text-center">
                                            <p className={cn(
                                                "text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-700",
                                                isCurrent ? "text-primary italic" : isCompleted ? "text-emerald-500 italic" : "text-muted-foreground opacity-30"
                                            )}>
                                                {step.label}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })
                        })()}
                    </div>

                    {/* Meta Matrix */}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-12">
                        {/* Vectors Area */}
                        <div className="xl:col-span-8 space-y-8">
                             <div className="flex items-center gap-4 mb-2">
                                <div className="h-px flex-1 bg-white/10" />
                                <h3 className="text-[11px] font-black text-primary uppercase tracking-[0.5em] italic">MISSION_VECTORS</h3>
                                <div className="h-px flex-1 bg-white/10" />
                             </div>
                             
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5 relative overflow-hidden group/loc">
                                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover/loc:opacity-20 transition-opacity">
                                        <Target size={120} className="text-primary" />
                                    </div>
                                    <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em] mb-4 italic">INCEPTION_POINT</p>
                                    <p className="text-xl font-black text-foreground tracking-tighter uppercase italic leading-tight mb-4">{selectedJob.origin}</p>
                                    <div className="flex items-center gap-2 text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest italic bg-black/40 w-fit px-3 py-1.5 rounded-xl border border-white/5">
                                        <Calendar size={12} className="text-primary/60" />
                                        PLAN: {selectedJob.planDate ? new Date(selectedJob.planDate).toLocaleDateString('th-TH') : 'PENDING'}
                                    </div>
                                </div>

                                <div className="p-8 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-[2.5rem] border border-white/10 relative overflow-hidden group/loc">
                                    <div className="absolute top-0 right-0 p-8 opacity-5 group-hover/loc:opacity-20 transition-opacity">
                                        <MapPin size={120} className="text-indigo-400" />
                                    </div>
                                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4 italic">TERMINATION_VECTOR</p>
                                    <p className="text-xl font-black text-foreground tracking-tighter uppercase italic leading-tight mb-4">{selectedJob.destination}</p>
                                    <div className="flex items-center gap-2 text-[10px] font-black text-muted-foreground/60 uppercase tracking-widest italic bg-black/40 w-fit px-3 py-1.5 rounded-xl border border-white/5">
                                        <CheckCircle2 size={12} className="text-indigo-400/60" />
                                        EST: {selectedJob.deliveryDate ? new Date(selectedJob.deliveryDate).toLocaleTimeString('th-TH') : 'PENDING'}
                                    </div>
                                </div>
                             </div>

                             {selectedJob.notes && (
                                <div className="p-8 bg-amber-500/5 rounded-[2.5rem] border border-amber-500/10">
                                    <p className="text-[9px] font-black text-amber-500 uppercase tracking-[0.3em] mb-3 italic">TACTICAL_REMARKS</p>
                                    <p className="text-sm text-foreground/80 italic font-medium leading-relaxed">{selectedJob.notes}</p>
                                </div>
                             )}
                        </div>

                        {/* Evidence Area */}
                        <div className="xl:col-span-4 space-y-8">
                             <div className="flex items-center gap-4 mb-2">
                                <div className="h-px flex-1 bg-white/10" />
                                <h3 className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.5em] italic">INTEGRITY_DATA</h3>
                                <div className="h-px flex-1 bg-white/10" />
                             </div>

                             <div className="space-y-6">
                                <div className="p-6 bg-white/5 rounded-[2rem] border border-white/5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest italic opacity-60">PICKUP_PROOF</p>
                                        <Badge variant="outline" className="text-[8px] border-white/10 uppercase tracking-widest">PHASE_01</Badge>
                                    </div>
                                    {selectedJob.pickupPhotos.length > 0 || selectedJob.pickupSignature ? (
                                        <div className="flex flex-wrap gap-2">
                                            {selectedJob.pickupPhotos.slice(0, 3).map((p, i) => (
                                                <div key={i} className="w-14 h-14 rounded-2xl border border-white/10 overflow-hidden bg-black relative shadow-xl group/img cursor-pointer">
                                                    <Image src={p} alt="Pickup" fill className="object-cover group-hover/img:scale-110 transition-transform duration-500" />
                                                </div>
                                            ))}
                                            {selectedJob.pickupSignature && (
                                                <div className="w-14 h-14 rounded-2xl border-2 border-indigo-500/30 overflow-hidden bg-white p-1 relative shadow-xl">
                                                    <Image src={selectedJob.pickupSignature} alt="Pickup Sig" fill className="object-contain" />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="h-14 rounded-2xl border border-dashed border-white/5 flex items-center justify-center">
                                            <p className="text-[9px] font-black text-rose-500 uppercase tracking-[0.2em] italic animate-pulse">AWAITING_RECEPTION</p>
                                        </div>
                                    )}
                                </div>

                                <div className="p-6 bg-white/5 rounded-[2rem] border border-white/5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest italic opacity-60">DELIVERY_PROOF</p>
                                        <Badge variant="outline" className="text-[8px] border-white/10 uppercase tracking-widest">PHASE_02</Badge>
                                    </div>
                                    {selectedJob.podPhotos.length > 0 || selectedJob.signature ? (
                                        <div className="flex flex-wrap gap-2">
                                            {selectedJob.podPhotos.slice(0, 3).map((p, i) => (
                                                <div key={i} className="w-14 h-14 rounded-2xl border border-white/10 overflow-hidden bg-black relative shadow-xl group/img cursor-pointer">
                                                    <Image src={p} alt="POD" fill className="object-cover group-hover/img:scale-110 transition-transform duration-500" />
                                                </div>
                                            ))}
                                            {selectedJob.signature && (
                                                <div className="w-14 h-14 rounded-2xl border-2 border-emerald-500/30 overflow-hidden bg-white p-1 relative shadow-xl">
                                                    <Image src={selectedJob.signature} alt="POD Sig" fill className="object-contain" />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="h-14 rounded-2xl border border-dashed border-white/5 flex items-center justify-center">
                                            <p className="text-[9px] font-black text-rose-500 uppercase tracking-[0.2em] italic animate-pulse">PENDING_TERMINATION</p>
                                        </div>
                                    )}
                                </div>
                             </div>
                        </div>
                    </div>

                    {/* Final Actions Area */}
                    <div className="pt-12 border-t border-white/10 space-y-8 pb-12">
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex-1">
                                <PODDownloadButton job={selectedJob} />
                            </div>
                            <div className="flex-1">
                                <button className="w-full h-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-[0.2em] italic flex items-center justify-center gap-3 transition-all duration-300">
                                    <Phone size={14} className="text-primary" />
                                    CONNECT_DRIVER_UPLINK
                                </button>
                            </div>
                        </div>
                        
                        {getCurrentStepIndex(selectedJob.status) === 4 && (
                            <div className="animate-in fade-in slide-in-from-bottom-10 duration-1000">
                                <FeedbackForm jobId={selectedJob.jobId} />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  )
}
