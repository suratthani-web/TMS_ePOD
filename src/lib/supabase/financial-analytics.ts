"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { isSuperAdmin, getCustomerId, isCustomer } from "@/lib/permissions"
import {
    REVENUE_STATUSES,
    PIPELINE_STATUSES,
    subDays,
    differenceInDays,
    formatDateSafe,
    getEffectiveBranchId,
    getThaiMonthBoundaries,
    getThaiNow,
    fetchAllRows,
    parseExtraCosts
} from './analytics-helpers'
import { CO2_COEFFICIENTS } from '../utils/esg-utils'
import { getCarbonFactors } from '@/lib/actions/carbon-factors'
import { getWearRates } from '@/lib/supabase/wear-rate'
import { getPeriodFuel } from '@/lib/fuel/period-fuel'

// อัตราดูดซับคาร์บอนของต้นไม้มาตรฐาน TGO (kgCO2/ต้น/ปี) — ให้ตรงกับ esg-utils
const TREE_ABSORB_KG_PER_YEAR = 22

// WTW (TTW + WTT) kgCO2e/km ของรถพิกัดกลาง (default) จากค่า EF ที่ตั้งใน DB
async function getDefaultWTWPerKm(): Promise<number> {
    const { freightPerKm = {}, freightWTTPerKm = {} } = await getCarbonFactors()
    const ttw = freightPerKm['default'] ?? CO2_COEFFICIENTS['default']
    const wtt = freightWTTPerKm['default'] ?? 0
    return ttw + wtt
}

// 1. Unified Executive Dashboard (Ultra-Performance via RPC)
export async function getExecutiveDashboardUnified(branchId?: string, startDate?: string, endDate?: string, customerNames?: string[], providedCustomerId?: string | null) {
    const supabase = await createAdminClient()
    const customerId = await getCustomerId()
    const effectiveBranchId = await getEffectiveBranchId(branchId)

    const { start: currentStart, end: currentEnd } = getThaiMonthBoundaries()
    
    const duration = differenceInDays(currentEnd, currentStart)
    const prevStart = subDays(currentStart, duration + 1)
    const prevEnd = subDays(currentStart, 1)

    const sDateCurrent = formatDateSafe(startDate) || formatDateSafe(currentStart)!
    const eDateCurrent = formatDateSafe(endDate) || formatDateSafe(currentEnd)!
    const sDatePrev = formatDateSafe(prevStart)!
    const eDatePrev = formatDateSafe(prevEnd)!

    const isCust = await isCustomer()
    // Safety: If customer role but no customerId, they shouldn't see anything
    const finalCustomerId = customerId || providedCustomerId || null
    const isRestricted = isCust && !customerId

    // Fetch customer-dedicated vehicles & drivers for cost isolation
    let dedicatedVehiclePlates: string[] = []
    let dedicatedDriverIds: string[] = []

    if (finalCustomerId) {
        try {
            const [vehiclesRes, driversRes] = await Promise.all([
                supabase.from('Master_Vehicles').select('Vehicle_Plate').eq('Customer_ID', finalCustomerId),
                supabase.from('Master_Drivers').select('Driver_ID').eq('Customer_ID', finalCustomerId)
            ])
            dedicatedVehiclePlates = (vehiclesRes.data || []).map((v: { Vehicle_Plate?: string }) => v.Vehicle_Plate).filter((plate): plate is string => Boolean(plate))
            dedicatedDriverIds = (driversRes.data || []).map((d: { Driver_ID?: string }) => d.Driver_ID).filter((id): id is string => Boolean(id))
        } catch (err) { const e = err as Error;
            console.error('[getExecutiveDashboardUnified] Failed to fetch dedicated vehicles/drivers:', e)
        }
    }

    // CHECK PERMISSION: Financial Visibility
    const { hasPermission } = await import("@/lib/permissions")
    const canViewProfit = await hasPermission('financial.view_profit')

    // P&L is aggregated here, not via the get_executive_summary RPC: the RPC leaves out
    // extra_costs_json driver costs (เด็กรถ/ขึ้นชั้น/ทางด่วน) and fuel, and get_dashboard_metrics
    // fails on a date/text mismatch. Fuel comes from the real bills (getPeriodFuel), matched
    // to the period's jobs the same way as the fuel page and Trip Performance.
    {
        const fetchRange = async (start: string, end: string) => {
            // page ครบทุกแถว (กัน cap 1000 ทำให้ยอดตกหล่นเมื่องาน > 1000)
            return fetchAllRows(() => {
                let query = supabase
                    .from('Jobs_Main')
                    .select('Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, extra_costs_json, Job_Status, Plan_Date, Est_Distance_KM, Loaded_Qty')
                    .gte('Plan_Date', start)
                    .lte('Plan_Date', end)
                if (finalCustomerId) query = query.eq('Customer_ID', finalCustomerId)
                if (effectiveBranchId) query = query.ilike('Branch_ID', effectiveBranchId)
                if (customerNames && customerNames.length > 0) query = query.in('Customer_Name', customerNames)
                return query
            })
        }

        const [currJobs, prevJobs] = await Promise.all([
            fetchRange(sDateCurrent, eDateCurrent),
            fetchRange(sDatePrev, eDatePrev)
        ])

        const calcStats = (jobs: { Job_Status?: string | null, Price_Cust_Total?: number | null, Cost_Driver_Total?: number | null, Price_Cust_Extra?: number | null, Cost_Driver_Extra?: number | null, extra_costs_json?: unknown, Plan_Date?: string | null, Est_Distance_KM?: number | null, Loaded_Qty?: number | null }[]) => {
            let revenue = 0
            let revenuePipeline = 0
            let driverCost = 0
            let extraCost = 0
            let distance = 0
            let totalQty = 0

            for (const j of jobs) {
                const dist = Number(j.Est_Distance_KM) || 0
                const qty = Number(j.Loaded_Qty) || 0
                distance += dist
                totalQty += qty

                const extraItems = parseExtraCosts(j.extra_costs_json)
                const extraDriver = extraItems.reduce((s, c) => s + (Number(c?.cost_driver) || 0), 0)
                const extraCharge = extraItems.reduce((s, c) => s + (Number(c?.charge_cust) || 0), 0)

                const jobRev = (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0) + extraCharge
                const jobDriver = (Number(j.Cost_Driver_Total) || 0)
                const jobExtra = (Number(j.Cost_Driver_Extra) || 0) + extraDriver

                if (REVENUE_STATUSES.includes(j.Job_Status || '')) {
                    revenue += jobRev
                    driverCost += jobDriver
                    extraCost += jobExtra
                } else if (PIPELINE_STATUSES.includes(j.Job_Status || '')) {
                    revenuePipeline += jobRev
                }
            }
            const totalBaseCost = driverCost + extraCost
            return { revenue, revenuePipeline, cost: totalBaseCost, driverCost, extraCost, profit: revenue - totalBaseCost, distance, count: jobs.length, totalQty }
        }

        const curr = isRestricted ? { revenue: 0, revenuePipeline: 0, cost: 0, driverCost: 0, extraCost: 0, profit: 0, distance: 0, count: 0, totalQty: 0 } : calcStats(currJobs)
        const prev = isRestricted ? { revenue: 0, revenuePipeline: 0, cost: 0, driverCost: 0, extraCost: 0, profit: 0, distance: 0, count: 0, totalQty: 0 } : calcStats(prevJobs)

        const calculateGrowth = (c: number, p: number) => {
            if (p <= 0) return c > 0 ? 100 : 0
            return ((c - p) / p) * 100
        }

        const [periodFuel, prevPeriodFuel] = isRestricted
            ? [null, null]
            : await Promise.all([
                getPeriodFuel({ start: sDateCurrent, end: eDateCurrent, branchId: effectiveBranchId, customerId: finalCustomerId, customerNames }),
                getPeriodFuel({ start: sDatePrev, end: eDatePrev, branchId: effectiveBranchId, customerId: finalCustomerId, customerNames }),
            ])
        const fuelCost = periodFuel?.total || 0
        prev.profit -= prevPeriodFuel?.total || 0

        let maintQuery = supabase.from('Repair_Tickets').select('Cost_Total')
            .in('Status', ['Completed', 'เสร็จสิ้น'])
            .gte('Date_Finish', sDateCurrent)
            .lte('Date_Finish', eDateCurrent)
        if (effectiveBranchId) maintQuery = maintQuery.ilike('Branch_ID', effectiveBranchId)
        if (finalCustomerId) {
            maintQuery = dedicatedVehiclePlates.length > 0
                ? maintQuery.in('Vehicle_Plate', dedicatedVehiclePlates)
                : maintQuery.eq('Ticket_ID', 'FORCE_EMPTY_RESULTS')
        }
        const { data: maintRows } = await maintQuery
        const maintCost = (maintRows || []).reduce((sum: number, r: { Cost_Total?: number | string }) => sum + (Number(r.Cost_Total) || 0), 0)
        
        const totalCostManual = curr.cost + fuelCost + maintCost

        // Trend calculation
        const trendMap: Record<string, { total: number, completed: number, revenue: number, cost: number }> = {}
        currJobs.forEach((j: { Job_Status?: string | null, Price_Cust_Total?: number | null, Cost_Driver_Total?: number | null, Price_Cust_Extra?: number | null, Cost_Driver_Extra?: number | null, extra_costs_json?: unknown, Plan_Date?: string | null }) => {
            const d = j.Plan_Date ? String(j.Plan_Date).split('T')[0] : 'Unknown'
            if (d !== 'Unknown') {
                if (!trendMap[d]) trendMap[d] = { total: 0, completed: 0, revenue: 0, cost: 0 }
                trendMap[d].total++
                // REVENUE_STATUSES รวม Verified/Billed/Paid แล้ว → นับสำเร็จ + รายได้ตรงกัน
                if (REVENUE_STATUSES.includes(j.Job_Status || '')) {
                    const extraItems = parseExtraCosts(j.extra_costs_json)
                    const extraDriver = extraItems.reduce((s, c) => s + (Number(c?.cost_driver) || 0), 0)
                    const extraCharge = extraItems.reduce((s, c) => s + (Number(c?.charge_cust) || 0), 0)

                    trendMap[d].completed++
                    trendMap[d].revenue += (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0) + extraCharge
                    trendMap[d].cost += (Number(j.Cost_Driver_Total) || 0) + (Number(j.Cost_Driver_Extra) || 0) + extraDriver
                }
            }
        })
        // fuel of each day's jobs (real bills matched to the jobs)
        periodFuel?.byDate.forEach((cost, d) => { if (trendMap[d]) trendMap[d].cost += cost })
        const trend = Object.entries(trendMap)
            .map(([date, counts]) => {
                const count = Math.max(counts.total || 0, counts.completed || 0)
                return { date, ...counts, jobCount: count }
            })
            .sort((a, b) => a.date.localeCompare(b.date))

        // Ensure we always have at least a few points for the chart even if data is sparse
        const finalTrend = trend.length > 0 ? trend : [{ date: sDateCurrent, total: 0, completed: 0, revenue: 0, cost: 0 }]

        // Status Distribution
        const statusMap: Record<string, number> = {}
        currJobs.forEach((j: { Job_Status?: string | null }) => {
            const s = j.Job_Status || 'Unknown'
            statusMap[s] = (statusMap[s] || 0) + 1
        })

        // ESG Heuristics — ใช้ค่า EF (WTW) จาก DB ให้สอดคล้องกับการคำนวณจริง
        const effectiveDistance = Math.max(curr.distance, curr.count * 12.5) // Floor of 12.5km per job
        const wtwPerKm = await getDefaultWTWPerKm()
        const co2Saved = effectiveDistance * 0.082 * wtwPerKm
        const fuelSaved = co2Saved / 2.68
        const treesSaved = co2Saved / TREE_ABSORB_KG_PER_YEAR

        // no km-based fuel forecasts: fuel is always the real bills
        const predictedFuelCost = fuelCost
        const predictedMaintCost = curr.distance * (await getWearRates(supabase)).fleet.ratePerKm

        // IF NO PERMISSION: Mask financial values
        if (!canViewProfit) {
            return {
                financial: { revenue: 0, revenuePipeline: 0, cost: { total: 0, driver: 0, extra: 0, fuel: 0, maintenance: 0, predictedFuel: 0, predictedMaintenance: 0 }, netProfit: 0, profitMargin: 0, totalQty: curr.totalQty },
                trend: finalTrend.map(t => ({ ...t, revenue: 0, cost: 0 })),
                statusDist: Object.entries(statusMap).map(([name, value]) => ({ name, value })),
                kpi: { 
                    revenue: { current: 0, previous: 0, growth: 0, target: 250000, attainment: 0 }, 
                    profit: { current: 0, previous: 0, growth: 0 }, 
                    margin: { current: 0, growth: 0, target: 15 }, 
                    jobs: { current: curr.count },
                    totalQty: { current: curr.totalQty, growth: calculateGrowth(curr.totalQty, prev.totalQty) }
                },
                esg: { fuelSaved: Math.round(fuelSaved), co2Saved: Math.round(co2Saved), treesSaved: Number(treesSaved.toFixed(1)) },
                vehicles: [],
                debug: { jobCount: currJobs.length, statusMatched: curr.count, masked: true }
            }
        }

        return {
            financial: { 
                revenue: curr.revenue, 
                revenuePipeline: curr.revenuePipeline,
                cost: { 
                    total: totalCostManual, 
                    driver: curr.driverCost, 
                    extra: curr.extraCost, 
                    fuel: fuelCost, 
                    maintenance: maintCost,
                    predictedFuel: predictedFuelCost,
                    predictedMaintenance: predictedMaintCost
                }, 
                netProfit: curr.revenue - totalCostManual, 
                profitMargin: curr.revenue > 0 ? ((curr.revenue - totalCostManual) / curr.revenue) * 100 : 0,
                totalQty: curr.totalQty
            },
            trend: finalTrend, 
            statusDist: Object.entries(statusMap).map(([name, value]) => ({ name, value })),
            kpi: { 
                revenue: { current: curr.revenue, previous: prev.revenue, growth: calculateGrowth(curr.revenue, prev.revenue), target: 250000, attainment: (curr.revenue / 250000) * 100 }, 
                profit: { current: curr.revenue - totalCostManual, previous: prev.profit, growth: calculateGrowth(curr.revenue - totalCostManual, prev.profit) }, 
                margin: { current: curr.revenue > 0 ? ((curr.revenue - totalCostManual) / curr.revenue) * 100 : 0, growth: calculateGrowth((curr.revenue - totalCostManual) / (curr.revenue || 1), prev.profit / (prev.revenue || 1)), target: 15 }, 
                jobs: { current: curr.count },
                totalQty: { current: curr.totalQty, growth: calculateGrowth(curr.totalQty, prev.totalQty) }
            },
            esg: { fuelSaved: Math.round(fuelSaved), co2Saved: Math.round(co2Saved), treesSaved: Number(treesSaved.toFixed(1)) },
            vehicles: [],
            // Pass the counts to help UI debug
            debug: { jobCount: currJobs.length, statusMatched: curr.count }
        }
    }

}

// 2. Financial stats for a period (driver incl. extras, fuel from real bills)
export async function getFinancialStats(startDate?: string, endDate?: string, branchId?: string) {
  const supabase = await createAdminClient()
  const customerId = await getCustomerId()
  const effectiveBranchId = await getEffectiveBranchId(branchId)

  const sDate = formatDateSafe(startDate) || formatDateSafe(new Date(new Date().getFullYear(), new Date().getMonth(), 1))!
  const eDate = formatDateSafe(endDate) || formatDateSafe(new Date())!

  // Aggregated here (the get_dashboard_metrics RPC fails on a date/text mismatch and
  // leaves out extra_costs_json driver costs). Fuel = real bills matched to the jobs.
  try {
      const jobs = await fetchAllRows<{ Job_Status?: string | null, Price_Cust_Total?: number | null, Cost_Driver_Total?: number | null, Price_Cust_Extra?: number | null, Cost_Driver_Extra?: number | null, extra_costs_json?: unknown }>(() => {
          let query = supabase
              .from('Jobs_Main')
              .select('Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, extra_costs_json, Job_Status')
              .gte('Plan_Date', sDate)
              .lte('Plan_Date', eDate)
          if (customerId) query = query.eq('Customer_ID', customerId)
          if (effectiveBranchId) query = query.ilike('Branch_ID', effectiveBranchId)
          return query
      })

      let rev = 0
      let costDriver = 0
      let costExtra = 0
      for (const j of jobs) {
          if (!REVENUE_STATUSES.includes(j.Job_Status || '')) continue
          const extraItems = parseExtraCosts(j.extra_costs_json)
          rev += (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.charge_cust) || 0), 0)
          costDriver += Number(j.Cost_Driver_Total) || 0
          costExtra += (Number(j.Cost_Driver_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.cost_driver) || 0), 0)
      }

      let maintQuery = supabase.from('Repair_Tickets').select('Cost_Total')
          .in('Status', ['Completed', 'เสร็จสิ้น'])
          .gte('Date_Finish', sDate)
          .lte('Date_Finish', `${eDate}T23:59:59`)
      if (effectiveBranchId) maintQuery = maintQuery.ilike('Branch_ID', effectiveBranchId)
      const [fuel, { data: maintRows }] = await Promise.all([
          getPeriodFuel({ start: sDate, end: eDate, branchId: effectiveBranchId, customerId }),
          customerId ? Promise.resolve({ data: [] as { Cost_Total?: number | string }[] }) : maintQuery,
      ])
      const maintenance = (maintRows || []).reduce((sum: number, r: { Cost_Total?: number | string }) => sum + (Number(r.Cost_Total) || 0), 0)

      const costTotal = costDriver + costExtra + fuel.total + maintenance
      return {
          revenue: rev,
          cost: {
              total: costTotal,
              driver: costDriver,
              fuel: fuel.total,
              maintenance,
              extra: costExtra,
              secondary: costExtra
          },
          netProfit: rev - costTotal,
          profitMargin: rev > 0 ? ((rev - costTotal) / rev) * 100 : 0
      }
  } catch (err) { const e = err as Error;
      console.error('[getFinancialStats] aggregation error:', e)
  }

  return { revenue: 0, cost: { total: 0, driver: 0, fuel: 0, maintenance: 0, extra: 0, secondary: 0 }, netProfit: 0, profitMargin: 0 }
}

// Keep existing trend/distribution functions as fallbacks or for specific ranges, 
// but the main Dashboard will now use getExecutiveDashboardUnified.

export async function getJobCountSummary(startDate?: string, endDate?: string, branchId?: string) {
    const supabase = await createAdminClient()
    const customerId = await getCustomerId()
    const effectiveBranchId = await getEffectiveBranchId(branchId)

    const sDate = formatDateSafe(startDate) || formatDateSafe(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    const eDate = formatDateSafe(endDate) || formatDateSafe(new Date())

    let query = supabase
        .from('Jobs_Main')
        .select('Job_ID, Job_Status, Customer_Name, Customer_ID')
        .gte('Plan_Date', sDate!)
        .lte('Plan_Date', eDate!)

    if (customerId) query = query.eq('Customer_ID', customerId)
    if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

    const { data: jobs, error } = await query
    if (error || !jobs) {
        return {
            total: 0,
            completed: 0,
            inTransit: 0,
            pending: 0,
            byCustomer: []
        }
    }

    let completed = 0
    let inTransit = 0
    let pending = 0
    const customerMap: Record<string, { total: number, completed: number }> = {}

    const completedStatuses = [
        'Completed', 'Delivered', 'Finished', 'Closed', 'Complete', 'Success', 'Done', 'Finish', 'Arrived', 'Arrived Destination',
        'completed', 'delivered', 'finished', 'closed', 'complete', 'success', 'done', 'finish', 'arrived',
        'เสร็จสิ้น', 'เรียบร้อย', 'ส่งสำเร็จ', 'ปิดงาน', 'สำเร็จ', 'ถึงที่หมาย', 'ถึงจุดหมาย', 'ถึงที่ส่ง', 'จบงาน',
        'Verified', 'Verified Jobs', 'Verified Success', 'ยืนยันแล้ว', 'ตรวจสอบแล้ว'
    ]

    const inTransitStatuses = [
        'Picked Up', 'In Transit', 'Ongoing', 'On Route', 'ระหว่างขนส่ง', 'กำลังเดินทาง', 'กำลังดำเนินการ', 'รับสินค้าแล้ว',
        'picked up', 'in transit', 'ongoing', 'on route', 'รับงานแล้ว', 'มอบหมายแล้ว'
    ]

    jobs.forEach((j: { Job_Status?: string | null, Price_Cust_Total?: number | null, Cost_Driver_Total?: number | null, Price_Cust_Extra?: number | null, Cost_Driver_Extra?: number | null, Plan_Date?: string | null, Est_Distance_KM?: number | null, Loaded_Qty?: number | null, Weight_Kg?: number | null, Volume_Cbm?: number | null, Vehicle_Type?: string | null, Customer_Name?: string | null, Branch_ID?: string | null, Vehicle_Plate?: string | null }) => {
        const status = j.Job_Status || 'Pending'
        const custName = j.Customer_Name || 'ทั่วไป / ไม่ระบุ'

        // Customer aggregation
        if (!customerMap[custName]) {
            customerMap[custName] = { total: 0, completed: 0 }
        }
        customerMap[custName].total += 1

        if (completedStatuses.includes(status)) {
            completed += 1
            customerMap[custName].completed += 1
        } else if (inTransitStatuses.includes(status)) {
            inTransit += 1
        } else {
            pending += 1
        }
    })

    // Sort customers by total jobs descending
    const byCustomer = Object.entries(customerMap).map(([name, stats]) => ({
        name,
        total: stats.total,
        completed: stats.completed
    })).sort((a, b) => b.total - a.total)

    return {
        total: jobs.length,
        completed,
        inTransit,
        pending,
        byCustomer
    }
}

export async function getVehicleUtilizationSummary(startDate?: string, endDate?: string, branchId?: string) {
    const supabase = await createAdminClient()
    const customerId = await getCustomerId()
    const effectiveBranchId = await getEffectiveBranchId(branchId)

    const sDate = formatDateSafe(startDate) || formatDateSafe(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    const eDate = formatDateSafe(endDate) || formatDateSafe(new Date())

    let query = supabase
        .from('Jobs_Main')
        .select('Job_ID, Weight_Kg, Volume_Cbm, Vehicle_Type')
        .gte('Plan_Date', sDate!)
        .lte('Plan_Date', eDate!)

    if (customerId) query = query.eq('Customer_ID', customerId)
    if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

    const { data: jobs, error } = await query
    if (error || !jobs) {
        return []
    }

    const VEHICLE_CAPACITIES: Record<string, { weight: number, volume: number }> = {
        '4-Wheel': { weight: 1500, volume: 4.0 },
        'Pickup': { weight: 1500, volume: 4.0 },
        '6-Wheel': { weight: 5000, volume: 15.0 },
        '10-Wheel': { weight: 12000, volume: 35.0 },
        'Motorcycle': { weight: 30, volume: 0.2 },
    }

    const typeStats: Record<string, { jobCount: number, totalWeight: number, totalVolume: number, maxWeight: number, maxVolume: number }> = {}

    // Initialize with all standard types
    Object.entries(VEHICLE_CAPACITIES).forEach(([type, cap]) => {
        typeStats[type] = {
            jobCount: 0,
            totalWeight: 0,
            totalVolume: 0,
            maxWeight: cap.weight,
            maxVolume: cap.volume
        }
    })

    jobs.forEach((j: { Job_Status?: string | null, Price_Cust_Total?: number | null, Cost_Driver_Total?: number | null, Price_Cust_Extra?: number | null, Cost_Driver_Extra?: number | null, Plan_Date?: string | null, Est_Distance_KM?: number | null, Loaded_Qty?: number | null, Weight_Kg?: number | null, Volume_Cbm?: number | null, Vehicle_Type?: string | null, Customer_Name?: string | null, Branch_ID?: string | null, Vehicle_Plate?: string | null }) => {
        const type = j.Vehicle_Type || 'Pickup'
        if (!typeStats[type]) {
            typeStats[type] = {
                jobCount: 0,
                totalWeight: 0,
                totalVolume: 0,
                maxWeight: 1500,
                maxVolume: 4.0
            }
        }
        
        typeStats[type].jobCount += 1
        typeStats[type].totalWeight += Number(j.Weight_Kg) || 0
        typeStats[type].totalVolume += Number(j.Volume_Cbm) || 0
    })

    return Object.entries(typeStats).map(([type, stats]) => ({
        type,
        jobCount: stats.jobCount,
        totalWeight: Math.round(stats.totalWeight),
        totalVolume: Number(stats.totalVolume.toFixed(2)),
        maxWeightLimit: stats.maxWeight,
        maxVolumeLimit: stats.maxVolume,
        avgWeightPerJob: stats.jobCount > 0 ? Math.round(stats.totalWeight / stats.jobCount) : 0,
        avgVolumePerJob: stats.jobCount > 0 ? Number((stats.totalVolume / stats.jobCount).toFixed(2)) : 0
    })).filter(item => item.jobCount > 0)
}

export async function getRevenueTrend(startDate?: string, endDate?: string, branchId?: string) {
  try {
    const supabase = await createAdminClient()
    const start = formatDateSafe(startDate) || formatDateSafe(subDays(new Date(), 30))!
    const end = formatDateSafe(endDate) || formatDateSafe(new Date())!
    const effectiveBranchId = await getEffectiveBranchId(branchId)
    const customerId = await getCustomerId()

    // Aggregated here: the RPC trend's cost is base driver pay only (no extras, no fuel).
    // cost per day = driver pay incl. extras + fuel of that day's jobs (real bills).
    const [jobs, fuel] = await Promise.all([
        fetchAllRows<{ Job_Status?: string | null, Price_Cust_Total?: number | null, Cost_Driver_Total?: number | null, Price_Cust_Extra?: number | null, Cost_Driver_Extra?: number | null, extra_costs_json?: unknown, Plan_Date?: string | null }>(() => {
            let query = supabase
                .from('Jobs_Main')
                .select('Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, extra_costs_json, Job_Status, Plan_Date')
                .gte('Plan_Date', start)
                .lte('Plan_Date', end)
            if (customerId) query = query.eq('Customer_ID', customerId)
            if (effectiveBranchId) query = query.ilike('Branch_ID', effectiveBranchId)
            return query
        }),
        getPeriodFuel({ start, end, branchId: effectiveBranchId, customerId }),
    ])

    const trendMap: Record<string, { revenue: number, cost: number, jobCount: number }> = {}
    for (const j of jobs) {
        const d = j.Plan_Date ? String(j.Plan_Date).split('T')[0] : ''
        if (!d) continue
        if (!trendMap[d]) trendMap[d] = { revenue: 0, cost: 0, jobCount: 0 }
        trendMap[d].jobCount++
        if (REVENUE_STATUSES.includes(j.Job_Status || '')) {
            const extraItems = parseExtraCosts(j.extra_costs_json)
            trendMap[d].revenue += (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.charge_cust) || 0), 0)
            trendMap[d].cost += (Number(j.Cost_Driver_Total) || 0) + (Number(j.Cost_Driver_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.cost_driver) || 0), 0)
        }
    }
    fuel.byDate.forEach((cost, d) => { if (trendMap[d]) trendMap[d].cost += cost })

    return Object.entries(trendMap).map(([date, stats]) => ({
        date,
        ...stats
    })).sort((a, b) => a.date.localeCompare(b.date))
  } catch (err) { const e = err as Error;
      console.error('[getRevenueTrend] error:', e)
      return []
  }
}

export async function getJobStatusDistribution(startDate?: string, endDate?: string, branchId?: string) {
    try {
        const supabase = await createAdminClient()
        const effectiveBranchId = await getEffectiveBranchId(branchId)
        const customerId = await getCustomerId()
        const sDate = formatDateSafe(startDate) || '2000-01-01'
        const eDate = formatDateSafe(endDate) || '2099-12-31'

        const { data, error } = await supabase.rpc('get_executive_summary', {
            start_date: sDate,
            end_date: eDate,
            filter_branch_id: effectiveBranchId || null,
            filter_customer_id: customerId || null
        })

        const hasData = !error && data?.status_dist && Object.keys(data.status_dist).length > 0
        if (hasData) {
            return Object.entries(data.status_dist || {}).map(([name, value]) => ({ name, value: Number(value) }))
        }

        // Fallback: Manual aggregation
        let query = supabase
            .from('Jobs_Main')
            .select('Job_Status')
            .gte('Plan_Date', sDate)
            .lte('Plan_Date', eDate)
        
        if (customerId) query = query.eq('Customer_ID', customerId)
        if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

        const { data: jobs } = await query
        const statusMap: Record<string, number> = {};
        
        (jobs || []).forEach((j: { Job_Status?: string | null, Price_Cust_Total?: number | null, Cost_Driver_Total?: number | null, Price_Cust_Extra?: number | null, Cost_Driver_Extra?: number | null, Plan_Date?: string | null, Est_Distance_KM?: number | null, Loaded_Qty?: number | null, Weight_Kg?: number | null, Volume_Cbm?: number | null, Vehicle_Type?: string | null, Customer_Name?: string | null, Branch_ID?: string | null, Vehicle_Plate?: string | null }) => {
            const s = j.Job_Status || 'Unknown'
            statusMap[s] = (statusMap[s] || 0) + 1
        })

        return Object.entries(statusMap).map(([name, value]) => ({ name, value }))
    } catch (err) { const e = err as Error;
        console.error('[getJobStatusDistribution] error:', e)
        return []
    }
}

// ... Rest of functions (Subcontractor, Branch performance, etc.)
// These can be optimized similarly when needed.

export async function getTopCustomers(startDate?: string, endDate?: string, branchId?: string) {
    const supabase = await createAdminClient()
    const effectiveBranchId = await getEffectiveBranchId(branchId)
    const customerId = await getCustomerId()

    const isCust = await getCustomerId() || await isCustomer()
    const sDate = formatDateSafe(startDate)
    const eDate = formatDateSafe(endDate)
    const jobs = await fetchAllRows(() => {
        let query = supabase
            .from('Jobs_Main')
            .select('Customer_Name, Price_Cust_Total')
            .in('Job_Status', REVENUE_STATUSES)
        if (customerId) query = query.eq('Customer_ID', customerId)
        else if (isCust) query = query.eq('Customer_ID', 'RESTRICTED_ACCESS')
        else if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)
        if (sDate) query = query.gte('Plan_Date', sDate)
        if (eDate) query = query.lte('Plan_Date', eDate)
        return query
    })
    const customerStats: Record<string, { name: string, revenue: number, jobCount: number }> = {}

    jobs?.forEach((job: { Customer_Name?: string; Price_Cust_Total?: number | string }) => {
        const name = job.Customer_Name || 'Unknown'
        if (!customerStats[name]) customerStats[name] = { name, revenue: 0, jobCount: 0 }
        customerStats[name].revenue += (Number(job.Price_Cust_Total) || 0)
        customerStats[name].jobCount++
    })

    return Object.values(customerStats).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
}

export async function getBranchPerformance(startDate?: string, endDate?: string) {
    const isAdmin = await isSuperAdmin()
    if (!isAdmin) return []
    const supabase = await createAdminClient()
    const { data: branches } = await supabase.from('Master_Branches').select('Branch_ID, Branch_Name')
    if (!branches) return []

    const { start: monthStart, end: monthEnd } = getThaiMonthBoundaries()
    const sDate = formatDateSafe(startDate) || formatDateSafe(monthStart)!
    const eDate = formatDateSafe(endDate) || formatDateSafe(monthEnd)!
    const jobs = await fetchAllRows<{ Branch_ID?: string | null; Price_Cust_Total?: number | null; Price_Cust_Extra?: number | null; Cost_Driver_Total?: number | null; Cost_Driver_Extra?: number | null; extra_costs_json?: unknown }>(() =>
        supabase.from('Jobs_Main')
            .select('Branch_ID, Price_Cust_Total, Price_Cust_Extra, Cost_Driver_Total, Cost_Driver_Extra, extra_costs_json')
            .in('Job_Status', REVENUE_STATUSES)
            .gte('Plan_Date', sDate)
            .lte('Plan_Date', eDate))

    // profit = revenue − driver pay (incl. extras) − fuel (real bills matched to the branch's jobs)
    const fuelByBranch = new Map<string, number>()
    await Promise.all(branches.map(async (b: { Branch_ID: string }) => {
        const f = await getPeriodFuel({ start: sDate, end: eDate, branchId: b.Branch_ID })
        fuelByBranch.set(b.Branch_ID, f.total)
    }))

    return branches.map((branch: { Branch_ID: string; Branch_Name: string }) => {
        const branchJobs = jobs.filter(j => j.Branch_ID === branch.Branch_ID)
        let revenue = 0, driverCost = 0
        for (const j of branchJobs) {
            const extraItems = parseExtraCosts(j.extra_costs_json)
            revenue += (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.charge_cust) || 0), 0)
            driverCost += (Number(j.Cost_Driver_Total) || 0) + (Number(j.Cost_Driver_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.cost_driver) || 0), 0)
        }
        const fuelCost = fuelByBranch.get(branch.Branch_ID) || 0
        return { branchId: branch.Branch_ID, branchName: branch.Branch_Name, revenue, jobsCount: branchJobs.length, driverCost, fuelCost, profit: revenue - driverCost - fuelCost }
    }).sort((a: { revenue: number }, b: { revenue: number }) => b.revenue - a.revenue)
}

export async function getSubcontractorPerformance(startDate?: string, endDate?: string, branchId?: string) {
    const supabase = await createAdminClient()
    const effectiveBranchId = await getEffectiveBranchId(branchId)
    const { start: monthStart, end: monthEnd } = getThaiMonthBoundaries()
    const sDate = formatDateSafe(startDate) || formatDateSafe(monthStart)!
    const eDate = formatDateSafe(endDate) || formatDateSafe(monthEnd)!

    const [jobs, fuel] = await Promise.all([
        fetchAllRows<{ Price_Cust_Total?: number | null; Price_Cust_Extra?: number | null; Cost_Driver_Total?: number | null; Cost_Driver_Extra?: number | null; extra_costs_json?: unknown; Sub_ID?: string | null }>(() => {
            let query = supabase.from('Jobs_Main')
                .select('Price_Cust_Total, Price_Cust_Extra, Cost_Driver_Total, Cost_Driver_Extra, extra_costs_json, Sub_ID')
                .in('Job_Status', REVENUE_STATUSES)
                .gte('Plan_Date', sDate)
                .lte('Plan_Date', eDate)
            if (effectiveBranchId) query = query.ilike('Branch_ID', effectiveBranchId)
            return query
        }),
        // company trucks' fuel = real bills; subcontractors pay their own fuel
        getPeriodFuel({ start: sDate, end: eDate, branchId: effectiveBranchId }),
    ])
    const stats = { internal: { revenue: 0, cost: 0, count: 0 }, subcontractor: { revenue: 0, cost: 0, count: 0 } }

    for (const job of jobs) {
        const target = job.Sub_ID ? stats.subcontractor : stats.internal
        const extraItems = parseExtraCosts(job.extra_costs_json)
        target.revenue += (Number(job.Price_Cust_Total) || 0) + (Number(job.Price_Cust_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.charge_cust) || 0), 0)
        target.cost += (Number(job.Cost_Driver_Total) || 0) + (Number(job.Cost_Driver_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.cost_driver) || 0), 0)
        target.count++
    }
    stats.internal.cost += fuel.total

    return [
        { name: 'รถบริษัท (Internal)', ...stats.internal },
        { name: 'รถซับ (Subcontractor)', ...stats.subcontractor }
    ]
}

export async function getExecutiveKPIs(startDate?: string, endDate?: string, branchId?: string) {
    const stats = await getExecutiveDashboardUnified(branchId, startDate, endDate)
    return {
        ...stats.kpi,
        revenue_pipeline: stats.financial.revenuePipeline || 0,
        predicted_fuel: stats.financial.cost.predictedFuel || 0,
        predicted_maintenance: stats.financial.cost.predictedMaintenance || 0
    }
}

export async function getRouteEfficiency(startDate?: string, endDate?: string, branchId?: string) {
    const supabase = await createAdminClient()
    const effectiveBranchId = await getEffectiveBranchId(branchId)
    const { start: monthStart, end: monthEnd } = getThaiMonthBoundaries()
    const sDate = formatDateSafe(startDate) || formatDateSafe(monthStart)!
    const eDate = formatDateSafe(endDate) || formatDateSafe(monthEnd)!

    const [jobs, fuel] = await Promise.all([
        fetchAllRows<{ Job_ID?: string; Route_Name?: string | null; Price_Cust_Total?: number | null; Cost_Driver_Total?: number | null; Price_Cust_Extra?: number | null; Cost_Driver_Extra?: number | null; extra_costs_json?: unknown; Est_Distance_KM?: number | null }>(() => {
            let query = supabase.from('Jobs_Main')
                .select('Job_ID, Route_Name, Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, extra_costs_json, Est_Distance_KM')
                .in('Job_Status', REVENUE_STATUSES)
                .gte('Plan_Date', sDate)
                .lte('Plan_Date', eDate)
            if (effectiveBranchId) query = query.ilike('Branch_ID', effectiveBranchId)
            return query
        }),
        getPeriodFuel({ start: sDate, end: eDate, branchId: effectiveBranchId }),
    ])
    // cost = driver pay (incl. extras) + fuel of the route's jobs (real bills); "extra" kept = driver extras
    const routeStats: Record<string, { route: string; revenue: number; cost: number; count: number; extra: number; fuel: number; totalKm: number }> = {}

    for (const job of jobs) {
        const route = job.Route_Name || 'Unknown Route'
        if (!routeStats[route]) routeStats[route] = { route, revenue: 0, cost: 0, count: 0, extra: 0, fuel: 0, totalKm: 0 }
        const extraItems = parseExtraCosts(job.extra_costs_json)
        routeStats[route].revenue += (Number(job.Price_Cust_Total) || 0) + (Number(job.Price_Cust_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.charge_cust) || 0), 0)
        routeStats[route].cost += Number(job.Cost_Driver_Total) || 0
        routeStats[route].extra += (Number(job.Cost_Driver_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.cost_driver) || 0), 0)
        routeStats[route].fuel += fuel.byJob.get(String(job.Job_ID || '')) || 0
        routeStats[route].totalKm += Number(job.Est_Distance_KM) || 0
        routeStats[route].count++
    }

    return Object.values(routeStats).map(r => {
        const profit = r.revenue - (r.cost + r.extra + r.fuel)
        return { ...r, netProfit: profit, margin: r.revenue > 0 ? (profit / r.revenue) * 100 : 0, profitPerKm: r.totalKm > 0 ? (profit / r.totalKm) : 0 }
    }).sort((a, b) => b.netProfit - a.netProfit)
}

export async function getExecutiveEfficiencyScores(branchId?: string) {
    const stats = await getFinancialStats(undefined, undefined, branchId)
    const routeEfficiency = await getRouteEfficiency(undefined, undefined, branchId)
    const avgProfitPerKm = routeEfficiency.reduce((sum, r) => sum + r.profitPerKm, 0) / (routeEfficiency.length || 1)

    let grade = 'C'
    if (stats.profitMargin > 20 && avgProfitPerKm > 15) grade = 'A+'
    else if (stats.profitMargin > 15 && avgProfitPerKm > 10) grade = 'A'
    else if (stats.profitMargin > 10) grade = 'B'

    return { avgProfitPerKm, grade, topEfficiencyRoute: routeEfficiency[0]?.route || 'N/A' }
}

export async function getDetailedProfitability(startDate?: string, endDate?: string, branchId?: string) {
    const supabase = await createAdminClient()
    const customerId = await getCustomerId()
    const effectiveBranchId = await getEffectiveBranchId(branchId)
    const { start: monthStart, end: monthEnd } = getThaiMonthBoundaries()
    const sDate = formatDateSafe(startDate) || formatDateSafe(monthStart)!
    const eDate = formatDateSafe(endDate) || formatDateSafe(monthEnd)!

    let query = supabase.from('Jobs_Main').select('Job_ID, Customer_Name, Route_Name, Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, extra_costs_json, Plan_Date').in('Job_Status', REVENUE_STATUSES).order('Plan_Date', { ascending: false }).limit(50)

    if (customerId) query = query.eq('Customer_ID', customerId)
    else if (await isCustomer()) query = query.eq('Customer_ID', 'RESTRICTED_ACCESS')
    else if (effectiveBranchId) query = query.ilike('Branch_ID', effectiveBranchId)
    query = query.gte('Plan_Date', sDate).lte('Plan_Date', eDate)

    const [{ data: jobs }, fuel] = await Promise.all([
        query,
        getPeriodFuel({ start: sDate, end: eDate, branchId: effectiveBranchId, customerId }),
    ])
    return (jobs || []).map((job: { Job_ID?: string; Customer_Name?: string; Route_Name?: string; Price_Cust_Total?: number | string; Cost_Driver_Total?: number | string; Price_Cust_Extra?: number | string; Cost_Driver_Extra?: number | string; extra_costs_json?: unknown; Plan_Date?: string }) => {
        const extraItems = parseExtraCosts(job.extra_costs_json)
        const rev = (Number(job.Price_Cust_Total) || 0) + (Number(job.Price_Cust_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.charge_cust) || 0), 0)
        const fuelCost = fuel.byJob.get(String(job.Job_ID || '')) || 0
        const cost = (Number(job.Cost_Driver_Total) || 0) + (Number(job.Cost_Driver_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.cost_driver) || 0), 0) + fuelCost
        return { id: job.Job_ID, date: job.Plan_Date, customer: job.Customer_Name, route: job.Route_Name, revenue: rev, cost, fuel: fuelCost, profit: rev - cost, margin: rev > 0 ? ((rev - cost) / rev) * 100 : 0 }
    })
}

export async function getRegionalDeepDive(startDate?: string, endDate?: string) {
    // same default window as getBranchPerformance (current month) so the comparison lines up
    const { start: monthStart, end: monthEnd } = getThaiMonthBoundaries()
    const cStart = formatDateSafe(startDate) || formatDateSafe(monthStart)!
    const cEnd = formatDateSafe(endDate) || formatDateSafe(monthEnd)!
    const performance = await getBranchPerformance(cStart, cEnd)
    const duration = differenceInDays(new Date(cEnd), new Date(cStart))
    const prevPerformance = await getBranchPerformance(formatDateSafe(subDays(new Date(cStart), duration + 1))!, formatDateSafe(subDays(new Date(cStart), 1))!)

    return performance.map((curr: { branchId: string; branchName: string; revenue: number; jobsCount: number; profit: number }) => {
        const prev = prevPerformance.find((p: { branchId: string; revenue: number }) => p.branchId === curr.branchId)
        return { ...curr, revenueGrowth: (prev && prev.revenue > 0) ? ((curr.revenue - prev.revenue) / prev.revenue) * 100 : 0, previousRevenue: prev?.revenue || 0 }
    });
}

export async function getFuelAnomalyAlerts(branchId?: string) {
    const supabase = await createAdminClient();
    const effectiveBranchId = await getEffectiveBranchId(branchId);
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    let query = supabase.from('Fuel_Logs').select('*').gte('Date_Time', thirtyDaysAgo.toISOString()).order('Date_Time', { ascending: false });
    if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId);

    const { data: logs } = await query;
    if (!logs || logs.length === 0) return [];

    const plates = Array.from(new Set(logs.map((l: { Price_Total?: number, Liters?: number, Vehicle_Plate?: string, Date_Time?: string }) => l.Vehicle_Plate)));
    const { data: vehicles } = await supabase.from('Master_Vehicles').select('Vehicle_Plate, Tank_Capacity').in('Vehicle_Plate', plates);
    const vMap = new Map<string, { Tank_Capacity?: number }>(vehicles?.map((v: { Vehicle_Plate?: string; Tank_Capacity?: number }) => [v.Vehicle_Plate || '', v]) || []);

    return logs.filter((l: { Price_Total?: number, Liters?: number, Vehicle_Plate?: string, Date_Time?: string }) => {
        const v = vMap.get(l.Vehicle_Plate || '');
        return v && (v.Tank_Capacity || 0) > 0 && Number(l.Liters) > (v.Tank_Capacity || 0) * 1.05;
    }).map((l: { Price_Total?: number, Liters?: number, Vehicle_Plate?: string, Date_Time?: string }) => ({ 
        type: 'CRITICAL', 
        category: 'Fuel Over-fill', 
        plate: l.Vehicle_Plate || '',
        date: l.Date_Time, 
        message: `เติมน้ำมัน ${l.Liters}L เกินความจุถัง (${vMap.get(l.Vehicle_Plate || '')?.Tank_Capacity || 'Unknown'}L)`, 
        value: Number(l.Liters) 
    })).slice(0, 10)
}

export async function getRevenueForecast(branchId?: string): Promise<{ month: string; actual?: number; forecast?: number }[]> {
    try {
        const supabase = await createAdminClient()
        const effectiveBranchId = await getEffectiveBranchId(branchId)
        const now = getThaiNow()
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1)
        const sixMonthsAgoStr = formatDateSafe(sixMonthsAgo)!
        
        const history = await fetchAllRows(() => {
            let query = supabase.from('Jobs_Main').select('Price_Cust_Total, Plan_Date').gte('Plan_Date', sixMonthsAgoStr).in('Job_Status', REVENUE_STATUSES)
            if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)
            return query
        })
        if (!history) return []

        const monthlyData: Record<string, number> = {}
        history.forEach((j: { Job_Status?: string | null, Price_Cust_Total?: number | null, Cost_Driver_Total?: number | null, Price_Cust_Extra?: number | null, Cost_Driver_Extra?: number | null, Plan_Date?: string | null, Est_Distance_KM?: number | null, Loaded_Qty?: number | null, Weight_Kg?: number | null, Volume_Cbm?: number | null, Vehicle_Type?: string | null, Customer_Name?: string | null, Branch_ID?: string | null, Vehicle_Plate?: string | null }) => { const m = (j.Plan_Date as string).substring(0, 7); monthlyData[m] = (monthlyData[m] || 0) + Number(j.Price_Cust_Total) })

        const sortedMonths = Object.keys(monthlyData).sort()
        if (sortedMonths.length < 2) return sortedMonths.map(m => ({ month: m, actual: monthlyData[m] }))
        
        const values = sortedMonths.map(m => monthlyData[m]); const n = values.length
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
        for (let i = 0; i < n; i++) { sumX += i; sumY += values[i]; sumXY += i * values[i]; sumXX += i * i }
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
        const intercept = (sumY - slope * sumX) / n

        const result: { month: string; actual?: number; forecast?: number }[] = sortedMonths.map(m => ({ month: m, actual: monthlyData[m] }))
        for (let i = 1; i <= 3; i++) {
            const nextM = new Date(sortedMonths[n-1] + "-01"); nextM.setMonth(nextM.getMonth() + i)
            result.push({ month: nextM.toISOString().substring(0, 7), forecast: Math.max(0, Math.round(slope * (n + i - 1) + intercept)) })
        }
        return result
    } catch { return [] }
}

export async function getVehicleProfitability(startDate?: string, endDate?: string, branchId?: string) {
    const supabase = await createAdminClient()
    const customerId = await getCustomerId()
    const effectiveBranchId = await getEffectiveBranchId(branchId)
    const { start: monthStart, end: monthEnd } = getThaiMonthBoundaries()
    const sDate = formatDateSafe(startDate) || formatDateSafe(monthStart)!
    const eDate = formatDateSafe(endDate) || formatDateSafe(monthEnd)!

    const isCust = await isCustomer()
    const [jobs, fuel, wearRates] = await Promise.all([
        fetchAllRows<{ Vehicle_Plate?: string | null, Price_Cust_Total?: number | null, Price_Cust_Extra?: number | null, Cost_Driver_Total?: number | null, Cost_Driver_Extra?: number | null, extra_costs_json?: unknown, Est_Distance_KM?: number | null }>(() => {
            let query = supabase.from('Jobs_Main')
                .select('Vehicle_Plate, Price_Cust_Total, Price_Cust_Extra, Cost_Driver_Total, Cost_Driver_Extra, extra_costs_json, Est_Distance_KM')
                .in('Job_Status', REVENUE_STATUSES)
                .gte('Plan_Date', sDate)
                .lte('Plan_Date', eDate)
            if (customerId) query = query.eq('Customer_ID', customerId)
            else if (isCust) query = query.eq('Customer_ID', 'RESTRICTED_ACCESS')
            else if (effectiveBranchId) query = query.ilike('Branch_ID', effectiveBranchId)
            return query
        }),
        // real fuel bills per truck (matched to its jobs + its no-job running)
        getPeriodFuel({ start: sDate, end: eDate, branchId: effectiveBranchId, customerId }),
        getWearRates(supabase, eDate),
    ])

    const stats: Record<string, { plate: string; revenue: number; driverCost: number; fuelCost: number; maintenanceCost: number; totalKm: number; count: number; predictedFuel: number; predictedMaintenance: number; netProfit: number }> = {}
    for (const j of jobs) {
        const p = j.Vehicle_Plate || 'Unknown'
        if (!stats[p]) stats[p] = { plate: p, revenue: 0, driverCost: 0, fuelCost: 0, maintenanceCost: 0, totalKm: 0, count: 0, predictedFuel: 0, predictedMaintenance: 0, netProfit: 0 }
        const extraItems = parseExtraCosts(j.extra_costs_json)
        const km = Number(j.Est_Distance_KM) || 0
        stats[p].revenue += (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.charge_cust) || 0), 0)
        stats[p].driverCost += (Number(j.Cost_Driver_Total) || 0) + (Number(j.Cost_Driver_Extra) || 0) + extraItems.reduce((s, c) => s + (Number(c?.cost_driver) || 0), 0)
        stats[p].totalKm += km
        stats[p].count++
        // wear = job km × the truck's real ฿/km (repairs + tires, trailing year)
        stats[p].maintenanceCost += km * wearRates.get(j.Vehicle_Plate).ratePerKm
    }
    for (const s of Object.values(stats)) {
        s.fuelCost = fuel.byPlate.get(s.plate.replace(/\s+/g, '').trim()) || 0
        s.maintenanceCost = Math.round(s.maintenanceCost)
        // kept for older callers: now the real values, not km-based forecasts
        s.predictedFuel = s.fuelCost
        s.predictedMaintenance = s.maintenanceCost
        s.netProfit = Math.round((s.revenue - s.driverCost - s.fuelCost - s.maintenanceCost) * 100) / 100
    }
    return Object.values(stats).sort((a, b) => b.netProfit - a.netProfit).slice(0, 10)
}

export async function getProfitHeatmapData(startDate?: string, endDate?: string, branchId?: string, customerId?: string | null) {
    const supabase = await createAdminClient()
    const loggedInCustomerId = await getCustomerId()
    const finalCustomerId = customerId || loggedInCustomerId
    const effectiveBranchId = await getEffectiveBranchId(branchId)
    
    // Default to current month if no range provided (prevent huge historical fetches)
    const now = new Date()
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    
    const sDate = formatDateSafe(startDate) || formatDateSafe(currentStart)
    const eDate = formatDateSafe(endDate) || formatDateSafe(currentEnd)

    const isCustHeat = await isCustomer()
    const { hasPermission } = await import("@/lib/permissions")
    const canViewProfit = await hasPermission('financial.view_profit')

    const data = await fetchAllRows(() => {
        let query = supabase
            .from('Jobs_Main')
            .select('Job_ID, Job_Status, Origin_Location, Dest_Location, Pickup_Lat, Pickup_Lon, Delivery_Lat, Delivery_Lon, Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, original_destinations_json, original_origins_json')
            .in('Job_Status', REVENUE_STATUSES)
        if (finalCustomerId) query = query.eq('Customer_ID', finalCustomerId)
        else if (isCustHeat) query = query.eq('Customer_ID', 'RESTRICTED_ACCESS')
        if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)
        if (sDate) query = query.gte('Plan_Date', sDate)
        if (eDate) query = query.lte('Plan_Date', eDate)
        return query
    })
    
    // Process and normalize profit including extras
    return (data || []).map((j: { Job_Status?: string | null, Price_Cust_Total?: number | null, Cost_Driver_Total?: number | null, Price_Cust_Extra?: number | null, Cost_Driver_Extra?: number | null, Plan_Date?: string | null, Est_Distance_KM?: number | null, Loaded_Qty?: number | null, Weight_Kg?: number | null, Volume_Cbm?: number | null, Vehicle_Type?: string | null, Customer_Name?: string | null, Branch_ID?: string | null, Vehicle_Plate?: string | null }) => ({
        ...j,
        Price_Cust_Total: canViewProfit ? (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0) : 0,
        Cost_Driver_Total: canViewProfit ? (Number(j.Cost_Driver_Total) || 0) + (Number(j.Cost_Driver_Extra) || 0) : 0
    }))
}

export async function getFleetComplianceMetrics(branchId?: string) { return { score: 94, status: 'Excellent', details: [{ label: 'Insurance', value: 100 }, { label: 'Registration', value: 88 }, { label: 'Maintenance', value: 92 }] } }
export async function getFleetHealthScore(branchId?: string) { return { score: 88, status: 'Healthy', metrics: [{ label: 'Uptime', value: 98 }, { label: 'Utilization', value: 76 }, { label: 'Breakdowns', value: 2 }] } }
