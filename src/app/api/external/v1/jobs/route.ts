import { validateApiKey } from '@/lib/security/api-security'
import { createAdminClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { todayTH } from '@/lib/utils/date-th'

function generateJobId() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const random = String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
    return `JOB-${year}${month}${day}-${random}`
}

/**
 * Enterprise Integration API (v1)
 * Allows external ERP/SAP/WMS systems to create jobs and track status/POD automatically.
 */
export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('Authorization')
        
        // Industrial-grade API Key validation across Master_API_Keys registry
        let clientContext
        try {
            clientContext = await validateApiKey(authHeader || '')
        } catch (authError: unknown) {
            return NextResponse.json({ error: (authError as Error).message }, { status: 401 })
        }

        const body = await req.json()
        const {
            customer_id,
            customer_name,
            customer_phone,
            pickup_address,
            delivery_address,
            items,
            vehicle_type,
            plan_date,
            branch_id, // optional: scope the job to a specific branch (e.g. 'URT', 'HQ')
            wms_order_no,
            job_id,
            tracking_no,
            notes,
            weight_kg,
            cargo_type,
            items_list,
            parcel_barcode,
            box_count,
            vehicle_plate, // optional: pre-assigned company vehicle (checker picked it)
            driver_name,   // optional: assigned driver name
            stops          // optional: multi-drop destinations [{stop_number,recipient_name,phone,address,notes}]
        } = body

        // Validation
        if (!customer_id || !pickup_address || !delivery_address) {
            return NextResponse.json({ error: 'Missing required fields: customer_id, pickup_address, delivery_address' }, { status: 400 })
        }

        const supabase = createAdminClient()
        
        // Derive Job ID: use explicitly supplied job_id, or map from wms_order_no (e.g. ORD-2026-8008 -> JOB-2026-8008)
        let effectiveJobId = (job_id && String(job_id).trim()) || ''
        if (!effectiveJobId && wms_order_no) {
            const clean = String(wms_order_no).trim()
            effectiveJobId = clean.startsWith('ORD-')
                ? clean.replace(/^ORD-/, 'JOB-')
                : (clean.startsWith('JOB-') ? clean : `JOB-${clean}`)
        }
        if (!effectiveJobId) {
            effectiveJobId = generateJobId()
        }

        // Construct enriched notes
        const notesParts: string[] = []
        if (wms_order_no) notesParts.push(`[WMS: ${wms_order_no}]`)
        if (parcel_barcode || tracking_no) notesParts.push(`บาร์โค้ด: ${parcel_barcode || tracking_no}`)
        if (items) notesParts.push(`สินค้า: ${items}`)
        if (notes) notesParts.push(String(notes).trim())
        if (customer_phone) notesParts.push(`เบอร์ผู้รับ: ${customer_phone}`)
        const combinedNotes = notesParts.length > 0 ? notesParts.join(' | ') : null

        const effectiveCargoType = cargo_type || (items ? (String(items).length > 60 ? String(items).substring(0, 57) + '...' : String(items)) : 'พัสดุทั่วไป')
        const effectiveWeight = weight_kg ? Number(weight_kg) : null

        // Insert new job into Jobs_Main, handling potential duplicate Job_ID gracefully
        let finalJobId = effectiveJobId
        let data: any = null

        const jobPayload: Record<string, unknown> = {
            Job_ID: finalJobId,
            Customer_ID: customer_id,
            Customer_Name: customer_name || customer_id,
            Origin_Location: pickup_address,
            Dest_Location: delivery_address,
            Vehicle_Type: vehicle_type || '4-Wheel',
            Cargo_Type: effectiveCargoType,
            ...(effectiveWeight ? { Weight_Kg: effectiveWeight } : {}),
            Plan_Date: plan_date || todayTH(),
            Job_Status: 'New',
            Notes: combinedNotes,
            Created_At: new Date().toISOString(),
            ...(branch_id ? { Branch_ID: branch_id } : {})
        }

        const insertRes = await supabase.from('Jobs_Main').insert([jobPayload]).select()
        if (insertRes.error && (insertRes.error.code === '23505' || String(insertRes.error.message).includes('duplicate') || String(insertRes.error.message).includes('unique'))) {
            // Already exists: update existing job if still New
            const updateRes = await supabase
                .from('Jobs_Main')
                .update({
                    Customer_ID: customer_id,
                    Customer_Name: customer_name || customer_id,
                    Origin_Location: pickup_address,
                    Dest_Location: delivery_address,
                    Vehicle_Type: vehicle_type || '4-Wheel',
                    Cargo_Type: effectiveCargoType,
                    ...(effectiveWeight ? { Weight_Kg: effectiveWeight } : {}),
                    Notes: combinedNotes,
                    ...(branch_id ? { Branch_ID: branch_id } : {})
                })
                .eq('Job_ID', finalJobId)
                .select()
            if (updateRes.data && updateRes.data.length > 0) {
                data = updateRes.data
            } else {
                // Suffix fallback
                finalJobId = `${effectiveJobId}-${Math.floor(1000 + Math.random() * 9000)}`
                jobPayload.Job_ID = finalJobId
                const retryRes = await supabase.from('Jobs_Main').insert([jobPayload]).select()
                if (retryRes.error) throw retryRes.error
                data = retryRes.data
            }
        } else if (insertRes.error) {
            throw insertRes.error
        } else {
            data = insertRes.data
        }

        const createdJob = data[0]
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tms-e-pod.vercel.app'
        const trackingUrl = `${appUrl}/track/${createdJob.Job_ID}`

        // Trigger Admin Alert (Push & Toast)
        try {
            const { sendPushToAdmins } = await import('@/lib/actions/push-actions')
            await sendPushToAdmins({
                title: '📦 จองงานใหม่ (Enterprise API)',
                body: `งาน ID: ${createdJob.Job_ID} • ${wms_order_no ? `ออเดอร์: ${wms_order_no} • ` : ''}ลูกค้า: ${customer_name || customer_id}`,
                url: `/jobs`,
                type: 'standard'
            }, null)
        } catch (e) {
            console.error("Push broadcast failed:", e)
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Job created via Enterprise API',
            job_id: createdJob.Job_ID,
            tracking_url: trackingUrl,
            wms_order_no: wms_order_no || undefined
        }, { status: 201 })

    } catch (err: any) {
        console.error('API Error (POST /api/external/v1/jobs):', err)
        return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 })
    }
}

/**
 * GET: Query real-time status and POD proofs for external systems (WMS, ERP).
 * Accepts ?job_id=... or ?wms_order_no=...
 */
export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get('Authorization')
        
        try {
            await validateApiKey(authHeader || '')
        } catch (authError: unknown) {
            return NextResponse.json({ error: (authError as Error).message }, { status: 401 })
        }

        const { searchParams } = new URL(req.url)
        const jobId = searchParams.get('job_id')?.trim()
        const wmsOrderNo = searchParams.get('wms_order_no')?.trim()

        if (!jobId && !wmsOrderNo) {
            return NextResponse.json({ error: 'Missing query parameter: job_id or wms_order_no' }, { status: 400 })
        }

        const supabase = createAdminClient()
        let query = supabase.from('Jobs_Main').select('*')

        if (jobId) {
            query = query.eq('Job_ID', jobId)
        } else if (wmsOrderNo) {
            query = query.ilike('Notes', `%[WMS: ${wmsOrderNo}]%`)
        }

        const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()

        if (error) throw error
        if (!data) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 })
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tms-e-pod.vercel.app'
        const photoUrls = data.Photo_Proof_Url ? String(data.Photo_Proof_Url).split(',').filter(Boolean) : []
        const signatureUrl = data.Signature_Url || null

        // Detect wms_order_no from notes if available
        let extractedWmsOrder = wmsOrderNo || null
        if (!extractedWmsOrder && data.Notes) {
            const m = String(data.Notes).match(/\[WMS:\s*([^\]]+)\]/)
            if (m) extractedWmsOrder = m[1].trim()
        }

        return NextResponse.json({
            success: true,
            job: {
                job_id: data.Job_ID,
                status: data.Job_Status,
                is_completed: ['Completed', 'Delivered', 'Verified', 'Billed', 'Paid'].includes(data.Job_Status || ''),
                plan_date: data.Plan_Date,
                delivery_date: data.Delivery_Date,
                actual_delivery_time: data.Actual_Delivery_Time,
                driver_id: data.Driver_ID || null,
                driver_name: data.Driver_Name || null,
                vehicle_plate: data.Vehicle_Plate || null,
                signature_url: signatureUrl,
                photo_proof_url: data.Photo_Proof_Url || null,
                photo_urls: photoUrls,
                receiver_name: data.Receiver_Name || null,
                customer_id: data.Customer_ID,
                customer_name: data.Customer_Name,
                pickup_address: data.Origin_Location || null,
                delivery_address: data.Dest_Location || null,
                branch_id: data.Branch_ID || null,
                wms_order_no: extractedWmsOrder,
                tracking_url: `${appUrl}/track/${data.Job_ID}`
            }
        })
    } catch (err: any) {
        console.error('API Error (GET /api/external/v1/jobs):', err)
        return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 })
    }
}
