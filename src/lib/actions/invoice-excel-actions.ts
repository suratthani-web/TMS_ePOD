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

export async function exportInvoiceExcel(invoiceId: string) {
    try {
        const supabase = createAdminClient()

        // 1. Get Data
        const { data: invoice } = await supabase.from('invoices').select('*, Master_Customers(*)').eq('Invoice_ID', invoiceId).maybeSingle()
        const { data: bn } = !invoice ? await supabase.from('Billing_Notes').select('*').eq('Billing_Note_ID', invoiceId).maybeSingle() : { data: null }
        const finalDoc = invoice || bn
        if (!finalDoc) throw new Error("ไม่พบข้อมูลเอกสาร")

        let jobs: any[] = []
        if (invoice?.Items_JSON && Array.isArray(invoice.Items_JSON)) {
            jobs = invoice.Items_JSON
        } else {
            const { data: dbJobs } = await supabase.from('Jobs_Main').select('*').or(`Invoice_ID.eq."${invoiceId}",Billing_Note_ID.eq."${invoiceId}"`)
            jobs = dbJobs || []
        }
        if (!jobs || jobs.length === 0) throw new Error("ไม่พบรายการงาน")

        // 1.2 Sort Jobs by Date (Oldest to Newest)
        jobs.sort((a, b) => {
            const dateA = a.Plan_Date ? new Date(a.Plan_Date).getTime() : 0
            const dateB = b.Plan_Date ? new Date(b.Plan_Date).getTime() : 0
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
        await workbook.xlsx.load(templateBuffer as any)
        const worksheet = workbook.getWorksheet(1)
        if (!worksheet) throw new Error("Worksheet not found")

        // 3. Clear Dynamic Range ONLY (Protect Main Headers)
        // Clear only I7-L7 (Dynamic headers - Only for Lump Sum)
        if (!isPerUnit) {
            for (let c = 9; c <= 12; c++) { worksheet.getRow(7).getCell(c).value = null }
        }
        
        // Clear data rows 10-50 (Template default and potential footer area)
        for (let r = 10; r <= 50; r++) {
            const row = worksheet.getRow(r)
            for (let c = 1; c <= 13; c++) { 
                const cell = row.getCell(c)
                cell.value = null 
            }
        }

        // 4. Handle Dynamic Rows for > 17 jobs
        const jobsCount = jobs.length
        const templateRows = 17
        if (jobsCount > templateRows) {
            const extraRowsNeeded = jobsCount - templateRows
            // Insert rows at row 27 (shifting footer and others down)
            worksheet.insertRows(27, Array(extraRowsNeeded).fill([]))
            
            // Clone Styles from Row 10 to new rows
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

        // 5. Identify Extra Cost Types (Thai labels) - Only for Lump Sum
        const columnMap: Record<string, number> = {}
        if (!isPerUnit) {
            const extraTypesSet = new Set<string>()
            jobs.forEach(job => {
                ['Price_Cust_Extra', 'Charge_Labor', 'Charge_Wait', 'Price_Cust_Other'].forEach(col => {
                    if (Number(job[col]) > 0) {
                        extraTypesSet.add(EXPENSE_MAP[col])
                    }
                })
                if (job.extra_costs_json) {
                    let costs = job.extra_costs_json
                    if (typeof costs === 'string') { try { costs = JSON.parse(costs) } catch {} }
                    if (Array.isArray(costs)) {
                        costs.forEach((c: any) => {
                            if (c.type && (Number(c.charge_cust) || 0) > 0) {
                                extraTypesSet.add(EXPENSE_MAP[c.type] || c.type)
                            }
                        })
                    }
                }
            })

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
        const summaryTotals: any = { 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0 }
        let totalQuantity = 0

        jobs.forEach((job, index) => {
            const r = 10 + index
            const row = worksheet.getRow(r)

            row.getCell(1).value = index + 1
            row.getCell(2).value = job.Plan_Date ? new Date(job.Plan_Date).toLocaleDateString('th-TH') : '-'
            row.getCell(3).value = normalizeVehicleType(job.Vehicle_Type)
            row.getCell(4).value = Number(job.Total_Drop || 1)
            
            // Origin / Destination
            let origin = (job.Origin_Location || '').trim()
            let dest = (job.Dest_Location || '').trim()
            if ((!origin || !dest) && job.Route_Name) {
                const parts = job.Route_Name.split(/[-→/]/)
                if (parts.length >= 2) {
                    if (!origin) origin = parts[0].trim()
                    if (!dest) dest = parts.slice(1).join(' - ').trim()
                }
            }
            row.getCell(5).value = origin || ''
            row.getCell(6).value = dest || job.Route_Name || ''
            
            // Carbon Footprint
            const effectiveDist = Number(job.Est_Distance_KM) || 12.5
            row.getCell(7).value = Number((effectiveDist * CO2_COEFFICIENTS['default']).toFixed(2))

            if (isPerUnit) {
                // Per Unit Mapping: H=Qty, I=UnitPrice, M=Total
                const qty = Number(job.Weight_Kg || job.Volume_Cbm || job.Loaded_Qty || 0)
                let basePrice = Number(job.Price_Cust_Total || 0)
                let unitPrice = Number(job.Price_Per_Unit || customerUnitPrice)

                // Dynamic Unit Price Calculation: Total / Qty (as requested by user)
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
                // Lump Sum Mapping: H=Base, I-L=Extras, M=Total
                let basePrice = Number(job.Price_Cust_Total || 0)
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
                        costs.forEach((c: any) => {
                            const val = Number(c.charge_cust) || 0
                            const thName = EXPENSE_MAP[c.type] || c.type
                            if (val > 0) {
                                const colIdx = columnMap[thName] || 12
                                jobExtras[colIdx] += val
                            }
                        })
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
            row.eachCell((cell) => {
                if (Number(cell.col) >= 8) cell.numFmt = '#,##0.00'
            })
        })

        // 7. Summary and Totals (Dynamic Position)
        const jobsEndRow = 10 + jobs.length
        let currentRowIndex = jobsEndRow
        
        const styleSummaryCell = (cell: ExcelJS.Cell, isLabel = false) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            }
            if (isLabel) {
                cell.font = { bold: true }
                cell.alignment = { horizontal: 'right' }
            } else {
                cell.numFmt = '#,##0.00'
                cell.font = { bold: true }
            }
        }

        // 7.0 Extra Total Quantity Row for Per Unit
        if (isPerUnit) {
            const qtyRow = worksheet.getRow(currentRowIndex)
            qtyRow.getCell(6).value = "รวมจำนวนชิ้นทั้งสิ้น"
            qtyRow.getCell(8).value = totalQuantity
            qtyRow.getCell(8).numFmt = '#,##0'
            styleSummaryCell(qtyRow.getCell(6), true)
            styleSummaryCell(qtyRow.getCell(8))
            for(let c=7; c<=12; c++) if(c!==8) styleSummaryCell(qtyRow.getCell(c))
            currentRowIndex++
        }

        // 7.1 Subtotal Row
        const subtotalRow = worksheet.getRow(currentRowIndex)
        subtotalRow.getCell(6).value = "รวมเป็นเงิน (Subtotal)"
        subtotalRow.getCell(13).value = summaryTotals[13]
        styleSummaryCell(subtotalRow.getCell(6), true)
        styleSummaryCell(subtotalRow.getCell(13))
        for(let c=7; c<=12; c++) styleSummaryCell(subtotalRow.getCell(c))
        
        // 7.2 Discount Row
        const discountAmount = Number(finalDoc.Discount_Amount || 0)
        if (discountAmount > 0) {
            currentRowIndex++
            const discountRow = worksheet.getRow(currentRowIndex)
            const dRate = finalDoc.Discount_Rate || finalDoc.Discount_Percent || 0
            discountRow.getCell(6).value = `ส่วนลด (Discount) ${dRate > 0 ? dRate + '%' : ''}`
            discountRow.getCell(13).value = discountAmount
            styleSummaryCell(discountRow.getCell(6), true)
            styleSummaryCell(discountRow.getCell(13))
            discountRow.getCell(13).font = { bold: true, color: { argb: 'FFFF0000' } } 
            for(let c=7; c<=12; c++) styleSummaryCell(discountRow.getCell(c))
        }

        // 7.3 VAT Row
        const vatAmount = Number(finalDoc.VAT_Amount || 0)
        if (vatAmount > 0) {
            currentRowIndex++
            const vatRow = worksheet.getRow(currentRowIndex)
            vatRow.getCell(6).value = `ภาษีมูลค่าเพิ่ม (VAT) ${finalDoc.VAT_Rate || 0}%`
            vatRow.getCell(13).value = vatAmount
            styleSummaryCell(vatRow.getCell(6), true)
            styleSummaryCell(vatRow.getCell(13))
            for(let c=7; c<=12; c++) styleSummaryCell(vatRow.getCell(c))
        }

        // 7.4 Grand Total Row
        currentRowIndex++
        const grandTotalRow = worksheet.getRow(currentRowIndex)
        grandTotalRow.getCell(6).value = "จำนวนเงินรวมทั้งสิ้น (Grand Total)"
        // Force recalculation based on summaryTotals[13] to ensure consistency with price hotfix
        const calculatedGrandTotal = summaryTotals[13] - discountAmount + vatAmount
        grandTotalRow.getCell(13).value = calculatedGrandTotal
        styleSummaryCell(grandTotalRow.getCell(6), true)
        styleSummaryCell(grandTotalRow.getCell(13))
        grandTotalRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
        grandTotalRow.getCell(13).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
        for(let c=7; c<=12; c++) styleSummaryCell(grandTotalRow.getCell(c))

        // 7.5 WHT Row (If applicable)
        const whtAmount = Number(finalDoc.WHT_Amount || 0)
        if (whtAmount > 0) {
            currentRowIndex++
            const whtRow = worksheet.getRow(currentRowIndex)
            whtRow.getCell(6).value = `หักภาษี ณ ที่จ่าย (WHT) ${finalDoc.WHT_Rate || 0}%`
            whtRow.getCell(13).value = whtAmount
            styleSummaryCell(whtRow.getCell(6), true)
            styleSummaryCell(whtRow.getCell(13))
            for(let c=7; c<=12; c++) styleSummaryCell(whtRow.getCell(c))

            currentRowIndex++
            const netRow = worksheet.getRow(currentRowIndex)
            netRow.getCell(6).value = "ยอดจ่ายสุทธิ (Net Total)"
            // Force recalculation based on adjusted Grand Total
            const calculatedNetTotal = Number(grandTotalRow.getCell(13).value) - whtAmount
            netRow.getCell(13).value = calculatedNetTotal
            styleSummaryCell(netRow.getCell(6), true)
            styleSummaryCell(netRow.getCell(13))
            for(let c=7; c<=12; c++) styleSummaryCell(netRow.getCell(c))
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

    } catch (error: any) {
        console.error("Excel Export Error:", error)
        return { success: false, error: error.message }
    }
}
