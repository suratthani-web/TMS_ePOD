"use server"

import { createClient } from '@/utils/supabase/server'
import { getLatestDriverLocations } from '@/lib/supabase/gps'
import { getAllDriversFromTable } from '@/lib/supabase/drivers'
import { transitionJobStatus } from "@/services/job-status-machine"

// ============================================================
// AI Auto-Assign Engine — TMS 2026
// คำนวณคะแนนความเหมาะสมของคนขับแต่ละคนต่องาน
// ============================================================

export type DriverSuggestion = {
  Driver_ID: string
  Driver_Name: string
  Vehicle_Plate: string
  Vehicle_Type: string
  Mobile_No: string
  match_score: number        // 0-100 overall match
  distance_km: number | null // distance from pickup point
  distance_score: number     // 0-100
  availability_score: number // 0 or 100
  vehicle_match_score: number // 0 or 100
  performance_score: number  // 0-100
  active_jobs_today: number
  on_time_rate: number       // 0-100%
  last_seen: string | null   // last GPS timestamp
}

// Scoring weights
const WEIGHTS = {
  distance: 0.35,
  availability: 0.25,
  vehicle_match: 0.20,
  performance: 0.20,
}

// ============================================================
// Main: Get Top N Driver Suggestions
// ============================================================
export async function getSuggestedDrivers(jobData: {
  Pickup_Lat?: number | null
  Pickup_Lon?: number | null
  Vehicle_Type?: string | null
  Plan_Date?: string | null
}, topN = 5): Promise<DriverSuggestion[]> {
    try {
      const supabase = await createClient()

    // 1. Get all active drivers
    const allDrivers = await getAllDriversFromTable()
    
    // 1.5 Get vehicles in maintenance
    const { data: maintenanceTickets } = await supabase
      .from('Repair_Tickets')
      .select('Vehicle_Plate')
      .in('Status', ['Pending', 'In Progress'])
      
    const maintenancePlates = new Set(maintenanceTickets?.map(t => t.Vehicle_Plate) || [])

    const activeDrivers = allDrivers.filter(d =>
      (d.Active_Status === 'Active' || !d.Active_Status) && 
      !maintenancePlates.has(d.Vehicle_Plate || '')
    )

    // 2. Get latest GPS locations
    const gpsLocations = await getLatestDriverLocations()
    const gpsMap = new Map<string, { lat: number, lon: number, timestamp: string }>()
    gpsLocations.forEach((loc: { Driver_ID: string; Latitude: number; Longitude: number; Timestamp: string }) => {
      gpsMap.set(loc.Driver_ID, {
        lat: loc.Latitude,
        lon: loc.Longitude,
        timestamp: loc.Timestamp
      })
    })

    // 3. Get today's job assignments (for availability check)
    const planDate = jobData.Plan_Date || new Date().toISOString().split('T')[0]
    const { data: todayJobs } = await supabase
      .from('Jobs_Main')
      .select('Driver_ID, Job_Status')
      .eq('Plan_Date', planDate)
      .not('Job_Status', 'in', '("Cancelled","Completed","Delivered")')

    const jobCountMap = new Map<string, number>()
    todayJobs?.forEach(j => {
      if (j.Driver_ID) {
        jobCountMap.set(j.Driver_ID, (jobCountMap.get(j.Driver_ID) || 0) + 1)
      }
    })

    // 4. Get performance stats (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const { data: recentJobs } = await supabase
      .from('Jobs_Main')
      .select('Driver_ID, Job_Status, Plan_Date, Actual_Delivery_Time')
      .gte('Plan_Date', thirtyDaysAgo.toISOString().split('T')[0])
      .in('Job_Status', ['Completed', 'Delivered'])

    const performanceMap = new Map<string, { total: number, onTime: number }>()
    recentJobs?.forEach(j => {
      if (!j.Driver_ID) return
      const stats = performanceMap.get(j.Driver_ID) || { total: 0, onTime: 0 }
      stats.total += 1
      // Consider "on-time" if delivered (simplified heuristic)
      stats.onTime += 1
      performanceMap.set(j.Driver_ID, stats)
    })

    // 5. Score each driver
    const suggestions: DriverSuggestion[] = activeDrivers.map(driver => {
      // Distance Score
      const gps = gpsMap.get(driver.Driver_ID)
      let distanceKm: number | null = null
      let distanceScore = 50 // Default: no GPS data → neutral score

      if (gps && jobData.Pickup_Lat && jobData.Pickup_Lon) {
        distanceKm = haversineKm(gps.lat, gps.lon, jobData.Pickup_Lat, jobData.Pickup_Lon)
        // 0 km → 100, 50+ km → 0 (linear decay)
        distanceScore = Math.max(0, Math.min(100, 100 - (distanceKm * 2)))
      }

      // Availability Score
      const activeJobsToday = jobCountMap.get(driver.Driver_ID) || 0
      const availabilityScore = activeJobsToday === 0 ? 100 : activeJobsToday <= 2 ? 50 : 0

      // Vehicle Match Score
      let vehicleMatchScore = 70 // Default: no preference specified
      if (jobData.Vehicle_Type) {
        vehicleMatchScore = (driver.Vehicle_Type || '').toLowerCase().includes(jobData.Vehicle_Type.toLowerCase()) ? 100 : 0
      }

      // Performance Score
      const perf = performanceMap.get(driver.Driver_ID)
      let performanceScore = 60 // Default: new driver
      let onTimeRate = 0
      if (perf && perf.total > 0) {
        onTimeRate = Math.round((perf.onTime / perf.total) * 100)
        performanceScore = onTimeRate
      }

      // Overall weighted score
      const matchScore = Math.round(
        distanceScore * WEIGHTS.distance +
        availabilityScore * WEIGHTS.availability +
        vehicleMatchScore * WEIGHTS.vehicle_match +
        performanceScore * WEIGHTS.performance
      )

      return {
        Driver_ID: driver.Driver_ID,
        Driver_Name: driver.Driver_Name || 'ไม่ระบุชื่อ',
        Vehicle_Plate: driver.Vehicle_Plate || '-',
        Vehicle_Type: driver.Vehicle_Type || '-',
        Mobile_No: driver.Mobile_No || '',
        match_score: matchScore,
        distance_km: distanceKm ? Math.round(distanceKm * 10) / 10 : null,
        distance_score: Math.round(distanceScore),
        availability_score: availabilityScore,
        vehicle_match_score: vehicleMatchScore,
        performance_score: performanceScore,
        active_jobs_today: activeJobsToday,
        on_time_rate: onTimeRate,
        last_seen: gps?.timestamp || null,
      }
    })

    // Sort by match_score descending, return top N
    suggestions.sort((a, b) => b.match_score - a.match_score)
    return suggestions.slice(0, topN)

  } catch {
    return []
  }
}

// ============================================================
// Job Bundling: Get nearby unassigned jobs
// ============================================================
export async function getNearbyUnassignedJobs(pivotJob: {
    Job_ID: string
    Pickup_Lat: number
    Pickup_Lon: number
}, radiusKm = 10): Promise<Array<{ Job_ID: string; Customer_Name: string | null; Route_Name: string | null; Pickup_Lat: number | null; Pickup_Lon: number | null; Plan_Date: string | null }>> {
    try {
        const supabase = await createClient()

        // 1. Get all unassigned jobs
        const { data: jobs } = await supabase
            .from('Jobs_Main')
            .select('Job_ID, Customer_Name, Route_Name, Pickup_Lat, Pickup_Lon, Plan_Date')
            .eq('Job_Status', 'New')
            .is('Driver_ID', null)
            .neq('Job_ID', pivotJob.Job_ID)

        if (!jobs) return []

        // 2. Filter by distance
        const nearby = jobs.filter(job => {
            if (!job.Pickup_Lat || !job.Pickup_Lon) return false
            const distance = haversineKm(
                pivotJob.Pickup_Lat, 
                pivotJob.Pickup_Lon, 
                job.Pickup_Lat, 
                job.Pickup_Lon
            )
            return distance <= radiusKm
        })

        return nearby
    } catch {
        return []
    }
}

// ============================================================
// Route Optimization: Sort jobs for shortest delivery path (TSP Greedy)
// ============================================================
export async function getOptimizedJobSequence<T extends { Delivery_Lat?: number | null; Delivery_Lon?: number | null }>(
    startLat: number, 
    startLon: number, 
    jobs: T[]
): Promise<T[]> {
    const unvisited = [...jobs]
    const optimized: T[] = []
    let currentLat = startLat
    let currentLon = startLon

    while (unvisited.length > 0) {
        let nearestIdx = -1
        let minDistance = Infinity

        for (let i = 0; i < unvisited.length; i++) {
            const job = unvisited[i]
            if (job.Delivery_Lat && job.Delivery_Lon) {
                const dist = haversineKm(currentLat, currentLon, job.Delivery_Lat, job.Delivery_Lon)
                if (dist < minDistance) {
                    minDistance = dist
                    nearestIdx = i
                }
            }
        }

        if (nearestIdx === -1) {
            // No valid coordinates left, push remaining and break
            optimized.push(...unvisited)
            break
        }

        const [nearestJob] = unvisited.splice(nearestIdx, 1)
        optimized.push(nearestJob)
        currentLat = nearestJob.Delivery_Lat!
        currentLon = nearestJob.Delivery_Lon!
    }

    return optimized
}

// ============================================================
// Job Bundling Strategy: Find potential jobs to group together
// ============================================================
export async function findPotentialBundles(branchId?: string, radiusKm = 5): Promise<Array<{ pivot: string; bundled: string[]; total_saved_km: number }>> {
    try {
        const supabase = await createClient()
        
        let query = supabase
            .from('Jobs_Main')
            .select('Job_ID, Pickup_Lat, Pickup_Lon, Delivery_Lat, Delivery_Lon, Vehicle_Type')
            .eq('Job_Status', 'New')
            .is('Driver_ID', null)

        if (branchId && branchId !== 'All') {
            query = query.eq('Branch_ID', branchId)
        }

        const { data: jobs } = await query
        if (!jobs || jobs.length < 2) return []

        const bundles: Array<{ pivot: string; bundled: string[]; total_saved_km: number }> = []
        const handled = new Set<string>()

        for (const pivot of jobs) {
            if (handled.has(pivot.Job_ID)) continue
            if (!pivot.Pickup_Lat || !pivot.Pickup_Lon) continue

            const cluster = jobs.filter(j => 
                j.Job_ID !== pivot.Job_ID && 
                !handled.has(j.Job_ID) &&
                j.Pickup_Lat && j.Pickup_Lon &&
                haversineKm(pivot.Pickup_Lat!, pivot.Pickup_Lon!, j.Pickup_Lat, j.Pickup_Lon) <= radiusKm
            )

            if (cluster.length > 0) {
                const bundledIds = cluster.map(c => c.Job_ID)
                bundles.push({
                    pivot: pivot.Job_ID,
                    bundled: bundledIds,
                    total_saved_km: cluster.length * 8.5 // Estimated avg savings per bundled job
                })
                handled.add(pivot.Job_ID)
                bundledIds.forEach(id => handled.add(id))
            }
        }

        return bundles
    } catch {
        return []
    }
}

// ============================================================
// Auto-Batch Dispatch: Assign all "New" jobs to best matching drivers
// ============================================================
export async function autoBatchAssign(branchId?: string): Promise<{ successCount: number; errors: string[] }> {
    try {
        const supabase = await createClient()

        // 1. Get all unassigned 'New' jobs
        let query = supabase
            .from('Jobs_Main')
            .select('Job_ID, Pickup_Lat, Pickup_Lon, Vehicle_Type, Plan_Date')
            .eq('Job_Status', 'New')
            .is('Driver_ID', null)
        
        if (branchId && branchId !== 'All') {
            query = query.eq('Branch_ID', branchId)
        }

        const { data: unassignedJobs, error: fetchError } = await query
        if (fetchError || !unassignedJobs) return { successCount: 0, errors: [fetchError?.message || 'No jobs found'] }

        let successCount = 0
        const errors: string[] = []

        // 2. Iterate through jobs and find the BEST driver for each
        // To prevent over-assigning, we'll keep track of assigned jobs in this session
        const tempJobCountMap = new Map<string, number>()

        for (const job of unassignedJobs) {
            const suggestions = await getSuggestedDrivers({
                Pickup_Lat: job.Pickup_Lat,
                Pickup_Lon: job.Pickup_Lon,
                Vehicle_Type: job.Vehicle_Type,
                Plan_Date: job.Plan_Date
            }, 3) // Get top 3 candidates

            if (suggestions.length > 0) {
                // Find candidate who has the lowest temporary load
                const bestCandidate = suggestions.sort((a, b) => {
                    const loadA = (tempJobCountMap.get(a.Driver_ID) || 0) + a.active_jobs_today
                    const loadB = (tempJobCountMap.get(b.Driver_ID) || 0) + b.active_jobs_today
                    return loadA - loadB || b.match_score - a.match_score
                })[0]

                // 3. Update job with Driver_ID and change status to 'Confirmed' using Machine
                const transition = await transitionJobStatus(job.Job_ID, 'Confirmed', {
                    userId: 'AI_ASSIGNER',
                    reason: 'AI Auto-Assignment',
                    notes: `Match Score: ${bestCandidate.match_score}, Estimated Distance: ${bestCandidate.distance_km} km`
                })

                if (transition.success) {
                    const { error: updateError } = await supabase
                        .from('Jobs_Main')
                        .update({ 
                            Driver_ID: bestCandidate.Driver_ID,
                            Updated_At: new Date().toISOString()
                        })
                        .eq('Job_ID', job.Job_ID)

                    if (!updateError) {
                        successCount++
                        tempJobCountMap.set(bestCandidate.Driver_ID, (tempJobCountMap.get(bestCandidate.Driver_ID) || 0) + 1)
                    } else {
                        errors.push(`Job ${job.Job_ID}: ${updateError.message}`)
                    }
                } else {
                    errors.push(`Job ${job.Job_ID}: Status Machine Error - ${transition.message}`)
                }
            }
        }

        return { successCount, errors }
    } catch (err) {
        return { successCount: 0, errors: [String(err)] }
    }
}

// ============================================================
// Haversine Formula — Calculate distance between two GPS points
// ============================================================
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371 // Earth's radius in km
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

function toRad(deg: number): number {
    return deg * (Math.PI / 180)
}
