import { notFound } from "next/navigation"
import { getJobById } from "@/lib/supabase/jobs"
import { getDriverRouteForDate } from "@/lib/supabase/gps"
import { JobDetailClient } from "@/components/admin/job-detail-client"

// Force dynamic rendering (server-side) to ensure fresh data
export const dynamicParams = true
export const revalidate = 0

export default async function AdminJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const job = await getJobById(id)

  if (!job) {
    notFound()
  }

  // Fetch Route History if driver and date exist
  let routeHistory: [number, number][] = []
  if (job.Driver_ID && job.Plan_Date) {
    const logs = await getDriverRouteForDate(job.Driver_ID, job.Plan_Date)
    routeHistory = logs.map((log: { Latitude?: number; Longitude?: number }) => [Number(log.Latitude), Number(log.Longitude)] as [number, number])
  }

  return <JobDetailClient job={job} routeHistory={routeHistory} />
}
