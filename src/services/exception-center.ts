"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getUserBranchId } from "@/lib/permissions"

export interface OperationalException {
    id: string
    type: 'SOS_JOB' | 'FAILED_JOB' | 'FLEET_ALERT' | 'REPAIR_TICKET'
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM'
    title: string
    description: string
    timestamp: string
    entityId: string // Job_ID, Alert_ID, or Ticket_ID
    entityName: string // Driver Name, Vehicle Plate, etc.
    branchId: string
    meta?: any
}

export async function getActiveExceptions(branchId?: string): Promise<OperationalException[]> {
    const supabase = createAdminClient()
    const sessionBranchId = await getUserBranchId()
    const targetBranchId = branchId && branchId !== 'All' ? branchId : sessionBranchId
    const exceptions: OperationalException[] = []

    // 1. Fetch SOS and Failed Jobs
    let jobsQuery = supabase
        .from('Jobs_Main')
        .select('Job_ID, Job_Status, Driver_Name, Vehicle_Plate, Failed_Reason, Failed_Time, Notes, Branch_ID')
        .in('Job_Status', ['SOS', 'Failed'])

    if (targetBranchId && targetBranchId !== 'All') {
        jobsQuery = jobsQuery.eq('Branch_ID', targetBranchId)
    }

    const { data: problemJobs } = await jobsQuery

    problemJobs?.forEach(job => {
        exceptions.push({
            id: `job-${job.Job_ID}`,
            type: job.Job_Status === 'SOS' ? 'SOS_JOB' : 'FAILED_JOB',
            severity: 'CRITICAL',
            title: job.Job_Status === 'SOS' ? '🚨 SOS Alert Triggered' : '❌ Job Failed',
            description: job.Failed_Reason || job.Notes || 'No reason provided',
            timestamp: job.Failed_Time || new Date().toISOString(),
            entityId: job.Job_ID,
            entityName: `${job.Driver_Name || 'Unknown'} (${job.Vehicle_Plate || 'No Vehicle'})`,
            branchId: job.Branch_ID || 'HQ',
            meta: { status: job.Job_Status }
        })
    })

    // 2. Fetch Active Fleet Alerts (e.g., Temp, Engine)
    let alertsQuery = supabase
        .from('Fleet_Intelligence_Alerts')
        .select('Alert_ID, Vehicle_Plate, Alert_Type, Message, Created_At, master_vehicles!inner(branch_id)')
        .eq('Status', 'ACTIVE')

    if (targetBranchId && targetBranchId !== 'All') {
        alertsQuery = alertsQuery.eq('master_vehicles.branch_id', targetBranchId)
    }

    const { data: fleetAlerts } = await alertsQuery

    fleetAlerts?.forEach((alert: any) => {
        exceptions.push({
            id: `alert-${alert.Alert_ID}`,
            type: 'FLEET_ALERT',
            severity: alert.Alert_Type === 'TEMPERATURE' ? 'CRITICAL' : 'HIGH',
            title: `⚠️ Fleet Alert: ${alert.Alert_Type}`,
            description: alert.Message || 'System detected an anomaly',
            timestamp: alert.Created_At,
            entityId: alert.Alert_ID,
            entityName: alert.Vehicle_Plate || 'Unknown Vehicle',
            branchId: alert.master_vehicles?.branch_id || 'HQ',
            meta: { alertType: alert.Alert_Type }
        })
    })

    // 3. Fetch Active Repair Tickets
    let ticketsQuery = supabase
        .from('Repair_Tickets')
        .select('Ticket_ID, Vehicle_Plate, Issue_Description, Status, Created_At, Branch_ID')
        .in('Status', ['Pending', 'In Progress'])

    if (targetBranchId && targetBranchId !== 'All') {
        ticketsQuery = ticketsQuery.eq('Branch_ID', targetBranchId)
    }

    const { data: repairTickets } = await ticketsQuery

    repairTickets?.forEach(ticket => {
        exceptions.push({
            id: `ticket-${ticket.Ticket_ID}`,
            type: 'REPAIR_TICKET',
            severity: 'MEDIUM',
            title: `🔧 Repair Needed (${ticket.Status})`,
            description: ticket.Issue_Description || 'Vehicle requires maintenance',
            timestamp: ticket.Created_At || new Date().toISOString(),
            entityId: ticket.Ticket_ID,
            entityName: ticket.Vehicle_Plate || 'Unknown Vehicle',
            branchId: ticket.Branch_ID || 'HQ',
            meta: { status: ticket.Status }
        })
    })

    // Sort by most recent first
    return exceptions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}
