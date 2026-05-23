export const dynamic = 'force-dynamic'
export const revalidate = 0

import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { getAllJobs, getJobStatsSummary } from "@/lib/supabase/jobs"
import { getJobCreationData } from "@/app/planning/actions"
import { isCustomer, hasPermission, getUserBranchId } from "@/lib/permissions"
import { HistoryClient } from "./history-client"
import { ShieldCheck } from "lucide-react"

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function JobHistoryPage(props: Props) {
  const customerMode = await isCustomer()
  const searchParams = await props.searchParams
  const userBranchId = await getUserBranchId()
  const branch = (userBranchId && userBranchId !== 'All') ? userBranchId : ((searchParams.branch as string) || 'All')
  const currentBranchId = branch === 'All' ? undefined : branch

  const page = Number(searchParams.page) || 1
  const query = (searchParams.q as string) || ''
  const dateFrom = (searchParams.from as string) || ''
  const dateTo = (searchParams.to as string) || ''
  const status = (searchParams.status as string) || ''
  const limit = 25

  const [jobsResult, stats, creationData, canViewPrice, canDelete, canExport] = await Promise.all([
    getAllJobs(page, limit, query, status, dateFrom, dateTo, currentBranchId),
    getJobStatsSummary(query, dateFrom, dateTo, currentBranchId),
    getJobCreationData(currentBranchId),
    hasPermission('job_price_view'),
    hasPermission('job_delete'),
    hasPermission('job_export')
  ])

  const { data: jobs, count } = jobsResult
  const { drivers, vehicles, customers, routes } = creationData

  return (
    <DashboardLayout>
      <HistoryClient 
        jobs={jobs}
        count={count}
        stats={stats}
        drivers={drivers}
        vehicles={vehicles}
        customers={customers}
        routes={routes}
        customerMode={customerMode}
        canViewPrice={canViewPrice}
        canDelete={canDelete}
        canExport={canExport}
        dateFrom={dateFrom}
        dateTo={dateTo}
        status={status}
        query={query}
        limit={limit}
      />
      
      <div className="mt-12 text-center mb-20">
        <div className="inline-flex items-center gap-3 px-6 py-2 glass-panel rounded-full text-base font-bold font-black text-muted-foreground uppercase tracking-[0.5em] opacity-40">
            <ShieldCheck size={14} /> Encrypted Tactical Ledger Node v4.2
        </div>
      </div>
    </DashboardLayout>
  )
}

