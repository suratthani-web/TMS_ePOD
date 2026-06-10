"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin } from '@/lib/permissions'
import { cookies } from 'next/headers'
import { REVENUE_STATUSES } from './analytics-helpers'

export type SafetyAnalytics = {
  sos: {
    total: number
    active: number
    resolved: number
    byReason: { reason: string; count: number }[]
    recentAlerts: {
      id: string
      vehicle: string
      driver: string
      reason: string
      time: string
    }[]
  }
  pod: {
    totalCompleted: number
    withPhoto: number
    withSignature: number
    complianceRate: number
  }
}

export async function getSafetyAnalytics(
  startDate?: string,
  endDate?: string,
  branchId?: string
): Promise<SafetyAnalytics> {
  const supabase = await createAdminClient()
  const userBranchId = await getUserBranchId()
  const isAdmin = await isSuperAdmin()
  const cookieStore = await cookies()
  const selectedBranch = cookieStore.get('selectedBranch')?.value

  // Determine effective branch ID
  let effectiveBranchId = (branchId && branchId !== 'All') ? branchId : undefined
  
  if (!effectiveBranchId) {
    if (isAdmin && selectedBranch && selectedBranch !== 'All') {
      effectiveBranchId = selectedBranch
    } else if (!isAdmin) {
      effectiveBranchId = userBranchId || undefined
    }
  }

  // 1. Fetch SOS Stats
  // Consider 'SOS' and 'Failed' as safety/incident related statuses
  // Actually, 'SOS' is the active alert status. 'Failed' might be the outcome.
  // We want to count incidents that occurred in the date range.
  // Assuming 'Failed_Time' is the timestamp for the incident.

  let sosQuery = supabase
    .from('Jobs_Main')
    .select('Job_ID, Job_Status, Failed_Reason, Failed_Time, Vehicle_Plate, Driver_Name')
    .in('Job_Status', ['SOS', 'Failed', 'Issue', 'Problem', 'เกิดปัญหา', 'ส่งไม่สำเร็จ', 'แจ้งเหตุเขาสวม']) // Filter for safety/problem incidents
    
  if (startDate) sosQuery = sosQuery.gte('Plan_Date', startDate)
  if (endDate) sosQuery = sosQuery.lte('Plan_Date', endDate)
  if (effectiveBranchId) sosQuery = sosQuery.eq('Branch_ID', effectiveBranchId)

  const { data: sosData, error: sosError } = await sosQuery
  
  if (sosError) {
    // Continue with empty data
  }
  
  const incidents = sosData || []
  const totalSos = incidents.length
  const activeSos = incidents.filter((i: Record<string, unknown>) => i.Job_Status === 'SOS').length
  const resolvedSos = incidents.filter((i: Record<string, unknown>) => i.Job_Status === 'Failed').length // Assuming Failed is a resolved state for SOS context? Or maybe 'Complete' after SOS? 
  // Actually, if it was SOS and now Complete, we might miss it if we only filter by SOS/Failed current status.
  // For now, let's stick to current status 'SOS' vs 'Failed'. To be accurate we'd need history logs.
  // We will assume 'Failed' jobs often start as 'SOS' or problem jobs.
  
  // Group by Reason
  const reasonMap = new Map<string, number>()
  incidents.forEach((i: Record<string, unknown>) => {
    const reason = (i.Failed_Reason as string) || 'Unknown'
    reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1)
  })
  
  const byReason = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    
  // Recent Alerts based on Failed_Time
  const recentAlerts = [...incidents]
    .sort((a, b) => new Date(b.Failed_Time || 0).getTime() - new Date(a.Failed_Time || 0).getTime())
    .slice(0, 5)
    .map((i: Record<string, unknown>) => ({
      id: (i.Job_ID as string),
      vehicle: (i.Vehicle_Plate as string) || 'Unknown',
      driver: (i.Driver_Name as string) || 'Unknown',
      reason: (i.Failed_Reason as string) || 'Unknown',
      time: (i.Failed_Time as string) || new Date().toISOString()
    }))

  // 2. Fetch POD Stats
  // TMS 2026: Use standardized REVENUE_STATUSES for cross-language compatibility
  let podQuery = supabase
    .from('Jobs_Main')
    .select('Job_ID, Job_Status, Photo_Proof_Url, Signature_Url')
    .in('Job_Status', REVENUE_STATUSES)
    
  if (startDate) podQuery = podQuery.gte('Plan_Date', startDate)
  if (endDate) podQuery = podQuery.lte('Plan_Date', endDate)
  if (effectiveBranchId) podQuery = podQuery.eq('Branch_ID', effectiveBranchId)
  
  const { data: podData } = await podQuery
  
  const completedJobs = podData || []
  const totalCompleted = completedJobs.length
  const withPhoto = completedJobs.filter((j: Record<string, unknown>) => !!j.Photo_Proof_Url).length
  const withSignature = completedJobs.filter((j: Record<string, unknown>) => !!j.Signature_Url).length
  
  // Compliance = BOTH Photo AND Signature present
  const complianceRate = totalCompleted > 0 
    ? (completedJobs.filter((j: Record<string, unknown>) => !!j.Photo_Proof_Url && !!j.Signature_Url).length / totalCompleted) * 100 
    : 0

  return {
    sos: {
      total: totalSos,
      active: activeSos,
      resolved: resolvedSos,
      byReason,
      recentAlerts
    },
    pod: {
      totalCompleted,
      withPhoto,
      withSignature,
      complianceRate
    }
  }
}
