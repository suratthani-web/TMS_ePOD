'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getUserBranchId } from '@/lib/permissions'
import { createNotification } from '@/lib/actions/notification-actions'
import { logActivity } from '@/lib/supabase/logs'
import { analyzeMaintenanceLog } from '@/lib/actions/fleet-intelligence-actions'

export type TicketFormData = {
  Date_Report: string | null
  Driver_ID: string | null
  Vehicle_Plate: string | null
  Issue_Type: string | null
  Description: string | null
  Priority: string | null
  Odometer?: number | null
  Photo_Url?: string | null
  Cost_Total?: number | null
}

export async function createRepairTicket(data: TicketFormData) {
  try {
    const supabase = createAdminClient()
    const branchId = await getUserBranchId()

    const ticketId = `TCK-${Date.now()}-${Math.floor(Math.random() * 1000)}`

    const { error } = await supabase
      .from('Repair_Tickets')
      .insert({
        Ticket_ID: ticketId,
        Date_Report: data.Date_Report,
        Driver_ID: data.Driver_ID,
        Vehicle_Plate: data.Vehicle_Plate,
        Issue_Type: data.Issue_Type,
        Description: `[Priority: ${data.Priority}] ${data.Odometer ? '[Odo: ' + data.Odometer + '] ' : ''}${data.Description}`,
        Photo_Url: data.Photo_Url || null,
        Cost_Total: Number(data.Cost_Total) || 0,
        Status: 'Pending',
        Branch_ID: branchId === 'All' ? null : branchId
      })

    if (error) {
      return { success: false, message: `Failed to create ticket: ${error.message}` }
    }

    // Trigger Admin Alert (Push & Toast)
    try {
        const { sendPushToAdmins } = await import('@/lib/actions/push-actions')
        await sendPushToAdmins({
            title: `🔧 แจ้งซ่อมใหม่ (${data.Priority})`,
            body: `ทะเบียน: ${data.Vehicle_Plate} • อาการ: ${data.Issue_Type}`,
            url: '/maintenance',
            type: 'standard'
        }, branchId)
    } catch (e) {
        console.error("Push broadcast failed:", e)
    }

    // Update vehicle status to Maintenance if priority is High
    if (data.Priority === 'High') {
        await supabase
          .from('Master_Vehicles')
          .update({ Active_Status: 'Maintenance' })
          .eq('Vehicle_Plate', data.Vehicle_Plate)
    }

    revalidatePath('/maintenance')
    revalidatePath('/vehicles')

    // Notify Admin
    await createNotification({
      Driver_ID: 'admin',
      Title: 'มีการแจ้งซ่อมใหม่',
      Message: `แจ้งซ่อมรถทะเบียน ${data.Vehicle_Plate} โดยคนขับ [ID: ${data.Driver_ID}]`,
      Type: 'warning'
    })

    // Log the activity
    await logActivity({
      module: 'Maintenance',
      action_type: 'CREATE',
      target_id: ticketId,
      details: {
        driver: data.Driver_ID,
        vehicle: data.Vehicle_Plate,
        priority: data.Priority
      }
    })

    return { success: true, message: 'Ticket created successfully' }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Internal Server Error"
    return { success: false, message: errMsg }
  }
}

export type TicketUpdateData = TicketFormData & {
  Status?: string | null
  Cost_Total?: number | null
  Remark?: string | null
  Date_Finish?: string | null
  Branch_ID?: string | null
}

export async function updateRepairTicket(ticketId: string, data: TicketUpdateData) {
  const supabase = createAdminClient()
  
  // Explicitly parse Cost_Total to ensure it's a number and not NaN
  const costTotal = data.Cost_Total !== undefined ? (parseFloat(String(data.Cost_Total)) || 0) : undefined

  console.log(`[MAINTENANCE] Updating Ticket ${ticketId}:`, { status: data.Status, cost: costTotal })

  const { error, data: updatedData } = await supabase
    .from('Repair_Tickets')
    .update({
      Status: data.Status,
      Cost_Total: costTotal,
      Remark: data.Remark || null,
      Date_Finish: data.Date_Finish || null,
      // Allow updating basic info too if needed
      Issue_Type: data.Issue_Type,
      Description: data.Description,
      Driver_ID: data.Driver_ID || null,
      Vehicle_Plate: data.Vehicle_Plate || null,
      Date_Report: data.Date_Report,
      Branch_ID: data.Branch_ID || undefined
    })
    .eq('Ticket_ID', ticketId)
    .select()

if (error) {
  return { success: false, message: `Failed to update ticket: ${error.message}` }
}

if (updatedData && updatedData.length > 0) {
    const ticket = updatedData[0]
    if (ticket.Driver_ID && ticket.Vehicle_Plate) {
        const { notifyMaintenanceApproval } = await import('@/lib/actions/push-actions')
        try {
            await notifyMaintenanceApproval(ticket.Driver_ID, ticket.Status, ticket.Vehicle_Plate)
        } catch (e) {
            console.error("Failed to push maintenance notification:", e)
        }
    }
}

// Trigger Intelligence Analysis if Completed
if (data.Status === 'Completed') {
    analyzeMaintenanceLog(ticketId).catch(err => console.error("Maint analysis failed:", err))
}

// If status is Completed, check if we need to release vehicle? 
  // For now, let's just update the ticket. 
  // Ideally, if finished, Vehicle Status might need to go back to 'Active'.
  if (data.Status === 'Completed' && data.Vehicle_Plate) {
     await supabase
        .from('Master_Vehicles')
        .update({ Active_Status: 'Active' })
        .eq('Vehicle_Plate', data.Vehicle_Plate)
  }

  revalidatePath('/maintenance')

  // Log the activity
  await logActivity({
    module: 'Maintenance',
    action_type: 'APPROVE', // Using APPROVE for status changes
    target_id: ticketId,
    details: {
      new_status: data.Status,
      cost: data.Cost_Total
    }
  })

  return { success: true, message: 'Ticket updated successfully' }
}

export async function deleteRepairTicket(ticketId: string) {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('Repair_Tickets')
    .delete()
    .eq('Ticket_ID', ticketId)

  if (error) {
    return { success: false, message: 'Failed to delete ticket' }
  }

  revalidatePath('/maintenance')

  // Log the activity
  await logActivity({
    module: 'Maintenance',
    action_type: 'DELETE',
    target_id: ticketId,
    details: {
      description: `Deleted repair ticket ${ticketId}`
    }
  })

  return { success: true, message: 'Ticket deleted successfully' }
}
