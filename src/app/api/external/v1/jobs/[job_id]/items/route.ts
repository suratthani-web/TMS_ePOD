import { validateApiKey } from '@/lib/security/api-security'
import { createAdminClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const COMPLETED_STATUSES = ['Completed', 'Delivered', 'Verified', 'Billed', 'Paid', 'Cancelled']

/**
 * Enterprise Integration API (v1) — เพิ่มสินค้าเข้างานเดิม (post-creation)
 * ใช้เมื่อลูกค้าเพิ่มของหลังเช็คเกอร์สร้างงานแล้ว: WMS สแกนของเพิ่ม → ยิงเข้าดรอปนั้น
 *
 * POST /api/external/v1/jobs/{job_id}/items
 * body: { items: [{ code?, label?, qty?, drop? }], notes?, wms_order_no? }
 *   - drop = เลขดรอป (1-based ตามที่ WMS ใช้); ถ้าไม่ส่ง = ดรอปแรก (1)
 * เพิ่มแถว phase 'pickup' ลง Job_Scans → คนขับ reconcile เห็นของที่เพิ่มที่ดรอปนั้นทันที
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ job_id: string }> }
) {
    try {
        const authHeader = req.headers.get('Authorization')
        try {
            await validateApiKey(authHeader || '')
        } catch (authError: unknown) {
            return NextResponse.json({ error: (authError as Error).message }, { status: 401 })
        }

        const { job_id: rawJobId } = await params
        const jobId = decodeURIComponent(String(rawJobId || '')).trim()
        if (!jobId) {
            return NextResponse.json({ error: 'Missing job_id in path' }, { status: 400 })
        }

        const body = await req.json().catch(() => ({}))
        const items = Array.isArray(body?.items) ? body.items : []
        if (items.length === 0) {
            return NextResponse.json({ error: 'Missing required field: items[]' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // 1. หา job (ตาม Job_ID; ถ้าไม่เจอ ลองจาก wms_order_no ใน Notes)
        let { data: job } = await supabase
            .from('Jobs_Main')
            .select('Job_ID, Job_Status, Driver_ID, Notes')
            .eq('Job_ID', jobId)
            .maybeSingle()

        if (!job && body?.wms_order_no) {
            const res = await supabase
                .from('Jobs_Main')
                .select('Job_ID, Job_Status, Driver_ID, Notes')
                .ilike('Notes', `%[WMS: ${String(body.wms_order_no).trim()}]%`)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            job = res.data
        }

        if (!job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 })
        }

        // 2. งานที่ปิดแล้วห้ามเพิ่มของ
        if (COMPLETED_STATUSES.includes(job.Job_Status || '')) {
            return NextResponse.json(
                { error: `ไม่สามารถเพิ่มของได้ งานอยู่สถานะ "${job.Job_Status}" (ปิดงานแล้ว)` },
                { status: 409 }
            )
        }

        // 3. append pickup manifest rows (drop 1-based → drop_index 0-based)
        const scanRows = items
            .filter((it: any) => (it?.code && String(it.code).trim()) || (it?.label && String(it.label).trim()))
            .map((it: any) => ({
                Job_ID: job!.Job_ID,
                drop_index: it?.drop != null ? Number(it.drop) - 1 : 0,
                phase: 'pickup',
                code: it?.code ? String(it.code).trim() : null,
                label: it?.label ? String(it.label).trim() : null,
                qty: Number(it?.qty) || 1,
                driver_id: job!.Driver_ID || null,
            }))

        if (scanRows.length === 0) {
            return NextResponse.json({ error: 'items[] ต้องมี code หรือ label อย่างน้อยหนึ่งอย่าง' }, { status: 400 })
        }

        const { error: insErr } = await supabase.from('Job_Scans').insert(scanRows)
        if (insErr) throw insErr

        // 4. บันทึกร่องรอยการเพิ่มของลง Notes (additive, non-fatal)
        try {
            const addedSummary = scanRows
                .map((r: { code: string | null; label: string | null; qty: number; drop_index: number | null }) =>
                    `${r.label || r.code} x${r.qty}${r.drop_index != null ? ` (ดรอป ${r.drop_index + 1})` : ''}`)
                .join(', ')
            const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
            const note = `[เพิ่มของ ${stamp}] ${addedSummary}`
            await supabase
                .from('Jobs_Main')
                .update({ Notes: job.Notes ? `${job.Notes} | ${note}` : note })
                .eq('Job_ID', job.Job_ID)
        } catch (e) {
            console.warn('[external jobs/items] note append failed:', e)
        }

        return NextResponse.json({
            success: true,
            message: 'เพิ่มสินค้าเข้างานสำเร็จ',
            job_id: job.Job_ID,
            items_added: scanRows.length,
        }, { status: 200 })

    } catch (err: any) {
        console.error('API Error (POST /api/external/v1/jobs/[job_id]/items):', err)
        return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 })
    }
}
