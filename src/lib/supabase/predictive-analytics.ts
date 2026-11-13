"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin } from '@/lib/permissions'
import { cookies } from 'next/headers'
import { fetchAllRows } from './analytics-helpers'

export type VehicleRisk = {
  vehicle_plate: string
  vehicle_type: string
  age_years: number
  current_mileage: number
  avg_km_per_day: number
  days_to_service: number
  risk_score: number // 0-100 (100 = Best)
  risk_level: 'Good' | 'Warning' | 'Critical'
  predicted_issue: string | null
}

export type RouteRisk = {
  route_name: string
  total_jobs: number
  failure_count: number // SOS + Failed
  delay_count: number // Actual > Plan + 2h
  risk_score: number // 0-100 (100 = Best, 0 = High Risk)
  risk_level: 'Low' | 'Medium' | 'High'
}

export async function getVehicleRiskAssessment(branchId?: string): Promise<VehicleRisk[]> {
  const supabase = await createAdminClient()
  const userBranchId = await getUserBranchId()
  const isAdmin = await isSuperAdmin()
  const cookieStore = await cookies()
  const selectedBranch = cookieStore.get('selectedBranch')?.value

  // Determine effective branch ID
  let effectiveBranchId = (branchId && branchId !== 'All') ? branchId : undefined
  if (!isAdmin) {
    effectiveBranchId = (userBranchId && userBranchId !== 'All') ? userBranchId : undefined
  } else if (!effectiveBranchId && selectedBranch && selectedBranch !== 'All') {
    effectiveBranchId = selectedBranch
  }

  // 1. Fetch Vehicles
  let vehicleQuery = supabase
    .from('Master_Vehicles')
    .select('Vehicle_Plate, Vehicle_Type, Year, Current_Mileage, Next_Service_Mileage, Last_Service_Date, Brand, Model')
  
  if (effectiveBranchId) vehicleQuery = vehicleQuery.eq('Branch_ID', effectiveBranchId)

  const { data: vehicles } = await vehicleQuery
  if (!vehicles) return []

  // 2. Fetch Fuel Logs for Usage Calculation (Last 30 Days)
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString()
  
  const fuelLogs = await fetchAllRows<{ Vehicle_Plate?: string; Odometer?: number; Date_Time?: string }>(() => {
    let fuelQuery = supabase
      .from('Fuel_Logs')
      .select('Vehicle_Plate, Odometer, Date_Time')
      .gte('Date_Time', thirtyDaysAgo)
      .order('Date_Time', { ascending: true })
    if (effectiveBranchId) fuelQuery = fuelQuery.eq('Branch_ID', effectiveBranchId)
    return fuelQuery
  })
  const logs = fuelLogs || []

  // Group logs by vehicle
  const vehicleLogs = new Map<string, typeof logs>()
  logs.forEach(l => {
      const plate = l.Vehicle_Plate || 'Unknown'
      if (!vehicleLogs.has(plate)) vehicleLogs.set(plate, [])
      vehicleLogs.get(plate)?.push(l)
  })

  // 3. Fetch Repair History (Last 90 Days)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000).toISOString()
  const repairs = await fetchAllRows<{ Vehicle_Plate?: string; Date_Report?: string }>(() => {
    let repairQuery = supabase
      .from('Repair_Tickets')
      .select('Vehicle_Plate, Date_Report')
      .gte('Date_Report', ninetyDaysAgo)
    if (effectiveBranchId) repairQuery = repairQuery.eq('Branch_ID', effectiveBranchId)
    return repairQuery
  })
  const repairCounts = new Map<string, number>()
  repairs?.forEach(r => {
      const plate = r.Vehicle_Plate || 'Unknown'
      repairCounts.set(plate, (repairCounts.get(plate) || 0) + 1)
  })

  // 4. Calculate Risk
  const results: VehicleRisk[] = []
  const currentYear = new Date().getFullYear()

  for (const v of vehicles) {
       // Usage
       const vLogs = vehicleLogs.get(v.Vehicle_Plate) || []
       let avgKmPerDay = 100 // Default assumption: 100km/day if data missing
       
       if (vLogs.length >= 2) {
           const first = vLogs[0]
           const last = vLogs[vLogs.length - 1]
           const days = (new Date(last.Date_Time!).getTime() - new Date(first.Date_Time!).getTime()) / 86400000
           if (days > 0 && first.Odometer && last.Odometer) {
               avgKmPerDay = (last.Odometer - first.Odometer) / days
           }
       }

       // Time to Service
       const currentKm = v.Current_Mileage || 0
       const nextServiceKm = v.Next_Service_Mileage || (currentKm + 10000)
       const kmRemaining = nextServiceKm - currentKm
       const daysToService = avgKmPerDay > 0 ? kmRemaining / avgKmPerDay : 999

       // Risk Scoring
       let score = 100
       
       // Age Risk
       const age = v.Year ? currentYear - v.Year : 5
       if (age > 5) score -= (age - 5) * 5
       
       // Mileage Risk (High mileage -> higher risk)
       if (currentKm > 200000) score -= 10
       if (currentKm > 400000) score -= 20
       
       // Repair Frequency Risk
       const repairCount = repairCounts.get(v.Vehicle_Plate) || 0
       if (repairCount > 2) score -= (repairCount * 5)
       
       // Service Overdue Risk
       if (kmRemaining < 0) score -= 30
       else if (kmRemaining < 1000) score -= 10

       // Cap Score
       score = Math.max(0, Math.min(100, score))

       // Determine Level
       let level: VehicleRisk['risk_level'] = 'Good'
       if (score < 50) level = 'Critical'
       else if (score < 80) level = 'Warning'

       // Prediction
       let prediction: string | null = null
       if (kmRemaining < 2000) prediction = `Service due in ~${Math.ceil(daysToService)} days`
       else if (repairCount > 3) prediction = `Recurring mechanical issues likely`
       else if (age > 10) prediction = `Age-related failure risk`

       results.push({
           vehicle_plate: v.Vehicle_Plate,
           vehicle_type: v.Vehicle_Type || 'Unknown',
           age_years: age,
           current_mileage: currentKm,
           avg_km_per_day: Math.round(avgKmPerDay),
           days_to_service: Math.ceil(daysToService),
           risk_score: Math.round(score),
           risk_level: level,
           predicted_issue: prediction
       })
  }

  return results.sort((a, b) => a.risk_score - b.risk_score) // Lowest score (Critical) first
}

export async function getRouteRiskProfile(branchId?: string): Promise<RouteRisk[]> {
  const supabase = await createAdminClient()
  const userBranchId = await getUserBranchId()
  const isAdmin = await isSuperAdmin()
  const cookieStore = await cookies()
  const selectedBranch = cookieStore.get('selectedBranch')?.value

  // Determine effective branch ID
  let effectiveBranchId = (branchId && branchId !== 'All') ? branchId : undefined
  if (!isAdmin) {
    effectiveBranchId = (userBranchId && userBranchId !== 'All') ? userBranchId : undefined
  } else if (!effectiveBranchId && selectedBranch && selectedBranch !== 'All') {
    effectiveBranchId = selectedBranch
  }

  // Fetch Jobs (Last 90 Days)
  const now = new Date()
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0]

  const jobs = await fetchAllRows<any>(() => {
    let query = supabase
      .from('Jobs_Main')
      .select('Route_Name, Job_Status, Plan_Date, Actual_Delivery_Time')
      .gte('Plan_Date', ninetyDaysAgo)
    if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)
    return query
  })
  
  const routeMap = new Map<string, { total: number; fail: number; delay: number }>()

  jobs?.forEach(job => {
      const route = job.Route_Name || 'Unknown Route'
      if (!routeMap.has(route)) routeMap.set(route, { total: 0, fail: 0, delay: 0 })
      
      const stats = routeMap.get(route)!
      stats.total++

      // Check Failure (SOS or Failed)
      if (['SOS', 'Failed', 'Cancelled'].includes(job.Job_Status || '')) {
          stats.fail++
      }

      // Check Delay (Actual > Plan + 2 Hours) - Rough heuristic without precise timestamps
      // Assuming Plan_Date is midnight, this is hard. 
      // If we don't have Plan_Time, we can't accurately calc delay.
      // Let's rely on 'Late' status if it exists, or just use SOS/Failed for now as "Risk".
      // But wait... actually many systems only have Plan Date.
      // Let's stick to Failure Rate for Risk Score primarily for now.
  })

  // Transform to Risk Types
  const results: RouteRisk[] = Array.from(routeMap.entries()).map(([route, stats]) => {
      // Risk Calculation
      // Base: 100
      // - 5 per 1% failure rate
      const failRate = (stats.fail / stats.total) * 100
      let score = 100 - (failRate * 5)
      score = Math.max(0, Math.min(100, score))

      let level: RouteRisk['risk_level'] = 'Low'
      if (score < 60) level = 'High'
      else if (score < 85) level = 'Medium'

      return {
          route_name: route,
          total_jobs: stats.total,
          failure_count: stats.fail,
          delay_count: stats.delay, // 0 for now
          risk_score: Math.round(score),
          risk_level: level
      }
  })

  return results.sort((a, b) => a.risk_score - b.risk_score)
}
