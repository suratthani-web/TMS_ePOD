"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { useLanguage } from "@/components/providers/language-provider"
import {
  Receipt,
  Building2,
  Search,
  Banknote,
  History,
  Zap,
  ShieldCheck,
  FileSearch,
  FileText,
  Calendar
} from "lucide-react"
import Link from 'next/link'
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BillingNote } from "@/lib/supabase/billing"
import { CompanyProfile } from "@/lib/supabase/settings"
import { Customer } from "@/lib/supabase/customers"

interface CustomerBillingClientProps {
    companyProfile: CompanyProfile | null
    customers: Customer[]
    initialBillingNotes: BillingNote[]
}

export default function CustomerBillingClient({ customers, initialBillingNotes }: CustomerBillingClientProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState("")
  const [isCustomerMode, setIsCustomerMode] = useState(false)
  const [billingNotes] = useState<BillingNote[]>(initialBillingNotes)

  // Initialize customer mode
  useEffect(() => {
    async function init() {
        const { isCustomer, getCustomerId } = await import("@/lib/permissions")
        const customerFlag = await isCustomer()
        setIsCustomerMode(customerFlag)
        
        if (customerFlag) {
            const custId = await getCustomerId()
            const myCust = customers.find(c => c.Customer_ID === custId)
            if (myCust) {
                setSelectedCustomer(myCust.Customer_Name)
            }
        }
    }
    init()
  }, [customers])

  // Filter Billing Notes
  const filteredNotes = billingNotes.filter(note => {
    if (selectedCustomer && note.Customer_Name !== selectedCustomer) return false
    if (dateFrom && note.Billing_Date < dateFrom) return false
    if (dateTo && note.Billing_Date > dateTo) return false
    return true
  })

  // Calculate totals for filtered verified notes
  const totalAmount = filteredNotes.reduce((sum, n) => sum + (n.Total_Amount || 0), 0)

  return (
    <DashboardLayout>
      {/* Tactical Financial Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 mb-16 bg-background/60 backdrop-blur-3xl p-12 rounded-[4rem] border border-border/5 shadow-2xl relative group ring-1 ring-border/5 hover:ring-primary/20 transition-all duration-700">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none" />
        
            <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/20 rounded-xl shadow-lg">
                    <Receipt className="text-primary" size={20} />
                </div>
                <h2 className="text-base font-bold font-black text-primary uppercase tracking-[0.4em]">AR COMMAND CENTRE</h2>
            </div>
            <h1 className="text-6xl font-black text-foreground tracking-tighter flex items-center gap-5 uppercase premium-text-gradient">
                {isCustomerMode ? t('billing_customer.title_customer') : "Verified Billing Records"}
            </h1>
            <p className="text-muted-foreground font-bold text-xl tracking-wide opacity-80 uppercase tracking-widest leading-relaxed">
              {isCustomerMode ? t('billing_customer.subtitle_customer') : "Official billing documents and history ledger"}
            </p>
        </div>

        <div className="flex flex-wrap gap-4 relative z-10">
            <PremiumButton 
                variant="outline" 
                className="h-16 px-10 rounded-2xl border-border/5 bg-muted/50 hover:bg-muted/80 text-muted-foreground hover:text-foreground gap-3 transition-all duration-300 ring-1 ring-border/5"
                onClick={() => router.push('/billing/invoices')}
            >
                <FileText className="w-6 h-6" /> 
                <span className="font-black uppercase tracking-widest text-base font-bold">Go to Invoices</span>
            </PremiumButton>
            <PremiumButton 
                variant="outline" 
                className="h-16 px-10 rounded-2xl border-border/5 bg-muted/50 hover:bg-muted/80 text-muted-foreground hover:text-foreground gap-3 transition-all duration-300 ring-1 ring-border/5"
                onClick={() => router.push('/billing/customer/history')}
            >
                <History className="w-6 h-6" /> 
                <span className="font-black uppercase tracking-widest text-base font-bold">{isCustomerMode ? t('billing_customer.past_shipments') : t('billing_customer.ledger_history')}</span>
            </PremiumButton>
        </div>
      </div>

      {/* Intelligence Filters */}
      <div className="glass-panel border-border/5 rounded-[3rem] p-10 mb-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10">
            {!isCustomerMode && (
            <div className="space-y-3">
              <Label className="text-base font-bold font-black uppercase tracking-[0.3em] text-muted-foreground ml-2">{t('billing_customer.target_account')}</Label>
              <Select
                value={selectedCustomer}
                onValueChange={(value) => setSelectedCustomer(value === "all" ? "" : value)}
              >
                <SelectTrigger className="w-full h-14 bg-muted/50 border-border/5 text-foreground font-black rounded-2xl px-6 uppercase tracking-widest text-lg font-bold focus:ring-primary/20 transition-all">
                  <SelectValue placeholder={t('billing_customer.locate_customer')} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border/10 text-foreground font-black">
                  <SelectItem value="all" className="hover:bg-primary/20 focus:bg-primary/20 uppercase tracking-widest text-base font-bold">{t('billing_customer.all_accounts')}</SelectItem>
                  {customers.map(c => (
                    <SelectItem key={c.Customer_ID} value={c.Customer_Name} className="hover:bg-primary/20 focus:bg-primary/20 uppercase tracking-widest text-base font-bold">{c.Customer_Name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}
            <div className="space-y-3">
              <Label className="text-base font-bold font-black uppercase tracking-[0.3em] text-muted-foreground ml-2">{t('billing_customer.mission_start')}</Label>
              <div className="relative group">
                <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 text-primary opacity-50 group-hover:opacity-100 transition-opacity" size={18} />
                <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full h-14 bg-muted/50 border-border/5 text-foreground font-black rounded-2xl pl-14 pr-6 uppercase tracking-widest text-lg font-bold focus:bg-muted/80 transition-all"
                />
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-base font-bold font-black uppercase tracking-[0.3em] text-muted-foreground ml-2">{t('billing_customer.mission_end')}</Label>
              <div className="relative group">
                <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 text-primary opacity-50 group-hover:opacity-100 transition-opacity" size={18} />
                <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full h-14 bg-muted/50 border-border/5 text-foreground font-black rounded-2xl pl-14 pr-6 uppercase tracking-widest text-lg font-bold focus:bg-muted/80 transition-all"
                />
              </div>
            </div>
            <div className="flex items-end">
              <PremiumButton variant="outline" className="border-border/5 w-full h-14 rounded-2xl gap-3">
                <Search className="w-5 h-5" /> 
                <span className="font-black uppercase tracking-widest text-base font-bold">Filter Ledger</span>
              </PremiumButton>
            </div>
          </div>
      </div>

      {/* Financial Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
        <div className="p-8 rounded-[3rem] border border-primary/20 backdrop-blur-3xl bg-background/40">
            <p className="text-muted-foreground font-black text-base font-bold uppercase tracking-[0.3em] mb-2">Verified Documents</p>
            <p className="text-4xl font-black text-foreground tracking-tighter leading-none">{filteredNotes.length}</p>
        </div>
        <div className="p-8 rounded-[3rem] border border-emerald-500/20 backdrop-blur-3xl bg-background/40">
            <p className="text-muted-foreground font-black text-base font-bold uppercase tracking-[0.3em] mb-2">Total Verified Value</p>
            <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold font-black text-muted-foreground mb-1">THB</span>
                <p className="text-4xl font-black text-foreground tracking-tighter leading-none">{totalAmount.toLocaleString()}</p>
            </div>
        </div>
        <div className="p-8 rounded-[3rem] border border-amber-500/20 backdrop-blur-3xl bg-background/40">
            <p className="text-muted-foreground font-black text-base font-bold uppercase tracking-[0.3em] mb-2">Status Integrity</p>
            <div className="flex items-center gap-2">
                <ShieldCheck className="text-emerald-500" />
                <span className="text-2xl font-black text-foreground uppercase tracking-tight">Financial Locked</span>
            </div>
        </div>
      </div>

      {/* Data Registry */}
      <div className="glass-panel rounded-[4rem] border-border/5 shadow-2xl overflow-hidden bg-background/20 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
        <div className="p-12 border-b border-border/5">
            <h3 className="text-2xl font-black text-foreground tracking-tighter uppercase premium-text-gradient">Verified Billing Registry</h3>
            <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.1em]">Official billing records finalized for payment collection</p>
        </div>

        <div className="relative w-full overflow-auto custom-scrollbar">
            <table className="w-full text-xl text-left border-collapse">
                <thead>
                    <tr className="bg-muted/30 border-b border-border/5">
                        <th className="px-12 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground">เลขที่ใบวางบิล</th>
                        <th className="px-8 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground">ลูกค้า</th>
                        <th className="px-8 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground text-center">วันที่ออก</th>
                        <th className="px-8 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground text-right">ยอดรวม</th>
                        <th className="px-8 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground text-center">สถานะ</th>
                        <th className="px-12 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground text-center">จัดการ</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {filteredNotes.map((note) => (
                        <tr key={note.Billing_Note_ID} className="group/row hover:bg-primary/[0.03] transition-all duration-500">
                            <td className="px-12 py-8 font-black text-foreground tracking-tighter uppercase">{note.Billing_Note_ID}</td>
                            <td className="px-8 py-8 font-black text-muted-foreground tracking-tight uppercase">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-muted/50 rounded-xl group-hover/row:bg-primary/20 transition-colors">
                                        <Building2 className="w-5 h-5 text-muted-foreground group-hover/row:text-primary transition-colors" />
                                    </div>
                                    <span className="font-black text-muted-foreground text-xl capitalize">{note.Customer_Name}</span>
                                </div>
                            </td>
                            <td className="px-8 py-8 text-center text-muted-foreground font-bold uppercase tracking-widest text-base font-bold">
                                {new Date(note.Billing_Date).toLocaleDateString('th-TH')}
                            </td>
                            <td className="px-8 py-8 text-right font-black text-foreground text-xl">
                                ฿{(note.Total_Amount || 0).toLocaleString()}
                            </td>
                            <td className="px-8 py-8 text-center">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-black uppercase tracking-widest">
                                    {note.Status}
                                </div>
                            </td>
                            <td className="px-12 py-8 text-center">
                                <Link 
                                    href={`/billing/print/${note.Billing_Note_ID}?mode=print`}
                                    target="_blank"
                                    className="h-10 px-6 rounded-xl bg-primary text-white hover:bg-primary/80 transition-all font-black uppercase tracking-widest text-sm inline-flex items-center gap-2 shadow-lg hover:shadow-primary/20"
                                >
                                    <FileText size={16} /> พิมพ์ PDF
                                </Link>
                            </td>
                        </tr>
                    ))}
                    {filteredNotes.length === 0 && (
                        <tr>
                            <td colSpan={6} className="text-center py-40">
                                <div className="flex flex-col items-center gap-6 opacity-30">
                                    <FileSearch size={64} className="text-muted-foreground" strokeWidth={1} />
                                    <p className="text-muted-foreground font-black uppercase tracking-[0.5em] text-lg font-bold">ไม่พบใบวางบิลในสารบบ</p>
                                </div>
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
        
        <div className="p-10 border-t border-border/5 bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-6">
                <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.6em]">Financial Matrix Node Registry v4.0</p>
                <div className="h-4 w-px bg-muted/50" />
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-base font-bold font-black text-emerald-500 uppercase tracking-widest">CERTIFIED RECORD</span>
                </div>
            </div>
            <Zap size={18} className="text-primary opacity-20" />
        </div>
      </div>
      
      <div className="mt-20 text-center mb-24">
        <div className="inline-flex items-center gap-4 px-8 py-3 glass-panel rounded-full text-base font-bold font-black text-muted-foreground uppercase tracking-[0.6em] opacity-40 hover:opacity-100 transition-opacity">
            <ShieldCheck size={14} className="text-primary" /> DRouteMind Ledger Engine • Certified Financial Accuracy
        </div>
      </div>
    </DashboardLayout>
  )
}
