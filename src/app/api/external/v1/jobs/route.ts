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

        // Resolve the customer against Master_Customers so the rest of the loop
        // (LINE delivery survey, customer billing, credit terms, tax info) links
        // to the real customer record. WMS sends customer_id = the customer NAME
        // string, not a TMS Customer_ID, so match by ID first, then by exact name.
        // Additive & non-fatal: if nothing matches we keep whatever WMS sent.
        let effectiveCustomerId = customer_id
        let effectiveCustomerName = customer_name || customer_id
        try {
            const idCandidate = String(customer_id || '').trim()
            const nameCandidate = String(customer_name || customer_id || '').trim()
            // 1. Already a real Customer_ID?
            const { data: byId } = await supabase.from('Master_Customers')
                .select('Customer_ID, Customer_Name')
                .eq('Customer_ID', idCandidate)
                .maybeSingle()
            if (byId?.Customer_ID) {
                effectiveCustomerId = byId.Customer_ID
                effectiveCustomerName = byId.Customer_Name || effectiveCustomerName
            } else {
                // 2. Resolve by exact (case-insensitive) name. Try the display name,
                //    then the id-as-name (WMS puts the name in both). ilike with no
                //    wildcards = case-insensitive exact match; avoid .or() because
                //    Thai company names contain commas/parens that break its syntax.
                let match: { Customer_ID: string; Customer_Name: string } | null = null
                for (const cand of [nameCandidate, idCandidate]) {
                    if (!cand || match) continue
                    const { data: byName } = await supabase.from('Master_Customers')
                        .select('Customer_ID, Customer_Name')
                        .ilike('Customer_Name', cand)
                        .limit(1)
                        .maybeSingle()
                    if (byName?.Customer_ID) match = byName as any
                }
                if (match) {
                    effectiveCustomerId = match.Customer_ID
                    effectiveCustomerName = match.Customer_Name
                }
            }
        } catch (e) {
            console.warn('[external jobs] customer resolve failed, keeping WMS-sent values:', e)
        }

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

        // Optional pre-assignment + multi-drop (all additive; only set when supplied)
        const assign: Record<string, unknown> = {}
        if (vehicle_plate) {
            const plate = String(vehicle_plate).trim()
            assign.Vehicle_Plate = plate
            // Auto-resolve the real driver account from the plate so the job is
            // properly assigned (driver app, Sub_ID, cost calc). Additive: if the
            // plate isn't in Master_Drivers, we just keep the plate/name text.
            try {
                const { data: drv } = await supabase
                    .from('Master_Drivers')
                    .select('Driver_ID, Driver_Name, Sub_ID, Vehicle_Type')
                    .ilike('Vehicle_Plate', plate)
                    .limit(1)
                    .maybeSingle()
                if (drv) {
                    if (drv.Driver_ID) assign.Driver_ID = drv.Driver_ID
                    if (drv.Driver_Name) assign.Driver_Name = drv.Driver_Name
                    if (drv.Sub_ID !== null && drv.Sub_ID !== undefined) assign.Sub_ID = drv.Sub_ID
                    if (!vehicle_type && drv.Vehicle_Type) assign.Vehicle_Type = drv.Vehicle_Type
                }
            } catch (e) {
                console.warn('[external jobs] driver resolve by plate failed:', e)
            }
        }
        // Explicit driver_name from the caller always wins over the resolved one.
        if (driver_name) assign.Driver_Name = String(driver_name).trim()
        if (Array.isArray(stops) && stops.length > 0) {
            assign.original_destinations_json = JSON.stringify(stops)
        }

        const jobPayload: Record<string, unknown> = {
            Job_ID: finalJobId,
            Customer_ID: effectiveCustomerId,
            Customer_Name: effectiveCustomerName,
            Origin_Location: pickup_address,
            Dest_Location: delivery_address,
            Vehicle_Type: vehicle_type || '4-Wheel',
            Cargo_Type: effectiveCargoType,
            ...(effectiveWeight ? { Weight_Kg: effectiveWeight } : {}),
            Plan_Date: plan_date || todayTH(),
            Job_Status: 'New',
            Notes: combinedNotes,
            Created_At: new Date().toISOString(),
            ...(branch_id ? { Branch_ID: branch_id } : {}),
            ...assign
        }

        const insertRes = await supabase.from('Jobs_Main').insert([jobPayload]).select()
        if (insertRes.error && (insertRes.error.code === '23505' || String(insertRes.error.message).includes('duplicate') || String(insertRes.error.message).includes('unique'))) {
            // Already exists: update existing job if still New
            const updateRes = await supabase
                .from('Jobs_Main')
                .update({
                    Customer_ID: effectiveCustomerId,
                    Customer_Name: effectiveCustomerName,
                    Origin_Location: pickup_address,
                    Dest_Location: delivery_address,
                    Vehicle_Type: vehicle_type || '4-Wheel',
                    Cargo_Type: effectiveCargoType,
                    ...(effectiveWeight ? { Weight_Kg: effectiveWeight } : {}),
                    Notes: combinedNotes,
                    ...(branch_id ? { Branch_ID: branch_id } : {}),
                    ...assign
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

        // Seed the per-item "pickup" manifest into Job_Scans so the driver app can
        // reconcile each item at delivery (received-at-dock vs delivered-per-drop).
        // Additive & non-fatal: WMS sends items_list [{code,label,qty,drop}].
        if (Array.isArray(items_list) && items_list.length > 0) {
            try {
                const scanRows = items_list
                    .filter((it: any) => (it?.code && String(it.code).trim()) || (it?.label && String(it.label).trim()))
                    .map((it: any) => ({
                        Job_ID: createdJob.Job_ID,
                        drop_index: it.drop != null ? Number(it.drop) - 1 : null, // WMS drop is 1-based; TMS delivery drop_index is 0-based
                        phase: 'pickup',
                        code: it.code ? String(it.code).trim() : null,
                        label: it.label ? String(it.label).trim() : null,
                        qty: Number(it.qty) || 1,
                        driver_id: (assign as any).Driver_ID || null,
                    }))
                if (scanRows.length > 0) {
                    const { error: seedErr } = await supabase.from('Job_Scans').insert(scanRows)
                    if (seedErr) console.error('[external jobs] pickup manifest seed error:', seedErr)
                }
            } catch (e) {
                console.error('[external jobs] pickup manifest seed exception:', e)
            }
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tms-e-pod.vercel.app'
        const trackingUrl = `${appUrl}/track/${createdJob.Job_ID}`

        // Trigger Admin Alert (Push & Toast)
        try {
            const { sendPushToAdmins } = await import('@/lib/actions/push-actions')
            await sendPushToAdmins({
                title: '📦 จองงานใหม่ (Enterprise API)',
                body: `งาน ID: ${createdJob.Job_ID} • ${wms_order_no ? `ออเดอร์: ${wms_order_no} • ` : ''}ลูกค้า: ${effectiveCustomerName}`,
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
