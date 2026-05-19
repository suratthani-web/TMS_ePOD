import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/server'
import { uploadFileToSupabase } from '@/lib/actions/supabase-upload'
import { pushToUser } from '@/lib/integrations/line'

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

        // 4. Update job status to Delivered
        const newPhotos = job.Photo_Proof_Url
            ? `${job.Photo_Proof_Url},${uploadRes.directLink}`
            : uploadRes.directLink

        const now = new Date()
        const timeString = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' })
        const dateString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

        const { error: updateErr } = await supabase.from('Jobs_Main')
            .update({
                Job_Status: 'Delivered',
                Photo_Proof_Url: newPhotos,
                Actual_Delivery_Time: timeString,
                Delivery_Date: dateString
            })
            .eq('Job_ID', jobId)

        if (updateErr) {
            return NextResponse.json({ success: false, error: `Failed to update job: ${updateErr.message}` }, { status: 500 })
        }

        // 5. Trigger Customer Satisfaction Survey (If customer has LINE bound)
        try {
            if (job.Customer_ID) {
                const { data: custInfo } = await supabase.from('Master_Customers')
                    .select('Line_User_ID')
                    .eq('Customer_ID', job.Customer_ID)
                    .single()
                
                if (custInfo?.Line_User_ID) {
                    await pushToUser(custInfo.Line_User_ID, `📦 [แจ้งเตือนการส่งมอบสินค้า]\n\nเรียนคุณลูกค้า สินค้าของงาน #${jobId} ได้รับการจัดส่งเรียบร้อยแล้วครับ!\n\n⭐️ เพื่อการปรับปรุงและพัฒนาบริการที่ดีขึ้น กรุณาให้คะแนนความพึงพอใจโดยการส่งตัวเลขกลับหาเรา:\nพิมพ์ "5" สำหรับ ดีเยี่ยม ⭐️⭐️⭐️⭐️⭐️\nพิมพ์ "4" สำหรับ ดีมาก ⭐️⭐️⭐️⭐️\nพิมพ์ "3" สำหรับ ปานกลาง ⭐️⭐️⭐️\nพิมพ์ "2" สำหรับ พอใช้ ⭐️⭐️\nพิมพ์ "1" สำหรับ ต้องปรับปรุง ⭐️`)
                }
            }
        } catch (surveyErr) {
            console.error('[LIFF Signature Survey Error]', surveyErr)
        }

        return NextResponse.json({ success: true, url: uploadRes.directLink })

    } catch (err: any) {
        console.error('[LIFF Signature API Error]', err)
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
}
