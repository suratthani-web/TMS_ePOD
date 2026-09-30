import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { fillDeliveryDateIfEmpty } from '@/lib/supabase/delivery-date'
import { uploadFileToSupabase } from '@/lib/actions/supabase-upload'
import { pushToCustomerActive } from '@/lib/integrations/line'

import { transitionJobStatus } from "@/services/job-status-machine"

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { jobId, signatureBase64, lineUserId } = body

        if (!jobId || !signatureBase64) {
            return NextResponse.json({ success: false, error: 'Missing jobId or signatureBase64' }, { status: 400 })
        }

        const supabase = await createAdminClient()

        // 1. Verify job exists
        const { data: job, error: jobErr } = await supabase.from('Jobs_Main')
            .select('Job_ID, Customer_ID, Photo_Proof_Url')
            .eq('Job_ID', jobId)
            .maybeSingle()

        if (jobErr || !job) {
            return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 })
        }

        // 2. Decode base64 image
        const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')
        const fileName = `${jobId}_signature_${Date.now()}.png`

        // 3. Upload to Supabase Storage
        const uploadRes = await uploadFileToSupabase(buffer, fileName, 'image/png', 'POD_Photos')

        // 4. Update job status to Delivered using Machine
        const newPhotos = job.Photo_Proof_Url
            ? `${job.Photo_Proof_Url},${uploadRes.directLink}`
            : uploadRes.directLink

        const now = new Date()
        const timeString = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' })
        const dateString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

        const { error: updateError } = await supabase.from('Jobs_Main')
            .update({
                Photo_Proof_Url: newPhotos,
                Signature_Url: uploadRes.directLink,
                Actual_Delivery_Time: timeString,
            })
            .eq('Job_ID', jobId)
        if (updateError) throw updateError
        // Keep the admin-set delivery date; only fill when missing
        await fillDeliveryDateIfEmpty(supabase, jobId, now)

        const result = await transitionJobStatus(jobId, 'Delivered', {
            userId: lineUserId || 'LIFF_USER',
            reason: 'LIFF: Digital Signature Submitted'
        })

        if (!result.success) {
            return NextResponse.json({ success: false, error: result.message }, { status: 500 })
        }

        // 5. Trigger Customer Satisfaction Survey (If customer has LINE bound)
        try {
            if (job.Customer_ID) {
                let custTarget: { Line_User_ID?: string | null; Line_User_ID_2?: string | null } | null = null

                // 1. Try Master_Customers (has both bot ids and Line_Notify_Disabled)
                try {
                    const { data: custInfo } = await supabase.from('Master_Customers')
                        .select('Line_User_ID, Line_User_ID_2, Line_Notify_Disabled, Customer_Name')
                        .eq('Customer_ID', job.Customer_ID)
                        .maybeSingle()
                    const isDisabled = custInfo?.Line_Notify_Disabled || (custInfo?.Customer_Name && (custInfo.Customer_Name.includes('สยามรุ่งเรือง') || custInfo.Customer_Name.toLowerCase().includes('siam rungruang')));
                    if (!isDisabled && custInfo && (custInfo.Line_User_ID || custInfo.Line_User_ID_2)) {
                        custTarget = custInfo
                    }
                } catch {}

                // 2. Try Master_Users as fallback (e.g. 'uni') — primary bot only
                if (!custTarget) {
                    try {
                        const { data: userCust } = await supabase.from('Master_Users')
                            .select('Line_User_ID')
                            .ilike('Username', job.Customer_ID)
                            .maybeSingle()
                        if (userCust?.Line_User_ID) {
                            custTarget = { Line_User_ID: userCust.Line_User_ID }
                        }
                    } catch {}
                }

                if (custTarget) {
                    await pushToCustomerActive(custTarget, `📦 [แจ้งเตือนการส่งมอบสินค้า]\n\nเรียนคุณลูกค้า สินค้าของงาน #${jobId} ได้รับการจัดส่งเรียบร้อยแล้วครับ!\n\n⭐️ เพื่อการปรับปรุงและพัฒนาบริการที่ดีขึ้น กรุณาให้คะแนนความพึงพอใจโดยการส่งตัวเลขกลับหาเรา:\nพิมพ์ "5" สำหรับ ดีเยี่ยม ⭐️⭐️⭐️⭐️⭐️\nพิมพ์ "4" สำหรับ ดีมาก ⭐️⭐️⭐️⭐️\nพิมพ์ "3" สำหรับ ปานกลาง ⭐️⭐️⭐️\nพิมพ์ "2" สำหรับ พอใช้ ⭐️⭐️\nพิมพ์ "1" สำหรับ ต้องปรับปรุง ⭐️`)
                }
            }
        } catch (surveyErr) {
            console.error('[LIFF Signature Survey Error]', surveyErr)
        }

        return NextResponse.json({ success: true, url: uploadRes.directLink })

    } catch (err: unknown) {
        console.error('[LIFF Signature API Error]', err)
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
    }
}
