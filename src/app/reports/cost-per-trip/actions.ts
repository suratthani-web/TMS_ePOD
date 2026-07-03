"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, getCustomerId, isAdmin } from "@/lib/permissions"

export interface TripCost {
  Job_ID: string
  Plan_Date: string | null
  Customer_Name: string | null
  Route_Name: string | null
  Origin_Location: string | null
  Dest_Location: string | null
  Driver_Name: string | null
  Vehicle_Plate: string | null
  Job_Status: string
  Cost_Customer_Total: number
  Cost_Driver_Total: number
  fuel_real: number
  maint_real: number
  fuel_est: number
  maint_est: number
  toll_cost: number
  extra_cost: number
  total_cost: number
  profit: number
  profit_pct: number
  distance_km: number
  loaded_qty: number | null
  fuel_price: number | null
}

export interface CostSummary {
  totalTrips: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
  totalDistance: number
  avgProfitPerTrip: number
  avgProfitPct: number
  avgCostPerKm: number
}

type CostTripSourceRow = {
  Plan_Date?: string | null
  Est_Distance_KM?: number | string | null
  Price_Cust_Total?: number | string | null
  Cost_Driver_Total?: number | string | null
  Cost_Driver_Extra?: number | string | null
  Price_Cust_Extra?: number | string | null
  Fuel_Cost?: number | string | null
  Maintenance_Cost?: number | string | null
  Toll_Cost?: number | string | null
  Job_ID?: string | null
  Customer_Name?: string | null
  Route_Name?: string | null
  Origin_Location?: string | null
  Dest_Location?: string | null
  Driver_Name?: string | null
  Vehicle_Plate?: string | null
  Job_Status?: string | null
  Loaded_Qty?: number | string | null
}

type FuelPriceRow = {
  Date: string
  Price: number
}

export async function getCostPerTrip(startDate?: string, endDate?: string, customerNames?: string[]): Promise<{ trips: TripCost[], summary: CostSummary }> {
  const isUserAdmin = await isAdmin()
  const branchId = await getUserBranchId()
  const customerId = await getCustomerId()

  // Use Admin Client to bypass RLS if user is an Admin, otherwise they get 0 rows!
  const supabase = isUserAdmin ? createAdminClient() : await createClient()

  // Default: last 30 days
  const now = new Date()
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const start = startDate || (endDate ? endDate : defaultStart.toISOString().split('T')[0])
  const end = endDate || (startDate ? startDate : now.toISOString().split('T')[0])

  let query = supabase
    .from('Jobs_Main')
    .select('Job_ID, Plan_Date, Customer_Name, Route_Name, Origin_Location, Dest_Location, Driver_Name, Vehicle_Plate, Job_Status, Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, Est_Distance_KM, Loaded_Qty')
    // Include Billed/Paid so completed work that has moved into invoicing still
    // counts toward profitability — those are the jobs with confirmed revenue.
    .in('Job_Status', ['Completed', 'Delivered', 'Finished', 'Closed', 'Billed', 'Paid'])
    .gte('Plan_Date', start)
    .lte('Plan_Date', end)
    .order('Plan_Date', { ascending: false })
    .limit(1500)

  if (customerId) {
    query = query.eq('Customer_ID', customerId)
  } else {
    if (branchId && branchId !== 'All') {
      query = query.eq('Branch_ID', branchId)
    }
    if (customerNames && customerNames.length > 0) {
      query = query.in('Customer_Name', customerNames)
    }
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`DB Error in getCostPerTrip: ${error.message} (Code: ${error.code})`)
  }
  if (!data) return { trips: [], summary: emptySummary() }

  // Fetch all unique fuel prices for the relevant dates in one go
  const rows = data as CostTripSourceRow[]
  const uniqueDates = Array.from(new Set(rows.map((d) => d.Plan_Date).filter(Boolean))) as string[]
  const { data: fuelData } = await supabase
    .from('daily_fuel_prices')
    .select('Date, Price')
    .in('Date', uniqueDates)
  
  const fuelMap = new Map((fuelData as FuelPriceRow[] | null)?.map((f) => [f.Date, f.Price]) || [])
  
  // Get latest price as global fallback
  const { data: latestFuel } = await supabase
    .from('daily_fuel_prices')
    .select('Price')
    .order('Date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const globalFallbackPrice = latestFuel?.Price || 35.0 // Baht/Litre

  const trips: TripCost[] = rows.map((d) => {
    const dist = Number(d.Est_Distance_KM) || 0
    const planDate = d.Plan_Date || null
    const loadedQty = Number(d.Loaded_Qty) || 0
    
    // Estimates (For reference only)
    const dailyPrice = planDate ? fuelMap.get(planDate) || 0 : 0
    // If we have daily price, we can use it. But for now, 3.5 seems to be a fixed 'rate per KM' in the existing logic.
    // If the user wants the calculation to be dynamic based on fuel price, we'd need a consumption rate.
    // However, the user specifically asked for the "Fuel Price column" to be added/fixed.
    const fuelEst = dist > 0 ? dist * 3.5 : 0
    const maintEst = dist * 1.25

    // Real data
    const fuelReal = 0 // Will read from DB if added later
    const maintReal = 0 // Will read from DB if added later
    const tollCost = 0 // Will read from DB if added later
    
    const driverCost = Number(d.Cost_Driver_Total) || 0
    const extraCost = Number(d.Cost_Driver_Extra) || 0
    
    const revenue = (Number(d.Price_Cust_Total) || 0) + (Number(d.Price_Cust_Extra) || 0)
    
    // Total cost now EXCLUDES estimates, only uses real data
    const totalCost = driverCost + fuelReal + maintReal + tollCost + extraCost
    const profit = revenue - totalCost
    const profitPct = revenue > 0 ? (profit / revenue) * 100 : 0

    return {
      Job_ID: d.Job_ID || "",
      Plan_Date: planDate,
      Customer_Name: d.Customer_Name ?? null,
      Route_Name: d.Route_Name ?? null,
      Origin_Location: d.Origin_Location ?? null,
      Dest_Location: d.Dest_Location ?? null,
      Driver_Name: d.Driver_Name ?? null,
      Vehicle_Plate: d.Vehicle_Plate ?? null,
      Job_Status: d.Job_Status || "",
      Cost_Customer_Total: revenue,
      Cost_Driver_Total: driverCost,
      fuel_real: fuelReal,
      maint_real: maintReal,
      fuel_est: fuelEst,
      maint_est: maintEst,
      toll_cost: tollCost,
      extra_cost: extraCost,
      total_cost: totalCost,
      profit,
      profit_pct: Math.round(profitPct * 10) / 10,
      distance_km: dist,
      loaded_qty: loadedQty,
      fuel_price: (planDate ? fuelMap.get(planDate) : 0) || (loadedQty > 0 ? (revenue / loadedQty) : globalFallbackPrice)
    }
  })

  const totalTrips = trips.length
  const totalRevenue = trips.reduce((s, t) => s + t.Cost_Customer_Total, 0)
  const totalCostSum = trips.reduce((s, t) => s + t.total_cost, 0)
  const totalProfit = totalRevenue - totalCostSum
  const totalDistance = trips.reduce((s, t) => s + t.distance_km, 0)

  const summary: CostSummary = {
    totalTrips,
    totalRevenue,
    totalCost: totalCostSum,
    totalProfit,
    totalDistance,
    avgProfitPerTrip: totalTrips > 0 ? totalProfit / totalTrips : 0,
    avgProfitPct: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    avgCostPerKm: totalDistance > 0 ? totalCostSum / totalDistance : 0
  }

  return { trips, summary }
}

function emptySummary(): CostSummary {
  return { totalTrips: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, totalDistance: 0, avgProfitPerTrip: 0, avgProfitPct: 0, avgCostPerKm: 0 }
}
