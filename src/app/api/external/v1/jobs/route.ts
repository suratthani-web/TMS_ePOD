import { validateApiKey } from '@/lib/security/api-security'
import { createAdminClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { todayTH } from '@/lib/utils/date-th'

/**
 * Enterprise Integration API (v1)
 * Allows external ERP/SAP systems to create jobs automatically.
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
            pickup_address,
            delivery_address,
            items,
            vehicle_type,
            plan_date,
            branch_id // optional: scope the job to a specific branch (e.g. 'HQ')
        } = body

        // Validation
        if (!customer_id || !pickup_address || !delivery_address) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // Insert new job
        const { data, error } = await supabase
            .from('Jobs_Main')
            .insert([{
                Customer_ID: customer_id,
                Pickup_Address: pickup_address,
                Delivery_Address: delivery_address,
                Job_Details: items,
                Vehicle_Type: vehicle_type,
                Plan_Date: plan_date || todayTH(),
                Job_Status: 'New',
                Source: 'Enterprise_API',
                // Additive: only set when the caller provides it; omitting keeps the
                // previous behaviour (Branch_ID stays null = visible to all branches).
                ...(branch_id ? { Branch_ID: branch_id } : {})
            }])
            .select()

        if (error) throw error

        // Trigger Admin Alert (Push & Toast)
        try {
            const { sendPushToAdmins } = await import('@/lib/actions/push-actions')
            await sendPushToAdmins({
                title: '📦 จองงานใหม่ (Enterprise API)',
                body: `งาน ID: ${data[0].Job_ID} • ลูกค้า: ${customer_id}`,
                url: '/jobs',
                type: 'standard'
            }, null) // Broadcast to all Super Admins for Enterprise API
        } catch (e) {
            console.error("Push broadcast failed:", e)
        }

        return NextResponse.json({ 
            success: true, 
            message: 'Job created via Enterprise API',
            job_id: data[0].Job_ID 
        }, { status: 201 })

    } catch (err) {
        console.error('API Error:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
