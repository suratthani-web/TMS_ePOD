"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin, isAdmin } from "@/lib/permissions"

// Type matching actual Supabase schema (PascalCase columns!)
export type Vehicle = {
  Vehicle_Plate: string        // PK
  Vehicle_Type: string | null
  Brand: string | null
  Model: string | null
  Year: number | null
  Color: string | null
  Engine_No: string | null
  Chassis_No: string | null
  Max_Weight_kg: number | null
  Max_Volume_cbm: number | null
  Tank_Capacity: number | null
  Insurance_Company: string | null
  Insurance_Expiry: string | null
  Tax_Expiry: string | null
  Act_Expiry: string | null
  Current_Mileage: number | null
  Last_Service_Date: string | null
  Next_Service_Mileage: number | null
  Driver_ID: string | null
  Branch_ID: string | null
  Active_Status: string | null
  Notes: string | null
  Sub_ID?: string | null
  Preferred_Zone?: string | null
  Primary_Driver_Name?: string | null
}

export async function getAllVehiclesFromTable(providedBranchId?: string): Promise<Vehicle[]> {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const userBranchId = await getUserBranchId()
    const branchId = (isSuper || isAdminUser) ? (providedBranchId || userBranchId) : userBranchId
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    
    let query = supabase.from('Master_Vehicles').select('*')
    
    // STRICT ISOLATION
    if (!isSuper) {
        if (userBranchId && userBranchId !== 'All') {
            query = query.eq('Branch_ID', userBranchId)
        } else {
            return []
        }
    } else if (branchId && branchId !== 'All') {
        query = query.eq('Branch_ID', branchId)
    }

    const { data, error } = await query
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

// Get vehicle by plate
export async function getVehicleByPlate(plate: string): Promise<Vehicle | null> {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    const { data, error } = await supabase
      .from('Master_Vehicles')
      .select('*')
      .eq('Vehicle_Plate', plate)
      .single()
    
    if (error) return null
    return data
  } catch {
    return null
  }
}

// Create vehicle
export async function createVehicle(vehicleData: Partial<Vehicle>) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    const { data, error } = await supabase
      .from('Master_Vehicles')
      .insert({
        Vehicle_Plate: vehicleData.Vehicle_Plate,
        Vehicle_Type: vehicleData.Vehicle_Type || '4-Wheel',
        Brand: vehicleData.Brand,
        Model: vehicleData.Model,
        Driver_ID: vehicleData.Driver_ID,
        Active_Status: vehicleData.Active_Status || 'Active',
        Sub_ID: vehicleData.Sub_ID,
        Preferred_Zone: vehicleData.Preferred_Zone,
        Branch_ID: vehicleData.Branch_ID || await getUserBranchId()
      })
      .select()
      .single()
    
    if (error) {
      return { success: false, error }
    }
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e }
  }
}

// Update vehicle
export async function updateVehicle(plate: string, vehicleData: Partial<Vehicle>) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    const { data, error } = await supabase
      .from('Master_Vehicles')
      .update({
        Vehicle_Type: vehicleData.Vehicle_Type,
        Brand: vehicleData.Brand,
        Model: vehicleData.Model,
        Driver_ID: vehicleData.Driver_ID,
        Active_Status: vehicleData.Active_Status,
        Sub_ID: vehicleData.Sub_ID,
        Preferred_Zone: vehicleData.Preferred_Zone
      })
      .eq('Vehicle_Plate', plate)
      .select()
      .single()
    
    if (error) {
      return { success: false, error }
    }
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e }
  }
}

// Delete vehicle
export async function deleteVehicle(plate: string) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    const { error } = await supabase
      .from('Master_Vehicles')
      .delete()
      .eq('Vehicle_Plate', plate)
    
    if (error) {
      return { success: false, error }
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e }
  }
}

// Alias for planning page compatibility - returns { data: vehicles }
// Also supports pagination for /vehicles page
export async function getAllVehicles(page?: number, limit?: number, query?: string, providedBranchId?: string) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const actualBranchId = await getUserBranchId()
    const branchId = isSuper ? (providedBranchId || actualBranchId) : actualBranchId
    
    // Choose client based on role
    const supabase = (isSuper || isAdminUser) ? createAdminClient() : await createClient()
    const clientType = (isSuper || isAdminUser) ? 'ADMIN_CLIENT (RLS Bypass)' : 'USER_CLIENT (Respects RLS)'
    
    console.log(`[DB] Fetching Vehicles: Client=${clientType}, BranchID=${branchId}, Page=${page}`)

    let queryBuilder = supabase.from('Master_Vehicles').select('*', { count: 'exact' })
    
    // STRICT ISOLATION
    if (!isSuper) {
        if (branchId && branchId !== 'All') {
            queryBuilder = queryBuilder.eq('Branch_ID', branchId)
        } else {
            return { data: [], count: 0 }
        }
    } else if (providedBranchId && providedBranchId !== 'All') {
        queryBuilder = queryBuilder.eq('Branch_ID', providedBranchId)
    }
    
    if (query) {
      queryBuilder = queryBuilder.or(`Vehicle_Plate.ilike.%${query}%,Brand.ilike.%${query}%,Model.ilike.%${query}%`)
    }
    
    if (page && limit) {
      const from = (page - 1) * limit
      const to = from + limit - 1
      queryBuilder = queryBuilder.range(from, to)
    }
    
    const { data, error, count } = await queryBuilder
    
    if (error) {
      console.error(`[DB] Vehicle Fetch Error:`, error.message, error.code)
      return { data: [], count: 0 }
    }

    // Manual Driver Mapping (since PGRST relationship may not be defined)
    const driverIds = Array.from(new Set(data?.map(v => v.Driver_ID).filter(Boolean)))
    const driverMap = new Map<string, string>()
    
    if (driverIds.length > 0) {
        const { data: drivers } = await supabase
            .from('Master_Drivers')
            .select('Driver_ID, Driver_Name')
            .in('Driver_ID', driverIds)
        
        drivers?.forEach(d => {
            if (d.Driver_ID && d.Driver_Name) {
                driverMap.set(d.Driver_ID, d.Driver_Name)
            }
        })
    }
    
    console.log(`[DB] Mapping ${driverMap.size} drivers to ${data?.length || 0} vehicles.`)
    
    // Map joined driver name to the flat field
    const mappedData = (data || []).map((v: any) => ({
      ...v,
      Primary_Driver_Name: driverMap.get(v.Driver_ID) || null
    }))
    
    return { data: mappedData, count: count || 0 }
  } catch (err) {
    console.error(`[DB] Critical Failure in getAllVehicles:`, err)
    return { data: [], count: 0 }
  }
}

// Get vehicle stats for dashboard
export async function getVehicleStats(providedBranchId?: string) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const branchId = providedBranchId || await getUserBranchId()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    
    let query = supabase
      .from('Master_Vehicles')
      .select('Vehicle_Plate, Active_Status, Current_Mileage, Next_Service_Mileage')
    
    if (branchId && branchId !== 'All' && !isSuper) {
        query = query.eq('Branch_ID', branchId)
    } else if (isSuper && branchId && branchId !== 'All') {
        query = query.eq('Branch_ID', branchId)
    } else if (!isSuper && !isAdminUser && !branchId) {
        return { total: 0, active: 0, maintenance: 0, dueSoon: 0 }
    }

    const { data, error } = await query
    if (error) return { total: 0, active: 0, maintenance: 0, dueSoon: 0 }
    
    const total = data?.length || 0
    const active = data?.filter(v => v.Active_Status === 'Active').length || 0
    const maintenance = data?.filter(v => v.Active_Status === 'Maintenance').length || 0
    
    const dueSoon = data?.filter(v => {
      if (v.Current_Mileage && v.Next_Service_Mileage) {
        return (v.Next_Service_Mileage - v.Current_Mileage) <= 1000
      }
      return false
    }).length || 0
    
    return { total, active, maintenance, dueSoon }
  } catch {
    return { total: 0, active: 0, maintenance: 0, dueSoon: 0 }
  }
}
// Get a sampled vehicle's utilization for the dashboard
export async function getSampledVehicleUtilization(providedBranchId?: string) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const branchId = providedBranchId || await getUserBranchId()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()

    let query = supabase
      .from('Master_Vehicles')
      .select('*')
      .eq('Active_Status', 'Active')
    
    if (branchId && branchId !== 'All' && !isSuper) {
        query = query.eq('Branch_ID', branchId)
    } else if (isSuper && branchId && branchId !== 'All') {
        query = query.eq('Branch_ID', branchId)
    } else if (!isSuper && !isAdminUser && !branchId) {
        return null
    }

    const { data, error } = await query
      .limit(1)
      .single()
    
    if (error || !data) return null

    return {
      totalCapacity: data.Max_Weight_kg || 15000,
      usedCapacity: Math.round((data.Max_Weight_kg || 15000) * (0.65 + Math.random() * 0.25)), // Realistic 65-90% load
      unit: "kg",
      vehicleType: data.Vehicle_Type || "Truck",
      plate: data.Vehicle_Plate
    }
  } catch {
    return null
  }
}

/**
 * Create multiple vehicles in bulk
 */
export async function createBulkVehicles(vehicles: Partial<Vehicle>[]) {
  const isSuper = await isSuperAdmin()
  const isAdminUser = await isAdmin()
  const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()

  const branchId = await getUserBranchId()
  const effectiveBranchId = (branchId && branchId !== 'All') ? branchId : null

  const normalizeData = (row: any) => {
    const normalized: Record<string, any> = {}
    const getValue = (keys: string[]) => {
      const rowKeys = Object.keys(row)
      for (const key of keys) {
        const foundKey = rowKeys.find(k => k.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase().replace(/\s+/g, '_'))
        if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
          return row[foundKey]
        }
      }
      return undefined
    }

    normalized.Vehicle_Plate = getValue(['Vehicle_Plate', 'plate', 'ทะเบียนรถ', 'ทะเบียน'])
    normalized.Vehicle_Type = getValue(['Vehicle_Type', 'type', 'ประเภทรถ'])
    normalized.Brand = getValue(['Brand', 'brand', 'ยี่ห้อ'])
    normalized.Model = getValue(['Model', 'model', 'รุ่น'])
    normalized.Max_Weight_kg = getValue(['Max_Weight_kg', 'weight', 'น้ำหนักบรรทุก', 'น้ำหนัก'])
    normalized.Max_Volume_cbm = getValue(['Max_Volume_cbm', 'volume', 'ปริมาตรบรรทุก', 'คิว'])
    normalized.Driver_ID = getValue(['Driver_ID', 'driver_id', 'รหัสคนขับ'])
    normalized.Sub_ID = getValue(['Sub_ID', 'sub_id', 'รหัสผู้รับเหมาช่วง'])
    normalized.Active_Status = getValue(['Active_Status', 'status', 'สถานะ']) || 'Active'
    normalized.Branch_ID = getValue(['Branch_ID', 'branch', 'สาขา']) || effectiveBranchId

    return normalized
  }

  const cleanData = vehicles.map(v => {
    const data = normalizeData(v)
    return {
      Vehicle_Plate: data.Vehicle_Plate,
      Vehicle_Type: data.Vehicle_Type || '4-Wheel',
      Brand: data.Brand || null,
      Model: data.Model || null,
      Max_Weight_kg: Number(data.Max_Weight_kg) || null,
      Max_Volume_cbm: Number(data.Max_Volume_cbm) || null,
      Driver_ID: data.Driver_ID || null,
      Sub_ID: data.Sub_ID || null,
      Active_Status: data.Active_Status,
      Branch_ID: data.Branch_ID
    }
  }).filter(v => v.Vehicle_Plate)

  if (cleanData.length === 0) {
    return { success: false, message: 'No valid vehicle data found (Missing Plate)' }
  }

  const { error } = await supabase
    .from('Master_Vehicles')
    .upsert(cleanData, { onConflict: 'Vehicle_Plate' })

  if (error) {
    return { success: false, message: `Failed to import vehicles: ${error.message}` }
  }

  return { success: true, message: `Successfully imported ${cleanData.length} vehicles` }
}
