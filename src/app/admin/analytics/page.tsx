import { Suspense } from "react"
import { isSuperAdmin, getUserBranchId, hasPermission } from "@/lib/permissions"
import { AnalyticsAccessDenied } from "@/components/analytics/analytics-subpage"
import { cookies } from "next/headers"
import { DashboardContent } from "@/components/analytics/dashboard-content"
import { getMaintenanceSchedule } from "@/lib/supabase/maintenance-schedule"
import { AnalyticsClient } from "./analytics-client"

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
  const searchParams = await props.searchParams
  const superAdmin = await isSuperAdmin()
  const canAccess = superAdmin || (await hasPermission('navigation.analytics'))
  if (!canAccess) return <AnalyticsAccessDenied />

  const userBranchId = await getUserBranchId()
  const branchId = (userBranchId && userBranchId !== 'All') ? userBranchId : (searchParams.branch || 'All')
  const maintenance = await getMaintenanceSchedule()

  return (
    <div className="space-y-12 pb-20 p-4 lg:p-10 bg-background">
        <AnalyticsClient 
            overdueCount={maintenance.overdue.length} 
            isSuperAdmin={canAccess} 
        />

        {/* Main Intelligence Grid */}
        <Suspense fallback={<AnalyticsContentSkeleton />}>
            <DashboardContent 
                startDate={searchParams.startDate} 
                endDate={searchParams.endDate} 
                branchId={branchId} 
            />
        </Suspense>
    </div>
  )
}

function AnalyticsContentSkeleton() {
  return (
    <div className="space-y-8 animate-pulse p-4 lg:p-10">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-56 bg-card rounded-2xl border border-border shadow-sm" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[600px] bg-card rounded-2xl shadow-sm border border-border" />
        <div className="h-[600px] bg-card rounded-2xl shadow-sm border border-border" />
      </div>
    </div>
  )
}
