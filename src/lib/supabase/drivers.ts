"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin, isAdmin } from "@/lib/permissions"

// Type matching actual Supabase schema
export type Driver = {
  Driver_ID: string
  Driver_Name: string | null
  Role: string | null
  Mobile_No: string | null
  Line_User_ID: string | null
  Password: string | null
  Vehicle_Plate: string | null
  Vehicle_Type: string | null
  Max_Weight_kg: number | null
  Max_Volume_cbm: number | null
  Insurance_Expiry: string | null
  Tax_Expiry: string | null
  Act_Expiry: string | null
  Current_Mileage: number | null
  Active_Status: string | null
  Expire_Date: string | null
  Bank_Name?: string | null
  Bank_Account_No?: string | null
  Bank_Account_Name?: string | null
  Sub_ID?: string | null
  Show_Price_Default?: boolean | null
  Branch_ID?: string | null
}

// Get all drivers from Master_Drivers table
export async function getAllDriversFromTable(providedBranchId?: string): Promise<Driver[]> {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const userBranchId = await getUserBranchId()
    const branchId = (isSuper || isAdminUser) ? (providedBranchId || userBranchId) : userBranchId
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    
    let dbQuery = supabase.from('Master_Drivers').select('*')
    // Branch Filtering
    if (!isSuper) {
        // STRICT ISOLATION: Non-SuperAdmins MUST be filtered by their branch
        if (userBranchId && userBranchId !== 'All') {
            dbQuery = dbQuery.eq('Branch_ID', userBranchId)
        } else {
            return []
        }
    } else if (branchId && branchId !== 'All') {
        // SuperAdmin can filter by specific branch
        dbQuery = dbQuery.eq('Branch_ID', branchId)
    }

    const { data, error } = await dbQuery
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

// Get driver by ID
export async function getDriverById(id: string): Promise<Driver | null> {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    
    // Use admin client if it's an admin/super or if we're fetching a specific ID 
    // (drivers authenticated via cookies need admin client to see their own record if RLS is on)
    const supabase = (isSuper || isAdminUser || id) ? createAdminClient() : await createClient()
    
    const { data, error } = await supabase
      .from('Master_Drivers')
      .select('*')
      .eq('Driver_ID', id)
      .single()
    
    if (error) return null
    return data
  } catch {
    return null
  }
}

// Create driver
export async function createDriver(driverData: Partial<Driver>) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    const { data, error } = await supabase
      .from('Master_Drivers')
      .insert({
        Driver_ID: driverData.Driver_ID || `DRV-${Date.now()}`,
        Driver_Name: driverData.Driver_Name,
        Mobile_No: driverData.Mobile_No,
        Role: driverData.Role || 'Driver',
        Vehicle_Plate: driverData.Vehicle_Plate,
        Vehicle_Type: driverData.Vehicle_Type,
        Password: driverData.Password,
        Active_Status: driverData.Active_Status || 'Active',
        Expire_Date: driverData.Expire_Date,
        Bank_Name: driverData.Bank_Name,
        Bank_Account_No: driverData.Bank_Account_No,
        Bank_Account_Name: driverData.Bank_Account_Name,
        Branch_ID: driverData.Branch_ID || await getUserBranchId()
      })
      .select()
      .single()
    
    if (error) return { success: false, error }
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e }
  }
}

// Update driver
export async function updateDriver(id: string, driverData: Partial<Driver>) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    const { data, error } = await supabase
      .from('Master_Drivers')
      .update({
        Driver_Name: driverData.Driver_Name,
        Mobile_No: driverData.Mobile_No,
        Role: driverData.Role,
        Vehicle_Plate: driverData.Vehicle_Plate,
        Vehicle_Type: driverData.Vehicle_Type,
        Password: driverData.Password,
        Active_Status: driverData.Active_Status,
        Expire_Date: driverData.Expire_Date,
        Bank_Name: driverData.Bank_Name,
        Bank_Account_No: driverData.Bank_Account_No,
        Bank_Account_Name: driverData.Bank_Account_Name
      })
      .eq('Driver_ID', id)
      .select()
      .single()
    
    if (error) return { success: false, error }
    return { success: true, data }
  } catch (e) {
    return { success: false, error: e }
  }
}

// Delete driver
export async function deleteDriver(id: string) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    const { error } = await supabase
      .from('Master_Drivers')
      .delete()
      .eq('Driver_ID', id)
    
    if (error) return { success: false, error }
    return { success: true }
  } catch (e) {
    return { success: false, error: e }
  }
}

// ดึงรายชื่อคนขับที่ Active
export async function getActiveDrivers() {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const branchId = await getUserBranchId()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()

    let queryBuilder = supabase
      .from('Master_Drivers')
      .select('*')
      .eq('Active_Status', 'Active')
    
    if (branchId && branchId !== 'All' && !isSuper) {
        queryBuilder = queryBuilder.eq('Branch_ID', branchId)
    } else if (isSuper && branchId && branchId !== 'All') {
        queryBuilder = queryBuilder.eq('Branch_ID', branchId)
    } else if (!isSuper && !isAdminUser && !branchId) {
        return []
    }

    const { data, error } = await queryBuilder.limit(10)
    
    if (error) return []
    return data || []
  } catch {
    return []
  }
}

// Alias for planning page compatibility
export async function getAllDrivers(page?: number, limit?: number, query?: string, providedBranchId?: string) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const actualBranchId = await getUserBranchId()
    const branchId = isSuper ? (providedBranchId || actualBranchId) : actualBranchId
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    
    let queryBuilder = supabase.from('Master_Drivers').select('*', { count: 'exact' })
    
    if (branchId && branchId !== 'All' && !isSuper) {
        queryBuilder = queryBuilder.eq('Branch_ID', branchId)
    } else if (isSuper && branchId && branchId !== 'All') {
        queryBuilder = queryBuilder.eq('Branch_ID', branchId)
    } else if (!isSuper && !isAdminUser && !branchId) {
        return { data: [], count: 0 }
    }
    
    if (query) {
      queryBuilder = queryBuilder.or(`Driver_Name.ilike.%${query}%,Mobile_No.ilike.%${query}%,Driver_ID.ilike.%${query}%`)
    }
    
    if (page && limit) {
      const from = (page - 1) * limit
      const to = from + limit - 1
      queryBuilder = queryBuilder.range(from, to)
    }
    
    const { data, error, count } = await queryBuilder
    if (error) return { data: [], count: 0 }
    return { data: data || [], count: count || 0 }
  } catch {
    return { data: [], count: 0 }
  }
}

// Get driver stats for dashboard
export async function getDriverStats(providedBranchId?: string) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const branchId = providedBranchId || await getUserBranchId()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    
    let query = supabase.from('Master_Drivers').select('*')
    
    if (branchId && branchId !== 'All' && !isSuper) {
        query = query.eq('Branch_ID', branchId)
    } else if (isSuper && branchId && branchId !== 'All') {
        query = query.eq('Branch_ID', branchId)
    } else if (!isSuper && !isAdminUser && !branchId) {
        return { total: 0, active: 0, onJob: 0 }
    }

    const { data, error } = await query
    if (error) return { total: 0, active: 0, onJob: 0 }
    
    // Get drivers currently on job (assigned to jobs with Plan_Date = today)
    const today = new Date().toISOString().split('T')[0]
    let onJobQuery = supabase
      .from('Jobs_Main')
      .select('Driver_ID')
      .eq('Plan_Date', today)
      .not('Driver_ID', 'is', null)
      .in('Job_Status', ['Pending', 'Confirmed', 'In Progress'])

    if (branchId && branchId !== 'All' && !isSuper) {
        onJobQuery = onJobQuery.eq('Branch_ID', branchId)
    } else if (isSuper && branchId && branchId !== 'All') {
        onJobQuery = onJobQuery.eq('Branch_ID', branchId)
    }

    const { data: activeJobs } = await onJobQuery
    const uniqueDriversOnJob = new Set(activeJobs?.map(j => j.Driver_ID)).size

    const total = data?.length || 0
    const active = data?.filter(d => d.Active_Status === 'Active').length || 0
    
    return { 
      total, 
      active, 
      onJob: uniqueDriversOnJob 
    }
  } catch {
    return { total: 0, active: 0, onJob: 0 }
  }
}

// คำนวณคะแนนคนขับ
export async function getDriverScore(driverId: string) {
  try {
    const supabase = await createClient()
    const { data: jobs, error } = await supabase
      .from('Jobs_Main')
      .select('Job_Status, Plan_Date')
      .eq('Driver_ID', driverId)
      .gte('Plan_Date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    if (error || !jobs) return { totalScore: 0, onTimeScore: 0, safetyScore: 0, acceptanceScore: 0 }

    const totalJobs = jobs.length
    if (totalJobs === 0) return { totalScore: 100, onTimeScore: 100, safetyScore: 100, acceptanceScore: 100 }

    const cancelled = jobs.filter(j => j.Job_Status === 'Cancelled').length
    const acceptanceRate = ((totalJobs - cancelled) / totalJobs) * 100
    const finishedJobs = jobs.filter(j => ['Completed', 'Delivered', 'Failed'].includes(j.Job_Status || ''))
    const successJobs = jobs.filter(j => ['Completed', 'Delivered'].includes(j.Job_Status || ''))
    const onTimeRate = finishedJobs.length > 0 ? (successJobs.length / finishedJobs.length) * 100 : 100
    const totalScore = (onTimeRate * 0.4) + (100 * 0.3) + (acceptanceRate * 0.3)

    return {
        totalScore: Math.round(totalScore),
        onTimeScore: Math.round(onTimeRate),
        safetyScore: 100,
        acceptanceScore: Math.round(acceptanceRate)
    }
  } catch {
    return { totalScore: 0, onTimeScore: 0, safetyScore: 0, acceptanceScore: 0 }
  }
}

// Get driver compliance stats
export async function getDriverComplianceStats(branchId?: string) {
    try {
        const supabase = await createClient()
        let query = supabase.from('Master_Drivers').select('Expire_Date')

        const userBranchId = await getUserBranchId()
        const isSuper = await isSuperAdmin()
        const isAdminUser = await isAdmin()
        const targetBranchId = isSuper ? (branchId && branchId !== 'All' ? branchId : null) : userBranchId

        if (targetBranchId) {
            query = query.eq('Branch_ID', targetBranchId)
        } else if (!isSuper && !isAdminUser && !userBranchId) {
            return { valid: 0, expiring: 0, expired: 0, missing: 0 }
        }

        const { data, error } = await query
        if (error) throw error

        const now = new Date()
        const thirtyDays = new Date()
        thirtyDays.setDate(now.getDate() + 30)

        const stats = { valid: 0, expiring: 0, expired: 0, missing: 0 }
        data?.forEach(d => {
            if (!d.Expire_Date) stats.missing++
            else {
                const expiry = new Date(d.Expire_Date)
                if (expiry < now) stats.expired++
                else if (expiry < thirtyDays) stats.expiring++
                else stats.valid++
            }
        })
        return stats
    } catch {
        return { valid: 0, expiring: 0, expired: 0, missing: 0 }
    }
}

// Get driver efficiency summary
export async function getDriverEfficiencySummary(branchId?: string) {
    try {
        const { data: drivers } = await getAllDrivers(1, 1000, '')
        const targetDrivers = branchId ? drivers.filter((d: Driver) => d.Branch_ID === branchId) : drivers
        
        if (!targetDrivers || targetDrivers.length === 0) return { avgSuccess: 0, avgOnTime: 0, totalDrivers: 0 }
        const scores = await Promise.all(targetDrivers.map((d: Driver) => getDriverScore(d.Driver_ID)))
        const total = targetDrivers.length
        
        return {
            avgSuccess: Math.round(scores.reduce((sum, s) => sum + s.acceptanceScore, 0) / total),
            avgOnTime: Math.round(scores.reduce((sum, s) => sum + s.onTimeScore, 0) / total),
            totalDrivers: total
        }
    } catch {
        return { avgSuccess: 0, avgOnTime: 0, totalDrivers: 0 }
    }
}

/**
 * Create multiple drivers in bulk
 */
export async function createBulkDrivers(drivers: Partial<Driver>[]) {
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

    normalized.Driver_ID = getValue(['Driver_ID', 'id', 'รหัสคนขับ', 'รหัสพนักงาน'])
    normalized.Driver_Name = getValue(['Driver_Name', 'name', 'ชื่อคนขับ', 'ชื่อ-นามสกุล'])
    normalized.Mobile_No = getValue(['Mobile_No', 'phone', 'mobile', 'เบอร์โทรศัพท์', 'เบอร์โทร'])
    normalized.Password = getValue(['Password', 'pass', 'รหัสผ่าน'])
    normalized.Vehicle_Plate = getValue(['Vehicle_Plate', 'plate', 'ทะเบียนรถ', 'ทะเบียน'])
    normalized.Vehicle_Type = getValue(['Vehicle_Type', 'type', 'ประเภทรถ'])
    normalized.Active_Status = getValue(['Active_Status', 'status', 'สถานะ']) || 'Active'
    normalized.Branch_ID = getValue(['Branch_ID', 'branch', 'สาขา']) || effectiveBranchId
    normalized.Sub_ID = getValue(['Sub_ID', 'subcontractor', 'รหัสผู้รับเหมาช่วง'])
    normalized.Expire_Date = getValue(['Expire_Date', 'licence_expiry', 'วันหมดอายุใบขับขี่'])
    normalized.Bank_Name = getValue(['Bank_Name', 'bank', 'ธนาคาร'])
    normalized.Bank_Account_No = getValue(['Bank_Account_No', 'account_no', 'เลขบัญชี'])
    normalized.Bank_Account_Name = getValue(['Bank_Account_Name', 'account_name', 'ชื่อบัญชี'])

    return normalized
  }

  const cleanData = drivers.map(d => {
    const data = normalizeData(d)
    return {
      Driver_ID: data.Driver_ID || `DRV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      Driver_Name: data.Driver_Name || 'Unknown Driver',
      Mobile_No: data.Mobile_No || '',
      Password: String(data.Password || '123456'),
      Vehicle_Plate: data.Vehicle_Plate || null,
      Vehicle_Type: data.Vehicle_Type || '4-Wheel',
      Active_Status: data.Active_Status,
      Branch_ID: data.Branch_ID,
      Sub_ID: data.Sub_ID || null,
      Expire_Date: data.Expire_Date || null,
      Bank_Name: data.Bank_Name || null,
      Bank_Account_No: data.Bank_Account_No || null,
      Bank_Account_Name: data.Bank_Account_Name || null,
      Role: 'Driver'
    }
  })

  if (cleanData.length === 0) {
    return { success: false, message: 'No valid driver data found' }
  }

  const { error } = await supabase
    .from('Master_Drivers')
    .upsert(cleanData, { onConflict: 'Driver_ID' })

  if (error) {
    return { success: false, message: `Failed to import drivers: ${error.message}` }
  }

  return { success: true, message: `Successfully imported ${cleanData.length} drivers` }
}
