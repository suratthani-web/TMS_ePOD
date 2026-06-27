'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin, isAdmin, getCustomerId } from '@/lib/permissions'

export type LiveKPIData = {
  today: {
    total: number
    delivered: number
    inProgress: number
    pending: number
    sos: number
  }
  onTimeRate: number        // % งานที่ส่งทันเวลา (delivered by plan date)
  revenue: number           // รายได้วันนี้
  cost: number              // ต้นทุนวันนี้
  profit: number            // กำไรวันนี้
  updatedAt: string
}

export async function getLiveKPIData(branchId?: string): Promise<LiveKPIData> {
  const isSuper = await isSuperAdmin()
  const isAdminUser = await isAdmin()
  const userBranchId = await getUserBranchId()
  const customerId = await getCustomerId()
  const supabase = createAdminClient()

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const effectiveBranch = branchId || userBranchId

  let query = supabase
    .from('Jobs_Main')
    .select('Job_Status, Price_Cust_Total, Cost_Driver_Total, Plan_Date, Delivery_Date')
    .eq('Plan_Date', today)

  if (customerId) {
    query = query.eq('Customer_ID', customerId)
  } else if (!isSuper && effectiveBranch && effectiveBranch !== 'All') {
    query = query.or(`Branch_ID.eq.${effectiveBranch},Branch_ID.is.null`)
  } else if (isSuper && effectiveBranch && effectiveBranch !== 'All') {
    query = query.eq('Branch_ID', effectiveBranch)
  } else if (!isSuper && !isAdminUser) {
    return emptyKPI()
  }

  const { data: jobs, error } = await query

  if (error || !jobs) return emptyKPI()

  const delivered = jobs.filter(j =>
    j.Job_Status === 'Delivered' || j.Job_Status === 'Completed' || j.Job_Status === 'Verified'
  )
  const inProgress = jobs.filter(j =>
    j.Job_Status === 'In Transit' || j.Job_Status === 'In Progress' || j.Job_Status === 'Picked Up'
  )
  const pending = jobs.filter(j =>
    j.Job_Status === 'New' || j.Job_Status === 'Assigned' || j.Job_Status === 'Pending'
  )
  const sos = jobs.filter(j => j.Job_Status === 'SOS')

  // On-time = delivered AND delivery_date <= plan_date (or same day)
  const onTimeJobs = delivered.filter(j => {
    if (!j.Delivery_Date || !j.Plan_Date) return true
    return j.Delivery_Date <= j.Plan_Date
  })
  const onTimeRate = delivered.length > 0
    ? Math.round((onTimeJobs.length / delivered.length) * 100)
    : 0

  const revenue = jobs.reduce((sum, j) => sum + (Number(j.Price_Cust_Total) || 0), 0)
  const cost = jobs.reduce((sum, j) => sum + (Number(j.Cost_Driver_Total) || 0), 0)

  return {
    today: {
      total: jobs.length,
      delivered: delivered.length,
      inProgress: inProgress.length,
      pending: pending.length,
      sos: sos.length,
    },
    onTimeRate,
    revenue,
    cost,
    profit: revenue - cost,
    updatedAt: new Date().toISOString(),
  }
}

function emptyKPI(): LiveKPIData {
  return {
    today: { total: 0, delivered: 0, inProgress: 0, pending: 0, sos: 0 },
    onTimeRate: 0,
    revenue: 0,
    cost: 0,
    profit: 0,
    updatedAt: new Date().toISOString(),
  }
}
