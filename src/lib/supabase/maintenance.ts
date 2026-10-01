"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin } from "@/lib/permissions"
import { cookies } from 'next/headers'

export type RepairTicket = {
  Ticket_ID: string
  Date_Report: string | null
  Driver_ID: string | null
  Vehicle_Plate: string | null
  Issue_Type: string | null
  Description: string | null
  Photo_Url: string | null
  Status: string | null
  Approver: string | null
  Cost_Total: number | null
  Date_Finish: string | null
  Remark: string | null
  Odometer?: number | null
  Branch_ID?: string | null
  Driver_Name?: string
}

// ดึง Repair Tickets ทั้งหมด (pagination + search + filters)
export async function getAllRepairTickets(
  page = 1, 
  limit = 20, 
  query = '',
  startDate?: string,
  endDate?: string,
  status?: string
): Promise<{ data: RepairTicket[], count: number }> {
  try {
    const supabase = await createAdminClient()
    const offset = (page - 1) * limit
    
    // Filter by Branch
    const branchId = await getUserBranchId()
    const isAdmin = await isSuperAdmin()
    const cookieStore = await cookies()
    const selectedBranch = cookieStore.get('selectedBranch')?.value
    
    let dbQuery = supabase
      .from('Repair_Tickets')
      .select('*', { count: 'exact' })
    
    if (isAdmin) {
      if (selectedBranch && selectedBranch !== 'All') {
        dbQuery = dbQuery.eq('Branch_ID', selectedBranch)
      }
    } else if (branchId && branchId !== 'All') {
        dbQuery = dbQuery.eq('Branch_ID', branchId)
    } else if (!isAdmin && !branchId) {
        return { data: [], count: 0 }
    }

    dbQuery = dbQuery.order('Date_Report', { ascending: false })

    if (query) {
      dbQuery = dbQuery.or(`Ticket_ID.ilike.%${query}%,Vehicle_Plate.ilike.%${query}%`)
    }

    if (startDate) {
      dbQuery = dbQuery.gte('Date_Report', `${startDate}T00:00:00`)
    }

    if (endDate) {
      dbQuery = dbQuery.lte('Date_Report', `${endDate}T23:59:59`)
    }

    if (status && status !== 'All') {
      dbQuery = dbQuery.eq('Status', status)
    }

    const { data: rawData, error, count } = await dbQuery.range(offset, offset + limit - 1)
  
    if (error) {
      return { data: [], count: 0 }
    }

    // Repair_Tickets has no FK to Master_Drivers, so an embedded join fails
    // (PGRST200) and empties the list — look driver names up separately.
    const tickets = (rawData || []) as RepairTicket[]
    const driverIds = [...new Set(tickets.map(t => t.Driver_ID).filter((id): id is string => Boolean(id)))]
    const nameById = new Map<string, string>()
    if (driverIds.length > 0) {
      const { data: drivers } = await supabase
        .from('Master_Drivers')
        .select('Driver_ID, Driver_Name')
        .in('Driver_ID', driverIds)
      for (const d of (drivers || []) as { Driver_ID: string; Driver_Name: string | null }[]) {
        if (d.Driver_Name) nameById.set(String(d.Driver_ID), d.Driver_Name)
      }
    }
    const data = tickets.map(ticket => ({
      ...ticket,
      Driver_Name: (ticket.Driver_ID && nameById.get(String(ticket.Driver_ID))) || 'Unknown'
    }))
  
    return { data: data as RepairTicket[], count: count || 0 }
  } catch (_e) {
    return { data: [], count: 0 }
  }
}

// ดึง Tickets ที่รอดำเนินการ
export async function getPendingRepairTickets(): Promise<RepairTicket[]> {
  try {
    const supabase = await createClient()
    
    // Filter by Branch
    const branchId = await getUserBranchId()
    const isAdmin = await isSuperAdmin()
    
    let query = supabase
      .from('Repair_Tickets')
      .select('*')
      .in('Status', ['Pending', 'In Progress', 'รอดำเนินการ', 'กำลังซ่อม'])

    if (branchId && branchId !== 'All') {
        query = query.eq('Branch_ID', branchId)
    } else if (!isAdmin && !branchId) {
        return []
    }

    const { data, error } = await query
      .order('Date_Report', { ascending: false })
    
    if (error) {
      return []
    }
    
    return data || []
  } catch (_e) {
    return []
  }
}

// นับสถิติ Repair Tickets
export async function getRepairTicketStats() {
  try {
    const supabase = await createAdminClient()
    
    const branchId = await getUserBranchId()
    const isAdmin = await isSuperAdmin()
    const cookieStore = await cookies()
    const selectedBranch = cookieStore.get('selectedBranch')?.value
    
    let query = supabase.from('Repair_Tickets').select('Status')

    if (isAdmin) {
      if (selectedBranch && selectedBranch !== 'All') {
        query = query.eq('Branch_ID', selectedBranch)
      }
    } else if (branchId && branchId !== 'All') {
        query = query.eq('Branch_ID', branchId)
    } else if (!isAdmin && !branchId) {
        return { total: 0, pending: 0, inProgress: 0, completed: 0 }
    }

    const { data, error } = await query
    
    if (error) {
      return { total: 0, pending: 0, inProgress: 0, completed: 0 }
    }
    
    const tickets = data || []
    return {
      total: tickets.length,
      pending: tickets.filter((t: { Status: string }) => t.Status === 'Pending' || t.Status === 'รอการตรวจสอบ').length,
      inProgress: tickets.filter((t: { Status: string }) => t.Status === 'In Progress' || t.Status === 'กำลังซ่อม').length,
      completed: tickets.filter((t: { Status: string }) => t.Status === 'Completed' || t.Status === 'ซ่อมเสร็จ').length,
    }
  } catch (_e) {
    return { total: 0, pending: 0, inProgress: 0, completed: 0 }
  }
}
