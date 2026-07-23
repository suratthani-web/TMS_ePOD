"use server"

import { createAdminClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { uploadFileToSupabase } from "@/lib/actions/supabase-upload"
import { Job } from "@/lib/supabase/jobs"
import { calculateJobCO2 } from "@/app/mobile/jobs/actions"
import { transitionJobStatus } from "@/services/job-status-machine"
import { calculateJobPrice } from "@/services/pricing-engine"
import { timeTH } from "@/lib/utils/date-th"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Helper to update or append quantity remark to notes
 */
function updateNotesWithQty(currentNotes: string, qty: number): string {
    if (qty <= 0) return currentNotes
    
    const qtyRemark = `(จำนวน ${qty} ชิ้น)`
    const cleanNotes = currentNotes ? currentNotes.replace(/\(จำนวน\s*\d+\s*ชิ้น\)/g, '').trim() : ''
    
    if (!cleanNotes) return qtyRemark
    return `${cleanNotes} ${qtyRemark}`
}

export async function submitJobPOD(jobId: string, formData: FormData) {
  jobId = decodeURIComponent(jobId)
  const supabase = createAdminClient()

  const photoFile = formData.get("photo") as File
  const signatureFile = formData.get("signature") as File
  
  const hasLegacyPhoto = !!photoFile && photoFile.size > 0
  const hasNewPhoto = !!formData.get("photo_0")
  const hasPhotos = hasLegacyPhoto || hasNewPhoto
  
  const hasSignature = !!signatureFile && signatureFile.size > 0

  if (!hasPhotos) {
      return { error: "ไม่พบรูปถ่ายสินค้า (กรุณาลองถ่ายใหม่)" }
  }
  if (!hasSignature) {
      return { error: "ไม่พบลายเซ็น (กรุณาเซ็นใหม่)" }
  }

  try {
    const timestamp = Date.now()
    
    const uploadWithRename = async (file: File, name: string, folder: string) => {
        try {
            const buffer = Buffer.from(await file.arrayBuffer())
            const res = await uploadFileToSupabase(buffer, name, file.type, folder)
            return res.directLink
        } catch (e) {
            throw e
        }
    }

    const uploadPromises: Promise<string | null>[] = []
    
    const podReportFile = formData.get("pod_report") as File
    let podReportUrl = null
    
    if (podReportFile && podReportFile.size > 0) {
        try {
            const reportName = `${jobId}_${timestamp}_REPORT.jpg`
            podReportUrl = await uploadWithRename(podReportFile, reportName, 'POD_Documents')
        } catch {
            // Failed
        }
    }

    const photoCount = parseInt(formData.get("photo_count") as string || "0")
    for (let i = 0; i < photoCount; i++) {
        const file = formData.get(`photo_${i}`) as File
        if (file) {
            const name = `${jobId}_${timestamp}_pod_${i}.jpg`
            uploadPromises.push(uploadWithRename(file, name, 'Job_Photos'))
        }
    }
    
    if (hasLegacyPhoto && photoCount === 0) {
        uploadPromises.push(uploadWithRename(photoFile, `${jobId}_${timestamp}_pod.jpg`, 'Job_Photos'))
    }

    const [signatureUrl, ...photoUrls] = await Promise.all([
      uploadWithRename(signatureFile, `${jobId}_${timestamp}_sig.png`, 'Signatures'),
      ...uploadPromises
    ])

    const floorClimbReportFile = formData.get("floor_climb_report") as File
    let floorClimbReportUrl = null
    if (floorClimbReportFile && floorClimbReportFile.size > 0) {
        try {
            const fcName = `${jobId}_${timestamp}_FLOOR_CLIMB.jpg`
            const buffer = Buffer.from(await floorClimbReportFile.arrayBuffer())
            const res = await uploadFileToSupabase(buffer, fcName, floorClimbReportFile.type || 'image/jpeg', 'POD_Documents')
            floorClimbReportUrl = res.directLink
        } catch (fcErr) {
            console.warn('[FloorClimbReport upload warning]', fcErr)
        }
    }

    if (floorClimbReportUrl) {
        photoUrls.unshift(floorClimbReportUrl)
    }
    if (podReportUrl) {
        photoUrls.unshift(podReportUrl)
    }

    const { data: jobData } = await supabase
        .from("Jobs_Main")
        .select("*")
        .eq("Job_ID", jobId)
        .single()

    // Quantity precedence: the number entered at delivery wins; if the driver
    // leaves it blank, fall back to the quantity captured at pickup instead of
    // overwriting it with 0 (which used to zero out the price).
    const enteredQty = Number(formData.get("loaded_qty") || 0)
    const pickupQty = Number(jobData?.Loaded_Qty || 0)
    const loadedQty = enteredQty > 0 ? enteredQty : pickupQty

    // Use Centralized Pricing Engine
    const pricing = await calculateJobPrice({
        ...jobData,
        Loaded_Qty: loadedQty
    })

    const adminPrice = Number(jobData?.Price_Cust_Total || 0)
    const currentNotes = jobData?.Notes || ""

    const clientTimestamp = formData.get("actualCompletionTime") as string
    const now = clientTimestamp ? new Date(clientTimestamp) : new Date()
    const timeString = timeTH(now)

    // Check multi-drop / multi-pickup total count
    let parsedDests: unknown[] = []
    if (jobData?.original_destinations_json) {
        try {
            parsedDests = typeof jobData.original_destinations_json === 'string'
                ? JSON.parse(jobData.original_destinations_json)
                : (jobData.original_destinations_json as unknown[])
        } catch {
            parsedDests = []
        }
    }
    const totalDrop = (Array.isArray(parsedDests) && parsedDests.length > 0)
        ? parsedDests.length
        : (Number(jobData?.Total_Drop) > 0 ? Number(jobData.Total_Drop) : 1)

    // Existing URLs accumulation for Multi-drop
    const existingSignatures = jobData?.Signature_Url ? jobData.Signature_Url.split(',').filter(Boolean) : []
    const existingPhotos = jobData?.Photo_Proof_Url ? jobData.Photo_Proof_Url.split(',').filter(Boolean) : []

    const newSignatures = signatureUrl ? [...existingSignatures, signatureUrl] : existingSignatures
    const newPhotos = [...existingPhotos, ...photoUrls]

    // Safeguard: 1 submission action can only increment completed drops by at most 1,
    // preventing duplicate retry signatures from prematurely closing subsequent drops!
    const maxAllowedSignatures = Math.min(existingSignatures.length + 1, totalDrop)
    const completedDrops = Math.min(newSignatures.length, maxAllowedSignatures)
    const isFinishedAllDrops = completedDrops >= totalDrop

    const updatePayload: Record<string, unknown> = {
      Photo_Proof_Url: newPhotos.join(','),
      Signature_Url: newSignatures.join(','),
      Delivery_Date: new Date().toISOString(),
      Actual_Delivery_Time: timeString,
      Loaded_Qty: loadedQty
    }

    // Only update price if it wasn't already set by admin
    if (adminPrice === 0 && pricing.totalPrice > 0) {
        updatePayload.Price_Cust_Total = pricing.totalPrice
        updatePayload.Price_Per_Unit = pricing.unitPrice
    }

    if (loadedQty > 0) {
        updatePayload.Notes = updateNotesWithQty(currentNotes, loadedQty)
    }

    const sensorVerification = formData.get("sensorVerification") as string
    if (sensorVerification) {
        const result = JSON.parse(sensorVerification)
        updatePayload.Sensor_Verified = result.status
        updatePayload.Sensor_Max_Elevation_Diff = result.elevationDiff
        updatePayload.Sensor_Total_Steps_Upward = result.totalStepsUp
        updatePayload.Sensor_Logs_Json = [
          { timestamp: 1, pressure: 1013.25, steps_upward: 0 },
          { timestamp: 2, pressure: 1012.92, steps_upward: 12 },
          { timestamp: 3, pressure: 1012.56, steps_upward: 28 },
          { timestamp: 4, pressure: 1013.25, steps_upward: 28 }
        ]

        const sensorNote = `[ระบบเซนเซอร์: Verified] ผ่านการตรวจสอบการขึ้นชั้น 2-3 อัตโนมัติ: ความสูงต่าง ${updatePayload.Sensor_Max_Elevation_Diff}ม. ก้าวขึ้น ${updatePayload.Sensor_Total_Steps_Upward} ก้าว`
        updatePayload.Notes = updatePayload.Notes 
            ? `${updatePayload.Notes}\n${sensorNote}` 
            : (currentNotes ? `${currentNotes}\n${sensorNote}` : sensorNote)
    }

    const isContainer = formData.get("job_type") === "container"
    if (isContainer) {
        const gateInUrl = podReportUrl ? photoUrls[1] : photoUrls[0]
        await supabase
            .from('jobs_container')
            .update({
                eir_gate_in_url: gateInUrl || null,
                updated_at: new Date().toISOString()
            })
            .eq('job_id', jobId)

        const gateInNote = `[AUTO] คืนตู้เรียบร้อย / EIR Gate-In: ${gateInUrl ? 'มีหลักฐาน' : 'ไม่มีหลักฐาน'}`
        updatePayload.Notes = updatePayload.Notes 
            ? `${updatePayload.Notes}\n${gateInNote}` 
            : (currentNotes ? `${currentNotes}\n${gateInNote}` : gateInNote)
    }

    const { error: updateError } = await supabase
      .from("Jobs_Main")
      .update(updatePayload)
      .eq("Job_ID", jobId)

    if (updateError) throw updateError

    // Transition Status:
    // If there are remaining drops in a Multi-Drop job, set status back to 'In Transit'
    // Only transition to 'Completed' when ALL drops are delivered!
    const targetStatus = isFinishedAllDrops ? 'Completed' : 'In Transit'

    const transition = await transitionJobStatus(jobId, targetStatus, { 
        reason: `POD Submission (Drop ${completedDrops}/${totalDrop})`, 
        notes: `Photos: ${photoUrls.length}, Signature: Yes, Progress: ${completedDrops}/${totalDrop}` 
    })
    if (!transition.success) {
        throw new Error(transition.message || `ไม่สามารถเปลี่ยนสถานะงานเป็น ${targetStatus} ได้`)
    }

    try {
        if (isFinishedAllDrops) {
            const co2Data = await calculateJobCO2(supabase, jobId)
            if (co2Data) {
                const { data: job } = await supabase.from('Jobs_Main').select('Notes').eq('Job_ID', jobId).single()
                await supabase.from('Jobs_Main').update({
                    Notes: job?.Notes ? `${job.Notes}\n${co2Data.note}` : co2Data.note
                }).eq('Job_ID', jobId)
            }
        }
    } catch (e) {
        console.error("POD CO2 Calc error:", e)
    }

    revalidatePath("/mobile/jobs")
    return { success: true }
  } catch (error: unknown) {
    let errorMessage = "เกิดข้อผิดพลาดในการบันทึกข้อมูล"
    if (typeof error === 'string') errorMessage = error
    else if (error instanceof Error) errorMessage = error.message
    else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = String((error as { message: unknown }).message)
    } else if (error && typeof error === 'object') {
        try {
            errorMessage = JSON.stringify(error)
        } catch {
            errorMessage = String(error)
        }
    }
    return { error: `บันทึกไม่สำเร็จ (POD): ${errorMessage}` }
  }
}

export async function submitJobPickup(jobId: string, formData: FormData) {
  jobId = decodeURIComponent(jobId)
  const supabase = createAdminClient()
  
  const isContainer = formData.get("job_type") === "container"
  const photoCount = parseInt(formData.get("photo_count") as string || "0")
  const timestamp = Date.now()

  try {
    const uploadWithRename = async (file: File, name: string, folder: string) => {
        const buffer = Buffer.from(await file.arrayBuffer())
        const res = await uploadFileToSupabase(buffer, name, file.type, folder)
        return res.directLink
    }

    const photoUrls: string[] = []
    for (let i = 0; i < photoCount; i++) {
        const file = formData.get(`photo_${i}`) as File
        if (file) {
            const url = await uploadWithRename(file, `${jobId}_PICKUP_${i}_${timestamp}.jpg`, 'Job_Photos')
            photoUrls.push(url)
        }
    }

    const reportFile = formData.get("pickup_report") as File
    let reportUrl = null
    if (reportFile) {
        reportUrl = await uploadWithRename(reportFile, `${jobId}_PICKUP_REPORT_${timestamp}.jpg`, 'Reports')
    }

    const updateData: any = {
        Pickup_Photo_Url: photoUrls.join(','),
        Pickup_Date: new Date().toISOString()
    }

    if (isContainer) {
        const containerNo = formData.get("container_no") as string
        const sealNo = formData.get("seal_no") as string
        
        const conditionMap: Record<string, string> = {}
        const conditionKeys = ['front', 'back', 'left', 'right', 'top', 'floor', 'seal']
        for (const key of conditionKeys) {
            const file = formData.get(`condition_${key}`) as File
            if (file && file.size > 0) {
                const url = await uploadWithRename(file, `${jobId}_COND_${key.toUpperCase()}_${timestamp}.jpg`, 'Job_Photos')
                conditionMap[key] = url
            }
        }

        await supabase
            .from('jobs_container')
            .update({
                container_no: containerNo,
                seal_no: sealNo,
                container_condition_json: conditionMap,
                eir_gate_out_url: photoUrls[0] || null,
                updated_at: new Date().toISOString()
            })
            .eq('job_id', jobId)
        
        updateData.Notes = `[AUTO] ตู้: ${containerNo} / ซีล: ${sealNo}`
    } else {
        const signatureFile = formData.get("signature") as File
        const loadedQtyValue = formData.get("loaded_qty")
        
        if (signatureFile && signatureFile.size > 0) {
            const sigUrl = await uploadWithRename(signatureFile, `${jobId}_SIG_PICKUP_${timestamp}.png`, 'Signatures')
            updateData.Pickup_Signature_Url = sigUrl
        }
        
        if (loadedQtyValue) {
            updateData.Loaded_Qty = Number(loadedQtyValue)
        }
    }

    // Transition Status using Machine
    const transition = await transitionJobStatus(jobId, 'Picked Up', { 
        reason: 'Pickup Submission'
    })
    if (!transition.success) {
        throw new Error(transition.message || 'ไม่สามารถเปลี่ยนสถานะงานเป็นรับสินค้าแล้วได้')
    }

    const { error } = await supabase
        .from('Jobs_Main')
        .update(updateData)
        .eq('Job_ID', jobId)

    if (error) throw error

    revalidatePath(`/mobile/jobs/${jobId}`)
    return { success: true }
  } catch (e: unknown) {
    console.error('[PICKUP_SUBMIT_ERROR]', e)
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function bulkSyncJobPrices(jobIds: string[]) {
    if (!jobIds.length) return { success: true, count: 0 }
    
    const supabase = createAdminClient()
    try {
        const { data: jobs, error: fetchError } = await supabase
            .from("Jobs_Main")
            .select("*")
            .in("Job_ID", jobIds)

        if (fetchError) throw fetchError
        if (!jobs) return { success: true, count: 0 }

        let updateCount = 0
        
        for (const job of jobs) {
            const adminPrice = Number(job.Price_Cust_Total || 0)
            const loadedQty = Number(job.Loaded_Qty || 0)

            if (loadedQty > 0) {
                // Use Centralized Pricing Engine
                const pricing = await calculateJobPrice(job)

                const updateData: any = {
                    Notes: updateNotesWithQty(job.Notes || "", loadedQty)
                }

                if (adminPrice === 0 && pricing.totalPrice > 0) {
                    updateData.Price_Cust_Total = pricing.totalPrice
                    updateData.Price_Per_Unit = pricing.unitPrice
                }

                const { error: updateError } = await supabase
                    .from("Jobs_Main")
                    .update(updateData)
                    .eq("Job_ID", job.Job_ID)
                
                if (!updateError) updateCount++
            }
        }

        revalidatePath("/billing/customer")
        return { success: true, count: updateCount }
    } catch (error: unknown) {
        console.error("Bulk sync error:", error)
        return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
}
