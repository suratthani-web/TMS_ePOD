"use client"

import { useState } from 'react'
import { useLanguage } from "@/components/providers/language-provider"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react"
import { verifyJob } from "@/lib/actions/job-actions"
import { toast } from "sonner"
import { Job } from "@/lib/supabase/jobs"

interface AdminVerificationDialogProps {
  job: Job
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AdminVerificationDialog({ job, open, onOpenChange }: AdminVerificationDialogProps) {
  const { t } = useLanguage()
  const [note, setNote] = useState(job.Verification_Note || '')
  const [loading, setLoading] = useState(false)

  async function handleVerify(status: 'Verified' | 'Rejected') {
    setLoading(true)
    try {
      const result = await verifyJob(job.Job_ID, status, note)
      if (result.success) {
        toast.success(status === 'Verified' ? t('verification.toast_verified') : t('verification.toast_rejected'))
        // Surface the MASTER Google Sheet write outcome (best-effort ledger sync)
        const sync = (result as { sheetSync?: { success: boolean; error?: string; skipped?: boolean } }).sheetSync
        if (status === 'Verified' && sync) {
          if (sync.skipped) {
            toast.info('ข้ามการเขียน Google Sheet (งานนี้ถูกตรวจสอบไปแล้ว)')
          } else if (!sync.success) {
            toast.error('เขียน Google Sheet ไม่สำเร็จ: ' + (sync.error || 'unknown error'), { duration: 9000 })
          } else {
            toast.success('บันทึกลง MASTER Sheet แล้ว')
          }
        }
        onOpenChange(false)
      } else {
        toast.error(result.error || 'Failed to update status')
      }
    } catch {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[95vh] flex flex-col bg-white rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
        <div className="bg-background p-8 text-foreground relative flex-shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full -mr-16 -mt-16" />
          <DialogHeader className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400">
                    <CheckCircle2 size={24} />
                </div>
                <DialogTitle className="text-2xl font-black tracking-tight">{t('verification.title')}</DialogTitle>
            </div>
            <DialogDescription className="text-emerald-300 font-medium tracking-tight">
              {t('verification.subtitle', { id: job.Job_ID })}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          <div className="space-y-2">
            <label className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest ml-1">{t('verification.note_label')}</label>
            <Textarea 
              placeholder={t('verification.placeholder_note')}
              className="min-h-[120px] rounded-2xl bg-gray-50 border-gray-100 focus:bg-white transition-all text-xl font-medium p-4 resize-none"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button 
                variant="outline"
                disabled={loading}
                onClick={() => handleVerify('Rejected')}
                className="h-14 rounded-2xl border-red-100 text-red-500 font-black hover:bg-red-50 hover:text-red-600 transition-all gap-2"
            >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <XCircle size={18} />}
                {t('verification.reject_btn')}
            </Button>
            <Button 
                disabled={loading}
                onClick={() => handleVerify('Verified')}
                className="h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black shadow-lg shadow-emerald-500/20 transition-all gap-2"
            >
                {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                {t('verification.approve_btn')}
            </Button>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-center gap-4 text-base font-bold font-black text-muted-foreground uppercase tracking-widest">
            <div className="flex items-center gap-1.5">
                <AlertCircle size={12} className="text-emerald-600" /> {t('verification.audit_footer')}
            </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

