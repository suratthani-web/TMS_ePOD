import { createAdminClient } from "@/utils/supabase/server"
import { isSuperAdmin, hasPermission, getUserBranchId } from "@/lib/permissions"
import { AnalyticsAccessDenied } from "@/components/analytics/analytics-subpage"
import { FeedbackView, type FeedbackRow } from "./feedback-view"

export const dynamic = "force-dynamic"

export default async function CustomerFeedbackPage() {
  const superAdmin = await isSuperAdmin()
  const canAccess = superAdmin || (await hasPermission("navigation.analytics"))
  if (!canAccess) return <AnalyticsAccessDenied />

  const supabase = await createAdminClient()
  const userBranchId = await getUserBranchId()

  const { data: feedback } = await supabase
    .from('job_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  const base = (feedback || []) as { id: string | number; job_id: string; rating: number | null; comment: string | null; created_at: string }[]
  const jobIds = [...new Set(base.map(f => f.job_id).filter(Boolean))]

  // job details fetched separately (no FK join on job_feedback)
  const jobs = new Map<string, { Customer_Name: string | null; Driver_Name: string | null; Branch_ID?: string | null }>()
  if (jobIds.length > 0) {
    const { data } = await supabase.from('Jobs_Main').select('Job_ID, Customer_Name, Driver_Name, Branch_ID').in('Job_ID', jobIds)
    for (const j of (data || []) as { Job_ID: string; Customer_Name: string | null; Driver_Name: string | null; Branch_ID?: string | null }[]) jobs.set(j.Job_ID, j)
  }

  let rows: FeedbackRow[] = base.map(f => ({
    id: f.id,
    job_id: f.job_id,
    rating: f.rating,
    comment: f.comment,
    created_at: f.created_at,
    customer: jobs.get(f.job_id)?.Customer_Name ?? null,
    driver: jobs.get(f.job_id)?.Driver_Name ?? null,
  }))

  if (!superAdmin && userBranchId && userBranchId !== 'All') {
    rows = rows.filter(r => jobs.get(r.job_id)?.Branch_ID === userBranchId)
  }

  return (
    <div className="space-y-6 pb-20 p-4 lg:p-10 bg-background">
      <FeedbackView feedback={rows} />
    </div>
  )
}
