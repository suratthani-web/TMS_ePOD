"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { updateFuelLog, createFuelLog } from "@/app/fuel/actions"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ImageUpload } from "@/components/ui/image-upload"
import Logger from "@/lib/utils/logger"
import { useLanguage } from "@/components/providers/language-provider"

interface Driver {
  Driver_ID: string;
  Driver_Name: string | null;
}

interface Vehicle {
  Vehicle_Plate: string | null;
  Vehicle_Type?: string | null;
}

export interface FuelLog {
  Log_ID: string
  Date_Time: string | null
  Driver_ID: string | null
  Vehicle_Plate: string | null
  Liters: number | null
  Price_Total: number | null
  Odometer: number | null
  Station_Name: string | null
  Photo_Url: string | null
}

type FuelDialogProps = {
  drivers: Driver[]
  vehicles: Vehicle[]
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  initialData?: FuelLog
}

export function FuelDialog({
  drivers,
  vehicles,
  trigger,
  open,
  onOpenChange,
  initialData
}: FuelDialogProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [internalOpen, setInternalOpen] = useState(false)
  
  const isControlled = open !== undefined
  const show = isControlled ? open : internalOpen
  const setShow = isControlled ? onOpenChange! : setInternalOpen

  const [formData, setFormData] = useState<{
    Date_Time: string
    Driver_ID: string
    Vehicle_Plate: string
    Liter: string
    Price: string
    Total_Amount: number
    Mileage: string
    Station_Name: string
    Fuel_Type?: string
    Photo_Url?: string
  }>({
    Date_Time: new Date().toISOString().slice(0, 16),
    Driver_ID: '',
    Vehicle_Plate: '',
    Liter: '',
    Price: '',
    Total_Amount: 0,
    Mileage: '',
    Station_Name: '',
    Photo_Url: ''
  })

  useEffect(() => {
    if (initialData) {
      setFormData({
        Date_Time: initialData.Date_Time ? new Date(initialData.Date_Time).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
        Driver_ID: initialData.Driver_ID || '',
        Vehicle_Plate: initialData.Vehicle_Plate || '',
        Liter: initialData.Liters?.toString() || '',
        Price: (initialData.Price_Total && initialData.Liters) ? (initialData.Price_Total / initialData.Liters).toFixed(2) : '',
        Total_Amount: initialData.Price_Total || 0,
        Mileage: initialData.Odometer?.toString() || '',
        Station_Name: initialData.Station_Name || '',
        Photo_Url: initialData.Photo_Url || ''
      })
    }
  }, [initialData, show])

  // Auto calculate total (Only if user is typing, might conflict with initial load if not careful)
  // We can add a check if focused or just rely on manual input
  useEffect(() => {
    const liter = parseFloat(formData.Liter) || 0
    const price = parseFloat(formData.Price) || 0
    // Only update total if values are valid numbers
    if (liter > 0 && price > 0) {
        setFormData(prev => ({ ...prev, Total_Amount: liter * price }))
    }
  }, [formData.Liter, formData.Price])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = {
        ...formData,
        Liter: parseFloat(formData.Liter),
        Price: parseFloat(formData.Price),
        Mileage: parseInt(formData.Mileage),
        Date_Time: new Date(formData.Date_Time).toISOString(),
        Station_Name: formData.Station_Name || ''
      }

      if (initialData) {
        await updateFuelLog(initialData.Log_ID, payload)
        toast.success(t('fuel.edit_success'))
      } else {
        await createFuelLog(payload)
        toast.success(t('fuel.save_success'))
      }
      
      setShow(false)
      if (!isControlled && !initialData) {
        setFormData({
            Date_Time: new Date().toISOString().slice(0, 16),
            Driver_ID: '',
            Vehicle_Plate: '',
            Liter: '',
            Price: '',
            Total_Amount: 0,
            Mileage: '',
            Station_Name: '',
            Photo_Url: ''
        })
      }
      router.refresh()
    } catch (err) {
      Logger.error("Fuel log submit error:", err)
      toast.error(t('jobs.dialog.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={show} onOpenChange={setShow}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-[95vw] sm:max-w-xl max-h-[95vh] flex flex-col bg-card/95 backdrop-blur-2xl border-border/5 text-foreground p-0 rounded-[2.5rem] overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.5)]">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
        
        <DialogHeader className="p-8 pb-4 flex-shrink-0">
          <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                  <span className="text-emerald-500 text-2xl">⛽</span>
              </div>
              <div>
                  <DialogTitle className="text-3xl font-black tracking-tighter uppercase whitespace-nowrap">
                      {initialData ? t('fuel.title_edit') : t('fuel.title_add')}
                  </DialogTitle>
                  <p className="text-muted-foreground text-base font-bold font-black uppercase tracking-[0.3em]">Fuel & Energy Consumption Log</p>
              </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 pt-2 space-y-6 custom-scrollbar">
          <div className="flex flex-col items-center mb-2 gap-4">
             <ImageUpload 
                value={formData.Photo_Url} 
                onChange={(url) => setFormData({ ...formData, Photo_Url: url })}
             />
             {formData.Photo_Url && (
                <Button 
                    type="button" 
                    variant="outline" 
                    size="lg"
                    onClick={async () => {
                        if (!formData.Photo_Url) return
                        setLoading(true)
                        try {
                            const { parseFuelReceipt } = await import('@/lib/ocr/fuel-receipt-parser')
                            const result = await parseFuelReceipt(formData.Photo_Url)
                            
                            setFormData(prev => ({
                                ...prev,
                                Date_Time: result.date ? `${result.date}T${result.time || '12:00'}` : prev.Date_Time,
                                Liter: result.liters?.toString() || prev.Liter,
                                Price: result.pricePerLiter?.toString() || prev.Price,
                                Total_Amount: result.totalAmount || prev.Total_Amount,
                                Station_Name: result.stationName || prev.Station_Name
                            }))
                            toast.success(t('fuel.scan_success'))
                        } catch (err) {
                            Logger.error("Fuel OCR error:", err)
                            toast.error(t('fuel.scan_error'))
                        } finally {
                            setLoading(false)
                        }
                    }}
                    disabled={loading}
                    className="h-12 px-8 rounded-xl border-border/10 bg-muted/50 text-foreground font-black uppercase tracking-widest hover:bg-muted/80 flex items-center gap-3 transition-all active:scale-95"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <span className="text-xl">⚡</span>}
                    {t('fuel.scan_receipt')}
                </Button>
             )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="Date_Time" className="text-muted-foreground font-black uppercase tracking-widest ml-1">{t('fuel.date_time')}</Label>
            <Input
              id="Date_Time"
              type="datetime-local"
              value={formData.Date_Time}
              onChange={(e) => setFormData({ ...formData, Date_Time: e.target.value })}
              required
              className="h-12 bg-muted/50 border-border/10 text-foreground rounded-xl focus:ring-emerald-500/40"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <Label className="text-muted-foreground font-black uppercase tracking-widest ml-1">{t('fuel.driver')}</Label>
                <Select value={formData.Driver_ID || undefined} onValueChange={(val) => setFormData({ ...formData, Driver_ID: val })}>
                    <SelectTrigger className="h-12 border-border/10 bg-muted/50 text-foreground rounded-xl">
                        <SelectValue placeholder={t('fuel.placeholder_driver')} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border/10 text-foreground">
                        {drivers.map((d) => (
                            <SelectItem key={d.Driver_ID} value={d.Driver_ID}>{d.Driver_Name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label className="text-muted-foreground font-black uppercase tracking-widest ml-1">{t('fuel.vehicle')}</Label>
                <Select value={formData.Vehicle_Plate || undefined} onValueChange={(val) => setFormData({ ...formData, Vehicle_Plate: val })}>
                    <SelectTrigger className="h-12 border-border/10 bg-muted/50 text-foreground rounded-xl">
                        <SelectValue placeholder={t('fuel.placeholder_vehicle')} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border/10 text-foreground">
                        {vehicles.filter((v) => Boolean(v.Vehicle_Plate)).map((v) => (
                            <SelectItem key={v.Vehicle_Plate || ''} value={v.Vehicle_Plate || ''}>{v.Vehicle_Plate}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="Station_Name" className="text-muted-foreground font-black uppercase tracking-widest ml-1">{t('fuel.station')}</Label>
                <Input
                    id="Station_Name"
                    value={formData.Station_Name}
                    onChange={(e) => setFormData({ ...formData, Station_Name: e.target.value })}
                    placeholder={t('fuel.placeholder_station')}
                    className="h-12 bg-muted/50 border-border/10 text-foreground rounded-xl focus:ring-emerald-500/40"
                />
            </div>
            <div className="space-y-2">
                 <Label htmlFor="Mileage" className="text-muted-foreground font-black uppercase tracking-widest ml-1">{t('fuel.odometer')}</Label>
                 <Input
                    id="Mileage"
                    type="number"
                    value={formData.Mileage}
                    onChange={(e) => setFormData({ ...formData, Mileage: e.target.value })}
                    placeholder={t('fuel.placeholder_odometer')}
                    required
                    className="h-12 bg-muted/50 border-border/10 text-foreground rounded-xl focus:ring-emerald-500/40"
                 />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
                <Label htmlFor="Liter" className="text-muted-foreground font-black uppercase tracking-widest ml-1">{t('fuel.liters')}</Label>
                <Input
                id="Liter"
                type="number"
                step="0.01"
                value={formData.Liter}
                onChange={(e) => setFormData({ ...formData, Liter: e.target.value })}
                required
                className="h-12 bg-muted/50 border-border/10 text-foreground rounded-xl focus:ring-emerald-500/40"
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="Price" className="text-muted-foreground font-black uppercase tracking-widest ml-1">{t('fuel.price_per_liter')}</Label>
                <Input
                id="Price"
                type="number"
                step="0.01"
                value={formData.Price}
                onChange={(e) => setFormData({ ...formData, Price: e.target.value })}
                required
                className="h-12 bg-muted/50 border-border/10 text-foreground rounded-xl focus:ring-emerald-500/40"
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="Total_Amount" className="text-muted-foreground font-black uppercase tracking-widest ml-1">{t('fuel.total_amount')}</Label>
                <Input
                id="Total_Amount"
                value={formData.Total_Amount.toFixed(2)}
                readOnly
                className="h-12 bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-black text-lg rounded-xl"
                />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 sticky bottom-0 bg-transparent">
            <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setShow(false)}
                className="h-14 px-8 rounded-2xl text-muted-foreground font-black uppercase tracking-widest hover:text-white"
            >
              {t('jobs.dialog.abort')}
            </Button>
            <Button 
                type="submit" 
                disabled={loading} 
                className="h-14 px-12 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialData ? t('common.save') : t('common.submit') || 'SUBMIT_LOG'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

