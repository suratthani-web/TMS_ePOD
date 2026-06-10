"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getExpenseTypes, addExpenseType, updateExpenseType, deleteExpenseType, ExpenseType } from "@/lib/supabase/master-data"
import {
  Coins,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  GripVertical,
  ArrowLeft,
  Activity,
  Target,
  ShieldAlert,
  Loader2,
  TrendingUp
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export default function ExpenseTypesPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newType, setNewType] = useState({ name: "", default_amount: 0 })
  const [showAddForm, setShowAddForm] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const data = await getExpenseTypes()
    setExpenseTypes(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleAdd = async () => {
    if (!newType.name.trim()) return
    await addExpenseType(newType.name, newType.default_amount)
    setNewType({ name: "", default_amount: 0 })
    setShowAddForm(false)
    toast.success(t('settings_pages.expense_types.toasts.deployed'))
    loadData()
  }

  const handleUpdate = async (id: string, updates: Partial<ExpenseType>) => {
    setExpenseTypes(prev => prev.map(et => et.id === id ? { ...et, ...updates } : et))
  }

  const saveUpdate = async (id: string) => {
    const item = expenseTypes.find(e => e.id === id)
    if (item) {
        await updateExpenseType(id, { name: item.name, default_amount: item.default_amount })
        toast.success(t('settings_pages.expense_types.toasts.synced'))
    }
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    if (confirm(t('settings_pages.expense_types.toasts.confirm_del'))) {
      await deleteExpenseType(id)
      toast.success(t('settings_pages.expense_types.toasts.purged'))
      loadData()
    }
  }

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    await updateExpenseType(id, { is_active: !currentStatus })
    loadData()
  }

  return (
    <DashboardLayout>
      <div className="space-y-12 pb-20 p-4 lg:p-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-card p-8 md:p-10 rounded-2xl border border-border shadow-sm relative overflow-hidden group">
            
            <div className="relative z-10 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all text-sm font-semibold group/back">
                    <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                    {t('settings_pages.company.command_control')}
                </button>
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
                        <Coins size={42} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-foreground leading-tight">
                            {t('settings_pages.expense_types.title')}
                        </h1>
                        <p className="text-base font-semibold text-muted-foreground mt-2">{t('settings_pages.expense_types.subtitle')}</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-4 relative z-10">
                <div className="bg-muted/50 border border-border px-4 py-2 rounded-xl flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-sm font-semibold text-muted-foreground">{t('settings_pages.expense_types.matrix_scan')}</span>
                </div>
                <PremiumButton onClick={() => setShowAddForm(true)} className="h-12 px-6 rounded-xl bg-primary text-primary-foreground border-0 shadow-sm gap-3 text-sm font-bold">
                    <Plus size={24} strokeWidth={3} />
                    {t('settings_pages.expense_types.enlist_new')}
                </PremiumButton>
            </div>
        </div>

        {/* Add expense type form */}
        {showAddForm && (
            <PremiumCard className="bg-card border border-primary/20 shadow-sm rounded-2xl overflow-hidden group/add animate-in fade-in slide-in-from-top-10 duration-500">
                <div className="p-10 border-b border-border bg-primary/5 flex items-center justify-between">
                    <h3 className="text-lg font-black text-foreground flex items-center gap-3">
                        <Plus size={20} className="text-primary" />
                        {t('settings_pages.expense_types.config_new')}
                    </h3>
                    <PremiumButton variant="outline" size="sm" onClick={() => setShowAddForm(false)} className="rounded-xl border-border text-muted-foreground hover:text-foreground">
                        <X size={20} />
                    </PremiumButton>
                </div>
                <div className="p-12">
                    <div className="grid grid-cols-12 gap-10 items-end">
                        <div className="col-span-12 md:col-span-6 space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.expense_types.res_designation')}</Label>
                            <Input
                                value={newType.name}
                                onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                                placeholder={t('settings_pages.expense_types.placeholder_name')}
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-semibold pl-5 shadow-inner"
                            />
                        </div>
                        <div className="col-span-12 md:col-span-4 space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.expense_types.default_yield')}</Label>
                            <div className="relative">
                                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-primary font-black italic">à¸¿</span>
                                <Input
                                    type="number"
                                    value={newType.default_amount}
                                    onChange={(e) => setNewType({ ...newType, default_amount: Number(e.target.value) })}
                                    className="h-14 pl-12 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-semibold shadow-inner text-lg"
                                />
                            </div>
                        </div>
                        <div className="col-span-12 md:col-span-2">
                            <PremiumButton onClick={handleAdd} className="w-full h-14 rounded-xl bg-primary text-primary-foreground font-bold shadow-sm border-0 gap-3">
                                <Save size={20} /> {t('settings_pages.expense_types.deploy')}
                            </PremiumButton>
                        </div>
                    </div>
                </div>
            </PremiumCard>
        )}

        {/* Expense type list */}
        <div className="grid grid-cols-1 gap-8">
            <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
                <div className="p-10 border-b border-border bg-muted/25 flex items-center justify-between">
                    <h3 className="text-lg font-black text-foreground flex items-center gap-3">
                        <Activity size={20} className="text-primary" />
                        {t('settings_pages.expense_types.registry')}
                    </h3>
                    <div className="px-4 py-1.5 rounded-xl bg-primary/10 text-sm font-semibold text-primary border border-primary/20">
                        {t('settings_pages.expense_types.scan_results').replace('{count}', expenseTypes.length.toString())}
                    </div>
                </div>
                <div className="p-4 md:p-10">
                    <div className="space-y-6">
                        {loading ? (
                            <div className="py-40 flex flex-col items-center justify-center opacity-30">
                                <Loader2 size={60} className="animate-spin text-primary mb-6" />
                                <span className="text-sm font-semibold text-foreground">{t('settings_pages.expense_types.syncing')}</span>
                            </div>
                        ) : (
                            expenseTypes.map((et) => (
                                <div 
                                    key={et.id} 
                                    className={cn(
                                        "p-6 rounded-2xl border transition-all duration-300 group/pref flex flex-col md:flex-row md:items-center gap-6 relative overflow-hidden",
                                        et.is_active ? "bg-muted/30 border-border hover:border-primary/30" : "bg-transparent border-border opacity-40 grayscale"
                                    )}
                                >
                                    <div className="flex items-center gap-6 shrink-0">
                                        <div className="p-3 text-muted-foreground cursor-move hover:text-primary transition-colors">
                                            <GripVertical size={24} />
                                        </div>
                                        <div className={cn(
                                            "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-sm border border-border",
                                            et.is_active ? "bg-muted/25" : "bg-muted/50"
                                        )}>
                                            <TrendingUp size={28} className={cn(et.is_active ? "text-primary" : "text-muted-foreground")} />
                                        </div>
                                    </div>

                                    <div className="flex-1 flex flex-col md:flex-row md:items-center gap-10">
                                        {editingId === et.id ? (
                                            <>
                                                <div className="flex-[2] space-y-2">
                                                    <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.expense_types.edit_name')}</Label>
                                                    <Input
                                                        value={et.name}
                                                        onChange={(e) => handleUpdate(et.id, { name: e.target.value })}
                                                        className="h-14 bg-muted/30 border-primary/30 rounded-xl text-foreground font-black italic pl-6"
                                                    />
                                                </div>
                                                <div className="flex-1 space-y-2">
                                                    <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.expense_types.edit_yield')}</Label>
                                                    <div className="relative">
                                                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-primary font-black italic">à¸¿</span>
                                                        <Input
                                                            type="number"
                                                            value={et.default_amount || 0}
                                                            onChange={(e) => handleUpdate(et.id, { default_amount: Number(e.target.value) })}
                                                            className="h-14 pl-12 bg-muted/30 border-primary/30 rounded-xl text-foreground font-black italic"
                                                        />
                                                    </div>
                                                </div>
                                                <PremiumButton size="sm" onClick={() => saveUpdate(et.id)} className="h-14 w-14 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-foreground transition-all">
                                                    <Save size={20} />
                                                </PremiumButton>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex-[2]">
                                                    <h3 className={cn(
                                                        "text-xl font-black group-hover/pref:text-primary transition-colors",
                                                        et.is_active ? "text-foreground" : "text-muted-foreground"
                                                    )}>
                                                        {et.name}
                                                    </h3>
                                                    <p className="text-sm font-medium text-muted-foreground mt-1 opacity-70">ID: {et.id.substring(0, 8)}...</p>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-semibold text-muted-foreground mb-1">{t('settings_pages.expense_types.base_yield')}</p>
                                                    <p className="text-2xl font-black text-foreground tracking-tight">
                                                        {et.default_amount ? `à¸¿${et.default_amount.toLocaleString()}` : 'à¸¿0.00'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <button
                                                        onClick={() => handleToggleActive(et.id, et.is_active)}
                                                        className={cn(
                                                            "px-4 py-2 rounded-xl text-sm font-semibold transition-all border shadow-sm",
                                                            et.is_active 
                                                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-emerald-500/5' 
                                                              : 'bg-muted/50 text-muted-foreground border-border'
                                                        )}
                                                    >
                                                        {et.is_active ? t('settings_pages.expense_types.enabled_node') : t('settings_pages.expense_types.offline_node')}
                                                    </button>
                                                    <PremiumButton 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        onClick={() => setEditingId(et.id)}
                                                        className="w-12 h-12 rounded-xl bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:bg-primary/20 hover:border-primary/30 transition-all"
                                                    >
                                                        <Edit size={18} />
                                                    </PremiumButton>
                                                    <PremiumButton 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        onClick={() => handleDelete(et.id)}
                                                        className="w-12 h-12 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-500/40 hover:text-foreground hover:bg-rose-500 transition-all"
                                                    >
                                                        <Trash2 size={18} />
                                                    </PremiumButton>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    {et.is_active && (
                                        <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-primary/[0.02] to-transparent pointer-events-none" />
                                    )}
                                </div>
                            ))
                        )}

                        {!loading && expenseTypes.length === 0 && (
                            <div className="py-40 text-center opacity-20">
                                <ShieldAlert size={80} className="mx-auto text-muted-foreground mb-8" />
                                <p className="text-xl font-black text-foreground">{t('settings_pages.expense_types.registry_depleted')}</p>
                                <p className="text-sm font-medium text-muted-foreground mt-4">{t('settings_pages.expense_types.init_protocols')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </PremiumCard>
        </div>

        {/* Advisory */}
        <div className="mt-12 p-8 rounded-2xl bg-primary/5 border border-primary/10 flex flex-col md:flex-row gap-8 items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
            <div className="p-4 rounded-2xl bg-primary/10 text-primary border border-primary/20">
                <Target size={32} />
            </div>
            <div className="space-y-4 text-center md:text-left flex-1">
                <p className="text-lg font-black text-primary">{t('settings_pages.expense_types.advisory')}</p>
                <p className="text-base font-medium text-muted-foreground leading-relaxed">
                    {t('settings_pages.expense_types.advisory_desc')}
                </p>
            </div>
            <PremiumButton variant="outline" className="h-12 px-6 rounded-xl border-border text-foreground gap-3 font-bold text-sm ml-auto">
                <Activity size={18} /> {t('settings_pages.expense_types.view_trends')}
            </PremiumButton>
        </div>
      </div>
    </DashboardLayout>
  )
}

