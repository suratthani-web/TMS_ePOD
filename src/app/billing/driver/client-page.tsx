"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { useLanguage } from "@/components/providers/language-provider"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Wallet,
  Download,
  Truck,
  User,
  Search,
  CheckCircle2,
  Clock,
  Banknote,
  Percent,
  Loader2,
  FileDown,
  History,
  Eye,
  Zap,
  Activity,
  ShieldCheck,
  Save
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Job } from "@/lib/supabase/jobs"
import { Driver } from "@/lib/supabase/drivers"
import { createDriverPayment } from "@/lib/supabase/billing"

import { CompanyProfile } from "@/lib/supabase/settings"
import { Subcontractor } from "@/types/subcontractor"
import { getBankCode } from "@/lib/constants/banks"
import { toast } from "sonner"

const WITHHOLDING_TAX_RATE = 0.01 // 1%
import { exportToCSV } from "@/lib/utils/export"
import { PaymentVoucher } from "@/components/billing/driver/PaymentVoucher"

interface ExtraCost {
    cost_driver: string | number
    type: string
}

const getJobTotal = (job: Job) => {
    const basePrice = job.Cost_Driver_Total || 0
    let extra = 0
    if (job.extra_costs_json) {
        try {
            let costs: ExtraCost[] = []
            if (typeof job.extra_costs_json === 'string') {
                try { costs = JSON.parse(job.extra_costs_json) } catch {}
            } else {
                costs = job.extra_costs_json as ExtraCost[]
            }
            if (Array.isArray(costs)) {
                extra = costs.reduce((sum: number, c: ExtraCost) => sum + (Number(c.cost_driver) || 0), 0)
            }
        } catch {
            // Error parsing extra costs
        }
    }
    return basePrice + extra
}

interface DriverPaymentClientProps {
  initialJobs: Job[]
  drivers: Driver[]
  companyProfile: CompanyProfile | null
  subcontractors: Subcontractor[]
  initialDateFrom?: string
  initialDateTo?: string
}

export default function DriverPaymentClient({ 
  initialJobs, 
  drivers, 
  companyProfile, 
  subcontractors,
  initialDateFrom,
  initialDateTo
}: DriverPaymentClientProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const [dateFrom, setDateFrom] = useState(initialDateFrom || "")
  const [dateTo, setDateTo] = useState(initialDateTo || "")
  const [paymentModel, setPaymentModel] = useState<'individual' | 'subcontractor' | 'all'>('individual')
  const [selectedEntityId, setSelectedEntityId] = useState("")
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Filter data (Client-side)
  const filteredData = initialJobs.filter(item => {
    const driver = drivers.find(d => d.Driver_Name === item.Driver_Name)
    
    if (paymentModel !== 'all') {
        if (paymentModel === 'individual') {
            // If a specific driver is selected, show only that driver
            if (selectedEntityId) {
                if (item.Driver_Name !== selectedEntityId) return false
            } else {
                // "All" mode: Show only drivers who don't belong to any subcontractor group
                if (driver?.Sub_ID) return false
            }
        } else {
            // If a specific subcontractor is selected, show only drivers in that group
            if (selectedEntityId) {
                if (driver?.Sub_ID !== selectedEntityId) return false
            } else {
                // "All" mode: Show only drivers who belong to a subcontractor group
                if (!driver?.Sub_ID) return false
            }
        }
    } else {
        // 'All' mode: If a specific entity was selected while in other modes, filter it, otherwise show all
        if (selectedEntityId) {
            const isSub = subcontractors.some(s => s.Sub_ID === selectedEntityId)
            if (isSub) {
                if (driver?.Sub_ID !== selectedEntityId) return false
            } else {
                if (item.Driver_Name !== selectedEntityId) return false
            }
        }
    }

    // Date filtering with string comparison (Safe for YYYY-MM-DD)
    if (dateFrom && item.Plan_Date) {
        if (item.Plan_Date < dateFrom) return false
    }
    if (dateTo && item.Plan_Date) {
        if (item.Plan_Date > dateTo) return false
    }
    return true
  })

  // Calculate totals
  const pendingItems = filteredData
  const pendingTotal = pendingItems.reduce((sum, i) => sum + getJobTotal(i), 0)
  
  // Selected items calculations
  const selectedData = filteredData.filter(i => selectedItems.includes(i.Job_ID))
  const selectedSubtotal = selectedData.reduce((sum, i) => sum + getJobTotal(i), 0)
  const selectedWithholding = Math.round(selectedSubtotal * WITHHOLDING_TAX_RATE)
  const selectedNetTotal = selectedSubtotal - selectedWithholding

  const toggleItem = (jobId: string) => {
    setSelectedItems(prev => 
      prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]
    )
  }

  const selectAll = () => {
    const pendingIds = pendingItems.map(i => i.Job_ID)
    setSelectedItems(pendingIds)
  }

  const clearSelection = () => {
    setSelectedItems([])
  }

  const handleCreatePayment = async () => {
    if (selectedItems.length === 0) return
    if (!selectedEntityId) {
        toast.warning(t('billing_driver.select_recipient_first'))
        return
    }

    if (!confirm(t('billing_driver.payout_confirm').replace('{count}', selectedItems.length.toString()))) return

    setLoading(true)
    try {
        const today = new Date().toISOString().split('T')[0]

        const result = await createDriverPayment(
            selectedItems, 
            paymentModel === 'individual' 
                ? selectedEntityId 
                : (subcontractors.find(s => s.Sub_ID === selectedEntityId)?.Sub_Name || selectedEntityId), 
            today
        )

        if (result.success) {
            setSelectedItems([])
            router.refresh()
            toast.success(t('billing_driver.payout_success'))
        } else {
            toast.error("Error: " + result.error)
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        toast.error("เกิดข้อผิดพลาด: " + message)
    } finally {
        setLoading(false)
    }
  }

  const handleExportSCB = () => {
    if (selectedItems.length === 0) return

    const jobsToExport = initialJobs.filter(j => selectedItems.includes(j.Job_ID))
    const lines = ["Bank Code,Account No,Amount,Beneficiary Name,Ref1,Ref2"]
    const missingBankEntities: string[] = []

    if (paymentModel === 'individual') {
        const jobsByDriver: Record<string, Job[]> = {}
        jobsToExport.forEach(job => {
            const driverInfo = drivers.find(d => d.Driver_ID === job.Driver_ID) || drivers.find(d => d.Vehicle_Plate === job.Vehicle_Plate)
            const dName = job.Driver_Name || driverInfo?.Driver_Name || 'Unknown'
            if (!jobsByDriver[dName]) jobsByDriver[dName] = []
            jobsByDriver[dName].push(job)
        })

        Object.entries(jobsByDriver).forEach(([driverName, p_jobs]) => {
            const driverInfo = drivers.find(d => d.Driver_Name === driverName || d.Driver_ID === p_jobs[0].Driver_ID || d.Vehicle_Plate === p_jobs[0].Vehicle_Plate)
            if (!driverInfo?.Bank_Account_No) {
                missingBankEntities.push(driverName)
                return
            }
            const subtotal = p_jobs.reduce((sum, j) => sum + getJobTotal(j), 0)
            const withholding = Math.round(subtotal * WITHHOLDING_TAX_RATE)
            const netTotal = subtotal - withholding
            const bankCode = getBankCode(driverInfo.Bank_Name)
            lines.push(`${bankCode},${driverInfo.Bank_Account_No},${netTotal.toFixed(2)},${driverInfo.Bank_Account_Name || driverName},Salary,${new Date().toISOString().split('T')[0]}`)
        })
    } else {
        const jobsBySub: Record<string, Job[]> = {}
        jobsToExport.forEach(job => {
            const driver = drivers.find(d => d.Driver_Name === job.Driver_Name)
            const subId = driver?.Sub_ID || 'Independent'
            if (!jobsBySub[subId]) jobsBySub[subId] = []
            jobsBySub[subId].push(job)
        })

        Object.entries(jobsBySub).forEach(([subId, p_jobs]) => {
            const subInfo = subcontractors.find(s => s.Sub_ID === subId)
            if (!subInfo?.Bank_Account_No) {
                missingBankEntities.push(subInfo?.Sub_Name || subId)
                return
            }
            const subtotal = p_jobs.reduce((sum, j) => sum + getJobTotal(j), 0)
            const withholding = Math.round(subtotal * WITHHOLDING_TAX_RATE)
            const netTotal = subtotal - withholding
            const bankCode = getBankCode(subInfo.Bank_Name)
            lines.push(`${bankCode},${subInfo.Bank_Account_No},${netTotal.toFixed(2)},${subInfo.Bank_Account_Name || subInfo.Sub_Name},Salary,${new Date().toISOString().split('T')[0]}`)
        })
    }

    if (missingBankEntities.length > 0) {
        toast.warning(`Missing Bank Info for: ${missingBankEntities.join(", ")}`)
        if (lines.length === 1) return
    }

    const csvContent = "\ufeff" + lines.join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.setAttribute("download", `SCB_Bulk_Export_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleExportCSV = () => {
    if (selectedItems.length === 0) return
    const jobsToExport = initialJobs.filter(j => selectedItems.includes(j.Job_ID))
    
    const dataToExport = jobsToExport.map(job => {
        let origin = (job.Origin_Location || '').trim()
        let dest = (job.Dest_Location || '').trim()
        
        // Advanced fallback for JSON structured data
        if (!origin && job.original_origins_json) {
            try {
                const origins = typeof job.original_origins_json === 'string' 
                    ? JSON.parse(job.original_origins_json) 
                    : job.original_origins_json
                if (Array.isArray(origins) && origins.length > 0) {
                    origin = origins[0].name || origins[0].address || origins[0].Location_Name || ''
                }
            } catch {}
        }
        if (!dest && job.original_destinations_json) {
            try {
                const destinations = typeof job.original_destinations_json === 'string'
                    ? JSON.parse(job.original_destinations_json)
                    : job.original_destinations_json
                if (Array.isArray(destinations) && destinations.length > 0) {
                    dest = destinations[destinations.length - 1].name || destinations[destinations.length - 1].address || destinations[destinations.length - 1].Location_Name || ''
                }
            } catch {}
        }

        // Final fallback to Route_Name
        if ((!origin || !dest) && job.Route_Name) {
            const parts = job.Route_Name.split(/[-→/]/)
            if (parts.length >= 2) {
                if (!origin) origin = parts[0].trim()
                if (!dest) dest = parts.slice(1).join(' - ').trim()
            }
        }

        return {
            'Job ID': job.Job_ID,
            'วันที่': job.Plan_Date ? new Date(job.Plan_Date).toLocaleDateString('th-TH') : '-',
            'คนขับ': job.Driver_Name || 
                    drivers.find(d => d.Driver_ID === job.Driver_ID)?.Driver_Name || 
                    drivers.find(d => d.Vehicle_Plate === job.Vehicle_Plate)?.Driver_Name || 
                    '-',
            'ทะเบียนรถ': job.Vehicle_Plate || '-',
            'ต้นทาง': origin || '-',
            'ปลายทาง': dest || job.Route_Name || '-',
            'ลูกค้า': job.Customer_Name || '-',
            'จำนวนชิ้น': job.Loaded_Qty || 0,
            'ต้นทุนคนขับ (Base)': job.Cost_Driver_Total || 0,
            'ค่าใช้จ่ายเพิ่มเติม': getJobTotal(job) - (job.Cost_Driver_Total || 0),
            'รวมทั้งหมด': getJobTotal(job),
            'สถานะ': job.Job_Status
        }
    })

    exportToCSV(dataToExport, `Driver_Payment_Selection`)
  }

  // Payment Preview Component
  const PaymentPreview = () => {
    const entityInfo = paymentModel === 'individual' 
        ? drivers.find(d => d.Driver_Name === selectedEntityId)
        : subcontractors.find(s => s.Sub_ID === selectedEntityId)
    
    const entityName = paymentModel === 'individual'
        ? selectedEntityId
        : subcontractors.find(s => s.Sub_ID === selectedEntityId)?.Sub_Name || selectedEntityId

    const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric'})

    return (
        <PaymentVoucher 
            companyProfile={companyProfile}
            entityName={entityName}
            entityInfo={entityInfo ?? null}
            today={today}
            selectedData={selectedData}
            selectedSubtotal={selectedSubtotal}
            selectedWithholding={selectedWithholding}
            selectedNetTotal={selectedNetTotal}
            t={t}
        />
    )
  }

  return (
    <>
    <div className="print:hidden">
    <DashboardLayout>
      {/* Tactical Payout Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 mb-16 bg-background/60 backdrop-blur-3xl p-12 rounded-[4rem] border border-border/5 shadow-2xl relative group ring-1 ring-border/5 hover:ring-primary/20 transition-all duration-700">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 rounded-xl shadow-lg">
                    <Wallet className="text-indigo-400" size={20} />
                </div>
                <h2 className="text-base font-bold font-black text-indigo-400 uppercase tracking-[0.4em]">AP COMMAND CENTRE</h2>
            </div>
            <h1 className="text-6xl font-black text-foreground tracking-tighter flex items-center gap-5 uppercase premium-text-gradient">
                {t('billing_driver.title')}
            </h1>
            <p className="text-muted-foreground font-bold text-xl tracking-wide opacity-80 uppercase tracking-widest leading-relaxed">
              {t('billing_driver.subtitle')}
            </p>
        </div>

        <div className="flex flex-wrap gap-4 relative z-10">
            <PremiumButton 
                variant="outline" 
                className="h-16 px-10 rounded-2xl border-border/5 bg-muted/50 hover:bg-muted/80 text-muted-foreground hover:text-foreground gap-3 transition-all duration-300 ring-1 ring-border/5"
                onClick={() => router.push('/billing/driver/history')}
            >
                <History className="w-6 h-6" /> 
                <span className="font-black uppercase tracking-widest text-base font-bold">{t('billing_driver.payment_history')}</span>
            </PremiumButton>
        </div>
      </div>

      {/* Settlement Intelligence Filters */}
      <div className="glass-panel border-border/5 rounded-[3rem] p-10 mb-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent pointer-events-none" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10 items-end">
            <div className="space-y-3">
              <Label className="text-base font-bold font-black uppercase tracking-[0.3em] text-muted-foreground ml-2">{t('billing_driver.settlement_mode')}</Label>
              <Select
                value={paymentModel}
                onValueChange={(value) => {
                    setPaymentModel(value as 'individual' | 'subcontractor' | 'all')
                    setSelectedEntityId("")
                }}
              >
                <SelectTrigger className="w-full h-14 bg-muted/50 border-border/5 text-foreground font-black rounded-2xl px-6 uppercase tracking-widest text-lg font-bold focus:ring-indigo-500/20 transition-all">
                  <SelectValue placeholder={t('billing_driver.settlement_mode').toUpperCase() + "..."} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border/10 text-foreground font-black">
                  <SelectItem value="individual" className="hover:bg-indigo-500/20 focus:bg-indigo-500/20 uppercase tracking-widest text-base font-bold">{t('billing_driver.individual_nodes')}</SelectItem>
                  <SelectItem value="subcontractor" className="hover:bg-indigo-500/20 focus:bg-indigo-500/20 uppercase tracking-widest text-base font-bold">{t('billing_driver.partner_cluster')}</SelectItem>
                  <SelectItem value="all" className="hover:bg-indigo-500/20 focus:bg-indigo-500/20 uppercase tracking-widest text-base font-bold">แสดงทั้งหมด (ALL)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label className="text-base font-bold font-black uppercase tracking-[0.3em] text-muted-foreground ml-2">{paymentModel === 'individual' ? t('billing_driver.target_driver') : t('billing_driver.target_partner')}</Label>
              <Select
                value={selectedEntityId || "all"}
                onValueChange={(value) => setSelectedEntityId(value === "all" ? "" : value)}
              >
                <SelectTrigger className="w-full h-14 bg-muted/50 border-border/5 text-foreground font-black rounded-2xl px-6 uppercase tracking-widest text-lg font-bold focus:ring-indigo-500/20 transition-all">
                  <SelectValue placeholder={t('billing_driver.locate_recipient')} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border/10 text-foreground font-black">
                  <SelectItem value="all" className="hover:bg-indigo-500/20 focus:bg-indigo-500/20 uppercase tracking-widest text-base font-bold">{t('billing_driver.all_sectors')}</SelectItem>
                  {paymentModel === 'all' ? (
                      <>
                        <SelectItem value="all" className="hover:bg-indigo-500/20 focus:bg-indigo-500/20 uppercase tracking-widest text-base font-bold">แสดงทั้งหมด (ALL)</SelectItem>
                        {drivers.map(d => (
                           <SelectItem key={`d-${d.Driver_ID}`} value={d.Driver_Name || ""} className="hover:bg-indigo-500/20 focus:bg-indigo-500/20 uppercase tracking-widest text-base font-bold">คนขับ: {d.Driver_Name}</SelectItem>
                        ))}
                        {subcontractors.map(s => (
                           <SelectItem key={`s-${s.Sub_ID}`} value={s.Sub_ID} className="hover:bg-indigo-500/20 focus:bg-indigo-500/20 uppercase tracking-widest text-base font-bold">บริษัท: {s.Sub_Name}</SelectItem>
                        ))}
                      </>
                  ) : paymentModel === 'individual' ? (
                      drivers.filter(d => !d.Sub_ID).map(d => (
                          <SelectItem key={d.Driver_Name || ""} value={d.Driver_Name || ""} className="hover:bg-indigo-500/20 focus:bg-indigo-500/20 uppercase tracking-widest text-base font-bold">{d.Driver_Name}</SelectItem>
                      ))
                  ) : (
                      subcontractors.map(s => (
                          <SelectItem key={s.Sub_ID} value={s.Sub_ID} className="hover:bg-indigo-500/20 focus:bg-indigo-500/20 uppercase tracking-widest text-base font-bold">{s.Sub_Name}</SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3 md:col-span-1">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                        <Label className="text-base font-bold font-black uppercase tracking-[0.3em] text-muted-foreground ml-2">Vector Start</Label>
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full h-14 bg-muted/50 border-border/5 text-foreground font-black rounded-2xl px-6 uppercase tracking-widest text-lg font-bold focus:bg-muted/80 transition-all"
                        />
                    </div>
                    <div className="space-y-3">
                        <Label className="text-base font-bold font-black uppercase tracking-[0.3em] text-muted-foreground ml-2">Vector End</Label>
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full h-14 bg-muted/50 border-border/5 text-foreground font-black rounded-2xl px-6 uppercase tracking-widest text-lg font-bold focus:bg-muted/80 transition-all"
                        />
                    </div>
                </div>
            </div>
            <div>
              <PremiumButton 
                variant="outline" 
                className="border-border/5 w-full h-14 rounded-2xl gap-3"
                onClick={() => {
                  const params = new URLSearchParams()
                  if (dateFrom) params.set('dateFrom', dateFrom)
                  if (dateTo) params.set('dateTo', dateTo)
                  router.push(`?${params.toString()}`)
                }}
              >
                <Search className="w-5 h-5" /> 
                <span className="font-black uppercase tracking-widest text-base font-bold">{t('billing_driver.execute_query')}</span>
              </PremiumButton>
            </div>
          </div>
      </div>

      {/* Payout Intelligence Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
        <div className="p-8 rounded-[3rem] border border-primary/20 backdrop-blur-3xl shadow-2xl relative overflow-hidden group transition-all hover:scale-[1.03] bg-background/40">
            <div className="flex items-center justify-between mb-8">
                <div className="p-4 rounded-2xl shadow-xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-6 bg-primary/20 text-primary">
                    <Clock size={24} strokeWidth={2.5} />
                </div>
                <div className="px-3 py-1 bg-muted/50 rounded-full border border-border/5 text-base font-bold text-primary font-black uppercase tracking-widest italic animate-pulse">PENDING PAYOUT</div>
            </div>
            <p className="text-muted-foreground font-black text-base font-bold uppercase tracking-[0.3em] mb-2">Awaiting Settlement</p>
            <p className="text-4xl font-black text-foreground tracking-tighter leading-none">{pendingItems.length}</p>
        </div>

        <div className="p-8 rounded-[3rem] border border-indigo-500/20 backdrop-blur-3xl shadow-2xl relative overflow-hidden group transition-all hover:scale-[1.03] bg-background/40">
            <div className="flex items-center justify-between mb-8">
                <div className="p-4 rounded-2xl shadow-xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-6 bg-indigo-500/20 text-indigo-400">
                    <Banknote size={24} strokeWidth={2.5} />
                </div>
                <div className="px-3 py-1 bg-muted/50 rounded-full border border-border/5 text-base font-bold text-indigo-400 font-black uppercase tracking-widest italic">VALUATION</div>
            </div>
            <p className="text-muted-foreground font-black text-base font-bold uppercase tracking-[0.3em] mb-2">{t('billing_driver.total_liability')}</p>
            <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold font-black text-muted-foreground mb-1">THB</span>
                <p className="text-4xl font-black text-foreground tracking-tighter leading-none">{pendingTotal.toLocaleString()}</p>
            </div>
        </div>

        <div className="p-8 rounded-[3rem] border border-primary/30 backdrop-blur-3xl shadow-2xl relative overflow-hidden group transition-all hover:scale-[1.03] bg-background/40">
            <div className="flex items-center justify-between mb-8">
                <div className="p-4 rounded-2xl shadow-xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-6 bg-primary text-white">
                    <CheckCircle2 size={24} strokeWidth={2.5} />
                </div>
                <div className="px-3 py-1 bg-muted/80 rounded-full border border-border/10 text-base font-bold text-foreground font-black uppercase tracking-widest italic">{t('billing_driver.active_target')}</div>
            </div>
            <p className="text-muted-foreground font-black text-base font-bold uppercase tracking-[0.3em] mb-2">{t('billing_driver.selected_delta')} ({selectedItems.length})</p>
            <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold font-black text-muted-foreground mb-1">THB</span>
                <p className="text-4xl font-black text-foreground tracking-tighter leading-none">{selectedSubtotal.toLocaleString()}</p>
            </div>
        </div>

        <div className="p-8 rounded-[3rem] border border-rose-500/20 backdrop-blur-3xl shadow-2xl relative overflow-hidden group transition-all hover:scale-[1.03] bg-background/40">
            <div className="flex items-center justify-between mb-8">
                <div className="p-4 rounded-2xl shadow-xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-6 bg-rose-500/20 text-rose-500">
                    <Percent size={24} strokeWidth={2.5} />
                </div>
                <div className="px-3 py-1 bg-muted/50 rounded-full border border-border/5 text-base font-bold text-rose-500 font-black uppercase tracking-widest italic">{t('billing_driver.levy_deduction')}</div>
            </div>
            <p className="text-muted-foreground font-black text-base font-bold uppercase tracking-[0.3em] mb-2">{t('billing_driver.wht_offset')}</p>
            <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold font-black text-muted-foreground mb-1">THB</span>
                <p className="text-4xl font-black text-foreground tracking-tighter leading-none">{selectedWithholding.toLocaleString()}</p>
            </div>
        </div>
      </div>

      {/* Selected Command Interface */}
      {selectedItems.length > 0 && (
        <div className="mb-12 relative group animate-in fade-in slide-in-from-bottom-5">
            <div className="absolute inset-0 bg-primary/20 blur-[80px] pointer-events-none opacity-50" />
            <div className="relative bg-background/80 backdrop-blur-3xl border-2 border-primary/30 p-10 rounded-[4rem] shadow-[0_0_100px_rgba(255,30,133,0.2)] flex flex-wrap items-center justify-between gap-10">
                <div className="flex items-center gap-12">
                     <div className="space-y-2">
                        <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em]">{t('billing_driver.settlement_base')}</p>
                        <p className="text-3xl font-black text-foreground tracking-tighter">฿{selectedSubtotal.toLocaleString()}</p>
                    </div>
                    <div className="h-12 w-px bg-muted/80" />
                    <div className="space-y-2 text-rose-500">
                        <p className="text-base font-bold font-black uppercase tracking-[0.4em] opacity-60 text-muted-foreground">{t('billing_driver.tax_delta')}</p>
                        <p className="text-3xl font-black tracking-tighter">-฿{selectedWithholding.toLocaleString()}</p>
                    </div>
                    <div className="h-12 w-px bg-muted/80" />
                    <div className="space-y-2">
                        <p className="text-base font-bold font-black text-primary uppercase tracking-[0.4em] animate-pulse">{t('billing_driver.net_disbursement')}</p>
                        <p className="text-5xl font-black text-primary tracking-tighter premium-text-gradient">฿{selectedNetTotal.toLocaleString()}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-6">
                    <button onClick={clearSelection} className="px-8 py-3 text-foreground transition-colors">
                        {t('billing_driver.abort_payout')}
                    </button>
                    <PremiumButton onClick={handleCreatePayment} disabled={loading} className="h-20 px-12 rounded-[2rem] shadow-[0_20px_40px_rgba(255,30,133,0.3)] text-xl font-black tracking-widest">
                        {loading ? <Loader2 className="w-6 h-6 mr-4 animate-spin" /> : <Save size={24} className="mr-4" strokeWidth={3} />}
                        {t('billing_driver.process_disbursement')}
                    </PremiumButton>
                </div>
            </div>
        </div>
      )}

      {/* Transaction Table */}
      <div className="glass-panel rounded-[4rem] border-border/5 shadow-2xl overflow-hidden bg-background/20 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between p-12 gap-8 relative z-10">
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-foreground tracking-tighter uppercase premium-text-gradient">{t('billing_driver.ledger_title')}</h3>
            <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.1em]">{t('billing_driver.registry_subtitle')}</p>
          </div>
          <div className="flex items-center flex-wrap gap-4">
            <PremiumButton variant="outline" size="sm" onClick={selectAll} className="h-12 px-8 rounded-xl border-border/5 bg-muted/50 text-base font-bold font-black tracking-widest uppercase">
                {t('billing_driver.select_all_nodes')}
            </PremiumButton>
            
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogTrigger asChild>
                    <button 
                        disabled={selectedItems.length === 0}
                        className="h-12 px-8 rounded-xl bg-muted/50 border border-border/5 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all font-black tracking-widest uppercase text-base font-bold flex items-center gap-3 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <Eye size={16} /> {t('billing_driver.preview_voucher')}
                    </button>
                </DialogTrigger>
                <DialogContent className="max-w-[210mm] max-h-[90vh] overflow-y-auto bg-white p-0 rounded-[2rem] ring-0 border-0">
                    <div className="p-4 bg-slate-100 flex items-center justify-between border-b sticky top-0 z-50 print:hidden text-foreground">
                        <div className="flex items-center gap-3">
                             <ShieldCheck className="text-primary" />
                             <DialogTitle className="text-base font-bold font-black uppercase tracking-widest">Digital Audit • Payout Verification v5.1</DialogTitle>
                        </div>
                        <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                            <Activity size={18} />
                        </button>
                    </div>
                    <PaymentPreview />
                </DialogContent>
            </Dialog>

            <button 
                onClick={handleExportSCB}
                disabled={selectedItems.length === 0 || loading}
                className="h-12 px-8 rounded-xl bg-primary/20 border border-primary/20 text-primary hover:bg-primary hover:text-foreground font-bold flex items-center gap-3 disabled:opacity-30"
            >
              <FileDown size={16} /> EXPORT SCB BULK
            </button>
            <button 
                onClick={handleExportCSV}
                disabled={selectedItems.length === 0}
                className="h-12 px-8 rounded-xl bg-muted/50 border border-border/5 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all font-black tracking-widest uppercase text-base font-bold flex items-center gap-3 disabled:opacity-30"
            >
              <Download size={16} /> EXPORT CSV
            </button>
          </div>
        </div>

        <div className="relative w-full overflow-auto custom-scrollbar">
            <table className="w-full text-xl text-left border-collapse">
              <thead>
                <tr className="bg-muted/30 border-b border-border/5">
                  <th className="px-12 py-10 w-20">
                    <input 
                      type="checkbox" 
                      className="w-6 h-6 rounded-lg bg-muted/50 border-border/10 checked:bg-primary transition-all cursor-pointer accent-primary"
                      checked={selectedItems.length === pendingItems.length && pendingItems.length > 0}
                      onChange={selectAll}
                    />
                  </th>
                  <th className="px-8 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground">{t('billing_driver.mission_hub')}</th>
                  <th className="px-8 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground">{t('billing_driver.human_capital')}</th>
                  <th className="px-8 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground">{t('billing_driver.asset_identity')}</th>
                  <th className="px-8 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground text-center">{t('billing_customer.timestamp')}</th>
                  <th className="px-8 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground text-right">{t('billing_driver.base_payout')}</th>
                  <th className="px-8 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground text-right">{t('billing_driver.disbursement')}</th>
                  <th className="px-12 py-10 text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground text-center">{t('billing_driver.protocol')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredData.map((item) => (
                  <tr key={item.Job_ID} className="group/row hover:bg-primary/[0.03] transition-all duration-500">
                    <td className="px-12 py-8">
                      <input
                        type="checkbox"
                        className="w-6 h-6 rounded-lg bg-muted/50 border-border/10 checked:bg-primary transition-all cursor-pointer accent-primary"
                        checked={selectedItems.includes(item.Job_ID)}
                        onChange={() => toggleItem(item.Job_ID)}
                      />
                    </td>
                    <td className="px-8 py-8">
                        <span className="font-black text-foreground tracking-tighter group-hover/row:text-primary transition-colors font-display uppercase">{item.Job_ID}</span>
                    </td>
                    <td className="px-8 py-8">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-muted/50 rounded-xl group-hover/row:bg-primary/20 transition-colors">
                            <User className="w-5 h-5 text-muted-foreground group-hover/row:text-primary transition-colors" />
                        </div>
                        <span className="font-black text-muted-foreground text-xl uppercase tracking-tight">
                            {item.Driver_Name || 
                             drivers.find(d => d.Driver_ID === item.Driver_ID)?.Driver_Name || 
                             drivers.find(d => d.Vehicle_Plate === item.Vehicle_Plate)?.Driver_Name || 
                             '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-8">
                      <div className="flex items-center gap-4">
                        <Truck className="w-4 h-4 text-muted-foreground group-hover/row:text-primary transition-colors" />
                        <span className="text-muted-foreground font-black text-base font-bold uppercase tracking-[0.2em]">{item.Vehicle_Plate || '-'}</span>
                      </div>
                    </td>
                    <td className="px-8 py-8 text-center text-muted-foreground font-bold uppercase tracking-widest text-base font-bold">
                        {item.Plan_Date ? new Date(item.Plan_Date).toLocaleDateString('th-TH') : '-'}
                    </td>
                    <td className="px-8 py-8 text-right font-black text-muted-foreground text-xl">
                      <span className="text-base font-bold mr-2">THB</span>
                      {(item.Cost_Driver_Total || 0).toLocaleString()}
                    </td>
                    <td className="px-8 py-8 text-right">
                        <div className="flex flex-col items-end">
                            <span className="text-xl font-black text-foreground tracking-tighter group-hover/row:text-indigo-400 transition-colors bg-muted/50 px-4 py-1 rounded-xl">฿{getJobTotal(item).toLocaleString()}</span>
                            <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest mt-1">Net Flow</span>
                        </div>
                    </td>
                    <td className="px-12 py-8 text-center">
                      <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-[1.5rem] bg-primary/10 text-primary border border-primary/20 text-base font-bold font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,30,133,0.1)] group-hover/row:scale-110 transition-all duration-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        {t('billing_driver.awaiting_cashflow')}
                      </div>
                    </td>
                  </tr>
                ))}
                
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-40">
                      <div className="flex flex-col items-center gap-6 opacity-30">
                         <div className="p-8 bg-muted/50 rounded-full border-2 border-border/5 animate-pulse">
                            <Wallet size={64} className="text-muted-foreground" strokeWidth={1} />
                         </div>
                         <p className="text-muted-foreground font-black uppercase tracking-[0.5em] text-lg font-bold">Zero Payout Vectors Detected</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
        </div>

        <div className="p-10 border-t border-border/5 bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-6">
                <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.6em]">Driver Payout Matrix Node Registry v5.1</p>
                <div className="h-4 w-px bg-muted/50" />
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <span className="text-base font-bold font-black text-indigo-500 uppercase tracking-widest">SECURE SETTLEMENT</span>
                </div>
            </div>
            <Zap size={18} className="text-primary opacity-20" />
        </div>
      </div>

      <div className="mt-20 text-center mb-24">
        <div className="inline-flex items-center gap-4 px-8 py-3 glass-panel rounded-full text-base font-bold font-black text-muted-foreground uppercase tracking-[0.6em] opacity-40 hover:opacity-100 transition-opacity">
            <ShieldCheck size={14} className="text-primary" /> LogisPro Settlement Engine • Certified Disbursement Accuracy
        </div>
      </div>
    </DashboardLayout>
    </div>

    {/* Dedicated Print Matrix */}
    <div className="hidden print:block printable-content fixed inset-0 bg-white z-[9999] p-0 font-sans antialiased">
        <PaymentPreview />
    </div>
    </>
  )
}

