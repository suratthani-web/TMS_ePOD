"use client"

import { CheckCircle2, Clock, MapPin, Package, Truck, Zap, ShieldCheck, Info } from "lucide-react"
import { cn } from "@/lib/utils"

export type JobStep = 'New' | 'Accepted' | 'Arrived Pickup' | 'In Transit' | 'Arrived Dropoff' | 'Completed'

interface JobWorkflowProps {
  currentStatus: string
  totalDrop?: number
  completedDrops?: number
  jobType?: 'normal' | 'container' | null
  className?: string
}

const STEPS: { status: JobStep; label: string; icon: React.ElementType; description: string }[] = [
  { status: 'Accepted', label: 'รับงาน', icon: ShieldCheck, description: 'ยืนยันรับภารกิจ' },
  { status: 'Arrived Pickup', label: 'จุดรับ', icon: MapPin, description: 'ถึงจุดรับสินค้า' },
  { status: 'In Transit', label: 'ขนส่ง', icon: Truck, description: 'กำลังเดินทาง' },
  { status: 'Arrived Dropoff', label: 'จุดส่ง', icon: MapPin, description: 'ถึงจุดหมาย' },
  { status: 'Completed', label: 'สำเร็จ', icon: Package, description: 'ส่งมอบเรียบร้อย' }
]

export function JobWorkflow({ currentStatus, totalDrop = 1, completedDrops = 0, jobType = 'normal', className }: JobWorkflowProps) {
  // Normalize status
  const normalizedStatus = (currentStatus === 'New' || currentStatus === 'Assigned') ? 'Pending' : currentStatus as JobStep
  
  const getStepIndex = (status: string) => {
    if (status === 'Pending') return -1
    if (status === 'Verified' || status === 'Rejected') return STEPS.length - 1
    return STEPS.findIndex(s => s.status === status)
  }

  const currentIndex = getStepIndex(normalizedStatus)
  const isMultiDrop = totalDrop > 1
  const currentDropIndex = Math.min(completedDrops + 1, totalDrop)

  return (
    <div className={cn("py-4", className)}>
      <div className="space-y-0 relative">
        {/* Continuous Vertical Line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border/40" />

        {STEPS.map((step, index) => {
          const isCompleted = index < currentIndex || normalizedStatus === 'Completed' || normalizedStatus === 'Verified' || normalizedStatus === 'Rejected'
          const isActive = index === currentIndex && !['Completed', 'Verified', 'Rejected'].includes(normalizedStatus)
          const StepIcon = step.icon

          let stepDescription = step.description
          if (isMultiDrop) {
              if (step.status === 'Arrived Dropoff') {
                  stepDescription = `จุดส่ง (${completedDrops}/${totalDrop})`
              } else if (step.status === 'In Transit' && isActive) {
                  stepDescription = `กำลังเดินทางไปจุดที่ ${currentDropIndex}`
              }
          }

          return (
            <div key={step.status} className="relative flex items-start gap-6 pb-8 last:pb-0">
              {/* Step Circle/Icon */}
              <div 
                className={cn(
                  "relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shrink-0",
                  isCompleted ? "bg-emerald-500 text-white" : 
                  isActive ? "bg-primary text-white shadow-[0_0_15px_rgba(var(--primary),0.3)] ring-4 ring-primary/10" : 
                  "bg-muted text-muted-foreground border border-border"
                )}
              >
                {isCompleted ? <CheckCircle2 size={24} /> : <StepIcon size={20} />}
              </div>

              {/* Step Content */}
              <div className="flex-1 pt-1">
                <div className="flex items-center justify-between mb-1">
                   <h4 className={cn(
                     "text-sm font-bold uppercase tracking-wide",
                     isActive ? "text-primary" : isCompleted ? "text-emerald-600" : "text-muted-foreground"
                   )}>
                     {step.label} {isMultiDrop && step.status === 'Arrived Dropoff' && isActive && `(จุดที่ ${currentDropIndex})`}
                   </h4>
                   {isActive && (
                      <span className="bg-primary/10 text-primary text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
                        กำลังทำ
                      </span>
                   )}
                </div>
                <p className={cn(
                  "text-xs leading-relaxed",
                  isActive ? "text-foreground font-medium" : "text-muted-foreground/70"
                )}>
                  {stepDescription}
                </p>
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Current Guidance Card - Simplified */}
      {currentIndex < STEPS.length - 1 && normalizedStatus !== 'Completed' && (
        <div className="mt-8 p-5 bg-primary/5 border border-primary/10 rounded-2xl">
          <div className="flex gap-3">
             <Info className="text-primary shrink-0" size={18} />
             <div className="space-y-1">
                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">สิ่งที่คุณต้องทำตอนนี้</p>
                <p className="text-sm font-medium text-foreground leading-snug">
                   {currentIndex === -1 ? 'กรุณากด "รับงาน" เพื่อเริ่มงานนี้' : 
                    currentIndex === 0 ? 'กำลังเดินทางไปยังจุดรับสินค้า' :
                    currentIndex === 1 ? (jobType === 'container' ? 'ถึงจุดรับแล้ว กรุณาถ่ายรูป EIR และสภาพตู้เพื่อรับงาน' : 'ถึงจุดรับแล้ว กรุณาถ่ายรูปสินค้าเพื่อรับงาน') :
                    currentIndex === 2 ? (isMultiDrop ? `กำลังนำสินค้าไปส่งยังจุดที่ ${currentDropIndex}` : 'กำลังนำสินค้าไปส่งยังจุดหมาย') :
                    (isMultiDrop ? `ถึงจุดที่ ${currentDropIndex} แล้ว กรุณาถ่ายรูปและเซ็นชื่อ` : 'ถึงจุดหมายแล้ว กรุณาถ่ายรูปและให้ลูกค้าเซ็นชื่อ')}
                </p>
             </div>
          </div>
        </div>
      )}
    </div>
  )
}
