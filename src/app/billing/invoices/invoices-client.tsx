"use client"

import React, { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Plus, 
  Search, 
  FileText,
  Zap,
  ShieldCheck,
  Building2,
  Calculator,
  ArrowRight,
  CheckCircle2,
  RotateCw,
  Calendar
} from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"
import { InvoiceRowActions } from "@/components/billing/invoice-actions"
import { Job } from "@/lib/supabase/jobs"
import { Customer } from "@/lib/supabase/customers"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getBillableJobsAction } from "./actions"
import { toast } from "sonner"
import { InvoiceForm } from "@/components/billing/invoice-form"
import { ExcelExport } from "@/components/ui/excel-export"
import { FileSpreadsheet } from "lucide-react"

interface Invoice {
  Invoice_ID: string
  Tax_Invoice_ID?: string
  Customer_Name: string
  Issue_Date?: string
  Due_Date?: string
  Grand_Total: number
  Status: string
  Type: 'Invoice' | 'BillingNote'
}

interface InvoicesClientProps {
  initialInvoices: Invoice[]
  billableJobs: Job[]
  customers: Customer[]
  query: string
}

export default function InvoicesClient({ initialInvoices, billableJobs, customers, query }: InvoicesClientProps) {
  const { t, language } = useLanguage()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'missions' | 'ledger' | 'create'>('missions')
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState(query)
  const [displayJobs, setDisplayJobs] = useState<Job[]>(billableJobs || [])
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all")
  const [isSyncing, setIsSyncing] = useState(false)

  // Auto-refresh displayJobs if billableJobs from server changes
  useEffect(() => {
    if (billableJobs && billableJobs.length > 0 && displayJobs.length === 0) {
      setDisplayJobs(billableJobs)
    }
  }, [billableJobs])

  const filteredJobs = (displayJobs || []).filter(job => {
      if (!job) return false
      const matchesSearch = !searchQuery || 
          job.Job_ID.toLowerCase().includes(searchQuery.toLowerCase()) || 
          (job.Customer_Name && job.Customer_Name.toLowerCase().includes(searchQuery.toLowerCase()))
      
      const matchesCustomer = selectedCustomerId === 'all' || job.Customer_ID === selectedCustomerId
      
      return matchesSearch && matchesCustomer
  })

  const filteredInvoices = initialInvoices.filter(inv => {
      if (searchQuery && !inv.Invoice_ID.toLowerCase().includes(searchQuery.toLowerCase()) && !inv.Customer_Name.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
  })

  const handleSync = async () => {
    setIsSyncing(true)
    try {
        const custId = selectedCustomerId === 'all' ? undefined : selectedCustomerId
        const updatedJobs = await getBillableJobsAction(custId, dateFrom || undefined, dateTo || undefined)
        setDisplayJobs(updatedJobs)
        toast.success(t('invoices.sync_active'))
    } catch {
        toast.error("Failed to synchronize missions")
    } finally {
        setIsSyncing(false)
    }
  }

  const handleCreateFromSelection = () => {
      if (selectedJobIds.length === 0) return
      const firstJob = displayJobs.find(j => selectedJobIds.includes(j.Job_ID))
      setSelectedCustomerId((firstJob as Job)?.Customer_ID || "")
      setActiveTab('create')
  }

  const toggleJob = (id: string) => {
      setSelectedJobIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const toggleAll = () => {
    if (selectedJobIds.length === filteredJobs.length && filteredJobs.length > 0) {
        setSelectedJobIds([])
    } else {
        setSelectedJobIds(filteredJobs.map(j => j.Job_ID))
    }
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10 bg-background/60 backdrop-blur-3xl p-8 rounded-3xl border border-border/5 shadow-xl relative group ring-1 ring-border/5 hover:ring-primary/20 transition-all duration-700">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 space-y-2">
            <div className="flex items-center gap-3">
                <div className="p-1.5 bg-primary/20 rounded-lg shadow-lg">
                    <FileText className="text-primary" size={16} />
                </div>
                <h2 className="text-xs font-bold font-black text-primary uppercase tracking-[0.4em]">{t('invoices.protocol_header')}</h2>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-tighter flex items-center gap-4 uppercase premium-text-gradient italic">
                {t('invoices.engine_title')}
            </h1>
            <p className="text-muted-foreground font-bold text-sm tracking-wide opacity-80 uppercase tracking-widest leading-relaxed">
              {activeTab === 'missions' ? t('invoices.missions_desc') : 
               activeTab === 'create' ? "ออกใบแจ้งหนี้จากรายการที่เลือกหรือสร้างใหม่" : 
               t('invoices.engine_subtitle')}
            </p>
        </div>

        <div className="flex flex-wrap gap-3 relative z-10">
            <ExcelExport 
                data={filteredInvoices}
                filename="logispro_invoices_export"
                trigger={
                    <PremiumButton variant="outline" className="h-12 px-6 rounded-xl border-border/5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all duration-300 ring-1 ring-border/5" >
                        <FileSpreadsheet size={18} className="mr-2" />
                        <span className="font-black uppercase tracking-widest text-xs font-bold">EXPORT</span>
                    </PremiumButton>
                }
            />
            <PremiumButton 
                variant="outline"
                onClick={handleSync}
                disabled={isSyncing}
                className="h-12 px-6 rounded-xl border-border/5 bg-muted/50 hover:bg-muted/80 text-muted-foreground hover:text-foreground gap-2 transition-all duration-300 ring-1 ring-border/5"
            >
                <RotateCw size={18} className={cn("text-primary", isSyncing && "animate-spin")} /> 
                <span className="font-black uppercase tracking-widest text-xs font-bold">{t('invoices.btn_sync')}</span>
            </PremiumButton>

        </div>
      </div>

      <div className="glass-panel border-border/5 rounded-2xl p-6 mb-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10">
            <div className="flex-1 max-w-2xl space-y-2">
              <Label className="text-xs font-bold font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">{t('invoices.search_matrix')}</Label>
              <div className="relative group/search">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-hover/search:text-primary transition-colors duration-300" size={16} />
                <Input
                    placeholder={t('invoices.search_placeholder')}
                    className="w-full h-12 bg-muted/50 border-border/5 text-foreground font-black rounded-xl pl-12 pr-4 uppercase tracking-widest text-sm focus:bg-muted/80 transition-all border-2 focus:border-primary/30"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex items-center gap-3">
                <div className="flex bg-muted/50 p-1 rounded-xl border border-border/5">
                    <button 
                        onClick={() => setActiveTab('missions')}
                        className={cn(
                            "px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                            activeTab === 'missions' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {t('invoices.tab_missions')} ({billableJobs.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('ledger')}
                        className={cn(
                            "px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                            activeTab === 'ledger' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {t('invoices.tab_ledger')} ({initialInvoices.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('create')}
                        className={cn(
                            "px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                            activeTab === 'create' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        สร้าง
                    </button>
                </div>
            </div>
          </div>
      </div>

      {activeTab === 'create' ? (
          <div className="animate-in fade-in zoom-in-95 duration-500">
              <div className="mb-6 flex items-center justify-between px-4">
                <h3 className="text-xl font-black text-foreground tracking-tighter uppercase premium-text-gradient">ออกใบแจ้งหนี้ใหม่</h3>
                <button onClick={() => setActiveTab('missions')} className="text-muted-foreground hover:text-primary font-black uppercase tracking-widest text-[10px] flex items-center gap-2 transition-colors">
                    <Plus className="rotate-45" size={14} /> ยกเลิก
                </button>
              </div>
              <InvoiceForm 
                customers={customers} 
                initialData={{ 
                    customerId: selectedCustomerId === 'all' ? "" : selectedCustomerId, 
                    jobIds: selectedJobIds 
                }} 
                onSuccess={() => {
                    setActiveTab('ledger')
                    setSelectedJobIds([])
                    router.refresh()
                }}
              />
          </div>
      ) : (
          <>
            {activeTab === 'missions' && selectedJobIds.length > 0 && (
                <div className="mb-8 animate-in fade-in slide-in-from-bottom-2">
                    <div className="relative bg-background/80 backdrop-blur-3xl border-2 border-primary/30 p-6 rounded-3xl shadow-xl flex items-center justify-between gap-6">
                        <div className="flex items-center gap-6">
                            <div className="p-4 bg-primary/20 rounded-2xl">
                                <Calculator className="text-primary" size={24} />
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[10px] font-bold font-black text-primary uppercase tracking-[0.4em]">{t('invoices.selection_active')}</p>
                                <h4 className="text-2xl font-black text-foreground tracking-tighter uppercase">{selectedJobIds.length} {t('invoices.missions_identified')}</h4>
                            </div>
                        </div>
                        <PremiumButton onClick={handleCreateFromSelection} className="h-12 px-8 rounded-xl shadow-lg text-sm font-black tracking-widest group">
                            {t('invoices.btn_generate_draft')}
                            <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
                        </PremiumButton>
                    </div>
                </div>
            )}

            {activeTab === 'missions' && (
                <div className="glass-panel border-border/5 rounded-2xl p-6 mb-8 relative overflow-hidden bg-background/40 backdrop-blur-3xl shadow-lg ring-1 ring-border/5">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative z-10">
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">{t('invoices.target_account')}</Label>
                            <Select
                                value={selectedCustomerId}
                                onValueChange={setSelectedCustomerId}
                            >
                                <SelectTrigger className="w-full h-11 bg-muted/50 border-border/5 text-foreground font-black rounded-xl px-4 uppercase tracking-widest text-xs focus:ring-primary/20 transition-all">
                                    <SelectValue placeholder={t('billing_customer.locate_customer')} />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border/10 text-foreground">
                                    <SelectItem value="all" className="uppercase tracking-widest text-[10px] font-bold">{t('billing_customer.all_accounts')}</SelectItem>
                                    {customers.map(c => (
                                        <SelectItem key={c.Customer_ID} value={c.Customer_ID} className="uppercase tracking-widest text-[10px] font-bold">{c.Customer_Name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">{t('invoices.date_start')}</Label>
                            <div className="relative group">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-primary opacity-50 group-hover:opacity-100 transition-opacity" size={14} />
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="w-full h-11 bg-muted/50 border-border/5 text-foreground font-black rounded-xl pl-10 pr-4 uppercase tracking-widest text-xs focus:bg-muted/80 transition-all outline-none"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-bold font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">{t('invoices.date_end')}</Label>
                            <div className="relative group">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-primary opacity-50 group-hover:opacity-100 transition-opacity" size={14} />
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="w-full h-11 bg-muted/50 border-border/5 text-foreground font-black rounded-xl pl-10 pr-4 uppercase tracking-widest text-xs focus:bg-muted/80 transition-all outline-none"
                                />
                            </div>
                        </div>
                        <div className="flex items-end">
                            <PremiumButton 
                                onClick={handleSync}
                                disabled={isSyncing}
                                className="w-full h-11 rounded-xl gap-2 shadow-lg hover:scale-[1.02] transition-all text-xs"
                            >
                                <Search className={cn("w-4 h-4", isSyncing && "animate-pulse")} /> 
                                <span className="font-black uppercase tracking-widest">{t('invoices.filter_ledger')}</span>
                            </PremiumButton>
                        </div>
                    </div>
                </div>
            )}

            <div className="glass-panel rounded-3xl border-border/5 shadow-xl overflow-hidden bg-background/20 relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
                
                <div className="flex flex-col lg:flex-row lg:items-center justify-between p-8 gap-6 relative z-10 border-b border-border/5">
                <div className="space-y-1">
                    <h3 className="text-xl font-black text-foreground tracking-tighter uppercase premium-text-gradient italic">
                        {activeTab === 'missions' ? t('invoices.missions_registry_title') : t('invoices.ledger_title')}
                    </h3>
                    <p className="text-xs font-bold font-black text-muted-foreground uppercase tracking-[0.4em] italic opacity-60">
                        {activeTab === 'missions' ? t('invoices.missions_registry_subtitle') : t('invoices.ledger_subtitle')}
                    </p>
                </div>
                </div>

                <div className="relative w-full overflow-auto custom-scrollbar max-h-[600px] border-b border-border/5">
                    <table className="w-full text-sm text-left border-collapse">
                    <thead>
                        <tr className="bg-muted/30 border-b border-border/5">
                        {activeTab === 'missions' && (
                            <th className="px-6 py-4 w-12">
                                <div 
                                    className={cn(
                                        "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer",
                                        selectedJobIds.length > 0 && selectedJobIds.length === filteredJobs.length 
                                            ? "bg-primary border-primary rotate-12 scale-110 shadow-lg" 
                                            : selectedJobIds.length > 0 
                                                ? "bg-primary/50 border-primary"
                                                : "border-border/20 hover:border-primary/50"
                                    )}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        toggleAll()
                                    }}
                                >
                                    {selectedJobIds.length > 0 && selectedJobIds.length === filteredJobs.length && <CheckCircle2 size={12} className="text-white" strokeWidth={3} />}
                                    {selectedJobIds.length > 0 && selectedJobIds.length < filteredJobs.length && <div className="w-2.5 h-0.5 bg-white rounded-full" />}
                                </div>
                            </th>
                        )}
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">{activeTab === 'missions' ? t('invoices.col_mission_id') : t('invoices.col_id')}</th>
                        <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">{t('invoices.col_entity')}</th>
                        <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground text-center">{activeTab === 'missions' ? t('invoices.col_plan_date') : t('invoices.col_vector')}</th>
                        <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground text-right">{activeTab === 'missions' ? t('invoices.col_value') : t('invoices.col_value')}</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground text-center">{t('invoices.col_status')}</th>
                        <th className="px-6 py-4 w-16"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {activeTab === 'ledger' ? (
                        filteredInvoices.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="text-center py-24 opacity-30">
                                    <FileText size={48} className="mx-auto mb-4" />
                                    <p className="font-black uppercase tracking-widest text-xs">{t('invoices.empty_records')}</p>
                                </td>
                            </tr>
                        ) : (
                            filteredInvoices.map((inv) => (
                                <tr key={`${inv.Type}-${inv.Invoice_ID}`} className="group/row hover:bg-primary/[0.03] transition-all duration-500 cursor-pointer" onClick={() => router.push(`/billing/invoices/${inv.Invoice_ID}`)}>
                                    <td className="px-6 py-2">
                                        <span className="font-black text-foreground text-sm tracking-tighter group-hover/row:text-primary transition-colors font-display uppercase">{inv.Invoice_ID}</span>
                                    </td>
                                    <td className="px-4 py-2">
                                        <span className="font-bold text-muted-foreground text-sm uppercase tracking-tight">{inv.Customer_Name}</span>
                                    </td>
                                    <td className="px-4 py-2 text-center text-muted-foreground font-black uppercase tracking-widest text-[10px]">
                                        {inv.Issue_Date ? new Date(inv.Issue_Date).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US') : '-'}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <span className="text-base font-black text-foreground tracking-tighter group-hover/row:text-primary transition-colors bg-muted/50 px-3 py-1 rounded-lg">฿{Number(inv.Grand_Total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </td>
                                    <td className="px-6 py-2 text-center">
                                        <div className={cn(
                                            "inline-flex items-center gap-2 px-4 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all duration-500",
                                            inv.Status === 'Paid' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-primary/10 text-primary border-primary/20"
                                        )}>
                                            {inv.Status}
                                        </div>
                                    </td>
                                    <td className="px-6 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                        <InvoiceRowActions id={inv.Invoice_ID} type={inv.Type} status={inv.Status} language={language} />
                                    </td>
                                </tr>
                            ))
                        )
                        ) : (
                            filteredJobs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="text-center py-24 opacity-30">
                                        <FileText size={48} className="mx-auto mb-4" />
                                        <p className="font-black uppercase tracking-widest text-xs">{t('invoices.all_invoiced')}</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredJobs.map((job) => (
                                    <tr 
                                        key={job.Job_ID} 
                                        className={cn(
                                            "group/row transition-all duration-500 cursor-pointer border-l-4 border-transparent",
                                            selectedJobIds.includes(job.Job_ID) ? "bg-primary/10 border-primary shadow-inner" : "hover:bg-primary/[0.03]"
                                        )}
                                        onClick={() => toggleJob(job.Job_ID)}
                                    >
                                        <td className="px-6 py-2 w-12">
                                            <div className={cn(
                                                "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-500",
                                                selectedJobIds.includes(job.Job_ID) ? "bg-primary border-primary rotate-12 scale-110 shadow-lg" : "border-border/20 group-hover/row:border-primary/50"
                                            )}>
                                                {selectedJobIds.includes(job.Job_ID) && <CheckCircle2 size={12} className="text-white" strokeWidth={3} />}
                                            </div>
                                        </td>
                                        <td className="px-6 py-2">
                                            <span className="font-black text-foreground text-sm tracking-tighter group-hover/row:text-primary transition-colors font-display uppercase">{job.Job_ID}</span>
                                        </td>
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-3">
                                                <div className="p-1.5 bg-muted/50 rounded-lg group-hover/row:bg-primary/20 transition-colors">
                                                    <Building2 className="w-4 h-4 text-muted-foreground group-hover/row:text-primary transition-colors" />
                                                </div>
                                                <span className="font-bold text-muted-foreground text-sm uppercase tracking-tight">{job.Customer_Name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-center text-muted-foreground font-black uppercase tracking-widest text-[10px]">
                                        {job.Plan_Date ? new Date(job.Plan_Date).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US') : '-'}
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-base font-black text-foreground tracking-tighter group-hover/row:text-primary transition-colors bg-muted/50 px-3 py-1 rounded-lg">
                                                    ฿{(() => {
                                                        const storedTotal = job.Price_Cust_Total || 0
                                                        const calculatedTotal = (job.Price_Per_Unit && job.Loaded_Qty) ? (job.Price_Per_Unit * job.Loaded_Qty) : 0
                                                        const displayTotal = storedTotal <= 0 ? calculatedTotal : storedTotal
                                                        return Number(displayTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })
                                                    })()}
                                                </span>
                                                {job.Loaded_Qty && (
                                                    <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-0.5 opacity-50">
                                                        {job.Loaded_Qty} {language === 'th' ? 'ชิ้น' : 'pcs'} x ฿{(() => {
                                                            const total = job.Price_Cust_Total || 0;
                                                            const qty = job.Loaded_Qty || 1;
                                                            const unit = total > 0 ? (total / qty) : (job.Price_Per_Unit || 0);
                                                            return unit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                        })()}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-2 text-center">
                                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest">
                                                {t('invoices.status_completed')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-2 w-16"></td>
                                    </tr>
                                ))
                            )
                        )}
                    </tbody>
                    </table>
                </div>

                <div className="p-6 border-t border-border/5 bg-muted/30 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] opacity-40">{t('invoices.engine_title')} Cluster v4.0</p>
                        <div className="h-3 w-px bg-muted/50" />
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-primary" />
                            <span className="text-[10px] font-bold font-black text-primary uppercase tracking-widest">DATA SYNCHRONIZED</span>
                        </div>
                    </div>
                    <ShieldCheck size={14} className="text-primary opacity-20" />
                </div>
            </div>
          </>
      )}

      <div className="mt-12 text-center mb-16">
        <div className="inline-flex items-center gap-3 px-6 py-2 glass-panel rounded-full text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] opacity-40 hover:opacity-100 transition-opacity">
            <Zap size={12} className="text-primary" /> LogisPro {t('invoices.engine_title')} • Matrix Synchronization v4.2
        </div>
      </div>
    </DashboardLayout>
  )
}
