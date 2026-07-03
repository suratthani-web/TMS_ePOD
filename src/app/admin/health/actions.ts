"use server"

import { getUserBranchId } from "@/lib/permissions"
import { getUnbilledCompletedJobs } from "@/services/billing-reconciliation"
import { getOperationsHealth } from "@/services/operations-health"
import { requireAdmin } from "@/services/permission-guards"
import { syncJobPrice } from "@/services/pricing-engine"
import { verifyJob } from "@/lib/actions/job-actions"
import { createAdminClient } from "@/utils/supabase/server"

import { revalidatePath } from "next/cache"

export async function getAdminHealthData(branchId?: string, customerId?: string) {
  await requireAdmin()

  const sessionBranchId = (await getUserBranchId()) || "All"
  const targetBranchId = branchId || sessionBranchId

  const [issues, unbilled] = await Promise.all([
    getOperationsHealth(targetBranchId, customerId),
    getUnbilledCompletedJobs(targetBranchId, customerId),
  ])

  // Also fetch list of branches and customers for filtering if user is SuperAdmin
  let branches: any[] = []
  let customers: any[] = []

  if (sessionBranchId === 'All') {
    const supabase = createAdminClient()
    const [branchRes, customerRes] = await Promise.all([
      supabase.from('Master_Branches').select('Branch_ID, Branch_Name'),
      supabase.from('Master_Customers').select('Customer_ID, Customer_Name')
    ])
    branches = branchRes.data || []
    customers = customerRes.data || []
  }

  return { branchId: targetBranchId, customerId, issues, unbilled, branches, customers, isSuper: sessionBranchId === 'All' }
}

export async function syncHealthJobPrice(jobId: string) {
  await requireAdmin()
  const res = await syncJobPrice(jobId)
  if (res.success) revalidatePath('/admin/health')
  return res
}

export async function runMasterBackfillAction() {
  await requireAdmin()
  const { backfillMasterSheet } = await import("@/lib/actions/master-sheet-sync")
  return await backfillMasterSheet()
}

export async function runVerifyBackfillHistoricalAction(endDate: string) {
  await requireAdmin()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return { success: false, error: 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD' }
  const { verifyAndBackfillHistorical } = await import("@/lib/actions/master-sheet-sync")
  return await verifyAndBackfillHistorical(endDate)
}

export async function bypassHealthIssueAction(jobId: string, reason?: string) {
  await requireAdmin()
  // Use 'Verified' status to effectively bypass and dismiss from health checks.
  // The reason is recorded on the job + audit log.
  const note = reason ? `ปล่อยผ่านจากหน้าสุขภาพ: ${reason}` : 'Bypassed from Health Dashboard'
  const res = await verifyJob(jobId, 'Verified', note)
  if (res.success) revalidatePath('/admin/health')
  return res
}
