"use client"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { MobileHeader } from "@/components/mobile/mobile-header"
import { 
    MapPin, Phone, User, CheckCircle, 
    Info, Activity, Navigation, 
    TrendingUp, Target, Copy, Thermometer
} from "lucide-react"
import { JobActionButton } from "@/components/mobile/job-action-button"
import { JobWorkflow } from "@/components/mobile/job-workflow"
import { NavigationButton } from "@/components/mobile/navigation-button"
import { RouteStrip } from "@/components/mobile/route-strip"
import { Job } from "@/lib/supabase/jobs"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { parseISO, isAfter, startOfDay } from "date-fns"
import { ContainerTempForm } from "@/components/mobile/container-temp-form"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface JobDetailClientProps {
    job: Job
    success?: string
    initialTab?: string
}

export function JobDetailClient({ job, success, initialTab = 'mission' }: JobDetailClientProps) {
    const router = useRouter()
    const pathname = usePathname()
    
    // Sync tab with URL to prevent "bounce" on refresh
    const [activeTab, setActiveTab] = useState<'mission' | 'info'>(initialTab as 'mission' | 'info')
    const [mounted, setMounted] = useState(false)
    const [showTempModal, setShowTempModal] = useState(false)

    useEffect(() => {
        setMounted(true)
        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search)
            const tab = params.get('tab') as 'mission' | 'info'
            if (tab && tab !== activeTab) {
                setActiveTab(tab)
            }
        }
    }, [activeTab])

    const handleTabChange = (tab: 'mission' | 'info') => {
        setActiveTab(tab)
        const search = typeof window !== "undefined" ? window.location.search : ""
        const params = new URLSearchParams(search)
        params.set('tab', tab)
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }

    const destinations = typeof job?.original_destinations_json === 'string' 
        ? JSON.parse(job.original_destinations_json) 
        : job?.original_destinations_json || [];

    return (
        <div className="min-h-screen bg-background pb-40 pt-[calc(56px+env(safe-area-inset-top))] relative overflow-hidden flex flex-col">
            <MobileHeader title="รายละเอียดภารกิจ" showBack />

            <div className="flex-1 px-5 overflow-y-auto pb-10 pt-4 space-y-8">
                {/* 1. TOP SECTION: CUSTOMER & CONTACT (Critical Info) */}
                <div className="bg-card rounded-3xl p-6 border border-border shadow-sm space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                <User size={24} />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">ลูกค้า</p>
                                <h3 className="text-xl font-bold text-foreground">{job?.Customer_Name}</h3>
                            </div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                             <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">รหัสงาน</p>
                             <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-primary italic">#{String(job?.Job_ID || '').slice(-8).toUpperCase()}</p>
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(job?.Job_ID || '')
                                        toast.success("คัดลอกรหัสงานเรียบร้อย")
                                    }}
                                    className="p-1.5 bg-muted rounded-lg text-muted-foreground active:scale-90"
                                >
                                    <Copy size={12} />
                                </button>
                             </div>
                        </div>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-2xl border border-border/50">
                        <div className="flex items-start gap-3">
                            <MapPin size={18} className="text-accent shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">จุดหมายปัจจุบัน</p>
                                <p className="text-sm font-bold text-foreground leading-snug">
                                    {(() => {
                                        const completedDrops = job?.Signature_Url ? job.Signature_Url.split(',').filter(Boolean).length : 0
                                        const totalDrop = Array.isArray(destinations) ? destinations.length : 1
                                        const currentDropIndex = Math.min(completedDrops, totalDrop - 1)
                                        return destinations[currentDropIndex]?.name || job?.Dest_Location || job?.Route_Name
                                    })()}
                                </p>
                            </div>
                            <NavigationButton job={job} />
                        </div>
                        
                        {Array.isArray(destinations) && destinations.length > 1 && (
                            <div className="mt-3 pt-3 border-t border-border/50">
                                <details className="group">
                                    <summary className="list-none flex items-center justify-center gap-2 text-[10px] font-black text-primary uppercase cursor-pointer hover:opacity-70">
                                        <span>ดูเส้นทางทั้งหมด ({destinations.length} จุด)</span>
                                        <Activity size={10} className="group-open:rotate-180 transition-transform" />
                                    </summary>
                                    <div className="mt-3 space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-2">
                                        {destinations.map((d: any, i: number) => (
                                            <div key={i} className="flex items-center gap-2 text-xs">
                                                <div className={cn(
                                                    "w-1.5 h-1.5 rounded-full",
                                                    i < (job?.Signature_Url?.split(',').filter(Boolean).length || 0) ? "bg-emerald-500" : "bg-muted-foreground/30"
                                                )} />
                                                <span className={cn(
                                                    "truncate",
                                                    i < (job?.Signature_Url?.split(',').filter(Boolean).length || 0) ? "text-muted-foreground line-through" : "text-foreground font-medium"
                                                )}>{d.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            </div>
                        )}
                    </div>
                </div>




                {job?.Notes && (
                    <div className="p-5 bg-amber-50/50 border border-amber-200/50 rounded-2xl">
                        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-2">หมายเหตุจากแอดมิน</p>
                        <p className="text-sm text-amber-900 font-medium">{job.Notes}</p>
                    </div>
                )}

                {/* Workflow Tracker */}
                <div className="bg-card rounded-3xl p-6 border border-border shadow-sm">
                    <h3 className="text-lg font-black text-foreground mb-4 flex items-center gap-2">
                        <Activity size={20} className="text-primary" />
                        สถานะปัจจุบัน
                    </h3>
                    <JobWorkflow 
                        currentStatus={job.Job_Status} 
                        totalDrop={destinations.length} 
                        completedDrops={job.Signature_Url ? job.Signature_Url.split(',').filter(Boolean).length : 0}
                        jobType={job.job_type}
                    />
                </div>

                {/* Container Specific Info */}
                {job.job_type === 'container' && job.container && (
                    <div className="bg-card rounded-3xl p-6 border border-border shadow-sm space-y-6">
                        <h3 className="text-lg font-black text-foreground flex items-center gap-2">
                            <Info size={20} className="text-primary" />
                            ข้อมูลตู้คอนเทนเนอร์ {job.container.container_subtype === 'export' ? '(Export)' : '(Import)'}
                        </h3>
                        
                        {job.container.booking_no && (
                            <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                                <p className="text-[10px] font-bold text-primary uppercase">เลข Booking</p>
                                <p className="text-xl font-black text-primary tracking-wider">{job.container.booking_no}</p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase">หมายเลขตู้</p>
                                <p className="text-sm font-black text-primary">{job.container.container_no || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase">เบอร์ซีล</p>
                                <p className="text-sm font-black text-indigo-500">{job.container.seal_no || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase">ขนาดตู้</p>
                                <p className="text-sm font-bold">{job.container.container_size || 'N/A'}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase">สายเรือ</p>
                                <p className="text-sm font-bold">{job.container.shipping_line || 'N/A'}</p>
                            </div>
                        </div>

                        {/* Export Deadlines */}
                        {job.container.container_subtype === 'export' && (
                            <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-1 gap-3">
                                {job.container.pickup_empty_date && (
                                    <div className="flex justify-between items-center p-2 rounded-lg bg-emerald-500/10 text-emerald-700">
                                        <span className="text-[10px] font-bold uppercase">เริ่มรับตู้เปล่า</span>
                                        <span className="text-sm font-black">{new Date(job.container.pickup_empty_date).toLocaleDateString('th-TH')}</span>
                                    </div>
                                )}
                                {job.container.port_closing_datetime && (
                                    <div className="flex justify-between items-center p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700">
                                        <span className="text-[11px] font-bold uppercase flex items-center gap-1">
                                            <Activity size={12} /> Closing (ปิดรับตู้)
                                        </span>
                                        <span className="text-base font-black animate-pulse">
                                            {new Date(job.container.port_closing_datetime).toLocaleString('th-TH', { 
                                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
                                            })} น.
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Import Deadlines */}
                        {(!job.container.container_subtype || job.container.container_subtype === 'import') && (
                            <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 gap-4">
                                {job.container.lfd_demurrage && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-amber-600 uppercase">LFD Demurrage</p>
                                        <p className="text-sm font-bold">{new Date(job.container.lfd_demurrage).toLocaleDateString('th-TH')}</p>
                                    </div>
                                )}
                                {job.container.lfd_detention && (
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-bold text-amber-600 uppercase">LFD Detention</p>
                                        <p className="text-sm font-bold">{new Date(job.container.lfd_detention).toLocaleDateString('th-TH')}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* REEFER SPECIFIC: Temp Update Button */}
                        {job.container.container_size === 'REEFER' && (
                            <div className="pt-4 border-t border-border/50">
                                <Button 
                                    onClick={() => setShowTempModal(true)}
                                    className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black gap-2 shadow-lg shadow-blue-500/20"
                                >
                                    <Thermometer size={20} />
                                    อัปเดตอุณหภูมิ (REEFER)
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* Temperature Update Modal */}
                <Dialog open={showTempModal} onOpenChange={setShowTempModal}>
                    <DialogContent className="max-w-[90vw] p-0 bg-transparent border-none shadow-none">
                        <ContainerTempForm 
                            jobId={job.Job_ID}
                            targetTemp={job.container?.target_temperature}
                            driverName={job.Driver_Name}
                            onClose={() => setShowTempModal(false)}
                        />
                    </DialogContent>
                </Dialog>

                {/* 4. PAYOUT (If visible) */}
                {job?.Show_Price_To_Driver && (
                    <div className="p-6 rounded-3xl bg-slate-900 flex items-center justify-between">
                        <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">รายได้ของคุณ</p>
                            <h4 className="text-sm font-bold text-white">ค่าตอบแทนภารกิจ</h4>
                        </div>
                        <div className="text-right">
                            <span className="text-3xl font-bold text-white italic">฿{(job?.Cost_Driver_Total || 0).toLocaleString()}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* FLOATING ACTION CENTER - RELIABLE POSITIONING */}
            <div className="fixed bottom-[90px] left-5 right-5 z-[140] animate-in slide-in-from-bottom-10 duration-700">
                <div className="shadow-[0_-20px_60px_rgba(0,0,0,0.5)] rounded-[2.5rem] bg-background/40 backdrop-blur-2xl border border-white/10 overflow-hidden">

                    <JobActionButton 
                        job={{
                            ...job,
                            original_destinations_json: destinations
                        } as Parameters<typeof JobActionButton>[0]['job']} 
                    />
                </div>
            </div>
        </div>
    )
}
