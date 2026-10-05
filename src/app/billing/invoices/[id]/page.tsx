import { getInvoiceById } from "@/lib/supabase/invoices"
import { PrintButton } from "@/components/billing/print-button"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { ConfirmInvoiceButton } from "@/components/billing/confirm-invoice-button"
import { cookies } from "next/headers"
import { dictionaries, Language } from "@/lib/i18n/dictionaries"
import { createClient } from "@/utils/supabase/server"
import { computeTripCarbon } from "@/lib/utils/job-carbon"
import { getCarbonFactors } from "@/lib/actions/carbon-factors"

export default async function InvoiceViewPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const { data: invoice } = await getInvoiceById(resolvedParams.id)

  if (!invoice) return <div className="p-8 text-white">Invoice Not Found</div>

  const cookieStore = await cookies()
  const lang = (cookieStore.get('app_language')?.value || 'th') as Language
  const dict = dictionaries[lang]
  const t = dict.billing_note // Reuse billing_note translation for consistency

  // Fetch associated jobs to compute per-trip CO2 with the shared formula
  // (computeTripCarbon) — same number the customer sees on LINE / POD / track.
  const supabase = await createClient()
  const { data: jobs } = await supabase
    .from('Jobs_Main')
    .select('Job_ID, Est_Distance_KM, Vehicle_Type, Weight_Kg')
    .eq('Invoice_ID', invoice.Invoice_ID)

  // ดึงค่า EF จาก DB (แอดมินตั้งใน /settings/esg) แล้ว fallback เป็น hardcode
  const carbonFactors = await getCarbonFactors()
  // ใบแจ้งหนี้: คิด "1 ขา รถหนัก" (เที่ยวเดียว) ไม่รวมตีเปล่ากลับ; ไม่มีระยะ → ประมาณ 12.5 กม.
  const totalCO2 = (jobs || []).reduce(
    (sum, job) => sum + (computeTripCarbon(job, carbonFactors, { fallbackKm: 12.5 })?.co2Kg ?? 0),
    0
  )

  const localeStr = lang === 'th' ? 'th-TH' : 'en-US'

  return (
    <div className="min-h-screen bg-card print:bg-white text-muted-foreground print:text-black p-8 font-sans">
        {/* Actions - Hidden on Print */}
        <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center print-hidden">
            <Link href="/billing/invoices">
                <Button variant="ghost" className="text-muted-foreground hover:text-white">
                    <ArrowLeft className="mr-2 h-4 w-4" /> {dict.common?.back || 'Back'}
                </Button>
            </Link>
            <div className="flex gap-3">
                {invoice.Status === 'Confirmed' && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-lg border border-emerald-500/20 font-black uppercase text-xs">
                        <CheckCircle2 size={16} /> ยืนยันความถูกต้องแล้ว
                    </div>
                )}
                <ConfirmInvoiceButton invoiceId={invoice.Invoice_ID} status={invoice.Status} />
                <PrintButton />
            </div>
        </div>

        {/* Invoice Paper */}
        <div className="max-w-[210mm] mx-auto bg-white text-black p-[15mm] shadow-xl print:shadow-none print:p-0 min-h-[297mm]">
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
                <div>
                     {/* Company Logo/Name logic here (Hardcoded for now as placeholder) */}
                     <h1 className="text-2xl font-bold text-indigo-800">DRouteMind</h1>
                     <p className="text-xl text-muted-foreground">
                        123 Transport Lane, Logistics City<br/>
                        Bangkok, 10110<br/>
                        Tax ID: 0105551234567
                     </p>
                </div>
                <div className="text-right">
                    <h2 className="text-3xl font-bold text-gray-800 mb-2">TAX INVOICE</h2>
                    <div className="text-xl">
                        <p><span className="font-bold">No:</span> {invoice.Invoice_ID}</p>
                        <p><span className="font-bold">Date:</span> {new Date(invoice.Issue_Date).toLocaleDateString('th-TH')}</p>
                        {invoice.Due_Date && (
                            <p><span className="font-bold">Due Date:</span> {new Date(invoice.Due_Date).toLocaleDateString('th-TH')}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Customer Info */}
            <div className="mb-8 p-4 border rounded bg-gray-50 print:bg-transparent print:border-gray-200">
                <h3 className="font-bold mb-2 border-b pb-1 text-gray-700">Bill To:</h3>
                <p className="font-bold text-lg">{invoice.customers?.Customer_Name}</p>
                <p className="text-xl whitespace-pre-line text-gray-600">{invoice.customers?.Billing_Address || invoice.customers?.Address || 'No Address'}</p>
                <p className="text-xl mt-1 text-gray-600">Tax ID: {invoice.customers?.Tax_ID || '-'}</p>
            </div>

            {/* Items Table */}
            <table className="w-full text-xl mb-8 border-collapse">
                <thead>
                    <tr className="bg-gray-100 border-b border-gray-300 print:bg-gray-50">
                        <th className="p-3 text-left w-12 text-gray-600">{t.no}</th>
                        <th className="p-3 text-left text-gray-600">{t.description}</th>
                        <th className="p-3 text-right w-32 text-gray-600">{t.amount}</th>
                    </tr>
                </thead>
                <tbody>
                    {invoice.Items_JSON && Array.isArray(invoice.Items_JSON) ? (
                        invoice.Items_JSON.map((item: { Route_Name: string; Job_ID: string; Plan_Date: string; Price_Cust_Total: number }, idx: number) => (
                            <tr key={idx} className="border-b border-gray-200">
                                <td className="p-3 align-top">{idx + 1}</td>
                                <td className="p-3">
                                    <div className="font-bold text-gray-800">{item.Route_Name}</div>
                                    <div className="text-lg font-bold text-muted-foreground mt-1">
                                        Job ID: {item.Job_ID} | {t.date}: {new Date(item.Plan_Date).toLocaleDateString(localeStr)}
                                    </div>
                                </td>
                                <td className="p-3 text-right align-top font-medium">{Number(item.Price_Cust_Total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                        ))
                    ) : (
                        <tr><td colSpan={3} className="p-4 text-center">No Items</td></tr>
                    )}
                </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-between items-start mb-12">
                {/* CO2 Summary Section (NEW) */}
                <div className="flex-1 max-w-sm p-5 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-between gap-6 mr-8">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-emerald-100 flex items-center justify-center text-emerald-600 font-black">
                            CO₂
                        </div>
                        <div>
                            <h4 className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-1">{t.co2_summary_title}</h4>
                            <p className="text-[10px] text-emerald-600 font-bold opacity-60">DRouteMind ESG Protocol v2.5</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <div className="text-2xl font-black text-emerald-900 leading-none mb-1">
                            {totalCO2.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-[10px] uppercase ml-1 italic opacity-50">{t.co2_unit}</span>
                        </div>
                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">{t.co2_total_label}</p>
                     </div>
                </div>

                <div className="w-72 space-y-2">
                    <div className="flex justify-between text-xl py-1">
                        <span className="text-gray-600">{t.subtotal}</span>
                        <span className="font-medium">{Number(invoice.Subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    {invoice.VAT_Rate > 0 && (
                        <div className="flex justify-between text-xl py-1">
                            <span className="text-gray-600">{t.vat || 'VAT'} ({invoice.VAT_Rate}%)</span>
                            <span className="font-medium">{Number(invoice.VAT_Amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2">
                        <span>{t.total}</span>
                        <span>{Number(invoice.Grand_Total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    {invoice.WHT_Amount > 0 && (
                        <div className="flex justify-between text-xl text-red-600 border-t pt-2 border-dashed mt-2">
                            <span>{t.wht} ({invoice.WHT_Rate}%)</span>
                            <span>-{Number(invoice.WHT_Amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    )}
                    <div className="flex justify-between font-bold text-xl border-2 border-gray-200 pt-3 pb-3 px-4 bg-gray-50 mt-4 rounded print:border-black print:bg-transparent">
                        <span>{t.net_total_label}</span>
                        <span>{Number(invoice.Net_Total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-12 mt-20 pt-8 page-break-inside-avoid">
                <div className="text-center">
                    <div className="border-b border-black mb-2 w-3/4 mx-auto h-8"></div>
                    <p className="text-xl font-bold">{t.authorized_signature}</p>
                    <p className="text-lg font-bold text-muted-foreground mt-1">DRouteMind</p>
                    <p className="text-lg font-bold text-gray-400 mt-1">Date: ____/____/____</p>
                </div>
                <div className="text-center">
                    <div className="border-b border-black mb-2 w-3/4 mx-auto h-8"></div>
                    <p className="text-xl font-bold">{t.receiver_signature}</p>
                    <p className="text-lg font-bold text-muted-foreground mt-1">Received By</p>
                    <p className="text-lg font-bold text-gray-400 mt-1">Date: ____/____/____</p>
                </div>
            </div>
            
            {/* Notes */}
            {invoice.Notes && (
                <div className="mt-12 pt-4 border-t text-xl text-muted-foreground print:text-lg font-bold">
                    <strong className="text-gray-700">{t.remarks}:</strong> {invoice.Notes}
                </div>
            )}
        </div>
    </div>
  )
}
