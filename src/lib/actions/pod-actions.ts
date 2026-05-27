"use server"

import { createAdminClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { uploadFileToSupabase } from "@/lib/actions/supabase-upload"
import { Job } from "@/lib/supabase/jobs"
import { calculateJobCO2 } from "@/app/mobile/jobs/actions"
import { getFuelPriceNumber, getSuggestedRate } from "./fuel-actions"

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

/**
 * Helper to get the most appropriate unit price based on fuel rates or master data
 */
async function getSmartUnitPrice(supabase: any, customerId: string, planDate?: string, vehicleType: string = '4-Wheel'): Promise<number> {
    if (!customerId) return 0
    
    try {
        // 1. Try to find a dynamic rate based on fuel for 'SYSTEM_PER_PIECE'
        const fuelPrice = await getFuelPriceNumber(planDate)
        if (fuelPrice) {
            const suggestedRate = await getSuggestedRate(customerId, 'SYSTEM_PER_PIECE', fuelPrice, vehicleType)
            if (suggestedRate && suggestedRate > 0) {
                console.log(`[PRICE_LOG] Using dynamic fuel-based unit price: ${suggestedRate} for customer ${customerId}`)
                return suggestedRate
            }
        }

        // 2. Fallback to static price in Master_Customers
        const { data: cust } = await supabase
            .from("Master_Customers")
            .select("Price_Per_Unit")
            .eq("Customer_ID", customerId)
            .single()
        
        return Number(cust?.Price_Per_Unit || 0)
    } catch (err) {
        console.error("[PRICE_ERROR] Failed to fetch smart unit price:", err)
        return 0
    }
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
    
    if (photoCount === 0 && formData.get("photo")) {
        const legacyPhoto = formData.get("photo") as File
        const name = `${jobId}_${timestamp}_photo.jpg`
        uploadPromises.push(uploadWithRename(legacyPhoto, name, 'POD_Photos'))
    } else {
        for (let i = 0; i < photoCount; i++) {
            const file = formData.get(`photo_${i}`) as File
            if (file) {
                const name = `${jobId}_${timestamp}_photo_${i}.jpg`
                uploadPromises.push(uploadWithRename(file, name, 'POD_Photos'))
            }
        }
    }

    const sigName = `${jobId}_${timestamp}_sig.png`
    const sigPromise = uploadWithRename(signatureFile, sigName, 'POD_Signatures')

    const [signatureUrl, ...photoResults] = await Promise.all([
        sigPromise,
        ...uploadPromises
    ])

    let photoUrls = photoResults.filter(url => url !== null) as string[]
    
    if (podReportUrl) {
        photoUrls = [podReportUrl, ...photoUrls]
    }

    const photoUrlString = photoUrls.join(',')

    if (!signatureUrl) throw new Error("Signature upload failed")

    const clientTimestamp = formData.get("actualCompletionTime") as string
    const now = clientTimestamp ? new Date(clientTimestamp) : new Date()
    const nowIso = now.toISOString()
    const timeString = now.toTimeString().split(' ')[0] 
    
    // Get existing notes and quantity for auto-update
    // Optimized fetch: Get job data and customer unit price in parallel or robustly
    // Get existing data for multi-drop support
    const { data: jobData } = await supabase
        .from("Jobs_Main")
        .select("Notes, Price_Cust_Total, Customer_ID, Plan_Date, Vehicle_Type, Total_Drop, Photo_Proof_Url, Signature_Url, original_destinations_json")
        .eq("Job_ID", jobId)
        .single()

    const currentNotes = jobData?.Notes || ""
    const adminPrice = Number(jobData?.Price_Cust_Total || 0)
    const loadedQty = Number(formData.get("loaded_qty") || 0)
    
    // Multi-drop Logic: Calculate progress
    const destinations = jobData?.original_destinations_json ? (
        typeof jobData.original_destinations_json === 'string' 
            ? JSON.parse(jobData.original_destinations_json) 
            : jobData.original_destinations_json
    ) : []
    
    const totalDrop = Array.isArray(destinations) && destinations.length > 0 
        ? destinations.length 
        : Number(jobData?.Total_Drop || 1)

    const existingSignatures = jobData?.Signature_Url ? jobData.Signature_Url.split(',').filter(Boolean) : []
    const completedDrops = existingSignatures.length
    const isLastDrop = (completedDrops + 1) >= totalDrop

    // Append URLs instead of overwriting
    const newPhotoUrlString = jobData?.Photo_Proof_Url 
        ? `${jobData.Photo_Proof_Url},${photoUrlString}` 
        : photoUrlString
    
    const newSignatureUrlString = jobData?.Signature_Url
        ? `${jobData.Signature_Url},${signatureUrl}`
        : signatureUrl

    // Smart Price Lookup
    let unitPrice = 0
    if (jobData?.Customer_ID) {
        unitPrice = await getSmartUnitPrice(supabase, jobData.Customer_ID, jobData.Plan_Date, jobData.Vehicle_Type || '4-Wheel')
    }

    const updatePayload: any = {
        Job_Status: isLastDrop ? "Completed" : "In Transit", 
        Photo_Proof_Url: newPhotoUrlString,
        Signature_Url: newSignatureUrlString,
        Actual_Delivery_Time: timeString,
        Delivery_Date: nowIso.split('T')[0]
    }

    if (loadedQty > 0) {
        updatePayload.Loaded_Qty = loadedQty
        updatePayload.Notes = updateNotesWithQty(currentNotes, loadedQty)
        
        // Auto-calculate price ONLY if not already set (is 0). 
        // This allows admins to manually override the price to a 'Lump Sum' (ราคาเหมา) 
        // in the Planning dashboard, which will be preserved even if quantity is updated.
        if (adminPrice === 0 && unitPrice > 0) {
            updatePayload.Price_Cust_Total = Number((loadedQty * unitPrice).toFixed(2))
        }
    }
    
    const { error: updateError } = await supabase
      .from("Jobs_Main")
      .update(updatePayload)
      .eq("Job_ID", jobId)

    if (updateError) throw updateError

    // 1.2 Calculate CO2
    try {
        const co2Data = await calculateJobCO2(supabase, jobId)
        if (co2Data) {
            const { data: job } = await supabase.from('Jobs_Main').select('Notes').eq('Job_ID', jobId).single()
            await supabase.from('Jobs_Main').update({
                Notes: job?.Notes ? `${job.Notes}\n${co2Data.note}` : co2Data.note
            }).eq('Job_ID', jobId)
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

  try {
    const timestamp = Date.now()
    const photoUrls: string[] = []
    let signatureUrl: string | null = null
    let uploadWarning = ""
    
    try {
      const uploadWithRename = async (file: File, name: string, folder: string) => {
          const buffer = Buffer.from(await file.arrayBuffer())
          const res = await uploadFileToSupabase(buffer, name, file.type, folder)
          return res.directLink
      }

      const pickupReportFile = formData.get("pickup_report") as File
      let pickupReportUrl = null
      
      if (pickupReportFile && pickupReportFile.size > 0) {
          try {
              const reportName = `${jobId}_${timestamp}_PICKUP_REPORT.jpg`
              pickupReportUrl = await uploadWithRename(pickupReportFile, reportName, 'Pickup_Documents')
          } catch {
              // Failed
          }
      }

      const photoCount = parseInt(formData.get("photo_count") as string || "0")
      for (let i = 0; i < photoCount; i++) {
          const file = formData.get(`photo_${i}`) as File
          if (file) {
              const name = `${jobId}_${timestamp}_pickup_${i}.jpg`
              const url = await uploadWithRename(file, name, 'Pickup_Photos')
              if (url) photoUrls.push(url)
          }
      }

      if (pickupReportUrl) {
          photoUrls.unshift(pickupReportUrl)
      }

      const signatureFile = formData.get("signature") as File
      if (signatureFile && signatureFile.size > 0) {
          const sigName = `${jobId}_${timestamp}_pickup_sig.png`
          signatureUrl = await uploadWithRename(signatureFile, sigName, 'Pickup_Signatures')
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      uploadWarning = `อัปโหลดหลักฐานไม่สำเร็จ: ${errMsg}`
    }

    // Get job data and customer unit price
    const { data: jobData } = await supabase
        .from("Jobs_Main")
        .select("Price_Cust_Total, Notes, Customer_ID, Plan_Date, Vehicle_Type")
        .eq("Job_ID", jobId)
        .single()

    // Smart Price Lookup
    let unitPrice = 0
    if (jobData?.Customer_ID) {
        unitPrice = await getSmartUnitPrice(supabase, jobData.Customer_ID, jobData.Plan_Date, jobData.Vehicle_Type || '4-Wheel')
    }

    const adminPrice = Number(jobData?.Price_Cust_Total || 0)
    const currentNotes = jobData?.Notes || ""
    const loadedQty = Number(formData.get("loaded_qty") || 0)

    const clientTimestamp = formData.get("actualCompletionTime") as string
    const now = clientTimestamp ? new Date(clientTimestamp) : new Date()
    const timeString = now.toTimeString().split(' ')[0] 

    const updatePayload: Record<string, unknown> = {
      Job_Status: 'In Transit',
      Pickup_Photo_Url: photoUrls.join(','),
      Pickup_Signature_Url: signatureUrl,
      Actual_Pickup_Time: timeString,
      Loaded_Qty: loadedQty > 0 ? loadedQty : null
    }

    // Only calculate price if admin hasn't set one and we have a unit price + quantity
    if (Number(adminPrice) === 0 && unitPrice > 0 && loadedQty > 0) {
        updatePayload.Price_Cust_Total = Number((loadedQty * unitPrice).toFixed(2))
    }

    // Auto-update Notes with quantity remark
    if (loadedQty > 0) {
        updatePayload.Notes = updateNotesWithQty(currentNotes, loadedQty)
    }

    const { error } = await supabase
      .from("Jobs_Main")
      .update(updatePayload)
      .eq("Job_ID", jobId)

    if (error) {
      throw error
    }

    revalidatePath("/mobile/jobs")
    return uploadWarning ? { success: true, warning: uploadWarning } : { success: true }
    
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

    return { error: `บันทึกไม่สำเร็จ (Pickup): ${errorMessage}` }
  }
}

export async function bulkSyncJobPrices(jobIds: string[]) {
    if (!jobIds.length) return { success: true, count: 0 }
    
    const supabase = createAdminClient()
    try {
        // Fetch jobs and their metadata for smart lookup
        const { data: jobs, error: fetchError } = await supabase
            .from("Jobs_Main")
            .select("Job_ID, Price_Cust_Total, Notes, Loaded_Qty, Plan_Date, Vehicle_Type, Customer_ID")
            .in("Job_ID", jobIds)

        if (fetchError) throw fetchError
        if (!jobs) return { success: true, count: 0 }

        let updateCount = 0
        
        for (const job of jobs) {
            const typedJob = job as any
            const adminPrice = Number(typedJob.Price_Cust_Total || 0)
            const loadedQty = Number(typedJob.Loaded_Qty || 0)

            if (loadedQty > 0) {
                // Fetch dynamic unit price for bulk sync
                const unitPrice = await getSmartUnitPrice(supabase, typedJob.Customer_ID, typedJob.Plan_Date, typedJob.Vehicle_Type || '4-Wheel')

                const updateData: Record<string, string | number | boolean | null> = {
                    Notes: updateNotesWithQty(typedJob.Notes || "", loadedQty)
                }

                if (adminPrice === 0 && unitPrice > 0) {
                    updateData.Price_Cust_Total = Number((loadedQty * unitPrice).toFixed(2))
                }

                const { error: updateError } = await supabase
                    .from("Jobs_Main")
                    .update(updateData)
                    .eq("Job_ID", typedJob.Job_ID)
                
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
