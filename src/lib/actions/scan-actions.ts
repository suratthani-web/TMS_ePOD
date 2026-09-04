"use server"

import { createAdminClient } from "@/utils/supabase/server"

export interface ReconciledItem {
  key: string          // code ถ้ามี ไม่งั้น label:<label>
  code: string | null
  label: string
  received: number     // รวม phase=pickup
  delivered: number    // รวม phase=delivery (ทุกดรอป)
}

/**
 * ดึง scan ของงานมารวมยอด "รับ vs ส่ง" ต่อชิ้น (จัดกลุ่มด้วย code; ถ้าไม่มี code ใช้ label)
 * ใช้เป็น checklist ตอนส่ง: ชิ้นไหนรับมากี่ชิ้น ส่งไปแล้วกี่ชิ้น เหลือเท่าไร
 */
export async function getJobScans(jobId: string): Promise<ReconciledItem[]> {
  jobId = decodeURIComponent(jobId)
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("Job_Scans")
    .select("phase, code, label, qty")
    .eq("Job_ID", jobId)

  if (error || !data) return []

  const map = new Map<string, ReconciledItem>()
  for (const row of data as Array<{ phase: string; code: string | null; label: string | null; qty: number }>) {
    const code = row.code?.trim() || null
    const label = row.label?.trim() || code || "(ไม่ระบุ)"
    const key = code || `label:${label}`
    const cur = map.get(key) || { key, code, label, received: 0, delivered: 0 }
    const qty = Number(row.qty) || 0
    if (row.phase === "pickup") cur.received += qty
    else if (row.phase === "delivery") cur.delivered += qty
    map.set(key, cur)
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "th"))
}

export type ScanStatus =
  | "none"        // ไม่ได้สแกนเลย
  | "complete"    // ส่งครบตามที่รับ
  | "short"       // รับแล้วแต่ส่งยังไม่ครบ
  | "over"        // ส่งเกินที่รับ
  | "nopickup"    // ส่งแต่ไม่ได้สแกนตอนรับ (เทียบความครบไม่ได้)

export interface JobScanStat {
  received: number
  delivered: number
  status: ScanStatus
}

/**
 * ดึงสถานะสแกนของหลายงานในครั้งเดียว (กัน N+1) สำหรับป้ายในหน้ารายการ
 */
export async function getJobsScanStatus(jobIds: string[]): Promise<Record<string, JobScanStat>> {
  const out: Record<string, JobScanStat> = {}
  const ids = Array.from(new Set(jobIds.filter(Boolean).map(id => decodeURIComponent(id))))
  if (ids.length === 0) return out

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("Job_Scans")
    .select("Job_ID, phase, qty")
    .in("Job_ID", ids)

  if (error || !data) return out

  for (const row of data as Array<{ Job_ID: string; phase: string; qty: number }>) {
    const cur = out[row.Job_ID] || { received: 0, delivered: 0, status: "none" as ScanStatus }
    const qty = Number(row.qty) || 0
    if (row.phase === "pickup") cur.received += qty
    else if (row.phase === "delivery") cur.delivered += qty
    out[row.Job_ID] = cur
  }

  for (const id of Object.keys(out)) {
    const s = out[id]
    if (s.received === 0 && s.delivered === 0) s.status = "none"
    else if (s.received === 0 && s.delivered > 0) s.status = "nopickup"
    else if (s.delivered > s.received) s.status = "over"
    else if (s.delivered >= s.received) s.status = "complete"
    else s.status = "short"
  }

  return out
}

export interface JobScanSummary {
  items: ReconciledItem[]
  drops: { dropIndex: number | null; items: { label: string; qty: number }[]; total: number }[]
  totalReceived: number
  totalDelivered: number
  hasData: boolean
}

/**
 * สรุปการสแกนสำหรับฝั่งแอดมิน: รวมยอดรับ/ส่งต่อชิ้น + แยกการส่งต่อดรอป
 */
export async function getJobScanSummary(jobId: string): Promise<JobScanSummary> {
  jobId = decodeURIComponent(jobId)
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("Job_Scans")
    .select("phase, code, label, qty, drop_index")
    .eq("Job_ID", jobId)

  const empty: JobScanSummary = { items: [], drops: [], totalReceived: 0, totalDelivered: 0, hasData: false }
  if (error || !data || data.length === 0) return empty

  const itemMap = new Map<string, ReconciledItem>()
  const dropMap = new Map<string, { dropIndex: number | null; items: Map<string, { label: string; qty: number }>; total: number }>()
  let totalReceived = 0
  let totalDelivered = 0

  for (const row of data as Array<{ phase: string; code: string | null; label: string | null; qty: number; drop_index: number | null }>) {
    const code = row.code?.trim() || null
    const label = row.label?.trim() || code || "(ไม่ระบุ)"
    const key = code || `label:${label}`
    const qty = Number(row.qty) || 0

    const cur = itemMap.get(key) || { key, code, label, received: 0, delivered: 0 }
    if (row.phase === "pickup") { cur.received += qty; totalReceived += qty }
    else if (row.phase === "delivery") {
      cur.delivered += qty
      totalDelivered += qty
      const dKey = String(row.drop_index ?? "null")
      const d = dropMap.get(dKey) || { dropIndex: row.drop_index ?? null, items: new Map(), total: 0 }
      const di = d.items.get(key) || { label, qty: 0 }
      di.qty += qty
      d.items.set(key, di)
      d.total += qty
      dropMap.set(dKey, d)
    }
    itemMap.set(key, cur)
  }

  return {
    items: Array.from(itemMap.values()).sort((a, b) => a.label.localeCompare(b.label, "th")),
    drops: Array.from(dropMap.values())
      .sort((a, b) => (a.dropIndex ?? 0) - (b.dropIndex ?? 0))
      .map(d => ({ dropIndex: d.dropIndex, items: Array.from(d.items.values()), total: d.total })),
    totalReceived,
    totalDelivered,
    hasData: true,
  }
}
