'use client'

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Settings, Loader2 } from "lucide-react" // Use Settings icon for manage
import { adminUpdateJobStatus } from "@/app/admin/jobs/actions"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/components/providers/language-provider"

type Props = {
  jobId: string
  currentStatus: string
}

const JOB_STATUSES = [
  "Draft",
  "Requested",
  "New",
  "Pending",
  "Assigned",
  "Confirmed",
  "Accepted",
  "Picked Up",
  "En Route",
  "In Transit",
  "In Progress",
  "Arrived",
  "Arrived Pickup",
  "Arrived Dropoff",
  "Completed",
  "Delivered",
  "Verified",
  "Rejected",
  "Billed",
  "Paid",
  "Cancelled",
  "Failed",
  "SOS"
]

export function AdminJobActions({ jobId, currentStatus }: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(currentStatus)
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const getStatusLabel = (s: string) => {
    switch (s) {
      case "Draft": return `${t('jobs.status_draft') || 'ร่างแผน'} (Draft)`
      case "Requested": return `${t('jobs.status_requested')} (Requested)`
      case "New": return `${t('jobs.status_new') || 'งานใหม่'} (New)`
      case "Pending": return `${t('jobs.status_pending')} (Pending)`
      case "Assigned": return `${t('jobs.status_assigned') || 'มอบหมายงานแล้ว'} (Assigned)`
      case "Confirmed": return `คนขับยืนยันแล้ว (Confirmed)`
      case "Accepted": return `คนขับตอบรับงานแล้ว (Accepted)`
      case "Picked Up": return `${t('jobs.status_picked_up')} (Picked Up)`
      case "En Route": return `อยู่ระหว่างเดินทาง (En Route)`
      case "In Transit": return `${t('jobs.status_in_transit')} (In Transit)`
      case "In Progress": return `กำลังดำเนินการ (In Progress)`
      case "Arrived": return `ถึงจุดหมายแล้ว (Arrived)`
      case "Arrived Pickup": return `ถึงจุดรับสินค้า (Arrived Pickup)`
      case "Arrived Dropoff": return `ถึงจุดส่งสินค้า (Arrived Dropoff)`
      case "Completed": return `${t('jobs.status_completed')} (Completed)`
      case "Delivered": return `${t('jobs.status_delivered')} (Delivered)`
      case "Verified": return `${t('jobs.status_verified') || 'Verified'} (Verified)`
      case "Rejected": return `${t('jobs.status_rejected') || 'Rejected'} (Rejected)`
      case "Billed": return `${t('jobs.status_billed') || 'Billed'} (Billed)`
      case "Paid": return `${t('jobs.status_paid') || 'Paid'} (Paid)`
      case "Cancelled": return `${t('jobs.status_cancelled')} (Cancelled)`
      case "Failed": return `ส่งสินค้าไม่สำเร็จ (Failed)`
      case "SOS": return `${t('jobs.status_sos') || 'SOS'} (SOS)`
      default: return s
    }
  }

  const handleUpdate = async () => {
    try {
      setLoading(true)
      const result = await adminUpdateJobStatus(jobId, status, note)

      if (result.success) {
        toast.success("Job status updated")
        // Surface the MASTER Google Sheet write outcome (only set when Verified)
        const sync = (result as { sheetSync?: { success: boolean; error?: string; skipped?: boolean } }).sheetSync
        if (sync) {
          if (sync.skipped) {
            toast.info('ข้ามการเขียน Google Sheet (งานนี้อยู่ในชีตแล้ว)')
          } else if (!sync.success) {
            toast.error('เขียน Google Sheet ไม่สำเร็จ: ' + (sync.error || 'unknown error'), { duration: 9000 })
          } else {
            toast.success('บันทึกลง MASTER Sheet แล้ว')
          }
        }
        setOpen(false)
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error("Failed to update status")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-gray-200 hover:bg-gray-100 text-gray-700">
          <Settings className="h-4 w-4" />
          จัดการสถานะ (Admin)
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white border-gray-200 max-w-[95vw] sm:max-w-[425px] max-h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 flex-shrink-0">
          <DialogTitle className="text-gray-900 font-black">อัพเดทสถานะงาน (Admin Override)</DialogTitle>
          <DialogDescription className="text-muted-foreground font-bold">
            เปลี่ยนสถานะงานแทนคนขับ หรือปิดงานกรณีฉุกเฉิน
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 pt-0 space-y-4 custom-scrollbar">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right text-gray-700">
              สถานะ
            </Label>
            <div className="col-span-3">
                <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                    <SelectValue placeholder="เลือกสถานะ" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200 text-gray-900">
                    {JOB_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="text-gray-900 hover:bg-gray-100 focus:bg-gray-100 cursor-pointer">
                        {getStatusLabel(s)}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="note" className="text-right text-gray-700">
              หมายเหตุ
            </Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="col-span-3 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 resize-none"
              placeholder="เหตุผลการแก้ไข (ถ้ามี)"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-white" disabled={loading}>
            ยกเลิก
          </Button>
          <Button onClick={handleUpdate} disabled={loading} className="bg-emerald-600 hover:bg-blue-700 text-white">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
