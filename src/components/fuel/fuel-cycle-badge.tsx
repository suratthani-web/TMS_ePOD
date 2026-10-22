"use client"

// Ledger chip on the end bill that closes a fill cycle: the cycle's km/L, and when
// it burned clearly more than the truck's similar-distance cycles, how much more —
// with review buttons (explained / real issue).
import { useEffect, useRef, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { Gauge, Loader2 } from "lucide-react"
import { reviewFuelCycle } from "@/app/fuel/actions"
import type { FuelCycleRow } from "@/lib/fuel/fuel-cycles"
import { cn } from "@/lib/utils"

const dm = (s: string) => `${Number(s.slice(8, 10))}/${Number(s.slice(5, 7))}`
const n1 = (v: number | null | undefined) => Math.round((Number(v) || 0) * 10) / 10

export function FuelCycleBadge({ cycle }: { cycle: FuelCycleRow }) {
  const [review, setReview] = useState(cycle.Review_Status ?? null)
  const [note, setNote] = useState(cycle.Review_Note || '')
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [pending, startTransition] = useTransition()
  const btnRef = useRef<HTMLButtonElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const inside = (t: EventTarget | null) => !!(boxRef.current?.contains(t as Node) || popRef.current?.contains(t as Node))
    const close = (e: MouseEvent) => { if (!inside(e.target)) setOpen(false) }
    const dismiss = (e: Event) => { if (!inside(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', dismiss, true)
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('scroll', dismiss, true) }
  }, [open])

  const flagged = cycle.Status === 'watch' || cycle.Status === 'critical'
  const save = (next: 'ok' | 'confirmed_issue' | null) => {
    const prev = review
    setReview(next)
    setOpen(false)
    startTransition(async () => {
      const res = await reviewFuelCycle(cycle.Cycle_ID, next, note)
      if (res.success) toast.success(res.message)
      else { toast.error(res.message); setReview(prev) }
    })
  }

  const label = !flagged
    ? `${n1(cycle.Km_Per_Liter)} กม./ล.`
    : review === 'ok' ? `ตรวจแล้ว: ปกติ · +${n1(cycle.Excess_Liters)} ล.`
    : review === 'confirmed_issue' ? `ผิดปกติจริง · +${n1(cycle.Excess_Liters)} ล.`
    : `${cycle.Status === 'critical' ? '🔴' : '🟠'} เกิน ${n1(cycle.Excess_Liters)} ล. (+${Math.round((cycle.Excess_Pct || 0) * 100)}%)`

  const tone = !flagged ? 'border-border text-muted-foreground'
    : review === 'ok' ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
    : review === 'confirmed_issue' ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
    : cycle.Status === 'critical' ? 'border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-400'
    : 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'

  const baseline = cycle.Baseline_Source === 'peers' ? `รอบระยะใกล้เคียงของรถคันนี้ ${cycle.Peer_Count} รอบ`
    : cycle.Baseline_Source === 'band' ? `รอบช่วงระยะ ${cycle.Distance_Band} กม. ของรถคันนี้ ${cycle.Peer_Count} รอบ`
    : cycle.Baseline_Source === 'type' ? `รถประเภทเดียวกัน ${cycle.Peer_Count} รอบ`
    : 'ยังมีประวัติไม่พอเทียบ'

  return (
    <div ref={boxRef} className="relative mt-1">
      <button
        ref={btnRef}
        type="button"
        disabled={pending}
        onClick={() => {
          const r = btnRef.current?.getBoundingClientRect()
          if (r) setPos({ top: Math.min(r.bottom + 4, window.innerHeight - 300), left: Math.min(r.left, window.innerWidth - 330) })
          setOpen(o => !o)
        }}
        title={`รอบบิลชนบิล ${dm(cycle.Start_Time)}–${dm(cycle.End_Time)} · ${Math.round(cycle.Km)} กม. ${n1(cycle.Liters)} ล.`}
        className={cn('flex h-6 max-w-[200px] items-center gap-1 rounded-md border px-1.5 text-[10px] font-semibold bg-background', tone)}
      >
        {pending ? <Loader2 size={11} className="animate-spin shrink-0" /> : <Gauge size={11} className="shrink-0" />}
        <span className="truncate">{label}</span>
      </button>

      {/* portal: the ledger card lifts on hover (transform), which would turn "fixed" into card-relative and clip it */}
      {open && createPortal(
        <div ref={popRef} style={{ top: pos.top, left: pos.left }} className="fixed z-50 w-[320px] rounded-xl border border-border bg-popover p-3 text-[11px] shadow-xl">
          <p className="font-semibold text-foreground">
            รอบ {dm(cycle.Start_Time)}–{dm(cycle.End_Time)} · {Math.round(cycle.Km).toLocaleString()} กม. · {n1(cycle.Liters)} ล. · ฿{Math.round(cycle.Cost).toLocaleString()}
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
            <dt>อัตราสิ้นเปลือง</dt><dd className="text-foreground">{n1(cycle.Km_Per_Liter)} กม./ล.</dd>
            <dt>ค่าปกติ</dt><dd className="text-foreground">{cycle.Baseline_Km_Per_Liter ? `${n1(cycle.Baseline_Km_Per_Liter)} กม./ล.` : '-'} <span className="text-muted-foreground">({baseline})</span></dd>
            {cycle.Peer_Example && <><dt>เทียบรอบ</dt><dd className="text-foreground">{cycle.Peer_Example}</dd></>}
            {cycle.Expected_Liters != null && <><dt>ควรใช้</dt><dd className="text-foreground">~{n1(cycle.Expected_Liters)} ล.</dd></>}
            {cycle.Excess_Liters != null && <><dt>ส่วนต่าง</dt><dd className={cn('font-semibold', flagged ? 'text-rose-600 dark:text-rose-400' : 'text-foreground')}>{cycle.Excess_Liters > 0 ? '+' : ''}{n1(cycle.Excess_Liters)} ล. ({cycle.Excess_Pct != null ? `${cycle.Excess_Pct > 0 ? '+' : ''}${Math.round(cycle.Excess_Pct * 100)}%` : '-'}) ~฿{Math.round(cycle.Excess_Cost || 0).toLocaleString()}</dd></>}
            {cycle.Job_IDs?.length > 0 && <><dt>งาน</dt><dd className="text-foreground">{cycle.Job_IDs.join(', ')} · {cycle.Drop_Count} ดรอป</dd></>}
          </dl>

          {flagged && (
            <div className="mt-3 border-t border-border pt-2">
              <p className="mb-1 font-semibold text-foreground">ผลการตรวจ</p>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="เหตุผล เช่น ของหนัก / อ้อมทาง / รถติดหนัก / รั่ว"
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-[11px]"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={() => save('ok')} className="rounded-md border border-emerald-500/40 px-2 py-1 font-semibold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">ปกติ (มีเหตุผล)</button>
                <button type="button" onClick={() => save('confirmed_issue')} className="rounded-md border border-rose-500/40 px-2 py-1 font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400">ผิดปกติจริง</button>
                {review && <button type="button" onClick={() => save(null)} className="px-2 py-1 font-semibold text-muted-foreground hover:text-foreground">ล้างการตรวจ</button>}
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">&quot;ผิดปกติจริง&quot; จะไม่ถูกใช้เป็นค่าปกติของรอบอื่น</p>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
