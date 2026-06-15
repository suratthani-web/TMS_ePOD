"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { logActivity } from '@/lib/supabase/logs'
import { getDriverSession } from '@/lib/auth-utils'
import { getUserBranchId, isSuperAdmin, isAdmin, getCustomerId } from "@/lib/permissions"
 
export type JobAssignment = {
  Vehicle_Type: string
  Vehicle_Plate: string
  Driver_ID: string
  Sub_ID?: string
  Show_Price_To_Driver?: boolean
  Cost_Driver_Total?: number
  Price_Cust_Total?: number
  Branch_ID?: string
}

export type Job = {
  Job_ID: string
  Job_Status: string
  Plan_Date: string | null
  Pickup_Date?: string | null
  Delivery_Date: string | null
  Customer_ID: string | null
  Customer_Name: string | null
  Route_Name: string | null
  Driver_ID: string | null
  Driver_Name: string | null
  Vehicle_Plate: string | null
  Vehicle_Type: string | null
  Origin_Location: string | null
  Dest_Location: string | null
  Total_Drop: number | null
  Price_Cust_Total: number
  Cost_Driver_Total: number
  Price_Cust_Base?: number | null
  Price_Cust_Extra?: number | null
  Charge_Labor?: number | null
  Charge_Wait?: number | null
  Price_Cust_Return?: number | null
  Price_Cust_Fuel?: number | null
  Price_Cust_Trailer?: number | null
  Price_Cust_Other?: number | null
  Cost_Driver_Base?: number | null
  Cost_Driver_Extra?: number | null
  Cost_Driver_Labor?: number | null
  Cost_Driver_Wait?: number | null
  Cost_Driver_Return?: number | null
  Cost_Driver_Fuel?: number | null
  Cost_Driver_Trailer?: number | null
  Cost_Driver_Other?: number | null
  Cargo_Type: string | null
  Notes: string | null
  original_origins_json: string | null
  original_destinations_json: string | null
  extra_costs_json: string | null
  origins?: unknown
  destinations?: unknown
  extra_costs?: unknown
  assignments?: JobAssignment[]
  Created_At: string | null
  Photo_Proof_Url: string | null
  Signature_Url: string | null
  Pickup_Photo_Url: string | null
  Pickup_Signature_Url: string | null
  Sub_ID: string | null
  Show_Price_To_Driver: boolean
  Weight_Kg?: number | null
  Volume_Cbm?: number | null
  Zone?: string | null
  Invoice_ID?: string | null
  Billing_Note_ID?: string | null
  Driver_Payment_ID?: string | null
  Pickup_Lat?: number | null
  Pickup_Lon?: number | null
  Delivery_Lat?: number | null
  Delivery_Lon?: number | null
  Branch_ID?: string | null
  Est_Distance_KM?: number | null
  Verification_Status?: 'Pending' | 'Verified' | 'Rejected' | null
  Verification_Note?: string | null
  Verified_By?: string | null
  Verified_At?: string | null
  Loaded_Qty?: number | null
  Price_Per_Unit?: number | null
  job_type?: 'normal' | 'container' | null
  chassis_plate?: string | null
  container?: {
    container_no: string | null
    seal_no: string | null
    container_size: string | null
    shipping_line: string | null
    vessel_voyage: string | null
    lfd_demurrage: string | null
    lfd_detention: string | null
    eir_gate_in_url: string | null
    eir_gate_out_url: string | null
    container_condition_json: unknown
    target_temperature?: number | null
    booking_no?: string | null
    container_subtype?: string | null
    pickup_empty_date?: string | null
    port_closing_datetime?: string | null
  } | null
  Billing_Notes?: {
    Status: string
  } | null
  Requires_Incentive_Check?: boolean | null
  Incentive_Claimed?: boolean | null
  Sensor_Verified?: 'Verified' | 'Suspect' | null
  Sensor_Max_Elevation_Diff?: number | null
  Sensor_Total_Steps_Upward?: number | null
  Sensor_Logs_Json?: unknown
}

// Removed duplicate definition

// ดึงงานทั้งหมดวันนี้

// ดึงงานตามวันที่ (Default: วันนี้)
export async function getTodayJobs(date?: string, branchId?: string): Promise<Job[]> {
  try {
    const isSuper = await isSuperAdmin()
    const isRegularAdmin = await isAdmin()
    const userBranchId = await getUserBranchId()
    const customerId = await getCustomerId()
    const supabase = (isSuper || isRegularAdmin || customerId) ? await createAdminClient() : await createClient()
    
    // Use provided date or today in Bangkok time
    const targetDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

    let dbQuery = supabase
      .from('Jobs_Main')
      .select('*, container:jobs_container(*)')
      .eq('Plan_Date', targetDate)
    
    // UI REFINEMENT: In Planning, if viewing TODAY, hide active jobs that are already in Tracking Hub
    // UNLESS the job is 'Draft' or 'New' or 'Assigned' but not yet 'Picked Up'
    if (targetDate === today) {
        // We only want to show things that NEED planning or haven't started yet.
        dbQuery = dbQuery.in('Job_Status', ['Draft', 'New', 'Assigned', 'Requested', 'Pending'])
    }

    if (customerId) {
        dbQuery = dbQuery.eq('Customer_ID', customerId)
    } else {
        // STRICT ISOLATION: Non-SuperAdmins MUST be filtered by their branch (but can see unassigned 'null' or global 'All' drafts/jobs)
        if (!isSuper) {
            if (userBranchId && userBranchId !== 'All') {
                dbQuery = dbQuery.or(`Branch_ID.eq.${userBranchId},Branch_ID.eq.All,Branch_ID.is.null`)
            } else {
                return []
            }
        } else if (branchId && branchId !== 'All') {
            // SuperAdmin can filter by specific branch
            dbQuery = dbQuery.eq('Branch_ID', branchId)
        }
    }

    const { data } = await dbQuery
      .order('Created_At', { ascending: false })
    
    return (data || []) as Job[]
  } catch {
    return []
  }
}

export async function getLiveActiveJobs(branchId?: string, customerId?: string | null): Promise<Job[]> {
    try {
        const isSuper = await isSuperAdmin()
        const isRegularAdmin = await isAdmin()
        const userBranchId = await getUserBranchId()
        const supabase = (isSuper || isRegularAdmin || customerId) ? await createAdminClient() : await createClient()
        
        let query = supabase
            .from('Jobs_Main')
            .select('*')
            .in('Job_Status', ['Assigned', 'Confirmed', 'Picked Up', 'In Transit', 'Arrived', 'SOS'])

        if (customerId) {
            query = query.eq('Customer_ID', customerId)
        }

        // Apply Branch isolation filter
        if (!isSuper) {
            if (userBranchId && userBranchId !== 'All') {
                query = query.eq('Branch_ID', userBranchId)
            } else if (!customerId) {
                return []
            }
        } else if (branchId && branchId !== 'All') {
            query = query.eq('Branch_ID', branchId)
        }

        const { data } = await query
        return data || []
    } catch {
        return []
    }
}

// ดึงงานตามสถานะ
export async function getJobsByStatus(status: string): Promise<Job[]> {
  try {
    const isSuper = await isSuperAdmin()
    const isRegularAdmin = await isAdmin()
    const branchId = await getUserBranchId()
    const customerId = await getCustomerId()
    const supabase = (isSuper || isRegularAdmin || customerId) ? await createAdminClient() : await createClient()

    let dbQuery = supabase
      .from('Jobs_Main')
      .select('*, container:jobs_container(*)')
      .eq('Job_Status', status)
    
    if (customerId) {
        dbQuery = dbQuery.eq('Customer_ID', customerId)
    } else {
        // STRICT ISOLATION
        if (!isSuper) {
            if (branchId && branchId !== 'All') {
                dbQuery = dbQuery.eq('Branch_ID', branchId)
            } else {
                return []
            }
        } else if (branchId && branchId !== 'All') {
            dbQuery = dbQuery.eq('Branch_ID', branchId)
        }
    }

    const { data } = await dbQuery
      .order('Created_At', { ascending: false })
      .limit(100)
    
    if (data === null) {
      return []
    }
    
    return (data || []) as Job[]
  } catch {
    return []
  }
}

export async function getAllJobs(
  page = 1, 
  limit = 50, 
  query = '',
  status = '', // Add status parameter
  startDate = '', // Add startDate parameter
  endDate = '', // Add endDate parameter
  providedBranchId = '',
  providedCustomerId = ''
): Promise<{ data: Job[], count: number }> {
  try {
    const isSuper = await isSuperAdmin()
    const isRegularAdmin = await isAdmin()
    const userBranchId = await getUserBranchId()
    const branchId = (isSuper || isRegularAdmin) ? (providedBranchId || userBranchId) : userBranchId
    const customerId = await getCustomerId()
    const supabase = (isSuper || isRegularAdmin || customerId) ? createAdminClient() : await createClient()
    
    const offset = (page - 1) * limit
    
    let dbQuery = supabase
      .from('Jobs_Main')
      .select('*, container:jobs_container(*)', { count: 'exact' })
      .neq('Job_Status', 'Draft') // UI REFINEMENT: Hide Drafts from History (They belong in Planning)
    
    if (customerId) {
        dbQuery = dbQuery.eq('Customer_ID', customerId)
    } else {
        // STRICT ISOLATION: Apply customer filter first if a specific customer is selected
        if (providedCustomerId && providedCustomerId !== 'All') {
            dbQuery = dbQuery.eq('Customer_ID', providedCustomerId)
        } else if (!isSuper) {
            // No customer selected — enforce branch isolation for non-super admins
            if (branchId && branchId !== 'All') {
                dbQuery = dbQuery.eq('Branch_ID', branchId)
            } else {
                return { data: [], count: 0 }
            }
        } else if (branchId && branchId !== 'All') {
            // Super admin with a specific branch selected
            dbQuery = dbQuery.eq('Branch_ID', branchId)
        }
    }

    if (startDate) {
      dbQuery = dbQuery.gte('Plan_Date', startDate)
    }
    if (endDate) {
      dbQuery = dbQuery.lte('Plan_Date', endDate)
    }

    dbQuery = dbQuery
      .order('Plan_Date', { ascending: false })
      .order('Created_At', { ascending: false })
    if (query) {
      dbQuery = dbQuery.or(`Job_ID.ilike.%${query}%,Customer_Name.ilike.%${query}%,Route_Name.ilike.%${query}%,Notes.ilike.%${query}%`)
    }

    if (status) {
      dbQuery = dbQuery.eq('Job_Status', status)
    }

    const { data, count } = await dbQuery.range(offset, offset + limit - 1)
    
    if (data === null) {
      return { data: [], count: 0 }
    }
    
    return { data: data || [], count: count || 0 }
  } catch {
    return { data: [], count: 0 }
  }
}

// นับสถิติงานตามช่วงเวลา (Default: วันนี้)
export async function getTodayJobStats(branchId?: string, startDate?: string, endDate?: string, customerNames?: string[], customerId?: string | null) {
  try {
    const isSuper = await isSuperAdmin()
    const isRegularAdmin = await isAdmin()
    const userBranchId = await getUserBranchId()
    const loggedInCustomerId = await getCustomerId()
    const finalCustomerId = customerId || loggedInCustomerId
    const supabase = (isSuper || isRegularAdmin || finalCustomerId) ? await createAdminClient() : await createClient()
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    
    let dbQuery = supabase
      .from('Jobs_Main')
      .select('Job_Status, Loaded_Qty')

    if (startDate && endDate) {
        dbQuery = dbQuery.gte('Plan_Date', startDate).lte('Plan_Date', endDate)
    } else {
        dbQuery = dbQuery.eq('Plan_Date', today)
    }

    if (finalCustomerId) {
        dbQuery = dbQuery.eq('Customer_ID', finalCustomerId)
    } else {
        // STRICT ISOLATION: Non-SuperAdmins MUST be filtered by their branch (but can see unassigned 'null' or global 'All' drafts/jobs)
        if (!isSuper) {
            if (userBranchId && userBranchId !== 'All') {
                dbQuery = dbQuery.or(`Branch_ID.eq.${userBranchId},Branch_ID.eq.All,Branch_ID.is.null`)
            } else {
                return { total: 0, delivered: 0, inProgress: 0, pending: 0, totalQty: 0 }
            }
        } else if (branchId && branchId !== 'All') {
            // SuperAdmin can filter by specific branch
            dbQuery = dbQuery.eq('Branch_ID', branchId)
        }

        if (customerNames && customerNames.length > 0) {
            dbQuery = dbQuery.in('Customer_Name', customerNames)
        }
    }
    
    const { data } = await dbQuery
    
    if (data === null) {
      return { total: 0, delivered: 0, inProgress: 0, pending: 0, totalQty: 0 }
    }
    
    const jobs = data || []
    return {
      total: jobs.length,
      delivered: jobs.filter((j: Partial<Job>) => j.Job_Status === 'Delivered' || j.Job_Status === 'Completed' || j.Job_Status === 'Verified').length,
      inProgress: jobs.filter((j: Partial<Job>) => j.Job_Status === 'In Transit' || j.Job_Status === 'In Progress' || j.Job_Status === 'Arrived Pickup' || j.Job_Status === 'Arrived Dropoff').length,
      pending: jobs.filter((j: Partial<Job>) => j.Job_Status === 'New' || j.Job_Status === 'Assigned' || j.Job_Status === 'Requested' || j.Job_Status === 'Pending').length,
      sos: jobs.filter((j: Partial<Job>) => j.Job_Status === 'SOS').length,
      totalQty: jobs.reduce((sum: number, j: Partial<Job>) => sum + (Number(j.Loaded_Qty) || 0), 0)
    }
  } catch {
    return { total: 0, delivered: 0, inProgress: 0, pending: 0, totalQty: 0 }
  }
}

export async function getJobStatsSummary(query = '', startDate = '', endDate = '', providedBranchId = '', providedCustomerId = '') {
  try {
    const isSuper = await isSuperAdmin()
    const isRegularAdmin = await isAdmin()
    const userBranchId = await getUserBranchId()
    const branchId = (isSuper || isRegularAdmin) ? (providedBranchId || userBranchId) : userBranchId
    const customerId = await getCustomerId()
    const supabase = (isSuper || isRegularAdmin || customerId) ? await createAdminClient() : await createClient()
    
    let dbQuery = supabase
      .from('Jobs_Main')
      .select('Job_Status, Photo_Proof_Url, Signature_Url, Pickup_Photo_Url, Pickup_Signature_Url')
    
    if (customerId) {
        dbQuery = dbQuery.eq('Customer_ID', customerId)
    } else {
        // STRICT ISOLATION: Apply customer filter first if a specific customer is selected
        if (providedCustomerId && providedCustomerId !== 'All') {
            dbQuery = dbQuery.eq('Customer_ID', providedCustomerId)
        } else if (!isSuper) {
            // No customer selected — enforce branch isolation for non-super admins
            if (branchId && branchId !== 'All') {
                dbQuery = dbQuery.eq('Branch_ID', branchId)
            } else {
                return { success: 0, failed: 0, cancelled: 0, total: 0, withPhoto: 0, withSignature: 0 }
            }
        } else if (branchId && branchId !== 'All') {
            dbQuery = dbQuery.eq('Branch_ID', branchId)
        }
    }

    if (startDate) dbQuery = dbQuery.gte('Plan_Date', startDate)
    if (endDate) dbQuery = dbQuery.lte('Plan_Date', endDate)
    if (query) {
      dbQuery = dbQuery.or(`Job_ID.ilike.%${query}%,Customer_Name.ilike.%${query}%,Route_Name.ilike.%${query}%`)
    }

    const { data } = await dbQuery
    
    if (!data) return { success: 0, failed: 0, cancelled: 0, total: 0, withPhoto: 0, withSignature: 0 }
    
    return {
      total: data.length,
      success: data.filter((j: Partial<Job>) => ['Delivered', 'Complete', 'Completed', 'Verified'].includes(j.Job_Status || '')).length,
      failed: data.filter((j: Partial<Job>) => j.Job_Status === 'Failed').length,
      cancelled: data.filter((j: Partial<Job>) => j.Job_Status === 'Cancelled').length,
      withPhoto: data.filter((j: Partial<Job>) => j.Photo_Proof_Url || j.Pickup_Photo_Url).length,
      withSignature: data.filter((j: Partial<Job>) => j.Signature_Url || j.Pickup_Signature_Url).length
    }
  } catch {
    return { success: 0, failed: 0, cancelled: 0, total: 0, withPhoto: 0, withSignature: 0 }
  }
}


// ยอดเงินวันนี้ (Estimated)
export async function getTodayFinancials(branchId?: string) {
  try {
    const isSuper = await isSuperAdmin()
    const isRegularAdmin = await isAdmin()
    const userBranchId = await getUserBranchId()
    const customerId = await getCustomerId()
    const supabase = (isSuper || isRegularAdmin || customerId) ? await createAdminClient() : await createClient()
    const today = new Date().toISOString().split('T')[0]

    let dbQuery = supabase
      .from('Jobs_Main')
      .select('Price_Cust_Total')
      .eq('Plan_Date', today)

    if (customerId) {
        dbQuery = dbQuery.eq('Customer_ID', customerId)
    } else {
        // STRICT ISOLATION
        if (!isSuper) {
            if (userBranchId && userBranchId !== 'All') {
                dbQuery = dbQuery.eq('Branch_ID', userBranchId)
            } else {
                return { revenue: 0 }
            }
        } else if (branchId && branchId !== 'All') {
            dbQuery = dbQuery.eq('Branch_ID', branchId)
        }
    }

    const { data } = await dbQuery
      .neq('Job_Status', 'Cancelled') // Exclude cancelled jobs
    
    if (!data) return { revenue: 0 }

    const revenue = data.reduce((sum: number, job: Partial<Job>) => sum + (job.Price_Cust_Total || 0), 0) || 0
    return { revenue }
  } catch {
    return { revenue: 0 }
  }
}

// ดึงงานของ Driver เฉพาะคน
// ดึงงานของ Driver เฉพาะคน
// ดึงงานของ Driver เฉพาะคน (รองรับ Filter)
export async function getDriverJobs(
  driverId: string, 
  options: { startDate?: string, endDate?: string, status?: string } = {}
): Promise<Job[]> {
  try {
    // USE admin client for driver-specific queries to bypass RLS 
    // since drivers use custom cookie auth, not Supabase Auth
    const branchId = await getUserBranchId()
    const isAdmin = await isSuperAdmin()
    const supabase = createAdminClient()
    
    let query = supabase
      .from('Jobs_Main')
      .select('Job_ID, Customer_Name, Job_Status, Pickup_Date:Plan_Date, Delivery_Date, Plan_Date, Origin_Location, Dest_Location, Route_Name, Show_Price_To_Driver, Cost_Driver_Total, Total_Drop, Signature_Url, Photo_Proof_Url')
      .eq('Driver_ID', driverId)

    // Filter out drafts - driver shouldn't see them yet
    query = query.neq('Job_Status', 'Draft')

    // Only apply branch filter if it's NOT a driver (Admin/Staff must see their branch)
    // Driver should see jobs assigned to them regardless of their profile branch_id
    if (branchId && branchId !== 'All' && !driverId) {
        query = query.eq('Branch_ID', branchId)
    } else if (!isAdmin && !branchId && !driverId) {
        return []
    }

    if (options.startDate) {
        query = query.gte('Plan_Date', options.startDate)
    } else {
        const past = new Date()
        past.setDate(past.getDate() - 15)
        const pastStr = past.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
        query = query.gte('Plan_Date', pastStr)
    }

    if (options.endDate) {
        query = query.lte('Plan_Date', options.endDate)
    } else {
        const future = new Date()
        future.setDate(future.getDate() + 15)
        const futureStr = future.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
        query = query.lte('Plan_Date', futureStr)
    }

    if (options.status && options.status !== 'All') {
        query = query.eq('Job_Status', options.status)
    }

    const { data } = await query
      .order('Plan_Date', { ascending: false })
      .order('Created_At', { ascending: false })
      .limit(100)
    
    if (data === null) {
      return []
    }
    
    return (data || []) as Job[]
  } catch {
    return []
  }
}

export async function getJobById(jobId: string): Promise<Job | null> {
    try {
        const decodedJobId = decodeURIComponent(jobId)
        const driverSession = await getDriverSession()
        const isSuper = await isSuperAdmin()
        const isRegularAdmin = await isAdmin()
        const branchId = await getUserBranchId()
        const customerId = await getCustomerId()
        
        // Use admin client if it's a driver or authorized user
        const supabase = (isSuper || isRegularAdmin || customerId || driverSession) ? createAdminClient() : await createClient()

        // 1. SIMPLE CORE FETCH
        // We use select('*') first to rule out any join syntax errors
        const baseQuery = supabase
            .from('Jobs_Main')
            .select('*, container:jobs_container(*)')
            .eq('Job_ID', decodedJobId)
        
        // Apply Filters
        if (isSuper || isRegularAdmin) {
            // Admin sees all within branch (or all if Super), including unassigned/global jobs
            if (!isSuper && branchId && branchId !== 'All') {
                baseQuery.or(`Branch_ID.eq.${branchId},Branch_ID.eq.All,Branch_ID.is.null`)
            }
        } else if (customerId) {
            baseQuery.eq('Customer_ID', customerId)
        } else if (driverSession) {
            // DRIVER: Allow if assigned to this driver OR if the job is unassigned (Marketplace/Draft)
            // This is safer and more flexible for drivers opening links
            baseQuery.or(`Driver_ID.eq.${driverSession.driverId},Driver_ID.is.null`)
        } else if (!branchId) {
            // If No session and No branch and Not Admin, return null
            return null
        }

        const { data, error: fetchError } = await baseQuery.single()
        
        if (!data || fetchError) {
            // Second chance: Try finding strictly by ID (bypassing filters) and check in JS
            // This prevents issues with string padding, case mismatch, or url encoding in SQL queries
            const { data: directData } = await supabase
                .from('Jobs_Main')
                .select('*')
                .eq('Job_ID', decodedJobId)
                .single()
            
            if (directData) {
                const jobObj = directData as Job
                
                // If it's an admin/staff, let them access if they are superadmin or branch matches
                if (isSuper || isRegularAdmin) {
                    if (isSuper || !branchId || branchId === 'All' || jobObj.Branch_ID === branchId || jobObj.Branch_ID === 'All' || !jobObj.Branch_ID) {
                        return await enrichJobWithCustomerData(jobObj)
                    }
                } 
                // If it's a customer, check if Customer_ID matches
                else if (customerId && jobObj.Customer_ID === customerId) {
                    return await enrichJobWithCustomerData(jobObj)
                } 
                // If it's a driver, check if Driver_ID matches or is null/empty
                else if (driverSession) {
                    const cleanDriverId = String(driverSession.driverId).trim().toLowerCase()
                    const cleanJobDriverId = String(jobObj.Driver_ID || '').trim().toLowerCase()
                    
                    if (!jobObj.Driver_ID || cleanJobDriverId === cleanDriverId) {
                        return await enrichJobWithCustomerData(jobObj)
                    }
                }
            }
            return null
        }

        // 2. SECONDARY ENRICHMENT
        return await enrichJobWithCustomerData(data as Job)
    } catch (e) {
        console.error('[getJobById ERROR]', e)
        return null
    }
}

async function enrichJobWithCustomerData(job: Job): Promise<Job> {
    if (!job.Customer_ID) return job
    
    try {
        const supabase = createAdminClient()
        
        // 1. Fetch Customer Price per unit
        const { data: customer } = await supabase
            .from('Master_Customers')
            .select('Price_Per_Unit')
            .eq('Customer_ID', job.Customer_ID)
            .single()
        
        // 2. Fetch Driver Master Override (Show_Price_Default)
        // If this is turned off, the driver should NEVER see the price
        let showPriceOverride = job.Show_Price_To_Driver
        if (job.Driver_ID) {
            const { data: driver } = await supabase
                .from('Master_Drivers')
                .select('Show_Price_Default')
                .eq('Driver_ID', job.Driver_ID)
                .single()
            
            if (driver && driver.Show_Price_Default === false) {
                showPriceOverride = false
            }
        }
        
        return {
            ...job,
            Price_Per_Unit: customer?.Price_Per_Unit || 0,
            Show_Price_To_Driver: showPriceOverride
        }
    } catch {
        return job
    }
}

// สถิติยอดจัดส่งย้อนหลัง 7 วัน
export async function getWeeklyJobStats(branchId?: string) {
  try {
    const isSuper = await isSuperAdmin()
    const isRegularAdmin = await isAdmin()
    const userBranchId = await getUserBranchId()
    const customerId = await getCustomerId()
    const supabase = (isSuper || isRegularAdmin || customerId) ? await createAdminClient() : await createClient()
    
    const today = new Date()
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(today.getDate() - 6)

    const startDate = sevenDaysAgo.toISOString().split('T')[0]
    
    // ดึงข้อมูล 7 วันล่าสุด
    let dbQuery = supabase
      .from('Jobs_Main')
      .select('Plan_Date, Job_Status')
      .gte('Plan_Date', startDate)

    if (customerId) {
        dbQuery = dbQuery.eq('Customer_ID', customerId)
    } else {
        const effectiveBranchId = branchId || userBranchId
        if (effectiveBranchId && effectiveBranchId !== 'All') {
            dbQuery = dbQuery.eq('Branch_ID', effectiveBranchId)
        } else if (!isSuper && !isRegularAdmin && !userBranchId) {
            return []
        }
    }

    const { data } = await dbQuery
      .order('Plan_Date', { ascending: true })

    if (data === null) {
      return []
    }

    // Group data by date
    const dailyStats: Record<string, { date: string, total: number, completed: number }> = {}
    
    // Initialize last 7 days with 0
    for (let i = 0; i < 7; i++) {
        const d = new Date(sevenDaysAgo)
        d.setDate(sevenDaysAgo.getDate() + i)
        const dateStr = d.toISOString().split('T')[0]
        const dayName = d.toLocaleDateString('th-TH', { weekday: 'short' }) // Mon, Tue...
        dailyStats[dateStr] = { date: dayName, total: 0, completed: 0 }
    }

    data?.forEach((job: Partial<Job>) => {
        const dateStr = job.Plan_Date as string // Assuming Plan_Date is string YYYY-MM-DD
        if (dailyStats[dateStr]) {
            dailyStats[dateStr].total += 1
            if (job.Job_Status && ['Delivered', 'Completed'].includes(job.Job_Status)) {
                dailyStats[dateStr].completed += 1
            }
        }
    })

    return Object.values(dailyStats)
  } catch {
    return []
  }
}

// สัดส่วนสถานะงาน (ทั้งหมด)
export async function getJobStatusDistribution(branchId?: string) {
    try {
        const isSuper = await isSuperAdmin()
        const isRegularAdmin = await isAdmin()
        const userBranchId = await getUserBranchId()
        const customerId = await getCustomerId()
        const supabase = (isSuper || isRegularAdmin || customerId) ? await createAdminClient() : await createClient()

        let dbQuery = supabase
            .from('Jobs_Main')
            .select('Job_Status')

        if (customerId) {
            dbQuery = dbQuery.eq('Customer_ID', customerId)
        } else {
            const effectiveBranchId = branchId || userBranchId
            if (effectiveBranchId && effectiveBranchId !== 'All') {
                dbQuery = dbQuery.eq('Branch_ID', effectiveBranchId)
            } else if (!isSuper && !isRegularAdmin && !userBranchId) {
                return []
            }
        }

        const { data } = await dbQuery

        if (!data) return []

        const statusCounts: Record<string, number> = {}
        data?.forEach((job: Partial<Job>) => {
            const status = job.Job_Status || 'Unknown'
            statusCounts[status] = (statusCounts[status] || 0) + 1
        })

        // Map colors for common statuses
        const result = Object.entries(statusCounts).map(([name, value]) => ({
            name,
            value,
            fill: getStatusColor(name)
        }))

        return result
    } catch {
        return []
    }
}

function getStatusColor(status: string) {
    switch (status) {
        case 'Completed': return '#10b981' // emerald-500
        case 'Delivered': return '#10b981'
        case 'In Progress': return '#3b82f6' // blue-500
        case 'In Transit': return '#3b82f6'
        case 'Pending': return '#f59e0b' // amber-500
        case 'New': return '#f59e0b'
        case 'Assigned': return '#8b5cf6' // violet-500
        case 'Failed': return '#ef4444' // red-500
        case 'Cancelled': return '#94a3b8' // slate-400
        case 'Draft': return '#f59e0b' // amber-500
        default: return '#cbd5e1'
    }
}
import { sanitizeJobData } from './utils'

// สร้างงานใหม่
export async function createJob(jobData: Partial<Job>) {
    try {
        const isSuper = await isSuperAdmin()
        const isRegularAdmin = await isAdmin()
        const supabase = (isSuper || isRegularAdmin) ? await createAdminClient() : await createClient()
        
        // Generate Job ID (Format: JOB-YYYYMMDD-XXXX)
        const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).replace(/-/g, '')
        const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
        const newJobId = `JOB-${dateStr}-${randomSuffix}`

        const branchId = await getUserBranchId() || 'HQ'
        let custTotal = Number(jobData.Price_Cust_Total) || 0

        let requiresIncentiveCheck = jobData.Requires_Incentive_Check || false

        // Fetch customer settings for auto-calculation and sensor checks
        if (jobData.Customer_ID) {
            const { data: customer } = await supabase
                .from('Master_Customers')
                .select('Price_Per_Unit, Incentive_Sensor_Check')
                .eq('Customer_ID', jobData.Customer_ID)
                .single()
            
            if (customer) {
                if (custTotal === 0 && customer.Price_Per_Unit) {
                    const qty = Number(jobData.Weight_Kg || jobData.Volume_Cbm || jobData.Loaded_Qty || 0)
                    if (qty > 0) {
                        custTotal = Number((qty * customer.Price_Per_Unit).toFixed(2))
                    }
                }
                if (customer.Incentive_Sensor_Check) {
                    requiresIncentiveCheck = true
                }
            }
        }

        const sanitized = sanitizeJobData({
            ...jobData,
            Job_ID: newJobId,
            Job_Status: 'New',
            Branch_ID: branchId,
            Price_Cust_Total: custTotal,
            Requires_Incentive_Check: requiresIncentiveCheck,
            Created_At: new Date().toISOString()
        })

        const { data, error } = await supabase
            .from('Jobs_Main')
            .insert(sanitized)
            .select()
            .single()
 
        if (error) {
            return { success: false, error }
        }

        // Log job creation
        await logActivity({
            module: 'Jobs',
            action_type: 'CREATE',
            target_id: newJobId,
            details: { 
                customer_name: jobData.Customer_Name,
                plan_date: jobData.Plan_Date,
                route: jobData.Route_Name,
                Branch_ID: jobData.Branch_ID || ''
            }
        })

        return { success: true, data }
    } catch (e) {
        return { success: false, error: e }
    }
}

// ดึงรายชื่อคนขับทั้งหมด (จากประวัติงาน)
export async function getAllDrivers() {
    try {
        const isSuper = await isSuperAdmin()
        const isRegularAdmin = await isAdmin()
        const supabase = (isSuper || isRegularAdmin) ? await createAdminClient() : await createClient()
        const branchId = await getUserBranchId()

        let query = supabase
            .from('Jobs_Main')
            .select('Driver_ID, Driver_Name, Vehicle_Plate')
            .not('Driver_ID', 'is', null)
        
        if (!isSuper) {
            if (branchId && branchId !== 'All') {
                query = query.eq('Branch_ID', branchId)
            } else {
                return []
            }
        } else if (branchId && branchId !== 'All') {
            query = query.eq('Branch_ID', branchId)
        }

        const { data } = await query
        
        if (!data) return []

        // De-duplicate by Driver_ID
        const uniqueDrivers = new Map()
        data?.forEach((item: Partial<Job>) => {
            if (item.Driver_ID && !uniqueDrivers.has(item.Driver_ID)) {
                uniqueDrivers.set(item.Driver_ID, item)
            }
        })

        return Array.from(uniqueDrivers.values())
    } catch {
        return []
    }
}

// ดึงรายชื่อรถทั้งหมด
export async function getAllVehicles() {
    try {
        const isSuper = await isSuperAdmin()
        const isRegularAdmin = await isAdmin()
        const supabase = (isSuper || isRegularAdmin) ? await createAdminClient() : await createClient()
        const branchId = await getUserBranchId()

        let query = supabase
            .from('Jobs_Main')
            .select('Vehicle_Plate, Driver_Name')
            .not('Vehicle_Plate', 'is', null)

        if (!isSuper) {
            if (branchId && branchId !== 'All') {
                query = query.eq('Branch_ID', branchId)
            } else {
                return []
            }
        } else if (branchId && branchId !== 'All') {
            query = query.eq('Branch_ID', branchId)
        }

        const { data } = await query

        if (!data) return []

        const uniqueVehicles = new Map()
        data?.forEach((item: Partial<Job>) => {
            if (item.Vehicle_Plate && !uniqueVehicles.has(item.Vehicle_Plate)) {
                uniqueVehicles.set(item.Vehicle_Plate, item)
            }
        })

        return Array.from(uniqueVehicles.values())
    } catch {
        return []
    }
}

// ดึงข้อมูลสำหรับหน้า Billing (Completed/Delivered)
export async function getJobsForBilling(
    explicitCustomerId?: string, 
    startDate?: string, 
    endDate?: string,
    mode: 'customer' | 'driver' = 'customer'
): Promise<Job[]> {
    try {
        const isSuper = await isSuperAdmin()
        const _isRegularAdmin = await isAdmin()
        const branchId = await getUserBranchId()
        const sessionCustomerId = await getCustomerId()
        const customerId = explicitCustomerId || sessionCustomerId
        
        // Billing, invoicing, and payout registries are highly privileged, administrative actions.
        // We always utilize createAdminClient() to guarantee 100% data fidelity and bypass RLS column limits,
        // while strictly enforcing branch-level isolation programmatically below.
        const supabase = createAdminClient()

        let dbQuery = supabase
            .from('Jobs_Main')
            .select('Job_ID, Job_Status, Plan_Date, Customer_ID, Customer_Name, Route_Name, Vehicle_Plate, Vehicle_Type, Origin_Location, Dest_Location, Price_Cust_Total, Price_Per_Unit, Loaded_Qty, Created_At, Branch_ID, Driver_ID, Driver_Name, Cost_Driver_Total, extra_costs_json, Driver_Payment_ID, Billing_Note_ID, Invoice_ID')
            .in('Job_Status', ['Completed', 'Delivered', 'Verified'])
        
        if (mode === 'driver') {
            // For driver payments, only filter out if already paid to driver
            dbQuery = dbQuery.is('Driver_Payment_ID', null)
        } else {
            // For customer billing, filter out if already invoiced/noted
            dbQuery = dbQuery.is('Billing_Note_ID', null).is('Invoice_ID', null)
        }
        
        if (customerId) {
            dbQuery = dbQuery.eq('Customer_ID', customerId)
        } else if (!isSuper) {
            // STRICT ISOLATION for regular staff
            if (branchId && branchId !== 'All') {
                dbQuery = dbQuery.eq('Branch_ID', branchId)
            } else {
                // If regular staff tries to access 'All' or has no branch, return nothing for safety
                return []
            }
        } else if (branchId && branchId !== 'All') {
            // SuperAdmin only filters if a specific branch is selected
            dbQuery = dbQuery.eq('Branch_ID', branchId)
        }

        let query = dbQuery.order('Plan_Date', { ascending: false })
            
        // Add default date range if not provided (e.g. last 30 days) to keep initial load snappy
        if (startDate || endDate) {
            if (startDate) {
                query = query.gte('Plan_Date', startDate)
            }
            if (endDate) {
                query = query.lte('Plan_Date', endDate)
            }
            // Lift limit to 10,000 when explicit dates are searched to guarantee complete exports
            query = query.limit(10000)
        } else {
            if (!explicitCustomerId) {
                const defaultPast = new Date()
                defaultPast.setDate(defaultPast.getDate() - 45)
                query = query.gte('Plan_Date', defaultPast.toISOString().split('T')[0])
            }
            query = query.limit(1000)
        }
        
        const { data } = await query
        
        if (!data || data.length === 0) {
            return []
        }

        const uniqueCustomerIds = Array.from(new Set(data.filter((j: Partial<Job>) => j.Customer_ID).map((j: Partial<Job>) => j.Customer_ID)))
        const { data: customerPrices } = await supabase
            .from('Master_Customers')
            .select('Customer_ID, Price_Per_Unit')
            .in('Customer_ID', uniqueCustomerIds)

        const priceMap = new Map(customerPrices?.map((c: { Customer_ID: string, Price_Per_Unit: number }) => [c.Customer_ID, c.Price_Per_Unit]) || [])

        // Process each job to find the best matching price for its specific date
        const enhancedJobs = await Promise.all(data.map(async (job: Partial<Job>) => {
            const dateStr = String(job.Plan_Date || "")
            const jobDate = job.Plan_Date ? new Date(job.Plan_Date) : null
            const isApril21_23 = (jobDate && jobDate.getFullYear() === 2026 && jobDate.getMonth() === 3 && [21, 22, 23].includes(jobDate.getDate())) ||
                                 dateStr.includes("-04-21") || dateStr.includes("-04-22") || dateStr.includes("-04-23")
            
            let finalPrice = priceMap.get(job.Customer_ID || '') || job.Price_Per_Unit || 0
            
            // If the job has a route and customer, strictly try to find a date-specific rate from fuel matrix
            // This ensures historical rates are applied correctly
            if (isApril21_23) {
                finalPrice = 17
            } else if (job.Customer_ID && job.Route_Name && job.Plan_Date) {
                const suggestedRate = await getSuggestedRate(
                    job.Customer_ID, 
                    job.Route_Name, 
                    undefined, 
                    job.Vehicle_Type || '4-Wheel',
                    job.Plan_Date
                )
                if (suggestedRate) {
                    finalPrice = suggestedRate
                }
            }

            return {
                ...job,
                Price_Per_Unit: finalPrice
            }
        }))
        
        return enhancedJobs as Job[]
    } catch {
        return []
    }
}
// ดึงข้อมูล Dashboard สำหรับ Driver (Mobile)
export async function getDriverDashboardStats(driverId: string) {
  try {
    // Use admin client to bypass RLS as drivers use custom session
    const supabase = createAdminClient()
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

    // Execute ALL queries in parallel for maximum speed
    const [jobsRes, profileRes, allTimeRes, monthlyRes] = await Promise.all([
      // 1. Jobs query (Active or Today)
      supabase
        .from('Jobs_Main')
        .select('Job_ID, Customer_Name, Job_Status, Origin_Location, Dest_Location, Route_Name, Plan_Date, Cost_Driver_Total, Show_Price_To_Driver, Total_Drop, Signature_Url, Photo_Proof_Url')
        .eq('Driver_ID', driverId)
        .neq('Job_Status', 'Cancelled')
        .neq('Job_Status', 'Draft')
        .or(`Job_Status.not.in.(Completed,Complete,Delivered,Verified,Billed,Paid),Plan_Date.eq.${today}`)
        .order('Plan_Date', { ascending: true }) 
        .order('Created_At', { ascending: true }),

      // 2. Profile query
      supabase
        .from('Master_Drivers')
        .select('Show_Price_Default')
        .eq('Driver_ID', driverId)
        .single(),

      // 3. All-time completed count
      supabase
        .from('Jobs_Main')
        .select('*', { count: 'exact', head: true })
        .eq('Driver_ID', driverId)
        .in('Job_Status', ['Completed', 'Delivered', 'Verified']),

      // 4. Monthly completed count for Gamification
      supabase
        .from('Jobs_Main')
        .select('*', { count: 'exact', head: true })
        .eq('Driver_ID', driverId)
        .gte('Plan_Date', startOfMonth)
        .in('Job_Status', ['Completed', 'Delivered', 'Verified'])
    ])

    const jobs = jobsRes.data
    const driverProfile = profileRes.data
    const allTimeCompleted = allTimeRes.count
    const monthlyCompletedCount = monthlyRes.count

    if (!jobs) {
      return { 
        stats: { total: 0, completed: 0 }, 
        gamification: { points: 0, rank: 'Bronze', nextRankPoints: 300, monthlyCompleted: 0 },
        currentJob: null 
      }
    }
    
    const isIncomeVisible = driverProfile?.Show_Price_Default !== false

    // Calculate today's income
    const todayIncome = isIncomeVisible ? (jobs?.filter((j: Partial<Job>) => 
        j.Plan_Date === today && 
        j.Job_Status !== 'Cancelled' &&
        j.Show_Price_To_Driver !== false
    ).reduce((sum: number, j: Partial<Job>) => sum + (j.Cost_Driver_Total || 0), 0) || 0) : 0

    // "Billed"/"Paid" jobs are finished (delivered + invoiced) — they must not
    // count as work to do. This caused a driver to see "51 งานที่ต้องทำ" when 50
    // of them were already billed.
    const activeJobs = jobs?.filter((j: Partial<Job>) => !['Completed', 'Complete', 'Delivered', 'Cancelled', 'Draft', 'Verified', 'Rejected', 'Billed', 'Paid'].includes(j.Job_Status || '')) || []
    const currentJob = activeJobs.length > 0 ? activeJobs[0] : null
    const totalRemaining = activeJobs.length

    const points = (monthlyCompletedCount || 0) * 10
    
    // Rank Logic
    let rank = 'Bronze'
    let nextRankPoints = 300
    if (points >= 1200) { rank = 'Platinum'; nextRankPoints = 0 }
    else if (points >= 700) { rank = 'Gold'; nextRankPoints = 1200 }
    else if (points >= 300) { rank = 'Silver'; nextRankPoints = 700 }

    return {
      stats: { total: totalRemaining, completed: allTimeCompleted || 0 },
      todayIncome,
      gamification: {
          points,
          rank,
          nextRankPoints,
          monthlyCompleted: monthlyCompletedCount || 0
      },
      currentJob,
      activeJobs // <--- Fixed: Added missing activeJobs to return 
    }
  } catch {
     return { 
        stats: { total: 0, completed: 0 }, 
        gamification: { points: 0, rank: 'Bronze', nextRankPoints: 300, monthlyCompleted: 0 },
        currentJob: null 
      }
  }
}

import { getSuggestedRate } from "@/lib/actions/fuel-actions"

// Get billable jobs (Complete/Delivered and NOT yet invoiced)
export async function getBillableJobs(customerId?: string, startDate?: string, endDate?: string) {
  try {
    const isSuper = await isSuperAdmin()
    const isRegularAdmin = await isAdmin()
    const branchId = await getUserBranchId()
    const supabase = (isSuper || isRegularAdmin) ? await createAdminClient() : await createClient()

    let dbQuery = supabase
      .from('Jobs_Main')
      .select('*')
      .is('Invoice_ID', null) 
      .is('Billing_Note_ID', null)
      .in('Job_Status', ['Completed', 'Delivered', 'Verified'])

    if (customerId && customerId !== 'all') {
        dbQuery = dbQuery.eq('Customer_ID', customerId)
    }

    if (startDate) {
        dbQuery = dbQuery.gte('Plan_Date', startDate)
    }

    if (endDate) {
        dbQuery = dbQuery.lte('Plan_Date', endDate)
    }

    if (isSuper && (!branchId || branchId === 'All')) {
        // No filter
    } else if (branchId && branchId !== 'All') {
        dbQuery = dbQuery.eq('Branch_ID', branchId)
    } else if (!isSuper && !branchId) {
        return []
    }

    const { data, error } = await dbQuery
      .order('Plan_Date', { ascending: false })

    if (error || !data || data.length === 0) {
      return []
    }

    // Map unit prices from Master_Customers + Dynamic Fuel Matrix
    try {
        const uniqueCustomerIds = Array.from(new Set(data.filter((j: Partial<Job>) => j.Customer_ID).map((j: Partial<Job>) => j.Customer_ID)))
        
        const { data: customerPrices } = await supabase
            .from('Master_Customers')
            .select('Customer_ID, Price_Per_Unit')
            .in('Customer_ID', uniqueCustomerIds)

        const _priceMap = new Map(customerPrices?.map((c: { Customer_ID: string, Price_Per_Unit: number }) => [c.Customer_ID, c.Price_Per_Unit]) || [])

        /* 
        // Process each job to find the best matching price for its specific date
        const enhancedJobs = await Promise.all(data.map(async (job: Partial<Job>) => {
            const dateStr = String(job.Plan_Date || "")
            const jobDate = job.Plan_Date ? new Date(job.Plan_Date) : null
            const isApril21_23 = (jobDate && jobDate.getFullYear() === 2026 && jobDate.getMonth() === 3 && [21, 22, 23].includes(jobDate.getDate())) ||
                                 dateStr.includes("-04-21") || dateStr.includes("-04-22") || dateStr.includes("-04-23")
            
            let finalPrice = priceMap.get(job.Customer_ID) || job.Price_Per_Unit || 0
            
            // If the job has a route and customer, strictly try to find a date-specific rate from fuel matrix
            // This ensures historical rates are applied correctly
            if (isApril21_23) {
                finalPrice = 17
            } else if (job.Customer_ID && job.Route_Name && job.Plan_Date) {
                const suggestedRate = await getSuggestedRate(
                    job.Customer_ID, 
                    job.Route_Name, 
                    undefined, 
                    job.Vehicle_Type || '4-Wheel',
                    job.Plan_Date
                )
                if (suggestedRate) {
                    finalPrice = suggestedRate
                }
            }

            return {
                ...job,
                Price_Per_Unit: finalPrice
            }
        }))

        return enhancedJobs as Job[]
        */
        return data as Job[]
    } catch (e) {
        console.error("Enriching unit prices failed in getBillableJobs:", e)
        return data as Job[]
    }
  } catch {
    return []
  }
}
// Get unassigned jobs for the marketplace
export async function getMarketplaceJobs(providedBranchId?: string, customerId?: string | null): Promise<Job[]> {
  try {
    // Use Admin Client to bypass branch RLS so we can show global bidding pool
    const supabase = createAdminClient()
    const loggedInCustomerId = await getCustomerId()
    const finalCustomerId = customerId || loggedInCustomerId

    let dbQuery = supabase
      .from('Jobs_Main')
      .select('*')
      .in('Job_Status', ['New', 'Requested', 'Assigned'])
      .is('Driver_ID', null)
    
    // Logic:
    // 1. Filter by customer if logged in as customer or selected customer filter
    if (finalCustomerId) {
        dbQuery = dbQuery.eq('Customer_ID', finalCustomerId)
    } 
    // 2. If a specific branch is selected (and not 'All'), filter by that branch
    if (providedBranchId && providedBranchId !== 'All' && providedBranchId !== 'Global') {
        dbQuery = dbQuery.eq('Branch_ID', providedBranchId)
    }
    // 3. Otherwise (Super Admin / Staff viewing 'All'), show everything!

    const { data, error } = await dbQuery
      .order('Created_At', { ascending: false })
      .limit(50) 
    
    if (error) {
        console.error('[DEBUG] getMarketplaceJobs Error:', error)
        return []
    }
    
    return data || []
  } catch (err) {
    console.error('[DEBUG] getMarketplaceJobs Exception:', err)
    return []
  }
}

// ดึงการขอรถที่รอดำเนินการ (Requested) ทั้งหมด โดยไม่จำกัดวันที่
export async function getRequestedJobs(providedBranchId?: string): Promise<Job[]> {
    try {
        const isSuper = await isSuperAdmin()
        const supabase = createAdminClient()
        const userBranchId = await getUserBranchId()
        const customerId = await getCustomerId()
        const branchId = providedBranchId && providedBranchId !== 'All' ? providedBranchId : userBranchId

        let dbQuery = supabase
            .from('Jobs_Main')
            .select('*')
            .eq('Job_Status', 'Requested')
        
        if (customerId) {
            dbQuery = dbQuery.eq('Customer_ID', customerId)
        } else if (isSuper && (!branchId || branchId === 'All')) {
            // No filter
        } else if (branchId && branchId !== 'All') {
            dbQuery = dbQuery.eq('Branch_ID', branchId)
        } else if (!isSuper && !branchId) {
            return []
        }

        const { data, error } = await dbQuery.order('Created_At', { ascending: false })

        if (error) {
            console.error('[DEBUG] getRequestedJobs select error:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            })
            return []
        }

        if (!data) {
            return []
        }

        // Map column name Branch_ID to type field branch_id for frontend consistency
        const mappedData = data.map((job: Partial<Job> & { branch_id?: string }) => ({
            ...job,
            branch_id: job.Branch_ID || job.branch_id
        }))

        if (mappedData.length > 0) {
            console.log('[DEBUG] getRequestedJobs sample job (first item):', JSON.stringify(mappedData[0], null, 2))
        }

        return mappedData as Job[]
    } catch {
        return []
    }
}

export async function getAllVehiclePlates() {
    try {
        const supabase = await createAdminClient();
        const { data } = await supabase
            .from('Master_Vehicles')
            .select('Vehicle_Plate')
            .not('Vehicle_Plate', 'is', null)
            .order('Vehicle_Plate', { ascending: true });
        
        return Array.from(new Set((data || []).map((v: { Vehicle_Plate: string }) => v.Vehicle_Plate)));
    } catch {
        return [];
    }
}

import { transitionBulkJobStatus } from "@/services/job-status-machine"

/**
 * ปรับปรุงสถานะงานจาก Draft เป็น New (เพื่อส่งงานให้คนขับ)
 */
export async function publishDraftJobs(date: string, branchId?: string) {
    try {
        const supabase = await createAdminClient()
        
        // 1. Identify which jobs to update first (to get their IDs and for notifications)
        let findQuery = supabase
            .from('Jobs_Main')
            .select('Job_ID, Driver_ID, Customer_Name')
            .eq('Job_Status', 'Draft')
            .eq('Plan_Date', date)
        
        if (branchId && branchId !== 'All') {
            findQuery = findQuery.eq('Branch_ID', branchId)
        }
        
        const { data: jobsToUpdate, error: fetchError } = await findQuery
        
        if (fetchError || !jobsToUpdate || jobsToUpdate.length === 0) {
            return { success: true, jobs: [] }
        }

        const jobIds = jobsToUpdate.map(j => j.Job_ID)

        // 2. Perform bulk transition using machine
        const result = await transitionBulkJobStatus(jobIds, 'New', {
            reason: 'Publishing draft jobs from planning'
        })

        return { 
            success: result.success, 
            error: result.error ? { message: result.error } : null, 
            jobs: jobsToUpdate
        }
    } catch (e) {
        console.error('[Jobs] publishDraftJobs error:', e)
        return { success: false, error: { message: e instanceof Error ? e.message : 'Unknown exception' } }
    }
}
