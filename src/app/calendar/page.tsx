export const dynamic = 'force-dynamic'

import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { getJobsForMonth } from "./actions"
import { CalendarClient } from "./calendar-client"
import { getJobCreationData } from "../planning/actions"
import { getUserBranchId } from "@/lib/permissions"

interface PageProps {
  searchParams: Promise<{
    branch?: string
  }>
}

export default async function CalendarPage(props: PageProps) {
  const searchParams = await props.searchParams
  const userBranchId = await getUserBranchId()
  const branch = (userBranchId && userBranchId !== 'All') ? userBranchId : (searchParams.branch || 'All')
  const currentBranchId = branch === 'All' ? undefined : branch

  const now = new Date()
  const [jobs, creationData] = await Promise.all([
    getJobsForMonth(now.getFullYear(), now.getMonth() + 1, currentBranchId),
    getJobCreationData(currentBranchId)
  ])

  return (
    <DashboardLayout>
      <CalendarClient 
        initialJobs={jobs} 
        initialYear={now.getFullYear()} 
        initialMonth={now.getMonth() + 1} 
        {...creationData}
      />
    </DashboardLayout>
  )
}
