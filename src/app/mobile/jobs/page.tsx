import { getDriverSession } from "@/lib/actions/auth-actions"
import { redirect } from "next/navigation"
import { MobileHeader } from "@/components/mobile/mobile-header"

export const dynamic = 'force-dynamic'
import { MapPin, Clock, Search, Truck, ChevronRight, ArrowRight, Calendar } from "lucide-react"
import Link from "next/link"
import { getDriverJobs } from "@/lib/supabase/jobs"
import { MobileJobFilter } from "@/components/mobile/job-filter"
import { MobileJobSearchList } from "@/components/mobile/job-search-list"
import { cn } from "@/lib/utils"
import { RealtimeJobsTrigger } from "@/components/mobile/realtime-jobs-trigger"
import { Suspense } from "react"
import JobsLoading from "./loading"

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function JobsContent({ driverId, searchParams }: { driverId: string, searchParams: any }) {
  const dateFrom = (searchParams.dateFrom as string) || undefined
  const dateTo = (searchParams.dateTo as string) || undefined
  const status = (searchParams.status as string) || undefined

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

  // Fetch jobs for this driver with filters
  const jobs = await getDriverJobs(driverId, { startDate: dateFrom, endDate: dateTo, status })

  // Scalability: Hide old completed/cancelled jobs from default view
  let displayJobs = jobs
  if (!status || status === 'All') {
      displayJobs = jobs.filter(j => {
          // Keep active jobs regardless of date
          if (j.Job_Status !== 'Completed' && j.Job_Status !== 'Cancelled') return true;
          // Keep completed jobs ONLY if a date filter was explicitly selected, or it's today/future
          if (dateFrom || dateTo) return true; 
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
                <div className="inline-flex items-center gap-1.5 h-11 px-4 bg-primary/10 rounded-2xl border border-primary/20 shadow-sm">
                    <span className="text-primary font-black text-xl leading-none">{displayJobs.length}</span>
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">งาน</span>
                </div>
            </div>
        </div>

        {/* Search Bar & Job List - Integrated with dynamic client-side filtering */}
        <MobileJobSearchList jobs={displayJobs} />
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
      
      <MobileHeader title="Management" rightElement={<MobileJobFilter searchParams={searchParams} />} />
      
      <Suspense fallback={<JobsLoading />}>
          <JobsContent driverId={session.driverId} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}


