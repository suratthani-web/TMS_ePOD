"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
    Plus, 
    Edit, 
    Trash2, 
    Loader2, 
    ArrowLeft, 
    Truck, 
    Activity, 
    Zap, 
    Target,
    Settings2,
    Database,
    Save,
    FileSpreadsheet
} from "lucide-react"
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle 
} from "@/components/ui/dialog"
import { getVehicleTypes, createVehicleType, updateVehicleType, deleteVehicleType, VehicleType, createBulkVehicleTypes } from "@/lib/actions/vehicle-type-actions"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"
import { ExcelImport } from "@/components/ui/excel-import"

export default function VehicleTypesPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [types, setTypes] = useState<VehicleType[]>([])
  const [loading, setLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [currentType, setCurrentType] = useState<VehicleType | null>(null)
  
  // Form State
  const [formData, setFormData] = useState({
    type_name: '',
    description: '',
    active_status: 'Active'
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch Data
  const fetchTypes = useCallback(async () => {
    setLoading(true)
    const data = await getVehicleTypes()
    setTypes(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTypes()
  }, [fetchTypes])

  // Handlers
  const handleOpenCreate = () => {
    setCurrentType(null)
    setFormData({ type_name: '', description: '', active_status: 'Active' })
    setIsDialogOpen(true)
  }

  const handleOpenEdit = (type: VehicleType) => {
    setCurrentType(type)
    setFormData({
      type_name: type.type_name,
      description: type.description || '',
      active_status: type.active_status
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.type_name.trim()) return toast.warning(t('settings_pages.vehicle_types.toasts.required'))
    
    setIsSubmitting(true)
    try {
      if (currentType) {
        const res = await updateVehicleType(currentType.type_id, formData)
        if (res.success) {
          toast.success(t('settings_pages.vehicle_types.toasts.sync_success'))
          setIsDialogOpen(false)
          fetchTypes()
        } else {
            toast.error(t('settings_pages.vehicle_types.toasts.handshake_failed') + res.message)
        }
      } else {
        const res = await createVehicleType(formData)
        if (res.success) {
            toast.success(t('settings_pages.vehicle_types.toasts.deploy_success'))
            setIsDialogOpen(false)
            fetchTypes()
        } else {
            toast.error(t('settings_pages.vehicle_types.toasts.handshake_failed') + res.message)
        }
      }
    } catch {
        toast.error(t('settings_pages.vehicle_types.toasts.transmission_error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t('settings_pages.vehicle_types.toasts.confirm_delete'))) return

    const res = await deleteVehicleType(id)
    if (res.success) {
        toast.success(t('settings_pages.vehicle_types.toasts.delete_success'))
        fetchTypes()
    } else {
        toast.error(t('settings_pages.vehicle_types.toasts.handshake_failed') + res.message)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-12 pb-20 p-4 lg:p-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-card p-8 md:p-10 rounded-2xl border border-border shadow-sm relative overflow-hidden group">
            <div className="relative z-10 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all text-sm font-semibold group/back">
                    <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                    {t('settings_pages.vehicle_types.ui.command_control')}
                </button>
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
                        <Truck size={42} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-foreground leading-tight">
                            {t('settings_pages.vehicle_types.title')}
                        </h1>
                        <p className="text-base font-semibold text-muted-foreground mt-2">{t('settings_pages.vehicle_types.subtitle')}</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-4 relative z-10">
                <div className="bg-muted/50 border border-border px-4 py-2 rounded-xl flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-sm font-semibold text-muted-foreground">{t('common.tactical.system_ready')}</span>
                </div>
                <div className="flex gap-4">
                    <ExcelImport 
                        trigger={
                            <PremiumButton variant="outline" className="h-12 px-5 rounded-xl border-border bg-background hover:bg-muted text-foreground font-bold text-sm gap-3">
                                <FileSpreadsheet size={24} strokeWidth={3} />
                                {t('common.tactical.bulk_import') || 'Import'}
                            </PremiumButton>
                        }
                        title={t('settings_pages.vehicle_types.import_title') || 'Import Vehicle Types'}
                        onImport={createBulkVehicleTypes}
                        templateData={[{
                            type_name: "4-Wheel",
                            description: "4-Wheel Truck (1.5 Ton)",
                            active_status: "Active"
                        }]}
                        templateFilename="logispro_vehicle_types_template.xlsx"
                    />
                    <PremiumButton onClick={handleOpenCreate} className="h-12 px-6 rounded-xl bg-primary text-primary-foreground border-0 shadow-sm gap-3 text-sm font-bold">
                        <Plus size={24} strokeWidth={3} />
                        {t('settings_pages.vehicle_types.add_type')}
                    </PremiumButton>
                </div>
            </div>
        </div>

        {/* Vehicle type table */}
        <div className="grid grid-cols-1 gap-8">
            <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
                <div className="p-10 border-b border-border bg-muted/25 flex items-center justify-between">
                    <h3 className="text-lg font-black text-foreground flex items-center gap-3">
                        <Database size={20} className="text-primary" />
                        {t('settings_pages.vehicle_types.specification_nodes')}
                    </h3>
                    <div className="px-4 py-1.5 rounded-xl bg-primary/10 text-sm font-semibold text-primary border border-primary/20">
                        {t('settings_pages.vehicle_types.total_classes')}: {types.length}
                    </div>
                </div>

                <div className="relative overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-muted/30 border-b border-border">
                                <th className="px-12 py-6 text-xs font-semibold text-muted-foreground">{t('settings_pages.vehicle_types.table.designation')}</th>
                                <th className="px-8 py-6 text-xs font-semibold text-muted-foreground">{t('settings_pages.vehicle_types.table.parameters')}</th>
                                <th className="px-8 py-6 text-xs font-semibold text-muted-foreground">{t('settings_pages.vehicle_types.table.status')}</th>
                                <th className="px-12 py-6 text-xs font-semibold text-muted-foreground text-right">{t('settings_pages.vehicle_types.table.command')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="text-center py-40">
                                        <div className="relative inline-block">
                                            <Loader2 className="w-16 h-16 text-primary animate-spin opacity-20" strokeWidth={1} />
                                            <Activity className="absolute inset-0 m-auto text-primary animate-pulse" size={24} />
                                        </div>
                                        <p className="mt-8 text-muted-foreground font-semibold text-sm">{t('settings_pages.vehicle_types.loading')}</p>
                                    </td>
                                </tr>
                            ) : types.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="text-center py-40 text-muted-foreground font-semibold text-base">
                                        {t('settings_pages.vehicle_types.empty')}
                                    </td>
                                </tr>
                            ) : (
                                types.map((type) => (
                                    <tr key={type.type_id} className="group/row hover:bg-muted/40 transition-colors">
                                        <td className="px-12 py-8">
                                            <div className="flex items-center gap-6">
                                                <div className="w-12 h-12 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-primary group-hover/row:bg-primary/10 transition-colors">
                                                    <Truck size={22} strokeWidth={2.5} />
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-foreground text-base group-hover/row:text-primary transition-colors">{type.type_name}</span>
                                                    <p className="text-sm font-medium text-muted-foreground mt-1">ID: {type.type_id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-8 py-8">
                                            <div className="max-w-xs">
                                                <p className="text-muted-foreground font-medium text-sm leading-relaxed">
                                                    {type.description || t('common.tactical.no_intel')}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="px-8 py-8">
                                            <div className={cn(
                                                "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors",
                                                type.active_status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                            )}>
                                                <span className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_10px_currentColor]", type.active_status === 'Active' ? "bg-current animate-pulse" : "bg-rose-500")} />
                                                {type.active_status === 'Active' ? t('common.tactical.active') : t('common.tactical.inactive')}
                                            </div>
                                        </td>
                                        <td className="px-12 py-8 text-right">
                                            <div className="flex justify-end gap-3 opacity-100 md:opacity-0 group-hover/row:opacity-100 transition-opacity">
                                                <button onClick={() => handleOpenEdit(type)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors">
                                                    <Edit size={16} />
                                                </button>
                                                <button onClick={() => handleDelete(type.type_id)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-muted/50 border border-border text-rose-600 hover:bg-rose-500 hover:text-white transition-colors">
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
                    <p className="text-sm font-medium text-muted-foreground">{t('common.tactical.fleet_spec_node')}</p>
                    <Zap size={16} className="text-primary/20" />
                </div>
            </PremiumCard>
        </div>

        {/* Global Advisory */}
        <div className="mt-12 p-8 rounded-2xl bg-primary/5 border border-primary/10 flex flex-col md:flex-row gap-6 items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
            <div className="p-4 rounded-2xl bg-primary/10 text-primary border border-primary/20">
                <Target size={32} />
            </div>
            <div className="space-y-4 text-center md:text-left flex-1">
                <p className="text-lg font-semibold text-primary">{t('settings_pages.vehicle_types.ui.advisory_title')}</p>
                <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                    {t('settings_pages.vehicle_types.ui.advisory_desc')}
                </p>
            </div>
            <PremiumButton variant="outline" className="h-12 px-6 rounded-xl border-border text-foreground gap-3 font-bold text-sm ml-auto">
                <Activity size={18} /> {t('settings_pages.vehicle_types.ui.view_capacity')}
            </PremiumButton>
        </div>

        {/* Vehicle type dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="bg-background border border-border text-foreground max-w-xl shadow-lg rounded-2xl p-0 overflow-hidden">
                <div className="bg-card p-8 text-foreground relative overflow-hidden border-b border-border">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-semibold flex items-center gap-4">
                            <div className="p-2.5 bg-primary/10 rounded-xl ring-1 ring-primary/20">
                                <Settings2 size={24} className="text-primary" strokeWidth={2.5} />
                            </div>
                            {currentType ? t('settings_pages.vehicle_types.dialog.title_edit') : t('settings_pages.vehicle_types.dialog.title_add')}
                        </DialogTitle>
                    </DialogHeader>
                </div>
                
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="space-y-4">
                        <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.vehicle_types.dialog.name')} *</Label>
                        <Input 
                            value={formData.type_name}
                            onChange={(e) => setFormData({...formData, type_name: e.target.value})}
                            placeholder={t('settings_pages.vehicle_types.ui.name_placeholder')}
                            className="h-12 bg-muted/50 border-border text-foreground font-medium rounded-xl px-4 text-base focus:bg-muted/80 transition-all"
                            required
                        />
                    </div>
                    <div className="space-y-4">
                        <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.vehicle_types.dialog.desc')}</Label>
                        <Input 
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            placeholder={t('settings_pages.vehicle_types.ui.desc_placeholder')}
                            className="h-12 bg-muted/50 border-border text-foreground font-medium rounded-xl px-4 text-base focus:bg-muted/80 transition-all"
                        />
                    </div>
                    
                    {currentType && (
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.vehicle_types.ui.registry_status')}</Label>
                            <select 
                                value={formData.active_status}
                                onChange={(e) => setFormData({...formData, active_status: e.target.value})}
                                className="w-full h-12 bg-muted/50 border border-border rounded-xl px-4 text-base font-medium text-foreground focus:border-primary/50 transition-all outline-none"
                            >
                                <option value="Active" className="bg-card">{t('settings_pages.vehicle_types.ui.active_node')}</option>
                                <option value="Inactive" className="bg-card">{t('settings_pages.vehicle_types.ui.offline_node')}</option>
                            </select>
                        </div>
                    )}

                    <div className="flex gap-3 pt-6 border-t border-border mt-8 mb-2">
                        <PremiumButton type="submit" disabled={isSubmitting} className="flex-[2] bg-primary hover:bg-primary/80 shadow-primary/20 h-12 rounded-xl text-sm font-semibold">
                            {isSubmitting ? <Loader2 className="w-6 h-6 mr-4 animate-spin" /> : <Save className="w-6 h-6 mr-4" strokeWidth={3} />}
                            {t('settings_pages.vehicle_types.ui.finalize')}
                        </PremiumButton>
                        <PremiumButton type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1 border-border h-12 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all font-semibold">
                            {t('settings_pages.vehicle_types.ui.abort')}
                        </PremiumButton>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}

