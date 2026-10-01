"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updateRepairTicket, type TicketUpdateData } from "@/app/maintenance/actions"
import type { RepairTicket } from "@/lib/supabase/maintenance"

interface CompleteRepairDialogProps {
  ticket: RepairTicket
  open: boolean
  onOpenChange: (open: boolean) => void
}

// yyyy-mm-dd in local time, for <input type="date">
function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Closing a repair ticket asks for the actual cost + finish date, so completed
 * tickets don't land in the cost reports at ฿0 or without a Date_Finish.
 */
export function CompleteRepairDialog({ ticket, open, onOpenChange }: CompleteRepairDialogProps) {
  const [cost, setCost] = useState('')
  const [dateFinish, setDateFinish] = useState(todayLocal())
  const [remark, setRemark] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setCost(Number(ticket.Cost_Total) > 0 ? String(ticket.Cost_Total) : '')
    setDateFinish(todayLocal())
    setRemark(ticket.Remark || '')
  }, [open, ticket.Cost_Total, ticket.Remark])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const costNum = parseFloat(cost)
    if (!Number.isFinite(costNum) || costNum < 0) {
      toast.error('กรุณาใส่ค่าใช้จ่ายการซ่อม (ใส่ 0 ได้ถ้าไม่มีค่าใช้จ่าย)')
      return
    }
    if (!dateFinish) {
      toast.error('กรุณาเลือกวันที่ซ่อมเสร็จ')
      return
    }

    setLoading(true)
    try {
      const result = await updateRepairTicket(ticket.Ticket_ID, {
        ...ticket,
        Status: 'Completed',
        Cost_Total: costNum,
        Date_Finish: `${dateFinish}T12:00:00+07:00`,
        Remark: remark.trim() || null,
      } as unknown as TicketUpdateData)
      if (result.success) {
        toast.success('ปิดงานซ่อมเรียบร้อยแล้ว')
        onOpenChange(false)
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error('เกิดข้อผิดพลาดในการปิดงานซ่อม')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md bg-card text-foreground p-0 rounded-2xl overflow-hidden border border-border shadow-xl">
        <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/80" />
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <DialogTitle className="text-xl font-semibold">ปิดงานซ่อม</DialogTitle>
              <p className="text-muted-foreground text-sm">
                {ticket.Vehicle_Plate || '-'} • {ticket.Issue_Type || '-'}
              </p>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="complete-cost" className="text-muted-foreground font-medium">ค่าใช้จ่ายการซ่อมจริง (บาท) *</Label>
            <Input
              id="complete-cost"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              autoFocus
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="เช่น 3500"
              className="h-12 bg-muted/50 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">ยอดนี้จะถูกนับเป็นต้นทุนซ่อมบำรุงของรถคันนี้ในรายงานกำไร/ต้นทุน</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="complete-date" className="text-muted-foreground font-medium">วันที่ซ่อมเสร็จ *</Label>
            <Input
              id="complete-date"
              type="date"
              value={dateFinish}
              onChange={(e) => setDateFinish(e.target.value)}
              className="h-12 bg-muted/50 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="complete-remark" className="text-muted-foreground font-medium">หมายเหตุ (อู่ / รายการที่ซ่อม)</Label>
            <Textarea
              id="complete-remark"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="min-h-[72px] bg-muted/50 rounded-xl"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-11 px-5 rounded-xl">
              ยกเลิก
            </Button>
            <Button type="submit" disabled={loading} className="h-11 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              บันทึกและปิดงาน
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
