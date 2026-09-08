import { getActiveJobs } from "@/lib/actions/tracking-actions"
import { TrackingHubClient } from "@/components/tracking/tracking-hub-client"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { hasPermission, isCustomer, getCustomerId } from "@/lib/permissions"
import { getCustomerShowLiveTracking } from "@/lib/supabase/customers"
import { redirect } from "next/navigation"

export const dynamic = 'force-dynamic'

export default async function CustomerTrackingPage() {
  const canAccess = await hasPermission('navigation.customer_tracking_hub')
  if (!canAccess) {
    redirect('/dashboard')
  }

  // Customers with live tracking turned off must not reach the tracking hub
  // (their vehicle position is stale/misleading). Admins are unaffected.
  if (await isCustomer()) {
    const custId = await getCustomerId()
    if (custId && !(await getCustomerShowLiveTracking(custId))) {
      redirect('/dashboard')
    }
  }

  const activeJobs = await getActiveJobs(true) // Customer mode true

  return (
    <div className="container mx-auto py-8">
      <Suspense fallback={<div className="h-[60vh] flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>}>
        <TrackingHubClient initialActiveJobs={activeJobs} customerMode={true} />
      </Suspense>
    </div>
  )
}
