"use server"

import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { createAdminClient } from "@/utils/supabase/server"
import { requireAdmin } from "@/services/permission-guards"
import { uploadFileToSupabase } from "@/lib/actions/supabase-upload"
import { THAI_FONT_LEELAWADEE } from "@/lib/fonts/thai-font"

// Helper to fetch image and return base64
async function getImageBase64(url: string): Promise<string | null> {
    try {
        const response = await fetch(url)
        if (!response.ok) return null
        const blob = await response.arrayBuffer()
        const buffer = Buffer.from(blob)
        return `data:image/png;base64,${buffer.toString('base64')}`
    } catch {
        return null
    }
}

export async function generateJobPDF(jobId: string) {
    // PDF generation started
    
    try {
        await requireAdmin()
        const supabase = createAdminClient()
        
        // 1. Fetch comprehensive job data using admin client
        const { data: job, error } = await supabase
            .from('Jobs_Main')
            .select('*')
            .eq('Job_ID', jobId)
            .single()
            
        if (error || !job) {
            throw new Error("Job not found")
        }

        // 2. Initialize PDF
        const doc = new jsPDF()
        
        // Register Thai Font
        doc.addFileToVFS('Leelawadee.ttf', THAI_FONT_LEELAWADEE)
        doc.addFont('Leelawadee.ttf', 'Leelawadee', 'normal')
        doc.setFont('Leelawadee')

        const primaryColor = [30, 41, 59] // Slate 800
        const accentColor = [79, 70, 229] // Indigo 600

        // Header
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
        doc.rect(0, 0, 210, 40, 'F')
        
        doc.setTextColor(255, 255, 255)
        doc.setFontSize(22)
        doc.text("DELIVERY SUMMARY REPORT (สรุปใบงาน)", 15, 20)
        
        doc.setFontSize(10)
        doc.text(`Job ID: ${job.Job_ID}`, 15, 30)
        doc.text(`Generated (วันที่สร้าง): ${new Date().toLocaleString('th-TH')}`, 15, 35)

        // Job Details Table
        const detailsData = [
            ["Customer", job.Customer_Name || "-"],
            ["Origin", job.Location_Origin_Name || job.Origin_Location || "-"],
            ["Destination", job.Location_Destination_Name || job.Dest_Location || "-"],
            ["Vehicle", job.Vehicle_Plate || "-"],
            ["Driver", job.Driver_Name || "-"],
            ["Status", job.Job_Status || "-"],
            ["Plan Date", job.Plan_Date || "-"],
            ["Pickup Time", job.Actual_Pickup_Time || "-"],
            ["Delivery Time", job.Actual_Delivery_Time || "-"],
        ]

        autoTable(doc, {
            startY: 50,
            head: [['Field (ฟิลด์)', 'Value (ข้อมูล)']],
            body: detailsData,
            theme: 'striped',
            headStyles: { 
                fillColor: accentColor as [number, number, number],
                font: 'Leelawadee'
            },
            styles: { 
                fontSize: 10, 
                cellPadding: 3,
                font: 'Leelawadee'
            }
        })

        // Photos Section (Basic implementation - embedding images in PDF requires base64)
        // Since fetching and converting all images might be heavy, for now we will 
        // provide links in metadata but let's try to embed at least the signature.
        
        const finalYFromTable = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 150
        let finalY = finalYFromTable + 20

        // Signatures (Embedded Images)
        if (job.Signature_Url || job.Pickup_Signature_Url) {
            doc.setFontSize(14)
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
            doc.text("SIGNATURES (ลายเซ็น)", 15, finalY)
            finalY += 10

            // Pickup Signature
            if (job.Pickup_Signature_Url) {
                doc.setFontSize(10)
                doc.text("ต้นทาง (Pickup Signature):", 15, finalY)
                const base64 = await getImageBase64(job.Pickup_Signature_Url)
                if (base64) {
                    doc.addImage(base64, 'PNG', 15, finalY + 5, 40, 20)
                } else {
                    doc.text("(Image load failed)", 15, finalY + 5)
                }
            }

            // POD Signature
            if (job.Signature_Url) {
                doc.setFontSize(10)
                doc.text("ปลายทาง (POD Signature):", 110, finalY)
                const base64 = await getImageBase64(job.Signature_Url)
                if (base64) {
                    doc.addImage(base64, 'PNG', 110, finalY + 5, 40, 20)
                } else {
                    doc.text("(Image load failed)", 110, finalY + 5)
                }
            }
        }

        // 3. Convert to Buffer
        const pdfArrayBuffer = doc.output('arraybuffer')
        const pdfBuffer = Buffer.from(pdfArrayBuffer)

        // 4. Upload to Supabase Storage
        const fileName = `Report_${jobId}_${Date.now()}.pdf`
        const uploadResult = await uploadFileToSupabase(pdfBuffer, fileName, 'application/pdf', 'POD_Reports')
        
        // Report uploaded successfully (no log)

        // 5. Update Job with PDF Link - FETCH LATEST AGAIN to avoid overwriting recent POD data
        const { data: latestJob } = await supabase
            .from('Jobs_Main')
            .select('Photo_Proof_Url')
            .eq('Job_ID', jobId)
            .single()

        const currentPhotos = latestJob?.Photo_Proof_Url || ""
        const updatedPhotos = currentPhotos ? `${currentPhotos},${uploadResult.directLink}` : uploadResult.directLink

        await supabase
            .from('Jobs_Main')
            .update({ Photo_Proof_Url: updatedPhotos })
            .eq('Job_ID', jobId)

        // 6. Log the export
        const { logActivity } = await import('@/lib/supabase/logs')
        await logActivity({
            module: 'Reports',
            action_type: 'EXPORT',
            target_id: jobId,
            details: {
                report_type: 'Delivery Summary',
                file_name: fileName,
                url: uploadResult.directLink
            }
        })

        return { success: true, url: uploadResult.directLink }

    } catch (e: unknown) {
        const errorMsg = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e);
        return { success: false, error: errorMsg };
    }
}
