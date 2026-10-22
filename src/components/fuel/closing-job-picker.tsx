"use client"

// Lets an admin say which job(s) an "end" fill closes, so per-job fuel stops being
// a guess. Several jobs = short runs whose fuel is cut in one fill. None = auto
// (end fill closes the latest jobs + odometer check).
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Link2, Loader2, ChevronDown } from "lucide-react"
import { setFuelLogClosingJob, type FuelClosingCandidate } from "@/app/fuel/actions"
import { parseJobLinks } from "@/lib/fuel/bill-allocation"
import { cn } from "@/lib/utils"

const fmtDate = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '-')
const lastDrop = (dest: string | null) => dest?.split('→').pop()?.trim().slice(0, 32) || ''

export function ClosingJobPicker({
  logId,
  fillDateTime,
  value,
  candidates,
}: {
  logId: string
  fillDateTime: string | null
  /** Closes_Job_ID — one or more job ids, comma-separated */
  value: string | null | undefined
  /** Jobs of this truck (any order) — filtered to the 14 days up to the fill */
  candidates: FuelClosingCandidate[]
}) {
  const [saved, setSaved] = useState<string[]>(parseJobLinks(value))
  const [draft, setDraft] = useState<string[]>(saved)
  const [open, setOpen] = useState(false)
  // fixed position: the ledger table scrolls (overflow) and would clip an absolute popup
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pending, startTransition] = useTransition()
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setDraft(saved) } }
    // page/table scroll closes it (popup is fixed); scrolling its own job list does not
    const dismiss = (e: Event) => { if (boxRef.current?.contains(e.target as Node)) return; setOpen(false); setDraft(saved) }
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', dismiss, true)
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('scroll', dismiss, true) }
  }, [open, saved])

  const fillDate = (fillDateTime || '').slice(0, 10)
  const from = fillDate ? new Date(Date.parse(fillDate) - 14 * 864e5).toISOString().slice(0, 10) : ''
  const options = candidates
    .filter(j => !fillDate || ((j.Plan_Date || '') <= fillDate && (j.Plan_Date || '') >= from))
    .sort((a, b) => (b.Plan_Date || '').localeCompare(a.Plan_Date || ''))
  // keep linked jobs visible even if they fall outside the window
  for (const id of saved) {
    if (!options.some(o => o.Job_ID === id)) options.unshift({ Job_ID: id, Plan_Date: null, Vehicle_Plate: null, Customer_Name: null, Dest_Location: null, Est_Distance_KM: null })
  }

  const save = (next: string[]) => {
    const prev = saved
    setSaved(next)
    setOpen(false)
    startTransition(async () => {
      const res = await setFuelLogClosingJob(logId, next)
      if (res.success) toast.success(res.message)
      else { toast.error(res.message); setSaved(prev); setDraft(prev) }
    })
  }

  const toggle = (id: string) => setDraft(d => (d.includes(id) ? d.filter(x => x !== id) : [...d, id]))
  const label = saved.length === 0
    ? 'จบงาน: ให้ระบบเลือก'
    : saved.length === 1
      ? `จบงาน: ${fmtDate(options.find(o => o.Job_ID === saved[0])?.Plan_Date ?? null)} ${saved[0]}`
      : `จบงาน: ${saved.length} งาน`

  return (
    <div ref={boxRef} className="relative mt-1">
      <button
        type="button"
        disabled={pending}
        ref={btnRef}
        onClick={() => {
          const r = btnRef.current?.getBoundingClientRect()
          if (r) setPos({ top: Math.min(r.bottom + 4, window.innerHeight - 330), left: Math.min(r.left, window.innerWidth - 310) })
          setDraft(saved); setOpen(o => !o)
        }}
        title={saved.length ? `บิลนี้ตัดน้ำมันของ: ${saved.join(', ')}` : 'บิลเติมจบงานนี้ตัดน้ำมันของงานไหน — เลือกได้มากกว่า 1 งาน (เช่น วิ่งงานสั้น 2 งานแล้วค่อยเติมทีเดียว)'}
        className={cn(
          'flex h-6 max-w-[200px] items-center gap-1 rounded-md border px-1.5 text-[10px] font-semibold bg-background',
          saved.length ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400' : 'border-border text-muted-foreground'
        )}
      >
        {pending ? <Loader2 size={11} className="animate-spin shrink-0" /> : <Link2 size={11} className="shrink-0" />}
        <span className="truncate">{label}</span>
        <ChevronDown size={11} className="shrink-0 opacity-60" />
      </button>

      {open && (
        <div style={{ top: pos.top, left: pos.left }} className="fixed z-50 w-[300px] rounded-xl border border-border bg-popover p-2 shadow-xl">
          <p className="px-1 pb-1.5 text-[10px] font-semibold text-muted-foreground">เลือกงานที่บิลนี้ตัดน้ำมัน (เลือกได้หลายงาน)</p>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {options.length === 0 && <p className="px-1 py-2 text-[11px] text-muted-foreground">ไม่มีงานของรถคันนี้ในช่วง 14 วันก่อนวันเติม</p>}
            {options.map(j => (
              <label key={j.Job_ID} className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 hover:bg-muted/60">
                <input type="checkbox" className="mt-0.5" checked={draft.includes(j.Job_ID)} onChange={() => toggle(j.Job_ID)} />
                <span className="text-[11px] leading-tight">
                  <span className="font-semibold text-foreground">{fmtDate(j.Plan_Date)} · {j.Job_ID}</span>
                  {j.Dest_Location && <span className="block text-muted-foreground">{lastDrop(j.Dest_Location)}</span>}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
            <button type="button" className="text-[11px] font-semibold text-muted-foreground hover:text-foreground" onClick={() => save([])}>
              ให้ระบบเลือก
            </button>
            <button type="button" className="rounded-md bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50" disabled={!draft.length} onClick={() => save(draft)}>
              บันทึก {draft.length ? `(${draft.length} งาน)` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
