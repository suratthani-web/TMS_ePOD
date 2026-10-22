import { getDetailedDriverAnalytics } from "@/lib/supabase/analytics"
import { cookies } from "next/headers"
import { isSuperAdmin } from "@/lib/permissions"
import { evaluateDriverPerformance } from "@/services/driver-evaluation"
import { AnalyticsAccessDenied } from "@/components/analytics/analytics-subpage"
import { getThaiMonthBoundaries, formatDateSafe } from "@/lib/supabase/analytics-helpers"
import { DriversView, type DriverRow } from "./drivers-view"

export const dynamic = "force-dynamic"

export default async function DriverLeaderboardPage(props: {
  searchParams: Promise<{ [key: string]: string | undefined }>
}) {
  const searchParams = await props.searchParams
  const cookieStore = await cookies()
  const branchId = searchParams.branch || cookieStore.get("selectedBranch")?.value || "All"
  if (!(await isSuperAdmin())) return <AnalyticsAccessDenied />

  // default to the current month (the month filter's default) instead of an open range
  const { start, end } = getThaiMonthBoundaries()
  const startDate = searchParams.startDate || formatDateSafe(start)!
  const endDate = searchParams.endDate || formatDateSafe(end)!

  const rawDrivers = await getDetailedDriverAnalytics(startDate, endDate, branchId)
  const drivers: DriverRow[] = rawDrivers
    .map(d => ({
      ...d,
      evaluation: evaluateDriverPerformance({
        completedJobs: d.completedJobs,
        totalJobs: d.totalJobs,
        onTimeJobs: d.onTimeJobs,
        avgRating: d.avgRating,
        totalEarnings: d.totalEarnings,
        isSubcontractor: !!d.subId,
      }),
    }))
    .sort((a, b) => b.completedJobs - a.completedJobs || b.evaluation.score - a.evaluation.score)

  return (
    <div className="space-y-6 pb-20 p-4 lg:p-10 bg-background">
      <DriversView drivers={drivers} branchId={branchId} />
    </div>
  )
}
