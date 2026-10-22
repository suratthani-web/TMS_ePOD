"use client"

// Lets an admin say which job an "end" fill closes, so per-job fuel stops being
// a guess. Empty = auto (end fill closes the latest jobs + odometer check).
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Link2, Loader2 } from "lucide-react"
import { setFuelLogClosingJob, type FuelClosingCandidate } from "@/app/fuel/actions"
import { cn } from "@/lib/utils"

const fmtDate = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '-')

export function ClosingJobPicker({
  logId,
  fillDateTime,
  value,
  candidates,
}: {
  logId: string
  fillDateTime: string | null
  value: string | null | undefined
  /** Jobs of this truck (any order) — filtered to the 14 days up to the fill */
  candidates: FuelClosingCandidate[]
}) {
  const [current, setCurrent] = useState(value || '')
  const [pending, startTransition] = useTransition()

  const fillDate = (fillDateTime || '').slice(0, 10)
  const from = fillDate ? new Date(Date.parse(fillDate) - 14 * 864e5).toISOString().slice(0, 10) : ''
  const options = candidates
    .filter(j => !fillDate || ((j.Plan_Date || '') <= fillDate && (j.Plan_Date || '') >= from))
    .sort((a, b) => (b.Plan_Date || '').localeCompare(a.Plan_Date || ''))
  // keep a linked job visible even if it falls outside the window
  if (current && !options.some(o => o.Job_ID === current)) {
    options.unshift({ Job_ID: current, Plan_Date: null, Vehicle_Plate: null, Customer_Name: null, Dest_Location: null, Est_Distance_KM: null })
  }

  const onChange = (next: string) => {
    const prev = current
    setCurrent(next)
    startTransition(async () => {
      const res = await setFuelLogClosingJob(logId, next || null)
      if (res.success) toast.success(res.message)
      else { toast.error(res.message); setCurrent(prev) }
    })
  }

  return (
    <div className="mt-1 flex items-center gap-1">
      {pending ? <Loader2 size={11} className="animate-spin text-muted-foreground" /> : <Link2 size={11} className={current ? 'text-emerald-500' : 'text-muted-foreground'} />}
      <select
        value={current}
        disabled={pending}
        onChange={e => onChange(e.target.value)}
        title="บิลเติมจบงานนี้ตัดน้ำมันของงานไหน — เลือกแล้วระบบคิดน้ำมันต่องานตามที่ผูก (งานก่อนหน้าที่ยังไม่ถูกตัดจะรวมในรอบนี้ด้วย)"
        className={cn(
          'h-6 max-w-[190px] rounded-md border px-1 text-[10px] font-semibold bg-background',
          current ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400' : 'border-border text-muted-foreground'
        )}
      >
        <option value="">จบงาน: ให้ระบบเลือก</option>
        {options.map(j => (
          <option key={j.Job_ID} value={j.Job_ID}>
            {fmtDate(j.Plan_Date)} · {j.Job_ID}{j.Dest_Location ? ` · ${j.Dest_Location.split('→').pop()?.trim().slice(0, 28)}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
