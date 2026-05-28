"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin } from '@/lib/permissions'
import { cookies } from 'next/headers'
import { getDriverLeaderboard } from './analytics'
import { PIPELINE_STATUSES } from './analytics-helpers'

export type WorkforceAnalytics = {
  kpis: {
    totalBox: number
    activeToday: number
    licenseExpiring: number
    licenseExpired: number
  }
  topPerformers: {
    name: string
    revenue: number
    jobCount: number
    successRate: number
  }[]
  driversWithIssues: {
    id: string
    name: string
    issue: string // 'License Expired', 'License Expiring Soon', 'Medical Expired'
    daysAuth: number // days until/since expiry
  }[]
}

export async function getWorkforceAnalytics(
  startDate?: string,
  endDate?: string,
  branchId?: string
): Promise<WorkforceAnalytics> {
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

  // 1. Fetch Drivers List for Status & Compliance
  let driverQuery = supabase
    .from('Master_Drivers')
    .select('Driver_ID, Driver_Name, Active_Status, Expire_Date, Insurance_Expiry, Tax_Expiry, Act_Expiry')
  
  if (effectiveBranchId) driverQuery = driverQuery.eq('Branch_ID', effectiveBranchId)
  
  const { data: drivers } = await driverQuery
  const allDrivers = drivers || []
  
  // KPI: Total Drivers (Filter by Active_Status if provided, otherwise all in branch)
  const totalBox = allDrivers.length // Total headcount in system
  
  // KPI: Active Now (Drivers with jobs in active state for the specific branch)
  let activeDriversCount = 0
  let activeJobsQueryBuilder = supabase
     .from('Jobs_Main')
     .select('Driver_ID')
     .in('Job_Status', PIPELINE_STATUSES)
     .not('Driver_ID', 'is', null)
  
  if (effectiveBranchId) {
    activeJobsQueryBuilder = activeJobsQueryBuilder.eq('Branch_ID', effectiveBranchId)
  }

  const { data: activeJobs } = await activeJobsQueryBuilder
  
  if (activeJobs) {
      const uniqueDrivers = new Set(activeJobs.map((j: any) => j.Driver_ID))
      activeDriversCount = uniqueDrivers.size
  }
  
  // KPIs: Compliance (Check multiple expiry dates)
  const now = new Date()
  
  let licenseExpiring = 0
  let licenseExpired = 0
  const driversWithIssues: WorkforceAnalytics['driversWithIssues'] = []
  
  for (const d of allDrivers) {
      // Check all possible expiry fields
      const dateFields = [
          { date: d.Expire_Date, label: 'เอกสารประจำตัว' },
          { date: d.Insurance_Expiry, label: 'ประกันภัย' },
          { date: d.Tax_Expiry, label: 'ภาษี' },
          { date: d.Act_Expiry, label: 'พ.ร.บ.' }
      ]

      for (const field of dateFields) {
          if (!field.date) continue
          const expiry = new Date(field.date)
          const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / 86400000)
          
          if (daysUntil < 0) {
              licenseExpired++
              driversWithIssues.push({
                  id: d.Driver_ID,
                  name: d.Driver_Name || 'Unknown',
                  issue: `${field.label}หมดอายุ`,
                  daysAuth: Math.abs(daysUntil)
              })
              break // Only count one issue per driver for the KPI total
          } else if (daysUntil <= 30) {
              licenseExpiring++
              driversWithIssues.push({
                  id: d.Driver_ID,
                  name: d.Driver_Name || 'Unknown',
                  issue: `${field.label}ใกล้หมดอายุ`,
                  daysAuth: daysUntil
              })
              break // Only count one issue per driver for the KPI total
          }
      }
  }
  
  // Sort issues by urgency (expired first, then expiring soonest)
  driversWithIssues.sort((a, b) => {
      const isAExpired = a.issue.includes('หมดอายุ') && !a.issue.includes('ใกล้')
      const isBExpired = b.issue.includes('หมดอายุ') && !b.issue.includes('ใกล้')
      
      if (isAExpired && !isBExpired) return -1
      if (!isAExpired && isBExpired) return 1
      return a.daysAuth - b.daysAuth
  })
  
  // 2. Fetch Top Performers using existing logic
  // We specifically want Revenue and Job Count
  const leaderboard = await getDriverLeaderboard(startDate, endDate, effectiveBranchId)
  
  const topPerformers = leaderboard.map((d: any) => ({
      name: d.name,
      revenue: d.revenue,
      jobCount: d.completedJobs, // Using completed jobs as primary metric
      successRate: d.successRate
  })).slice(0, 5)

  return {
    kpis: {
        totalBox,
        activeToday: activeDriversCount,
        licenseExpiring,
        licenseExpired
    },
    topPerformers,
    driversWithIssues: driversWithIssues.slice(0, 10)
  }
}
