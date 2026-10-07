import { bahtText } from "@/lib/utils/baht-text"
import { formatThaiId } from "@/lib/utils/thai-id"

type VoucherJob = {
    Job_ID?: string
    Plan_Date?: string | null
    Route_Name?: string | null
    Cost_Driver_Total?: number | null
    extra_costs_json?: unknown
    original_destinations_json?: unknown
}

type VoucherPayment = {
    Driver_Payment_ID: string
    Driver_Name: string
    Payment_Date: string
    Total_Amount?: number | null
    VAT_Rate?: number | null
    VAT_Amount?: number | null
    WHT_Rate?: number | null
    Withholding_Tax?: number | null
    Claim_Rate?: number | null
    Claim_Amount?: number | null
    Net_Amount?: number | null
}

type VoucherCompany = {
    company_name?: string
    company_name_th?: string
    company_name_en?: string
    address?: string
    tax_id?: string
    branch?: string
    phone?: string
    logo_url?: string
} | null

export type PaymentVoucherProps = {
    payment: VoucherPayment
    jobs: VoucherJob[]
    company: VoucherCompany
    bankInfo: { Bank_Name?: string | null; Bank_Account_No?: string | null; Bank_Account_Name?: string | null; Payee_Tax_ID?: string | null }
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const thaiDate = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' }) : '-'

function parseExtraCosts(raw: unknown): { type?: string; cost_driver?: number }[] {
    let parsed = raw
    // stored double-encoded on some rows
    for (let i = 0; i < 2 && typeof parsed === 'string'; i++) {
        try { parsed = JSON.parse(parsed) } catch { return [] }
    }
    return Array.isArray(parsed) ? parsed.filter(c => Number(c?.cost_driver) > 0) : []
}

// ชื่อจุดส่งทั้งหมดของงาน (multi-drop) — Route_Name เก็บแค่ต้นทาง → จุดสุดท้าย
function dropNames(raw: unknown): string[] {
    let v = raw
    for (let i = 0; i < 2 && typeof v === 'string'; i++) {
        try { v = JSON.parse(v) } catch { return [] }
    }
    if (!Array.isArray(v)) return []
    return v.map(d => String((d as { name?: unknown })?.name ?? '').trim()).filter(Boolean)
}

/**
 * ใบสำคัญจ่ายค่าเที่ยวคนขับ — fixed light palette (not theme tokens) so it reads
 * the same in dark mode and prints black on white. The summary + signatures sit
 * after the table in one unbreakable block, so they print once on the last page
 * while the column header repeats on every page.
 */
export function PaymentVoucher({ payment: p, jobs, company, bankInfo }: PaymentVoucherProps) {
    const rows = jobs.map(job => ({ job, extras: parseExtraCosts(job.extra_costs_json) }))
    const computedSubtotal = rows.reduce(
        (sum, { job, extras }) => sum + (Number(job.Cost_Driver_Total) || 0) + extras.reduce((a, c) => a + Number(c.cost_driver), 0),
        0,
    )
    // ยอดที่แอดมินตั้งตอนทำจ่าย (จาก DB) เป็นหลัก — คำนวณเองเฉพาะตอนไม่มี
    const subtotal = p.Total_Amount != null ? Number(p.Total_Amount) : computedSubtotal
    const vatRate = Number(p.VAT_Rate) || 0
    const whtRate = p.WHT_Rate != null ? Number(p.WHT_Rate) : 1
    const claimRate = Number(p.Claim_Rate) || 0
    const vatAmount = p.VAT_Amount != null ? Number(p.VAT_Amount) : Math.round(subtotal * vatRate) / 100
    const withholding = p.Withholding_Tax != null ? Number(p.Withholding_Tax) : Math.round(subtotal * whtRate) / 100
    const claimAmount = p.Claim_Amount != null ? Number(p.Claim_Amount) : Math.round(subtotal * claimRate) / 100
    const netTotal = p.Net_Amount != null ? Number(p.Net_Amount) : subtotal + vatAmount - withholding - claimAmount
    // Jobs edited after the voucher was issued — flag rather than silently disagree
    const subtotalMismatch = p.Total_Amount != null && Math.abs(computedSubtotal - subtotal) >= 0.01

    // e.g. "ค่าเด็กรถ" — named once in the remarks instead of on every row
    const extraTypes = [...new Set(rows.flatMap(r => r.extras.map(e => e.type || 'ค่าใช้จ่ายเพิ่มเติม')))]

    const companyName = company?.company_name_th || company?.company_name || ''
    const taxId = company?.tax_id ? `${company.tax_id}${company.branch && !company.tax_id.includes('(') ? ` (${company.branch})` : ''}` : ''

    return (
        <div id="printable-content" className="voucher max-w-[210mm] mx-auto bg-white text-black p-8 print:p-0 print:max-w-none text-[13px] leading-snug">
            {/* Header */}
            <div className="flex justify-between items-start gap-6 mb-3">
                <div className="flex items-start gap-3 max-w-[68%]">
                    {company?.logo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={company.logo_url} alt="" className="h-14 w-auto object-contain shrink-0" />
                    )}
                    <div>
                        <p className="font-bold text-[15px]">{companyName}</p>
                        {company?.company_name_en && <p className="text-slate-600">{company.company_name_en}</p>}
                        {company?.address && <p className="text-slate-700 mt-0.5">{company.address}</p>}
                        <p className="text-slate-700">
                            {taxId && <>เลขประจำตัวผู้เสียภาษี {taxId}</>}
                            {company?.phone && <> · โทร {company.phone}</>}
                        </p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <h1 className="text-2xl font-bold">ใบสำคัญจ่าย</h1>
                    <p className="text-slate-600 tracking-widest uppercase text-[11px]">Payment Voucher</p>
                    <table className="mt-2 ml-auto text-[12px]">
                        <tbody>
                            <tr><td className="text-slate-600 pr-2 text-right">เลขที่</td><td className="font-mono font-bold">{p.Driver_Payment_ID}</td></tr>
                            <tr><td className="text-slate-600 pr-2 text-right">วันที่</td><td>{thaiDate(p.Payment_Date)}</td></tr>
                            <tr><td className="text-slate-600 pr-2 text-right">ชำระโดย</td><td>โอนเงินผ่านธนาคาร</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Payee */}
            <div className="border border-slate-400 rounded px-3 py-1.5 mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <span className="text-slate-600">จ่ายให้ (Payee)</span>
                <span className="font-bold">{p.Driver_Name}</span>
                <span className="text-slate-600">เลขประจำตัวผู้เสียภาษี</span>
                <span className="font-mono">{bankInfo.Payee_Tax_ID ? formatThaiId(bankInfo.Payee_Tax_ID) : '-'}</span>
                <span className="text-slate-600">บัญชีรับเงิน</span>
                {bankInfo.Bank_Account_No ? (
                    <span>{bankInfo.Bank_Name} เลขที่ {bankInfo.Bank_Account_No} ({bankInfo.Bank_Account_Name || p.Driver_Name})</span>
                ) : (
                    <span className="italic">— ไม่พบข้อมูลบัญชีธนาคาร —</span>
                )}
            </div>

            {/* Items — thead repeats on each printed page; one row group per trip */}
            <table className="w-full border-collapse text-[12px]">
                <thead>
                    <tr className="border-y-2 border-slate-500 bg-slate-100">
                        <th className="py-1.5 px-2 text-center font-bold w-10">ลำดับ</th>
                        <th className="py-1.5 px-2 text-center font-bold w-24">วันที่</th>
                        <th className="py-1.5 px-2 text-left font-bold">รายการ</th>
                        <th className="py-1.5 px-2 text-right font-bold w-20">ค่าเที่ยว</th>
                        <th className="py-1.5 px-2 text-right font-bold w-24">ค่าใช้จ่ายเพิ่ม</th>
                        <th className="py-1.5 px-2 text-right font-bold w-24">รวม (บาท)</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ job, extras }, index) => {
                        const base = Number(job.Cost_Driver_Total) || 0
                        const extraSum = extras.reduce((a, c) => a + Number(c.cost_driver), 0)
                        return (
                            <tr key={job.Job_ID || index} className="voucher-trip border-b border-slate-300 align-top">
                                <td className="py-1 px-2 text-center">{index + 1}</td>
                                <td className="py-1 px-2 text-center whitespace-nowrap">{thaiDate(job.Plan_Date)}</td>
                                <td className="py-1 px-2">
                                    <div>ค่าเที่ยววิ่ง <span className="font-mono text-[11px] text-slate-600">{job.Job_ID}</span></div>
                                    <div className="text-slate-700">
                                        {job.Route_Name || '-'}
                                    </div>
                                    {(() => {
                                        const drops = dropNames(job.original_destinations_json)
                                        return drops.length > 1 ? (
                                            <div className="text-[10.5px] leading-snug text-slate-500 mt-0.5">
                                                ส่ง {drops.length} จุด: {drops.join(' · ')}
                                            </div>
                                        ) : null
                                    })()}
                                </td>
                                <td className="py-1 px-2 text-right tabular-nums">{money(base)}</td>
                                <td className="py-1 px-2 text-right tabular-nums">{extraSum > 0 ? money(extraSum) : '-'}</td>
                                <td className="py-1 px-2 text-right tabular-nums font-semibold">{money(base + extraSum)}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>

            {/* Summary + signatures: one block, printed once at the end */}
            <div className="voucher-end mt-3">
                <div className="flex gap-6 items-start">
                    <div className="flex-1 space-y-2">
                        <div className="border border-slate-400 rounded px-3 py-2 bg-slate-50">
                            <span className="text-slate-600">จำนวนเงินสุทธิ (ตัวอักษร): </span>
                            <span className="font-bold">{bahtText(netTotal)}</span>
                        </div>
                        <div className="text-slate-700 text-[12px]">
                            <p>หมายเหตุ: ค่าเที่ยว {rows.length} เที่ยว · ยอดนี้รวมค่าแรงและค่าพาหนะแล้ว</p>
                            {extraTypes.length > 0 && <p>ค่าใช้จ่ายเพิ่ม: {extraTypes.join(', ')}</p>}
                            {subtotalMismatch && (
                                <p className="font-bold">* ยอดรายการปัจจุบัน {money(computedSubtotal)} ไม่ตรงกับยอดที่ทำจ่าย (มีการแก้ไขงานหลังออกเอกสาร)</p>
                            )}
                        </div>
                    </div>
                    <table className="w-[46%] text-[13px] border-collapse">
                        <tbody>
                            <tr>
                                <td className="py-1 px-2 text-right">รวมเป็นเงิน</td>
                                <td className="py-1 px-2 text-right tabular-nums w-32">{money(subtotal)}</td>
                            </tr>
                            {vatAmount > 0 && (
                                <tr>
                                    <td className="py-1 px-2 text-right">บวก ภาษีมูลค่าเพิ่ม {vatRate}%</td>
                                    <td className="py-1 px-2 text-right tabular-nums">{money(vatAmount)}</td>
                                </tr>
                            )}
                            {withholding > 0 && (
                                <tr>
                                    <td className="py-1 px-2 text-right">หัก ภาษี ณ ที่จ่าย {whtRate}%</td>
                                    <td className="py-1 px-2 text-right tabular-nums">({money(withholding)})</td>
                                </tr>
                            )}
                            {claimAmount > 0 && (
                                <tr>
                                    <td className="py-1 px-2 text-right">หัก ค่าเคลมสินค้า {claimRate}%</td>
                                    <td className="py-1 px-2 text-right tabular-nums">({money(claimAmount)})</td>
                                </tr>
                            )}
                            <tr className="border-y-2 border-slate-600">
                                <td className="py-1.5 px-2 text-right font-bold">ยอดจ่ายสุทธิ</td>
                                <td className="py-1.5 px-2 text-right font-bold tabular-nums underline decoration-double">{money(netTotal)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="grid grid-cols-2 gap-10 mt-8 text-center">
                    {['ผู้รับเงิน (Payee)', 'ผู้จ่ายเงิน / ผู้มีอำนาจลงนาม'].map(label => (
                        <div key={label}>
                            <div className="border-b border-dotted border-slate-600 h-8 mx-6" />
                            <p className="mt-1">( ........................................................ )</p>
                            <p className="font-bold">{label}</p>
                            <p className="mt-1 text-slate-700">วันที่ ......../......../............</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

/** Print rules: real A4 margins (page 2+ no longer starts flush at the paper edge) + page numbers. */
export const voucherPrintCss = `
    @page {
        size: A4;
        margin: 12mm 12mm 14mm;
        @bottom-right { content: "หน้า " counter(page) " / " counter(pages); font-size: 9pt; color: #555; }
    }
    html, body { background: white !important; }
    body { visibility: hidden; }
    #printable-content, #printable-content * { visibility: visible; }
    #printable-content { position: absolute; left: 0; top: 0; width: 100%; }
    .voucher { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .voucher thead { display: table-header-group; }
    .voucher-trip { break-inside: avoid; }
    .voucher-end { break-inside: avoid; }
`
