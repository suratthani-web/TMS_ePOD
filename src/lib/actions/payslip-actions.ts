"use server"

import ExcelJS from "exceljs"
import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/utils/supabase/server"
import { getSession } from "@/lib/session"
import { getDriverSession } from "@/lib/auth-utils"
import { getActiveDrivers } from "@/lib/supabase/drivers"
import {
  sheetToGrid,
  extractSingleSheetXlsx,
  looksLikeDriverSheet,
  guessTotal,
  type PayslipGrid,
} from "@/lib/payslip/xlsx"
import { suggestDriverId, parseFileName, type DriverLite } from "@/lib/payslip/match"
import { buildVoucherData, type VoucherData } from "@/lib/payslip/voucher"
import { getDriverPaymentByIdWithJobs } from "@/lib/supabase/billing"
import { fetchAllRows } from "@/lib/supabase/analytics-helpers"
import { revalidatePath } from "next/cache"

const BUCKET = "company-assets"
const TABLE = "Driver_Payslips"

async function requireAdmin() {
  const session = await getSession()
  if (!session || !session.userId || (session.roleId !== 1 && session.roleId !== 2)) {
    throw new Error("ไม่มีสิทธิ์ (เฉพาะแอดมิน)")
  }
  return session
}

export interface SheetPreview {
  sheetName: string
  rowCount: number
  isDriverSheet: boolean
  suggestedDriverId: string | null
  total: number | null
}

export interface UploadResult {
  ok: boolean
  error?: string
  batchId?: string
  sourcePath?: string
  fileName?: string
  defaults?: { title: string; period: string; branch: string }
  sheets?: SheetPreview[]
  drivers?: DriverLite[]
}

/** ขั้นที่ 1: อัปโหลดไฟล์รวม + แยก sheet คืนรายการให้จับคู่ */
export async function uploadPayslipWorkbook(formData: FormData): Promise<UploadResult> {
  try {
    await requireAdmin()
    const file = formData.get("file") as File | null
    if (!file) return { ok: false, error: "ไม่พบไฟล์" }
    const fileName = file.name
    if (!/\.(xlsx|xlsm)$/i.test(fileName)) {
      return { ok: false, error: "รองรับเฉพาะไฟล์ .xlsx" }
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const batchId = randomUUID()
    const sourcePath = `payslips/_src/${batchId}.xlsx`

    const supabase = createAdminClient()
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(sourcePath, buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      })
    if (upErr) return { ok: false, error: "อัปโหลดไฟล์ไม่สำเร็จ: " + upErr.message }

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer as unknown as ArrayBuffer)

    const driverRows = await getActiveDrivers()
    const drivers: DriverLite[] = (driverRows || []).map((d: Record<string, unknown>) => ({
      id: String(d.Driver_ID),
      name: String(d.Driver_Name || d.Driver_ID),
      branch: (d.Branch_ID as string) ?? null,
    }))

    const sheets: SheetPreview[] = wb.worksheets.map((ws) => {
      const isDriver = looksLikeDriverSheet(ws)
      const grid = isDriver ? sheetToGrid(ws) : null
      return {
        sheetName: ws.name,
        rowCount: ws.rowCount || 0,
        isDriverSheet: isDriver,
        suggestedDriverId: isDriver ? suggestDriverId(ws.name, drivers) : null,
        total: grid ? guessTotal(grid) : null,
      }
    })

    const parsed = parseFileName(fileName)

    return {
      ok: true,
      batchId,
      sourcePath,
      fileName,
      defaults: { title: parsed.title, period: parsed.period, branch: parsed.branch },
      sheets,
      drivers,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }
  }
}

export interface ConfirmInput {
  batchId: string
  sourcePath: string
  fileName: string
  title: string
  period: string
  branch: string
  mappings: { sheetName: string; driverId: string }[]
}

/** ขั้นที่ 2: ยืนยันการจับคู่ -> สร้างสลิปรายคน */
export async function confirmPayslips(
  input: ConfirmInput
): Promise<{ ok: boolean; error?: string; created?: number }> {
  try {
    const session = await requireAdmin()
    const { batchId, sourcePath, fileName, title, period, branch, mappings } = input
    const valid = mappings.filter((m) => m.driverId && m.sheetName)
    if (valid.length === 0) return { ok: false, error: "ยังไม่ได้จับคู่คนขับ" }

    const supabase = createAdminClient()
    const { data: dl, error: dlErr } = await supabase.storage.from(BUCKET).download(sourcePath)
    if (dlErr || !dl) return { ok: false, error: "อ่านไฟล์ต้นทางไม่สำเร็จ" }
    const srcBuffer = Buffer.from(await dl.arrayBuffer())

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(srcBuffer as unknown as ArrayBuffer)

    // ชื่อคนขับสำหรับ snapshot
    const driverRows = await getActiveDrivers()
    const nameById = new Map<string, string>()
    for (const d of driverRows || []) {
      nameById.set(String((d as Record<string, unknown>).Driver_ID), String((d as Record<string, unknown>).Driver_Name || ""))
    }

    const records: Record<string, unknown>[] = []
    for (const m of valid) {
      const ws = wb.getWorksheet(m.sheetName)
      if (!ws) continue
      const grid: PayslipGrid = sheetToGrid(ws)
      const total = guessTotal(grid)

      // สร้างไฟล์ Excel รายคน
      let xlsxPath: string | null = null
      try {
        const singleBuf = await extractSingleSheetXlsx(srcBuffer, m.sheetName)
        xlsxPath = `payslips/${batchId}/${m.driverId}.xlsx`
        await supabase.storage.from(BUCKET).upload(xlsxPath, singleBuf, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        })
      } catch {
        xlsxPath = null
      }

      records.push({
        Driver_ID: m.driverId,
        driver_name: nameById.get(m.driverId) || m.sheetName,
        sheet_name: m.sheetName,
        title,
        period_label: period || null,
        branch_label: branch || null,
        total_amount: total,
        grid_json: grid,
        xlsx_url: xlsxPath,
        source_file: fileName,
        batch_id: batchId,
        uploaded_by: session.userId,
      })
    }

    if (records.length === 0) return { ok: false, error: "ไม่มีข้อมูลที่บันทึกได้" }

    const { error: insErr } = await supabase.from(TABLE).insert(records)
    if (insErr) return { ok: false, error: "บันทึกไม่สำเร็จ: " + insErr.message }

    revalidatePath("/billing/payslips")
    return { ok: true, created: records.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }
  }
}

/** รายการสลิปฝั่งแอดมิน (จัดกลุ่มตาม batch) */
export async function listPayslipsAdmin(): Promise<Record<string, unknown>[]> {
  await requireAdmin()
  const supabase = createAdminClient()
  const data = await fetchAllRows(() => supabase
    .from(TABLE)
    .select("id, Driver_ID, driver_name, sheet_name, title, period_label, branch_label, total_amount, batch_id, source_file, uploaded_at")
    .order("uploaded_at", { ascending: false }))
  return data || []
}

export async function deletePayslip(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin()
    const supabase = createAdminClient()
    const { data: row } = await supabase.from(TABLE).select("xlsx_url").eq("id", id).single()
    if (row?.xlsx_url) {
      await supabase.storage.from(BUCKET).remove([row.xlsx_url as string])
    }
    const { error } = await supabase.from(TABLE).delete().eq("id", id)
    if (error) return { ok: false, error: error.message }
    revalidatePath("/billing/payslips")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }
  }
}

export async function deletePayslipBatch(batchId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin()
    const supabase = createAdminClient()
    const { data: rows } = await supabase
      .from(TABLE)
      .select("id, xlsx_url")
      .or(`batch_id.eq.${batchId},id.eq.${batchId}`)
    const paths = (rows || []).map((r) => r.xlsx_url as string).filter(Boolean)
    paths.push(`payslips/_src/${batchId}.xlsx`)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    // ลบทั้ง batch (excel) และ row เดี่ยว (voucher ที่ batch_id เป็น null)
    const { error } = await supabase.from(TABLE).delete().or(`batch_id.eq.${batchId},id.eq.${batchId}`)
    if (error) return { ok: false, error: error.message }
    revalidatePath("/billing/payslips")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }
  }
}

// ============ Flow ใหม่: อ่านไฟล์ฝั่ง browser (กันไฟล์ใหญ่เกินลิมิต Server Action) ============

/** ดึงรายชื่อคนขับสำหรับจับคู่ (payload เล็ก) */
export async function getPayslipDrivers(): Promise<{ drivers: DriverLite[] }> {
  await requireAdmin()
  const rows = await getActiveDrivers()
  const drivers: DriverLite[] = (rows || []).map((d: Record<string, unknown>) => ({
    id: String(d.Driver_ID),
    name: String(d.Driver_Name || d.Driver_ID),
    branch: (d.Branch_ID as string) ?? null,
  }))
  return { drivers }
}

/** ขอ signed URL ให้ browser อัปไฟล์ตรงเข้า storage (ไม่ผ่าน body ของ Server Action) */
export async function createPayslipSignedUpload(
  path: string
): Promise<{ ok: boolean; path?: string; token?: string; error?: string }> {
  try {
    await requireAdmin()
    if (!/^payslips\/[A-Za-z0-9/_.\-]+\.(xlsx|xlsm)$/.test(path)) {
      return { ok: false, error: "path ไม่ถูกต้อง" }
    }
    const supabase = createAdminClient()
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
    if (error || !data) return { ok: false, error: error?.message || "สร้าง URL ไม่สำเร็จ" }
    return { ok: true, path: data.path, token: data.token }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }
  }
}

export interface ClientConfirmItem {
  driverId: string
  driverName?: string
  sheetName: string
  grid: PayslipGrid
  total: number | null
  xlsxPath: string | null
}

/** ยืนยันบันทึกสลิป (grid มาจาก browser แล้ว, payload เล็ก) */
export async function confirmPayslipsClient(input: {
  batchId: string
  title: string
  period: string
  branch: string
  fileName: string
  items: ClientConfirmItem[]
}): Promise<{ ok: boolean; created?: number; error?: string }> {
  try {
    const session = await requireAdmin()
    const items = (input.items || []).filter((it) => it.driverId && it.sheetName && it.grid)
    if (items.length === 0) return { ok: false, error: "ไม่มีรายการที่จับคู่" }

    const supabase = createAdminClient()
    const records = items.map((it) => ({
      Driver_ID: it.driverId,
      driver_name: it.driverName || it.sheetName,
      sheet_name: it.sheetName,
      title: input.title,
      period_label: input.period || null,
      branch_label: input.branch || null,
      total_amount: it.total,
      kind: "excel",
      grid_json: it.grid,
      voucher_json: null,
      xlsx_url: it.xlsxPath,
      source_file: input.fileName,
      batch_id: input.batchId,
      payment_id: null,
      uploaded_by: session.userId,
      uploaded_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from(TABLE).insert(records)
    if (error) return { ok: false, error: "บันทึกไม่สำเร็จ: " + error.message }

    revalidatePath("/billing/payslips")
    return { ok: true, created: records.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }
  }
}

/**
 * ส่งใบสำคัญจ่าย (ในระบบ) เข้าแอปคนขับ — แปลง Driver_Payments -> สลิป kind='voucher'
 * กัน push ซ้ำด้วย payment_id (upsert)
 */
export async function pushDriverPaymentToApp(
  paymentId: string
): Promise<{ ok: boolean; error?: string; driverName?: string }> {
  try {
    const session = await requireAdmin()
    const data = await getDriverPaymentByIdWithJobs(paymentId)
    if (!data) return { ok: false, error: "ไม่พบใบสำคัญจ่าย" }

    const { payment, jobs, company, bankInfo } = data
    const supabase = createAdminClient()

    // company จาก getDriverPaymentByIdWithJobs อาจเป็น accounting_profile (ไม่มี logo/company_name)
    // -> เติมโลโก้/ชื่อจาก company_profile เป็น fallback
    let companyForVoucher = (company || {}) as Record<string, unknown>
    if (!companyForVoucher.logo_url || !(companyForVoucher.company_name || companyForVoucher.company_name_th)) {
      const { data: cp } = await supabase
        .from("System_Settings")
        .select("value")
        .eq("key", "company_profile")
        .maybeSingle()
      if (cp?.value) {
        try {
          const parsed = typeof cp.value === "string" ? JSON.parse(cp.value) : cp.value
          companyForVoucher = { ...parsed, ...companyForVoucher }
          if (!companyForVoucher.logo_url && parsed.logo_url) companyForVoucher.logo_url = parsed.logo_url
        } catch {}
      }
    }

    const voucher: VoucherData = buildVoucherData(
      payment as never,
      jobs as never,
      companyForVoucher as never,
      bankInfo as never
    )

    // หา Driver_ID จากชื่อคนขับ (จ่ายรายคน)
    let driver = (await supabase
      .from("Master_Drivers")
      .select("Driver_ID, Driver_Name")
      .eq("Driver_Name", payment.Driver_Name)
      .maybeSingle()).data as { Driver_ID: string; Driver_Name?: string } | null

    // ถ้าไม่เจอ ลองเป็น "สังกัด (รถร่วม)" — voucher สังกัดผูกกับ Sub_ID โดยตรง
    // (เจ้าของสังกัดล็อกอินด้วย Sub_ID เห็นได้ ไม่ต้องมีบัญชีคนขับ)
    let subId: string | null = null
    if (!driver?.Driver_ID) {
      const { data: sub } = await supabase
        .from("Master_Subcontractors")
        .select("Sub_ID, Sub_Name")
        .or(`Sub_Name.eq.${payment.Driver_Name},Sub_ID.eq.${payment.Driver_Name}`)
        .maybeSingle()
      if (sub?.Sub_ID) {
        subId = sub.Sub_ID
        // ถ้ามีเจ้าของสังกัดที่เป็นคนขับด้วย ผูก Driver_ID ให้ด้วย (เขาเห็นทั้งสองทาง)
        const { data: owner } = await supabase
          .from("Master_Drivers")
          .select("Driver_ID")
          .eq("Sub_ID", sub.Sub_ID)
          .eq("Is_Sub_Owner", true)
          .maybeSingle()
        if (owner?.Driver_ID) driver = { Driver_ID: owner.Driver_ID }
      }
    }

    if (!driver?.Driver_ID && !subId) {
      return { ok: false, error: `ไม่พบผู้รับ "${payment.Driver_Name}" (คนขับ/สังกัด) ในระบบ` }
    }

    const record = {
      Driver_ID: driver?.Driver_ID ? String(driver.Driver_ID) : String(subId),
      Sub_ID: subId,
      driver_name: payment.Driver_Name,
      sheet_name: null,
      title: `ใบสำคัญจ่าย ${payment.Driver_Payment_ID}`,
      period_label: payment.Payment_Date || null,
      branch_label: null,
      total_amount: voucher.netTotal,
      kind: "voucher",
      grid_json: null,
      voucher_json: voucher,
      xlsx_url: null,
      source_file: null,
      batch_id: null,
      payment_id: payment.Driver_Payment_ID,
      uploaded_by: session.userId,
      uploaded_at: new Date().toISOString(),
    }

    // push ซ้ำ = อัปเดต (select -> update/insert; ไม่พึ่ง ON CONFLICT เพราะ index เป็น partial)
    const { data: existing } = await supabase
      .from(TABLE)
      .select("id")
      .eq("payment_id", payment.Driver_Payment_ID)
      .maybeSingle()

    const { error } = existing?.id
      ? await supabase.from(TABLE).update(record).eq("id", existing.id)
      : await supabase.from(TABLE).insert(record)
    if (error) return { ok: false, error: "บันทึกไม่สำเร็จ: " + error.message }

    return { ok: true, driverName: payment.Driver_Name }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }
  }
}

// ============ ฝั่งคนขับ (mobile) ============

export async function getMyPayslips(): Promise<Record<string, unknown>[]> {
  const session = await getDriverSession()
  const supabase = createAdminClient()
  const cols = "id, title, period_label, branch_label, total_amount, source_file, kind, uploaded_at, driver_name, Driver_ID, Sub_ID"

  // เจ้าของสังกัด: ดึงสลิปของคนขับทุกคนในสังกัด + voucher ที่ผูกสังกัดโดยตรง
  if (session?.subId) {
    const { data: subDrivers } = await supabase
      .from("Master_Drivers").select("Driver_ID").eq("Sub_ID", session.subId)
    const ids = (subDrivers || []).map((d: { Driver_ID: string }) => String(d.Driver_ID)).filter(Boolean)
    const byDriver = ids.length
      ? (await supabase.from(TABLE).select(cols).in("Driver_ID", ids).order("uploaded_at", { ascending: false }).limit(500)).data || []
      : []
    const bySub = (await supabase.from(TABLE).select(cols).eq("Sub_ID", session.subId).order("uploaded_at", { ascending: false }).limit(500)).data || []
    const merged = new Map<string, Record<string, unknown>>()
    for (const r of [...bySub, ...byDriver]) merged.set(String((r as { id: string }).id), r as Record<string, unknown>)
    return Array.from(merged.values()).sort((a, b) =>
      String(b.uploaded_at || "").localeCompare(String(a.uploaded_at || "")))
  }

  if (!session?.driverId) return []
  const { data } = await supabase
    .from(TABLE)
    .select("id, title, period_label, branch_label, total_amount, source_file, kind, uploaded_at")
    .eq("Driver_ID", session.driverId)
    .order("uploaded_at", { ascending: false })
    .limit(200)
  return data || []
}

export async function getMyPayslip(
  id: string
): Promise<{
  ok: boolean
  kind?: string
  grid?: PayslipGrid | null
  voucher?: VoucherData | null
  meta?: Record<string, unknown>
  hasXlsx?: boolean
  error?: string
}> {
  const session = await getDriverSession()
  if (!session?.driverId && !session?.subId) return { ok: false, error: "กรุณาเข้าสู่ระบบ" }
  const supabase = createAdminClient()
  const { data } = await supabase
    .from(TABLE)
    .select("id, Driver_ID, Sub_ID, title, period_label, branch_label, total_amount, kind, grid_json, voucher_json, xlsx_url, uploaded_at, driver_name")
    .eq("id", id)
    .single()
  if (!data) return { ok: false, error: "ไม่พบสลิป" }

  // ตรวจสิทธิ์: คนขับ = เจ้าของสลิป; เจ้าของสังกัด = สลิปอยู่ในสังกัดตน
  let allowed = false
  if (session?.subId) {
    allowed = data.Sub_ID === session.subId
    if (!allowed && data.Driver_ID) {
      const { data: d } = await supabase.from("Master_Drivers").select("Sub_ID").eq("Driver_ID", data.Driver_ID).maybeSingle()
      allowed = d?.Sub_ID === session.subId
    }
  } else {
    allowed = String(data.Driver_ID) === String(session.driverId)
  }
  if (!allowed) return { ok: false, error: "ไม่พบสลิป" }
  return {
    ok: true,
    kind: (data.kind as string) || "excel",
    grid: (data.grid_json as PayslipGrid) || null,
    voucher: (data.voucher_json as VoucherData) || null,
    hasXlsx: !!data.xlsx_url,
    meta: {
      id: data.id,
      title: data.title,
      period_label: data.period_label,
      branch_label: data.branch_label,
      total_amount: data.total_amount,
      uploaded_at: data.uploaded_at,
      driver_name: data.driver_name,
    },
  }
}

/**
 * เปิดใบสรุปจ่ายรถผ่านลิงก์สาธารณะ (public_token) — ไม่ต้องล็อกอิน
 * ใช้กับลิงก์ใน Flex card ไลน์. token สุ่มยาวเดาไม่ได้ = unlisted
 */
export async function getPayslipByPublicToken(token: string): Promise<{
  ok: boolean
  kind?: string
  grid?: PayslipGrid | null
  voucher?: VoucherData | null
  meta?: Record<string, unknown>
  error?: string
}> {
  if (!token || token.length < 8) return { ok: false, error: "ลิงก์ไม่ถูกต้อง" }
  const supabase = createAdminClient()
  const { data } = await supabase
    .from(TABLE)
    .select("id, title, period_label, branch_label, total_amount, kind, grid_json, voucher_json, uploaded_at, driver_name")
    .eq("public_token", token)
    .single()
  if (!data) return { ok: false, error: "ไม่พบสลิป หรือลิงก์หมดอายุ" }
  return {
    ok: true,
    kind: (data.kind as string) || "excel",
    grid: (data.grid_json as PayslipGrid) || null,
    voucher: (data.voucher_json as VoucherData) || null,
    meta: {
      title: data.title,
      period_label: data.period_label,
      branch_label: data.branch_label,
      total_amount: data.total_amount,
      driver_name: data.driver_name,
    },
  }
}
