import { createAdminClient } from '@/utils/supabase/server'

/**
 * Sends a webhook notification from TMS to WMS when a delivery job
 * status changes or is completed with Proof of Delivery (POD).
 * Fault-isolated: never throws and never interrupts TMS driver operations.
 */
export async function sendWmsStatusWebhook(
    jobId: string,
    event: 'job.completed' | 'job.status_updated' = 'job.completed'
) {
    const webhookUrl = process.env.WMS_WEBHOOK_URL
    if (!webhookUrl) {
        return { skipped: true, reason: 'WMS_WEBHOOK_URL not configured' }
    }

    try {
        const supabase = createAdminClient()
        const { data: job, error } = await supabase
            .from('Jobs_Main')
            .select('*')
            .eq('Job_ID', jobId)
            .maybeSingle()

        if (error || !job) {
            console.warn(`[WMS-Webhook] Job ${jobId} not found`)
            return { ok: false, error: 'Job not found' }
        }

        // Only send webhook if job has WMS tag in Notes
        const notesStr = String(job.Notes || '')
        const hasWmsTag = notesStr.includes('[WMS:')

        if (!hasWmsTag) {
            return { skipped: true, reason: 'Not a WMS job' }
        }

        // Extract WMS order number
        let wmsOrderNo = ''
        const m = notesStr.match(/\[WMS:\s*([^\]]+)\]/)
        if (m) wmsOrderNo = m[1].trim()

        const photoUrls = job.Photo_Proof_Url ? String(job.Photo_Proof_Url).split(',').filter(Boolean) : []
        const signatureUrl = job.Signature_Url || null

        const payload = {
            event,
            job_id: job.Job_ID,
            wms_order_no: wmsOrderNo || null,
            status: job.Job_Status,
            is_completed: ['Completed', 'Delivered', 'Verified', 'Billed', 'Paid'].includes(job.Job_Status || ''),
            delivery_date: job.Delivery_Date || new Date().toISOString(),
            actual_delivery_time: job.Actual_Delivery_Time || null,
            signature_url: signatureUrl,
            photo_urls: photoUrls,
            receiver_name: job.Receiver_Name || null,
            driver_name: job.Driver_Name || null,
            vehicle_plate: job.Vehicle_Plate || null,
            branch_id: job.Branch_ID || null,
            notes: job.Notes || null,
            timestamp: new Date().toISOString()
        }

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)

        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.WMS_WEBHOOK_SECRET || ''}`,
                'x-wms-secret': process.env.WMS_WEBHOOK_SECRET || ''
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        }).finally(() => clearTimeout(timeout))

        if (!res.ok) {
            const txt = await res.text().catch(() => '')
            console.error(`[WMS-Webhook] Delivery notification failed for ${jobId}: HTTP ${res.status} ${txt}`)
            return { ok: false, error: `HTTP ${res.status}` }
        }

        console.log(`[WMS-Webhook] Notification delivered for job ${jobId} (WMS Order: ${wmsOrderNo})`)
        return { ok: true }
    } catch (e: any) {
        console.error(`[WMS-Webhook] Error sending notification for ${jobId}:`, e?.message || e)
        return { ok: false, error: e?.message || 'Network error' }
    }
}
