"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { 
    Plus, 
    Edit, 
    Trash2, 
    Search, 
    Loader2, 
    Building2,
    FileSpreadsheet,
    Phone,
    Mail,
    MapPin,
    Save,
    CreditCard,
    TrendingUp,
    Zap,
    Users,
    Activity,
    ShieldCheck,
    ArrowLeft
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { ExcelImport } from "@/components/ui/excel-import"
import { ExcelExport } from "@/components/ui/excel-export"
import { createBulkCustomers, getAllCustomers, createCustomer, updateCustomer, deleteCustomer } from "@/lib/supabase/customers"
import { getExecutiveKPIs } from "@/lib/supabase/analytics"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Customer } from "@/lib/supabase/customers"
import { Tabs, TabsContent, List as TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CustomerFuelMatrix } from "@/components/settings/customer-fuel-matrix"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useBranch } from "@/components/providers/branch-provider"
import { isAdmin } from "@/lib/permissions"

interface ExecutiveKPIs {
  revenue: { current: number; previous: number; growth: number; target: number; attainment: number; };
  profit: { current: number; previous: number; growth: number; };
  margin: { current: number | undefined; previous: number | undefined; growth: number; target: number; };
}

export default function CustomersSettingsPage() {
  const { t } = useLanguage()
  const fuelMatrixRef = useRef<{ handleSave: () => Promise<{ success: boolean; error?: string }> } | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [kpis, setKpis] = useState<ExecutiveKPIs | null>(null)
  const [isAdminUser, setIsAdminUser] = useState(false)
  const [formData, setFormData] = useState<Partial<Customer>>({
    Customer_ID: "",
    Customer_Name: "",
    Tax_ID: "",
    Branch_ID: "",
    Phone: "",
    Address: "",
    Email: "",
    Line_User_ID: "",
    Credit_Term: undefined,
    Price_Per_Unit: undefined,
  })
  const [saving, setSaving] = useState(false)

  const { selectedBranch, branches } = useBranch()

  const router = useRouter()

  const loadCustomers = useCallback(async () => {
    setLoading(true)
    const [result, kpiData, adminStatus] = await Promise.all([
        getAllCustomers(1, 100, searchQuery, selectedBranch),
        getExecutiveKPIs(undefined, undefined, selectedBranch),
        isAdmin()
    ])
    setCustomers(result.data)
    setKpis(kpiData as unknown as ExecutiveKPIs)
    setIsAdminUser(adminStatus)
    setLoading(false)
  }, [searchQuery, selectedBranch])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  const handleOpenDialog = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer)
      setFormData(customer)
    } else {
      setEditingCustomer(null)
      setFormData({
        Customer_ID: "",
        Customer_Name: "",
        Tax_ID: "",
        Branch_ID: (selectedBranch && selectedBranch !== "All") ? selectedBranch : "",
        Phone: "",
        Address: "",
        Email: "",
        Line_User_ID: "",
        Credit_Term: 30,
        Price_Per_Unit: 0,
      })
    }
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.Customer_Name) return toast.warning(t('common.error'))
    setSaving(true)
    try {
      // 1. Save Fuel Matrix logic (via ref)
      if (fuelMatrixRef.current) {
          const matrixResult = await fuelMatrixRef.current.handleSave()
          if (!matrixResult?.success) {
              setSaving(false)
              // The toast is already handled inside CustomerFuelMatrix
              return 
          }
      }

      // 2. Save Main Customer Data
      if (editingCustomer) {
        const result = await updateCustomer(formData.Customer_ID!, formData)
        if (!result.success) throw new Error(result.error instanceof Error ? result.error.message : 'Update failed')
        toast.success(t('common.toast.success_edit'))
      } else {
        const result = await createCustomer(formData)
        if (!result.success) throw new Error(result.error instanceof Error ? result.error.message : 'Create failed')
        toast.success(t('common.toast.success_save'))
      }
      setIsDialogOpen(false)
      loadCustomers()
    } catch (e: unknown) {
      console.error('Save error:', e)
      toast.error(t('common.toast.error_save') + ": " + (e instanceof Error ? e.message : 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.toast.confirm_delete'))) return
    try {
      await deleteCustomer(id)
      toast.success(t('common.toast.success_delete'))
      loadCustomers()
    } catch {
      toast.error(t('common.toast.error_delete'))
    }
  }

  const updateForm = (key: string, value: unknown) => {
    setFormData((prev: Partial<Customer>) => ({ ...prev, [key]: value }))
  }

  return (
    <DashboardLayout>
      {/* Tactical CRM Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10 bg-background/60 backdrop-blur-3xl p-8 rounded-3xl border border-border shadow-xl relative group ring-1 ring-border/5 hover:ring-primary/20 transition-all duration-700">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 space-y-4">
            <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.1em] text-xs font-bold group/back italic">
                <ArrowLeft className="w-3.5 h-3.5 group-hover/back:-translate-x-1 transition-transform" /> 
                ย้อนกลับ
            </button>
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary/20 rounded-lg shadow-lg">
                    <Users className="text-primary" size={16} />
                </div>
                <h2 className="text-xs font-bold font-black text-primary uppercase tracking-tight">{t('settings_pages.customers.title')}</h2>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-tighter flex items-center gap-4 uppercase premium-text-gradient italic leading-none">
                {t('settings_pages.customers.title')}
            </h1>
            <p className="text-muted-foreground font-bold text-sm tracking-wide opacity-80 uppercase leading-relaxed italic">{t('settings_pages.customers.subtitle')}</p>
        </div>

        <div className="flex flex-wrap gap-3 relative z-10">
            {isAdminUser && (
              <>
                <ExcelExport 
                    data={customers}
                    filename="logispro_customers_export"
                    trigger={
                        <PremiumButton variant="outline" className="h-11 px-5 rounded-xl border-border bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest" >
                            <FileSpreadsheet size={16} className="mr-2" />
                            Export
                        </PremiumButton>
                    }
                />
                <ExcelImport 
                    trigger={
                        <PremiumButton variant="outline" className="h-11 px-5 rounded-xl border-border bg-muted/50 text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-all text-[10px] font-black uppercase tracking-widest" >
                            <FileSpreadsheet size={16} className="mr-2 opacity-50" /> 
                            {t('settings_pages.customers.bulk_import')}
                        </PremiumButton>
                    }
                    title={t('settings_pages.customers.import_title')}
                    onImport={createBulkCustomers}
                    templateData={[{
                        Customer_ID: "CUST-001",
                        Customer_Name: "บริษัท ตัวอย่าง จำกัด",
                        Tax_ID: "1234567890123",
                        Phone: "02-123-4567",
                        Address: "123 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110",
                        Email: "contact@example.com",
                        Line_User_ID: "@example_line",
                        Credit_Term: 30,
                        Price_Per_Unit: 1500.00
                    }]}
                    templateFilename="logispro_client_template.xlsx"
                />
                <PremiumButton onClick={() => handleOpenDialog()} className="h-11 px-6 rounded-xl shadow-lg bg-primary text-foreground font-black uppercase tracking-widest text-[10px]">
                  <Plus size={18} className="mr-2" strokeWidth={3} />
                  {t('settings_pages.customers.add_customer')}
                </PremiumButton>
              </>
            )}
        </div>
      </div>

      {/* Analytics Matrix */}
      {!loading && kpis && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {[
                { label: t('settings_pages.customers.stats.count'), value: customers.length, icon: Building2, color: "text-primary", bg: "bg-primary/20", border: "border-primary/20", trend: `+${kpis?.revenue?.growth?.toFixed(1) || '0.0'}%` },
                { label: t('settings_pages.customers.stats.yield'), value: `฿${kpis?.revenue?.current?.toLocaleString() || '0'}`, icon: CreditCard, color: "text-accent", bg: "bg-accent/20", border: "border-accent/20", trend: "High Performance" },
                { label: t('settings_pages.customers.stats.margin'), value: `${kpis?.margin?.current?.toFixed(1) || '0.0'}%`, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10", border: "border-primary/10", trend: "OPTIMIZED" },
            ].map((stat, idx) => (
              <div key={idx} className={cn(
                  "p-6 rounded-2xl border backdrop-blur-3xl shadow-xl relative overflow-hidden group transition-all hover:scale-[1.02] bg-background/40",
                  stat.border
              )}>
                    <div className="flex items-center justify-between mb-6">
                        <div className={cn(
                            "p-3 rounded-xl shadow-lg transition-all duration-700 group-hover:scale-110 group-hover:rotate-6",
                            stat.bg, stat.color
                        )}>
                            <stat.icon size={20} strokeWidth={2.5} />
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-muted/50 rounded-full border border-border">
                             <span className="text-[9px] font-black text-muted-foreground uppercase tracking-normal italic">{stat.trend}</span>
                        </div>
                    </div>
                    <div className="relative z-10">
                        <p className="text-muted-foreground font-black text-[10px] font-bold uppercase tracking-tight mb-1">{stat.label}</p>
                        <p className="text-2xl font-black text-foreground tracking-tighter leading-none">{stat.value}</p>
                    </div>
                </div>
            ))}
        </div>
      )}

      {/* Global Search Interface */}
      <div className="mb-8 relative group max-w-xl">
        <div className="absolute inset-x-0 bottom-0 h-1 bg-primary blur-3xl opacity-20 pointer-events-none" />
        <div className="relative glass-panel rounded-2xl p-0.5 border-border">
            <div className="flex items-center gap-3 px-4">
                <Search className="text-primary opacity-50" size={18} />
                <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('settings_pages.customers.search_placeholder')}
                    className="bg-transparent border-none text-base font-black text-foreground px-2 h-12 placeholder:text-muted-foreground tracking-tight uppercase focus-visible:ring-0"
                />
            </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="bg-background border border-border text-foreground max-w-6xl max-h-[90vh] shadow-[0_50px_100px_rgba(0,0,0,0.5)] rounded-[3rem] sm:rounded-[4rem] p-0 overflow-hidden ring-1 ring-white/10 flex flex-col">
            <div className="bg-card p-6 sm:p-10 text-foreground relative overflow-hidden border-b border-border shrink-0">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
                <DialogHeader>
                  <DialogTitle className="text-5xl font-black tracking-tighter flex items-center gap-6 uppercase premium-text-gradient">
                    <div className="p-3 bg-primary/20 rounded-2xl shadow-xl ring-1 ring-primary/30">
                        <Building2 size={32} className="text-primary" strokeWidth={2.5} />
                    </div>
                    {editingCustomer ? t('settings_pages.customers.dialog.title_edit') : t('settings_pages.customers.dialog.title_add')}
                  </DialogTitle>
                </DialogHeader>
            </div>

            <div className="p-6 sm:p-10 space-y-6 custom-scrollbar flex-1 min-h-0 overflow-y-auto">
              <Tabs defaultValue="info" className="w-full">
                <div className="flex justify-center mb-8">
                    <TabsList className="bg-muted/50 p-1.5 rounded-2xl border border-border h-auto">
                        <TabsTrigger value="info" className="px-8 py-3 rounded-xl text-sm font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
                            ข้อมูลทั่วไป
                        </TabsTrigger>
                        <TabsTrigger value="rates" disabled={!editingCustomer} className="px-8 py-3 rounded-xl text-sm font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">
                            เรทน้ำมัน (Fuel Matrix)
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="info" className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-500">
                  <div className="space-y-4">
                    <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('settings_pages.customers.dialog.name')}</Label>
                    <div className="glass-panel p-1 rounded-2xl border-border">
                        <Input
                        value={formData.Customer_Name}
                        onChange={(e) => updateForm("Customer_Name", e.target.value)}
                        placeholder={t('settings_pages.customers.dialog.name_placeholder')}
                        className="bg-transparent border-none text-2xl font-black tracking-tighter rounded-xl h-16 px-8 focus:bg-muted/50 transition-all text-foreground placeholder:text-muted-foreground"
                        />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('settings_pages.customers.dialog.phone')}</Label>
                      <Input
                        value={formData.Phone || ""}
                        onChange={(e) => updateForm("Phone", e.target.value)}
                        placeholder="+66 XXX-XXXX"
                        className="bg-muted/50 border-border rounded-2xl h-14 font-black px-8 text-foreground focus:ring-primary/40 focus:bg-secondary/50 transition-all uppercase tracking-normal text-xl"
                      />
                    </div>
                    <div className="space-y-4">
                      <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('settings_pages.customers.dialog.email')}</Label>
                      <Input
                        value={formData.Email || ""}
                        onChange={(e) => updateForm("Email", e.target.value)}
                        placeholder="partner@logispro.matrix"
                        className="bg-muted/50 border-border rounded-2xl h-14 font-black px-8 text-foreground focus:ring-primary/40 focus:bg-secondary/50 transition-all uppercase tracking-normal text-xl"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('settings_pages.customers.dialog.address')}</Label>
                    <Textarea
                      value={formData.Address || ""}
                      onChange={(e) => updateForm("Address", e.target.value)}
                      placeholder="SPECIFY FULL OPERATIONAL COORDINATES..."
                      className="bg-muted/50 border-border rounded-[2rem] min-h-[140px] font-bold p-8 text-foreground focus:ring-primary/40 focus:bg-secondary/50 transition-all uppercase tracking-wide leading-relaxed text-xl placeholder:text-muted-foreground"
                    />
                  </div>

                    <div className="grid grid-cols-2 gap-10">
                      <div className="space-y-4">
                        <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('settings_pages.customers.dialog.customer_id') || 'Customer ID'}</Label>
                        <Input
                          value={formData.Customer_ID || ""}
                          onChange={(e) => updateForm("Customer_ID", e.target.value)}
                          placeholder="SYSTEM GENERATED"
                          className="bg-muted/50 border-border rounded-2xl h-14 font-black px-8 text-foreground focus:ring-primary/40 focus:bg-secondary/50 transition-all uppercase tracking-normal text-xl"
                          disabled={!!editingCustomer}
                        />
                      </div>
                       <div className="space-y-4">
                         <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('settings_pages.customers.dialog.branch')}</Label>
                         <Select 
                            value={formData.Branch_ID || ""} 
                            onValueChange={(val) => updateForm("Branch_ID", val)}
                         >
                            <SelectTrigger className="bg-muted/50 border-border rounded-2xl h-14 font-black px-8 text-foreground focus:ring-primary/40 focus:bg-secondary/50 transition-all uppercase tracking-normal text-xl">
                                <SelectValue placeholder="SELECT BRANCH..." />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border border-border shadow-2xl rounded-2xl">
                                {branches.map(b => (
                                    <SelectItem key={b.Branch_ID} value={b.Branch_ID} className="rounded-xl h-12 uppercase font-black">
                                        {b.Branch_Name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                         </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-10">
                      <div className="space-y-4">
                        <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('settings_pages.customers.dialog.tax_id')}</Label>
                        <Input
                          value={formData.Tax_ID || ""}
                          onChange={(e) => updateForm("Tax_ID", e.target.value)}
                          placeholder="13-DIGIT VERIFIER"
                          className="bg-muted/50 border-border rounded-2xl h-14 font-black px-8 text-foreground focus:ring-primary/40 focus:bg-secondary/50 transition-all uppercase tracking-normal text-xl"
                        />
                      </div>
                    </div>

                    {/* Stair Climb Sensor Toggle Feature */}
                    <div className="p-6 rounded-[2rem] border-2 border-primary/20 bg-primary/5 flex items-center justify-between shadow-lg">
                      <div className="space-y-1">
                        <Label className="text-lg font-black uppercase tracking-wide text-primary flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                          ระบบตรวจสอบเซนเซอร์ขึ้นตึกสูง (Incentive Sensor Check)
                        </Label>
                        <p className="text-sm text-muted-foreground font-bold italic leading-none opacity-80">
                          บังคับให้แอปพลิเคชันคนขับรันเซนเซอร์วัดความสูงและก้าวเดินอัตโนมัติเมื่อมาส่งสินค้าของลูกค้ารายนี้
                        </p>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="Incentive_Sensor_Check"
                          checked={!!formData.Incentive_Sensor_Check}
                          onChange={(e) => updateForm("Incentive_Sensor_Check", e.target.checked)}
                          className="w-8 h-8 rounded-lg border-border bg-muted text-primary focus:ring-primary/40 cursor-pointer accent-primary"
                        />
                      </div>
                    </div>

                  <div className="space-y-4">
                    <Label className="text-base font-bold font-black uppercase tracking-[0.1em] text-primary ml-2 flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        {t('settings_pages.customers.dialog.line_id')}
                    </Label>
                    <div className="glass-panel p-1 rounded-2xl border-primary/20 bg-primary/5">
                        <Input
                            value={formData.Line_User_ID || ""}
                            onChange={(e) => updateForm("Line_User_ID", e.target.value)}
                            placeholder="ENTER LINE U-VECTOR..."
                            className="bg-transparent border-none text-foreground font-black rounded-xl h-14 px-8 flex-1 focus:bg-primary/10 tracking-normal"
                        />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <Label className="text-base font-bold font-black uppercase tracking-[0.1em] text-accent ml-2 flex items-center gap-3">
                          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                          Credit Term (Days)
                      </Label>
                      <div className="glass-panel p-1 rounded-2xl border-accent/20 bg-accent/5">
                          <Input
                              type="number"
                              value={formData.Credit_Term ?? ""}
                              onChange={(e) => updateForm("Credit_Term", e.target.value === "" ? undefined : parseInt(e.target.value))}
                              placeholder="Enter Credit Term in Days..."
                              className="bg-transparent border-none text-foreground font-black rounded-xl h-14 px-8 flex-1 focus:bg-accent/10 tracking-normal"
                          />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label className="text-base font-bold font-black uppercase tracking-[0.1em] text-emerald-500 ml-2 flex items-center gap-3">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Price Per Unit (฿)
                      </Label>
                      <div className="glass-panel p-1 rounded-2xl border-emerald-500/20 bg-emerald-500/5">
                          <Input
                              type="number"
                              step="0.01"
                              value={formData.Price_Per_Unit ?? ""}
                              onChange={(e) => updateForm("Price_Per_Unit", e.target.value === "" ? undefined : parseFloat(e.target.value))}
                              placeholder="0.00"
                              className="bg-transparent border-none text-foreground font-black rounded-xl h-14 px-8 flex-1 focus:bg-emerald-500/10 tracking-normal"
                          />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="rates" className="animate-in fade-in slide-in-from-right-2 duration-500">
                    {editingCustomer && (
                        <CustomerFuelMatrix 
                            ref={fuelMatrixRef}
                            customerId={editingCustomer.Customer_ID} 
                            customerName={editingCustomer.Customer_Name} 
                        />
                    )}
                </TabsContent>
              </Tabs>
            </div>

            <DialogFooter className="p-6 sm:p-10 border-t border-border bg-muted/25 gap-4 sm:gap-6 flex-row shrink-0">
                <PremiumButton variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1 sm:flex-none h-14 sm:h-16 px-6 sm:px-10 rounded-[1.2rem] sm:rounded-[1.5rem] border-border text-muted-foreground hover:text-foreground uppercase tracking-normal text-base sm:text-lg font-bold font-black">{t('settings_pages.customers.dialog.abort')}</PremiumButton>
                <PremiumButton onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none h-14 sm:h-16 px-8 sm:px-12 rounded-[1.5rem] sm:rounded-[2rem] gap-3 sm:gap-4 shadow-[0_20px_50px_rgba(255,30,133,0.3)] sm:min-w-[200px] text-lg sm:text-xl tracking-normal bg-primary text-foreground border-0">
                    {saving ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <Save className="w-5 h-5 sm:w-6 sm:h-6" />}
                    {t('settings_pages.customers.dialog.execute')}
                </PremiumButton>
            </DialogFooter>
          </DialogContent>
      </Dialog>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 glass-panel rounded-[4rem] border-border group">
             <div className="relative">
                <Loader2 className="animate-spin text-primary opacity-40" size={80} strokeWidth={1} />
                <Activity className="absolute inset-0 m-auto text-primary animate-pulse" size={32} />
             </div>
             <p className="mt-10 text-muted-foreground font-black uppercase tracking-widest text-base font-bold animate-pulse">{t('settings_pages.customers.status.syncing')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {customers.map((customer) => (
            <div key={customer.Customer_ID} className="p-0 overflow-hidden group border border-border bg-background/40 backdrop-blur-2xl rounded-2xl shadow-lg relative hover:shadow-xl transition-all duration-700 hover:ring-1 hover:ring-primary/30">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-accent opacity-0 group-hover:opacity-100 transition-all duration-700" />
              <div className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-foreground font-bold group-hover:bg-primary transition-all duration-700 relative overflow-hidden shadow-lg">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-transparent" />
                      <Building2 size={20} className="relative z-10" strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-foreground tracking-tighter group-hover:text-primary transition-colors line-clamp-1 duration-500 uppercase italic font-display">{customer.Customer_Name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-muted-foreground font-black text-[10px] uppercase tracking-wide">{customer.Customer_ID}</span>
                          <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                          <span className="text-primary font-black text-[10px] uppercase tracking-wide italic opacity-70">{t('settings_pages.customers.status.strategic')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-all duration-700 translate-y-2 group-hover:translate-y-0 flex flex-col gap-2">
                    <button 
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted/50 border border-border text-muted-foreground hover:bg-primary hover:text-foreground transition-all shadow-md"
                        onClick={() => handleOpenDialog(customer)}
                    >
                        <Edit size={14} />
                    </button>
                    <button 
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted/50 border border-border text-rose-800 hover:bg-rose-500 hover:text-foreground transition-all shadow-md"
                        onClick={() => handleDelete(customer.Customer_ID)}
                    >
                        <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="space-y-4 mb-2">
                  <div className="p-4 bg-muted/30 rounded-xl border border-border group-hover:bg-muted/50 transition-all duration-700 flex items-center gap-4 relative overflow-hidden">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary shadow-inner ring-1 ring-primary/20">
                            <ShieldCheck size={14} strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wide mb-0.5">{t('settings_pages.customers.dialog.tax_id')}</p>
                            <p className="text-sm font-black text-foreground tracking-tight">{customer.Tax_ID || t('settings_pages.customers.status.unverified')}</p>
                        </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/30 rounded-xl border border-border group-hover:bg-muted/50 transition-all duration-700 relative overflow-hidden">
                        <div className="flex items-center gap-2 mb-1">
                            <Phone size={12} className="text-accent" />
                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-normal leading-none">{t('settings_pages.customers.dialog.phone')}</span>
                        </div>
                        <p className="text-[11px] font-black text-foreground truncate tracking-normal">{customer.Phone || t('settings_pages.customers.status.offline')}</p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-xl border border-border group-hover:bg-muted/50 transition-all duration-700 relative overflow-hidden">
                        <div className="flex items-center gap-2 mb-1">
                            <Zap size={12} className="text-accent" />
                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-normal leading-none">Credit Term</span>
                        </div>
                        <p className="text-[11px] font-black text-foreground truncate tracking-normal">{customer.Credit_Term || 30} Days</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* High-End Tactical Footer */}
              <div className="px-6 py-4 bg-muted/30 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Mail size={10} className="text-muted-foreground opacity-40" />
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-normal truncate max-w-[140px] italic">{customer.Email || "registry-pending@logispro.io"}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-primary/20 text-primary rounded-lg shadow-lg ring-1 ring-primary/30">
                    <span className="text-[9px] font-black tracking-normal">
                        {customer.Price_Per_Unit && customer.Price_Per_Unit > 0 ? `฿${customer.Price_Per_Unit}/UNIT` : t('settings_pages.customers.status.connected')}
                    </span>
                </div>
              </div>
            </div>
          ))}
          
          {/* Enhanced Empty State */}
          {customers.length === 0 && (
            <div className="col-span-full text-center py-24 glass-panel rounded-3xl border-dashed border-border group">
              <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20 group-hover:scale-110 transition-transform duration-1000" />
              <p className="text-muted-foreground font-black uppercase tracking-widest text-xs">{t('settings_pages.customers.status.empty')}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-20 text-center mb-24">
        <div className="inline-flex items-center gap-4 px-8 py-3 glass-panel rounded-full text-base font-bold font-black text-muted-foreground uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">
            <Activity size={14} className="text-primary" /> {t('settings_pages.customers.status.footer')}
        </div>
      </div>
    </DashboardLayout>
  )
}
