"use server"

import { createClient } from '@/utils/supabase/server'

export interface DamageReport {
  id: string
  Job_ID: string
  Driver_ID: string
  Driver_Name: string | null
  Vehicle_Plate: string | null
  Incident_Date: string
  Reason_Category: string
  Description: string | null
  Image_Path: string | null
  Status: string
  Resolved_By: string | null
  Created_At: string
}

export async function getDamageReports(): Promise<DamageReport[]> {
  const supabase = await createClient()
  // Just fetch latest 100 for simplicity in admin view
  try {
    const { data, error } = await supabase
      .from('Damage_Reports')
      .select('*')
      .order('Created_At', { ascending: false })
      .limit(100)

    if (error) return []
    return (data || []) as DamageReport[]
  } catch {
    return []
  }
}

export async function getMyDamageReports(driverId: string): Promise<DamageReport[]> {
  const supabase = await createClient()
  try {
    const { data, error } = await supabase
      .from('Damage_Reports')
      .select('*')
      .eq('Driver_ID', driverId)
      .order('Created_At', { ascending: false })
      .limit(50)

    if (error) return []
    return (data || []) as DamageReport[]
  } catch {
    return []
  }
}

export async function createDamageReport(data: {
  Job_ID: string
  Driver_ID: string
  Driver_Name: string
  Vehicle_Plate?: string
  Incident_Date: string
  Reason_Category: string
  Description?: string
  Image_Path?: string
  Image_Base64?: string
}) {
  const supabase = await createClient()
  try {
    const { error } = await supabase.from('Damage_Reports').insert({
      Job_ID: data.Job_ID,
      Driver_ID: data.Driver_ID,
      Driver_Name: data.Driver_Name,
      Vehicle_Plate: data.Vehicle_Plate || null,
      Incident_Date: data.Incident_Date,
      Reason_Category: data.Reason_Category,
      Description: data.Description || null,
      Image_Path: data.Image_Path || null,
      Status: 'Pending',
    })
    if (error) return { success: false, error: error.message }

    // Trigger Admin Alert (Push & Toast)
    try {
        const { sendPushToAdmins } = await import('@/lib/actions/push-actions')
        const { createAdminClient } = await import('@/utils/supabase/server')
        const adminSupabase = createAdminClient()
        
        // Fetch driver's branch for filtering
        const { data: driver } = await adminSupabase
            .from('Master_Drivers')
            .select('Branch_ID')
            .eq('Driver_ID', data.Driver_ID)
            .single()

        // 1. Send Push Notification
        await sendPushToAdmins({
            title: `📦❌ แจ้งสินค้าเสียหาย`,
            body: `คนขับ: ${data.Driver_Name} แจ้งเหตุ: ${data.Reason_Category}`,
            url: '/reports',
            type: 'standard'
        }, driver?.Branch_ID)

        // 2. Log Activity (This also populates the Admin Bell Icon via getNotifications)
        const { logActivity } = await import('@/lib/supabase/logs')
        await logActivity({
          module: 'Reports',
          action_type: 'CREATE',
          target_id: data.Driver_ID,
          branch_id: driver?.Branch_ID,
          details: {
            alert_type: 'DAMAGE',
            driver_name: data.Driver_Name,
            reason: data.Reason_Category,
            message: `คนขับ: ${data.Driver_Name} แจ้งเหตุ: ${data.Reason_Category}`
          }
        })

    } catch (e) {
        console.error("Notification broadcast failed:", e)
    }

    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}

export async function updateDamageReportStatus(reportId: string, status: 'Reviewing' | 'Resolved' | 'Rejected', resolvedBy: string) {
  const supabase = await createClient()
  try {
    const { error } = await supabase
      .from('Damage_Reports')
      .update({ Status: status, Resolved_By: resolvedBy, Updated_At: new Date().toISOString() })
      .eq('id', reportId)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: String(e) }
  }
}
