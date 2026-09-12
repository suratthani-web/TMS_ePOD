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
  | "complete"    // ส่งครบ + ตรงรหัสที่รับมา
  | "short"       // รับแล้วแต่ส่งยังไม่ครบ (รหัสถูก)
  | "over"        // ส่งเกินจำนวนที่รับ (รหัสถูก)
  | "mismatch"    // ส่งผิดรหัส/มีของนอกรายการที่รับ (ไม่ถูก)
  | "nopickup"    // ส่งแต่ไม่ได้สแกนตอนรับ (เทียบไม่ได้)

export interface JobScanStat {
  received: number
  delivered: number
  status: ScanStatus
}

const keyOf = (code: string | null, label: string | null) =>
  code?.trim() || `label:${(label || "").trim()}`

/**
 * ดึงสถานะสแกนของหลายงานในครั้งเดียว (กัน N+1) สำหรับป้ายในหน้ารายการ
 * เทียบ "รายรหัส" (ไม่ใช่แค่ยอดรวม) เพื่อจับส่งผิดชิ้น/นอกรายการ
 */
export async function getJobsScanStatus(jobIds: string[]): Promise<Record<string, JobScanStat>> {
  const out: Record<string, JobScanStat> = {}
  const ids = Array.from(new Set(jobIds.filter(Boolean).map(id => decodeURIComponent(id))))
  if (ids.length === 0) return out

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("Job_Scans")
    .select("Job_ID, phase, code, label, qty")
    .in("Job_ID", ids)

  if (error || !data) return out

  // per-job, per-key ledger
  const ledger = new Map<string, Map<string, { received: number; delivered: number }>>()
  for (const row of data as Array<{ Job_ID: string; phase: string; code: string | null; label: string | null; qty: number }>) {
    const jm = ledger.get(row.Job_ID) || new Map()
    const key = keyOf(row.code, row.label)
    const cur = jm.get(key) || { received: 0, delivered: 0 }
    const qty = Number(row.qty) || 0
    if (row.phase === "pickup") cur.received += qty
    else if (row.phase === "delivery") cur.delivered += qty
    jm.set(key, cur)
    ledger.set(row.Job_ID, jm)
  }

  for (const [jobId, jm] of ledger) {
    let totalReceived = 0, totalDelivered = 0
    let anyShort = false, anyOver = false, anyMismatch = false, anyReceived = false
    for (const { received, delivered } of jm.values()) {
      totalReceived += received
      totalDelivered += delivered
      if (received > 0) anyReceived = true
      if (received === 0 && delivered > 0) anyMismatch = true       // ส่งรหัสที่ไม่ได้รับ
      else if (delivered < received) anyShort = true
      else if (delivered > received) anyOver = true
    }
    let status: ScanStatus
    if (totalReceived === 0 && totalDelivered === 0) status = "none"
    else if (!anyReceived && totalDelivered > 0) status = "nopickup"
    else if (anyMismatch) status = "mismatch"
    else if (anyShort) status = "short"
    else if (anyOver) status = "over"
    else status = "complete"
    out[jobId] = { received: totalReceived, delivered: totalDelivered, status }
  }

  return out
}

/**
 * งานนี้ต้องบังคับสแกนไหม — แยกตามช่วงงาน:
 *  - phase 'pickup' (ตอนรับ): ยึดตาม flag ลูกค้า Master_Customers.Require_Scan เท่านั้น
 *    (ปิด = ไม่บังคับ) ไม่บังคับจาก manifest เพื่อให้คนขับรับของได้เร็ว
 *  - phase 'delivery' (ตอนส่ง): บังคับสแกนถ้ามี pickup manifest (cross-dock ต้อง
 *    reconcile รายชิ้นตอนส่ง) หรือ flag ลูกค้าเปิด
 */
export async function getScanRequirement(
  jobId: string,
  phase: "pickup" | "delivery" = "delivery"
): Promise<boolean> {
  jobId = decodeURIComponent(jobId)
  const supabase = createAdminClient()
  const { data: job } = await supabase
    .from("Jobs_Main")
    .select("Customer_ID")
    .eq("Job_ID", jobId)
    .single()

  // Resolve the customer's explicit flag (null = no linked customer record).
  let customerFlag: boolean | null = null
  if (job?.Customer_ID) {
    const { data: cust } = await supabase
      .from("Master_Customers")
      .select("Require_Scan")
      .eq("Customer_ID", job.Customer_ID)
      .maybeSingle()
    if (cust) customerFlag = !!cust.Require_Scan
  }

  // Pickup: the customer flag is authoritative — OFF means the driver can
  // receive without scanning, even for WMS cross-dock jobs.
  if (phase === "pickup") return customerFlag === true

  // Delivery: the customer flag ON forces it; otherwise a seeded per-item
  // pickup manifest still forces a scan so the items are reconciled at drop-off.
  if (customerFlag === true) return true
  const { count: pickupCount } = await supabase
    .from("Job_Scans")
    .select("*", { count: "exact", head: true })
    .eq("Job_ID", jobId)
    .eq("phase", "pickup")
  return (pickupCount ?? 0) > 0
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

/**
 * Driver confirms the actual quantity loaded onto the truck (cross-dock).
 * The checker's manifest (pickup scans) is the expected total; the driver taps
 * confirm in the TMS app when the loader has counted. Records a stamped note on
 * the job for the admin trail. Additive — does not change the scan reconcile.
 */
export async function confirmLoadedCount(jobId: string, actualQty: number): Promise<{ ok: boolean; expected: number; actual: number; match: boolean; error?: string }> {
  try {
    jobId = decodeURIComponent(jobId)
    const supabase = createAdminClient()
    const { data: rows } = await supabase
      .from("Job_Scans").select("qty").eq("Job_ID", jobId).eq("phase", "pickup")
    const expected = (rows || []).reduce((s: number, r: { qty: number | null }) => s + (Number(r.qty) || 0), 0)
    const actual = Number(actualQty) || 0
    const match = actual === expected
    const stamp = `[คนขับยืนยันโหลด ${actual}/${expected} ชิ้น${match ? "" : " ⚠️ไม่ตรง"} @ ${new Date().toISOString()}]`
    const { data: job } = await supabase.from("Jobs_Main").select("Notes").eq("Job_ID", jobId).single()
    const notes = `${job?.Notes ? job.Notes + " " : ""}${stamp}`.trim()
    const { error } = await supabase.from("Jobs_Main").update({ Notes: notes }).eq("Job_ID", jobId)
    if (error) return { ok: false, expected, actual, match, error: error.message }
    return { ok: true, expected, actual, match }
  } catch (e) {
    return { ok: false, expected: 0, actual: actualQty, match: false, error: e instanceof Error ? e.message : "error" }
  }
}
