"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { getUserBranchId, isSuperAdmin } from "@/lib/permissions"
import { cookies } from "next/headers"
import { todayTH } from "@/lib/utils/date-th"

export type FuelLog = {
  Log_ID: string
  Date_Time: string | null
  Driver_ID: string | null
  Vehicle_Plate: string | null
  Odometer: number | null
  Liters: number
  Price_Total: number
  Station_Name: string | null
  Photo_Url: string | null
  Branch_ID: string | null
  Status: string | null
  Trip_Fill_Type?: 'end' | 'enroute' | null
  Fuel_Type?: string
  Driver_Name?: string
  Efficiency_Status?: 'Normal' | 'Warning' | 'Critical'
  Capacity_Status?: 'Normal' | 'Overflow'
  Tank_Capacity?: number
}

// ดึงบันทึกเติมน้ำมันวันนี้
export async function getTodayFuelLogs(providedBranchId?: string): Promise<FuelLog[]> {
  try {
    const supabase = createAdminClient()
    const today = todayTH()
    
    const isSuper = await isSuperAdmin()
    const userBranchId = await getUserBranchId()
    const cookieStore = await cookies()
    const selectedBranch = cookieStore.get('selectedBranch')?.value
    const branchId = isSuper ? (providedBranchId || selectedBranch || userBranchId) : userBranchId

    let query = supabase
      .from('Fuel_Logs')
      .select('*')
      .gte('Date_Time', today)
    
    if (branchId && branchId !== 'All') {
      query = query.eq('Branch_ID', branchId)
    }

    const { data, error } = await query
      .order('Date_Time', { ascending: false })
    
    if (error) {
      return []
    }
    
    return data || []
  } catch {
    return []
  }
}

// B: เดาประเภทการเติม (end/enroute) จากสถานะงานของรถคันนั้น ณ เวลาที่เติม
// ถ้ามีงานของรถคันนี้ที่ "กำลังวิ่งอยู่" ในวันเดียวกับบิล -> น่าจะเติมระหว่างทาง (enroute)
// ถ้าไม่มีงานค้างวิ่ง -> เติมจบงาน/ก่อนเริ่มงาน (end) เป็น default ปลอดภัย
// ใช้สถานะงาน (เชื่อถือได้) ไม่พึ่งพิกัด GPS ที่ยัง validate ไม่เสร็จ
const ACTIVE_JOB_STATUSES = ['Assigned', 'Confirmed', 'Picked Up', 'In Transit', 'Arrived', 'In Progress']
export async function suggestFillType(
  supabase: SupabaseClient,
  vehiclePlate: string,
  dateTimeISO: string | null
): Promise<'end' | 'enroute'> {
  try {
    if (!vehiclePlate) return 'end'
    const d = dateTimeISO ? new Date(dateTimeISO) : new Date()
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    const { data } = await supabase
      .from('Jobs_Main')
      .select('Job_ID')
      .eq('Vehicle_Plate', vehiclePlate)
      .eq('Plan_Date', dateStr)
      .in('Job_Status', ACTIVE_JOB_STATUSES)
      .limit(1)
    return (data && data.length > 0) ? 'enroute' : 'end'
  } catch {
    return 'end'
  }
}

export type EnrichedFuelLog = FuelLog & {
  Driver_Name?: string
  Price_Per_Liter?: number
  Delta_Km?: number
  Km_Per_Liter?: number
  Efficiency_Status?: string
  Capacity_Status?: string
  Tank_Capacity?: number
  Cycle_Liters?: number
  Enroute_Count?: number
}

// Helper to calculate cycle-aware distance and fuel efficiency:
// - If 'enroute' (เติมระหว่างทาง): records incremental km since previous stop,
//   but DOES NOT compute KM/L individually (waits to accumulate with the closing fill).
// - If 'end' (เติมจบงาน): looks back to find the previous anchor fill,
//   accumulating all intervening enroute liters and distances to compute true full-to-full KM/L.
async function getCycleForLog(supabase: SupabaseClient, log: FuelLog) {
  if (!log.Vehicle_Plate || !log.Date_Time || !log.Odometer) {
    return { deltaKm: 0, kmPerLiter: 0, cycleLiters: log.Liters || 0, enrouteCount: 0, efficiencyStatus: 'Normal' }
  }

  const isEnroute = log.Trip_Fill_Type === 'enroute'

  // Fetch prior logs for this vehicle before current Date_Time
  const { data: priorLogs } = await supabase
    .from('Fuel_Logs')
    .select('Log_ID, Date_Time, Odometer, Liters, Price_Total, Trip_Fill_Type')
    .eq('Vehicle_Plate', log.Vehicle_Plate)
    .lt('Date_Time', log.Date_Time)
    .order('Date_Time', { ascending: false })
    .limit(10)

  if (!priorLogs || priorLogs.length === 0) {
    return { deltaKm: 0, kmPerLiter: 0, cycleLiters: log.Liters || 0, enrouteCount: 0, efficiencyStatus: 'Normal' }
  }

  if (isEnroute) {
    // For enroute fills: show incremental km from immediately preceding log,
    // but DO NOT compute km/L yet (must accumulate with the closing fill).
    const prevOdo = priorLogs[0]?.Odometer
    const incrementalDist = (prevOdo && log.Odometer > prevOdo) ? (log.Odometer - prevOdo) : 0
    return {
      deltaKm: incrementalDist,
      kmPerLiter: 0, // Cannot calculate individually
      cycleLiters: log.Liters || 0,
      enrouteCount: 0,
      efficiencyStatus: 'Normal'
    }
  }

  // Closing fill ('end' or null): find all preceding enroute fills back to previous anchor
  let anchorOdo: number | null = null
  let accumEnrouteLiters = 0
  let enrouteCount = 0

  for (const p of priorLogs) {
    if (p.Trip_Fill_Type === 'enroute') {
      accumEnrouteLiters += (Number(p.Liters) || 0)
      enrouteCount++
    } else {
      anchorOdo = Number(p.Odometer) || null
      break
    }
  }

  // If all prior logs in the fetched window were enroute, use the earliest log's odometer as anchor
  if (anchorOdo === null && priorLogs.length > 0) {
    anchorOdo = Number(priorLogs[priorLogs.length - 1].Odometer) || null
  }

  const cycleLiters = (Number(log.Liters) || 0) + accumEnrouteLiters
  let deltaKm = 0
  let kmPerLiter = 0
  let efficiencyStatus = 'Normal'

  if (anchorOdo && log.Odometer > anchorOdo) {
    deltaKm = log.Odometer - anchorOdo
    if (deltaKm > 0 && cycleLiters > 0) {
      kmPerLiter = +(deltaKm / cycleLiters).toFixed(2)

      if (kmPerLiter < 5) efficiencyStatus = 'Critical'
      else if (kmPerLiter < 8) efficiencyStatus = 'Warning'
    }
  }

  return {
    deltaKm,
    kmPerLiter,
    cycleLiters,
    enrouteCount,
    efficiencyStatus
  }
}

// ดึงบันทึกเติมน้ำมันทั้งหมด (pagination + search + date filter + vehicle filter + branch filter)
export async function getAllFuelLogs(
  page = 1, 
  limit = 20, 
  query = '',
  startDate?: string,
  endDate?: string,
  selectedVehicles?: string[],
  providedBranchId?: string
): Promise<{ data: EnrichedFuelLog[], count: number }> {
  try {
    const supabase = createAdminClient()
    const offset = (page - 1) * limit
    
    const isSuper = await isSuperAdmin()
    const userBranchId = await getUserBranchId()
    const cookieStore = await cookies()
    const selectedBranch = cookieStore.get('selectedBranch')?.value
    const branchId = isSuper ? (providedBranchId || selectedBranch || userBranchId) : (userBranchId || providedBranchId)

    let dbQuery = supabase
      .from('Fuel_Logs')
      .select('*', { count: 'exact' })
    
    if (branchId && branchId !== 'All') {
      dbQuery = dbQuery.eq('Branch_ID', branchId)
    }

    dbQuery = dbQuery.order('Date_Time', { ascending: false })

    if (query) {
      dbQuery = dbQuery.or(`Vehicle_Plate.ilike.%${query}%,Station_Name.ilike.%${query}%`)
    }

    if (selectedVehicles && selectedVehicles.length > 0) {
      dbQuery = dbQuery.in('Vehicle_Plate', selectedVehicles)
    }

    if (startDate) {
      dbQuery = dbQuery.gte('Date_Time', `${startDate}T00:00:00`)
    }

    if (endDate) {
      dbQuery = dbQuery.lte('Date_Time', `${endDate}T23:59:59`)
    }

    const { data: logs, error, count } = await dbQuery.range(offset, offset + limit - 1)
  
    if (error) {
      console.error("[getAllFuelLogs] Supabase query error:", error)
      return { data: [], count: 0 }
    }

    // Fetch Drivers to map names + การผูกทะเบียนรถที่ตั้งไว้ฝั่งคนขับ (รถที่ได้รับมอบหมาย)
    const { data: drivers } = await supabase
      .from('Master_Drivers')
      .select('Driver_ID, Driver_Name, Vehicle_Plate')

    const driverMap = new Map(drivers?.map(d => [d.Driver_ID, d.Driver_Name]) || [])
    // ทะเบียนรถ -> ชื่อคนขับที่ผูกไว้ใน Master_Drivers.Vehicle_Plate (แหล่งผูกจริงที่ตั้งในหน้าคนขับ)
    const driverByPlate = new Map<string, string>()
    for (const d of drivers || []) {
      if (d.Vehicle_Plate && d.Driver_Name && !driverByPlate.has(d.Vehicle_Plate)) {
        driverByPlate.set(d.Vehicle_Plate, d.Driver_Name)
      }
    }

    // Fetch Vehicles to get Tank Capacity
    const { data: vehicles } = await supabase
        .from('Master_Vehicles')
        .select('Vehicle_Plate, Tank_Capacity, Driver_ID')

    const vehicleMap = new Map(vehicles?.map(v => [v.Vehicle_Plate, v.Tank_Capacity]) || [])
    // ผูกทะเบียนรถ -> คนขับหลักที่ตั้งค่าไว้ใน Master_Vehicles (ใช้เป็น fallback เมื่อบิลไม่ได้ระบุคนขับ)
    const plateDriverMap = new Map(vehicles?.filter(v => v.Driver_ID).map(v => [v.Vehicle_Plate, v.Driver_ID]) || [])

    // fallback ชั้นสุดท้าย: คนขับจากงานล่าสุดของรถคันนั้นใน Jobs_Main (เหมือนตารางวิเคราะห์ต่อจ็อบ)
    // ใช้เมื่อบิลไม่ระบุคนขับ และรถไม่ได้ตั้งคนขับประจำใน Master_Vehicles
    const logPlates = Array.from(new Set((logs || []).map(l => l.Vehicle_Plate).filter(Boolean)))
    const plateJobDriverMap = new Map<string, string>()
    if (logPlates.length > 0) {
      const { data: jobRows } = await supabase
        .from('Jobs_Main')
        .select('Vehicle_Plate, Driver_ID, Driver_Name, Plan_Date')
        .in('Vehicle_Plate', logPlates as string[])
        .order('Plan_Date', { ascending: false })
      for (const j of jobRows || []) {
        if (!j.Vehicle_Plate || plateJobDriverMap.has(j.Vehicle_Plate)) continue
        const name = j.Driver_Name || (j.Driver_ID ? driverMap.get(j.Driver_ID) : null)
        if (name) plateJobDriverMap.set(j.Vehicle_Plate, name)
      }
    }

    // Enrich logs with Driver Name, Efficiency, Price_Per_Liter, Delta_Km, and alerts
    const enrichedLogs = await Promise.all(logs?.map(async (log) => {
      // Check Tank Capacity Overflow
      const tankCapacity = vehicleMap.get(log.Vehicle_Plate) || 50 // Default 50L if missing
      const capacityStatus = (log.Liters > tankCapacity * 1.1) ? 'Overflow' : 'Normal'

      // Cycle-aware distance and efficiency calculation
      const cycle = await getCycleForLog(supabase, log)

      const pricePerLiter = (log.Price_Total && log.Liters && log.Liters > 0)
        ? +(log.Price_Total / log.Liters).toFixed(2)
        : 0

      return {
        ...log,
        Driver_Name: driverMap.get(log.Driver_ID)
          || driverByPlate.get(log.Vehicle_Plate)
          || driverMap.get(plateDriverMap.get(log.Vehicle_Plate))
          || plateJobDriverMap.get(log.Vehicle_Plate)
          || 'ไม่ระบุคนขับ',
        Price_Per_Liter: pricePerLiter,
        Delta_Km: cycle.deltaKm,
        Km_Per_Liter: cycle.kmPerLiter,
        Cycle_Liters: cycle.cycleLiters,
        Enroute_Count: cycle.enrouteCount,
        Efficiency_Status: cycle.efficiencyStatus,
        Capacity_Status: capacityStatus,
        Tank_Capacity: tankCapacity
      }
    }) || [])
  
    return { data: enrichedLogs, count: count || 0 }
  } catch (e) {
    console.error("[getAllFuelLogs] Exception:", e)
    return { data: [], count: 0 }
  }
}

// ดึงบิลน้ำมันจริงของรถคันหนึ่ง สำหรับจับคู่กับเหตุการณ์เติมจาก GPS (DTC)
export type FuelBillForMatch = {
  Log_ID: string
  Date_Time: string | null
  Odometer: number | null
  Liters: number
  Price_Total: number
  Station_Name: string | null
  Trip_Fill_Type?: 'end' | 'enroute' | null
}
export async function getFuelBillsForMatching(vehiclePlate: string, providedBranchId?: string): Promise<FuelBillForMatch[]> {
  try {
    if (!vehiclePlate) return []
    const supabase = createAdminClient()
    const isSuper = await isSuperAdmin()
    const userBranchId = await getUserBranchId()
    const cookieStore = await cookies()
    const selectedBranch = cookieStore.get('selectedBranch')?.value
    const branchId = isSuper ? (providedBranchId || selectedBranch || userBranchId) : userBranchId

    let query = supabase
      .from('Fuel_Logs')
      .select('Log_ID, Date_Time, Odometer, Liters, Price_Total, Station_Name, Trip_Fill_Type')
      .eq('Vehicle_Plate', vehiclePlate)
      .order('Date_Time', { ascending: true })

    if (branchId && branchId !== 'All') {
      query = query.eq('Branch_ID', branchId)
    }

    const { data, error } = await query
    if (error) return []
    return (data || []) as FuelBillForMatch[]
  } catch {
    return []
  }
}

// นับสถิติน้ำมันวันนี้
export async function getTodayFuelStats(providedBranchId?: string) {
  try {
    const supabase = createAdminClient()
    const today = todayTH()
    
    const isSuper = await isSuperAdmin()
    const userBranchId = await getUserBranchId()
    const cookieStore = await cookies()
    const selectedBranch = cookieStore.get('selectedBranch')?.value
    const branchId = isSuper ? (providedBranchId || selectedBranch || userBranchId) : userBranchId

    let query = supabase
      .from('Fuel_Logs')
      .select('Liters, Price_Total')
      .gte('Date_Time', today)
    
    if (branchId && branchId !== 'All') {
      query = query.eq('Branch_ID', branchId)
    }

    const { data, error } = await query
    
    if (error) {
      return { totalLiters: 0, totalAmount: 0, count: 0 }
    }
    
    const logs = data || []
    return {
      totalLiters: logs.reduce((sum, l) => sum + (l.Liters || 0), 0),
      totalAmount: logs.reduce((sum, l) => sum + (l.Price_Total || 0), 0),
      count: logs.length,
    }
  } catch {
    return { totalLiters: 0, totalAmount: 0, count: 0 }
  }
}
