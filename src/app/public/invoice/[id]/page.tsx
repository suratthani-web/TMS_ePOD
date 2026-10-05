import React from "react"
import { getPublicBillingNoteById } from "@/lib/supabase/billing"
import { notFound } from "next/navigation"
import { 
    Phone, Mail, User, FileText, CreditCard, MessageSquare, 
    ShieldCheck, Printer, Download
} from "lucide-react"
import { AutoPrint } from "@/components/utils/auto-print"
import { PrintButton } from "@/components/billing/print-button"

import { 
    aggregateBillingJobs, 
    ArabicNumberToText 
} from "@/lib/billing-utils"


export const dynamic = 'force-dynamic'

interface PageProps {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ lang?: string; mode?: string }>;
}

export default async function PublicInvoicePage({ params, searchParams }: PageProps) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const invoiceId = resolvedParams.id;
    const lang = (resolvedSearchParams.lang as 'th' | 'en') || 'th';
    
    const data = await getPublicBillingNoteById(invoiceId);

    if (!data || !data.note) {
        return notFound();
    }

    const { note, jobs, company } = data;

    // Data Mapping
    const logoUrl = company?.logo_url || company?.Logo_URL || '/images/account logo.png';
    const sellerName = company?.company_name_th || company?.Company_Name_TH || (lang === 'th' ? company?.company_name : company?.company_name_en);
    const sellerAddress = company?.address || company?.Address;
    const sellerTaxId = company?.tax_id || company?.Tax_ID;
    const sellerPhone = company?.phone || company?.Phone;
    const sellerEmail = company?.email || company?.Email;
    
    const bankName = company?.bank_name || company?.Bank_Name || 'ธนาคารไทยพาณิชย์ (SCB)';
    const bankAccNo = company?.bank_account_no || company?.Bank_Account_No;
    const bankAccName = company?.bank_account_name || company?.Bank_Account_Name;
    const contactName = company?.contact_name || company?.Contact_Name || 'ฝ่ายบัญชี';

    const displayItems = aggregateBillingJobs(jobs, lang, note.Customer_Name || undefined);
    const localeStr = lang === 'th' ? 'th-TH' : 'en-US';
    const issueDate = note.Billing_Date ? new Date(note.Billing_Date) : new Date();
    const dueDate = new Date(issueDate.getTime() + (note.Credit_Days || 15) * 24 * 60 * 60 * 1000);

    const totalPreTax = displayItems.reduce((acc, curr) => acc + curr.totalBeforeTax, 0);
    const discountAmt = note.Discount_Amount || 0;
    const vatAmt = note.VAT_Amount || 0;
    const whtAmt = note.WHT_Amount ?? ((totalPreTax - discountAmt) * (note.WHT_Rate || 1) / 100);
    // Recalculate total to ensure consistency with price hotfix
    const calculatedGrandTotal = totalPreTax - discountAmt + (note.VAT_Amount ?? ((totalPreTax - discountAmt) * 0.07));
    const netTotal = calculatedGrandTotal - whtAmt;

    return (
        <div className="bg-slate-100 min-h-screen py-12 px-4 font-sans print:p-0 print:bg-white">
            {resolvedSearchParams.mode === 'print' && <AutoPrint />}
            
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center print:hidden">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-600 rounded-lg text-white shadow-lg">
                        <ShieldCheck size={20} />
                    </div>
                    <div>
                        <h1 className="font-black text-slate-900 uppercase tracking-tighter leading-none">Digital Original</h1>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Verified by DRouteMind TMS</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <PrintButton />
                </div>
            </div>

            <div id="printable-content" className="w-full max-w-[210mm] mx-auto bg-white p-4 sm:p-8 md:p-12 shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-3xl sm:rounded-sm print:shadow-none print:p-0 print:w-full">
                
                <div className="flex flex-col sm:flex-row justify-between items-start gap-6 mb-10">
                    <div className="flex items-center gap-4">
                        {logoUrl && (
                            <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain" />
                        )}
                    </div>
                    <div className="text-right">
                        <div className="text-[11px] text-slate-600 mb-1 font-bold italic uppercase tracking-widest">Digital Copy</div>
                        <div className="text-5xl font-black text-blue-500 tracking-tight leading-none uppercase">ใบวางบิล</div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between gap-8 mb-10 text-slate-800 text-[13px]">
                    <div className="flex-1 space-y-6">
                        <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1">
                            <div className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">ผู้ขาย :</div>
                            <div className="font-black text-lg text-slate-900 leading-none">{sellerName}</div>
                            <div className="font-bold">ที่อยู่ :</div>
                            <div className="text-slate-600 leading-snug">{sellerAddress || '-'}</div>
                            <div className="font-bold">เลขที่ภาษี :</div>
                            <div className="font-mono">{sellerTaxId || '-'}</div>
                        </div>
                        
                        <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 mt-6 pt-6 border-t border-slate-100">
                            <div className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">ลูกค้า :</div>
                            <div className="font-black text-lg text-slate-900 leading-none">{note.Customer_Name}</div>
                            <div className="font-bold">ที่อยู่ :</div>
                            <div className="text-slate-600 leading-snug">{note.Customer_Address || '-'}</div>
                            <div className="font-bold">เลขที่ภาษี :</div>
                            <div className="font-mono">{note.Customer_Tax_ID || '-'}</div>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-[320px] shrink-0">
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-4 shadow-inner">
                            <div className="grid grid-cols-[130px_1fr] gap-y-2">
                                <div className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">เลขที่เอกสาร :</div>
                                <div className="font-black text-blue-600">{note.Billing_Note_ID}</div>
                                <div className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">วันที่ออก :</div>
                                <div className="font-bold">{issueDate.toLocaleDateString(localeStr)}</div>
                                <div className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">เครดิต :</div>
                                <div className="font-bold">{note.Credit_Days || '15'} วัน</div>
                                <div className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">วันที่ครบกำหนด :</div>
                                <div className="font-black text-rose-600">{dueDate.toLocaleDateString(localeStr)}</div>
                            </div>
                        </div>
                        <div className="pl-6 border-l-2 border-blue-500/30 text-xs space-y-1">
                            <div className="font-black text-slate-400 uppercase tracking-widest mb-2">Contact</div>
                            <div className="flex items-center gap-3 font-bold"><User size={14} className="text-blue-500"/> {contactName}</div>
                            <div className="flex items-center gap-3 font-bold"><Phone size={14} className="text-blue-500"/> {sellerPhone || '-'}</div>
                            <div className="flex items-center gap-3 font-bold"><Mail size={14} className="text-blue-500"/> {sellerEmail || '-'}</div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-10">
                    <table className="w-full border-collapse min-w-[650px] md:min-w-0">
                        <thead>
                            <tr className="bg-slate-900 text-white text-[12px]">
                                <th className="py-3 px-4 text-left font-black uppercase tracking-widest w-12">#</th>
                                <th className="py-3 px-4 text-left font-black uppercase tracking-widest">คำอธิบาย</th>
                                <th className="py-3 px-4 text-center font-black uppercase tracking-widest w-24">จำนวน</th>
                                <th className="py-3 px-4 text-right font-black uppercase tracking-widest w-32">ราคา/หน่วย</th>
                                <th className="py-3 px-4 text-right font-black uppercase tracking-widest w-32">รวมเงิน</th>
                            </tr>
                        </thead>
                        <tbody className="text-[13px]">
                            {displayItems.map((item, idx) => (
                                <tr key={idx} className={`border-b border-slate-100 ${item.isExtra ? 'text-slate-500 italic' : 'font-black text-slate-900'}`}>
                                    <td className="py-4 px-4 text-center align-top opacity-30">{idx + 1}</td>
                                    <td className="py-4 px-4 align-top">
                                        <div>{item.description}</div>
                                        {item.subDescription && <div className="text-[11px] text-slate-400 font-normal mt-1 italic">{item.subDescription}</div>}
                                    </td>
                                    <td className="py-4 px-4 text-center align-top">{item.qty.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="py-4 px-4 text-right align-top">{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td className="py-4 px-4 text-right align-top">{item.totalBeforeTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="border-t-2 border-slate-200 pt-8 mt-10 flex flex-col md:flex-row gap-10">
                    <div className="flex-1 space-y-6">
                        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-[0.03] rotate-12"><MessageSquare size={80} /></div>
                            <h4 className="font-black text-[10px] uppercase tracking-widest text-slate-400 mb-2">หมายเหตุ / Notes</h4>
                            <p className="text-sm text-slate-600 leading-relaxed italic whitespace-pre-wrap">
                                {note.Remarks || company?.invoice_notes || '"DD TRANSPORT ขอแจ้งการปรับเปลี่ยนสัญลักษณ์องค์กรใหม่ (LOGO) เพื่อเพิ่มความทันสมัยและสอดคล้องกับวิสัยทัศน์การเติบโตของบริษัทในอนาคต โดยมีผลตั้งแต่วันที่ 1 เมษายน 2567 เป็นต้นไป"'}
                            </p>
                        </div>
                        
                        <div className="p-6 bg-blue-600 rounded-2xl text-white shadow-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform"><CreditCard size={100} /></div>
                            <h4 className="font-black text-[10px] uppercase tracking-widest opacity-70 mb-3">ช่องทางชำระเงิน / Payment</h4>
                            <div className="space-y-1 relative z-10">
                                <p className="font-black text-lg">{bankName}</p>
                                <p className="font-mono text-2xl tracking-tighter">{bankAccNo || '-'}</p>
                                <p className="font-bold opacity-90 italic">{bankAccName || '-'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="w-full md:w-[400px] space-y-4">
                        <div className="flex justify-between text-slate-500 font-bold uppercase text-[11px] tracking-widest">
                            <span>มูลค่าก่อนส่วนลด</span>
                            <span className="text-slate-900">{totalPreTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-slate-400 italic text-[11px] tracking-widest">
                            <span>ส่วนลด (Discount)</span>
                            <span>-{(discountAmt).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between text-rose-500 font-bold uppercase text-[11px] tracking-widest pt-2 border-t border-slate-100">
                            <span>หัก ณ ที่จ่าย (WHT {note.WHT_Rate || 1}%)</span>
                            <span>-{(whtAmt).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                        
                        <div className="mt-6 bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full" />
                            <div className="flex justify-between items-end relative z-10">
                                <div>
                                    <p className="text-blue-400 font-black text-[10px] uppercase tracking-[0.3em] mb-1">ยอดชำระสุทธิ</p>
                                    <p className="text-3xl font-black italic tracking-tighter uppercase leading-none">Net Total</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tighter text-blue-400 italic leading-none mb-1">
                                        {netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-500">BAHT / THB</p>
                                </div>
                            </div>
                            <div className="mt-6 pt-4 border-t border-white/10 text-center">
                                <p className="text-[11px] font-bold text-slate-400 italic tracking-tight">{ArabicNumberToText(netTotal)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-6 text-slate-300">
                    <div className="flex items-center gap-4">
                        <ShieldCheck size={24} className="text-emerald-500/30" />
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest leading-none">Tamper-proof Digital Document</p>
                            <p className="text-[8px] font-bold mt-1">Verified securely via DRouteMind Blockchain-ready Matrix</p>
                        </div>
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-[0.5em] italic">
                        © {new Date().getFullYear()} DRouteMind Fleet Intelligence
                    </div>
                </div>
            </div>

            <style type="text/css" media="print" dangerouslySetInnerHTML={{ __html: `
                @page { size: A4; margin: 0; }
                body { background: white !important; }
                .print-hidden { display: none !important; }
                #printable-content { padding: 0 !important; border: none !important; width: 100% !important; max-width: none !important; }
            ` }} />
        </div>
    )
}
