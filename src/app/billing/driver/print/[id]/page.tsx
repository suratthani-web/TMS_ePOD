
import { getDriverPaymentByIdWithJobs } from "@/lib/supabase/billing"
import { notFound } from "next/navigation"

export const dynamic = 'force-dynamic'

type Props = {
    params: Promise<{ id: string }>
}

export default async function DriverPaymentPrintPage(props: Props) {
    const params = await props.params;
    const { id } = params
    const data = await getDriverPaymentByIdWithJobs(id)

    if (!data) {
        return notFound()
    }

    const { payment, jobs, company, bankInfo } = data
    const WITHHOLDING_TAX_RATE = 0.01

    // Calculate totals to ensure consistency
    const subtotal = jobs.reduce((sum: number, job: { Cost_Driver_Total?: number | null; extra_costs_json?: unknown }) => {
        const base = job.Cost_Driver_Total || 0
        let extra = 0
        try {
            if (job.extra_costs_json) {
                let costs = job.extra_costs_json
                if (typeof costs === 'string') {
                    try { costs = JSON.parse(costs) } catch {}
                }
                if (typeof costs === 'string') {
                    try { costs = JSON.parse(costs) } catch {}
                }
                
                if (Array.isArray(costs)) {
                    extra = costs
                        .filter((c: { cost_driver?: number }) => c.cost_driver && c.cost_driver > 0)
                        .reduce((acc: number, c: { cost_driver?: number }) => acc + (Number(c.cost_driver) || 0), 0)
                }
            }
        } catch {}
        return sum + base + extra
    }, 0)

    const withholding = Math.round(subtotal * WITHHOLDING_TAX_RATE)
    const netTotal = subtotal - withholding

    return (
        <div className="bg-white min-h-screen p-4 text-black print:p-0 print-container">
            
            <div id="printable-content" className="max-w-[210mm] mx-auto bg-white p-6 print:w-full print:max-w-none print:px-10 print:py-4 relative">
                
                {/* Header Section */}
                <div className="flex justify-between items-start mb-4">
                    {/* Left: Logo & Company Info */}
                    <div className="flex flex-col gap-2 max-w-[60%]">
                        {company?.logo_url && (
                            <div>
                                <img 
                                    src={company.logo_url} 
                                    alt="Company Logo" 
                                    className="h-16 w-auto object-contain" 
                                />
                            </div>
                        )}
                        <div className="text-lg font-bold">
                            {company ? (
                                <>
                                    <h2 className="font-bold text-base">{company.company_name}</h2>
                                    {company.company_name_en && (
                                        <p className="text-muted-foreground font-medium">{company.company_name_en}</p>
                                    )}
                                    <p className="mt-1 text-muted-foreground leading-tight">{company.address}</p>
                                    <div className="flex gap-4 mt-1">
                                        <p><span className="font-semibold">Tax ID:</span> {company.tax_id}</p>
                                    </div>
                                </>
                            ) : (
                                <p className="text-muted-foreground">Loading company info...</p>
                            )}
                        </div>
                    </div>

                    {/* Right: Document Title */}
                    <div className="text-right">
                        <h1 className="text-3xl font-bold text-foreground tracking-wide">ใบสำคัญจ่าย</h1>
                        <p className="text-muted-foreground text-base font-medium tracking-widest uppercase">Payment Voucher</p>
                        <div className="mt-2">
                             <span className="px-2 py-0.5 bg-slate-100 rounded text-base font-bold font-mono border border-slate-200">
                                ORIGINAL (ต้นฉบับ)
                             </span>
                        </div>
                    </div>
                </div>

                <hr className="border-slate-300 mb-4" />

                {/* Info Grid: Payer & Payee */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                    {/* Payer Info (Company) */}
                    <div className="border border-slate-200 rounded p-3 bg-slate-50/50">
                         <h3 className="font-bold text-lg font-bold text-muted-foreground border-b border-slate-200 pb-1 mb-1">ผู้ทำจ่าย (Payer)</h3>
                         {company ? (
                            <div className="text-base font-bold text-muted-foreground space-y-0.5">
                                <p className="font-semibold text-xl text-foreground">{company.company_name}</p>
                                <p className="leading-tight">{company.address}</p>
                                <p><span className="font-semibold">Tax ID:</span> {company.tax_id} {company.phone && <span>โทร: {company.phone}</span>}</p>
                            </div>
                         ) : (
                            <p className="text-lg font-bold text-muted-foreground">Loading...</p>
                         )}
                    </div>

                    {/* Payee Info (Driver) */}
                    <div className="border border-slate-200 rounded p-3">
                        <h3 className="font-bold text-lg font-bold text-muted-foreground border-b border-slate-200 pb-1 mb-1">ผู้รับเงิน (Payee)</h3>
                        <p className="font-semibold text-xl text-foreground">{payment.Driver_Name}</p>
                        <div className="text-base font-bold text-muted-foreground space-y-0.5">
                            {bankInfo.Bank_Account_No ? (
                                <>
                                    <p><span className="font-semibold">Bank:</span> {bankInfo.Bank_Name}</p>
                                    <p><span className="font-semibold">Account No:</span> {bankInfo.Bank_Account_No} <span className="text-base font-bold text-muted-foreground">({bankInfo.Bank_Account_Name})</span></p>
                                </>
                            ) : (
                                <p className="text-amber-600 italic">* ไม่พบข้อมูลบัญชีธนาคาร</p>
                            )}
                         </div>
                    </div>
                </div>

                {/* Document Details Row */}
                <div className="flex justify-between items-center mb-4 text-base font-bold bg-slate-50 p-2 rounded border border-slate-200">
                     <div>
                        <span className="text-muted-foreground mr-2">เลขที่เอกสาร (No.):</span>
                        <span className="font-mono font-bold text-xl tracking-tight">{payment.Driver_Payment_ID}</span>
                     </div>
                     <div>
                        <span className="text-muted-foreground mr-2">วันที่ (Date):</span>
                        <span className="font-medium">{new Date(payment.Payment_Date).toLocaleDateString('th-TH')}</span>
                     </div>
                     <div>
                        <span className="text-muted-foreground mr-2">วิธีการชำระ (Payment Method):</span>
                        <span className="font-medium">Bank Transfer</span>
                     </div>
                </div>

                {/* Table */}
                <div className="mb-4">
                    <table className="w-full text-[12px] border-collapse">
                        <thead>
                            <tr className="bg-slate-100 text-muted-foreground border-y-2 border-slate-300">
                                <th className="py-2 px-3 text-center font-bold w-12">No.</th>
                                <th className="py-2 px-3 text-left font-bold">รายการ (Description)</th>
                                <th className="py-2 px-3 text-center font-bold w-24">วันที่ (Date)</th>
                                <th className="py-2 px-3 text-right font-bold w-32">จำนวนเงิน (Amount)</th>
                            </tr>
                        </thead>
                        {jobs.map((item: { Job_ID?: string; Plan_Date?: string | null; Origin_Location?: string | null; Dest_Location?: string | null; Route_Name?: string | null; Cost_Driver_Total?: number | null; extra_costs_json?: unknown }, index: number) => {
                                let extraCosts: { type?: string; cost_driver?: number }[] = []
                                try {
                                    if (item.extra_costs_json) {
                                        let parsed = item.extra_costs_json
                                        if (typeof parsed === 'string') {
                                            try { parsed = JSON.parse(parsed) } catch {}
                                        }
                                        if (typeof parsed === 'string') {
                                            try { parsed = JSON.parse(parsed) } catch {}
                                        }
                                        if (Array.isArray(parsed)) {
                                            extraCosts = parsed.filter(c => c.cost_driver > 0)
                                        }
                                    }
                                } catch {}

                                return (
                                    <tbody key={item.Job_ID} className="border-b border-slate-200">
                                        <tr>
                                            <td className="py-2 px-3 text-center text-muted-foreground align-top">{index + 1}</td>
                                            <td className="py-2 px-3">
                                                <div className="font-bold text-muted-foreground">ค่าเที่ยววิ่ง (Job: {item.Job_ID})</div>
                                                <div className="text-base font-bold text-muted-foreground">{item.Route_Name}</div>
                                            </td>
                                            <td className="py-2 px-3 text-center text-muted-foreground align-top">
                                                {item.Plan_Date ? new Date(item.Plan_Date).toLocaleDateString('th-TH') : '-'}
                                            </td>
                                            <td className="py-2 px-3 text-right font-bold text-muted-foreground align-top">
                                                {item.Cost_Driver_Total?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                        {extraCosts.map((extra, i) => (
                                            <tr key={`${item.Job_ID}-extra-${i}`} className="text-muted-foreground bg-slate-50/30">
                                                <td></td>
                                                <td className="py-1 px-3">
                                                    <div className="text-base font-bold border-l-2 border-slate-300 pl-2">
                                                        {extra.type}
                                                    </div>
                                                </td>
                                                <td className="py-1 px-3 text-center">-</td>
                                                <td className="py-1 px-3 text-right">
                                                    {Number(extra.cost_driver).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                )
                            })}
                            <tbody className="border-t border-slate-300">
                                {Array.from({ length: Math.max(0, 1 - jobs.length) }).map((_, i) => (
                                    <tr key={`empty-${i}`} className="border-b border-slate-100 h-8">
                                        <td colSpan={4}></td>
                                    </tr>
                                ))}
                            </tbody>
                        <tfoot>
                             <tr>
                                <td colSpan={2} rowSpan={3} className="pt-2 pr-4 align-top">
                                    <div className="border border-slate-300 bg-slate-50 p-2 rounded text-base font-bold text-muted-foreground">
                                        <p className="font-bold mb-0.5">หมายเหตุ (Remarks):</p>
                                        <p>- ยอดเงินนี้รวมค่าแรงและค่าพาหนะแล้ว</p>
                                        <p>- Auto-generated Payment Voucher</p>
                                    </div>
                                </td>
                                <td className="py-1 px-3 text-right font-bold text-muted-foreground">รวมเป็นเงิน</td>
                                <td className="py-1 px-3 text-right font-bold text-muted-foreground">{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                            <tr>
                                <td className="py-1 px-3 text-right text-muted-foreground text-base font-bold">หัก ณ ที่จ่าย 1%</td>
                                <td className="py-1 px-3 text-right text-red-500 font-medium">-{withholding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                            <tr className="bg-slate-50 border-t-2 border-slate-300 border-b-2">
                                <td className="py-2 px-3 text-right font-bold text-foreground text-base">ยอดสุทธิ</td>
                                <td className="py-2 px-3 text-right font-bold text-indigo-700 text-base decoration-double underline">
                                    {netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                 {/* Footer Signatures */}
                <div className="flex justify-between mt-8 text-base font-bold text-muted-foreground pb-4 break-inside-avoid">
                     <div className="text-center w-[45%]">
                        <div className="border-b border-slate-400 mb-1 h-6 w-3/4 mx-auto"></div>
                        <p className="font-bold">ผู้รับเงิน</p>
                        <p className="text-base font-bold">(Payee)</p>
                        <div className="mt-2 text-base font-bold">วันที่ (Date): _____/_____/_______</div>
                    </div>
                    <div className="text-center w-[45%]">
                        <div className="border-b border-slate-400 mb-1 h-6 w-3/4 mx-auto"></div>
                        <p className="font-bold">ผู้จ่ายเงิน / ผู้มีอำนาจลงนาม</p>
                        <p className="text-base font-bold">(Payer / Authorized Signature)</p>
                        <div className="mt-2 text-base font-bold">วันที่ (Date): _____/_____/_______</div>
                    </div>
                </div>
            </div>

            <style type="text/css" media="print">{`
                @page { size: auto;  margin: 0mm; }
                body { visibility: hidden; background: white !important; }
                #printable-content, #printable-content * { visibility: visible; }
                #printable-content {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                }
            `}</style>
        </div>
    )
}
