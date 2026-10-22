'use server'

import crypto from 'crypto'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getUserBranchId } from '@/lib/permissions'
import { logActivity } from '@/lib/supabase/logs'
import { analyzeFuelLog } from '@/lib/actions/fleet-intelligence-actions'
import { scheduleFuelCycleSync } from '@/lib/fuel/fuel-cycles'

export type FuelFormData = {
  Date_Time: string | null
  Driver_ID: string | null
  Vehicle_Plate: string | null
  Liter: number
  Price: number
  Total_Amount: number
  Mileage: number | null
  Station_Name: string | null
  Photo_Url?: string | null
}

export async function createFuelLog(data: FuelFormData) {
  try {
    const supabase = createAdminClient()
    const branchId = await getUserBranchId()

    // Support for both crypto.randomUUID and a simple fallback if needed
    let logId: string;
    try {
        logId = crypto.randomUUID();
    } catch {
        logId = `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    }

    let resolvedBranch = branchId === 'All' ? null : branchId
    if (!resolvedBranch && data.Vehicle_Plate) {
      const { data: veh } = await supabase
        .from('Master_Vehicles')
        .select('Branch_ID')
        .eq('Vehicle_Plate', data.Vehicle_Plate)
        .maybeSingle()
      if (veh?.Branch_ID) {
        resolvedBranch = veh.Branch_ID
      }
    }

    const insertData = {
        Log_ID: logId,
        Date_Time: data.Date_Time,
        Driver_ID: data.Driver_ID,
        Vehicle_Plate: data.Vehicle_Plate,
        Liters: data.Liter,
        Price_Total: data.Total_Amount,
        Odometer: data.Mileage,
        Station_Name: data.Station_Name,
        Photo_Url: data.Photo_Url || null,
        Branch_ID: resolvedBranch
    };


    const { error } = await supabase
      .from('Fuel_Logs')
      .insert(insertData)

    if (error) {
      return { success: false, message: `Failed to create log: ${error.message}` }
    }

    // Keep the vehicle's live odometer fresh from each fuel entry (drivers already
    // enter it), so tire lifespan / next-service / reminders stay accurate without
    // manual updates. Only ever move the odometer forward.
    if (data.Vehicle_Plate && data.Mileage && data.Mileage > 0) {
      try {
        const { data: veh } = await supabase
          .from('Master_Vehicles')
          .select('Current_Mileage')
          .eq('Vehicle_Plate', data.Vehicle_Plate)
          .maybeSingle()
        const current = Number(veh?.Current_Mileage) || 0
        if (data.Mileage > current) {
          await supabase
            .from('Master_Vehicles')
            .update({ Current_Mileage: Math.round(data.Mileage) })
            .eq('Vehicle_Plate', data.Vehicle_Plate)
        }
      } catch (e) {
        console.error('[Fuel] Odometer sync failed:', e)
      }
    }

    // Trigger Intelligence Analysis
    analyzeFuelLog(logId).catch(err => console.error("Fuel analysis failed:", err))

    // Trigger Admin Alert (Push & Toast)
    try {
        const { sendPushToAdmins } = await import('@/lib/actions/push-actions')
        await sendPushToAdmins({
            title: '⛽ แจ้งเติมน้ำมันใหม่',
            body: `ทะเบียน: ${data.Vehicle_Plate} • จำนวน: ${data.Liter} ลิตร`,
            url: '/fuel',
            type: 'standard'
        }, branchId)
    } catch (e) {
        console.error("Notification broadcast failed:", e)
    }

    // Log the activity (This also populates the Admin Bell Icon via getNotifications)
    await logActivity({
      module: 'Fuel',
      action_type: 'CREATE',
      target_id: logId,
      branch_id: branchId === 'All' ? undefined : branchId,
      details: {
        alert_type: 'FUEL',
        vehicle: data.Vehicle_Plate,
        amount: data.Liter,
        message: `ทะเบียน: ${data.Vehicle_Plate} • จำนวน: ${data.Liter} ลิตร`
      }
    })

    scheduleFuelCycleSync()
    revalidatePath('/fuel')
    return { success: true, message: 'Fuel Log created successfully' }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Internal Server Error"
    return { success: false, message: errMsg }
  }
}

export async function updateFuelLog(logId: string, data: FuelFormData) {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('Fuel_Logs')
    .update({
      Date_Time: data.Date_Time,
      Driver_ID: data.Driver_ID,
      Vehicle_Plate: data.Vehicle_Plate,
      Liters: data.Liter,
      Price_Total: data.Total_Amount,
      Odometer: data.Mileage,
      Station_Name: data.Station_Name,
      Photo_Url: data.Photo_Url || null
    })
    .eq('Log_ID', logId)

  if (error) {
    return { success: false, message: 'Failed to update log' }
  }

  // Trigger Intelligence Analysis
  analyzeFuelLog(logId).catch(err => console.error("Fuel analysis failed:", err))

  // Log the activity
  await logActivity({
    module: 'Fuel',
    action_type: 'UPDATE',
    target_id: logId,
    details: {
      updated_fields: Object.keys(data),
      amount: data.Total_Amount
    }
  })

  scheduleFuelCycleSync()
  revalidatePath('/fuel')
  return { success: true, message: 'Fuel Log updated successfully' }
}

export async function updateFuelLogStatus(logId: string, status: string) {
  const supabase = createAdminClient()

  const { error, data } = await supabase
    .from('Fuel_Logs')
    .update({ Status: status })
    .eq('Log_ID', logId)
    .select()

  if (error) {
    return { success: false, message: 'Failed to update status' }
  }

  if (data && data.length > 0) {
      const log = data[0]
      if (log.Driver_ID) {
          const { notifyFuelApproval } = await import('@/lib/actions/push-actions')
          try {
              await notifyFuelApproval(log.Driver_ID, log.Status, log.Liters || 0)
          } catch (e) {
              console.error("Failed to push fuel notification:", e)
          }
      }
  }

  // Log the activity
  await logActivity({
    module: 'Fuel',
    action_type: 'APPROVE', // Using APPROVE for status changes as requested
    target_id: logId,
    details: {
      new_status: status
    }
  })

  scheduleFuelCycleSync()
  revalidatePath('/fuel')
  return { success: true, message: 'Status updated successfully' }
}

/** Admin links an end fill to the job(s) it closes ([] = back to auto-match). Stored comma-separated. */
export async function setFuelLogClosingJob(logId: string, jobIds: string[]) {
  const ids = Array.from(new Set(jobIds.map(j => j.trim()).filter(Boolean)))
  const value = ids.length ? ids.join(',') : null
  const { isAdmin } = await import('@/lib/permissions')
  if (!(await isAdmin())) return { success: false, message: 'ไม่มีสิทธิ์' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('Fuel_Logs')
    .update({ Closes_Job_ID: value })
    .eq('Log_ID', logId)

  if (error) {
    const missing = /Closes_Job_ID|schema cache|column/i.test(error.message || '')
    return { success: false, message: missing ? 'ยังไม่ได้รัน SQL 20261022_fuel_closes_job.sql' : 'บันทึกไม่สำเร็จ' }
  }

  await logActivity({
    module: 'Fuel',
    action_type: 'UPDATE',
    target_id: logId,
    details: { closes_job: value || 'auto' }
  })

  scheduleFuelCycleSync()
  revalidatePath('/fuel')
  revalidatePath('/reports/cost-per-trip')
  return { success: true, message: ids.length ? `ผูกกับ ${ids.length} งานแล้ว` : 'กลับเป็นให้ระบบเลือกเอง' }
}

/** Jobs an end fill could close: same truck, Plan_Date within 14 days up to the fill. */
export async function getFuelClosingCandidates(logs: { Vehicle_Plate?: string | null; Date_Time?: string | null }[]) {
  const plates = Array.from(new Set(logs.map(l => l.Vehicle_Plate).filter(Boolean))) as string[]
  const dates = logs.map(l => (l.Date_Time || '').slice(0, 10)).filter(Boolean).sort()
  if (!plates.length || !dates.length) return [] as FuelClosingCandidate[]

  const from = new Date(Date.parse(dates[0]) - 14 * 864e5).toISOString().slice(0, 10)
  const { FUEL_RUN_STATUSES } = await import('@/lib/fuel/bill-allocation')
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('Jobs_Main')
    .select('Job_ID, Plan_Date, Vehicle_Plate, Customer_Name, Dest_Location, Est_Distance_KM')
    .in('Vehicle_Plate', plates)
    .in('Job_Status', FUEL_RUN_STATUSES)
    .gte('Plan_Date', from)
    .lte('Plan_Date', dates[dates.length - 1])
    .order('Plan_Date', { ascending: false })
  return (data || []) as FuelClosingCandidate[]
}

export type FuelClosingCandidate = {
  Job_ID: string
  Plan_Date: string | null
  Vehicle_Plate: string | null
  Customer_Name: string | null
  Dest_Location: string | null
  Est_Distance_KM: number | null
}

export async function deleteFuelLog(logId: string) {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('Fuel_Logs')
    .delete()
    .eq('Log_ID', logId)

  if (error) {
    return { success: false, message: 'Failed to delete log' }
  }

  scheduleFuelCycleSync()
  revalidatePath('/fuel')
  return { success: true, message: 'Fuel Log deleted successfully' }
}

/** Admin review of an abnormal fuel cycle. ok = explained (stays history), confirmed_issue = real problem (left out of baselines), null = clear. */
export async function reviewFuelCycle(cycleId: string, review: 'ok' | 'confirmed_issue' | null, note?: string) {
  const { isAdmin } = await import('@/lib/permissions')
  if (!(await isAdmin())) return { success: false, message: 'ไม่มีสิทธิ์' }
  if (review && review !== 'ok' && review !== 'confirmed_issue') return { success: false, message: 'ค่าไม่ถูกต้อง' }

  const { getSession } = await import('@/lib/session')
  const session = await getSession().catch(() => null)
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('Fuel_Cycles')
    .update({
      Review_Status: review,
      Review_Note: review ? (note || '').trim().slice(0, 500) || null : null,
      Reviewed_By: review ? (session?.username || session?.userId || null) : null,
      Reviewed_At: review ? new Date().toISOString() : null,
    })
    .eq('Cycle_ID', cycleId)

  if (error) {
    const missing = /Fuel_Cycles|schema cache|relation/i.test(error.message || '')
    return { success: false, message: missing ? 'ยังไม่ได้รัน SQL 20261022_fuel_cycles.sql' : 'บันทึกไม่สำเร็จ' }
  }

  await logActivity({ module: 'Fuel', action_type: 'UPDATE', target_id: cycleId, details: { fuel_cycle_review: review || 'cleared', note: note || null } })

  // confirmed issues leave the baselines → other cycles' verdicts may change
  scheduleFuelCycleSync()
  revalidatePath('/fuel')
  revalidatePath('/reports/cost-per-trip')
  return { success: true, message: review === 'ok' ? 'บันทึกว่าปกติ (มีเหตุผล) แล้ว' : review === 'confirmed_issue' ? 'บันทึกว่าผิดปกติจริงแล้ว' : 'ล้างการตรวจแล้ว' }
}
