'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { computeTripCarbon } from '@/lib/utils/job-carbon'
import { getCarbonFactors } from '@/lib/actions/carbon-factors'
import ExcelJS from 'exceljs'
import { getSystemSetting } from './system-settings-actions'
import { 
    INVOICE_TEMPLATE_LUMP_SUM_BASE64, 
    INVOICE_TEMPLATE_PER_UNIT_BASE64 
} from '../templates/invoice_template_base64'

// 4. Localization: Map for English keys to Thai labels
const EXPENSE_MAP: Record<string, string> = {
    'Labor': 'แรงงานยกของ',
    'Extra Dropoff': 'เพิ่มจุดลงของ',
    'Wait': 'รอลงเกินเวลา',
    'Overtime': 'รอลงเกินเวลา',
    'Expressway': 'ค่าทางด่วน',
    'Parking': 'ค่าจอดรถ',
    'Other': 'อื่นๆ',
    'Fuel Surcharge': 'เซอร์ชาร์จน้ำมัน',
    'Price_Cust_Extra': 'เพิ่มจุดลงของ',
    'Charge_Labor': 'แรงงานยกของ',
    'Charge_Wait': 'รอลงเกินเวลา',
    'Price_Cust_Other': 'อื่นๆ'
}

const normalizeVehicleType = (v: string) => {
    if (!v || v === '-' || v.trim() === '') return '-'
    const normalized = v.toLowerCase().trim()
    if (normalized.startsWith('22')) return '22-Wheel'
    if (normalized.startsWith('18')) return '18-Wheel'
    if (normalized.startsWith('10') || normalized.includes('10w') || normalized.includes('10wheel')) return '10-Wheel'
    if (normalized.startsWith('4') || normalized.includes('4w') || normalized.includes('4wheel') || normalized.includes('4 wheel')) return '4-Wheel'
    if (normalized.startsWith('6') || normalized.includes('6w') || normalized.includes('6wheel') || normalized.includes('6 wheel')) return '6-Wheel'
    return v
}

const ORIGIN_COL_WIDTH = 21.3
const MIN_TABLE_ROWS = 10 // แถวขั้นต่ำของตารางงาน (รวมแถวว่าง)
const DEST_COL_WIDTH = 27.7

const asString = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : String(value)
const asDateInput = (value: unknown): string | number | Date | null => {
    if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) return value
    return null
}

// ความยาวที่ "กินที่" จริง — สระบน/ล่าง/วรรณยุกต์ไทย (combining marks) ไม่เพิ่มความกว้าง
const visibleLength = (text: string) => text.replace(/\p{M}/gu, '').length

// ประมาณจำนวนบรรทัดเมื่อ wrap ในคอลัมน์กว้าง `width` (หน่วยความกว้างคอลัมน์ Excel) ที่ฟอนต์ 11pt
const PLACE_FONT_SIZE = 11
const estimateLines = (text: string, width: number) => {
    const perLine = Math.max(8, Math.floor(width * 1.25))
    return Math.max(1, Math.ceil(visibleLength(text) / perLine))
}

export async function exportInvoiceExcel(invoiceId: string) {
    try {
        const supabase = createAdminClient()

        // 1. Get Data
        const { data: invoice } = await supabase.from('invoices').select('*, Master_Customers(*)').eq('Invoice_ID', invoiceId).maybeSingle()
        const { data: bn } = !invoice ? await supabase.from('Billing_Notes').select('*').eq('Billing_Note_ID', invoiceId).maybeSingle() : { data: null }
        const finalDoc = invoice || bn
        if (!finalDoc) throw new Error("ไม่พบข้อมูลเอกสาร")

        let jobs: Record<string, unknown>[] = []
        if (invoice?.Items_JSON && Array.isArray(invoice.Items_JSON)) {
            jobs = invoice.Items_JSON
        } else {
            const { data: dbJobs } = await supabase.from('Jobs_Main').select('*').or(`Invoice_ID.eq."${invoiceId}",Billing_Note_ID.eq."${invoiceId}"`)
            jobs = dbJobs || []
        }
        if (!jobs || jobs.length === 0) throw new Error("ไม่พบรายการงาน")

        // 1.2 Sort Jobs by Date (Oldest to Newest)
        jobs.sort((a, b) => {
            const planDateA = asDateInput(a.Plan_Date)
            const planDateB = asDateInput(b.Plan_Date)
            const dateA = planDateA ? new Date(planDateA).getTime() : 0
            const dateB = planDateB ? new Date(planDateB).getTime() : 0
            return dateA - dateB
        })

        const customerId = finalDoc.Customer_ID || jobs[0].Customer_ID
        const { data: customer } = await supabase.from('Master_Customers').select('Price_Per_Unit').eq('Customer_ID', customerId).maybeSingle()
        const customerUnitPrice = customer?.Price_Per_Unit || 0

        const accountingProfile = await getSystemSetting('accounting_profile', {
            company_name_th: "บริษัท ดีดีเซอร์วิสแอนด์ทรานสปอร์ต จำกัด",
            address: "เลขที่ 99/2 หมู่ที่ 3 ตำบลท่าทราย อำเภอเมือง จังหวัดสมุทรสาคร 74000",
            tax_id: "0745559001353 (สำนักงานใหญ่)"
        })

        // 1.5 Determine Template Type
        // If any job has Price_Per_Unit > 0, we use PER_UNIT template
        const isPerUnit = jobs.some(j => Number(j.Price_Per_Unit) > 0 || Number(customerUnitPrice) > 0)
        const templateBase64 = isPerUnit ? INVOICE_TEMPLATE_PER_UNIT_BASE64 : INVOICE_TEMPLATE_LUMP_SUM_BASE64

        // 2. Load Template (Vercel Fix: Embedded Base64)
        const workbook = new ExcelJS.Workbook()
        const templateBuffer = Buffer.from(templateBase64, 'base64')
        await workbook.xlsx.load(templateBuffer as unknown as ArrayBuffer)
        const worksheet = workbook.getWorksheet(1)
        if (!worksheet) throw new Error("Worksheet not found")

        // ปลายทางกว้างขึ้น (ไฟล์ที่ฝ่ายบัญชีปรับเอง: 19.8 → 27.7) ให้รายชื่อดรอปอ่านได้
        worksheet.getColumn(6).width = DEST_COL_WIDTH

        // 3. Clear Dynamic Range ONLY (Protect Main Headers and Footer)
        // Clear only I7-L7 (Dynamic headers - Only for Lump Sum)
        if (!isPerUnit) {
            for (let c = 9; c <= 12; c++) { worksheet.getRow(7).getCell(c).value = null }
        }
        
        // Clear ONLY data rows 10-26 (Template default rows)
        // We preserve row 27 and beyond which contains the footer/summary template
        for (let r = 10; r <= 26; r++) {
            const row = worksheet.getRow(r)
            for (let c = 1; c <= 13; c++) { 
                const cell = row.getCell(c)
                cell.value = null 
            }
        }

        // 4. Handle Dynamic Rows for > 17 jobs
        const jobsCount = jobs.length
        const templateRows = 17 // Max rows before sliding
        // summaryBaseRow is FIXED at 27 if jobs <= 17, slides only if more.
        const summaryBaseRow = jobsCount <= templateRows ? 27 : 10 + jobsCount
        const extraRowsNeeded = jobsCount > templateRows ? jobsCount - templateRows : 0
        
        const shiftMerges = (ws: ExcelJS.Worksheet, insertRowIndex: number, numRows: number) => {
            if (!ws.model.merges || ws.model.merges.length === 0) return
            
            const newMerges: string[] = []
            for (const merge of ws.model.merges) {
                const parts = merge.split(':')
                if (parts.length === 2) {
                    const startCol = parts[0].replace(/[0-9]/g, '')
                    const startRow = parseInt(parts[0].replace(/[^0-9]/g, ''), 10)
                    const endCol = parts[1].replace(/[0-9]/g, '')
                    const endRow = parseInt(parts[1].replace(/[^0-9]/g, ''), 10)
                    
                    const newStartRow = startRow >= insertRowIndex ? startRow + numRows : startRow
                    const newEndRow = endRow >= insertRowIndex ? endRow + numRows : endRow
                    
                    newMerges.push(`${startCol}${newStartRow}:${endCol}${newEndRow}`)
                } else {
                    newMerges.push(merge)
                }
            }
            ws.model.merges = newMerges
        }

        const safeMergeCells = (r1: number, c1: number, r2: number, c2: number) => {
            if (worksheet.model.merges) {
                for (const merge of [...worksheet.model.merges]) {
                    const parts = merge.split(':')
                    if (parts.length === 2) {
                        const startCol = parts[0].replace(/[0-9]/g, '')
                        const startRow = parseInt(parts[0].replace(/[^0-9]/g, ''), 10)
                        const endCol = parts[1].replace(/[0-9]/g, '')
                        const endRow = parseInt(parts[1].replace(/[^0-9]/g, ''), 10)
                        
                        const colToNumber = (colStr: string) => {
                            let num = 0
                            for (let i = 0; i < colStr.length; i++) {
                                num = num * 26 + (colStr.charCodeAt(i) - 64)
                            }
                            return num
                        }
                        const startColNum = colToNumber(startCol)
                        const endColNum = colToNumber(endCol)
                        
                        const rowOverlap = Math.max(r1, startRow) <= Math.min(r2, endRow)
                        const colOverlap = Math.max(c1, startColNum) <= Math.min(c2, endColNum)
                        
                        if (rowOverlap && colOverlap) {
                            try {
                                worksheet.unMergeCells(merge)
                            } catch (e) {
                                // Ignore
                            }
                        }
                    }
                }
            }
            try {
                worksheet.mergeCells(r1, c1, r2, c2)
            } catch (e) {
                // Ignore fallback
            }
        }

        if (extraRowsNeeded > 0) {
            // Insert rows only if we exceed template capacity
            worksheet.insertRows(27, Array(extraRowsNeeded).fill([]))
            
            // Shift merges down manually in ExcelJS model
            shiftMerges(worksheet, 27, extraRowsNeeded)
            
            // Clone Styles from Row 10
            const sourceRow = worksheet.getRow(10)
            for (let i = 0; i < extraRowsNeeded; i++) {
                const targetRow = worksheet.getRow(27 + i)
                targetRow.height = sourceRow.height
                sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    const targetCell = targetRow.getCell(colNumber)
                    targetCell.style = cell.style
                })
            }
        }

        // ล้าง merge ทั้งหมดตั้งแต่แถวข้อมูลลงไป ก่อนเขียนข้อมูล แล้วค่อยสร้างใหม่เฉพาะที่ต้องใช้
        // insertRows ของ ExcelJS ย้าย merge ระดับเซลล์ตามแถว แต่ไม่อัปเดตดัชนี _merges; และการตั้งค่า
        // ให้เซลล์ลูกของ merge จะไปเขียนทับเซลล์หลักแทน → ป้ายเซ็นซ้ำ, merge ซ้อน (Excel เปิดไม่ได้), ค่าผิดช่อง
        const mergeIndex = (worksheet as unknown as { _merges: Record<string, { top: number }> })._merges
        for (const [addr, range] of Object.entries(mergeIndex)) {
            if (range.top >= 10) delete mergeIndex[addr]
        }
        for (let r = 10; r <= worksheet.rowCount; r++) {
            const row = worksheet.getRow(r)
            for (let c = 1; c <= 13; c++) row.getCell(c).unmerge()
        }

        // 5. Identify Extra Cost Types (Only for Lump Sum)
        const columnMap: Record<string, number> = {}
        if (!isPerUnit) {
            const extraTypesSet = new Set<string>()
            for (const job of jobs) {
                for (const col of ['Price_Cust_Extra', 'Charge_Labor', 'Charge_Wait', 'Price_Cust_Other']) {
                    if (Number(job[col]) > 0) {
                        extraTypesSet.add(EXPENSE_MAP[col])
                    }
                }
                if (job.extra_costs_json) {
                    let costs = job.extra_costs_json
                    if (typeof costs === 'string') { try { costs = JSON.parse(costs) } catch {} }
                    if (Array.isArray(costs)) {
                        for (const c of costs) {
                            if (c.type && (Number(c.charge_cust) || 0) > 0) {
                                extraTypesSet.add(EXPENSE_MAP[c.type] || c.type)
                            }
                        }
                    }
                }
            }

            const allExtraTypes = Array.from(extraTypesSet).slice(0, 4)
            const headerRow = worksheet.getRow(7)
            
            for (let i = 0; i < 4; i++) {
                const colIndex = 9 + i 
                const typeName = allExtraTypes[i]
                const cell = headerRow.getCell(colIndex)
                if (typeName) {
                    cell.value = typeName
                    columnMap[typeName] = colIndex
                } else {
                    cell.value = '-'
                }
            }
        }

        // 6. Fill Job Data
        const summaryTotals: Record<number, number> = { 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0 }
        let totalQuantity = 0
        let totalCO2 = 0

        // Live TGO freight factors (editable in /settings/esg), loaded once.
        const carbonFactors = await getCarbonFactors()

        for (let index = 0; index < jobs.length; index++) {
            const job = jobs[index]
            const r = 10 + index
            const row = worksheet.getRow(r)

            row.getCell(1).value = index + 1
            const planDate = asDateInput(job.Plan_Date)
            row.getCell(2).value = planDate ? new Date(planDate).toLocaleDateString('th-TH') : '-'
            row.getCell(3).value = normalizeVehicleType(asString(job.Vehicle_Type))
            row.getCell(4).value = Number(job.Total_Drop || 1)
            
            // Origin / Destination
            let origin = asString(job.Origin_Location).trim()
            let dest = asString(job.Dest_Location).trim()
            if ((!origin || !dest) && job.Route_Name) {
                const parts = asString(job.Route_Name).split(/[-→/]/)
                if (parts.length >= 2) {
                    if (!origin) origin = parts[0].trim()
                    if (!dest) dest = parts.slice(1).join(' - ').trim()
                }
            }

            // งานหลายดรอป: list ทุกปลายทางในช่องเดียว คั่นด้วย " - "
            // ลำดับความสำคัญ: POD_Drops_Json (destination) → original_destinations_json (name) → dest เดี่ยว
            const multiDropDests = ((): string => {
                const parseArr = (raw: unknown): any[] => {
                    try { const p = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(p) ? p.filter(Boolean) : [] } catch { return [] }
                }
                const fromDrops = parseArr(job.POD_Drops_Json)
                    .map((d: any) => String(d?.destination || '').trim()).filter(Boolean)
                if (fromDrops.length > 0) return fromDrops.join(' - ')
                const fromDests = parseArr(job.original_destinations_json)
                    .map((d: any) => String(d?.name || '').trim()).filter(Boolean)
                if (fromDests.length > 0) return fromDests.join(' - ')
                return ''
            })()

            row.getCell(5).value = origin || ''
            row.getCell(6).value = multiDropDests || dest || asString(job.Route_Name)
            
            // Carbon Footprint — shared per-trip formula (computeTripCarbon), same as
            // LINE / POD / track. ใบแจ้งหนี้: คิด "1 ขา รถหนัก" ไม่รวมตีเปล่ากลับ; ไม่มีระยะ → 12.5 กม.
            const co2Value = computeTripCarbon(job as { Est_Distance_KM?: number | null; Vehicle_Type?: string | null; Weight_Kg?: number | null }, carbonFactors, { fallbackKm: 12.5 })?.co2Kg ?? 0
            row.getCell(7).value = co2Value
            totalCO2 += co2Value

            if (isPerUnit) {
                // Per Unit Mapping
                const qty = Number(job.Weight_Kg || job.Volume_Cbm || job.Loaded_Qty || 0)
                let basePrice = Number(job.Price_Cust_Total || 0)
                let unitPrice = Number(job.Price_Per_Unit || customerUnitPrice)

                if (basePrice > 0 && qty > 0) {
                    unitPrice = basePrice / qty
                } else if (basePrice <= 0 && unitPrice > 0) {
                    basePrice = qty * unitPrice
                }

                const lineTotal = Number(basePrice.toFixed(2))
                
                row.getCell(8).value = qty
                row.getCell(9).value = unitPrice
                row.getCell(13).value = lineTotal
                
                totalQuantity += qty
                summaryTotals[13] += lineTotal
            } else {
                // Lump Sum Mapping
                const basePrice = Number(job.Price_Cust_Total || 0)
                row.getCell(8).value = basePrice
                summaryTotals[8] += basePrice

                const jobExtras: Record<number, number> = { 9: 0, 10: 0, 11: 0, 12: 0 }
                if (Number(job.Price_Cust_Extra) > 0) jobExtras[columnMap[EXPENSE_MAP['Price_Cust_Extra']] || 12] += Number(job.Price_Cust_Extra)
                if (Number(job.Charge_Labor) > 0) jobExtras[columnMap[EXPENSE_MAP['Charge_Labor']] || 12] += Number(job.Charge_Labor)
                if (Number(job.Charge_Wait) > 0) jobExtras[columnMap[EXPENSE_MAP['Charge_Wait']] || 12] += Number(job.Charge_Wait)
                if (Number(job.Price_Cust_Other) > 0) jobExtras[columnMap[EXPENSE_MAP['Price_Cust_Other']] || 12] += Number(job.Price_Cust_Other)

                if (job.extra_costs_json) {
                    let costs = job.extra_costs_json
                    if (typeof costs === 'string') { try { costs = JSON.parse(costs) } catch {} }
                    if (Array.isArray(costs)) {
                        for (const c of costs) {
                            const val = Number(c.charge_cust) || 0
                            const thName = EXPENSE_MAP[c.type] || c.type
                            if (val > 0) {
                                const colIdx = columnMap[thName] || 12
                                jobExtras[colIdx] += val
                            }
                        }
                    }
                }

                let totalRowExtras = 0
                for (let c = 9; c <= 12; c++) {
                    if (jobExtras[c] > 0) {
                        row.getCell(c).value = jobExtras[c]
                        summaryTotals[c] += jobExtras[c]
                        totalRowExtras += jobExtras[c]
                    }
                }

                row.getCell(13).value = basePrice + totalRowExtras
                summaryTotals[13] += (basePrice + totalRowExtras)
            }

            // Styling for data rows — ฟอนต์เท่ากันทุกแถว, จัดกึ่งกลางแนวตั้งทั้งแถว,
            // ต้นทาง/ปลายทาง wrap และสูงตามความยาวข้อความ (งานหลายดรอปไม่โดนตัด)
            for (let c = 1; c <= 13; c++) {
                const cell = row.getCell(c)
                const isPlace = c === 5 || c === 6
                // เทมเพลตใช้ style object ร่วมกันหลายเซลล์ — clone ก่อน ไม่งั้นแก้เซลล์หนึ่งไปทับอีกเซลล์
                cell.style = JSON.parse(JSON.stringify(cell.style || {}))
                cell.font = { ...(cell.font || {}), size: isPlace ? PLACE_FONT_SIZE : 14 }
                cell.alignment = {
                    horizontal: c >= 8 ? 'right' : 'center',
                    vertical: 'middle',
                    wrapText: isPlace,
                }
                if (c >= 8) cell.numFmt = '#,##0.00'
            }
            const lines = Math.max(
                estimateLines(asString(row.getCell(5).value), ORIGIN_COL_WIDTH),
                estimateLines(asString(row.getCell(6).value), DEST_COL_WIDTH),
            )
            row.height = Math.max(30, lines * 14 + 3)
        }

        // แถวว่างของเทมเพลต: คงไว้ให้ตารางมีอย่างน้อย MIN_TABLE_ROWS แถว (งานน้อยเอกสารไม่ดูโล่ง)
        // ที่เกินจากนั้นซ่อน — ไม่ให้แถวว่างดันส่วนสรุปไปอีกหน้าเมื่องานหลายดรอปสูง
        for (let r = 10 + Math.max(jobsCount, MIN_TABLE_ROWS); r < summaryBaseRow; r++) worksheet.getRow(r).hidden = true

        // 7. Summary and Totals (Precise Fixed Layout)
        const firstDataRow = 10
        const lastDataRow = 10 + jobsCount - 1
        
        const finalSubtotal = Number(summaryTotals[13] || 0) || 0
        const finalCO2 = Number(totalCO2 || 0) || 0
        const finalQty = Number(totalQuantity || 0) || 0

        // 7.0 Main Summary Row (Row 27 fixed, or more)
        const summaryRow = worksheet.getRow(summaryBaseRow)
        summaryRow.height = 25
        
        const lastUsedRow = Math.max(worksheet.rowCount, summaryBaseRow + 16)
        for (let r = summaryBaseRow + 1; r <= lastUsedRow; r++) {
            const row = worksheet.getRow(r)
            row.height = 20
            for (let c = 1; c <= 13; c++) {
                const cell = row.getCell(c)
                cell.value = null
                cell.style = {}
            }
        }

        // Label (E:F)
        safeMergeCells(summaryBaseRow, 5, summaryBaseRow, 6)
        for (let c = 1; c <= 13; c++) {
            const cell = summaryRow.getCell(c)
            cell.style = JSON.parse(JSON.stringify(cell.style || {}))
        }
        summaryRow.getCell(2).value = null // เศษ "." จากเทมเพลต
        summaryRow.getCell(5).value = "รวมปริมาณคาร์บอนฟุตพริ้นท์ (kgCO2e)"
        summaryRow.getCell(5).font = { bold: true, size: 9 }
        summaryRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' }

        summaryRow.getCell(7).value = { formula: `SUM(G${firstDataRow}:G${lastDataRow})`, result: finalCO2 }
        summaryRow.getCell(8).value = { formula: `SUM(H${firstDataRow}:H${lastDataRow})`, result: isPerUnit ? finalQty : summaryTotals[8] }
        for (let c = 9; c <= 12; c++) {
            const col = String.fromCharCode(64 + c)
            summaryRow.getCell(c).value = { formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})`, result: summaryTotals[c] || 0 }
        }
        summaryRow.getCell(13).value = { formula: `SUM(M${firstDataRow}:M${lastDataRow})`, result: finalSubtotal }

        for (const c of [7, 8, 13]) {
            const cell = summaryRow.getCell(c)
            cell.font = { bold: true, size: 11 }
            cell.numFmt = '#,##0.00'
            cell.border = { bottom: { style: 'double' } }
        }

        // 7.1 ส่วนสรุปยอด + ช่องเซ็น — สร้างใหม่ทั้งหมดใต้แถวรวม (ล้างพื้นที่ไว้แล้วด้านบน)
        const discountAmount = Math.abs(Number(finalDoc.Discount_Amount || 0))
        const vatAmount = Math.abs(Number(finalDoc.VAT_Amount || 0))
        const vatRate = Number(finalDoc.VAT_Rate || 0)
        const calculatedGrandTotal = finalSubtotal - discountAmount + vatAmount

        const borderStyle = {
            top: { style: 'thin' as const },
            left: { style: 'thin' as const },
            bottom: { style: 'thin' as const },
            right: { style: 'thin' as const }
        }
        const RED = 'FFFF0000'
        // ป้าย H:L (กึ่งกลาง) + ค่าในคอลัมน์ M
        const writeLine = (r: number, label: string, value: ExcelJS.CellValue, red = false) => {
            safeMergeCells(r, 8, r, 12)
            const row = worksheet.getRow(r)
            const color = { argb: red ? RED : 'FF000000' }
            const labelCell = row.getCell(8)
            labelCell.value = label
            labelCell.font = { bold: true, size: 11, color }
            labelCell.alignment = { horizontal: 'center', vertical: 'middle' }
            const valueCell = row.getCell(13)
            valueCell.value = value
            valueCell.font = { bold: true, size: 11, color }
            valueCell.numFmt = '#,##0.00'
            valueCell.alignment = { horizontal: 'right', vertical: 'middle' }
            for (let c = 8; c <= 13; c++) row.getCell(c).border = borderStyle
        }

        // แสดงเฉพาะรายการที่ระบุตอนสร้างเอกสาร (ส่วนลด/VAT/หัก ณ ที่จ่าย) — ไม่เติมค่าเริ่มต้นเอง
        // และไม่ให้มียอดรวมซ้ำ: ไม่มีหัก ณ ที่จ่าย → "จำนวนเงินรวมทั้งสิ้น" เป็นบรรทัดสุดท้าย (ไม่มียอดจ่ายสุทธิ)
        const dRate = Number(finalDoc.Discount_Rate || finalDoc.Discount_Percent || 0)
        const hasDiscount = discountAmount > 0 || dRate > 0
        const hasVat = vatRate > 0 || vatAmount > 0
        const wRate = Number(finalDoc.WHT_Rate || 0)
        const totalBeforeTax = finalSubtotal - discountAmount
        const whtAmount = Number(finalDoc.WHT_Amount) > 0
            ? Number(finalDoc.WHT_Amount)
            : Math.round(totalBeforeTax * wRate) / 100
        const hasWht = wRate > 0 || whtAmount > 0

        let nextRow = summaryBaseRow + 1
        const firstSummaryRow = nextRow

        // หมายเหตุ (A:G ข้างส่วนสรุป)
        if (finalDoc.Notes) {
            safeMergeCells(firstSummaryRow, 1, firstSummaryRow + 1, 7)
            const noteCell = worksheet.getRow(firstSummaryRow).getCell(1)
            noteCell.value = `หมายเหตุ: ${finalDoc.Notes}`
            noteCell.font = { bold: true, size: 12, color: { argb: RED } }
            noteCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        }

        // ฐานก่อนภาษี = ยอดรวม (+ ส่วนลดที่เป็นค่าติดลบ ถ้ามี)
        let baseRef = `M${summaryBaseRow}`
        if (hasDiscount) {
            const discRow = nextRow++
            writeLine(discRow, `ส่วนลด (Discount)${dRate > 0 ? ` ${dRate}%` : ''}:`,
                dRate > 0
                    ? { formula: `-M${summaryBaseRow}*(${dRate / 100})`, result: -discountAmount }
                    : -discountAmount, true)
            baseRef = `(M${summaryBaseRow}+M${discRow})`
        }

        let vatRef = ''
        if (hasVat) {
            const vatRow = nextRow++
            writeLine(vatRow, `ภาษีมูลค่าเพิ่ม (VAT)${vatRate > 0 ? ` ${vatRate}%` : ''}:`,
                vatRate > 0
                    ? { formula: `${baseRef}*(${vatRate / 100})`, result: vatAmount }
                    : vatAmount)
            vatRef = `+M${vatRow}`
        }

        const gtRow = nextRow++
        writeLine(gtRow, 'จำนวนเงินรวมทั้งสิ้น (Grand Total):',
            { formula: `${baseRef}${vatRef}`, result: calculatedGrandTotal }, true)

        let lastSummaryRow = gtRow
        if (hasWht) {
            const whtRow = nextRow++
            // หัก ณ ที่จ่ายคิดจากยอดก่อน VAT (สูตรเดียวกับฟอร์มสร้างใบแจ้งหนี้)
            writeLine(whtRow, `หักภาษี ณ ที่จ่าย (WHT)${wRate > 0 ? ` ${wRate}%` : ''}:`,
                wRate > 0
                    ? { formula: `ROUND(${baseRef}*${wRate}/100,2)`, result: whtAmount }
                    : whtAmount, true)
            const netRow = nextRow++
            writeLine(netRow, 'ยอดจ่ายสุทธิ (Net Total):',
                { formula: `M${gtRow}-M${whtRow}`, result: calculatedGrandTotal - whtAmount })
            lastSummaryRow = netRow
        }
        const netRowIndex = lastSummaryRow

        // ช่องเซ็น: ป้ายเดียวต่อช่อง (I:J / L:M) + กล่องเซ็น 2 แถว + วันที่
        const signLabelRow = netRowIndex + 2
        worksheet.getRow(netRowIndex + 1).height = 8 // เว้นนิดเดียว ให้ช่องเซ็นอยู่หน้าเดียวกับยอดรวม
        const signBoxes: [number, number, string][] = [[9, 10, 'ผู้จัดทำ'], [12, 13, 'ผู้รับเอกสาร']]
        for (const [c1, c2, label] of signBoxes) {
            safeMergeCells(signLabelRow, c1, signLabelRow, c2)
            const lab = worksheet.getRow(signLabelRow).getCell(c1)
            lab.value = label
            lab.font = { size: 14 }
            lab.alignment = { horizontal: 'center', vertical: 'middle' }
            safeMergeCells(signLabelRow + 1, c1, signLabelRow + 2, c2)
            for (let r = signLabelRow; r <= signLabelRow + 2; r++) {
                for (let c = c1; c <= c2; c++) worksheet.getRow(r).getCell(c).border = borderStyle
            }
            const dateCell = worksheet.getRow(signLabelRow + 3).getCell(c1)
            dateCell.value = 'วันที่'
            dateCell.font = { bold: true, size: 14 }
        }

        // พิมพ์: กว้างพอดี 1 หน้า สูงไม่จำกัด (งานหลายดรอปขึ้นหน้าใหม่ได้ ไม่ย่อจนอ่านไม่ออก)
        // + หัวตารางซ้ำทุกหน้า
        worksheet.pageSetup.fitToPage = true
        worksheet.pageSetup.fitToWidth = 1
        worksheet.pageSetup.fitToHeight = 0
        worksheet.pageSetup.printTitlesRow = '7:9'
        worksheet.pageSetup.printArea = `A1:M${signLabelRow + 3}`

        // 8. Static Headers
        // Clear "ต้นฉบับ" (Original) label if it exists in top-right cells (L1, M1)
        worksheet.getCell('L1').value = null
        worksheet.getCell('M1').value = null
        worksheet.getCell('A1').value = null
        // "ต้นฉบับ" มุมขวาบนเหนือกรอบ (M1) + หัวเรื่องเต็มความกว้าง A2:M2 กึ่งกลาง มีกรอบ
        safeMergeCells(1, 1, 1, 12) // แถว 1 (A1:M1 ในเทมเพลต) → A1:L1 ว่าง เหลือ M1 ให้ป้าย
        const originalCell = worksheet.getCell('M1')
        originalCell.style = {}
        originalCell.value = 'ต้นฉบับ'
        originalCell.font = { bold: true, size: 16 }
        originalCell.alignment = { horizontal: 'right', vertical: 'bottom' }
        safeMergeCells(2, 1, 2, 13)
        const titleCell = worksheet.getCell('A2')
        titleCell.style = JSON.parse(JSON.stringify(titleCell.style || {}))
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
        const thin = { style: 'thin' as const }
        for (let c = 1; c <= 13; c++) {
            const cell = worksheet.getRow(2).getCell(c)
            cell.border = { top: thin, bottom: thin, left: c === 1 ? thin : undefined, right: c === 13 ? thin : undefined }
        }

        worksheet.getCell('C3').value = accountingProfile.company_name_th
        worksheet.getCell('C5').value = accountingProfile.address
        worksheet.getCell('A6').value = `เลขที่ประจำตัวผู้เสียภาษี : ${accountingProfile.tax_id}`
        worksheet.getCell('H3').value = `วันที่ ${new Date(finalDoc.Issue_Date || finalDoc.Billing_Date).toLocaleDateString('th-TH')}`
        worksheet.getCell('K3').value = `เลขที่ ${finalDoc.Invoice_ID || finalDoc.Billing_Note_ID}`
        worksheet.getCell('I4').value = finalDoc.Master_Customers?.Customer_Name || finalDoc.Customer_Name || '-'
        worksheet.getCell('I5').value = finalDoc.Master_Customers?.Address || finalDoc.Customer_Address || '-'
        worksheet.getCell('H6').value = `เลขที่ประจำตัวผู้เสียภาษี :  ${finalDoc.Master_Customers?.Tax_ID || finalDoc.Customer_Tax_ID || '-'}`

        const buffer = await workbook.xlsx.writeBuffer()
        return { success: true, data: Buffer.from(buffer).toString('base64'), fileName: `Invoice_${invoiceId}.xlsx` }

    } catch (error: unknown) {
        console.error("Excel Export Error:", error)
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
}
