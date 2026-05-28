"use server"

import { createAdminClient } from '@/utils/supabase/server'
import {
    REVENUE_STATUSES,
    formatDateSafe,
    getBranchPlates,
    getEffectiveBranchId
} from './analytics-helpers'

// 4. Operational Stats
export async function getOperationalStats(branchId?: string, startDate?: string, endDate?: string) {
    const supabase = await createAdminClient()
    const effectiveBranchId = await getEffectiveBranchId(branchId)

    const now = new Date()
    const firstDay = formatDateSafe(startDate) || formatDateSafe(new Date(now.getFullYear(), now.getMonth(), 1)) || ""
    const lastDay = formatDateSafe(endDate) || formatDateSafe(new Date(now.getFullYear(), now.getMonth() + 1, 0)) || ""

    let vehicleQuery = supabase
        .from('Master_Vehicles') 
        .select('*', { count: 'exact', head: true })
    
    if (effectiveBranchId) {
        vehicleQuery = vehicleQuery.eq('Branch_ID', effectiveBranchId)
    }

    const { count: totalVehicles } = await vehicleQuery

    let activeJobsQuery = supabase
        .from('Jobs_Main')
        .select('Vehicle_Plate')
        .gte('Plan_Date', firstDay)
        .lte('Plan_Date', lastDay)
        .not('Job_Status', 'eq', 'Cancelled')
        .not('Vehicle_Plate', 'is', null)

    if (effectiveBranchId) {
        activeJobsQuery = activeJobsQuery.eq('Branch_ID', effectiveBranchId)
    }

    const { data: activeJobs } = await activeJobsQuery

    const uniqueActiveVehicles = new Set(activeJobs?.map((j: any) => j.Vehicle_Plate)).size

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    let gpsQuery = supabase
        .from('Fleet_GPS')
        .select('Vehicle_Plate', { count: 'exact', head: true })
        .gte('Last_Update', twoHoursAgo)
    
    if (effectiveBranchId) {
        const branchPlates = await getBranchPlates(effectiveBranchId)
        if (branchPlates.length > 0) gpsQuery = gpsQuery.in('Vehicle_Plate', branchPlates)
        else gpsQuery = gpsQuery.in('Vehicle_Plate', ['NONE'])
    }
    const { count: healthyVehicles } = await gpsQuery

    let jobStatsQuery = supabase
        .from('Jobs_Main')
        .select('Job_Status')
        .gte('Plan_Date', firstDay)
        .lte('Plan_Date', lastDay)
    
    if (effectiveBranchId) {
        jobStatsQuery = jobStatsQuery.eq('Branch_ID', effectiveBranchId)
    }
        
    const { data: jobStats } = await jobStatsQuery
        
    const totalJobs = jobStats?.length || 0
    const completedJobs = jobStats?.filter((j: any) => REVENUE_STATUSES.includes(j.Job_Status || '')).length || 0
    const onTimeDelivery = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0

    let activePlates: string[] = []
    if (effectiveBranchId) {
        activePlates = await getBranchPlates(effectiveBranchId)
    }

    let fuelLogsQuery = supabase
        .from('Fuel_Logs')
        .select('Liters, Odometer, Vehicle_Plate')
        .gte('Date_Time', firstDay)
        .lte('Date_Time', lastDay + 'T23:59:59')
        .order('Date_Time', { ascending: true })

    if (effectiveBranchId) {
        if (activePlates.length > 0) {
            fuelLogsQuery = fuelLogsQuery.in('Vehicle_Plate', activePlates)
        } else {
             fuelLogsQuery = fuelLogsQuery.in('Vehicle_Plate', ['NO_MATCH'])
        }
    }
    
    const { data: fuelLogs } = await fuelLogsQuery

    let totalDistanceApprox = 0
    let totalFuelUsed = 0

    if (fuelLogs && fuelLogs.length > 0) {
        const vehicleLogs: Record<string, { Odometer: number, Liters: number }[]> = {}
        fuelLogs.forEach((log: any) => {
            if (log.Vehicle_Plate && log.Odometer && log.Liters) {
                if (!vehicleLogs[log.Vehicle_Plate]) vehicleLogs[log.Vehicle_Plate] = []
                vehicleLogs[log.Vehicle_Plate].push(log)
            }
        })

        Object.values(vehicleLogs).forEach(logs => {
            if (logs.length >= 2) {
                const minOdo = logs[0].Odometer
                const maxOdo = logs[logs.length - 1].Odometer
                totalDistanceApprox += (maxOdo - minOdo)
                for (let i = 1; i < logs.length; i++) totalFuelUsed += logs[i].Liters
            }
        })
    }

    const fuelEfficiency = totalFuelUsed > 0 ? (totalDistanceApprox / totalFuelUsed) : 0

    return {
        fleet: {
            active: uniqueActiveVehicles || 0,
            total: totalVehicles || 0,
            utilization: totalVehicles ? (uniqueActiveVehicles / totalVehicles) * 100 : 0,
            onTimeDelivery,
            fuelEfficiency,
            health: totalVehicles ? Math.min(100, (healthyVehicles || 0) / totalVehicles * 100) : 0
        }
    }
}

// 10. Driver Leaderboard (Efficiency & Volume)
export async function getDriverLeaderboard(startDate?: string, endDate?: string, branchId?: string) {
    const supabase = await createAdminClient()
    const effectiveBranchId = await getEffectiveBranchId(branchId)

    const sDate = formatDateSafe(startDate)
    const eDate = formatDateSafe(endDate)

    let query = supabase
        .from('Jobs_Main')
        .select('Driver_Name, Price_Cust_Total, Cost_Driver_Total, Job_Status, Plan_Date, Actual_Delivery_Time')
        .not('Driver_Name', 'is', null)

    if (sDate) query = query.gte('Plan_Date', sDate)
    if (eDate) query = query.lte('Plan_Date', eDate)
    if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

    const { data: jobs } = await query

    const driverStats: Record<string, { 
        name: string, revenue: number, completedJobs: number, totalJobs: number, onTimeJobs: number, lateJobs: number
    }> = {}

    jobs?.forEach((job: any) => {
        const name = job.Driver_Name!
        if (!driverStats[name]) {
            driverStats[name] = { name, revenue: 0, completedJobs: 0, totalJobs: 0, onTimeJobs: 0, lateJobs: 0 }
        }
        
        const isCompleted = REVENUE_STATUSES.includes(job.Job_Status || '')
        if (isCompleted) {
            driverStats[name].revenue += (job.Price_Cust_Total || 0)
            driverStats[name].completedJobs++
            
            if (job.Actual_Delivery_Time && job.Plan_Date) {
                const actualDate = job.Actual_Delivery_Time.split('T')[0]
                if (actualDate === job.Plan_Date) {
                    driverStats[name].onTimeJobs++
                } else {
                    driverStats[name].lateJobs++
                }
            } else {
                driverStats[name].onTimeJobs++
            }
        }
        driverStats[name].totalJobs++
    })

    return Object.values(driverStats)
        .map(d => ({ 
            ...d, 
            successRate: d.totalJobs > 0 ? (d.completedJobs / d.totalJobs) * 100 : 0,
            onTimeRate: d.completedJobs > 0 ? (d.onTimeJobs / d.completedJobs) * 100 : 0
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
}

// 10.1 Detailed Driver Analytics (Leaderboard & Export)
export async function getDetailedDriverAnalytics(startDate?: string, endDate?: string, branchId?: string) {
    const supabase = await createAdminClient()
    const effectiveBranchId = await getEffectiveBranchId(branchId)

    const sDate = formatDateSafe(startDate)
    const eDate = formatDateSafe(endDate)

    const [driversResult, jobsResult] = await Promise.all([
        supabase.from('Master_Drivers').select('Driver_ID, Driver_Name, Vehicle_Plate, Vehicle_Type, Branch_ID, Active_Status, Sub_ID'),
        supabase.from('Jobs_Main')
            .select('Driver_ID, Job_Status, Plan_Date, Actual_Delivery_Time, Cost_Driver_Total, Rating, Est_Distance_KM, Weight_Kg')
            .gte('Plan_Date', sDate || '')
            .lte('Plan_Date', eDate || '')
            .not('Driver_ID', 'is', null)
    ])

    if (jobsResult.error) return []

    const driverStats: Record<string, {
        driverId: string, name: string, plate: string, type: string, subId: string | null,
        totalJobs: number, completedJobs: number, cancelledJobs: number, onTimeJobs: number,
        totalEarnings: number, totalDistance: number, totalWeight: number, ratings: number[], avgRating: number
    }> = {}

    driversResult.data?.forEach((d: any) => {
        if (effectiveBranchId && d.Branch_ID !== effectiveBranchId) return
        
        driverStats[d.Driver_ID] = {
            driverId: d.Driver_ID, name: d.Driver_Name || 'N/A', plate: d.Vehicle_Plate || '-', type: d.Vehicle_Type || '-',
            subId: d.Sub_ID || null,
            totalJobs: 0, completedJobs: 0, cancelledJobs: 0, onTimeJobs: 0,
            totalEarnings: 0, totalDistance: 0, totalWeight: 0, ratings: [], avgRating: 0
        }
    })

    jobsResult.data?.forEach((job: any) => {
        const id = job.Driver_ID!
        if (!driverStats[id]) return

        const stats = driverStats[id]
        stats.totalJobs++
        
        if (job.Job_Status === 'Cancelled') {
            stats.cancelledJobs++
            return
        }

        const isCompleted = REVENUE_STATUSES.includes(job.Job_Status || '')
        
        if (isCompleted) {
            stats.completedJobs++
            stats.totalEarnings += (job.Cost_Driver_Total || 0)
            stats.totalDistance += (job.Est_Distance_KM || 0)
            stats.totalWeight += (job.Weight_Kg || 0)
            
            if (job.Rating) stats.ratings.push(job.Rating)

            if (job.Actual_Delivery_Time && job.Plan_Date) {
                const actualDate = job.Actual_Delivery_Time.split('T')[0]
                if (actualDate === job.Plan_Date) stats.onTimeJobs++
            } else {
                stats.onTimeJobs++
            }
        }
    })

    return Object.values(driverStats).map(d => {
        const completionRate = d.totalJobs > 0 ? (d.completedJobs / (d.totalJobs - d.cancelledJobs)) * 100 : 0
        const onTimeRate = d.completedJobs > 0 ? (d.onTimeJobs / d.completedJobs) * 100 : 0
        const avgRating = d.ratings.length > 0 ? d.ratings.reduce((a, b) => a + b, 0) / d.ratings.length : 0
        
        const points = d.completedJobs * 10
        let rank = 'Bronze'
        if (points >= 1200) rank = 'Platinum'
        else if (points >= 700) rank = 'Gold'
        else if (points >= 300) rank = 'Silver'

        return { ...d, completionRate, onTimeRate, avgRating, points, rank }
    }).sort((a, b) => b.points - a.points)
}

// 12. Vehicle Profitability Breakdown
export async function getVehicleProfitability(startDate?: string, endDate?: string, branchId?: string) {
    const supabase = await createAdminClient()
    
    const now = new Date()
    const firstDay = formatDateSafe(startDate) || formatDateSafe(new Date(now.getFullYear(), now.getMonth(), 1)) || ""
    const lastDay = formatDateSafe(endDate) || formatDateSafe(new Date(now.getFullYear(), now.getMonth() + 1, 0)) || ""

    const effectiveBranchId = await getEffectiveBranchId(branchId)

    let jobsQuery = supabase
        .from('Jobs_Main')
        .select('Vehicle_Plate, Price_Cust_Total, Cost_Driver_Total, Est_Distance_KM')
        .gte('Plan_Date', firstDay)
        .lte('Plan_Date', lastDay)
        .in('Job_Status', REVENUE_STATUSES)
        .not('Vehicle_Plate', 'is', null)

    if (effectiveBranchId) {
        jobsQuery = jobsQuery.eq('Branch_ID', effectiveBranchId)
    }

    const { data: jobs, error: jobsError } = await jobsQuery
    if (jobsError) console.error('[getVehicleProfitability] Query Error:', jobsError)
    console.log(`[getVehicleProfitability] Found ${(jobs || []).length} jobs for range ${firstDay} to ${lastDay}, branchId=${effectiveBranchId}`)

    const fuelQuery = supabase
        .from('Fuel_Logs')
        .select('Vehicle_Plate, Price_Total')
        .gte('Date_Time', `${firstDay}T00:00:00`)
        .lte('Date_Time', `${lastDay}T23:59:59`)

    if (effectiveBranchId) {
        const branchPlates = await getBranchPlates(effectiveBranchId)
        if (branchPlates.length > 0) fuelQuery.in('Vehicle_Plate', branchPlates)
        else fuelQuery.in('Vehicle_Plate', ['NO_MATCH'])
    }

    const { data: fuel } = await fuelQuery

    const maintenanceQuery = supabase
        .from('Repair_Tickets')
        .select('Vehicle_Plate, Cost_Total')
        .gte('Date_Report', `${firstDay}T00:00:00`)
        .lte('Date_Report', `${lastDay}T23:59:59`)
        .neq('Status', 'Cancelled')

    if (effectiveBranchId) {
        const branchPlates = await getBranchPlates(effectiveBranchId)
        if (branchPlates.length > 0) maintenanceQuery.in('Vehicle_Plate', branchPlates)
        else maintenanceQuery.in('Vehicle_Plate', ['NO_MATCH'])
    }

    const { data: maintenance } = await maintenanceQuery

    const stats: Record<string, { plate: string, revenue: number, driverCost: number, fuelCost: number, maintenanceCost: number, totalCost: number, netProfit: number, totalKm: number, count: number }> = {}

    jobs?.forEach((job: any) => {
        const plate = job.Vehicle_Plate!
        if (!stats[plate]) stats[plate] = { plate, revenue: 0, driverCost: 0, fuelCost: 0, maintenanceCost: 0, totalCost: 0, netProfit: 0, totalKm: 0, count: 0 }
        stats[plate].revenue += (job.Price_Cust_Total || 0)
        stats[plate].driverCost += (job.Cost_Driver_Total || 0)
        stats[plate].totalKm += (job.Est_Distance_KM || 0)
        stats[plate].count += 1
    })

    fuel?.forEach((f: any) => {
        const plate = f.Vehicle_Plate!
        if (!stats[plate]) stats[plate] = { plate, revenue: 0, driverCost: 0, fuelCost: 0, maintenanceCost: 0, totalCost: 0, netProfit: 0, totalKm: 0, count: 0 }
        stats[plate].fuelCost += (f.Price_Total || 0)
    })

    maintenance?.forEach((m: any) => {
        const plate = m.Vehicle_Plate!
        if (!stats[plate]) stats[plate] = { plate, revenue: 0, driverCost: 0, fuelCost: 0, maintenanceCost: 0, totalCost: 0, netProfit: 0, totalKm: 0, count: 0 }
        stats[plate].maintenanceCost += (m.Cost_Total || 0)
    })

    return Object.values(stats).map(s => {
        const totalCost = s.driverCost + s.fuelCost + s.maintenanceCost
        return { ...s, totalCost, netProfit: s.revenue - totalCost }
    }).sort((a, b) => b.netProfit - a.netProfit)
}

// 13. Provincial Mileage Stats
export async function getProvincialMileageStats(branchId?: string) {
    try {
        const supabase = await createAdminClient()
        const effectiveBranchId = await getEffectiveBranchId(branchId)

        let query = supabase
            .from('Jobs_Main')
            .select('Dest_Location, Zone, Weight_Kg, Est_Distance_KM')
            .in('Job_Status', REVENUE_STATUSES)
        
        if (effectiveBranchId) {
            query = query.eq('Branch_ID', effectiveBranchId)
        }

        const { data, error } = await query.limit(500)
        if (error) return []

        const stats: Record<string, { name: string, range: string, percentage: number, color: string, rawVal: number, totalKm: number }> = {}
        const colors = ["bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-purple-500", "bg-rose-500"]
        
        let totalVal = 0
        data?.forEach((job: any) => {
            let geoLabel = (job as { Zone?: string }).Zone || 'ไม่ระบุโซน'
            if (geoLabel.includes('BKK') || geoLabel.includes('กรุงเทพ')) geoLabel = 'กรุงเทพมหานคร'
            
            if (!stats[geoLabel]) {
                stats[geoLabel] = { name: geoLabel, range: "0 KM", percentage: 0, color: colors[Object.keys(stats).length % colors.length], rawVal: 0, totalKm: 0 }
            }
            stats[geoLabel].rawVal += 1
            stats[geoLabel].totalKm += (job.Est_Distance_KM || 0)
            totalVal += 1
        })

        const sorted = Object.values(stats).sort((a, b) => b.rawVal - a.rawVal).slice(0, 5)

        return sorted.map(s => ({
            ...s,
            percentage: totalVal > 0 ? Math.round((s.rawVal / totalVal) * 100) : 0,
            range: `${s.totalKm.toLocaleString()} KM`
        }))
    } catch {
        return []
    }
}

// 14. Fleet Compliance Metrics
export async function getFleetComplianceMetrics(branchId?: string) {
    try {
        const supabase = await createAdminClient()
        const effectiveBranchId = await getEffectiveBranchId(branchId)

        let query = supabase.from('Master_Vehicles').select('Vehicle_Plate, Tax_Expiry, Insurance_Expiry, Act_Expiry')
        
        if (effectiveBranchId) {
            query = query.eq('Branch_ID', effectiveBranchId)
        }

        const { data, error } = await query
        if (error || !data) return []

        const today = new Date()
        const metrics = [
            { name: "Vehicle Registration (ภาษีรถ)", status: "valid", date: "-", daysLeft: 0, total: 0, alert: 0 },
            { name: "Vehicle Insurance (ประกันภัย)", status: "valid", date: "-", daysLeft: 0, total: 0, alert: 0 },
            { name: "Compulsory ACT (พ.ร.บ.)", status: "valid", date: "-", daysLeft: 0, total: 0, alert: 0 },
        ]

        data.forEach((v: any) => {
            const check = (expiry: string | null, idx: number) => {
                if (!expiry) return
                const expDate = new Date(expiry)
                const diffTime = expDate.getTime() - today.getTime()
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                
                if (diffDays < metrics[idx].daysLeft || metrics[idx].daysLeft === 0) {
                    metrics[idx].daysLeft = diffDays
                    metrics[idx].date = expiry
                }

                if (diffDays <= 15) metrics[idx].alert++
                else if (diffDays <= 30 && metrics[idx].status !== 'expiredSoon') metrics[idx].status = 'expiring'
                
                if (diffDays <= 0) metrics[idx].status = 'expiredSoon'
            }

            check(v.Tax_Expiry, 0)
            check(v.Insurance_Expiry, 1)
            check(v.Act_Expiry, 2)
        })

        return metrics.map(m => ({
            ...m,
            status: m.daysLeft <= 0 ? 'expiredSoon' : m.daysLeft <= 30 ? 'expiring' : 'valid'
        }))
    } catch {
        return []
    }
}

// 15. Fleet Health Score
export async function getFleetHealthScore(branchId?: string) {
    try {
        const supabase = await createAdminClient()
        const effectiveBranchId = await getEffectiveBranchId(branchId)

        let query = supabase.from('Master_Vehicles').select('Active_Status')
        
        if (effectiveBranchId) {
            query = query.eq('Branch_ID', effectiveBranchId)
        }

        const { data, error } = await query
        if (error || !data || data.length === 0) return 100

        const active = data.filter((v: any) => v.Active_Status === 'Active').length
        return Math.round((active / data.length) * 100)
    } catch {
        return 100
    }
}

// 16. Delay/Failure Root Cause Analysis
export async function getDelayRootCause(startDate?: string, endDate?: string, branchId?: string) {
    try {
        const supabase = await createAdminClient()
        const effectiveBranchId = await getEffectiveBranchId(branchId)
        const sDate = formatDateSafe(startDate)
        const eDate = formatDateSafe(endDate)

        let query = supabase
            .from('Jobs_Main')
            .select('Failed_Reason')
            .not('Failed_Reason', 'is', null)
            .neq('Failed_Reason', '')

        if (sDate) query = query.gte('Plan_Date', sDate)
        if (eDate) query = query.lte('Plan_Date', eDate)
        if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

        const { data } = await query
        const reasons: Record<string, number> = {}
        data?.forEach((j: any) => {
            const r = j.Failed_Reason || 'อื่นๆ'
            reasons[r] = (reasons[r] || 0) + 1
        })

        return Object.entries(reasons)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
    } catch {
        return []
    }
}

// 17. Vehicle Job Details (for Drill-down)
export async function getVehicleJobDetails(plate: string, startDate?: string, endDate?: string) {
    try {
        const supabase = await createAdminClient()
        const sDate = formatDateSafe(startDate)
        const eDate = formatDateSafe(endDate)

        let query = supabase
            .from('Jobs_Main')
            .select('Job_ID, Plan_Date, Customer_Name, Route_Name, Job_Status, Price_Cust_Total, Cost_Driver_Total')
            .eq('Vehicle_Plate', plate)
            .order('Plan_Date', { ascending: false })

        if (sDate) query = query.gte('Plan_Date', sDate)
        if (eDate) query = query.lte('Plan_Date', eDate)

        const { data } = await query
        return data || []
    } catch {
        return []
    }
}

