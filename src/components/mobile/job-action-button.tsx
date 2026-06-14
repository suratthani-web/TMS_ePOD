"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { 
  CheckSquare, 
  Camera, 
  Loader2,
  ArrowRight,
  MapPin,
  Info,
  Activity,
  Target,
  Navigation,
  CheckCircle,
  Phone
} from "lucide-react"
import { updateJobStatus } from "@/app/mobile/jobs/actions"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { notifyTrackingStateChanged } from "@/lib/tracking-state"
import { saveJobOffline } from "@/lib/utils/offline-storage"
import { parseISO, isAfter, startOfDay } from "date-fns"

interface Destination {
    name: string
    lat: string
    lng: string
    so_no?: string
    [key: string]: unknown
}

interface Job {
    Job_ID: string
    Job_Status: string
    job_type?: 'normal' | 'container' | null
    Plan_Date: string | null
    Delivery_Date: string | null
    Total_Drop: number | null
    Signature_Url: string | null
    original_destinations_json: Destination[]
    Notes: string | null
    Verification_Status?: string
    [key: string]: unknown
}

interface JobActionButtonProps {
  job: Job
}

export function JobActionButton({ job }: JobActionButtonProps) {
  const [loading, setLoading] = useState(false)
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null)
  const router = useRouter()

  const currentStatus = optimisticStatus || job.Job_Status
  const totalDrop = (job.original_destinations_json && Array.isArray(job.original_destinations_json) && job.original_destinations_json.length > 0)
    ? job.original_destinations_json.length
    : Number(job.Total_Drop || 1)

  const completedDrops = job.Signature_Url ? job.Signature_Url.split(',').filter(Boolean).length : 0
  const isMultiDrop = totalDrop > 1
  const currentDropIndex = Math.min(completedDrops + 1, totalDrop)

  const handleStatusUpdate = async (newStatus: string) => {
    const today = startOfDay(new Date())

    // 1. Block Future Jobs
    if (job.Plan_Date) {
        const planDate = startOfDay(parseISO(job.Plan_Date))
        if (isAfter(planDate, today)) {
            toast.error("ไม่สามารถเริ่มงานได้ก่อนวันเริ่มงานจริง", {
                description: `งานนี้กำหนดเริ่มวันที่ ${new Date(job.Plan_Date).toLocaleDateString('th-TH')}`
            })
            return
        }
    }

    // 2. Block Early Arrival at Dropoff
    if (newStatus === 'Arrived Dropoff' && job.Delivery_Date) {
        const deliveryDate = startOfDay(parseISO(job.Delivery_Date))
        if (isAfter(deliveryDate, today)) {
            toast.error("ยังไม่ถึงกำหนดส่งงาน", {
                description: `งานนี้กำหนดส่งวันที่ ${new Date(job.Delivery_Date).toLocaleDateString('th-TH')}`
            })
            return
        }
    }

    setLoading(true)
    setOptimisticStatus(newStatus)

    // Offline: queue the change and keep the optimistic state so the driver can
    // keep working in dead zones; SyncManager replays it when back online.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await saveJobOffline(job.Job_ID, { status: newStatus }, 'STATUS')
        toast.info("บันทึกแบบออฟไลน์", {
            description: "ไม่มีสัญญาณ — ระบบจะอัปเดตสถานะให้อัตโนมัติเมื่อกลับมาออนไลน์",
            duration: 4000
        })
        setLoading(false)
        return
    }

    try {
        const result = await updateJobStatus(job.Job_ID, newStatus)

        if (!result.success) {
            toast.error(result.message)
            setOptimisticStatus(null)
        } else {
            toast.success("อัปเดตสถานะเรียบร้อย")
            // Job entered/left an in-progress state — let LocationTracker
            // re-check whether GPS tracking should start or stop.
            notifyTrackingStateChanged()
        }
    } catch {
        // Network dropped mid-request → queue offline, keep the optimistic state.
        await saveJobOffline(job.Job_ID, { status: newStatus }, 'STATUS')
        toast.info("เน็ตไม่เสถียร บันทึกแบบออฟไลน์", {
            description: "ระบบจะอัปเดตสถานะให้อัตโนมัติเมื่อสัญญาณกลับมา",
            duration: 4000
        })
    } finally {
        setLoading(false)
    }
  }

  // POD Flow
  const handlePOD = () => {
    if (job.Delivery_Date) {
        const deliveryDate = startOfDay(parseISO(job.Delivery_Date))
        const today = startOfDay(new Date())
        
        if (isAfter(deliveryDate, today)) {
            toast.error("ยังไม่ถึงกำหนดส่งงาน", {
                description: `งานนี้กำหนดส่งวันที่ ${new Date(job.Delivery_Date).toLocaleDateString('th-TH')}`
            })
            return
        }
    }
    router.push(`/mobile/jobs/${job.Job_ID}/complete`)
  }

  // Determine button properties based on status
  let label = ""
  let variant = "secondary"
  let action = () => {}
  let renderStatus = null

  switch(currentStatus) {
      case 'Assigned': 
      case 'New':
          label = "เริ่มงาน"
          variant = "secondary"
          action = () => handleStatusUpdate('Accepted')
          break
      
      case 'Accepted':
          label = "ถึงจุดรับสินค้า"
          variant = "secondary"
          action = () => handleStatusUpdate('Arrived Pickup')
          break

      case 'Arrived Pickup':
          label = job.job_type === 'container' ? "บันทึก EIR & ตู้" : "รับสินค้าเข้า"
          variant = "primary"
          action = () => {
              router.push(`/mobile/jobs/${job.Job_ID}/pickup`)
          }
          break
      
      case 'Picked Up':
      case 'In Transit':
          label = isMultiDrop ? `ถึงจุดส่งที่ ${currentDropIndex}` : "ถึงจุดส่งสินค้า"
          variant = "secondary"
          action = () => handleStatusUpdate('Arrived Dropoff')
          break

      case 'Arrived Dropoff':
          label = isMultiDrop ? `บันทึกส่งงาน (จุดที่ ${currentDropIndex})` : "บันทึกส่งงาน"
          variant = "primary"
          action = handlePOD
          break

      case 'Completed':
          renderStatus = (
              <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-center">
                  <p className="text-emerald-600 font-semibold flex items-center justify-center gap-2">
                      <CheckCircle size={20} /> งานเสร็จสิ้นแล้ว
                  </p>
              </div>
          )
          break

      default:
          renderStatus = (
              <div className="p-4 bg-muted rounded-2xl text-center">
                  <p className="text-muted-foreground text-xs">ไม่ทราบสถานะ ({currentStatus})</p>
              </div>
          )
          break
  }

  if (renderStatus) {
    return (
        <div className="space-y-3">
            {renderStatus}
        </div>
    )
  }

  // Resolve Phone Info
  const phone_completedDrops = job?.Signature_Url ? job.Signature_Url.split(',').filter(Boolean).length : 0
  const phone_totalDrop = Array.isArray(job.original_destinations_json) ? job.original_destinations_json.length : 1
  const phone_currentDropIndex = Math.min(phone_completedDrops, phone_totalDrop - 1)
  const phone_currentDest = Array.isArray(job.original_destinations_json) ? job.original_destinations_json[phone_currentDropIndex] : null
  const phone = phone_currentDest?.phone || (job as { Customer_Phone?: string | null }).Customer_Phone

  return (
    <div className="space-y-3">
        <div className="flex flex-col">
            {/* Step Guidance Header */}
            <div className="p-5 border-b border-border bg-primary/5 rounded-t-2xl">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Info className="text-primary" size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-primary mb-1">สิ่งที่ต้องทำตอนนี้</p>
                            
                            {/* Integrated Call Button */}
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (phone) {
                                        window.location.href = `tel:${phone}`;
                                    } else {
                                        toast.error("ไม่พบเบอร์โทรศัพท์ในระบบ");
                                    }
                                }}
                                className={cn(
                                    "px-3 py-1 rounded-full flex items-center gap-1.5 active:scale-90 transition-all border",
                                    phone 
                                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
                                        : "bg-muted text-muted-foreground border-border/50 opacity-60"
                                )}
                            >
                                <Phone size={10} strokeWidth={3} />
                                <span className="text-[10px] font-semibold">{phone ? "โทร" : "ไม่มีเบอร์"}</span>
                            </button>
                        </div>
                        <h4 className="text-sm font-semibold text-foreground leading-tight mt-1">
                            {currentStatus === 'Assigned' || currentStatus === 'New' ? 'กรุณากด "เริ่มงาน" เพื่อเริ่มงาน' : 
                                currentStatus === 'Accepted' ? 'เดินทางไปยังจุดรับสินค้า' :
                                currentStatus === 'Arrived Pickup' ? (job.job_type === 'container' ? 'ถึงลานตู้แล้ว กรุณาถ่ายรูป EIR และสภาพตู้' : 'ถึงจุดรับแล้ว กรุณาถ่ายรูปรับสินค้า') :
                                currentStatus === 'Picked Up' || currentStatus === 'In Transit' ? (isMultiDrop ? `กำลังเดินทางไปจุดที่ ${currentDropIndex}` : 'กำลังเดินทางไปยังจุดหมาย') :
                                currentStatus === 'Arrived Dropoff' ? (isMultiDrop ? `ถึงจุดส่งที่ ${currentDropIndex} แล้ว บันทึกส่งงาน` : 'ถึงที่หมายแล้ว บันทึกส่งงาน') :
                                'อยู่ระหว่างดำเนินงาน'}
                        </h4>
                        
                        {/* Multi-drop Specific Detail */}
                        {isMultiDrop && (currentStatus === 'In Transit' || currentStatus === 'Arrived Dropoff' || currentStatus === 'Picked Up') && (
                            <div className="mt-2 flex items-center gap-2">
                                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-primary transition-all duration-500" 
                                        style={{ width: `${(completedDrops / totalDrop) * 100}%` }}
                                    />
                                    </div>
                                    <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                                    จุดส่ง {completedDrops}/{totalDrop}
                                    </span>
                            </div>
                        )}
                        
                        {/* Destination Name for current stop */}
                        {(currentStatus === 'In Transit' || currentStatus === 'Arrived Dropoff' || currentStatus === 'Picked Up') && (
                            <div className="mt-2 space-y-1">
                                <p className="text-xs font-medium text-muted-foreground line-clamp-1">
                                    จุดหมาย: {
                                        isMultiDrop 
                                            ? (Array.isArray(job.original_destinations_json) ? job.original_destinations_json[currentDropIndex - 1]?.name : 'ไม่ระบุ')
                                            : (job.Dest_Location as string || 'ไม่ระบุ')
                                    }
                                </p>
                                {(() => {
                                    const currentSO = isMultiDrop 
                                        ? (Array.isArray(job.original_destinations_json) ? job.original_destinations_json[currentDropIndex - 1]?.so_no : undefined)
                                        : (Array.isArray(job.original_destinations_json) ? job.original_destinations_json[0]?.so_no : undefined);
                                    return currentSO ? (
                                        <p className="text-xs font-bold text-emerald-400">
                                            ใบสั่งซื้อ (SO): {currentSO}
                                        </p>
                                    ) : null;
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Action Button */}
            <div className="p-3 bg-background/50 rounded-b-2xl">
                <Button 
                    onClick={() => {
                        if (action) action()
                    }}
                    disabled={loading || currentStatus === 'Completed'}
                    size="lg"
                    className={cn(
                        "w-full h-14 rounded-xl text-base font-semibold gap-2 shadow-sm transition-all active:scale-95",
                        variant === 'primary' ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-primary hover:bg-primary/90 text-white"
                    )}
                >
                    {loading ? (
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            {label === "เริ่มงาน" && <Activity size={24} />}
                            {label === "ถึงจุดรับสินค้า" && <MapPin size={24} />}
                            {label === "รับสินค้าเข้า" && <Target size={24} />}
                            {label.includes("ถึงจุดส่ง") && <Navigation size={24} />}
                            {label.includes("บันทึกส่งงาน") && <CheckCircle size={24} />}
                            {label}
                            <div className="ml-auto w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                <ArrowRight size={14} />
                            </div>
                        </>
                    )}
                </Button>
            </div>
        </div>
    </div>
  )
}
