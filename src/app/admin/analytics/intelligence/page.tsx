import { getVehicleRiskAssessment, getRouteRiskProfile } from "@/lib/supabase/predictive-analytics"
import { isSuperAdmin } from "@/lib/permissions"
import { cookies } from "next/headers"
import { AnalyticsAccessDenied } from "@/components/analytics/analytics-subpage"
import { IntelligenceClient } from "./intelligence-client"

export const dynamic = "force-dynamic"

export default async function IntelligencePage(props: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
  const searchParams = await props.searchParams
  const cookieStore = await cookies()
  const branchId = searchParams.branch || cookieStore.get("selectedBranch")?.value || 'All'
  const superAdmin = await isSuperAdmin()
  if (!superAdmin) return <AnalyticsAccessDenied />

  const [vehicleRisks, routeRisks] = await Promise.all([
    getVehicleRiskAssessment(branchId),
    getRouteRiskProfile(branchId)
  ])

  return (
    <div className="space-y-6 pb-20 p-4 lg:p-10 bg-background">
      <IntelligenceClient vehicleRisks={vehicleRisks} routeRisks={routeRisks} branchId={branchId} superAdmin={superAdmin} />
    </div>
  )
}
