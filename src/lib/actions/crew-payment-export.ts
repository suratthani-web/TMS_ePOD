"use server"

/**
 * สร้างไฟล์ Excel "จ่ายพนักงาน" — แบบฟอร์มกลางใช้กับคนขับทุกคน/ทุกลูกค้า (2 แท็บ):
 *   1) สรุปจ่าย  — แบบฟอร์มสรุปการจ่ายเงินรถร่วม: 1 แถวต่อผู้รับเงิน + หัก(ค่าเคลม/หักค่ารถ/ค่าโทรศัพท์/อื่นๆ)
 *                  + หัก ณ ที่จ่าย + ยอดโอน (สูตร)
 *   2) <ชื่อคนขับ> — 1 แถวต่องาน: ราคา + ค่าใช้จ่ายแยกคอลัมน์ (รวม "ค่าเด็กรถ" — จ่ายรวมไปกับคนขับ)
 *                  + รวม / หัก ณ ที่จ่าย / ค่าโทรศัพท์ / คงเหลือ
 *
 * ระยะทาง = ไป-กลับ (Est_Distance_KM เก็บเที่ยวเดียว → ×2 เหมือน sync ชีต MASTER)
 * ค่าประหยัดน้ำมัน: ไม่คำนวณเอง — มาจากค่าใช้จ่ายเพิ่มเติมที่แอดมินใส่ในงาน หรือคีย์มือในไฟล์
 *
 * ช่องที่ระบบไม่มีข้อมูล (TRACKING/ที่อยู่/หักค่ารถ/ค่าโทรศัพท์/อื่นๆ) เว้นว่างให้แอดมินคีย์มือ
 */

import ExcelJS from "exceljs"
import { createAdminClient, createClient } from "@/utils/supabase/server"
import { isAdmin } from "@/lib/permissions"

type JobRow = {
    Job_ID: string
    Plan_Date: string | null
    Origin_Location: string | null
    Dest_Location: string | null
    Route_Name: string | null
    Est_Distance_KM: number | null
    Cost_Driver_Total: number | null
    extra_costs_json: string | unknown[] | null
    original_destinations_json: string | unknown[] | null
}

type ExtraCost = { type?: string; cost_driver?: number | string }

export type CrewPaymentPayee = {
    name: string
    accountName?: string | null
    accountNo?: string | null
    bankName?: string | null
    idCardNo?: string | null
}

// keyword จับค่าใช้จ่ายเข้าคอลัมน์ย่อยของแม่แบบ
const KW = {
    addStop: ['เพิ่มจุด', 'เพิ่มดรอป'],
    floor: ['ขึ้นชั้น', 'แรงงาน', 'ยกของ'],
    helper: ['เด็กรถ'],
    unload: ['ลงสินค้า', 'ลงของ'],
    fuel: ['ประหยัดน้ำมัน', 'น้ำมัน'],
}
const ALL_KW = Object.values(KW).flat()

function parseExtras(raw: unknown): ExtraCost[] {
    let v = raw
    if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return [] } }
    return Array.isArray(v) ? (v as ExtraCost[]) : []
}
function sumKw(extras: ExtraCost[], kw: string[]): number {
    return extras.filter(e => kw.some(k => (e.type || '').includes(k)))
        .reduce((s, e) => s + (Number(e.cost_driver) || 0), 0)
}
// ค่าที่ไม่เข้ากลุ่มไหน (ทางด่วน/งานพ่วง/ตีกลับ ฯลฯ) → รวมเข้าคอลัมน์สุดท้าย กันเงินตกหล่น
function unmatchedExtras(extras: ExtraCost[]): ExtraCost[] {
    return extras.filter(e => !ALL_KW.some(k => (e.type || '').includes(k)) && (Number(e.cost_driver) || 0) !== 0)
}

function allDrops(job: JobRow): string {
    let v: unknown = job.original_destinations_json
    if (typeof v === 'string') { try { v = JSON.parse(v) } catch { v = null } }
    if (Array.isArray(v)) {
        const names = v.map(d => String((d as { name?: unknown })?.name ?? '').trim()).filter(Boolean)
        if (names.length > 0) return names.join(' - ')
    }
    return job.Dest_Location || job.Route_Name || ''
}

// "2026-09-16" → "16/9/2569" (พ.ศ. แบบแม่แบบ)
function fmtDateTH(s: string | null): string {
    const d = String(s || '').slice(0, 10)
    const [y, m, day] = d.split('-').map(Number)
    if (!y || !m || !day) return ''
    return `${day}/${m}/${y + 543}`
}

function fmtPeriod(dates: string[]): string {
    const ds = dates.map(d => String(d).slice(0, 10)).filter(Boolean).sort()
    if (ds.length === 0) return ''
    const toParts = (s: string) => { const [y, m, d] = s.split('-'); return { d: Number(d), m: Number(m), y: Number(y) + 543 } }
    const a = toParts(ds[0]), b = toParts(ds[ds.length - 1])
    if (a.m === b.m && a.y === b.y) return `${a.d}-${b.d}/${a.m}/${a.y}`
    return `${a.d}/${a.m}/${a.y}-${b.d}/${b.m}/${b.y}`
}

// ชื่อแท็บแบบแม่แบบ = ชื่อต้น (ตัดคำนำหน้า) + ปลอดภัยสำหรับ Excel (ไม่มีอักขระต้องห้าม, ≤31)
function detailSheetName(name: string): string {
    const first = (name || '').trim()
        .replace(/^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.)\s*/, '')
        .split(/\s+/)[0] || ''
    const cleaned = first.replace(/[\[\]\:\*\?\/\\]/g, ' ').trim().slice(0, 31)
    return cleaned && cleaned !== 'สรุปจ่าย' ? cleaned : 'คนขับ'
}

const DETAIL_HEADERS = ['วันที่', 'TRACKING', 'ที่ขึ้นของ', 'จุดลงสินค้า', 'ระยะทาง', 'ราคา',
    'เพิ่มจุด', 'ค่าขึ้นชั้น', 'ค่าเด็กรถ', 'ค่าลงสินค้า', 'ค่าประหยัดน้ำมัน', 'รวม']

const THIN: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
}
const MONEY = '#,##0.00'
const YELLOW: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
const RED: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } }

function stripTitle(name: string): string {
    return (name || '').trim().replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, '')
}

/** แท็บรายละเอียดคนขับ — คืนเลขแถว "รวม" (ให้แท็บสรุปจ่ายอ้างอิง) */
function buildDetailSheet(
    ws: ExcelJS.Worksheet,
    jobs: JobRow[],
    payee: CrewPaymentPayee,
    whtRate: number
): number {
    ws.addRow(DETAIL_HEADERS)
    const header = ws.getRow(1)
    header.font = { bold: true }
    header.alignment = { horizontal: 'center', vertical: 'middle' }

    jobs.forEach((job, i) => {
        const r = i + 2 // แถวข้อมูลเริ่มที่ 2
        const extras = parseExtras(job.extra_costs_json)
        const price = Number(job.Cost_Driver_Total) || 0
        const others = unmatchedExtras(extras)
        const row = ws.addRow([
            fmtDateTH(job.Plan_Date),
            null, // TRACKING — เว้นให้คีย์มือ
            job.Origin_Location || null,
            allDrops(job),
            job.Est_Distance_KM ? Math.round(Number(job.Est_Distance_KM) * 2) : null, // ไป-กลับ
            price || null,
            sumKw(extras, KW.addStop) || null,
            sumKw(extras, KW.floor) || null,
            sumKw(extras, KW.helper) || null,
            sumKw(extras, KW.unload) || null,
            (sumKw(extras, KW.fuel) + others.reduce((s, e) => s + (Number(e.cost_driver) || 0), 0)) || null,
            { formula: `SUM(F${r}:K${r})` },
        ])
        // แม่แบบไม่มีคอลัมน์ "อื่นๆ" — บอกในโน้ตว่าช่องนี้รวมค่าอะไรมาบ้าง
        if (others.length > 0) {
            row.getCell(11).note = 'รวม: ' + others.map(e => `${e.type || 'อื่นๆ'} ${Number(e.cost_driver).toLocaleString()}`).join(', ')
        }
    })

    const lastRow = jobs.length + 1
    for (let r = 1; r <= lastRow; r++) {
        const row = ws.getRow(r)
        for (let c = 1; c <= DETAIL_HEADERS.length; c++) {
            const cell = row.getCell(c)
            cell.border = THIN
            if (r > 1 && c >= 6) cell.numFmt = MONEY
            if (r > 1 && c === 4) cell.alignment = { wrapText: true, vertical: 'top' }
            else if (r > 1) cell.alignment = { vertical: 'top' }
        }
    }

    // ท้ายแท็บตามแม่แบบ: รวม / หัก ณ ที่จ่าย / ค่าโทรศัพท์ (คีย์มือ) / คงเหลือ + บัญชีโอน
    const totalRow = lastRow + 1
    const label = (row: number, text: string) => {
        ws.mergeCells(`J${row}:K${row}`)
        ws.getCell(`J${row}`).value = text
        ws.getCell(`J${row}`).font = { bold: true }
        ws.getCell(`J${row}`).alignment = { horizontal: 'right' }
    }
    label(totalRow, 'รวม')
    ws.getCell(`L${totalRow}`).value = jobs.length > 0 ? { formula: `SUM(L2:L${lastRow})` } : 0
    label(totalRow + 1, `หัก ณ ที่จ่าย ${whtRate}%`)
    ws.getCell(`L${totalRow + 1}`).value = { formula: `L${totalRow}*${whtRate}/100` }
    label(totalRow + 2, 'ค่าโทรศัพท์')
    label(totalRow + 3, 'คงเหลือ')
    ws.getCell(`L${totalRow + 3}`).value = { formula: `L${totalRow}-L${totalRow + 1}+L${totalRow + 2}` }
    for (let r = totalRow; r <= totalRow + 3; r++) {
        ws.getCell(`L${r}`).numFmt = MONEY
        ws.getCell(`L${r}`).border = THIN
        ws.getCell(`L${r}`).font = { bold: r === totalRow || r === totalRow + 3 }
    }
    // ไฮไลต์แบบไฟล์ต้นฉบับ: ยอดรวมพื้นเหลือง, ป้ายค่าโทรศัพท์พื้นแดง (ช่องคีย์มือ), คงเหลือตัวแดง
    ws.getCell(`L${totalRow}`).fill = YELLOW
    ws.getCell(`J${totalRow + 2}`).fill = RED
    ws.getCell(`J${totalRow + 2}`).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getCell(`L${totalRow + 3}`).font = { bold: true, color: { argb: 'FFFF0000' } }

    // กล่องบัญชีโอน (เปลี่ยนตามผู้รับเงินที่เลือก): เลขบัญชีแดง + ชื่อบัญชี (ธนาคาร) ตัวใหญ่ พื้นเหลือง
    const boxTop = totalRow + 2
    ws.mergeCells(`C${boxTop}:E${boxTop}`)
    ws.mergeCells(`C${boxTop + 1}:E${boxTop + 1}`)
    const holder = stripTitle(payee.accountName || payee.name)
    const acct = ws.getCell(`C${boxTop}`)
    acct.value = payee.accountNo || null
    acct.font = { bold: true, size: 16, color: { argb: 'FFFF0000' } }
    const nameCell = ws.getCell(`C${boxTop + 1}`)
    nameCell.value = payee.bankName ? `${holder} (${payee.bankName})` : holder
    nameCell.font = { bold: true, size: 16 }
    for (const c of [acct, nameCell]) {
        c.fill = YELLOW
        c.alignment = { horizontal: 'center', vertical: 'middle' }
    }
    ws.getRow(boxTop).height = 24
    ws.getRow(boxTop + 1).height = 24

    // ยอดโอนสุทธิ ตัวใหญ่ พื้นเหลือง ใต้ตาราง (= คงเหลือ)
    const payRow = totalRow + 5
    ws.mergeCells(`J${payRow}:K${payRow}`)
    const pay = ws.getCell(`J${payRow}`)
    pay.value = { formula: `L${totalRow + 3}` }
    pay.numFmt = MONEY
    pay.fill = YELLOW
    pay.font = { bold: true, size: 14, color: { argb: 'FFFF0000' } }
    pay.alignment = { horizontal: 'center' }

    ws.getColumn(1).width = 12
    ws.getColumn(2).width = 12
    ws.getColumn(3).width = 12
    ws.getColumn(4).width = 60
    for (const c of [5, 6, 7, 8, 9, 10, 12]) ws.getColumn(c).width = 12
    ws.getColumn(11).width = 16 // ค่าประหยัดน้ำมัน
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    return totalRow
}

/** แท็บสรุปจ่าย — หัวตาราง 2 ชั้น (กลุ่ม "หัก" แตกเป็น 4 คอลัมน์) ตามแม่แบบ */
function buildSummarySheet(
    ws: ExcelJS.Worksheet,
    opts: { payee: CrewPaymentPayee; detailSheet: string; detailTotalRow: number; whtRate: number; claimRate: number; period: string }
) {
    const { payee, detailSheet, detailTotalRow, whtRate, claimRate, period } = opts

    ws.mergeCells('A1:Q1')
    ws.getCell('A1').value = 'แบบฟอร์มสรุปการจ่ายเงินรถร่วมสุราษฎร์ธานี'
    ws.getCell('A1').font = { bold: true, size: 14 }
    ws.getCell('A1').alignment = { horizontal: 'center' }

    const singles: [string, string][] = [
        ['A', 'ลำดับที่'], ['B', 'ผู้รับเงิน/คู่ค้า'], ['C', 'ชื่อ-นามสกุล'], ['D', 'เลขที่บัญชี'],
        ['E', 'ธนาคาร'], ['F', 'ที่อยู่'], ['G', 'เลขบัตรประชาชน'], ['H', 'รายได้'], ['M', 'คงเหลือ'],
        ['N', `หัก ณ ที่จ่าย ${whtRate}%`], ['O', 'ยอดโอน'], ['P', 'รอบวันที่'], ['Q', 'หมายเหตุ'], ['R', 'ภงด.'],
    ]
    for (const [col, text] of singles) {
        ws.mergeCells(`${col}2:${col}3`)
        ws.getCell(`${col}2`).value = text
    }
    ws.mergeCells('I2:L2')
    ws.getCell('I2').value = 'หัก'
    ;['ค่าเคลม', 'หักค่ารถ', 'ค่าโทรศัพท์', 'อื่นๆ'].forEach((t, i) => {
        ws.getCell(3, 9 + i).value = t
    })

    // แถวผู้รับเงิน (แถว 4) — รายได้อ้างอิงยอดรวมแท็บคนขับ
    const q = `'${detailSheet.replace(/'/g, "''")}'`
    const r = 4
    // ช่องว่างต้องเป็น null (ไม่ใช่ '') — สตริงว่างทำสูตรลบเลขเป็น #VALUE!
    ws.getRow(r).values = [
        1,
        null,                                 // ผู้รับเงิน/คู่ค้า (คีย์มือ)
        payee.accountName || payee.name,      // ชื่อ-นามสกุล
        payee.accountNo || null,
        payee.bankName || null,
        null,                                 // ที่อยู่ (คีย์มือ)
        payee.idCardNo || null,
        { formula: `${q}!L${detailTotalRow}` },
        claimRate > 0 ? { formula: `ROUND(H${r}*${claimRate}/100,2)` } : null, // ค่าเคลม
        null,                                 // หักค่ารถ (คีย์มือ)
        // ค่าโทรศัพท์: คีย์มือที่แท็บคนขับจุดเดียว → ดึงมา และ "บวก" เข้ายอด (ไม่อยู่ในฐานหัก ณ ที่จ่าย)
        { formula: `IF(${q}!L${detailTotalRow + 2}="","",${q}!L${detailTotalRow + 2})` },
        null,                                 // อื่นๆ (คีย์มือ)
        { formula: `H${r}-I${r}-J${r}+N(K${r})-L${r}` },
        { formula: `H${r}*${whtRate}/100` },
        { formula: `M${r}-N${r}` },
        period,
        null, null,
    ]

    for (let row = 2; row <= r; row++) {
        for (let c = 1; c <= 18; c++) {
            const cell = ws.getCell(row, c)
            cell.border = THIN
            if (row < r) {
                cell.font = { bold: true }
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
            } else if (c >= 8 && c <= 15) {
                cell.numFmt = MONEY
            }
        }
    }
    ws.getCell(`D${r}`).numFmt = '@'
    ws.getCell(`G${r}`).numFmt = '@'

    const widths = [8, 16, 24, 16, 14, 20, 16, 12, 10, 10, 12, 10, 12, 14, 12, 14, 14, 8]
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
}

export async function generateCrewPaymentXlsx(input: {
    jobIds: string[]
    payee: CrewPaymentPayee
    whtRate?: number
    claimRate?: number
}): Promise<{ success: true; filename: string; base64: string } | { success: false; message: string }> {
    try {
        const { jobIds, payee } = input
        const whtRate = Number(input.whtRate) >= 0 ? Number(input.whtRate) : 3
        const claimRate = Number(input.claimRate) || 0
        if (!jobIds || jobIds.length === 0) return { success: false, message: 'ยังไม่ได้เลือกงาน' }
        if (!payee?.name) return { success: false, message: 'ยังไม่ได้เลือกผู้รับเงิน' }

        const supabase = (await isAdmin()) ? await createAdminClient() : await createClient()
        const { data: jobsRaw, error } = await supabase
            .from('Jobs_Main')
            .select('Job_ID, Plan_Date, Origin_Location, Dest_Location, Route_Name, Est_Distance_KM, Cost_Driver_Total, extra_costs_json, original_destinations_json')
            .in('Job_ID', jobIds)
        if (error) return { success: false, message: error.message }
        const jobs = ((jobsRaw || []) as JobRow[]).sort((a, b) =>
            String(a.Plan_Date || '').localeCompare(String(b.Plan_Date || '')))
        if (jobs.length === 0) return { success: false, message: 'ไม่พบงานที่เลือก' }

        const period = fmtPeriod(jobs.map(j => j.Plan_Date || ''))
        const wb = new ExcelJS.Workbook()
        const wsSum = wb.addWorksheet('สรุปจ่าย')
        const detailName = detailSheetName(payee.accountName || payee.name)
        const wsDetail = wb.addWorksheet(detailName)

        const detailTotalRow = buildDetailSheet(wsDetail, jobs, payee, whtRate)
        buildSummarySheet(wsSum, { payee, detailSheet: detailName, detailTotalRow, whtRate, claimRate, period })

        const buf = await wb.xlsx.writeBuffer()
        const base64 = Buffer.from(buf).toString('base64')
        const safeName = payee.name.replace(/[^\p{L}\p{M}\p{N}]+/gu, '_').slice(0, 30)
        return { success: true, filename: `จ่ายพนักงาน_${safeName}_${period.replace(/\//g, '.')}.xlsx`, base64 }
    } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'สร้างไฟล์ไม่สำเร็จ' }
    }
}
