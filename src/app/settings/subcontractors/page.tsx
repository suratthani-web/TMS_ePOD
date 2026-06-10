"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { 
    Plus, 
    Edit, 
    Trash2, 
    Search, 
    Loader2, 
    Banknote,
    Briefcase,
    ShieldCheck,
    TrendingUp,
    Network,
    Zap,
    Activity,
    Globe,
    Save,
    FileSpreadsheet,
    ArrowLeft
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getAllSubcontractors } from "@/lib/supabase/subcontractors"
import { createSubcontractor, updateSubcontractor, deleteSubcontractor, createBulkSubcontractors } from "@/lib/actions/subcontractor-actions"
import { getSubcontractorPerformance, getOperationalStats } from "@/lib/supabase/analytics"
import { Subcontractor } from "@/types/subcontractor"
import { useBranch } from "@/components/providers/branch-provider"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { BANKS } from "@/lib/constants/banks"
import { ExcelImport } from "@/components/ui/excel-import"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function SubcontractorsPage() {
    const { selectedBranch, branches } = useBranch()
    const router = useRouter()
    const { t } = useLanguage()
    const [list, setList] = useState<Subcontractor[]>([])
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [stats, setStats] = useState<{
        performance: { name: string; count: number }[];
        ops: { fleet: { onTimeDelivery: number } }
    } | null>(null)

    // Form State
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formData, setFormData] = useState<Partial<Subcontractor>>({
        Sub_ID: "",
        Sub_Name: "",
        Tax_ID: "",
        Bank_Name: "",
        Bank_Account_No: "",
        Bank_Account_Name: "",
        Branch_ID: "",
        Active_Status: "Active"
    })

    const loadData = useCallback(async () => {
        setLoading(true)
        const [data, performance, ops] = await Promise.all([
            getAllSubcontractors(selectedBranch),
            getSubcontractorPerformance(undefined, undefined, selectedBranch),
            getOperationalStats(selectedBranch)
        ])
        setList(data)
        setStats({ performance, ops })
        setLoading(false)
    }, [selectedBranch])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleOpenDialog = (item?: Subcontractor) => {
        if (item) {
            setEditingId(item.Sub_ID)
            setFormData(item)
        } else {
            setEditingId(null)
            setFormData({
                Sub_ID: "",
                Sub_Name: "",
                Tax_ID: "",
                Bank_Name: "",
                Bank_Account_No: "",
                Bank_Account_Name: "",
                Branch_ID: selectedBranch === 'All' ? "" : selectedBranch,
                Active_Status: "Active"
            })
        }
        setIsDialogOpen(true)
    }

    const handleSave = async () => {
        if (!formData.Sub_ID || !formData.Sub_Name) {
            return toast.warning("กรุณากรอกรหัสและชื่อบริษัท")
        }
        
        setSaving(true)
        try {
            let res;
            if (editingId) {
                res = await updateSubcontractor(editingId, formData)
            } else {
                res = await createSubcontractor(formData)
            }

            if (res.success) {
                setIsDialogOpen(false)
                toast.success(editingId ? "แก้ไขข้อมูลเรียบร้อย" : "สร้างบริษัทเรียบร้อย")
                loadData()
            } else {
                toast.error("Error: " + res.error)
            }
        } catch (error: unknown) {
            toast.error("เกิดข้อผิดพลาด: " + (error as Error).message)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (!confirm("คุณต้องการลบข้อมูลนี้ใช่หรือไม่?")) return
        const res = await deleteSubcontractor(id)
        if (res.success) {
            toast.success("ลบข้อมูลเรียบร้อย")
            loadData()
        }
        else toast.error("Error: " + res.error)
    }

    const filtered = list.filter(i => 
        i.Sub_Name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.Sub_ID.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <DashboardLayout>
            {/* Tactical Partner Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 mb-16 bg-background/60 backdrop-blur-3xl p-12 rounded-[4rem] border border-border shadow-2xl relative group ring-1 ring-border/5 hover:ring-primary/20 transition-all duration-700">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none" />
                
                <div className="relative z-10 space-y-8">
                    <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.1em] text-base font-bold group/back italic">
                        <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                        ย้อนกลับ
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/20 rounded-xl shadow-lg">
                            <Network className="text-primary" size={20} />
                        </div>
                        <h2 className="text-base font-bold font-black text-primary uppercase tracking-tight">{t('settings_pages.subcontractors.subtitle')}</h2>
                    </div>
                    <h1 className="text-6xl font-black text-foreground tracking-tighter flex items-center gap-5 uppercase premium-text-gradient">
                        {t('settings_pages.subcontractors.title')}
                    </h1>
                    <p className="text-muted-foreground font-bold text-xl tracking-wide opacity-80 uppercase tracking-tight leading-relaxed">
                      {t('settings.items.partners_desc')}
                    </p>
                </div>

                <div className="flex flex-wrap gap-4 relative z-10">
                    <ExcelImport 
                        trigger={
                            <PremiumButton variant="outline" className="h-14 px-10 rounded-2xl border-white/20 bg-white/10 hover:bg-white/20 text-white font-black text-xl gap-3">
                                <FileSpreadsheet size={24} />
                                {t('common.tactical.bulk_import') || 'Import'}
                            </PremiumButton>
                        }
                        title={t('settings_pages.subcontractors.import_title') || 'Import Subcontractors'}
                        onImport={createBulkSubcontractors}
                        templateData={[{
                            Sub_ID: "SUB-001",
                            Sub_Name: "บริษัท ขนส่ง จำกัด",
                            Tax_ID: "1234567890123",
                            Bank_Name: "K-Bank",
                            Bank_Account_No: "123-4-56789-0",
                            Bank_Account_Name: "บริษัท ขนส่ง จำกัด",
                            Branch_ID: "HQ"
                        }]}
                        templateFilename="logispro_subcontractors_template.xlsx"
                    />
                    <PremiumButton onClick={() => handleOpenDialog()} className="h-14 px-10 rounded-2xl shadow-xl shadow-primary/20">
                        <Plus size={24} className="mr-3" strokeWidth={3} />
                        {t('settings_pages.subcontractors.add_partner')}
                    </PremiumButton>
                </div>
            </div>

            {/* Partner Analytics Matrix */}
            {!loading && stats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                     <div className="p-8 rounded-[3rem] border border-primary/20 backdrop-blur-3xl shadow-2xl relative overflow-hidden group transition-all hover:scale-[1.03] bg-background/40">
                        <div className="flex items-center justify-between mb-8">
                            <div className="p-4 rounded-2xl shadow-xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-6 bg-primary/20 text-primary">
                                <Briefcase size={24} strokeWidth={2.5} />
                            </div>
                            <div className="px-3 py-1 bg-muted/50 rounded-full border border-border text-base font-bold text-primary font-black uppercase tracking-wide italic animate-pulse">GRID SCALE</div>
                        </div>
                        <p className="text-muted-foreground font-black text-base font-bold uppercase tracking-tight mb-2">{t('settings_pages.subcontractors.stats.total_partners')}</p>
                        <p className="text-4xl font-black text-foreground tracking-tighter leading-none">{list.length}</p>
                    </div>

                    <div className="p-8 rounded-[3rem] border border-accent/20 backdrop-blur-3xl shadow-2xl relative overflow-hidden group transition-all hover:scale-[1.03] bg-background/40">
                        <div className="flex items-center justify-between mb-8">
                            <div className="p-4 rounded-2xl shadow-xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-6 bg-accent/20 text-accent">
                                <TrendingUp size={24} strokeWidth={2.5} />
                            </div>
                            <div className="px-3 py-1 bg-muted/50 rounded-full border border-border text-base font-bold text-accent font-black uppercase tracking-tight italic">MARKET SHARE</div>
                        </div>
                        <p className="text-muted-foreground font-black text-base font-bold uppercase tracking-tight mb-2">{t('settings_pages.subcontractors.stats.network_missions')}</p>
                        <p className="text-4xl font-black text-foreground tracking-tighter leading-none">
                            {stats.performance.find((p: { name: string }) => p.name.includes('Sub'))?.count || 0} <span className="text-xl text-muted-foreground font-bold opacity-40 ml-1">NODES</span>
                        </p>
                    </div>

                    <div className="p-8 rounded-[3rem] border border-primary/10 backdrop-blur-3xl shadow-2xl relative overflow-hidden group transition-all hover:scale-[1.03] bg-background/40">
                        <div className="flex items-center justify-between mb-8">
                            <div className="p-4 rounded-2xl shadow-xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-6 bg-primary/10 text-primary">
                                <ShieldCheck size={24} strokeWidth={2.5} />
                            </div>
                            <div className="px-3 py-1 bg-muted/50 rounded-full border border-border text-base font-bold text-muted-foreground font-black uppercase tracking-tight italic">RELIABILITY</div>
                        </div>
                        <p className="text-muted-foreground font-black text-base font-bold uppercase tracking-tight mb-2">{t('settings_pages.subcontractors.stats.on_time')}</p>
                        <p className="text-4xl font-black text-foreground tracking-tighter leading-none">{stats.ops.fleet.onTimeDelivery.toFixed(1)}%</p>
                    </div>
                </div>
            )}

            {/* Tactical Search Interface */}
            <div className="mb-12 relative group max-w-2xl">
                <div className="absolute inset-x-0 bottom-0 h-1 bg-primary blur-3xl opacity-20 pointer-events-none" />
                <div className="relative glass-panel rounded-3xl p-1 border-border">
                    <div className="flex items-center gap-4 px-6">
                        <Search className="text-primary opacity-50" size={24} />
                        <Input
                            placeholder={t('settings_pages.subcontractors.search_placeholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-transparent border-none text-2xl font-black text-foreground px-4 h-20 placeholder:text-muted-foreground tracking-tighter uppercase focus-visible:ring-0"
                        />
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-[4rem] border-border shadow-2xl overflow-hidden bg-background/20 relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
                <div className="relative w-full overflow-auto custom-scrollbar">
                    <table className="w-full text-xl text-left border-collapse">
                        <thead>
                            <tr className="bg-muted/30 border-b border-border">
                                <th className="px-12 py-10 text-[12px] font-black uppercase tracking-tight text-muted-foreground">{t('settings_pages.subcontractors.table.identity')}</th>
                                <th className="px-8 py-10 text-[12px] font-black uppercase tracking-tight text-muted-foreground">{t('settings_pages.subcontractors.table.intelligence')}</th>
                                <th className="px-8 py-10 text-[12px] font-black uppercase tracking-tight text-muted-foreground">{t('settings_pages.subcontractors.table.financial')}</th>
                                <th className="px-8 py-10 text-[12px] font-black uppercase tracking-tight text-muted-foreground">{t('settings_pages.subcontractors.table.status')}</th>
                                <th className="px-12 py-10 text-[12px] font-black uppercase tracking-tight text-muted-foreground text-right">{t('settings_pages.subcontractors.table.command')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-40">
                                        <div className="relative inline-block">
                                            <Loader2 className="w-16 h-16 text-primary animate-spin opacity-20" strokeWidth={1} />
                                            <Activity className="absolute inset-0 m-auto text-primary animate-pulse" size={24} />
                                        </div>
                                        <p className="mt-8 text-muted-foreground font-black uppercase tracking-wide text-base font-bold">Syncing Partner Registry...</p>
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-40 text-muted-foreground font-black uppercase tracking-widest text-lg font-bold">
                                        No partner nodes detected in the sector
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((item) => (
                                    <tr key={item.Sub_ID} className="group/row hover:bg-primary/[0.03] transition-all duration-500">
                                        <td className="px-12 py-8">
                                            <div className="flex items-center gap-6">
                                                <div className="w-14 h-14 rounded-2xl bg-muted/50 border border-border flex items-center justify-center text-primary group-hover/row:bg-primary group-hover/row:text-foreground transition-all duration-500 shadow-xl group-hover/row:shadow-[0_0_30px_rgba(255,30,133,0.3)] group-hover/row:-rotate-3">
                                                    <Briefcase size={22} strokeWidth={2.5} />
                                                </div>
                                                <div>
                                                    <span className="font-black text-foreground text-xl tracking-tighter group-hover/row:text-primary transition-colors font-display uppercase">{item.Sub_ID}</span>
                                                    <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-tight mt-1 italic">Registry Node</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-8">
                                            <div>
                                                <div className="font-black text-foreground text-xl tracking-tight group-hover/row:text-primary transition-colors uppercase">{item.Sub_Name}</div>
                                                <div className="flex items-center gap-2 mt-2 text-base font-bold font-black text-muted-foreground uppercase tracking-tight">
                                                    <ShieldCheck size={12} className="text-primary/60" />
                                                    Tax: {item.Tax_ID || "ENLISTING..."}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-8">
                                            {item.Bank_Account_No ? (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-1.5 bg-muted/50 rounded-lg">
                                                            <Banknote size={14} className="text-accent" />
                                                        </div>
                                                        <span className="text-lg font-bold font-black text-muted-foreground uppercase tracking-normal">{item.Bank_Name}</span>
                                                    </div>
                                                    <span className="text-base font-bold font-black text-muted-foreground tracking-tight ml-10">**** **** {item.Bank_Account_No.slice(-4)}</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 text-muted-foreground italic">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                                                    <span className="text-base font-bold font-black uppercase tracking-tight">Vector Pending</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-8 py-8">
                                            <div className={cn(
                                                "inline-flex items-center gap-2.5 px-5 py-2.5 rounded-[1.5rem] text-base font-bold font-black uppercase tracking-normal border shadow-xl transition-all duration-500 group-hover/row:scale-105",
                                                item.Active_Status === 'Active' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                            )}>
                                                <span className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_10px_currentColor]", item.Active_Status === 'Active' ? "bg-current animate-pulse" : "bg-rose-500")} />
                                                {item.Active_Status}
                                            </div>
                                        </td>
                                        <td className="px-12 py-8 text-right">
                                            <div className="flex justify-end gap-3 opacity-0 group-hover/row:opacity-100 transition-all duration-500 translate-x-4 group-hover/row:translate-x-0">
                                                <button onClick={() => handleOpenDialog(item)} className="h-11 w-11 flex items-center justify-center rounded-xl bg-muted/50 border border-border text-muted-foreground hover:bg-primary hover:text-foreground transition-all shadow-xl">
                                                    <Edit size={16} />
                                                </button>
                                                <button onClick={() => handleDelete(item.Sub_ID)} className="h-11 w-11 flex items-center justify-center rounded-xl bg-muted/50 border border-border text-rose-800 hover:bg-rose-500 hover:text-foreground transition-all shadow-xl">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="p-8 border-t border-border bg-muted/30 flex items-center justify-between">
                    <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-tight">Sub-Contractor Financial Matrix Node</p>
                    <Zap size={16} className="text-primary/20" />
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="bg-background border border-border text-foreground max-w-3xl max-h-[85vh] shadow-[0_50px_100px_rgba(0,0,0,0.5)] rounded-[3rem] sm:rounded-[4rem] p-0 overflow-hidden ring-1 ring-white/10 flex flex-col">
                    <div className="bg-card p-6 sm:p-10 text-foreground relative overflow-hidden border-b border-border shrink-0">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
                        <DialogHeader>
                            <DialogTitle className="text-5xl font-black tracking-tighter flex items-center gap-6 uppercase premium-text-gradient">
                                <div className="p-3 bg-primary/20 rounded-2xl shadow-xl ring-1 ring-primary/30">
                                    <Globe size={32} className="text-primary" strokeWidth={2.5} />
                                </div>
                                {editingId ? t('settings_pages.subcontractors.dialog.title_edit') : t('settings_pages.subcontractors.dialog.title_add')}
                            </DialogTitle>
                        </DialogHeader>
                    </div>
                    
                    <div className="p-6 sm:p-10 space-y-6 custom-scrollbar flex-1 min-h-0 overflow-y-auto">
                        <div className="grid grid-cols-2 gap-10">
                            <div className="space-y-4">
                                <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('settings_pages.subcontractors.dialog.alias_id')}</Label>
                                <Input 
                                    value={formData.Sub_ID} 
                                    onChange={e => setFormData({...formData, Sub_ID: e.target.value})} 
                                    disabled={!!editingId}
                                    placeholder="E.G. SUB-001"
                                    className="h-14 bg-muted/50 border-border text-foreground font-black rounded-2xl px-8 text-xl uppercase tracking-normal focus:bg-muted/80 transition-all"
                                />
                            </div>
                            <div className="space-y-4">
                                <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('settings_pages.subcontractors.dialog.tax_id')}</Label>
                                <Input 
                                    value={formData.Tax_ID || ""} 
                                    onChange={e => setFormData({...formData, Tax_ID: e.target.value})} 
                                    placeholder="13-DIGIT VERIFIER"
                                    className="h-14 bg-muted/50 border-border text-foreground font-black rounded-2xl px-8 text-xl uppercase tracking-normal focus:bg-muted/80 transition-all font-display"
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('settings_pages.subcontractors.dialog.corporate_name')}</Label>
                            <div className="glass-panel p-1 rounded-2xl border-border">
                                <Input 
                                    value={formData.Sub_Name} 
                                    onChange={e => setFormData({...formData, Sub_Name: e.target.value})} 
                                    placeholder="ENTER FULL PARTNER NOMENCLATURE..."
                                    className="bg-transparent border-none text-2xl font-black text-foreground h-16 px-8 uppercase tracking-tighter"
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('settings_pages.subcontractors.dialog.branch')}</Label>
                            <Select 
                                value={formData.Branch_ID || ""} 
                                onValueChange={(v: string) => setFormData({...formData, Branch_ID: v})}
                            >
                                <SelectTrigger className="h-14 bg-muted/50 border-border text-foreground font-black rounded-2xl px-8 text-xl uppercase tracking-normal">
                                    <SelectValue placeholder="SELECT OPERATIONAL BRANCH" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground font-black">
                                    {branches.map(b => (
                                        <SelectItem key={b.Branch_ID} value={b.Branch_ID} className="hover:bg-primary/20 focus:bg-primary/20 uppercase tracking-normal text-base font-bold">
                                            {b.Branch_Name} ({b.Branch_ID})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="p-6 sm:p-10 rounded-[2.5rem] bg-accent/5 border border-accent/10 space-y-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 blur-[80px] pointer-events-none" />
                            <h3 className="text-base font-bold font-black uppercase tracking-widest text-accent flex items-center gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(168,85,247,1)]" />
                                {t('settings_pages.subcontractors.dialog.financial_header')}
                            </h3>
                            
                            <div className="space-y-4">
                                <Label className="text-base font-bold font-black text-muted-foreground uppercase tracking-tight ml-2">{t('settings_pages.subcontractors.dialog.bank_name')}</Label>
                                <Select 
                                    value={formData.Bank_Name || ""} 
                                    onValueChange={(v: string) => setFormData({...formData, Bank_Name: v})}
                                >
                                    <SelectTrigger className="h-14 bg-muted/50 border-border text-foreground font-black rounded-xl px-6 text-lg font-bold uppercase tracking-normal">
                                        <SelectValue placeholder="SELECT BANK ENTITY" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border-border text-foreground font-black">
                                        {BANKS.map(b => (
                                            <SelectItem key={b.value} value={b.value} className="hover:bg-accent/20 focus:bg-accent/20 uppercase tracking-normal text-base font-bold">
                                                {b.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-10">
                                <div className="space-y-4">
                                    <Label className="text-base font-bold font-black text-muted-foreground uppercase tracking-tight ml-2">{t('settings_pages.subcontractors.dialog.bank_account')}</Label>
                                    <Input 
                                        value={formData.Bank_Account_No || ""} 
                                        onChange={e => setFormData({...formData, Bank_Account_No: e.target.value})} 
                                        placeholder="000-000-0000"
                                        className="h-14 bg-muted/50 border-border text-foreground font-black rounded-xl px-6 text-lg font-bold tracking-normal"
                                    />
                                </div>
                                <div className="space-y-4">
                                    <Label className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.1em] ml-2">{t('settings_pages.subcontractors.dialog.bank_holder')}</Label>
                                    <Input 
                                        value={formData.Bank_Account_Name || ""} 
                                        onChange={e => setFormData({...formData, Bank_Account_Name: e.target.value})} 
                                        placeholder="ACCOUNT HOLDER ALIAS"
                                        className="h-14 bg-muted/50 border-border text-foreground font-black rounded-xl px-6 text-lg font-bold uppercase tracking-normal"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-6 sm:p-10 border-t border-border bg-muted/25 gap-4 sm:gap-6 flex-row shrink-0">
                        <PremiumButton variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1 sm:flex-none h-14 sm:h-16 px-6 sm:px-10 rounded-[1.2rem] sm:rounded-[1.5rem] border-border text-muted-foreground hover:text-foreground uppercase tracking-normal text-base sm:text-lg font-bold font-black">{t('settings_pages.subcontractors.dialog.abort')}</PremiumButton>
                        <PremiumButton onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none h-14 sm:h-16 px-8 sm:px-12 rounded-[1.5rem] sm:rounded-[2rem] gap-3 sm:gap-4 shadow-[0_20px_50px_rgba(255,30,133,0.3)] sm:min-w-[200px] text-lg sm:text-xl tracking-normal bg-primary text-foreground border-0">
                            {saving ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <Save className="w-5 h-5 sm:w-6 sm:h-6" />}
                            {t('settings_pages.subcontractors.dialog.execute')}
                        </PremiumButton>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="mt-20 text-center mb-24">
                <div className="inline-flex items-center gap-4 px-8 py-3 glass-panel rounded-full text-base font-bold font-black text-muted-foreground uppercase tracking-tight opacity-40 hover:opacity-100 transition-opacity">
                    <ShieldCheck size={14} className="text-primary" /> Integrated Logistic Network v7.2 • Advanced Partner Security
                </div>
            </div>
        </DashboardLayout>
    )
}
