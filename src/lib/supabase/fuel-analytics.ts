"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin } from '@/lib/permissions'
import { cookies } from 'next/headers'

export interface FuelAnalytics {
  // Summary KPIs
  totalLiters: number
  totalCost: number
  totalLogs: number
  avgCostPerLiter: number
  avgKmPerLiter: number
  
  // Per-vehicle breakdown
  vehicleBreakdown: {
    vehicle_plate: string
    totalLiters: number
    totalCost: number
    logCount: number
    avgEfficiency: number
    lastOdometer: number
  }[]
  
  // Monthly trends (last 6 months)
  monthlyTrends: {
    month: string
    totalLiters: number
    totalCost: number
    logCount: number
  }[]
  
  // Anomalies (high consumption)
  anomalies: {
    vehicle_plate: string
    date: string
    liters: number
    cost: number
    issue: string
  }[]
}

export async function getFuelAnalytics(dateFrom?: string, dateTo?: string): Promise<FuelAnalytics> {
  const supabase = await createAdminClient()
  const branchId = await getUserBranchId()
  const isAdmin = await isSuperAdmin()
  const cookieStore = await cookies()
  const selectedBranch = cookieStore.get('selectedBranch')?.value

  // Default: last 90 days
  const now = new Date()
  const from = dateFrom || new Date(now.getTime() - 90 * 86400000).toISOString().split('T')[0]
  const to = dateTo || now.toISOString().split('T')[0]

  // Base query for fuel logs
  let query = supabase
    .from('Fuel_Logs')
    .select('Vehicle_Plate, Date_Time, Liters, Price_Total, Odometer')
    .gte('Date_Time', from)
    .lte('Date_Time', to)
    .order('Date_Time', { ascending: false })
    .limit(5000)

  // Enhanced Branch Filtering
  if (isAdmin) {
    if (selectedBranch && selectedBranch !== 'All') {
      query = query.eq('Branch_ID', selectedBranch)
    }
  } else if (branchId) {
    query = query.eq('Branch_ID', branchId)
  }

  const { data: logs } = await query

  if (!logs) {
    return {
      totalLiters: 0, totalCost: 0, totalLogs: 0,
      avgCostPerLiter: 0, avgKmPerLiter: 0,
      vehicleBreakdown: [], monthlyTrends: [], anomalies: []
    }
  }

  // 1. Efficiency Enhancement: Fetch the last log BEFORE the range for vehicles in the current set
  // This allows KM/L calculation even if a vehicle has only 1 log in the selected range
  const platesInRange = Array.from(new Set(logs.map((l: any) => l.Vehicle_Plate).filter(Boolean)))
  let previousLogsMap = new Map<string, number>()

  if (platesInRange.length > 0) {
    // Fetch the most recent log before our 'from' date for each plate
    const { data: prevLogs } = await supabase
      .from('Fuel_Logs')
      .select('Vehicle_Plate, Odometer')
      .lt('Date_Time', `${from}T00:00:00`)
      .in('Vehicle_Plate', platesInRange)
      .order('Date_Time', { ascending: false })

    if (prevLogs) {
      // Since order is descending, the first occurrence for each plate is its most recent
      prevLogs.forEach((pl: any) => {
        if (pl.Vehicle_Plate && pl.Odometer && !previousLogsMap.has(pl.Vehicle_Plate)) {
          previousLogsMap.set(pl.Vehicle_Plate, pl.Odometer)
        }
      })
    }
  }

  // Get vehicle tank capacities for anomaly detection
  const { data: vehicles } = await supabase
    .from('Master_Vehicles')
    .select('Vehicle_Plate, Tank_Capacity')
  const tankMap = new Map<string, number>(vehicles?.map((v: any) => [v.Vehicle_Plate, Number(v.Tank_Capacity) || 50]) || [])

  // Calculate totals
  const totalLiters = logs.reduce((s: number, l: any) => s + (l.Liters || 0), 0)
  const totalCost = logs.reduce((s: number, l: any) => s + (l.Price_Total || 0), 0)
  const avgCostPerLiter = totalLiters > 0 ? totalCost / totalLiters : 0

  // Per-vehicle breakdown
  const vehicleMap = new Map<string, { liters: number; cost: number; count: number; odometers: number[] }>()
  for (const log of logs) {
    const plate = log.Vehicle_Plate || 'Unknown'
    const entry = vehicleMap.get(plate) || { liters: 0, cost: 0, count: 0, odometers: [] }
    entry.liters += log.Liters || 0
    entry.cost += log.Price_Total || 0
    entry.count++
    if (log.Odometer) entry.odometers.push(log.Odometer)
    vehicleMap.set(plate, entry)
  }

  const vehicleBreakdown = Array.from(vehicleMap.entries())
    .map(([plate, v]) => {
      const sortedOdo = v.odometers.sort((a, b) => a - b)
      
      // Use previous log odometer if available to get a start point
      const startOdo = previousLogsMap.get(plate) || (sortedOdo.length >= 1 ? sortedOdo[0] : 0)
      const endOdo = sortedOdo.length >= 1 ? sortedOdo[sortedOdo.length - 1] : startOdo
      
      const totalKm = endOdo > startOdo ? endOdo - startOdo : 0
      
      return {
        vehicle_plate: plate,
        totalLiters: Math.round(v.liters * 10) / 10,
        totalCost: Math.round(v.cost),
        logCount: v.count,
        avgEfficiency: v.liters > 0 && totalKm > 0 ? Math.round((totalKm / v.liters) * 10) / 10 : 0,
        lastOdometer: endOdo,
      }
    })
    .sort((a, b) => b.totalCost - a.totalCost)

  // Calculate overall avg km/l
  const allEfficiencies = vehicleBreakdown.filter(v => v.avgEfficiency > 0).map(v => v.avgEfficiency)
  const avgKmPerLiter = allEfficiencies.length > 0
    ? Math.round((allEfficiencies.reduce((s, e) => s + e, 0) / allEfficiencies.length) * 10) / 10
    : 0

  // 2. Monthly trends with 6-month Padding
  const monthMap = new Map<string, { liters: number; cost: number; count: number }>()
  
  // Initialize last 6 months with zeros
  for (let i = 5; i >= 0; i--) {
     const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
     const mStr = d.toISOString().slice(0, 7)
     monthMap.set(mStr, { liters: 0, cost: 0, count: 0 })
  }

  for (const log of logs) {
    const month = (log.Date_Time || '').slice(0, 7) // YYYY-MM
    if (!month || !monthMap.has(month)) continue
    const entry = monthMap.get(month)!
    entry.liters += log.Liters || 0
    entry.cost += log.Price_Total || 0
    entry.count++
  }

  const monthlyTrends = Array.from(monthMap.entries())
    .map(([month, v]) => ({
      month,
      totalLiters: Math.round(v.liters * 10) / 10,
      totalCost: Math.round(v.cost),
      logCount: v.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // 3. Anomaly detection
  const anomalies: FuelAnalytics['anomalies'] = []
  for (const log of logs) {
    const plate = log.Vehicle_Plate || 'Unknown'
    const tankCap = tankMap.get(plate) || 50
    
    // Flag overflow: >110% of tank capacity
    if (log.Liters && log.Liters > tankCap * 1.1) {
      anomalies.push({
        vehicle_plate: plate,
        date: (log.Date_Time || '').slice(0, 10),
        liters: log.Liters,
        cost: log.Price_Total || 0,
        issue: `เติมเกินถังน้ำมัน (${log.Liters}L / ${tankCap}L)`,
      })
    }
    
    // Flag high cost: >5,000 per fill
    if ((log.Price_Total || 0) > 5000) {
      anomalies.push({
        vehicle_plate: plate,
        date: (log.Date_Time || '').slice(0, 10),
        liters: log.Liters || 0,
        cost: log.Price_Total || 0,
        issue: `ค่าใช้จ่ายสูงผิดปกติ (฿${(log.Price_Total || 0).toLocaleString()})`,
      })
    }
  }

  return {
    totalLiters: Math.round(totalLiters * 10) / 10,
    totalCost: Math.round(totalCost),
    totalLogs: logs.length,
    avgCostPerLiter: Math.round(avgCostPerLiter * 100) / 100,
    avgKmPerLiter,
    vehicleBreakdown: vehicleBreakdown.slice(0, 20), // Top 20
    monthlyTrends,
    anomalies: anomalies.slice(0, 10),
  }
}
