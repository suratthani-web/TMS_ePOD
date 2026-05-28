import { getTodayJobStats, getTodayJobs, getRequestedJobs } from "@/lib/supabase/jobs"
import { getJobCreationData, createBulkJobs, publishAllDrafts } from "@/app/planning/actions"
import { hasPermission, isAdmin, getUserBranchId } from "@/lib/permissions"
import { PlanningClient } from "@/components/planning/planning-client"
import { cookies } from "next/headers"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ 
    branch?: string; 
    date?: string;
  }>
}

async function PlanningContent({ branch, date = '' }: { branch: string, date?: string }) {
  const currentBranchId = branch === 'All' ? undefined : branch
  const isAdminUser = await isAdmin()

  // Get stats, jobs and all requests for the target date
  const [stats, todayJobs, requestedJobs, jobCreationData, hasIncomeView, hasExpenseView, hasDelete, hasCreate, hasAssign] = await Promise.all([
    getTodayJobStats(currentBranchId, date, date), 
    getTodayJobs(date, currentBranchId),
    getRequestedJobs(currentBranchId),
    getJobCreationData(currentBranchId),
    hasPermission('navigation.billing_customer'), // Income
    hasPermission('navigation.payouts'),         // Expense/Payout
    hasPermission('job_delete'),
    hasPermission('ops.create_job'),
    hasPermission('ops.assign_driver')
  ])

  // Grant access if either have explicit permission OR is an admin
  const canViewIncome = isAdminUser || hasIncomeView
  const canViewExpense = isAdminUser || hasExpenseView
  const canDelete = isAdminUser || hasDelete
  const canCreate = isAdminUser || hasCreate
  const canAssign = isAdminUser || hasAssign

  return (
    <PlanningClient 
      stats={stats}
      todayJobs={todayJobs}
      requestedJobs={requestedJobs}
      jobCreationData={jobCreationData}
      canViewIncome={canViewIncome}
      canViewExpense={canViewExpense}
      canDelete={canDelete}
      canCreate={canCreate}
      canAssign={canAssign}
      createBulkJobs={createBulkJobs}
      publishAllDrafts={publishAllDrafts}
      branchId={branch}
      selectedDate={date}
    />
  )
}

export default async function PlanningPage(props: PageProps) {
  const searchParams = await props.searchParams
  const userBranchId = await getUserBranchId()
  const branch = (userBranchId && userBranchId !== 'All') ? userBranchId : (searchParams.branch || 'All')
  const date = searchParams.date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-primary animate-pulse font-black uppercase tracking-[0.3em] text-lg">
              INITIALIZING_LOGISTIC_PLANNER...
          </p>
      </div>
    }>
      <PlanningContent branch={branch} date={date} />
    </Suspense>
  )
}
