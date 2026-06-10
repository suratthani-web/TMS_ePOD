"use client"

import { useState, useTransition, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
  ChevronLeft, 
  ChevronRight, 
  MapPin, 
  Truck, 
  User, 
  Plus, 
  Zap, 
  Target, 
  Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CalendarJob, getJobsForMonth, getJobById } from "./actions"
import { JobDialog } from "@/components/planning/job-dialog"
import { Driver } from "@/lib/supabase/drivers"
import { Vehicle } from "@/lib/supabase/vehicles"
import { Customer } from "@/lib/supabase/customers"
import { Route } from "@/lib/supabase/routes"
import { Job } from "@/lib/supabase/jobs"
import { PremiumButton } from "@/components/ui/premium-button"
import { useLanguage } from "@/components/providers/language-provider"
import { toast } from "sonner"

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-muted-foreground",
  Pending: "bg-amber-500",
  Confirmed: "bg-[#00f2ff]", // Cyan
  "In Progress": "bg-[#7000ff]", // Electric Purple
  Delivered: "bg-[#00ff88]", // Neon Green
  Completed: "bg-[#00ff88]",
  Finished: "bg-[#00ff88]",
  Closed: "bg-muted-foreground",
  Cancelled: "bg-primary", // Magenta for cancelled
}

interface Props {
  initialJobs: CalendarJob[]
  initialYear: number
  initialMonth: number
  drivers: Driver[]
  vehicles: Vehicle[]
  customers: Customer[]
  routes: Route[]
}

export function CalendarClient({ 
  initialJobs, 
  initialYear, 
  initialMonth,
  drivers,
  vehicles,
  customers,
  routes
}: Props) {
  const { t, language } = useLanguage()
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [jobs, setJobs] = useState<CalendarJob[]>(initialJobs)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  
  const [editingJob, setEditingJob] = useState<Job | null>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)

  const STATUS_LABELS: Record<string, string> = {
    Draft: t('common.pending'),
    Pending: t('common.pending'),
    Confirmed: t('common.success'),
    "In Progress": t('common.loading'),
    Delivered: t('common.success'),
    Completed: t('common.success'),
    Finished: t('common.success'),
    Closed: t('common.success'),
    Cancelled: t('common.error'),
  }

  const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

  useEffect(() => {
    setJobs(initialJobs)
  }, [initialJobs])

  const changeMonth = (delta: number) => {
    let newMonth = month + delta
    let newYear = year
    if (newMonth < 1) { newMonth = 12; newYear-- }
    if (newMonth > 12) { newMonth = 1; newYear++ }
    setMonth(newMonth)
    setYear(newYear)
    setSelectedDate(null)
    startTransition(async () => {
      const data = await getJobsForMonth(newYear, newMonth)
      setJobs(data)
    })
  }

  const goToToday = () => {
    const now = new Date()
    const newYear = now.getFullYear()
    const newMonth = now.getMonth() + 1
    setYear(newYear)
    setMonth(newMonth)
    setSelectedDate(formatDate(now))
    startTransition(async () => {
      const data = await getJobsForMonth(newYear, newMonth)
      setJobs(data)
    })
  }

  const handleEditJob = async (jobId: string) => {
    try {
      setLoadingEdit(true)
      const fullJob = await getJobById(jobId)
      if (fullJob) {
        setEditingJob(fullJob)
        setIsEditOpen(true)
      } else {
        toast.error(t('calendar.error_data'))
      }
    } catch (err) {
      console.error(err)
      toast.error(t('calendar.error_uplink'))
    } finally {
      setLoadingEdit(false)
    }
  }

  const jobsByDate: Record<string, CalendarJob[]> = {}
  jobs.forEach((job: CalendarJob) => {
    const d = job.Plan_Date
    if (!jobsByDate[d]) jobsByDate[d] = []
    jobsByDate[d].push(job)
  })

  const firstDayOfMonth = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const todayStr = formatDate(new Date())
  const selectedJobs = selectedDate ? (jobsByDate[selectedDate] || []) : []
  const statusCounts: Record<string, number> = {}
  jobs.forEach((j: CalendarJob) => { statusCounts[j.Job_Status] = (statusCounts[j.Job_Status] || 0) + 1 })

  return (
    <div className="space-y-8 pb-20">
      <div className="bg-card p-8 rounded-2xl border border-border shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
          <div>
            <div className="flex items-center gap-4 mb-4">
               <div className="w-1.5 h-8 bg-primary rounded-full" />
               <h1 className="text-3xl font-semibold text-foreground leading-tight">{t('navigation.calendar')}</h1>
            </div>
            <p className="text-muted-foreground font-medium text-sm">{t('dashboard.subtitle')}</p>
          </div>
          <div className="flex items-center gap-4">
             <PremiumButton onClick={goToToday} variant="outline" className="border-border hover:border-primary/50 text-muted-foreground h-14 px-8 rounded-2xl">
                {t('calendar.today')}
             </PremiumButton>
             <PremiumButton onClick={() => setIsDialogOpen(true)} className="h-14 px-8 rounded-2xl gap-3">
                <Plus size={20} /> {t('navigation.request_mission')}
             </PremiumButton>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 px-2">
         {Object.entries(statusCounts).map(([status, count]) => (
            <div key={status} className="bg-card hover:bg-muted/30 border border-border p-5 rounded-2xl flex items-center justify-between group transition-all shadow-sm">
                <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{STATUS_LABELS[status] || status}</span>
                    <span className="text-3xl font-semibold text-foreground tabular-nums">{count}</span>
                </div>
                <div className={cn("w-1.5 h-12 rounded-full shadow-sm", STATUS_COLORS[status] || "bg-muted-foreground")} />
            </div>
         ))}
      </div>

      {/* Main Calendar Matrix */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Navigation Control */}
        <div className="flex items-center justify-between px-10 py-10 bg-muted/20 border-b border-border">
          <button onClick={() => changeMonth(-1)} className="p-4 rounded-2xl bg-background hover:bg-primary hover:text-primary-foreground transition-all text-muted-foreground border border-border shadow-sm">
            <ChevronLeft size={24} />
          </button>
          <div className="text-center">
             <h2 className="text-3xl font-semibold text-foreground flex items-center gap-3">
                {t(`months.${monthKeys[month-1]}` as any)} <span className="text-primary px-3 py-1 bg-primary/10 rounded-xl">{language === 'th' ? year + 543 : year}</span>
             </h2>
             {isPending && <div className="text-xs font-medium text-primary animate-pulse mt-2">{t('calendar.syncing')}</div>}
          </div>
          <button onClick={() => changeMonth(1)} className="p-4 rounded-2xl bg-background hover:bg-primary hover:text-primary-foreground transition-all text-muted-foreground border border-border shadow-sm">
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Day Header Matrix */}
        <div className="grid grid-cols-7 bg-muted/5 border-b border-border">
          {dayKeys.map((dayKey, i) => {
            const dayConfig = [
              { text: "text-rose-500", bg: "bg-rose-500/5" },    // Sun - Red
              { text: "text-amber-500", bg: "bg-amber-500/5" },  // Mon - Yellow
              { text: "text-pink-500", bg: "bg-pink-500/5" },    // Tue - Pink
              { text: "text-emerald-600", bg: "bg-emerald-600/5" }, // Wed - Green
              { text: "text-orange-500", bg: "bg-orange-500/5" }, // Thu - Orange
              { text: "text-sky-500", bg: "bg-sky-500/5" },     // Fri - Blue
              { text: "text-violet-500", bg: "bg-violet-500/5" }  // Sat - Purple
            ][i];
            
            return (
              <div key={i} className={cn(
                "text-center py-6 text-sm font-semibold",
                dayConfig.text,
                dayConfig.bg
              )}>
                {t(`days.${dayKey}` as any)}
              </div>
            );
          })}
        </div>

        {/* Temporal Grid */}
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={i} className="min-h-[140px] border-b border-r border-border bg-muted/40" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const dayJobs = jobsByDate[dateStr] || []
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDate
            const dayOfWeek = new Date(year, month - 1, day).getDay()

            return (
              <motion.div
                key={dateStr}
                whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={cn(
                  "min-h-[140px] border-b border-r border-border p-4 cursor-pointer relative group transition-all",
                  isSelected && "bg-primary/10 ring-2 ring-primary inset-0 z-10",
                  isToday && "bg-primary/5"
                )}
              >
                <div className="flex items-center justify-between mb-4">
                   <span className={cn(
                     "text-xl font-semibold w-12 h-12 flex items-center justify-center rounded-2xl transition-transform group-hover:scale-105",
                     isToday ? "bg-primary text-primary-foreground" : 
                     dayOfWeek === 0 ? "text-rose-600 bg-rose-500/10" : 
                     dayOfWeek === 6 ? "text-indigo-600 bg-indigo-500/10" :
                     "text-foreground/80 bg-muted/30 group-hover:text-primary group-hover:bg-primary/5"
                   )}>
                     {day}
                   </span>
                   {dayJobs.length > 0 && (
                     <div className="px-3 py-1 rounded-xl bg-primary text-xs font-semibold text-primary-foreground">
                        {dayJobs.length} {t('calendar.ops')}
                     </div>
                   )}
                </div>

                <div className="space-y-1.5">
                   {dayJobs.slice(0, 3).map(job => (
                      <div key={job.Job_ID} className={cn(
                        "h-6 px-2 rounded-md flex items-center gap-2 border border-border transition-colors group/bar overflow-hidden relative"
                      )}>
                        {/* Side Indicator */}
                        <div className={cn("absolute left-0 top-0 bottom-0 w-1 shadow-sm", STATUS_COLORS[job.Job_Status] || "bg-muted-foreground")} />
                        
                        {/* Tinted Background */}
                        <div className={cn("absolute inset-0 opacity-10", STATUS_COLORS[job.Job_Status] || "bg-muted-foreground")} />

                        <span className="relative z-10 text-xs font-medium text-foreground truncate pl-1.5">
                          {job.Customer_Name || job.Job_ID}
                        </span>
                      </div>
                   ))}
                   {dayJobs.length > 3 && (
                     <div className="text-xs font-medium text-muted-foreground text-center py-1 opacity-70">
                        + {dayJobs.length - 3} {t('calendar.more')}
                     </div>
                   )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Selected Node Interface */}
      <AnimatePresence mode="wait">
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden mt-12"
          >
            <div className="px-10 py-8 border-b border-border bg-muted/30 flex items-center justify-between relative overflow-hidden">
               <div className="absolute top-0 left-0 w-32 h-32 bg-primary/10 blur-[60px] pointer-events-none" />
               <div className="relative z-10 flex items-center gap-4">
                  <Target className="text-primary" size={24} />
                  <h3 className="text-xl font-semibold text-foreground">
                    {t('calendar.node_selected')}: {new Date(selectedDate + 'T00:00:00').toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </h3>
               </div>
               <div className="bg-primary/10 text-primary border-primary/20 font-semibold text-base px-6 h-10 flex items-center rounded-full border">
                  {selectedJobs.length} {t('navigation.monitoring')}
               </div>
            </div>

             <div className="p-10">
               {selectedJobs.length === 0 ? (
                 <div className="py-20 flex flex-col items-center opacity-30">
                    <Zap size={48} className="text-muted-foreground mb-6" />
                    <p className="text-foreground">{t('calendar.no_missions')}</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {selectedJobs.map(job => (
                        <div 
                          key={job.Job_ID} 
                          onClick={() => handleEditJob(job.Job_ID)}
                          className={cn(
                            "bg-card border border-border rounded-2xl p-6 hover:bg-muted/20 transition-all group relative overflow-hidden shadow-sm cursor-pointer",
                            loadingEdit && "opacity-50 pointer-events-none cursor-wait"
                          )}
                        >
                            <div className={cn("absolute top-0 right-0 w-1.5 h-20 rounded-bl-3xl", STATUS_COLORS[job.Job_Status] || "bg-muted-foreground")} />
                            
                             <div className="flex items-center justify-between mb-6">
                               <div className={cn("px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2", "bg-muted/30 border border-border")}>
                                 <div className={cn("w-2 h-2 rounded-full", STATUS_COLORS[job.Job_Status] || "bg-muted-foreground")} />
                                 <span className="text-foreground">{STATUS_LABELS[job.Job_Status] || job.Job_Status}</span>
                               </div>
                               <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">{job.Job_ID.slice(-8)}</span>
                            </div>

                            <h4 className="text-lg font-semibold text-foreground mb-6 truncate leading-tight">
                              {job.Customer_Name || t('common.loading')}
                            </h4>

            <div className="space-y-4">
                                <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                                   <MapPin size={14} className="text-primary" />
                                   <span className="truncate">{job.Route_Name || job.Dest_Location}</span>
                                </div>
                                 <div className="flex items-center gap-6 border-t border-border pt-4">
                                   <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                                      {loadingEdit ? <Loader2 size={12} className="animate-spin" /> : <User size={12} className="text-primary" />} {job.Driver_Name || t('common.auto')}
                                    </div>
                                   <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                                      <Truck size={12} /> {job.Vehicle_Plate || '-'}
                                   </div>
                                </div>
                            </div>
                        </div>
                    ))}
                 </div>
               )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <JobDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        mode="create"
        drivers={drivers}
        vehicles={vehicles}
        customers={customers}
        routes={routes}
        defaultDate={selectedDate || undefined}
      />

       {/* Edit Modal */}
       {editingJob && (
          <JobDialog
            mode="edit"
            job={editingJob}
            open={isEditOpen}
            onOpenChange={setIsEditOpen}
            drivers={drivers}
            vehicles={vehicles}
            customers={customers}
            routes={routes}
            canDelete
          />
       )}
    </div>
  )
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
