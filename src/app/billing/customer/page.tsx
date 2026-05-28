import { getJobsForBilling } from "@/lib/supabase/jobs"
import { getCompanyProfile } from "@/lib/supabase/settings"
import { getAllCustomers } from "@/lib/supabase/customers"
import { getBillingNotes } from "@/lib/supabase/billing"
import CustomerBillingClient from "./client-page"

export const dynamic = 'force-dynamic'

export default async function CustomerBillingPage() {
  const companyProfile = await getCompanyProfile()
  const customers = await getAllCustomers()
  const billingNotes = await getBillingNotes({ status: 'Pending' })

  return (
    <CustomerBillingClient 
        companyProfile={companyProfile} 
        customers={customers.data} 
        initialBillingNotes={billingNotes}
    />
  )
}
