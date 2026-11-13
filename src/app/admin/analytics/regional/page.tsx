import { getRegionalDeepDive } from "@/lib/supabase/analytics"
import { isSuperAdmin, hasPermission } from "@/lib/permissions"
import { AnalyticsAccessDenied } from "@/components/analytics/analytics-subpage"
import { RegionalView, type RegionalBranch } from "./regional-view"

export const dynamic = "force-dynamic"

export default async function RegionalAnalyticsPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
  const searchParams = await props.searchParams
  const canAccess = (await isSuperAdmin()) || (await hasPermission("navigation.analytics"))
  if (!canAccess) return <AnalyticsAccessDenied />

  const branches = (await getRegionalDeepDive(searchParams.startDate, searchParams.endDate)) as RegionalBranch[]

  return (
    <div className="space-y-6 pb-20 p-4 lg:p-10 bg-background">
      <RegionalView branches={branches} />
    </div>
  )
}
