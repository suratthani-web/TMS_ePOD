'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { CO2_COEFFICIENTS } from '@/lib/utils/esg-utils'
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
    if (normalized.includes('4w') || normalized.includes('4wheel') || normalized.includes('4 wheel')) return '4-Wheel'
    if (normalized.includes('6w') || normalized.includes('6wheel') || normalized.includes('6 wheel')) return '6-Wheel'
    if (normalized.includes('10w') || normalized.includes('10wheel')) return '10-Wheel'
    return v
}

const asString = (value: unknown) => typeof value === 'string' ? value : value == null ? '' : String(value)
const asDateInput = (value: unknown): string | number | Date | null => {
    if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) return value
    return null
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
            row.getCell(5).value = origin || ''
            row.getCell(6).value = dest || asString(job.Route_Name)
            
            // Carbon Footprint
            const effectiveDist = Number(job.Est_Distance_KM) || 12.5
            const co2Value = Number((effectiveDist * CO2_COEFFICIENTS['default']).toFixed(2))
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

            // Styling for data rows
            row.eachCell({ includeEmpty: true }, (cell) => {
                if (Number(cell.col) >= 8) cell.numFmt = '#,##0.00'
            })
        }

        // 7. Summary and Totals (Precise Fixed Layout)
        const firstDataRow = 10
        const lastDataRow = 10 + jobsCount - 1
        
        const finalSubtotal = Number(summaryTotals[13] || 0) || 0
        const finalCO2 = Number(totalCO2 || 0) || 0
        const finalQty = Number(totalQuantity || 0) || 0

        // 7.0 Main Summary Row (Row 27 fixed, or more)
        const summaryRow = worksheet.getRow(summaryBaseRow)
        summaryRow.height = 25
        
        // Label in Col 5 (E)
        summaryRow.getCell(5).value = "รวมปริมาณคาร์บอนฟรุตพริ้น (kgCO2) "
        summaryRow.getCell(5).font = { bold: true, size: 9 }
        summaryRow.getCell(5).alignment = { horizontal: 'right' }

        summaryRow.getCell(7).value = { formula: `SUM(G${firstDataRow}:G${lastDataRow})`, result: finalCO2 }
        summaryRow.getCell(8).value = { formula: `SUM(H${firstDataRow}:H${lastDataRow})`, result: finalQty }
        summaryRow.getCell(13).value = { formula: `SUM(M${firstDataRow}:M${lastDataRow})`, result: finalSubtotal }

        // Style cells (ExcelJS handles merges correctly if we target the master cell)
        for (const c of [7, 8, 13]) {
            const cell = summaryRow.getCell(c)
            cell.font = { bold: true, size: 11 }
            cell.numFmt = '#,##0.00'
            cell.border = { bottom: { style: 'double' } }
        }

        // 7.1 Financial Breakdown (Perfect 100% replica of the reference design)
        const discountAmount = Math.abs(Number(finalDoc.Discount_Amount || 0))
        const vatAmount = Math.abs(Number(finalDoc.VAT_Amount || 0))
        const vatRate = Number(finalDoc.VAT_Rate || 0)
        const calculatedGrandTotal = finalSubtotal - discountAmount + vatAmount
        const subtotalRef = `M${summaryBaseRow}`

        // Insert exactly 3 empty rows at summaryBaseRow + 3 for VAT, WHT, and Net Total
        const vatRowIndex = summaryBaseRow + 3
        worksheet.insertRows(vatRowIndex, Array(3).fill([]))

        // Shift merges down manually in ExcelJS model
        shiftMerges(worksheet, vatRowIndex, 3)

        // Clear dynamic merges in the breakdown area (J to M) to prevent overlapping merge issues
        const clearStart = summaryBaseRow + 2
        const clearEnd = summaryBaseRow + 6
        if (worksheet.model.merges) {
            const mergesToClear = worksheet.model.merges.filter((range: string) => {
                const parts = range.split(':');
                const startRow = parseInt(parts[0].replace(/[^0-9]/g, ''), 10);
                return (startRow >= clearStart && startRow <= clearEnd);
            });
            for (const range of mergesToClear) {
                try {
                    worksheet.unMergeCells(range)
                } catch (e) {
                    // Ignore
                }
            }
        }

        const borderStyle = {
            top: { style: 'thin' as const },
            left: { style: 'thin' as const },
            bottom: { style: 'thin' as const },
            right: { style: 'thin' as const }
        }

        // 1. รวมเป็นเงิน (Subtotal) - Row summaryBaseRow + 1
        const subRowIndex = summaryBaseRow + 1
        const subRow = worksheet.getRow(subRowIndex)
        subRow.height = 15
        
        // Ensure no stray values/borders in Columns J-M on the Subtotal row
        for (let c = 10; c <= 13; c++) {
            subRow.getCell(c).value = null
            subRow.getCell(c).fill = { type: 'pattern', pattern: 'none' }
            subRow.getCell(c).border = {}
        }

        // 2. ส่วนลด (Discount) - Row summaryBaseRow + 2
        const discRowIndex = summaryBaseRow + 2
        const discRow = worksheet.getRow(discRowIndex)
        discRow.height = 20

        // 2.1 Write Note in Column E (5)
        if (finalDoc.Notes) {
            safeMergeCells(discRowIndex, 5, discRowIndex, 8)
            const noteCell = discRow.getCell(5)
            noteCell.value = `หมายเหตุ: ${finalDoc.Notes}`
            noteCell.font = { bold: true, size: 12, color: { argb: 'FFFF0000' } }
            noteCell.alignment = { horizontal: 'center', vertical: 'middle' }
        }

        // 2.2 Discount Label & Value
        const dRate = finalDoc.Discount_Rate || finalDoc.Discount_Percent || 0
        const dRateLabel = dRate > 0 ? `${dRate}%` : '-%'
        safeMergeCells(discRowIndex, 10, discRowIndex, 12)
        const discLabelCell = discRow.getCell(10)
        discLabelCell.value = `ส่วนลด (Discount) ${dRateLabel}:`
        discLabelCell.font = { bold: true, size: 11 }
        discLabelCell.alignment = { horizontal: 'right', vertical: 'middle' }

        const discValueCell = discRow.getCell(13)
        discValueCell.value = { formula: `-M${summaryBaseRow}*(${Number(dRate)/100})`, result: -discountAmount }
        discValueCell.font = { bold: true, size: 11, color: { argb: discountAmount > 0 ? 'FFFF0000' : 'FF000000' } }
        discValueCell.numFmt = '#,##0.00'
        discValueCell.alignment = { horizontal: 'right', vertical: 'middle' }

        // Apply borders only to J-M cells on the Discount row
        for (let c = 10; c <= 13; c++) {
            const cell = discRow.getCell(c)
            cell.border = borderStyle
        }

        // 3. ภาษีมูลค่าเพิ่ม (VAT) - Row summaryBaseRow + 3 (Newly inserted)
        const vatRow = worksheet.getRow(vatRowIndex)
        vatRow.height = 20
        safeMergeCells(vatRowIndex, 10, vatRowIndex, 12)

        const vRateLabel = vatRate > 0 ? `${vatRate}%` : '%'
        const vatLabelCell = vatRow.getCell(10)
        vatLabelCell.value = `ภาษีมูลค่าเพิ่ม (VAT) ${vRateLabel}:`
        vatLabelCell.font = { bold: true, size: 11 }
        vatLabelCell.alignment = { horizontal: 'right', vertical: 'middle' }

        const vatValueCell = vatRow.getCell(13)
        if (vatRate > 0) {
            vatValueCell.value = { formula: `(M${summaryBaseRow}+M${discRowIndex})*(${Number(vatRate)/100})`, result: vatAmount }
        } else {
            vatValueCell.value = "-"
        }
        vatValueCell.font = { bold: true, size: 11 }
        vatValueCell.numFmt = '#,##0.00'
        vatValueCell.alignment = { horizontal: 'right', vertical: 'middle' }

        for (let c = 10; c <= 13; c++) {
            vatRow.getCell(c).border = borderStyle
        }

        // 4. จำนวนเงินรวมทั้งสิ้น (Grand Total) - Row summaryBaseRow + 4 (Newly inserted)
        const gtRowIndex = summaryBaseRow + 4
        const gtRow = worksheet.getRow(gtRowIndex)
        gtRow.height = 20
        safeMergeCells(gtRowIndex, 10, gtRowIndex, 12)

        const gtLabelCell = gtRow.getCell(10)
        gtLabelCell.value = "จำนวนเงินรวมทั้งสิ้น (Grand Total):"
        gtLabelCell.font = { bold: true, size: 11, color: { argb: 'FFFF0000' } }
        gtLabelCell.alignment = { horizontal: 'right', vertical: 'middle' }

        const gtValueCell = gtRow.getCell(13)
        if (vatRate > 0) {
            gtValueCell.value = { formula: `(M${summaryBaseRow}+M${discRowIndex}+M${vatRowIndex})`, result: calculatedGrandTotal }
        } else {
            gtValueCell.value = { formula: `(M${summaryBaseRow}+M${discRowIndex})`, result: finalSubtotal - discountAmount }
        }
        gtValueCell.font = { bold: true, size: 11, color: { argb: 'FFFF0000' } }
        gtValueCell.numFmt = '#,##0.00'
        gtValueCell.alignment = { horizontal: 'right', vertical: 'middle' }

        for (let c = 10; c <= 13; c++) {
            gtRow.getCell(c).border = borderStyle
        }

        // 5. หักภาษี ณ ที่จ่าย (WHT) - Row summaryBaseRow + 5 (Newly inserted)
        const whtRowIndex = summaryBaseRow + 5
        const whtRow = worksheet.getRow(whtRowIndex)
        whtRow.height = 20
        safeMergeCells(whtRowIndex, 10, whtRowIndex, 12)

        const wRate = Number(finalDoc.WHT_Rate || 0)
        const wRateLabel = wRate > 0 ? `${wRate}%` : '1%'
        const whtLabelCell = whtRow.getCell(10)
        whtLabelCell.value = ` หักภาษี ณ ที่จ่าย (WHT) ${wRateLabel}:`
        whtLabelCell.font = { bold: true, size: 11, color: { argb: 'FFFF0000' } }
        whtLabelCell.alignment = { horizontal: 'right', vertical: 'middle' }

        const whtAmount = calculatedGrandTotal * (Number(wRate || 1) / 100)
        const whtValueCell = whtRow.getCell(13)
        whtValueCell.value = { formula: `M${gtRowIndex}*(${Number(wRate || 1)/100})`, result: whtAmount }
        whtValueCell.font = { bold: true, size: 11, color: { argb: 'FFFF0000' } }
        whtValueCell.numFmt = '#,##0.00'
        whtValueCell.alignment = { horizontal: 'right', vertical: 'middle' }

        for (let c = 10; c <= 13; c++) {
            whtRow.getCell(c).border = borderStyle
        }

        // 6. ยอดจ่ายสุทธิ (Net Total) - Row summaryBaseRow + 6 (Newly inserted)
        const netRowIndex = summaryBaseRow + 6
        const netRow = worksheet.getRow(netRowIndex)
        netRow.height = 20
        safeMergeCells(netRowIndex, 10, netRowIndex, 12)

        const netLabelCell = netRow.getCell(10)
        netLabelCell.value = " ยอดจ่ายสุทธิ (Net Total):"
        netLabelCell.font = { bold: true, size: 11 }
        netLabelCell.alignment = { horizontal: 'right', vertical: 'middle' }

        const netValueCell = netRow.getCell(13)
        netValueCell.value = { formula: `M${gtRowIndex}+M${whtRowIndex}`, result: calculatedGrandTotal + whtAmount }
        netValueCell.font = { bold: true, size: 11 }
        netValueCell.numFmt = '#,##0.00'
        netValueCell.alignment = { horizontal: 'right', vertical: 'middle' }

        // Apply borders only to J-M cells on the Net Total row
        for (let c = 10; c <= 13; c++) {
            const cell = netRow.getCell(c)
            cell.border = borderStyle
        }









        // 8. Static Headers
        // Clear "ต้นฉบับ" (Original) label if it exists in top-right cells (L1, M1)
        worksheet.getCell('L1').value = null
        worksheet.getCell('M1').value = null

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
