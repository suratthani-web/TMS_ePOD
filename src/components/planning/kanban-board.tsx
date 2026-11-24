"use client"

import { useState, useMemo } from "react"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Job } from "@/lib/supabase/jobs"
import { useCustomerColor } from "@/components/providers/customer-color-provider"
import { Driver } from "@/lib/supabase/drivers"
import { Vehicle } from "@/lib/supabase/vehicles"
import { Customer } from "@/lib/supabase/customers"
import { Route } from "@/lib/supabase/routes"
import { Subcontractor } from "@/types/subcontractor"
import { Badge } from "@/components/ui/badge"
import { PremiumCard } from "@/components/ui/premium-card"
import {
  MapPin,
  Calendar,
  Truck,
  Package,
  MoreVertical,
  User,
  Zap,
  Target
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fmtDateTH } from "@/lib/utils/date-th"
import { updateJob } from "@/app/planning/actions"
import { toast } from "sonner"
import { JobDialog } from "./job-dialog"
import { formatSoLabel } from "@/lib/utils/so-helpers"

interface KanbanBoardProps {
  jobs: Job[]
  drivers: Driver[]
  vehicles: Vehicle[]
  customers: Customer[]
  routes: Route[]
  subcontractors: Subcontractor[]
  canViewIncome: boolean
  canViewExpense: boolean
  canAssign: boolean
  canDelete: boolean
}

type ColumnId = "New" | "Assigned" | "In Transit" | "Delivered" | "Completed"

interface Column {
  id: ColumnId
  title: string
  statuses: string[]
  color: string
}

const COLUMNS: Column[] = [
  { id: "New", title: "NEW ORDERS", statuses: ["New", "Pending"], color: "emerald" },
  { id: "Assigned", title: "ASSIGNED", statuses: ["Assigned", "Confirmed"], color: "blue" },
  { id: "In Transit", title: "IN TRANSIT", statuses: ["In Progress", "In Transit", "Accepted", "Arrived Pickup", "Arrived Dropoff"], color: "amber" },
  { id: "Delivered", title: "DELIVERED", statuses: ["Delivered"], color: "teal" },
  { id: "Completed", title: "COMPLETED", statuses: ["Completed"], color: "gray" },
]

export function KanbanBoard({
  jobs: initialJobs,
  drivers,
  vehicles,
  customers,
  routes,
  subcontractors,
  canViewIncome,
  canViewExpense,
  canAssign,
  canDelete
}: KanbanBoardProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const jobsByColumn = useMemo(() => {
    const acc: Record<ColumnId, Job[]> = {
      New: [],
      Assigned: [],
      "In Transit": [],
      Delivered: [],
      Completed: [],
    }

    jobs.forEach((job) => {
      const col = COLUMNS.find((c) => c.statuses.includes(job.Job_Status || "New")) || COLUMNS[0]
      acc[col.id].push(job)
    })

    return acc
  }, [jobs])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const activeJobId = active.id as string
    const overId = over.id as string

    const activeJob = jobs.find((j) => j.Job_ID === activeJobId)
    if (!activeJob) return

    let newStatus: string | null = null
    
    if (COLUMNS.some(c => c.id === overId)) {
        newStatus = COLUMNS.find(c => c.id === overId)!.statuses[0]
    } else {
        const overJob = jobs.find(j => j.Job_ID === overId)
        if (overJob) {
            newStatus = overJob.Job_Status || "New"
        }
    }

    if (newStatus && newStatus !== activeJob.Job_Status) {
        const updatedJobs = jobs.map(j => 
            j.Job_ID === activeJobId ? { ...j, Job_Status: newStatus } : j
        )
        setJobs(updatedJobs)

        const res = await updateJob(activeJobId, { Job_Status: newStatus })
        if (res.success) {
            toast.success(`SYSTEM: DATA_PACKET_SYNC ${activeJobId} -> ${newStatus.toUpperCase()}`)
        } else {
            toast.error("PROTOCOL_ERROR: SYNC_FAILURE")
            setJobs(initialJobs)
        }
    }
  }

  const activeJob = activeId ? jobs.find(j => j.Job_ID === activeId) : null

  return (
    <div className="flex gap-8 h-[calc(100vh-380px)] overflow-x-auto pb-6 custom-scrollbar px-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {COLUMNS.map((column) => (
          <KanbanColumn 
            key={column.id} 
            column={column} 
            jobs={jobsByColumn[column.id]}
            drivers={drivers}
            vehicles={vehicles}
            customers={customers}
            routes={routes}
            subcontractors={subcontractors}
            canViewIncome={canViewIncome}
            canViewExpense={canViewExpense}
            canAssign={canAssign}
            canDelete={canDelete}
          />
        ))}

        <DragOverlay dropAnimation={{
            sideEffects: defaultDropAnimationSideEffects({
                styles: {
                    active: {
                        opacity: '0.3',
                    },
                },
            }),
        }}>
          {activeJob ? (
            <div className="w-[320px] rotate-3 scale-105 transition-transform duration-500">
                <JobCard job={activeJob} isOverlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

interface KanbanColumnProps {
  column: Column
  jobs: Job[]
  drivers: Driver[]
  vehicles: Vehicle[]
  customers: Customer[]
  routes: Route[]
  subcontractors: Subcontractor[]
  canViewIncome: boolean
  canViewExpense: boolean
  canAssign: boolean
  canDelete: boolean
}

function KanbanColumn({ 
    column, 
    jobs,
    drivers,
    vehicles,
    customers,
    routes,
    subcontractors,
    canViewIncome,
    canViewExpense,
    canAssign,
    canDelete
}: KanbanColumnProps) {
  const { setNodeRef } = useSortable({
    id: column.id,
    data: {
      type: "Column",
      column,
    },
  })

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-[350px] min-w-[350px] rounded-[3rem] border p-6 backdrop-blur-2xl relative group/col transition-all duration-700",
        column.color === 'emerald' ? "bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/30 shadow-[0_20px_50px_rgba(16,185,129,0.05)]" :
        column.color === 'blue' ? "bg-blue-500/5 border-blue-500/10 hover:border-blue-500/30 shadow-[0_20px_50px_rgba(59,130,246,0.05)]" :
        column.color === 'amber' ? "bg-amber-500/5 border-amber-500/10 hover:border-amber-500/30 shadow-[0_20px_50px_rgba(245,158,11,0.05)]" :
        column.color === 'teal' ? "bg-teal-500/5 border-teal-500/10 hover:border-teal-500/30 shadow-[0_20px_50px_rgba(20,184,166,0.05)]" : 
        "bg-slate-500/5 border-slate-500/10 hover:border-slate-500/30 shadow-none"
      )}
    >
      <div className="flex items-center justify-between mb-8 px-4">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-2.5 h-2.5 rounded-full shadow-[0_0_12px_currentColor] animate-pulse",
            column.color === 'emerald' ? "text-emerald-500 bg-emerald-500" :
            column.color === 'blue' ? "text-blue-500 bg-blue-500" :
            column.color === 'amber' ? "text-amber-500 bg-amber-500" :
            column.color === 'teal' ? "text-primary bg-primary" : "text-muted-foreground bg-slate-700"
          )} />
          <h3 className="text-base font-bold font-black text-foreground uppercase tracking-[0.4em] italic leading-none">{column.title}</h3>
          <span className="text-base font-bold font-black text-muted-foreground bg-muted/50 px-3 py-1 rounded-full border border-border/5">
            {jobs.length}
          </span>
        </div>
        <button className="p-2 bg-muted/50 rounded-xl border border-border/5 text-muted-foreground hover:text-foreground transition-all">
            <Target size={14} />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto custom-scrollbar pr-2 min-h-[100px]">
        <SortableContext items={jobs.map(j => j.Job_ID)} strategy={verticalListSortingStrategy}>
          {jobs.map((job) => (
            <KanbanCard 
                key={job.Job_ID} 
                job={job} 
                drivers={drivers}
                vehicles={vehicles}
                customers={customers}
                routes={routes}
                subcontractors={subcontractors}
                canViewIncome={canViewIncome}
                canViewExpense={canViewExpense}
                canAssign={canAssign}
                canDelete={canDelete}
            />
          ))}
        </SortableContext>
        
        {jobs.length === 0 && (
            <div className="h-32 border-2 border-dashed border-border/5 rounded-[2rem] flex flex-col items-center justify-center text-muted-foreground space-y-2 group-hover/col:border-primary/20 transition-colors">
                <Zap size={24} className="opacity-10" />
                <span className="text-base font-bold font-black uppercase tracking-[0.3em] opacity-40">Drop Tactical Node</span>
            </div>
        )}
      </div>
    </div>
  )
}

interface KanbanCardProps {
  job: Job
  isDragging?: boolean
  drivers: Driver[]
  vehicles: Vehicle[]
  customers: Customer[]
  routes: Route[]
  subcontractors: Subcontractor[]
  canViewIncome: boolean
  canViewExpense: boolean
  canAssign: boolean
  canDelete: boolean
}

function KanbanCard({ 
    job, 
    isDragging,
    drivers,
    vehicles,
    customers,
    routes,
    subcontractors,
    canViewIncome,
    canViewExpense,
    canAssign,
    canDelete
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: job.Job_ID,
    data: {
      type: "Job",
      job,
    },
  })

  const style = {
    transition,
    transform: CSS.Translate.toString(transform),
  }

  if (isDragging) {
    return (
        <div 
            ref={setNodeRef}
            style={style}
            className="opacity-0 cursor-grabbing"
        >
            <JobCard job={job} />
        </div>
    )
  }

  return (
    <div 
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-pointer active:cursor-grabbing group/card"
    >
        <JobDialog 
            mode="edit"
            job={job}
            drivers={drivers}
            vehicles={vehicles}
            customers={customers}
            routes={routes}
            subcontractors={subcontractors}
            canViewIncome={canViewIncome}
            canViewExpense={canViewExpense}
            canAssign={canAssign}
            canDelete={canDelete}
            trigger={
                <div>
                     <JobCard job={job} />
                </div>
            }
        />
    </div>
  )
}

function JobCard({ job, isOverlay }: { job: Job; isOverlay?: boolean }) {
    const colorFor = useCustomerColor()
    return (
        <PremiumCard className={cn(
            "p-6 rounded-[2.5rem] bg-background/60 border-border/5 shadow-2xl transition-all duration-500 transform group-hover/card:-translate-y-1 group-hover/card:border-primary/30 relative overflow-hidden",
            isOverlay && "border-primary/40 bg-primary/10 shadow-[0_20px_50px_rgba(255,30,133,0.3)]"
        )}>
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover/card:opacity-10 group-hover/card:scale-110 transition-all duration-700">
                <Package size={60} />
            </div>
            
            <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted/50 border border-border/5 flex items-center justify-center text-foreground/40 group-hover/card:bg-primary group-hover/card:text-foreground transition-all duration-500">
                        <Package size={18} strokeWidth={2.5} />
                    </div>
                    <div>
                        <p className="text-base font-bold font-black text-foreground tracking-tighter uppercase font-display leading-none group-hover/card:text-primary transition-colors">{job.Job_ID}</p>
                        {(() => {
                            const soLabel = formatSoLabel(job.original_destinations_json, job.Ref_No)
                            return soLabel ? (
                                <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold tracking-normal truncate max-w-[160px]" title={`SO: ${soLabel}`}>
                                    SO: {soLabel}
                                </span>
                            ) : (
                                <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest mt-1 italic">Mission Node</p>
                            )
                        })()}
                    </div>
                </div>
                <Badge className={cn(
                    "border-0 text-base font-bold font-black px-3 py-1 rounded-lg uppercase tracking-widest",
                    job.Job_Status === 'New' || job.Job_Status === 'Pending' ? "bg-emerald-500/10 text-emerald-500" :
                    job.Job_Status === 'In Transit' ? "bg-amber-500/10 text-amber-500" :
                    job.Job_Status === 'Completed' ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"
                )}>
                    {job.Job_Status}
                </Badge>
            </div>

            <h4 className="text-[13px] font-black text-foreground mb-4 line-clamp-1 group-hover/card:text-primary transition-colors uppercase italic tracking-tight flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-background not-italic" style={{ backgroundColor: colorFor(job.Customer_Name) }} />
                {job.Customer_Name || 'Partner Pending'}
            </h4>

            <div className="space-y-3 mb-6">
                <div className="flex items-center gap-3 text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">
                    <MapPin size={12} className="text-primary/40" />
                    <span className="truncate max-w-[180px]">{job.Dest_Location || 'Grid TBD'}</span>
                </div>
                <div className="flex items-center gap-3 text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">
                    <Truck size={12} className="text-primary/40" />
                    <span className="group-hover/card:text-muted-foreground transition-colors">{job.Vehicle_Plate || 'Asset-TBD'}</span>
                    <span className="mx-1 opacity-20">|</span>
                    <User size={12} className="text-primary/40" />
                    <span className="truncate max-w-[120px] group-hover/card:text-muted-foreground transition-colors">{job.Driver_Name || 'Unit-PENDING'}</span>
                </div>
            </div>

            <div className="flex items-center justify-between pt-5 border-t border-border/5">
                <div className="flex flex-col gap-0.5 text-base font-bold font-black uppercase tracking-[0.2em] italic">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar size={12} className="text-muted-foreground" />
                        {job.Plan_Date || 'TBD'}
                    </div>
                    {job.Delivery_Date && (
                        <div className="flex items-center gap-2 text-primary/70">
                            <MapPin size={12} className="text-primary/40" />
                            ส่ง {fmtDateTH(job.Delivery_Date)}
                        </div>
                    )}
                </div>
                {job.Weight_Kg && job.Weight_Kg > 0 ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-muted/50 rounded-lg border border-border/5">
                        <Package size={10} className="text-primary/40" />
                        <span className="text-base font-bold font-black text-foreground/60 tracking-widest">{job.Weight_Kg} KG</span>
                    </div>
                ) : null}
            </div>
        </PremiumCard>
    )
}
