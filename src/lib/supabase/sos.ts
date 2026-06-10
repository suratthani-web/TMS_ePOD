"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin } from "@/lib/permissions"

export type SOSAlert = {
  Job_ID: string
  Job_Status: string
  Plan_Date: string | null
  Driver_ID: string | null
  Driver_Name: string | null
  Vehicle_Plate: string | null
  Route_Name: string | null
  Failed_Reason: string | null
  Failed_Time: string | null
  Delivery_Lat: number | null
  Delivery_Lon: number | null
}

// ดึง SOS Alerts ที่ Active
export async function getActiveSOSAlerts(): Promise<SOSAlert[]> {
  try {
    const isAdmin = await isSuperAdmin()
    const supabase = isAdmin ? createAdminClient() : await createClient()
    
    const branchId = await getUserBranchId()

    let dbQuery = supabase
      .from('Jobs_Main')
      .select('Job_ID, Job_Status, Plan_Date, Driver_ID, Driver_Name, Vehicle_Plate, Route_Name, Failed_Reason, Failed_Time, Delivery_Lat, Delivery_Lon')
      .eq('Job_Status', 'SOS')
    
    // STRICT ISOLATION
    if (!isAdmin) {
        if (branchId && branchId !== 'All') {
            dbQuery = dbQuery.eq('Branch_ID', branchId)
        } else {
            return []
        }
    } else if (branchId && branchId !== 'All') {
        dbQuery = dbQuery.eq('Branch_ID', branchId)
    }

    const { data, error } = await dbQuery
      .order('Failed_Time', { ascending: false })
    
    if (error) {
      return []
    }
    
    return data || []
  } catch (e) {
    return []
  }
}

// ดึง SOS ทั้งหมด (รวม resolved)
export async function getAllSOSAlerts(): Promise<SOSAlert[]> {
  try {
    const isAdmin = await isSuperAdmin()
    const supabase = isAdmin ? createAdminClient() : await createClient()
    
    const branchId = await getUserBranchId()

    let dbQuery = supabase
      .from('Jobs_Main')
      .select('Job_ID, Job_Status, Plan_Date, Driver_ID, Driver_Name, Vehicle_Plate, Route_Name, Failed_Reason, Failed_Time, Delivery_Lat, Delivery_Lon')
      .in('Job_Status', ['SOS', 'Failed', 'Completed', 'Delivered'])
      .not('Failed_Time', 'is', null)
    
    // STRICT ISOLATION
    if (!isAdmin) {
        if (branchId && branchId !== 'All') {
            dbQuery = dbQuery.eq('Branch_ID', branchId)
        } else {
            return []
        }
    } else if (branchId && branchId !== 'All') {
        dbQuery = dbQuery.eq('Branch_ID', branchId)
    }

    const { data, error } = await dbQuery
      .order('Failed_Time', { ascending: false })
      .limit(50)
    
    if (error) {
      return []
    }
    
    return data || []
  } catch (e) {
    return []
  }
}

// นับ SOS Active
export async function getSOSCount(): Promise<number> {
  try {
    const isAdmin = await isSuperAdmin()
    const supabase = isAdmin ? createAdminClient() : await createClient()
    
    const branchId = await getUserBranchId()

    let dbQuery = supabase
      .from('Jobs_Main')
      .select('*', { count: 'exact', head: true })
      .eq('Job_Status', 'SOS')
    
    // STRICT ISOLATION
    if (!isAdmin) {
        if (branchId && branchId !== 'All') {
            dbQuery = dbQuery.eq('Branch_ID', branchId)
        } else {
            return 0
        }
    } else if (branchId && branchId !== 'All') {
        dbQuery = dbQuery.eq('Branch_ID', branchId)
    }

    const { count, error } = await dbQuery
    
    if (error) {
      return 0
    }
    
    return count || 0
  } catch {
    return 0
  }
}

// ดึง SOS Driver IDs ที่ Active
export async function getSOSDriverIds(customerId?: string | null): Promise<string[]> {
  try {
    const isAdmin = await isSuperAdmin()
    const supabase = isAdmin ? createAdminClient() : await createClient()
    
    const branchId = await getUserBranchId()

    let dbQuery = supabase
      .from('Jobs_Main')
      .select('Driver_ID')
      .eq('Job_Status', 'SOS')
    
    if (customerId) {
        dbQuery = dbQuery.eq('Customer_ID', customerId)
    }
    
    // STRICT ISOLATION
    if (!isAdmin) {
        if (branchId && branchId !== 'All') {
            dbQuery = dbQuery.eq('Branch_ID', branchId)
        } else {
            return []
        }
    } else if (branchId && branchId !== 'All') {
        dbQuery = dbQuery.eq('Branch_ID', branchId)
    }

    const { data, error } = await dbQuery
    
    if (error) {
      return []
    }
    
    return (data || [])
      .map((item: { Driver_ID?: string | null }) => item.Driver_ID)
      .filter((id: string | null | undefined): id is string => Boolean(id))
  } catch {
    return []
  }
}
