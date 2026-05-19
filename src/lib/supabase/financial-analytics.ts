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
    getThaiNow
} from './analytics-helpers'
import { CO2_COEFFICIENTS } from '../utils/esg-utils'

// 1. Unified Executive Dashboard (Ultra-Performance via RPC)
export async function getExecutiveDashboardUnified(branchId?: string, startDate?: string, endDate?: string, customerNames?: string[]) {
    const supabase = await createAdminClient()
    const customerId = await getCustomerId()
    const effectiveBranchId = await getEffectiveBranchId(branchId)
    console.log(`[DEBUG] getExecutiveDashboardUnified: branchId=${branchId}, effectiveBranchId=${effectiveBranchId}`)

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
    const finalCustomerId = customerId || null
    const isRestricted = isCust && !customerId

    // CHECK PERMISSION: Financial Visibility
    const { hasPermission } = await import("@/lib/permissions")
    const canViewProfit = await hasPermission('financial.view_profit')

    // Use the new Super RPC for Current Month (Only if no specific customer names are filtered)
    let currentData, rpcError;
    if (!customerNames || customerNames.length === 0) {
        try {
            const response = await supabase.rpc('get_executive_summary', {
                start_date: sDateCurrent,
                end_date: eDateCurrent,
                filter_branch_id: effectiveBranchId || null,
                filter_customer_id: finalCustomerId
            })
            currentData = response.data
            rpcError = response.error
        } catch (e) {
            console.warn('[getExecutiveDashboardUnified] RPC call failed, switching to fallback.')
        }
    } else {
        // Force fallback to manual aggregation if filtering by customer names
        rpcError = { message: 'Manual filtering required for customer names' }
    }

    const hasNoData = currentData && (!currentData.financial || (currentData.financial.revenue === 0 && currentData.kpi?.jobs?.current === 0))
    
    // Fallback if Restricted, RPC fails, or is missing/zero data
    if (isRestricted || rpcError || !currentData || hasNoData) {
        if (isRestricted) {
             console.debug('[getExecutiveDashboardUnified] Restricted access (Customer role but no Customer_ID)')
        } else if (rpcError) {
            console.warn('[getExecutiveDashboardUnified] RPC failed or type mismatch, using manual fallback:', rpcError.message || rpcError)
        }
        
        // Manual fallback: Fetch Current & Previous for Comparison
        const fetchRange = async (start: string, end: string) => {
            let query = supabase
                .from('Jobs_Main')
                .select('Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, Job_Status, Plan_Date, Est_Distance_KM, Loaded_Qty')
                .gte('Plan_Date', start)
                .lte('Plan_Date', end)
            
            if (finalCustomerId) query = query.eq('Customer_ID', finalCustomerId)
            if (effectiveBranchId) {
                console.log(`[DEBUG] fetchRange applying branch filter: "${effectiveBranchId}"`)
                query = query.ilike('Branch_ID', effectiveBranchId)
            }
            if (customerNames && customerNames.length > 0) query = query.in('Customer_Name', customerNames)
            
            console.log(`[DEBUG] fetchRange: start=${start}, end=${end}, branch=${effectiveBranchId}`)
            const { data, error } = await query
            if (error) console.error('[DEBUG] fetchRange Error:', error)
            return data || []
        }

        const [currJobs, prevJobs] = await Promise.all([
            fetchRange(sDateCurrent, eDateCurrent),
            fetchRange(sDatePrev, eDatePrev)
        ])

        const calcStats = (jobs: any[]) => {
            const revenue = jobs.filter(j => REVENUE_STATUSES.includes(j.Job_Status || '')).reduce((sum, j) => sum + (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0), 0)
            const revenuePipeline = jobs.filter(j => PIPELINE_STATUSES.includes(j.Job_Status || '')).reduce((sum, j) => sum + (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0), 0)
            const cost = jobs.filter(j => REVENUE_STATUSES.includes(j.Job_Status || '')).reduce((sum, j) => sum + (Number(j.Cost_Driver_Total) || 0) + (Number(j.Cost_Driver_Extra) || 0), 0)
            const distance = jobs.reduce((sum, j) => sum + (Number(j.Est_Distance_KM) || 0), 0)
            const totalQty = jobs.reduce((sum, j) => sum + (Number(j.Loaded_Qty) || 0), 0)
            return { revenue, revenuePipeline, cost, profit: revenue - cost, distance, count: jobs.length, totalQty }
        }

        const curr = isRestricted ? { revenue: 0, revenuePipeline: 0, cost: 0, profit: 0, distance: 0, count: 0, totalQty: 0 } : calcStats(currJobs)
        const prev = isRestricted ? { revenue: 0, revenuePipeline: 0, cost: 0, profit: 0, distance: 0, count: 0, totalQty: 0 } : calcStats(prevJobs)

        const calculateGrowth = (c: number, p: number) => {
            if (p <= 0) return c > 0 ? 100 : 0
            return ((c - p) / p) * 100
        }

        // Fetch Fuel and Maint for Fallback
        let fuelQuery = supabase.from('Fuel_Logs').select('Price_Total')
            .gte('Date_Time', sDateCurrent)
            .lte('Date_Time', eDateCurrent)
        
        let maintQuery = supabase.from('Repair_Tickets').select('Cost_Total')
            .in('Status', ['Completed', 'เสร็จสิ้น'])
            .gte('Date_Finish', sDateCurrent)
            .lte('Date_Finish', eDateCurrent)

        if (effectiveBranchId) {
            fuelQuery = fuelQuery.ilike('Branch_ID', effectiveBranchId)
            maintQuery = maintQuery.ilike('Branch_ID', effectiveBranchId)
        }

        const [fuelData, maintData] = await Promise.all([fuelQuery, maintQuery])

        const fuelCost = (fuelData.data || []).reduce((sum, l) => sum + (Number(l.Price_Total) || 0), 0)
        const maintCost = (maintData.data || []).reduce((sum, r) => sum + (Number(r.Cost_Total) || 0), 0)
        
        const totalCostManual = curr.cost + fuelCost + maintCost

        // Trend calculation
        const trendMap: Record<string, { total: number, completed: number, revenue: number, cost: number }> = {}
        currJobs.forEach(j => {
            const d = j.Plan_Date ? String(j.Plan_Date).split('T')[0] : 'Unknown'
            if (d !== 'Unknown') {
                if (!trendMap[d]) trendMap[d] = { total: 0, completed: 0, revenue: 0, cost: 0 }
                trendMap[d].total++
                if (REVENUE_STATUSES.includes(j.Job_Status)) {
                    trendMap[d].completed++
                    trendMap[d].revenue += (Number(j.Price_Cust_Total) || 0)
                    trendMap[d].cost += (Number(j.Cost_Driver_Total) || 0) + (Number(j.Price_Cust_Extra) || 0) + (Number(j.Cost_Driver_Extra) || 0)
                }
            }
        })
        const trend = Object.entries(trendMap)
            .map(([date, counts]) => ({ date, ...counts }))
            .sort((a, b) => a.date.localeCompare(b.date))

        // Ensure we always have at least a few points for the chart even if data is sparse
        const finalTrend = trend.length > 0 ? trend : [{ date: sDateCurrent, total: 0, completed: 0, revenue: 0, cost: 0 }]

        // Status Distribution
        const statusMap: Record<string, number> = {}
        currJobs.forEach(j => {
            const s = j.Job_Status || 'Unknown'
            statusMap[s] = (statusMap[s] || 0) + 1
        })

        // ESG Heuristics
        const effectiveDistance = Math.max(curr.distance, curr.count * 12.5) // Floor of 12.5km per job
        const co2Saved = effectiveDistance * 0.082 * CO2_COEFFICIENTS['default']
        const fuelSaved = co2Saved / 2.68
        const treesSaved = co2Saved / 20.2

        const predictedFuelCost = (curr.distance / 10) * 38 // 10km/L, 38 THB/L
        const predictedMaintCost = curr.distance * 1.5 // 1.5 THB/KM

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
                    driver: curr.cost, 
                    extra: 0, 
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

    // Get Previous Month Financials for Growth Calculation
    const { data: prevData, error: prevRpcError } = await supabase.rpc('get_dashboard_metrics', {
        start_date: sDatePrev,
        end_date: eDatePrev,
        filter_branch_id: effectiveBranchId || null,
        filter_customer_id: finalCustomerId
    })

    // TMS 2026: Manual aggregation for Pipeline Revenue, Fuel, and Maintenance
    let revenuePipeline = 0;
    let fuelCost = 0;
    let maintenanceCost = 0;

    try {
        const fetchPipeline = supabase
            .from('Jobs_Main')
            .select('Price_Cust_Total')
            .in('Job_Status', PIPELINE_STATUSES)
            .gte('Plan_Date', sDateCurrent)
            .lte('Plan_Date', eDateCurrent)
        
        const fetchFuel = supabase
            .from('Fuel_Logs')
            .select('Price_Total')
            .gte('Date_Time', `${sDateCurrent}T00:00:00`)
            .lte('Date_Time', `${eDateCurrent}T23:59:59`)

        const fetchMaint = supabase
            .from('Repair_Tickets')
            .select('Cost_Total')
            .in('Status', ['Completed', 'เสร็จสิ้น'])
            .gte('Date_Finish', `${sDateCurrent}T00:00:00`)
            .lte('Date_Finish', `${eDateCurrent}T23:59:59`)

        if (effectiveBranchId) {
            console.log(`[DEBUG] fetchPipeline/Fuel/Maint applying branch filter: "${effectiveBranchId}"`)
            fetchPipeline.eq('Branch_ID', effectiveBranchId)
            fetchFuel.eq('Branch_ID', effectiveBranchId)
            fetchMaint.eq('Branch_ID', effectiveBranchId)
        }
        
        const [pipeRes, fuelRes, maintRes] = await Promise.all([
            fetchPipeline,
            fetchFuel,
            fetchMaint
        ])

        revenuePipeline = (pipeRes.data || []).reduce((sum, j) => sum + (Number(j.Price_Cust_Total) || 0), 0)
        fuelCost = (fuelRes.data || []).reduce((sum, f) => sum + (Number(f.Price_Total) || 0), 0)
        maintenanceCost = (maintRes.data || []).reduce((sum, m) => sum + (Number(m.Cost_Total) || 0), 0)

    } catch (e) {
        console.warn('[getExecutiveDashboardUnified] Operational cost aggregation failed', e)
    }

    if (prevRpcError) {
        console.error('[getExecutiveDashboardUnified] get_dashboard_metrics RPC Error:', prevRpcError)
    }

    // 1. Process Financials from RPC data
    const fin = currentData?.financial || {}
    const revenue = Number(fin.revenue) || 0
    const driverCost = Number(fin.driver_cost) || 0
    const extraCost = Number(fin.extra_cost) || 0
    
    const totalCost = driverCost + extraCost + fuelCost + maintenanceCost
    const netProfit = revenue - totalCost
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0

    // 2. Process KPI Growth
    const prevRevenue = Number(prevData?.revenue) || 0
    const prevNetProfit = Number(prevData?.net_profit) || 0
    const prevMargin = prevRevenue > 0 ? (prevNetProfit / prevRevenue) * 100 : 0
    
    const calculateGrowth = (curr: number, prev: number) => {
        if (prev <= 0) return curr > 0 ? 100 : 0
        return ((curr - prev) / prev) * 100
    }

    // 3. ESG Intelligence (Dynamic)
    // Formula: Total Distance * Efficiency Factor * Improvement %
    // Heuristic: Use real distance or 12.5km per job if distance data is missing
    const rawDistance = Number(currentData?.financial?.total_distance) || 0
    const jobCount = Number(currentData?.financial?.job_count) || 0
    const effectiveDistance = Math.max(rawDistance, jobCount * 12.5)
    
    // TMS 2026 Goal: 8.2% Efficiency Gain Benchmark
    const totalSavedKm = effectiveDistance * 0.082
    const co2Saved = totalSavedKm * CO2_COEFFICIENTS['default'] // Standard CO2 per avg KM saved (Medium Fleet)
    const fuelSaved = co2Saved / 2.68 
    const treesSaved = co2Saved / 20.2 

    const predictedFuelCost = (effectiveDistance / 10) * 38
    const predictedMaintCost = effectiveDistance * 1.5

    // IF NO PERMISSION: Mask financial values
    if (!canViewProfit) {
        return {
            financial: { revenue: 0, revenuePipeline: 0, cost: { total: 0, driver: 0, extra: 0, fuel: 0, maintenance: 0, predictedFuel: 0, predictedMaintenance: 0 }, netProfit: 0, profitMargin: 0 },
            trend: (currentData?.trend || []).map((t: any) => ({
                date: t.date,
                total: Number(t.job_count) || 0,
                completed: Number(t.completed_count) || 0,
                revenue: 0,
                cost: 0
            })),
            statusDist: Object.entries(currentData?.status_dist || {}).map(([name, value]) => ({ name, value: Number(value) })),
            kpi: {
                revenue: { current: 0, previous: 0, growth: 0, target: 250000, attainment: 0 },
                profit: { current: 0, previous: 0, growth: 0 },
                margin: { current: 0, growth: 0, target: 15 },
                jobs: { current: Number(fin.job_count) || 0 }
            },
            esg: { fuelSaved: Math.round(fuelSaved), co2Saved: Math.round(co2Saved), treesSaved: Number(treesSaved.toFixed(1)) },
            vehicles: [],
            debug: { masked: true }
        }
    }

    return {
        financial: {
            revenue,
            revenuePipeline,
            cost: { 
                total: totalCost, 
                driver: driverCost, 
                extra: extraCost, 
                fuel: fuelCost, 
                maintenance: maintenanceCost,
                predictedFuel: predictedFuelCost,
                predictedMaintenance: predictedMaintCost
            },
            netProfit,
            profitMargin: margin
        },
        trend: (currentData?.trend || []).map((t: any) => ({
            date: t.date,
            total: Number(t.job_count) || 0,
            completed: Number(t.completed_count) || 0,
            revenue: Number(t.revenue) || 0,
            cost: Number(t.cost) || 0
        })),
        statusDist: Object.entries(currentData?.status_dist || {}).map(([name, value]) => ({ name, value: Number(value) })),
        kpi: {
            revenue: { current: revenue, previous: prevRevenue, growth: calculateGrowth(revenue, prevRevenue), target: 250000, attainment: (revenue / 250000) * 100 },
            profit: { current: netProfit, previous: prevNetProfit, growth: calculateGrowth(netProfit, prevNetProfit) },
            margin: { current: margin, growth: margin - prevMargin, target: 15 },
            jobs: { current: Number(fin.job_count) || 0 }
        },
        esg: {
            fuelSaved: Math.round(fuelSaved),
            co2Saved: Math.round(co2Saved),
            treesSaved: Number(treesSaved.toFixed(1))
        },
        vehicles: []
    }
}

// 2. Optimized getFinancialStats using the RPC
export async function getFinancialStats(startDate?: string, endDate?: string, branchId?: string) {
  const supabase = await createAdminClient()
  const customerId = await getCustomerId()
  const effectiveBranchId = await getEffectiveBranchId(branchId)

  const sDate = formatDateSafe(startDate) || formatDateSafe(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const eDate = formatDateSafe(endDate) || formatDateSafe(new Date())

  const { data: metrics, error } = await supabase.rpc('get_dashboard_metrics', {
      start_date: sDate,
      end_date: eDate,
      filter_branch_id: effectiveBranchId || null,
      filter_customer_id: customerId || null
  })

  if (!error && metrics) {
    const fin = metrics.financial || {}
    const rev = Number(fin.revenue) || 0
    const nProfit = rev - (Number(fin.total_cost) || 0)

    return {
      revenue: rev,
      cost: { 
          total: Number(fin.total_cost) || 0, 
          driver: Number(fin.driver_cost) || 0, 
          fuel: Number(fin.fuel_cost) || 0, 
          maintenance: Number(fin.maintenance_cost) || 0, 
          extra: Number(fin.extra_cost) || 0,
          secondary: Number(fin.extra_cost) || 0 
      },
      netProfit: nProfit,
      profitMargin: rev > 0 ? (nProfit / rev) * 100 : 0
    }
  }

  // Fallback: Manual aggregation in JavaScript to bypass RPC type-casting errors
  console.log('[getFinancialStats] Falling back to manual aggregation due to RPC error:', error)
  try {
      let query = supabase
          .from('Jobs_Main')
          .select('Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, Job_Status')
          .gte('Plan_Date', sDate!)
          .lte('Plan_Date', eDate!)
          
      if (customerId) query = query.eq('Customer_ID', customerId)
      if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

      const { data: jobs, error: jobsErr } = await query
      if (!jobsErr && jobs) {
          let rev = 0
          let costTotal = 0
          let costDriver = 0
          let costExtra = 0
          
          jobs.forEach(j => {
              if (REVENUE_STATUSES.includes(j.Job_Status || '')) {
                  const jobRev = (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0)
                  const jobCost = (Number(j.Cost_Driver_Total) || 0) + (Number(j.Cost_Driver_Extra) || 0)
                  
                  rev += jobRev
                  costTotal += jobCost
                  costDriver += (Number(j.Cost_Driver_Total) || 0)
                  costExtra += (Number(j.Cost_Driver_Extra) || 0)
              }
          })
          
          // Also fetch fuel logs for this month to add to cost if applicable
          let fuelCost = 0
          try {
              let fuelQuery = supabase
                  .from('Fuel_Logs')
                  .select('Cost_Total')
                  .gte('Refuel_Date', sDate!)
                  .lte('Refuel_Date', eDate!)
              
              if (effectiveBranchId) {
                  // Helper to get vehicle plates for branch
                  const { getBranchPlates } = await import('./analytics-helpers')
                  const plates = await getBranchPlates(effectiveBranchId)
                  if (plates.length > 0) {
                      fuelQuery = fuelQuery.in('Vehicle_Plate', plates)
                  } else {
                      fuelQuery = fuelQuery.eq('Vehicle_Plate', 'NON_EXISTENT')
                  }
              }
              const { data: fuelLogs } = await fuelQuery
              if (fuelLogs) {
                  fuelCost = fuelLogs.reduce((sum, f) => sum + (Number(f.Cost_Total) || 0), 0)
              }
          } catch (e) {
              console.warn('[getFinancialStats] Fuel fetch error:', e)
          }

          costTotal += fuelCost

          return {
              revenue: rev,
              cost: {
                  total: costTotal,
                  driver: costDriver,
                  fuel: fuelCost,
                  maintenance: 0,
                  extra: costExtra,
                  secondary: costExtra
              },
              netProfit: rev - costTotal,
              profitMargin: rev > 0 ? ((rev - costTotal) / rev) * 100 : 0
          }
      }
  } catch (e) {
      console.error('[getFinancialStats] Fallback execution error:', e)
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

    jobs.forEach(j => {
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

    jobs.forEach(j => {
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
    const start = formatDateSafe(startDate) || formatDateSafe(subDays(new Date(), 30))
    const end = formatDateSafe(endDate) || formatDateSafe(new Date())
    const effectiveBranchId = await getEffectiveBranchId(branchId)
    const customerId = await getCustomerId()

    const { data, error } = await supabase.rpc('get_executive_summary', {
        start_date: start,
        end_date: end,
        filter_branch_id: effectiveBranchId || null,
        filter_customer_id: customerId || null
    })

    if (!error && data?.trend) {
        return (data.trend || []).map((t: any) => ({
            date: t.date,
            revenue: Number(t.revenue),
            cost: Number(t.cost),
            jobCount: Number(t.job_count)
        }))
    }

    // Fallback: Manual aggregation
    let query = supabase
        .from('Jobs_Main')
        .select('Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, Job_Status, Plan_Date')
        .gte('Plan_Date', start!)
        .lte('Plan_Date', end!)
    
    if (customerId) query = query.eq('Customer_ID', customerId)
    if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

    const { data: jobs } = await query
    const trendMap: Record<string, { revenue: number, cost: number, jobCount: number }> = {}
    
    (jobs || []).forEach(j => {
        const d = j.Plan_Date ? String(j.Plan_Date).split('T')[0] : 'Unknown'
        if (d !== 'Unknown') {
            if (!trendMap[d]) trendMap[d] = { revenue: 0, cost: 0, jobCount: 0 }
            trendMap[d].jobCount++
            if (REVENUE_STATUSES.includes(j.Job_Status)) {
                trendMap[d].revenue += (Number(j.Price_Cust_Total) || 0)
                trendMap[d].cost += (Number(j.Cost_Driver_Total) || 0) + (Number(j.Price_Cust_Extra) || 0) + (Number(j.Cost_Driver_Extra) || 0)
            }
        }
    })

    return Object.entries(trendMap).map(([date, stats]) => ({
        date,
        ...stats
    })).sort((a, b) => a.date.localeCompare(b.date))
  } catch (e) {
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
        const statusMap: Record<string, number> = {}
        
        (jobs || []).forEach(j => {
            const s = j.Job_Status || 'Unknown'
            statusMap[s] = (statusMap[s] || 0) + 1
        })

        return Object.entries(statusMap).map(([name, value]) => ({ name, value }))
    } catch (e) {
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

    let query = supabase
        .from('Jobs_Main')
        .select('Customer_Name, Price_Cust_Total')
        .in('Job_Status', REVENUE_STATUSES)
    
    const isCust = await getCustomerId() || await isCustomer()
    
    if (customerId) query = query.eq('Customer_ID', customerId)
    else if (isCust) query = query.eq('Customer_ID', 'RESTRICTED_ACCESS')
    else if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

    const sDate = formatDateSafe(startDate)
    const eDate = formatDateSafe(endDate)
    if (sDate) query = query.gte('Plan_Date', sDate)
    if (eDate) query = query.lte('Plan_Date', eDate)

    const { data: jobs } = await query
    const customerStats: Record<string, { name: string, revenue: number, jobCount: number }> = {}

    jobs?.forEach(job => {
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

    let query = supabase.from('Jobs_Main').select('Branch_ID, Price_Cust_Total, Cost_Driver_Total').in('Job_Status', REVENUE_STATUSES)
    const sDate = formatDateSafe(startDate)
    const eDate = formatDateSafe(endDate)
    if (sDate) query = query.gte('Plan_Date', sDate)
    if (eDate) query = query.lte('Plan_Date', eDate)

    const { data: jobs } = await query
    return branches.map(branch => {
        const branchJobs = jobs?.filter(j => j.Branch_ID === branch.Branch_ID) || []
        const revenue = branchJobs.reduce((sum, j) => sum + (Number(j.Price_Cust_Total) || 0), 0)
        const cost = branchJobs.reduce((sum, j) => sum + (Number(j.Cost_Driver_Total) || 0), 0)
        return { branchId: branch.Branch_ID, branchName: branch.Branch_Name, revenue, jobsCount: branchJobs.length, profit: revenue - cost }
    }).sort((a, b) => b.revenue - a.revenue)
}

export async function getSubcontractorPerformance(startDate?: string, endDate?: string, branchId?: string) {
    const supabase = await createAdminClient()
    const effectiveBranchId = await getEffectiveBranchId(branchId)
    const sDate = formatDateSafe(startDate)
    const eDate = formatDateSafe(endDate)

    let query = supabase.from('Jobs_Main').select('Price_Cust_Total, Cost_Driver_Total, Sub_ID').in('Job_Status', REVENUE_STATUSES)
    if (sDate) query = query.gte('Plan_Date', sDate)
    if (eDate) query = query.lte('Plan_Date', eDate)
    if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

    const { data: jobs } = await query
    const stats = { internal: { revenue: 0, cost: 0, count: 0 }, subcontractor: { revenue: 0, cost: 0, count: 0 } }

    jobs?.forEach(job => {
        const target = job.Sub_ID ? stats.subcontractor : stats.internal
        target.revenue += (Number(job.Price_Cust_Total) || 0)
        target.cost += (Number(job.Cost_Driver_Total) || 0)
        target.count++
    })

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
    const sDate = formatDateSafe(startDate)
    const eDate = formatDateSafe(endDate)

    let query = supabase.from('Jobs_Main').select('Route_Name, Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, Est_Distance_KM').in('Job_Status', REVENUE_STATUSES)
    if (sDate) query = query.gte('Plan_Date', sDate)
    if (eDate) query = query.lte('Plan_Date', eDate)
    if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

    const { data: jobs } = await query
    const routeStats: Record<string, any> = {}

    jobs?.forEach(job => {
        const route = job.Route_Name || 'Unknown Route'
        if (!routeStats[route]) routeStats[route] = { route, revenue: 0, cost: 0, count: 0, extra: 0, totalKm: 0 }
        routeStats[route].revenue += (Number(job.Price_Cust_Total) || 0)
        routeStats[route].cost += (Number(job.Cost_Driver_Total) || 0)
        routeStats[route].extra += (Number(job.Price_Cust_Extra) || 0) + (Number(job.Cost_Driver_Extra) || 0)
        routeStats[route].totalKm += (Number(job.Est_Distance_KM) || 0)
        routeStats[route].count++
    })

    return Object.values(routeStats).map((r: any) => {
        const profit = r.revenue - (r.cost + r.extra)
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
    const sDate = formatDateSafe(startDate)
    const eDate = formatDateSafe(endDate)

    let query = supabase.from('Jobs_Main').select('Job_ID, Customer_Name, Route_Name, Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, Plan_Date').in('Job_Status', REVENUE_STATUSES).order('Plan_Date', { ascending: false }).limit(50)
    
    if (customerId) query = query.eq('Customer_ID', customerId)
    else if (await isCustomer()) query = query.eq('Customer_ID', 'RESTRICTED_ACCESS')
    else if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

    if (sDate) query = query.gte('Plan_Date', sDate)
    if (eDate) query = query.lte('Plan_Date', eDate)

    const { data: jobs } = await query
    return (jobs || []).map(job => {
        const rev = (Number(job.Price_Cust_Total) || 0) + (Number(job.Price_Cust_Extra) || 0)
        const cost = (Number(job.Cost_Driver_Total) || 0) + (Number(job.Cost_Driver_Extra) || 0)
        return { id: job.Job_ID, date: job.Plan_Date, customer: job.Customer_Name, route: job.Route_Name, revenue: rev, cost, profit: rev - cost, margin: rev > 0 ? ((rev - cost) / rev) * 100 : 0 }
    })
}

export async function getRegionalDeepDive(startDate?: string, endDate?: string) {
    const performance = await getBranchPerformance(startDate, endDate)
    const cStart = formatDateSafe(startDate) || formatDateSafe(subDays(new Date(), 30))!
    const cEnd = formatDateSafe(endDate) || formatDateSafe(new Date())!
    const duration = differenceInDays(new Date(cEnd), new Date(cStart))
    const prevPerformance = await getBranchPerformance(formatDateSafe(subDays(new Date(cStart), duration + 1))!, formatDateSafe(subDays(new Date(cStart), 1))!)

    return performance.map(curr => {
        const prev = prevPerformance.find(p => p.branchId === curr.branchId)
        return { ...curr, revenueGrowth: (prev && prev.revenue > 0) ? ((curr.revenue - prev.revenue) / prev.revenue) * 100 : 0, previousRevenue: prev?.revenue || 0 }
    })
}

export async function getFuelAnomalyAlerts(branchId?: string) {
    const supabase = await createAdminClient()
    const effectiveBranchId = await getEffectiveBranchId(branchId)
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    let query = supabase.from('Fuel_Logs').select('*').gte('Date_Time', thirtyDaysAgo.toISOString()).order('Date_Time', { ascending: false })
    if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

    const { data: logs } = await query
    if (!logs || logs.length === 0) return []

    const plates = Array.from(new Set(logs.map(l => l.Vehicle_Plate)))
    const { data: vehicles } = await supabase.from('Master_Vehicles').select('Vehicle_Plate, Tank_Capacity').in('Vehicle_Plate', plates)
    const vMap = new Map(vehicles?.map(v => [v.Vehicle_Plate, v]) || [])

    return logs.filter(l => {
        const v = vMap.get(l.Vehicle_Plate)
        return v && v.Tank_Capacity > 0 && Number(l.Liters) > (v.Tank_Capacity || 0) * 1.05
    }).map(l => ({ 
        type: 'CRITICAL', 
        category: 'Fuel Over-fill', 
        plate: l.Vehicle_Plate, 
        date: l.Date_Time, 
        message: `เติมน้ำมัน ${l.Liters}L เกินความจุถัง (${vMap.get(l.Vehicle_Plate)?.Tank_Capacity}L)`, 
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
        
        let query = supabase.from('Jobs_Main').select('Price_Cust_Total, Plan_Date').gte('Plan_Date', sixMonthsAgoStr).in('Job_Status', REVENUE_STATUSES)
        if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

        const { data: history } = await query
        if (!history) return []

        const monthlyData: Record<string, number> = {}
        history.forEach(j => { const m = (j.Plan_Date as string).substring(0, 7); monthlyData[m] = (monthlyData[m] || 0) + Number(j.Price_Cust_Total) })

        const sortedMonths = Object.keys(monthlyData).sort()
        if (sortedMonths.length < 2) return sortedMonths.map(m => ({ month: m, actual: monthlyData[m] }))
        
        const values = sortedMonths.map(m => monthlyData[m]); const n = values.length
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
        for (let i = 0; i < n; i++) { sumX += i; sumY += values[i]; sumXY += i * values[i]; sumXX += i * i }
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
        const intercept = (sumY - slope * sumX) / n

        const result = sortedMonths.map(m => ({ month: m, actual: monthlyData[m] }))
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
    const sDate = formatDateSafe(startDate); const eDate = formatDateSafe(endDate)

    let query = supabase.from('Jobs_Main').select('Vehicle_Plate, Price_Cust_Total, Cost_Driver_Total, Est_Distance_KM').in('Job_Status', REVENUE_STATUSES)
    
    if (customerId) query = query.eq('Customer_ID', customerId)
    else if (await isCustomer()) query = query.eq('Customer_ID', 'RESTRICTED_ACCESS')
    else if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

    if (sDate) query = query.gte('Plan_Date', sDate)
    if (eDate) query = query.lte('Plan_Date', eDate)

    const { data: jobs } = await query
    const stats: Record<string, any> = {}
    jobs?.forEach(j => {
        const p = j.Vehicle_Plate || 'Unknown'
        if (!stats[p]) stats[p] = { plate: p, revenue: 0, driverCost: 0, fuelCost: 0, maintenanceCost: 0, totalKm: 0, count: 0, predictedFuel: 0, predictedMaintenance: 0, netProfit: 0 }
        stats[p].revenue += Number(j.Price_Cust_Total) || 0
        stats[p].driverCost += Number(j.Cost_Driver_Total) || 0
        stats[p].totalKm += Number(j.Est_Distance_KM) || 0
        stats[p].count++
        
        // Grouping logic for predicted
        const km = Number(j.Est_Distance_KM) || 0
        stats[p].predictedFuel += (km / 10) * 38
        stats[p].predictedMaintenance += (km / 10) * 2
        
        // Net Profit only subtracts Driver Cost (Actual known cost in Jobs_Main)
        // Fuel/Maintenance actuals are handled separately if data is available, 
        // but for this ledger we show predicted as reference.
        stats[p].netProfit = stats[p].revenue - stats[p].driverCost
    })
    return Object.values(stats).sort((a: any, b: any) => b.netProfit - a.netProfit).slice(0, 10) // Show more for the ledger
}

export async function getProfitHeatmapData(startDate?: string, endDate?: string, branchId?: string) {
    const supabase = await createAdminClient()
    const customerId = await getCustomerId()
    const effectiveBranchId = await getEffectiveBranchId(branchId)
    
    // Default to current month if no range provided (prevent huge historical fetches)
    const now = new Date()
    const currentStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    
    const sDate = formatDateSafe(startDate) || formatDateSafe(currentStart)
    const eDate = formatDateSafe(endDate) || formatDateSafe(currentEnd)

    let query = supabase
        .from('Jobs_Main')
        .select('Job_ID, Job_Status, Origin_Location, Dest_Location, Pickup_Lat, Pickup_Lon, Delivery_Lat, Delivery_Lon, Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, original_destinations_json, original_origins_json')
        .in('Job_Status', REVENUE_STATUSES)
    
    if (customerId) query = query.eq('Customer_ID', customerId)
    else if (await isCustomer()) query = query.eq('Customer_ID', 'RESTRICTED_ACCESS')
    else if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)

    if (sDate) query = query.gte('Plan_Date', sDate)
    if (eDate) query = query.lte('Plan_Date', eDate)

    const { hasPermission } = await import("@/lib/permissions")
    const canViewProfit = await hasPermission('financial.view_profit')

    const { data } = await query
    
    // Process and normalize profit including extras
    return (data || []).map(j => ({
        ...j,
        Price_Cust_Total: canViewProfit ? (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0) : 0,
        Cost_Driver_Total: canViewProfit ? (Number(j.Cost_Driver_Total) || 0) + (Number(j.Cost_Driver_Extra) || 0) : 0
    }))
}

export async function getFleetComplianceMetrics(branchId?: string) { return { score: 94, status: 'Excellent', details: [{ label: 'Insurance', value: 100 }, { label: 'Registration', value: 88 }, { label: 'Maintenance', value: 92 }] } }
export async function getFleetHealthScore(branchId?: string) { return { score: 88, status: 'Healthy', metrics: [{ label: 'Uptime', value: 98 }, { label: 'Utilization', value: 76 }, { label: 'Breakdowns', value: 2 }] } }
