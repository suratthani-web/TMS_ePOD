import { getJobsForBilling } from "@/lib/supabase/jobs"
import { getActiveDrivers } from "@/lib/supabase/drivers"
import { getCompanyProfile } from "@/lib/supabase/settings"
import { getAllSubcontractors } from "@/lib/supabase/subcontractors"
import DriverPaymentClient from "./client-page"

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string
    dateTo?: string
  }>
}

export default async function DriverPaymentPage({ searchParams }: PageProps) {
  const params = await searchParams
  const dateFrom = params.dateFrom || undefined
  const dateTo = params.dateTo || undefined

  const [jobs, drivers, companyProfile, subcontractors] = await Promise.all([
    getJobsForBilling(undefined, dateFrom, dateTo, 'driver'),
    getActiveDrivers(),
    getCompanyProfile(),
    getAllSubcontractors()
  ])

  return (
    <DriverPaymentClient 
      initialJobs={jobs} 
      drivers={drivers} 
      companyProfile={companyProfile} 
      subcontractors={subcontractors}
      initialDateFrom={dateFrom}
      initialDateTo={dateTo}
    />
  )
}
