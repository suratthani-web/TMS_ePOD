import { getActiveJobs } from "@/lib/actions/tracking-actions"
import { TrackingHubClient } from "@/components/tracking/tracking-hub-client"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { hasPermission } from "@/lib/permissions"
import { redirect } from "next/navigation"

export const dynamic = 'force-dynamic'

export default async function CustomerTrackingPage() {
  const canAccess = await hasPermission('navigation.customer_tracking_hub')
  if (!canAccess) {
    redirect('/dashboard')
  }
  // NOTE: customers with live tracking turned off are NOT blocked here — the hub
  // still shows their job list/statuses/POD; only the live map is hidden inside
  // TrackingHubClient (per-job showLiveTracking flag). Redirecting made the menu
  // look dead ("กดแล้วเงียบ").

  const activeJobs = await getActiveJobs(true) // Customer mode true

  return (
    <div className="container mx-auto py-8">
      <Suspense fallback={<div className="h-[60vh] flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>}>
        <TrackingHubClient initialActiveJobs={activeJobs} customerMode={true} />
      </Suspense>
    </div>
  )
}
