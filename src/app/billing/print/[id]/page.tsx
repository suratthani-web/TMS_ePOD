import { getBillingNoteByIdWithJobs } from "@/lib/supabase/billing"
import { notFound } from "next/navigation"
import { PrintButton } from "@/components/billing/print-button"
import { dictionaries, Language } from "@/lib/i18n/dictionaries"
import { Phone, Mail, User, FileText, CreditCard, MessageSquare, PenTool, Globe as GlobeIcon } from "lucide-react"
import { headers } from "next/headers"
import { 
    aggregateBillingJobs, 
    ArabicNumberToText 
} from "@/lib/billing-utils"


export const dynamic = 'force-dynamic'

type Props = {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ lang?: string }>;
}

function safeLocaleDateString(date: Date, locale: string) {
    try {
        if (!date || isNaN(date.getTime())) return '-';
        return date.toLocaleDateString(locale);
    } catch {
        return '-';
    }
}

export default async function BillingPrintPage(props: Props) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const { id } = params
    const lang = (searchParams?.lang as Language) || 'th'
    
    const data = await getBillingNoteByIdWithJobs(id)

    // Get current host for QR code
    const host = (await headers()).get('host') || ''
    const isIP = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?::[0-9]+)?$/.test(host) || host.startsWith('localhost')
    const proto = (await headers()).get('x-forwarded-proto') || (isIP ? 'http' : (process.env.NODE_ENV === 'development' ? 'http' : 'https'))
    const baseUrl = `${proto}://${host}`


    if (!data || !data.note) {
        return notFound()
    }

    const { note, jobs, company } = data

    // Unified Data Access (Support both accounting_profile and company_profile)
    const logoUrl = company?.logo_url || company?.Logo_URL || '/images/account logo.png'
    const sellerName = company?.company_name_th || company?.Company_Name_TH || (lang === 'th' ? company?.company_name : company?.company_name_en)
    const sellerAddress = company?.address || company?.Address
    const sellerTaxId = company?.tax_id || company?.Tax_ID
    const sellerPhone = company?.phone || company?.Phone
    const sellerEmail = company?.email || company?.Email
    const sellerWebsite = company?.website || company?.Website
    
    const bankName = company?.bank_name || company?.Bank_Name || 'ธนาคารไทยพาณิชย์ (SCB)'
    const bankAccNo = company?.bank_account_no || company?.Bank_Account_No
    const bankAccName = company?.bank_account_name || company?.Bank_Account_Name
    const contactName = company?.contact_name || company?.Contact_Name || 'ฝ่ายบัญชี'



    // Use shared aggregation logic
    const baseItems = aggregateBillingJobs(jobs, lang === 'en' ? 'en' : 'th', note.Customer_Name || undefined)
    
    const displayItems = baseItems;
    
    const totalPreTax = baseItems.reduce((acc, curr) => acc + curr.totalBeforeTax, 0)
    
    // Robust Discount Calculation
    let discountAmount = Number(note.Discount_Amount || 0)
    let discountPercent = Number(note.Discount_Percent || 0)
    if (discountPercent > 0 && discountAmount === 0) {
        discountAmount = (totalPreTax * discountPercent) / 100
    } else if (discountAmount > 0 && discountPercent === 0) {
        discountPercent = (discountAmount / totalPreTax) * 100
    }

    const subTotal = totalPreTax - discountAmount;
    const vatAmount = Number(note.VAT_Amount || 0);
    const totalWithVat = subTotal + vatAmount;

    const whtRate = Number(note.WHT_Rate || 0);
    const wht = (note.WHT_Amount && note.WHT_Amount > 0) 
        ? Number(note.WHT_Amount) 
        : (subTotal * whtRate / 100);
        
    const netTotal = totalWithVat - wht;

    const localeStr = lang === 'th' ? 'th-TH' : 'en-US'
    const issueDate = note.Billing_Date ? new Date(note.Billing_Date) : new Date();
    const creditDays = Number(note.Credit_Days || 15)
    const dueDate = !isNaN(issueDate.getTime()) 
        ? new Date(issueDate.getTime() + creditDays * 24 * 60 * 60 * 1000)
        : new Date();

    return (
        <div className="bg-white min-h-screen p-8 text-black print:p-0 print-container font-sans">
            <div className="fixed top-4 right-4 print:hidden flex gap-2">
                <PrintButton />
            </div>
            
            <div id="printable-content" className="w-full max-w-[210mm] mx-auto bg-white p-2 sm:p-4 md:p-6 print:w-full print:max-w-none print:p-0 text-[12px] shadow-2xl sm:shadow-none rounded-3xl sm:rounded-none">
                
                {/* 1. Header Section */}
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-4">
                        {logoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img 
                                src={logoUrl} 
                                alt="Company Logo" 
                                className="h-12 w-auto object-contain print:block" 
                                style={{ display: 'block' }}
                            />
                        )}
                    </div>
                    <div className="text-right">
                        <div className="text-[11px] text-slate-600 mb-0 font-bold">(ต้นฉบับ)</div>
                        <div className="text-3xl font-bold text-blue-500 tracking-tight leading-none">ใบวางบิล</div>
                        
                        <div className="mt-2 bg-slate-50 p-2 rounded-lg border border-slate-200 text-left">
                            <div className="grid grid-cols-[80px_1fr] gap-y-0.5 text-[11px]">
                                <div className="font-bold text-slate-600 uppercase tracking-tighter">เลขที่เอกสาร :</div>
                                <div className="font-bold">{note.Billing_Note_ID}</div>
                                <div className="font-bold text-slate-600 uppercase tracking-tighter">วันที่ออก :</div>
                                <div>{safeLocaleDateString(issueDate, localeStr)}</div>
                                <div className="font-bold text-slate-600 uppercase tracking-tighter">วันที่ครบกำหนด :</div>
                                <div>{safeLocaleDateString(dueDate, localeStr)}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Info Section */}
                <div className="flex flex-row justify-between gap-4 mb-3 text-slate-800 text-[12px]">
                    <div className="flex-1 space-y-4">
                        <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-0.5">
                            <div className="font-bold">ผู้ขาย :</div>
                            <div className="font-bold">{sellerName}</div>
                            <div className="font-bold">ที่อยู่ :</div>
                            <div className="leading-tight">{sellerAddress || '-'}</div>
                            <div className="font-bold">เลขที่ภาษี :</div>
                            <div>{sellerTaxId || '-'}</div>
                        </div>
                        
                        <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-0.5 mt-2">
                            <div className="font-bold">ลูกค้า :</div>
                            <div className="font-bold">{note.Customer_Name}</div>
                            <div className="font-bold">ที่อยู่ :</div>
                            <div className="leading-tight">{note.Customer_Address || '-'}</div>
                            <div className="font-bold">เลขที่ภาษี :</div>
                            <div>{note.Customer_Tax_ID || '-'}</div>
                        </div>
                    </div>
                    
                    <div className="w-[220px] shrink-0 text-right">
                        <div className="text-[11px] space-y-0.5">
                            <div className="font-bold text-slate-400 uppercase tracking-widest text-[9px] mb-1">ติดต่อเรา</div>
                            <div className="flex items-center justify-end gap-2"><span className="text-slate-600">{contactName}</span> <User size={10} className="text-slate-400"/></div>
                            <div className="flex items-center justify-end gap-2"><span className="text-slate-600">{sellerPhone || '-'}</span> <Phone size={10} className="text-slate-400"/></div>
                            <div className="flex items-center justify-end gap-2"><span className="text-slate-600">{sellerEmail || '-'}</span> <Mail size={10} className="text-slate-400"/></div>
                        </div>
                    </div>
                </div>

                {/* 3. Items Table */}
                <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0 mb-3">
                    <table className="w-full border-collapse min-w-[600px] md:min-w-0">
                    <thead>
                        <tr className="bg-[#eef2ff] text-slate-800 text-[12px] border-b-2 border-slate-300">
                            <th className="py-1.5 px-2 text-left font-bold w-10">ลำดับ</th>
                            <th className="py-1.5 px-2 text-left font-bold">คำอธิบาย</th>
                            <th className="py-1.5 px-2 text-center font-bold w-20">จำนวน</th>
                            <th className="py-1.5 px-2 text-right font-bold w-28">ราคา</th>
                            <th className="py-1.5 px-2 text-right font-bold w-20">ส่วนลด</th>
                            <th className="py-1.5 px-2 text-center font-bold w-20">VAT</th>
                            <th className="py-1.5 px-2 text-right font-bold w-28">มูลค่าก่อนภาษี</th>
                        </tr>
                    </thead>
                    <tbody className="text-[12px]">
                        {displayItems.map((item, idx) => (
                            <tr key={idx} className={`border-b border-slate-100 ${item.isExtra ? 'text-slate-600 italic' : 'font-semibold'}`}>
                                <td className="py-1.5 px-2 text-center align-top">{idx + 1}</td>
                                <td className="py-1.5 px-2 align-top">
                                    <div className="leading-tight">{item.description}</div>
                                    {item.subDescription && <div className="text-[10px] text-slate-500 font-normal mt-0">{item.subDescription}</div>}
                                </td>
                                <td className="py-1.5 px-2 text-center align-top">{item.qty.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="py-1.5 px-2 text-right align-top">{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="py-1.5 px-2 text-right align-top">
                                    {discountPercent > 0 ? `${discountPercent}%` : '0.00'}
                                </td>
                                <td className="py-1.5 px-2 text-center align-top">ไม่มี</td>
                                <td className="py-1.5 px-2 text-right align-top">{item.totalBeforeTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                        ))}
                    </tbody>
                    </table>
                </div>

                {/* 4. Summary Section & Payment */}
                <div className="mt-4 flex flex-row justify-between gap-8">
                    {/* Left side: Notes & Text Amount */}
                    <div className="flex-1">

                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                             <div className="w-10 h-10 flex items-center justify-center overflow-hidden bg-white p-1 rounded border border-slate-100 shrink-0">
                                <img 
                                    src="/images/scb logo.jpg" 
                                    alt="SCB Logo" 
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            <div>
                                <div className="font-bold text-slate-800 text-[11px] leading-tight">{bankName}</div>
                                <div className="font-bold text-blue-700 text-[11px] mt-0.5 leading-tight">ออมทรัพย์ {bankAccNo || '-'}</div>
                                <div className="text-slate-600 text-[10px] mt-0.5 leading-tight">{bankAccName || '-'}</div>
                            </div>
                        </div>
                    </div>

                    {/* Right side: Calculations Table */}
                    <div className="w-[320px] shrink-0">
                        <div className="border-2 border-slate-800 rounded-sm overflow-hidden">
                            <div className="grid grid-cols-[1fr_110px] border-b border-slate-800">
                                <div className="p-2 font-bold border-r border-slate-800 bg-slate-50">มูลค่ารวม (Total)</div>
                                <div className="p-2 text-right font-bold">{totalPreTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            </div>
                            
                            {discountAmount > 0 && (
                                <div className="grid grid-cols-[1fr_110px] border-b border-slate-800">
                                    <div className="p-2 font-bold border-r border-slate-800 text-[11px] leading-tight flex items-center">
                                        ส่วนลด {discountPercent.toFixed(discountPercent % 1 === 0 ? 0 : 2)}%
                                    </div>
                                    <div className="p-2 text-right font-bold text-red-600">-{ discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }</div>
                                </div>
                            )}

                            {(note.VAT_Amount || 0) > 0 && (
                                <div className="grid grid-cols-[1fr_110px] border-b border-slate-800">
                                    <div className="p-2 font-bold border-r border-slate-800 text-[11px]">ภาษีมูลค่าเพิ่ม {note.VAT_Rate}%</div>
                                    <div className="p-2 text-right">{(note.VAT_Amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                </div>
                            )}

                            <div className="grid grid-cols-[1fr_110px] bg-slate-900 text-white">
                                <div className="p-2.5 font-bold border-r border-slate-700 text-[13px]">จำนวนเงินทั้งสิ้น</div>
                                <div className="p-2.5 text-right font-bold text-[15px]">{totalWithVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            </div>
                        </div>
                        
                        <div className="mt-2 text-center text-[10px] font-bold text-slate-700 italic px-2 leading-tight">
                            ({ArabicNumberToText(totalWithVat)})
                        </div>

                        {/* Net Total after WHT if applicable */}
                        <div className="mt-3 space-y-1">
                            <div className="flex justify-between text-[11px] px-2 text-slate-500 italic">
                                <span>หัก ณ ที่จ่าย ({note.WHT_Rate || 0}%)</span>
                                <span>-{wht.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between text-[13px] px-2 font-bold text-blue-900 border-t border-blue-100 pt-1 mt-1">
                                <span>ยอดชำระสุทธิ</span>
                                <span className="text-[15px]">{netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 6. Notes Section */}
                <div className="border-t border-slate-200 pt-4 mt-2 flex flex-row gap-4 text-[11px]">
                    <div className="flex items-center gap-2">
                        <div className="w-6 flex justify-center"><MessageSquare size={16} className="text-slate-800" /></div>
                        <div className="font-bold w-16">หมายเหตุ</div>
                    </div>
                    <div className="text-slate-700 whitespace-pre-wrap flex-1 leading-relaxed italic opacity-80">
                        {note.Remarks || company?.invoice_notes || '"DD TRANSPORT ขอแจ้งการปรับเปลี่ยนสัญลักษณ์องค์กรใหม่ (LOGO) เพื่อเพิ่มความทันสมัยและสอดคล้องกับวิสัยทัศน์การเติบโตของบริษัทในอนาคต โดยมีผลตั้งแต่วันที่ 1 เมษายน 2567 เป็นต้นไป"'}
                    </div>
                </div>

                {/* 7. Signatures Section */}
                <div className="border-t border-slate-200 pt-4 mt-3 flex flex-col md:flex-row gap-8 text-[11px] page-break-avoid">
                    <div className="flex items-center gap-2">
                        <div className="w-6 flex justify-center"><PenTool size={16} className="text-slate-800" /></div>
                        <div className="font-bold w-16">รับรอง</div>
                    </div>
                    <div className="flex-1 flex flex-row gap-8">
                        <div className="w-full sm:w-32 shrink-0 flex flex-col items-center mx-auto sm:mx-0">
                            <div className="text-[10px] text-slate-500 mb-2 text-center font-bold uppercase tracking-widest">สแกนเพื่อตรวจสอบ</div>
                            <div className="w-24 h-24 bg-white flex items-center justify-center p-2 border-4 border-slate-900 rounded-2xl shadow-xl overflow-hidden group/qr hover:scale-105 transition-transform duration-500">
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&ecc=H&qzone=2&data=${encodeURIComponent(`${baseUrl}/public/invoice/${id}?lang=${lang}&mode=print`)}`}
                                    alt="Billing QR Code"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                        </div>
                        <div className="flex-1 grid grid-cols-5 gap-4 text-center text-[10px] items-end pb-1">
                            <div>
                                <div className="h-10 border-b border-dashed border-slate-400 mb-1 mx-1"></div>
                                <div className="font-bold mb-0.5 whitespace-nowrap">ผู้ออกเอกสาร (ผู้ขาย)</div>
                                <div className="text-slate-600 truncate">{contactName}</div>
                                <div className="text-slate-500 text-[9px]">{safeLocaleDateString(issueDate, localeStr)}</div>
                            </div>
                            <div>
                                <div className="h-10 border-b border-dashed border-slate-400 mb-1 mx-1"></div>
                                <div className="font-bold mb-0.5 whitespace-nowrap">ผู้อนุมัติ (ผู้ขาย)</div>
                                <div className="text-slate-600 truncate">{contactName}</div>
                                <div className="text-slate-500 text-[9px]">{safeLocaleDateString(issueDate, localeStr)}</div>
                            </div>
                            <div className="flex flex-col items-center relative">
                                <div className="h-10 flex items-center justify-center mb-1">
                                    {company?.stamp_url ? (
                                        <img 
                                            src={company.stamp_url} 
                                            alt="Company Stamp" 
                                            className="absolute w-20 h-20 object-contain opacity-70 -top-6 rotate-[-10deg] pointer-events-none"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full border-2 border-red-500 text-red-500 flex items-center justify-center text-[7px] font-bold p-1 opacity-30 rotate-[-15deg]">
                                            COMPANY<br/>STAMP
                                        </div>
                                    )}
                                </div>
                                <div className="font-bold whitespace-nowrap mt-4">ตราประทับ</div>
                            </div>                            <div>
                                <div className="h-10 border-b border-dashed border-slate-400 mb-1 mx-1"></div>
                                <div className="font-bold mb-0.5 whitespace-nowrap">ผู้รับ (ลูกค้า)</div>
                                <div className="text-slate-600 truncate px-1">{note.Customer_Name}</div>
                            </div>
                            <div>
                                <div className="h-10 border border-dashed border-slate-300 mb-1 bg-slate-50/50"></div>
                                <div className="font-bold whitespace-nowrap">ตราประทับ (ลูกค้า)</div>
                            </div>
                        </div>
                    </div>
                </div>
                </div>

                <style type="text/css" media="print" dangerouslySetInnerHTML={{ __html: `
                    @page { size: A4; margin: 3mm 5mm; }
                    body { visibility: hidden; background: white !important; -webkit-print-color-adjust: exact !important; }
                    #printable-content, #printable-content * { visibility: visible; }
                    #printable-content { width: 100%; background: white !important; padding: 0 !important; }
                    .page-break-avoid { break-inside: avoid; }
                    img { display: block !important; opacity: 1 !important; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                ` }} />
            </div>
        )
    }
