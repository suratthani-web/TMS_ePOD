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

// Every status that means the job is no longer active for the driver. Kept in
// one place so the "hide from active view" filter and the one-job-at-a-time
// lock agree, and so a job closed as Delivered/Billed/Paid/… is recognised as
// closed (not shown as still pending). Mirrors the label groups in
// job-search-list.tsx (statusMeta).
const CLOSED_STATUSES = ['Completed', 'Complete', 'Delivered', 'Finished', 'Closed', 'Billed', 'Paid', 'Verified', 'Cancelled', 'Canceled', 'Rejected']

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
          // Keep active jobs regardless of date. A job the admin closed with ANY
          // closed status (Delivered/Billed/Paid/… — see CLOSED_STATUSES) must be
          // treated as closed here; the old short list missed most of them, so
          // those jobs kept showing as if still active.
          if (!CLOSED_STATUSES.includes(j.Job_Status || '')) return true;
          // Keep closed jobs ONLY if a date filter was explicitly selected, or it's today/future
          if (dateFrom || dateTo) return true;
          return j.Plan_Date && j.Plan_Date >= today
      })
  }

  return (
    <div className="relative z-10 space-y-5">
        {/* Header Section */}
        <div className="flex justify-between items-center px-1">
            <div>
                <h2 className="text-2xl font-bold text-foreground tracking-tight leading-none">รายการงาน</h2>
                <p className="text-muted-foreground text-xs font-medium mt-1.5">งานที่มอบหมายและประวัติการวิ่ง</p>
            </div>
            <div
                className="inline-flex items-baseline gap-1 h-10 px-3.5 rounded-xl"
                style={{ background: 'var(--pd-hi-wash)', border: '1px solid var(--pd-line)' }}
            >
                <span className="font-bold text-lg leading-none pd-num" style={{ color: 'var(--pd-hi-ink)' }}>{displayJobs.length}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--pd-hi-ink)' }}>งาน</span>
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
    <div className="min-h-full bg-background pb-32 pt-20 px-4 relative overflow-hidden">
      <MobileHeader title="รายการงาน" rightElement={<MobileJobFilter searchParams={searchParams} />} />
      
      <Suspense fallback={<JobsLoading />}>
          <JobsContent driverId={session.driverId} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}


