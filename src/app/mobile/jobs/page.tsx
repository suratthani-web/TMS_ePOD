import { getDriverSession } from "@/lib/actions/auth-actions"
import { redirect } from "next/navigation"
import { MobileHeader } from "@/components/mobile/mobile-header"

export const dynamic = 'force-dynamic'
import { MapPin, Clock, Search, Truck, ChevronRight, ArrowRight, Calendar } from "lucide-react"
import Link from "next/link"
import { getDriverJobs } from "@/lib/supabase/jobs"
import { MobileJobFilter } from "@/components/mobile/job-filter"
import { cn } from "@/lib/utils"
import { RealtimeJobsTrigger } from "@/components/mobile/realtime-jobs-trigger"
import { MobileRefreshButton } from "@/components/mobile/refresh-button"
import { Suspense } from "react"
import JobsLoading from "./loading"

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function JobsContent({ driverId, searchParams }: { driverId: string, searchParams: any }) {
  const date = (searchParams.date as string) || undefined
  const status = (searchParams.status as string) || undefined

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

  // Fetch jobs for this driver with filters
  const jobs = await getDriverJobs(driverId, { startDate: date, endDate: date, status })

  // Scalability: Hide old completed/cancelled jobs from default view
  let displayJobs = jobs
  if (!status || status === 'All') {
      displayJobs = jobs.filter(j => {
          // Keep active jobs regardless of date
          if (j.Job_Status !== 'Completed' && j.Job_Status !== 'Cancelled') return true;
          // Keep completed jobs ONLY if it is explicitly the date filtered, or it's today/future
          if (date) return true; 
          return j.Plan_Date && j.Plan_Date >= today
      })
  }

  return (
    <div className="relative z-10 space-y-8">
        {/* Header Section */}
        <div className="flex justify-between items-end px-1">
            <div className="space-y-1">
                <p className="text-accent text-xs font-black uppercase tracking-[0.3em]">LogisPro Fleet</p>
                <h2 className="text-4xl font-black text-foreground tracking-tighter uppercase italic">รายการงาน</h2>
            </div>
            <div className="flex items-center gap-3 pb-1">
                <MobileRefreshButton />
                <div className="inline-flex items-center gap-1.5 h-11 px-4 bg-primary/10 rounded-2xl border border-primary/20 shadow-sm">
                    <span className="text-primary font-black text-xl leading-none">{displayJobs.length}</span>
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">งาน</span>
                </div>
            </div>
        </div>

        {/* Search Bar - Premium Style */}
        <div className="relative group">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                <Search size={20} />
            </div>
            <input 
                type="text" 
                placeholder="ค้นหาเลขงาน, ชื่อลูกค้า..." 
                className="w-full h-16 pl-14 pr-6 rounded-3xl bg-card/50 backdrop-blur-xl border border-border/10 text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all font-bold text-lg shadow-sm"
            />
        </div>

        {/* Job Grid / List */}
        <div className="space-y-4">
            {displayJobs.length === 0 ? (
                <div className="text-center py-20 bg-muted/20 rounded-3xl border-2 border-dashed border-border/50">
                    <Truck className="text-muted-foreground/30 mx-auto mb-4" size={48} />
                    <p className="text-muted-foreground font-bold">ไม่พบรายการงานในขณะนี้</p>
                </div>
            ) : displayJobs.map((job) => (
            <Link href={`/mobile/jobs/${job.Job_ID}`} key={job.Job_ID} className="block active:scale-[0.98] transition-all">
                <div className="bg-card p-6 rounded-3xl border border-border shadow-sm space-y-4">
                    {/* Status & Date */}
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                             <Calendar size={14} className="text-primary" />
                             <span className="text-xs font-bold text-foreground">
                                {job.Pickup_Date ? new Date(job.Pickup_Date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : "ไม่ระบุวันที่"}
                             </span>
                        </div>
                        <div className={cn(
                            "px-3 py-1 rounded-lg text-[10px] font-bold uppercase",
                            job.Job_Status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 
                            ['In Progress', 'In Transit', 'Arrived'].includes(job.Job_Status) ? 'bg-primary/10 text-primary' :
                            'bg-muted text-muted-foreground'
                        )}>
                            {job.Job_Status === 'Completed' ? 'สำเร็จ' : 
                             ['In Progress', 'In Transit', 'Arrived'].includes(job.Job_Status) ? 'กำลังดำเนินการ' : 
                             'รอเริ่มงาน'}
                        </div>
                    </div>

                    {/* Customer */}
                    <div className="space-y-1">
                        <h3 className="text-xl font-bold text-foreground leading-tight">{job.Customer_Name}</h3>
                        <p className="text-xs font-medium text-muted-foreground">#{job.Job_ID.slice(-8).toUpperCase()}</p>
                    </div>

                    {/* Route */}
                    <div className="flex items-start gap-3 pt-2 border-t border-border/50">
                        <MapPin size={16} className="text-accent mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">จุดส่งสินค้า</p>
                            <p className="text-sm font-medium text-foreground truncate">
                                {job.Dest_Location || job.Route_Name}
                            </p>
                        </div>
                        <ChevronRight size={20} className="text-muted-foreground/30 self-center" />
                    </div>
                </div>
            </Link>
            ))}
        </div>
    </div>
  )
}

export default async function DriverJobsPage(props: Props) {
  const searchParams = await props.searchParams
  const session = await getDriverSession()
  if (!session) redirect("/mobile/login")

  return (
    <div className="min-h-screen bg-background pb-32 pt-24 px-6 relative overflow-hidden">
       {/* High-end Background Decor */}
      <div className="absolute top-0 right-[-10%] w-[600px] h-[600px] bg-primary/5 rounded-full blur-[140px] -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-[-10%] w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />
      
      <MobileHeader title="Management" rightElement={<MobileJobFilter />} />
      
      <Suspense fallback={<JobsLoading />}>
          <JobsContent driverId={session.driverId} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}


