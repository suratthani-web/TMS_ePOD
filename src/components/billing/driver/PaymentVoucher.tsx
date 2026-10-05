"use client"

import React from "react"
import { Job } from "@/lib/supabase/jobs"
import { CompanyProfile } from "@/lib/supabase/settings"
import { ShieldCheck, Banknote, MapPin, Globe, Phone } from "lucide-react"

interface ExtraCost {
    cost_driver?: string | number
    type?: string
}

interface PaymentVoucherProps {
  companyProfile: CompanyProfile | null
  entityName: string
  entityInfo: {
    Bank_Name?: string | null
    Bank_Account_No?: string | null
    Bank_Account_Name?: string | null
  } | null
  today: string
  selectedData: Job[]
  selectedSubtotal: number
  selectedWithholding: number
  selectedNetTotal: number
  selectedVat?: number
  selectedClaim?: number
  vatRate?: number
  whtRate?: number
  claimRate?: number
  t: (key: string) => string
}

export const PaymentVoucher = ({
  companyProfile,
  entityName,
  entityInfo,
  today,
  selectedData,
  selectedSubtotal,
  selectedWithholding,
  selectedNetTotal,
  selectedVat = 0,
  selectedClaim = 0,
  vatRate = 0,
  whtRate = 1,
  claimRate = 0,
  t
}: PaymentVoucherProps) => {
  return (
    <div className="p-16 bg-white text-foreground max-w-[210mm] mx-auto min-h-[297mm] ring-1 ring-slate-200 shadow-2xl printable-document font-sans relative overflow-hidden">
        {/* Background Decorative Element */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
        
        {/* Header Section */}
        <div className="flex justify-between items-start mb-12 relative z-10">
            <div className="flex flex-col gap-8 max-w-[65%]">
                {companyProfile?.logo_url ? (
                    <div className="relative h-24 w-56 group">
                        {/* crossOrigin=anonymous: ให้รูปโหลดแบบ CORS-clean (Supabase ส่ง ACAO:*)
                            เพื่อให้ html2canvas จับภาพทำ PDF ได้โดย canvas ไม่ปนเปื้อน */}
                        <img
                            src={companyProfile.logo_url}
                            alt="Company Logo"
                            crossOrigin="anonymous"
                            className="h-full w-auto object-contain object-left filter contrast-[1.1]"
                        />
                    </div>
                ) : (
                    <div className="h-24 w-56 flex items-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 justify-center">
                        <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest">Logo Placeholder</p>
                    </div>
                )}
                
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h2 className="font-black text-3xl tracking-tight text-foreground">
                            {companyProfile?.company_name || "DD Transport"}
                        </h2>
                        {companyProfile?.company_name_en && (
                            <p className="text-primary font-black text-lg font-bold uppercase tracking-[0.2em]">
                                {companyProfile.company_name_en}
                            </p>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-1 gap-2 text-base font-bold text-muted-foreground leading-relaxed font-medium">
                        <div className="flex items-start gap-2">
                            <MapPin className="w-3 h-3 mt-0.5 text-muted-foreground shrink-0" />
                            <p>{companyProfile?.address}</p>
                        </div>
                        <div className="flex gap-6 mt-1">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-3 h-3 text-muted-foreground" />
                                <p><span className="font-bold text-foreground">TAX ID:</span> {companyProfile?.tax_id || "-"}</p>
                            </div>
                            {companyProfile?.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="w-3 h-3 text-muted-foreground" />
                                    <p>{companyProfile.phone}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="text-right">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-card text-foreground rounded-xl mb-6 shadow-lg shadow-slate-900/20">
                    <Banknote className="w-4 h-4 text-primary" />
                    <span className="font-black text-base font-bold tracking-[0.2em] uppercase">{t('billing_driver.terminal')}</span>
                </div>
                <h1 className="text-6xl font-black text-foreground tracking-tighter uppercase mb-1 leading-none">
                    {t('billing_driver.title')}
                </h1>
                <p className="text-primary font-black text-2xl tracking-[0.1em] mb-6">{t('billing_driver.voucher_subtitle')}</p>
                
                <div className="flex flex-col items-end gap-2">
                    <div className="px-4 py-1.5 bg-slate-100 text-muted-foreground rounded-lg font-black text-base font-bold tracking-widest border border-slate-200">
                        {t('common.original_copy')}
                    </div>
                    <div className="text-base font-bold font-bold text-muted-foreground italic">
                        Ref: DOC-PAY-{new Date().getTime().toString().slice(-6)}
                    </div>
                </div>
            </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-12 gap-8 mb-12 relative z-10">
            <div className="col-span-7 group">
                <div className="p-8 rounded-[2rem] bg-gradient-to-br from-slate-50 to-white border border-slate-100 shadow-sm transition-all group-hover:shadow-md group-hover:border-primary/20 duration-500">
                    <h3 className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] mb-6 flex items-center gap-2">
                        <div className="w-4 h-0.5 bg-primary" />
                        {t('billing_driver.payout_recipient')}
                    </h3>
                    <p className="font-black text-2xl text-foreground mb-4 tracking-tight underline decoration-primary/20 decoration-4 underline-offset-8">
                        {entityName}
                    </p>
                    {entityInfo ? (
                         <div className="space-y-3 mt-8">
                            {entityInfo.Bank_Name && (
                                <div className="flex items-center gap-4 group/bank">
                                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center shadow-sm group-hover/bank:bg-primary/5 group-hover/bank:border-primary/20 transition-colors">
                                        <Globe className="w-5 h-5 text-muted-foreground group-hover/bank:text-primary transition-colors" />
                                    </div>
                                    <div>
                                        <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest">{t('billing_driver.bank_entity')}</p>
                                        <p className="text-xl font-black text-muted-foreground">{entityInfo.Bank_Name}</p>
                                    </div>
                                </div>
                            )}
                            {entityInfo.Bank_Account_No && (
                                <div className="flex items-center gap-4 group/acc">
                                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center shadow-sm group-hover/acc:bg-primary/5 group-hover/acc:border-primary/20 transition-colors">
                                        <ShieldCheck className="w-5 h-5 text-muted-foreground group-hover/acc:text-primary transition-colors" />
                                    </div>
                                    <div>
                                        <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest">{t('billing_driver.account_structure')}</p>
                                        <div className="flex items-baseline gap-2">
                                            <p className="text-lg font-black text-foreground tracking-wider font-mono">{entityInfo.Bank_Account_No}</p>
                                            <span className="text-base font-bold text-muted-foreground font-bold italic">({entityInfo.Bank_Account_Name || entityName})</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                         </div>
                    ) : (
                        <div className="mt-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center animate-pulse shrink-0">!</div>
                            <p className="text-lg font-bold text-rose-600 font-bold italic">{t('billing_driver.recipient_error')}</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="col-span-5 flex flex-col gap-4">
                 <div className="p-8 rounded-[2rem] border border-slate-100 bg-white flex-1">
                    <div className="space-y-6">
                        <div className="flex justify-between items-center group/item">
                            <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest group-hover/item:text-primary transition-colors">{t('billing_driver.execution_date')}</span>
                            <span className="font-black text-foreground text-xl">{today}</span>
                        </div>
                        <div className="flex justify-between items-center group/item">
                            <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest group-hover/item:text-primary transition-colors">{t('billing_driver.currency_matrix')}</span>
                            <span className="font-black text-foreground text-xl">{t('billing_driver.currency_value')}</span>
                        </div>
                        <div className="flex justify-between items-center group/item">
                            <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest group-hover/item:text-primary transition-colors">{t('billing_driver.payout_logic')}</span>
                            <div className="flex flex-col items-end">
                                <span className="text-primary font-black text-base font-bold uppercase tracking-[0.2em]">{t('billing_driver.direct_transfer')}</span>
                                <span className="text-base font-bold text-muted-foreground font-bold uppercase mt-0.5 tracking-tighter">{t('billing_driver.ach_desc')}</span>
                            </div>
                        </div>
                    </div>
                 </div>
                 
                 {/* Mini QR Placeholder */}
                 <div className="h-20 bg-slate-50 rounded-2xl border border-slate-100 flex items-center px-6 gap-4 border-dashed">
                    <div className="w-10 h-10 bg-slate-200 rounded shrink-0 opacity-50" />
                    <div className="space-y-1">
                        <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest">{t('billing_driver.digital_authenticator')}</p>
                        <p className="text-base font-bold font-bold text-muted-foreground leading-tight">{t('billing_driver.authenticator_desc')}</p>
                    </div>
                 </div>
            </div>
        </div>

        {/* Missions Table */}
        <div className="mb-12 relative z-10">
            <div className="overflow-hidden rounded-3xl border border-slate-100 shadow-sm bg-white">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-card text-foreground">
                            <th className="py-5 px-8 font-black uppercase tracking-[0.2em] text-base font-bold w-16">#</th>
                            <th className="py-5 px-8 font-black uppercase tracking-[0.2em] text-base font-bold">{t('billing_driver.mission_hub')} / LogisPath</th>
                            <th className="py-5 px-8 font-black uppercase tracking-[0.2em] text-base font-bold w-32">{t('billing_customer.timestamp')}</th>
                            <th className="py-5 px-8 font-black uppercase tracking-[0.2em] text-base font-bold text-right w-44">{t('billing_driver.base_payout')} (THB)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {selectedData.map((item, index) => {
                            const basePrice = Number(item.Cost_Driver_Total) || 0;
                            const extras: ExtraCost[] = [];
                            if (item.extra_costs_json) {
                                try {
                                    let parsed: ExtraCost[] = [];
                                    if (typeof item.extra_costs_json === 'string') {
                                        parsed = JSON.parse(item.extra_costs_json);
                                    } else {
                                        parsed = item.extra_costs_json as unknown as ExtraCost[];
                                    }
                                    if (Array.isArray(parsed)) extras.push(...parsed);
                                } catch {}
                            }

                            return (
                                <React.Fragment key={item.Job_ID}>
                                    {/* Base Row */}
                                    <tr className="group transition-colors hover:bg-slate-50/50">
                                        <td className="py-6 px-8 font-black text-muted-foreground group-hover:text-primary transition-colors align-top">{index + 1}</td>
                                        <td className="py-6 px-8 align-top">
                                            <div className="font-black text-foreground uppercase tracking-tight text-xl">ID: {item.Job_ID}</div>
                                            <div className="text-base font-bold text-muted-foreground font-bold mt-1 uppercase tracking-widest flex items-center gap-2">
                                                <MapPin className="w-2.5 h-3 text-muted-foreground" />
                                                {item.Route_Name || t('billing_driver.standard_route')}
                                            </div>
                                            <div className="mt-2 text-primary font-bold text-base flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                                {t('billing_driver.base_payout')}
                                            </div>
                                        </td>
                                        <td className="py-6 px-8 font-bold text-muted-foreground align-top text-base font-bold">
                                            {item.Plan_Date ? new Date(item.Plan_Date).toLocaleDateString('th-TH') : '-'}
                                        </td>
                                        <td className="py-6 px-8 text-right font-black text-foreground align-top text-base">
                                            {basePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                    </tr>

                                    {/* Extra Rows */}
                                    {extras.map((extra, eIdx) => (
                                        <tr key={`extra-${item.Job_ID}-${eIdx}`} className="bg-slate-50/30 border-l-4 border-primary/10">
                                            <td className="py-3 px-8"></td>
                                            <td className="py-3 px-8">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-primary/40 text-xl font-light">↳</span>
                                                    <div>
                                                        <span className="text-base font-bold font-black text-muted-foreground/80 uppercase tracking-widest group-hover:text-primary transition-colors">
                                                            {extra.type || t('billing_driver.extra_item')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-8"></td>
                                            <td className="py-3 px-8 text-right font-black text-muted-foreground/80 text-base">
                                                {Number(extra.cost_driver).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Summary Block */}
        <div className="flex justify-end mb-16 relative z-10">
            <div className="w-[320px] p-10 rounded-[3rem] bg-card text-foreground shadow-2xl shadow-slate-900/30 ring-8 ring-slate-50 transform hover:scale-[1.02] transition-transform duration-500">
                <div className="space-y-6">
                    <div className="flex justify-between items-center text-muted-foreground group">
                        <span className="text-foreground transition-colors">{t('billing_driver.subtotal_matrix')}</span>
                        <span className="font-bold text-xl">{selectedSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    {selectedVat > 0 && (
                        <div className="flex justify-between items-center text-emerald-600">
                            <span className="text-sm font-bold">+ VAT {vatRate}%</span>
                            <span className="font-bold text-xl">+{selectedVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center text-primary/80 group">
                        <span className="text-base font-bold font-black uppercase tracking-[0.2em] group-hover:text-primary transition-colors">{t('billing_driver.tax_retention')} {whtRate}%</span>
                        <span className="font-bold text-xl">-{selectedWithholding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    {selectedClaim > 0 && (
                        <div className="flex justify-between items-center text-rose-500">
                            <span className="text-sm font-bold">หักค่าเคลมสินค้า {claimRate}%</span>
                            <span className="font-bold text-xl">-{selectedClaim.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                    )}
                    <div className="h-px bg-muted/80" />
                    <div className="space-y-2 py-2">
                        <div className="flex justify-between items-baseline">
                            <span className="text-base font-bold font-black text-primary uppercase tracking-[0.3em]">{t('billing_driver.net_terminal')}</span>
                            <div className="flex flex-col items-end leading-none">
                                <span className="text-3xl font-black tracking-tighter">
                                    {selectedNetTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                <span className="text-base font-bold font-black text-primary uppercase tracking-[0.4em] mt-2">{t('billing_driver.currency_value')}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Signature Section */}
        <div className="grid grid-cols-2 gap-24 relative z-10 px-8 mt-auto">
            <div className="space-y-12 text-center group">
                <div className="h-px bg-slate-200 relative">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-slate-50 border-2 border-slate-200 group-hover:border-primary transition-colors" />
                </div>
                <div className="space-y-2">
                    <p className="text-base font-bold font-black text-foreground uppercase tracking-widest">{t('billing_driver.authorized_executioner')}</p>
                    <p className="text-base font-bold text-muted-foreground font-bold uppercase tracking-tighter italic">{t('billing_driver.finance_dept')}</p>
                </div>
            </div>
            <div className="space-y-12 text-center group">
                <div className="h-px bg-slate-200 relative">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-slate-50 border-2 border-slate-200 group-hover:border-primary transition-colors" />
                </div>
                <div className="space-y-2">
                    <p className="text-base font-bold font-black text-foreground uppercase tracking-widest">{t('billing_driver.payee_verification')}</p>
                    <p className="text-base font-bold text-muted-foreground font-bold uppercase tracking-tighter italic">{t('billing_driver.signature_desc')}</p>
                </div>
            </div>
        </div>

        {/* Footer Audit Path — in-flow (เดิม absolute ทำให้ทับส่วนลายเซ็นเมื่อรายการยาว) */}
        <div className="relative z-10 mx-16 mt-16 flex justify-between items-center border-t border-slate-100 pt-8 opacity-40">
            <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.3em]">
                {t('billing_driver.system_log')} DRM-FIN-{new Date().toISOString()} | {t('billing_driver.node_production')}
            </p>
            <div className="flex gap-4 items-center">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.3em]">{t('billing_driver.verified_ledger')}</p>
            </div>
        </div>
    </div>
  )
}

