"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createRepairTicket, updateRepairTicket } from "@/app/maintenance/actions"
import { Loader2 } from "lucide-react"
import { ImageUpload } from "@/components/ui/image-upload"
import Logger from "@/lib/utils/logger"
import { useLanguage } from "@/components/providers/language-provider"

import { toast } from "sonner"

import { Driver } from "@/lib/supabase/drivers"

export interface MaintenanceTicket {
  Ticket_ID: string
  Date_Report: string
  Driver_ID: string
  Vehicle_Plate: string
  Issue_Type: string
  Description: string
  Priority: string
  Photo_Url: string
  Status: string
  Cost_Total: number
  Remark: string
}

type MaintenanceDialogProps = {
  drivers: Driver[]
  vehicles: { Vehicle_Plate: string }[]
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  initialData?: MaintenanceTicket
}

export function MaintenanceDialog({
  drivers,
  vehicles,
  trigger,
  open,
  onOpenChange,
  initialData
}: MaintenanceDialogProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [internalOpen, setInternalOpen] = useState(false)
  
  // Hooks must be called before any potential early returns or conditional assignments
  const isControlled = open !== undefined
  const show = isControlled ? open : internalOpen
  const setShow = (val: boolean) => {
    if (isControlled && onOpenChange) {
        onOpenChange(val)
    } else {
        setInternalOpen(val)
    }
  }

  const [formData, setFormData] = useState({
    Date_Report: new Date().toISOString().slice(0, 16),
    Driver_ID: '',
    Vehicle_Plate: '',
    Issue_Type: 'Engine',
    Description: '',
    Priority: 'Medium',
    Photo_Url: '',
    Status: 'Pending',
    Cost_Total: 0,
    Remark: ''
  })

  useEffect(() => {
    if (initialData) {
      let photoUrl = initialData.Photo_Url || '';
      try {
        if (photoUrl.startsWith('[') && photoUrl.endsWith(']')) {
            const parsed = JSON.parse(photoUrl);
            if (Array.isArray(parsed) && parsed.length > 0) {
                photoUrl = parsed[0]
            }
        }
      } catch {
        // Error parsing photo JSON, falling back to raw string
      }

      setFormData({
        Date_Report: initialData.Date_Report ? new Date(initialData.Date_Report).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
        Driver_ID: initialData.Driver_ID || '',
        Vehicle_Plate: initialData.Vehicle_Plate || '',
        Issue_Type: initialData.Issue_Type || 'Engine',
        Description: initialData.Description || '',
        Priority: initialData.Priority || 'Medium',
        Photo_Url: photoUrl,
        Status: initialData.Status || 'Pending',
        Cost_Total: initialData.Cost_Total || 0,
        Remark: initialData.Remark || ''
      })
    }
  }, [initialData, show])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.Date_Report) return toast.error("โปรดระบุวันที่แจ้งซ่อม")
    if (!formData.Description) return toast.error("โปรดระบุรายละเอียดอาการ")
    if (!formData.Vehicle_Plate) return toast.error("โปรดระบุทะเบียนรถ")

    setLoading(true)

    try {
      const payload = {
        ...formData,
        Date_Report: new Date(formData.Date_Report).toISOString(),
        // Convert empty strings to null for DB foreign keys
        Driver_ID: formData.Driver_ID || null,
        Vehicle_Plate: formData.Vehicle_Plate || null,
        Cost_Total: Number(formData.Cost_Total) || 0
      }

      console.log("[MAINTENANCE] Submitting payload:", payload)

      let result;
      if (initialData) {
        result = await updateRepairTicket(initialData.Ticket_ID, payload)
      } else {
        result = await createRepairTicket(payload)
      }
      
      if (result && result.success) {
        toast.success(initialData ? 'อัปเดตข้อมูลเรียบร้อยแล้ว' : 'ส่งแจ้งซ่อมเรียบร้อยแล้ว')
        setShow(false)
        if (!isControlled && !initialData) {
          setFormData({
              Date_Report: new Date().toISOString().slice(0, 16),
              Driver_ID: '',
              Vehicle_Plate: '',
              Issue_Type: 'Engine',
              Description: '',
              Priority: 'Medium',
              Photo_Url: '',
              Status: 'Pending',
              Cost_Total: 0,
              Remark: ''
          })
        }
        router.refresh()
      } else {
        console.error("[MAINTENANCE] Submit failed:", result?.message)
        toast.error(result?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล')
      }
    } catch (err: unknown) {
      Logger.error("Maintenance submit error:", err)
      toast.error('เกิดข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'การเชื่อมต่อขัดข้อง'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={show} onOpenChange={setShow}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-[95vw] sm:max-w-xl max-h-[95vh] flex flex-col bg-card text-foreground p-0 rounded-2xl overflow-hidden border border-border shadow-xl">
        <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/80" />
        
        <DialogHeader className="p-8 pb-4 flex-shrink-0">
          <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center">
                  <span className="text-amber-500 text-2xl">🛠️</span>
              </div>
              <div>
                  <DialogTitle className="text-2xl font-semibold whitespace-nowrap">
                      {initialData ? t('maintenance.title_edit') : t('maintenance.title_add')}
                  </DialogTitle>
                  <p className="text-muted-foreground text-sm font-medium">บันทึกงานซ่อมและค่าใช้จ่าย</p>
              </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 pt-2 space-y-6 custom-scrollbar">
          <div className="flex justify-center mb-2">
             <ImageUpload 
                value={formData.Photo_Url} 
                onChange={(url) => setFormData({ ...formData, Photo_Url: url })}
             />
          </div>

          <div className="space-y-2">
            <Label htmlFor="Date_Report" className="text-muted-foreground font-medium ml-1">{t('maintenance.date_report')}</Label>
            <Input
              id="Date_Report"
              type="datetime-local"
              value={formData.Date_Report}
              onChange={(e) => setFormData({ ...formData, Date_Report: e.target.value })}
              required
              className="h-12 bg-muted/50 border-border/10 text-foreground rounded-xl focus:ring-amber-500/40"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <Label className="text-muted-foreground font-medium ml-1">{t('maintenance.reporter')}</Label>
                <Select value={formData.Driver_ID || ""} onValueChange={(val) => setFormData({ ...formData, Driver_ID: val })}>
                    <SelectTrigger className="h-12 border-border/10 bg-muted/50 text-foreground rounded-xl">
                        <SelectValue placeholder={t('maintenance.placeholder_driver')} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border/10 text-foreground">
                        {drivers && drivers.length > 0 ? (
                            drivers.map((d: Driver) => (
                                <SelectItem key={d.Driver_ID} value={d.Driver_ID}>{d.Driver_Name}</SelectItem>
                            ))
                        ) : (
                            <SelectItem value="none" disabled>ไม่มีข้อมูลคนขับ</SelectItem>
                        )}
                    </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
                <Label className="text-muted-foreground font-medium ml-1">{t('maintenance.vehicle')}</Label>
                <Select value={formData.Vehicle_Plate || ""} onValueChange={(val) => setFormData({ ...formData, Vehicle_Plate: val })}>
                    <SelectTrigger className="h-12 border-border/10 bg-muted/50 text-foreground rounded-xl">
                        <SelectValue placeholder={t('maintenance.placeholder_vehicle')} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border/10 text-foreground">
                        {vehicles && vehicles.length > 0 ? (
                            vehicles.map((v: { Vehicle_Plate: string }) => (
                                <SelectItem key={v.Vehicle_Plate} value={v.Vehicle_Plate}>{v.Vehicle_Plate}</SelectItem>
                            ))
                        ) : (
                            <SelectItem value="none" disabled>ไม่มีข้อมูลรถ</SelectItem>
                        )}
                    </SelectContent>
                </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <Label className="text-muted-foreground font-medium ml-1">{t('maintenance.issue_type')}</Label>
                <Select value={formData.Issue_Type} onValueChange={(val) => setFormData({ ...formData, Issue_Type: val })}>
                    <SelectTrigger className="h-12 border-border/10 bg-muted/50 text-foreground rounded-xl">
                        <SelectValue placeholder={t('maintenance.placeholder_issue')} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border/10 text-foreground">
                        <SelectItem value="Engine">{t('maintenance.engine')}</SelectItem>
                        <SelectItem value="Tire">{t('maintenance.tire')}</SelectItem>
                        <SelectItem value="Battery">{t('maintenance.battery')}</SelectItem>
                        <SelectItem value="Body">{t('maintenance.body')}</SelectItem>
                        <SelectItem value="Other">{t('maintenance.other')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>
             <div className="space-y-2">
                <Label className="text-muted-foreground font-medium ml-1">{t('maintenance.priority')}</Label>
                <Select value={formData.Priority} onValueChange={(val) => setFormData({ ...formData, Priority: val })}>
                    <SelectTrigger className="h-12 border-border/10 bg-muted/50 text-foreground rounded-xl">
                        <SelectValue placeholder={t('maintenance.placeholder_priority')} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border/10 text-foreground">
                        <SelectItem value="Low">{t('maintenance.low')}</SelectItem>
                        <SelectItem value="Medium">{t('maintenance.medium')}</SelectItem>
                        <SelectItem value="High">{t('maintenance.high')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="Description" className="text-muted-foreground font-medium ml-1">{t('maintenance.description')}</Label>
            <Textarea
              id="Description"
              value={formData.Description}
              onChange={(e) => setFormData({ ...formData, Description: e.target.value })}
              placeholder={t('maintenance.placeholder_description')}
              required
              className="min-h-[100px] bg-muted/50 border-border/10 text-foreground rounded-xl focus:ring-amber-500/40"
            />
          </div>

          {initialData && (
             <div className="pt-6 border-t border-border/10 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label className="text-muted-foreground font-medium ml-1">{t('maintenance.status')}</Label>
                        <Select value={formData.Status} onValueChange={(val) => setFormData({ ...formData, Status: val })}>
                            <SelectTrigger className="h-12 border-border/10 bg-muted/50 text-foreground rounded-xl">
                                <SelectValue placeholder={t('maintenance.placeholder_status')} />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border/10 text-foreground">
                                <SelectItem value="Pending">{t('maintenance.pending')}</SelectItem>
                                <SelectItem value="In Progress">{t('maintenance.in_progress')}</SelectItem>
                                <SelectItem value="Completed">{t('maintenance.completed')}</SelectItem>
                                <SelectItem value="Cancelled">{t('maintenance.cancelled')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="Cost_Total" className="text-muted-foreground font-medium ml-1">{t('maintenance.cost')}</Label>
                         <Input
                            id="Cost_Total"
                            type="number"
                            value={formData.Cost_Total === 0 ? '' : formData.Cost_Total}
                            onChange={(e) => {
                                const val = e.target.value;
                                setFormData({ ...formData, Cost_Total: val === '' ? 0 : parseFloat(val) })
                            }}
                            className="h-12 bg-muted/50 border-border/10 text-foreground rounded-xl focus:ring-amber-500/40"
                         />
                    </div>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="Remark" className="text-muted-foreground font-medium ml-1">{t('maintenance.remark')}</Label>
                    <Textarea
                        id="Remark"
                        value={formData.Remark}
                        onChange={(e) => setFormData({ ...formData, Remark: e.target.value })}
                        placeholder={t('maintenance.placeholder_remark')}
                        className="min-h-[80px] bg-muted/50 border-border/10 text-foreground rounded-xl focus:ring-amber-500/40"
                    />
                </div>
             </div>
          )}

          <div className="flex justify-end gap-3 pt-4 sticky bottom-0 bg-transparent">
            <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setShow(false)}
                className="h-12 px-6 rounded-xl text-muted-foreground font-semibold hover:text-foreground hover:bg-muted"
            >
              {t('jobs.dialog.abort')}
            </Button>
            <Button 
                type="submit" 
                disabled={loading} 
                className="h-12 px-8 rounded-xl bg-primary text-primary-foreground font-semibold shadow-sm"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialData ? t('common.save') : t('maintenance.title_report_btn') || 'SUBMIT_REPORT'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
