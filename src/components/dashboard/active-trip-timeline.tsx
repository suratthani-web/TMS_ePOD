"use client"

import { motion } from "framer-motion"
import { 
  Clock, 
  Truck, 
  MapPin, 
  PackageCheck,
  Flag,
  Activity
} from "lucide-react"
import { Job } from "@/lib/supabase/jobs"
import { cn } from "@/lib/utils"

interface TimelineStep {
    id: string
    title: string
    description: string
    time: string
    status: 'completed' | 'current' | 'upcoming'
    icon: React.ElementType
    tag?: string
}

interface ActiveTripTimelineProps {
    job?: Job | null
}

export function ActiveTripTimeline({ job }: ActiveTripTimelineProps) {
    if (!job) return null

    const getStatusWeight = (status: string) => {
        const weights: Record<string, number> = {
            'New': 0,
            'Assigned': 1,
            'Confirmed': 2,
            'In Transit': 3,
            'Arrived': 4,
            'Completed': 5,
            'Close': 5
        }
        return weights[status] || 0
    }

    const currentWeight = getStatusWeight(job.Job_Status || 'New')
    let stops: any[] = []
    if (job.original_destinations_json) {
        try {
            const parsed = typeof job.original_destinations_json === 'string'
                ? JSON.parse(job.original_destinations_json)
                : job.original_destinations_json
            if (Array.isArray(parsed)) {
                stops = parsed
            }
        } catch {
            stops = []
        }
    }
    const isMultiStop = stops.length > 0

    // Build Dynamic Steps
    const steps: TimelineStep[] = [
        {
            id: "scheduled",
            title: "Scheduled",
            description: "แผนงานถูกสร้างและยืนยันแล้ว",
            time: job.Created_At ? new Date(job.Created_At).toLocaleTimeString('th-TH') : "Pending",
            status: currentWeight >= 1 ? 'completed' : 'upcoming',
            icon: Clock
        }
    ]

    // Add Confirmed/Pickup step
    steps.push({
        id: "confirmed",
        title: "Confirmed",
        description: "คนขับรับงานและเตรียมออกเดินทาง",
        time: currentWeight >= 2 ? "Confirmed" : "Pending",
        status: currentWeight > 2 ? 'completed' : (currentWeight === 2 ? 'current' : 'upcoming'),
        icon: PackageCheck
    })

    // If multi-stop, add each stop as a step
    if (isMultiStop) {
        const completedDrops = job.Signature_Url ? job.Signature_Url.split(',').filter(Boolean).length : 0
        
        stops.forEach((stop: { name?: string; lat?: number; lng?: number; status?: string; so_no?: string }, idx: number) => {
            let stopStatus: 'completed' | 'current' | 'upcoming' = 'upcoming'
            let stopTime = 'Pending'
            let isCurrent = false

            if (currentWeight >= 5) {
                stopStatus = 'completed'
                stopTime = 'Delivered'
            } else if (currentWeight >= 3) {
                if (idx < completedDrops) {
                    stopStatus = 'completed'
                    stopTime = 'Delivered'
                } else if (idx === completedDrops) {
                    stopStatus = 'current'
                    stopTime = 'In Progress'
                    isCurrent = true
                } else {
                    stopStatus = 'upcoming'
                    stopTime = 'Scheduled'
                }
            } else {
                stopStatus = 'upcoming'
                stopTime = 'Scheduled'
            }

            steps.push({
                id: `stop-${idx}`,
                title: `Stop ${idx + 1}: ${stop.name || 'Unknown'}`,
                description: stop.so_no 
                    ? `ใบสั่งซื้อ (SO): ${stop.so_no}` 
                    : "จุดจอดพักหรือส่งสินค้ากึ่งกลาง",
                time: stopTime,
                status: stopStatus,
                icon: MapPin,
                tag: isCurrent ? "Next Stop" : undefined
            })
        })
    } else {
        // Standard On Route
        steps.push({
            id: "on-route",
            title: "On Route",
            description: "อยู่ระหว่างการขนส่ง",
            time: currentWeight >= 3 ? "In Progress" : "Pending",
            status: currentWeight > 3 ? 'completed' : (currentWeight === 3 ? 'current' : 'upcoming'),
            icon: Truck
        })
    }

    // Arrived at Final Destination
    steps.push({
        id: "arrived",
        title: "Arrived",
        description: `ถึงจุดหมายปลายทาง: ${job.Dest_Location || 'N/A'}`,
        time: currentWeight >= 4 ? "Arrived" : "Pending",
        status: currentWeight > 4 ? 'completed' : (currentWeight === 4 ? 'current' : 'upcoming'),
        icon: MapPin
    })

    // Complete
    steps.push({
        id: "completed",
        title: "Complete",
        description: "ส่งมอบสำเร็จและปิดงาน",
        time: currentWeight >= 5 ? "Done" : "Pending",
        status: currentWeight >= 5 ? 'completed' : 'upcoming',
        icon: Flag
    })

    return (
        <div className="bg-white border border-gray-100 rounded-[2.5rem] overflow-hidden shadow-2xl p-6">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Activity className="text-emerald-500" size={20} />
                        Job Status
                    </h3>
                    <p className="text-gray-800 font-bold text-lg font-bold uppercase tracking-widest">Job ID: {job.Job_ID}</p>
                </div>
                <div className="bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-base font-bold font-black text-emerald-700 uppercase">Live Tracking</span>
                </div>
            </div>

            <div className="relative space-y-1">
                {/* Vertical Line Connector */}
                <div className="absolute left-[19px] top-2 bottom-6 w-0.5 bg-gray-100" />
                
                {steps.map((step, idx) => (
                    <motion.div 
                        key={step.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="relative flex gap-4 pb-6 group"
                    >
                        {/* Dot / Icon Container */}
                        <div className={cn(
                            "relative z-10 w-10 min-w-10 h-10 rounded-full flex items-center justify-center border-4 border-white transition-all duration-300 shadow-sm",
                            step.status === 'completed' ? "bg-emerald-500 text-white" :
                            step.status === 'current' ? "bg-amber-500 text-white ring-4 ring-amber-500/20" :
                            "bg-gray-50 text-gray-400 group-hover:bg-gray-100"
                        )}>
                            <step.icon size={16} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 pt-1">
                            <div className="flex items-center justify-between mb-1">
                                <h4 className={cn(
                                    "text-xl font-black tracking-tight",
                                    step.status === 'upcoming' ? "text-gray-400" : "text-gray-900"
                                )}>
                                    {step.title}
                                </h4>
                                <span className={cn(
                                    "text-base font-bold font-bold uppercase tracking-tighter",
                                    step.status === 'completed' ? "text-emerald-600" :
                                    step.status === 'current' ? "text-amber-600 font-black animate-pulse" :
                                    "text-gray-400"
                                )}>
                                    {step.time}
                                </span>
                            </div>
                            <p className={cn(
                                "text-lg font-bold font-medium leading-relaxed",
                                step.status === 'upcoming' ? "text-gray-300" : "text-gray-600"
                            )}>
                                {step.description}
                            </p>
                            
                            {step.tag && (
                                <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-base font-bold font-black uppercase tracking-wider border border-red-100">
                                    <Clock size={10} />
                                    {step.tag}
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>

            <button className="w-full mt-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-2xl text-base font-bold font-black text-gray-700 uppercase tracking-widest transition-colors border border-gray-100">
                View All details
            </button>
        </div>
    )
}

