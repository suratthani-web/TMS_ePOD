"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, getCustomerId, isSuperAdmin, isAdmin } from "@/lib/permissions"
import { getSystemLogs } from "@/lib/supabase/logs"
import { getJobById as fetchJobById } from "@/lib/supabase/jobs"

export interface CalendarJob {
  Job_ID: string
  Plan_Date: string
  Job_Status: string
  Customer_Name: string | null
  Driver_Name: string | null
  Route_Name: string | null
  Vehicle_Plate: string | null
  Origin_Location: string | null
  Dest_Location: string | null
}

export async function getJobsForMonth(year: number, month: number, providedBranchId = '') {
  const isSuper = await isSuperAdmin()
  const isRegularAdmin = await isAdmin()
  const userBranchId = await getUserBranchId()
  const branchId = (isSuper || isRegularAdmin) ? (providedBranchId || userBranchId) : userBranchId
  const supabase = (isSuper || isRegularAdmin) ? await createAdminClient() : await createClient()
  const customerId = await getCustomerId()

  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0)
  const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`

  console.log(`[DEBUG] getJobsForMonth params:`, { year, month, firstDay, lastDayStr, customerId, branchId })

  let query = supabase
    .from('Jobs_Main')
    .select('Job_ID, Plan_Date, Job_Status, Customer_Name, Driver_Name, Route_Name, Vehicle_Plate, Origin_Location, Dest_Location')
    .gte('Plan_Date', firstDay)
    .lte('Plan_Date', lastDayStr)
    .order('Plan_Date', { ascending: true })

  if (customerId) {
    query = query.eq('Customer_ID', customerId)
  } else {
    // STRICT ISOLATION
    if (!isSuper) {
        if (userBranchId && userBranchId !== 'All') {
            query = query.eq('Branch_ID', userBranchId)
        } else {
            return []
        }
    } else if (branchId && branchId !== 'All') {
        query = query.eq('Branch_ID', branchId)
    }
  }

  const { data, error } = await query
  
  if (error) {
    console.error('[DEBUG] getJobsForMonth error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        query: { firstDay, lastDayStr, customerId, branchId }
    })
    return []
  }
  
  return (data || []) as CalendarJob[]
}

export async function getJobById(jobId: string) {
  return await fetchJobById(jobId)
}

export async function getJobTimeline(jobId: string) {
  try {
    const logs = await getSystemLogs({
       module: 'Jobs',
       limit: 50
    })
    // Filter locally for now as getSystemLogs doesn't support targetId filter yet
    // Actually, I should update getSystemLogs to support targetId or just filter here.
    return logs.filter(log => log.target_id === jobId)
  } catch (error) {
    console.error("Error fetching job timeline:", error)
    return []
  }
}
