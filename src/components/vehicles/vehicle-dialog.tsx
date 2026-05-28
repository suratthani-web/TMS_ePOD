"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createVehicle, updateVehicle } from "@/app/vehicles/actions"
import { getVehicleTypes, VehicleType } from "@/lib/actions/vehicle-type-actions"
import { useLanguage } from "@/components/providers/language-provider"
import { Car, Shield, Calendar, Scale, Box, Save, Loader2 } from "lucide-react"
import { Vehicle } from "@/lib/supabase/vehicles"
import { Branch } from "@/lib/supabase/branches"
import { Subcontractor } from "@/types/subcontractor"

type VehicleDialogProps = {
  mode?: 'create' | 'edit'
  vehicle?: Partial<Vehicle>
  branches?: Branch[]
  subcontractors?: Subcontractor[]
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSuccess?: () => void
}

export function VehicleDialog({
  mode = 'create',
  vehicle,
  branches = [],
  subcontractors = [],
  trigger,
  open,
  onOpenChange,
  onSuccess
}: VehicleDialogProps) {
  const router = useRouter()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [internalOpen, setInternalOpen] = useState(false)
  
  const isControlled = open !== undefined
  const show = isControlled ? open : internalOpen
  const setShow = isControlled ? onOpenChange! : setInternalOpen

  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([])

  useEffect(() => {
    const fetchTypes = async () => {
        const types = await getVehicleTypes()
        setVehicleTypes(types)
    }
    fetchTypes()
  }, [])

  const [formData, setFormData] = useState({
    Vehicle_Plate: vehicle?.Vehicle_Plate || '',
    Vehicle_Type: vehicle?.Vehicle_Type || '4-Wheel',
    Brand: vehicle?.Brand || '',
    Model: vehicle?.Model || '',
    Active_Status: vehicle?.Active_Status || 'Active',
    Current_Mileage: vehicle?.Current_Mileage || '',
    Next_Service_Mileage: vehicle?.Next_Service_Mileage || '',
    Branch_ID: vehicle?.Branch_ID || '',
    Sub_ID: vehicle?.Sub_ID || '',
    Max_Weight_kg: vehicle?.Max_Weight_kg || '',
    Max_Volume_cbm: vehicle?.Max_Volume_cbm || '',
    Tax_Expiry: vehicle?.Tax_Expiry || '',
    Insurance_Expiry: vehicle?.Insurance_Expiry || '',
    Act_Expiry: vehicle?.Act_Expiry || ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      let result;
      const cleanPayload = {
        ...formData,
        Current_Mileage: formData.Current_Mileage === '' ? undefined : Number(formData.Current_Mileage),
        Next_Service_Mileage: formData.Next_Service_Mileage === '' ? undefined : Number(formData.Next_Service_Mileage),
        Max_Weight_kg: formData.Max_Weight_kg === '' ? undefined : Number(formData.Max_Weight_kg),
        Max_Volume_cbm: formData.Max_Volume_cbm === '' ? undefined : Number(formData.Max_Volume_cbm),
      }

      if (mode === 'create') {
        result = await createVehicle(cleanPayload)
      } else {
        if (!vehicle?.Vehicle_Plate) throw new Error("Vehicle Plate not found")
        result = await updateVehicle(vehicle.Vehicle_Plate, cleanPayload)
      }

      if (result.success) {
        toast.success(result.message || (mode === 'create' ? t('common.toast.success_save') : t('common.toast.success_edit')))
        setShow(false)
        if (!isControlled) {
          setFormData({
              Vehicle_Plate: '',
              Vehicle_Type: '4-Wheel',
              Brand: '',
              Model: '',
              Active_Status: 'Active',
              Current_Mileage: 0,
              Next_Service_Mileage: 0,
              Branch_ID: '',
              Sub_ID: '',
              Max_Weight_kg: 0,
              Max_Volume_cbm: 0,
              Tax_Expiry: '',
              Insurance_Expiry: '',
              Act_Expiry: ''
          })
        }
        if (onSuccess) onSuccess()
        router.refresh()
      } else {
        toast.error(result.message || t('common.error'))
      }
    } catch (err: unknown) {
      const error = err as Error
      toast.error(error.message || t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={show} onOpenChange={setShow}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-[95vw] sm:max-w-xl max-h-[95vh] flex flex-col bg-card/95 backdrop-blur-2xl border-border/5 text-foreground p-0 rounded-[2.5rem] overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.5)]">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-purple-500" />
        
        <DialogHeader className="p-8 pb-0 flex-shrink-0">
          <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
                  <Car className="text-primary" size={24} />
              </div>
              <div>
                  <DialogTitle className="text-3xl font-black tracking-tighter uppercase whitespace-nowrap">
                      {mode === 'create' ? t('vehicles.dialog.title_add') : t('vehicles.dialog.title_edit')}
                  </DialogTitle>
                  <p className="text-muted-foreground text-base font-bold font-black uppercase tracking-normal">{t('vehicles.dialog.subtitle')}</p>
              </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 pt-6 space-y-6 custom-scrollbar">
          {(branches.length > 0 || subcontractors.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {branches.length > 0 && (
                <div className="space-y-2">
                    <Label htmlFor="Branch_ID" className="text-xs font-black uppercase tracking-tight text-muted-foreground ml-1">Branch HQ</Label>
                    <Select value={formData.Branch_ID || undefined} onValueChange={(val) => setFormData({ ...formData, Branch_ID: val })}>
                        <SelectTrigger className="h-10 rounded-xl bg-muted/50 border-border/10 text-foreground">
                            <SelectValue placeholder={t('common.all')} />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border/10 text-foreground">
                            {branches.map((b) => (
                                <SelectItem key={b.Branch_ID} value={b.Branch_ID}>
                                    {b.Branch_Name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
              )}

              {subcontractors && subcontractors.length > 0 && (
                <div className="space-y-2">
                    <Label htmlFor="Sub_ID" className="text-xs font-black uppercase tracking-tight text-muted-foreground ml-1">{t('jobs.dialog.carrier')}</Label>
                    <Select value={formData.Sub_ID || "__company__"} onValueChange={(val) => setFormData({ ...formData, Sub_ID: val === "__company__" ? "" : val })}>
                        <SelectTrigger className="h-10 rounded-xl bg-muted/50 border-border/10 text-foreground">
                            <SelectValue placeholder={t('jobs.dialog.internal')} />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border/10 text-foreground">
                            <SelectItem value="__company__">{t('jobs.dialog.internal')}</SelectItem>
                            {subcontractors.map((s) => (
                                <SelectItem key={s.Sub_ID} value={s.Sub_ID}>{s.Sub_Name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
              )}
            </div>
          )}

          <div className="h-px bg-muted/50 mx-[-2rem]" />

          <div className="space-y-2">
            <Label htmlFor="Vehicle_Plate" className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-1">{t('vehicles.dialog.plate')}</Label>
            <Input
              id="Vehicle_Plate"
              value={formData.Vehicle_Plate}
              onChange={(e) => setFormData({ ...formData, Vehicle_Plate: e.target.value })}
              placeholder="1กข-1234"
              required
              disabled={mode === 'edit'}
              className="h-12 px-6 rounded-xl bg-muted/50 border-border/10 text-foreground placeholder:text-muted-foreground focus:ring-primary/40"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="Brand" className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-1">{t('vehicles.dialog.brand')}</Label>
                <Input
                id="Brand"
                value={formData.Brand}
                onChange={(e) => setFormData({ ...formData, Brand: e.target.value })}
                placeholder="Toyota"
                className="h-12 px-6 rounded-xl bg-muted/50 border-border/10 text-foreground placeholder:text-muted-foreground focus:ring-primary/40"
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="Model" className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-1">{t('vehicles.dialog.model')}</Label>
                <Input
                id="Model"
                value={formData.Model}
                onChange={(e) => setFormData({ ...formData, Model: e.target.value })}
                placeholder="Hilux Revo"
                className="h-12 px-6 rounded-xl bg-muted/50 border-border/10 text-foreground placeholder:text-muted-foreground focus:ring-primary/40"
                />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="Current_Mileage" className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-1">{t('vehicles.dialog.mileage')}</Label>
                <Input
                id="Current_Mileage"
                type="number"
                value={formData.Current_Mileage || ""}
                onChange={(e) => setFormData({ ...formData, Current_Mileage: e.target.value === "" ? "" : Number(e.target.value) })}
                className="h-12 px-6 rounded-xl bg-muted/50 border-border/10 text-foreground focus:ring-primary/40"
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="Next_Service_Mileage" className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-1">{t('vehicles.dialog.next_service')}</Label>
                <Input
                id="Next_Service_Mileage"
                type="number"
                value={formData.Next_Service_Mileage || ""}
                onChange={(e) => setFormData({ ...formData, Next_Service_Mileage: e.target.value === "" ? "" : Number(e.target.value) })}
                className="h-12 px-6 rounded-xl bg-muted/50 border-border/10 text-foreground focus:ring-primary/40"
                />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-border/5 pt-6">
             <div className="space-y-2">
                <Label htmlFor="Max_Weight_kg" className="text-base font-bold font-black uppercase tracking-tight text-emerald-500/80 ml-1">{t('vehicles.dialog.max_weight')}</Label>
                <div className="relative">
                    <Scale className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500/40" size={16} />
                    <Input
                        id="Max_Weight_kg"
                        type="number"
                        value={formData.Max_Weight_kg || ""}
                        onChange={(e) => setFormData({ ...formData, Max_Weight_kg: e.target.value === "" ? "" : Number(e.target.value) })}
                        placeholder="e.g. 1500"
                        className="h-12 pl-12 rounded-xl bg-emerald-500/5 border-emerald-500/10 text-emerald-400 placeholder:text-emerald-900/40"
                    />
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="Max_Volume_cbm" className="text-base font-bold font-black uppercase tracking-tight text-emerald-500/80 ml-1">{t('vehicles.dialog.max_volume')}</Label>
                <div className="relative">
                    <Box className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500/40" size={16} />
                    <Input
                        id="Max_Volume_cbm"
                        type="number"
                        value={formData.Max_Volume_cbm || ""}
                        onChange={(e) => setFormData({ ...formData, Max_Volume_cbm: e.target.value === "" ? "" : Number(e.target.value) })}
                        placeholder="e.g. 2.5"
                        step="0.1"
                        className="h-12 pl-12 rounded-xl bg-emerald-500/5 border-emerald-500/10 text-emerald-400 placeholder:text-emerald-900/40"
                    />
                </div>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-muted/50 border border-border/10 space-y-6">
            <div className="flex items-center gap-3">
                 <div className="p-2 bg-blue-500/20 rounded-xl">
                    <Shield size={18} className="text-blue-400" /> 
                 </div>
                 <h4 className="text-base font-bold font-black text-blue-400 uppercase tracking-normal">{t('vehicles.dialog.compliance_section')}</h4>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-2 items-center gap-4">
                    <Label htmlFor="Tax_Expiry" className="text-xs font-black uppercase tracking-tight text-muted-foreground">{t('vehicles.dialog.tax_expiry')}</Label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                        <Input
                            id="Tax_Expiry"
                            type="date"
                            value={formData.Tax_Expiry}
                            onChange={(e) => setFormData({ ...formData, Tax_Expiry: e.target.value })}
                            className="h-10 pl-10 border-border/10 bg-black/20 text-foreground focus:ring-primary/40 invert-[0.9] dark:invert-0"
                        />
                    </div>
                </div>
                
                <div className="grid grid-cols-2 items-center gap-4">
                    <Label htmlFor="Insurance_Expiry" className="text-xs font-black uppercase tracking-tight text-muted-foreground">{t('vehicles.dialog.insurance_expiry')}</Label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                        <Input
                            id="Insurance_Expiry"
                            type="date"
                            value={formData.Insurance_Expiry}
                            onChange={(e) => setFormData({ ...formData, Insurance_Expiry: e.target.value })}
                            className="h-10 pl-10 border-border/10 bg-black/20 text-foreground focus:ring-primary/40 invert-[0.9] dark:invert-0"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 items-center gap-4">
                    <Label htmlFor="Act_Expiry" className="text-xs font-black uppercase tracking-tight text-muted-foreground">{t('vehicles.dialog.act_expiry')}</Label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                        <Input
                            id="Act_Expiry"
                            type="date"
                            value={formData.Act_Expiry}
                            onChange={(e) => setFormData({ ...formData, Act_Expiry: e.target.value })}
                            className="h-10 pl-10 border-border/10 bg-black/20 text-foreground focus:ring-primary/40 invert-[0.9] dark:invert-0"
                        />
                    </div>
                </div>
            </div>
          </div>





          <div className="space-y-2">
            <Label htmlFor="Vehicle_Type" className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-1">{t('vehicles.dialog.type')}</Label>
            <Select value={formData.Vehicle_Type} onValueChange={(val) => setFormData({ ...formData, Vehicle_Type: val })}>
                <SelectTrigger className="h-10 rounded-xl bg-muted/50 border-border/10 text-foreground">
                    <SelectValue placeholder={t('vehicles.type')} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border/10 text-foreground">
                    {vehicleTypes.length > 0 ? (
                        vehicleTypes.map((type) => (
                            <SelectItem key={type.type_id} value={type.type_name}>
                                {type.type_name} {type.description ? `- ${type.description}` : ''}
                            </SelectItem>
                        ))
                    ) : (
                        <>
                            <SelectItem value="4-Wheel">4 ล้อ (4-Wheel)</SelectItem>
                            <SelectItem value="6-Wheel">6 ล้อ (6-Wheel)</SelectItem>
                            <SelectItem value="10-Wheel">10 ล้อ (10-Wheel)</SelectItem>
                        </>
                    )}
                </SelectContent>
            </Select>
          </div>

          {mode === 'edit' && (
             <div className="space-y-2">
              <Label htmlFor="Active_Status" className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-1">{t('common.status')}</Label>
              <Select value={formData.Active_Status} onValueChange={(val) => setFormData({ ...formData, Active_Status: val })}>
                <SelectTrigger className="h-10 rounded-xl bg-muted/50 border-border/10 text-foreground">
                    <SelectValue placeholder={t('common.status')} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border/10 text-foreground">
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setShow(false)}
                className="h-14 px-8 rounded-2xl text-muted-foreground font-black uppercase tracking-tight text-base font-bold hover:text-foreground"
            >
              {t('vehicles.dialog.abort')}
            </Button>
            <Button 
                type="submit" 
                disabled={loading} 
                className="h-14 px-12 rounded-2xl bg-primary hover:brightness-110 text-foreground font-black uppercase tracking-tight text-base font-bold shadow-xl shadow-primary/20 gap-3"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={18} />}
              {mode === 'create' ? t('vehicles.dialog.execute') : t('vehicles.dialog.sync')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

