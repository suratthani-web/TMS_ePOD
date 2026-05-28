import { getPublicJobDetails } from "@/lib/actions/tracking-actions"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { 
  Package, 
  Truck, 
  MapPin, 
  Calendar, 
  Camera, 
  User, 
  CheckCircle2, 
  ExternalLink,
  Activity,
  ShieldCheck,
  Target,
  Clock,
  Navigation
} from "lucide-react"
import Image from "next/image"
import Link from 'next/link'
import { cn } from "@/lib/utils"
import { ShareTrackingButton } from "@/components/tracking/share-tracking-button"
import { TrackingMap } from "@/components/tracking/tracking-map"
import { FeedbackForm } from "@/components/tracking/feedback-form"
import { PODDownloadButton } from "@/components/tracking/pod-download"

export const dynamic = 'force-dynamic'

export default async function TrackingPage(props: { params: Promise<{ jobId: string }> }) {
  const params = await props.params
  const { jobId } = params
  const job = await getPublicJobDetails(jobId)

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-6 px-4">
        <div className="bg-slate-100 p-10 rounded-full border border-slate-200 relative group">
            <Package className="h-16 w-16 text-slate-300 mx-auto" strokeWidth={1.5} />
        </div>
        <div className="space-y-2">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">ไม่พบข้อมูลงาน</h1>
            <p className="text-slate-500 max-w-xs font-medium leading-relaxed">กรุณาตรวจสอบหมายเลขติดตามงาน หรือติดต่อเจ้าหน้าที่เพื่อสอบถามข้อมูล</p>
        </div>
        <Link href="/" className="px-8 py-3 bg-white rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all shadow-sm">
            กลับสู่หน้าหลัก
        </Link>
      </div>
    )
  }

  const steps = [
    { key: 'New', label: 'รับงาน', icon: <Calendar size={18} /> },
    { key: 'Assigned', label: 'จัดรถแล้ว', icon: <User size={18} /> },
    { key: 'Picked Up', label: 'รับสินค้าแล้ว', icon: <Package size={18} /> },
    { key: 'In Transit', label: 'กำลังจัดส่ง', icon: <Truck size={18} /> },
    { key: 'Completed', label: 'ส่งสำเร็จ', icon: <CheckCircle2 size={18} /> },
  ]

  const getCurrentStepIndex = () => {
    const status = job.status
    if (['Delivered', 'Completed', 'Complete'].includes(status)) return 4
    if (status === 'In Transit') return 3
    if (status === 'Picked Up') return 2
    if (status === 'Assigned') return 1
    return 0
  }

  const currentStepIndex = getCurrentStepIndex()

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 px-2 sm:px-4 md:px-6">
        {/* Main Info Card */}
        <div className="relative rounded-3xl overflow-hidden bg-white border border-slate-200 shadow-sm transition-all duration-500">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-500"></div>

            <div className="p-6 md:p-10 space-y-8">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-6">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-indigo-600 font-bold text-sm uppercase tracking-wider">
                            <Activity size={14} className="animate-pulse" />
                            <span>สถานะการขนส่งล่าสุด</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">{job.jobId}</h1>
                    </div>
                    <Badge className={cn(
                        "px-6 py-2 rounded-xl text-base font-bold uppercase tracking-wide border shadow-sm transition-all duration-700",
                        currentStepIndex === 4 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                        : 'bg-indigo-50 text-indigo-600 border-indigo-200'
                    )}>
                        {job.status.toUpperCase()}
                    </Badge>
                </div>

                {/* Tracking Stepper */}
                <div className="relative px-2 py-6">
                    {/* Background Line */}
                    <div className="absolute top-1/2 left-8 right-8 h-1 bg-slate-100 -translate-y-1/2 z-0 hidden sm:block" />
                    
                    {/* Progress Line */}
                    <div 
                        className="absolute top-1/2 left-8 h-1 bg-indigo-500 -translate-y-1/2 z-0 transition-all duration-1000 ease-out hidden sm:block" 
                        style={{ width: `${(currentStepIndex / 4) * (100 - 16)}%` }}
                    />
                    
                    <div className="flex flex-col sm:flex-row justify-between gap-6 sm:gap-0 relative z-10">
                        {steps.map((step, idx) => {
                            const isCompleted = idx <= currentStepIndex
                            const isCurrent = idx === currentStepIndex
                            return (
                                <div key={step.key} className="flex flex-row sm:flex-col items-center gap-4 sm:gap-0 group/step">
                                    <div className={cn(
                                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border-2 relative shrink-0",
                                        isCurrent 
                                        ? 'bg-indigo-600 border-indigo-600 text-white scale-110 shadow-lg' 
                                        : isCompleted 
                                        ? 'bg-white border-indigo-500 text-indigo-600' 
                                        : 'bg-white border-slate-200 text-slate-300'
                                    )}>
                                        <span className="relative z-10">{step.icon}</span>
                                    </div>
                                    <div className="flex flex-col sm:items-center">
                                        <span className={cn(
                                            "text-sm font-bold sm:mt-4 transition-colors uppercase tracking-wide",
                                            isCompleted ? 'text-indigo-600' : 'text-slate-300'
                                        )}>
                                            {step.label}
                                        </span>
                                        {/* Mobile view only detail */}
                                        {isCurrent && (
                                             <span className="text-[10px] text-slate-400 sm:hidden">สถานะปัจจุบัน</span>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>

        {/* Map Container */}
        {job.lastLocation && (
            <div className="bg-white border border-slate-200 overflow-hidden shadow-sm rounded-3xl group transition-all duration-500">
                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wider">
                        <Navigation size={16} className="text-indigo-600" />
                        <span>ตำแหน่งปัจจุบัน</span>
                    </div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Clock size={12} />
                        อัพเดทเมื่อ: {new Date(job.lastLocation.timestamp).toLocaleTimeString('th-TH', { hour12: false })}
                    </div>
                </div>
                <div className="h-[350px] w-full relative">
                    <TrackingMap 
                        lastLocation={job.lastLocation}
                        driverName={job.driverName}
                        status={job.status}
                        pickup={{ lat: job.pickupLat ?? null, lng: job.pickupLon ?? null, name: job.origin }}
                        dropoff={{ lat: job.dropoffLat ?? null, lng: job.dropoffLon ?? null, name: job.destination }}
                    />
                </div>
            </div>
        )}

        {/* Information Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
                <h3 className="text-lg font-bold text-slate-900 border-l-4 border-indigo-500 pl-4 uppercase tracking-tight">ข้อมูลการขนส่ง</h3>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-bold uppercase text-slate-400 mb-1 tracking-wider">หมายเลขรถ</p>
                        <p className="text-base font-bold text-slate-900">{job.vehiclePlate.toUpperCase()}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-bold uppercase text-slate-400 mb-1 tracking-wider">พนักงานขับรถ</p>
                        <p className="text-base font-bold text-slate-900">{job.driverName || 'กำลังมอบหมาย'}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex gap-4 p-5 bg-slate-50/50 rounded-2xl border border-slate-100 group">
                        <div className="mt-1"><div className="w-3 h-3 rounded-full bg-slate-400" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-400 mb-1 tracking-wider">ต้นทาง</p>
                            <p className="text-sm text-slate-600 font-medium break-words">{job.origin}</p>
                        </div>
                    </div>
                    <div className="flex gap-4 p-5 bg-indigo-50/30 rounded-2xl border border-indigo-100 group">
                        <div className="mt-1"><MapPin size={16} className="text-indigo-500" /></div>
                        <div>
                            <p className="text-[10px] font-bold uppercase text-indigo-400 mb-1 tracking-wider">ปลายทาง</p>
                            <p className="text-sm text-slate-900 font-bold break-words">{job.destination}</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Photos & Evidence */}
            {(job.pickupPhotos.length > 0 || job.podPhotos.length > 0 || job.signature || job.pickupSignature) && (
                <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
                    <h3 className="text-lg font-bold text-slate-900 border-l-4 border-emerald-500 pl-4 uppercase tracking-tight">หลักฐานการขนส่ง</h3>

                    <div className="space-y-6">
                        {job.podPhotos.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">ภาพถ่ายยืนยันการส่งสินค้า</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {job.podPhotos.map((url, i) => (
                                        <div key={i} className="aspect-video relative rounded-xl overflow-hidden border border-slate-100 bg-slate-50 shadow-inner group cursor-pointer">
                                            <Image src={url} alt="POD" fill sizes="(max-width: 768px) 50vw, 300px" className="object-cover transition-transform group-hover:scale-105" />
                                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <ExternalLink size={20} className="text-white" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {job.signature && (
                            <div className="space-y-3">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center">ลายเซ็นผู้รับสินค้า</p>
                                <div className="h-24 bg-slate-50 rounded-xl overflow-hidden relative border border-slate-100">
                                    <Image src={job.signature} alt="POD Sig" fill sizes="(max-width: 768px) 100vw, 400px" className="object-contain p-4" />
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Real-Time Expense & Billing Card for Customer */}
            {Number(job.priceCustTotal || 0) > 0 && (
                <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 border-l-4 border-amber-500 pl-4 uppercase tracking-tight mb-6">
                            สรุปค่าบริการแบบเรียลไทม์
                        </h3>
                        
                        <div className="space-y-4">
                            {/* Base Price */}
                            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-400 mb-0.5 tracking-wider">ค่าขนส่งหลัก</p>
                                    <p className="text-xs text-slate-400">อัตราค่าขนส่งพื้นฐาน</p>
                                </div>
                                <p className="text-base font-extrabold text-slate-900">฿{Number(job.priceCustBase || 0).toLocaleString()}</p>
                            </div>

                            {/* Extra costs list */}
                            {(() => {
                                let extras: any[] = [];
                                if (job.extraCostsJson) {
                                    try {
                                        const parsed = typeof job.extraCostsJson === 'string'
                                            ? JSON.parse(job.extraCostsJson)
                                            : job.extraCostsJson;
                                        if (Array.isArray(parsed)) extras = parsed;
                                    } catch {}
                                }
                                return extras.map((c, i) => (
                                    <div key={i} className="flex justify-between items-center p-4 bg-amber-50/20 rounded-2xl border border-amber-100/50">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase text-amber-600 mb-0.5 tracking-wider">ค่าใช้จ่ายเพิ่มเติม</p>
                                            <p className="text-xs text-slate-500">{c.type || 'ค่าบริการอื่น'}</p>
                                        </div>
                                        <p className="text-base font-extrabold text-amber-700">฿{Number(c.charge_cust || 0).toLocaleString()}</p>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>

                    {/* Total Cust Price */}
                    <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                        <div>
                            <p className="text-[10px] font-bold uppercase text-slate-500 mb-0.5 tracking-wider">ยอดเงินรวมสุทธิ</p>
                            <p className="text-xs text-slate-400">Total Invoice Value</p>
                        </div>
                        <p className="text-2xl font-black text-slate-900">฿{Number(job.priceCustTotal || 0).toLocaleString()}</p>
                    </div>
                </section>
            )}
        </div>

        {currentStepIndex === 4 && (
            <div className="space-y-6 pt-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
                <PODDownloadButton job={job} />
                <FeedbackForm jobId={job.jobId} />
            </div>
        )}

        {/* Footer */}
        <div className="text-center pt-10 pb-10 flex flex-col items-center gap-4 opacity-50">
            <div className="flex items-center gap-4">
                <div className="w-8 h-px bg-slate-200" />
                <Package size={14} className="text-slate-400" />
                <div className="w-8 h-px bg-slate-200" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                พัฒนาระบบโดย LOGISPRO TMS • 2026
            </p>
        </div>

        <ShareTrackingButton jobId={job.jobId} />
    </div>
  )
}
