'use server'

import crypto from 'crypto'

import { createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { uploadFileToSupabase } from '@/lib/actions/supabase-upload'
import { createNotification } from '@/lib/actions/notification-actions'

export async function submitVehicleCheck(formData: FormData) {
  try {
    const driverId = formData.get("driverId") as string
    const driverName = formData.get("driverName") as string
    const vehiclePlate = formData.get("vehiclePlate") as string
    
    // Rate Limit: 3 submissions per minute per driver
    const { success } = await checkRateLimit(`vehicle_check_${driverId}`, 3, 60000)
    if (!success) {
      return { success: false, message: "คุณส่งข้อมูลบ่อยเกินไป กรุณารอ 1 นาที" }
    }

    const supabase = createAdminClient()
    const timestamp = Date.now()
    const logId = crypto.randomUUID()
    const itemsRaw = formData.get("items") as string
    
    
    let items = {}
    if (itemsRaw) {
        try {
            items = JSON.parse(itemsRaw)
        } catch {
            // Failed to parse
        }
    }

    // Helper for Upload
    const uploadWithRename = async (file: File, name: string, folder: string) => {
      try {
        const buffer = Buffer.from(await file.arrayBuffer())
        const res = await uploadFileToSupabase(buffer, name, file.type, folder)
        return res.directLink
      } catch (err: unknown) {
        throw err 
      }
    }

    // 1. Process media
    const photoUrls: string[] = []
    const failures: string[] = []
    
    // 0. Check Report (Smart Document)
    const checkReportFile = formData.get("check_report") as File
    let checkReportUrl = null
    if (checkReportFile && checkReportFile.size > 0) {
      try {
        const name = `${driverId}_check_REPORT_${timestamp}.jpg`
        checkReportUrl = await uploadWithRename(checkReportFile, name, 'Vehicle_Check_Documents')
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error'
        failures.push(`รายงาน (${msg})`)
      }
    }

    const photoCount = parseInt(formData.get("photo_count") as string || "0")
    
    for (let i = 0; i < photoCount; i++) {
      const file = formData.get(`photo_${i}`) as File
      if (file && file.size > 0) {
        try {
          const name = `${driverId}_check_${timestamp}_${i}.jpg`
          const url = await uploadWithRename(file, name, 'Vehicle_Checks')
          
          if (url) {
            photoUrls.push(url)
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Error'
          failures.push(`รูปถ่าย ${i + 1} (${msg})`)
        }
      }
    }

    if (checkReportUrl) {
      photoUrls.unshift(checkReportUrl)
    }


    const signatureFile = formData.get("signature") as File
    let signatureUrl = null
    if (signatureFile && signatureFile.size > 0) {
      try {
        const name = `${driverId}_check_sig_${timestamp}.png`
        signatureUrl = await uploadWithRename(signatureFile, name, 'Vehicle_Check_Signatures')
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error'
        failures.push(`ลายเซ็น (${msg})`)
      }
    }

    // Diagnostics: Warn if no photos/signatures but expected

    // 2. Insert to DB
    const { error } = await supabase
      .from('Vehicle_Checks')
      .insert({
        Driver_ID: driverId,
        Driver_Name: driverName,
        Vehicle_Plate: vehiclePlate,
        Check_Date: new Date().toISOString(),
        Passed_Items: items,
        Photo_Urls: photoUrls.join(','),
        Signature_Url: signatureUrl
      })

    if (error) {
      return { success: false, message: `บันทึกไม่สำเร็จ (DB Error): ${error.message}` }
    }

    // Trigger Admin Alert (Push & Toast)
    try {
        // Find failure items
        const rawItems = items as Record<string, boolean>
        const hasFailures = Object.values(rawItems).some(passed => passed === false)

        if (hasFailures) {
            const { sendPushToAdmins } = await import('@/lib/actions/push-actions')
            
            // Fetch driver's branch
            const { data: driver } = await supabase
                .from('Master_Drivers')
                .select('Branch_ID')
                .eq('Driver_ID', driverId)
                .single()

            await sendPushToAdmins({
                title: `📋 ตรวจรถไม่ผ่าน: ${vehiclePlate}`,
                body: `คนขับ: ${driverName} ตรวจสภาพไม่ผ่านบางรายการ`,
                url: '/admin/vehicle-checks',
                type: 'standard'
            }, driver?.Branch_ID)
        }
    } catch (e) {
        console.error("Push broadcast failed:", e)
    }

    const failureMsg = failures.length > 0 ? `\n(แต่บางไฟล์อัปโหลดไม่สำเร็จ: ${failures.join(", ")})` : ""
    const finalMsg = `บันทึกการตรวจสอบเรียบร้อยแล้ว${failureMsg}`

    revalidatePath('/mobile/vehicle-check')
    revalidatePath('/admin/vehicle-checks')

    return { success: true, message: finalMsg }

  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Internal Server Error" }
  }
}

/**
 * งานของคนขับที่ "ยังต้องทำ" วันนี้ — ใช้เตือนเป็นระยะในแอป
 *  - notStarted: จ่ายงานแล้วแต่ยังไม่กดรับ/เริ่ม
 *  - inProgress: เริ่มแล้วแต่ยังไม่ปิดงาน (ยังไม่ส่ง POD)
 */
export async function getDriverReminder(driverId: string): Promise<{ total: number; notStarted: number; inProgress: number }> {
  const empty = { total: 0, notStarted: 0, inProgress: 0 }
  try {
    if (!driverId) return empty
    const supabase = createAdminClient()
    const { todayTH } = await import('@/lib/utils/date-th')
    const NOT_STARTED = ['New', 'Assigned', 'Confirmed']
    const IN_PROGRESS = ['Accepted', 'Arrived Pickup', 'Picked Up', 'In Transit', 'In Progress', 'Arrived Dropoff']
    const { data } = await supabase
      .from('Jobs_Main')
      .select('Job_Status')
      .eq('Driver_ID', driverId)
      .gte('Plan_Date', todayTH())
      .in('Job_Status', [...NOT_STARTED, ...IN_PROGRESS])
    const rows = data || []
    const notStarted = rows.filter(r => NOT_STARTED.includes(r.Job_Status as string)).length
    const inProgress = rows.length - notStarted
    return { total: rows.length, notStarted, inProgress }
  } catch (e) {
    console.error('[getDriverReminder]', e)
    return empty
  }
}
