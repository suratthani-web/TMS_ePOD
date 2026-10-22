// Shared by the fuel page and the Trip Performance report: how a job's fuel was
// matched to real bills, and the fill labels the admin should review.
// No hooks — renders in both server and client components.
import type { FuelConfidence, FuelFlag } from "@/lib/fuel/bill-allocation"
import { cn } from "@/lib/utils"

const CONFIDENCE_STYLE: Record<FuelConfidence | 'estimate', { label: string; className: string }> = {
  confirmed: { label: 'ยืนยันแล้ว', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30' },
  high: { label: 'มั่นใจสูง', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
  medium: { label: 'ปานกลาง', className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  low: { label: 'ต่ำ', className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30' },
  estimate: { label: 'ประมาณ', className: 'bg-muted text-muted-foreground border-border' },
}

export type FuelMatchInfo = {
  confidence: FuelConfidence
  ratio: number
  groupJobs: number
  fills: string[]
  open: boolean
} | null

/** Small badge: confidence + odometer fit; hover shows the matched fills. */
export function FuelMatchBadge({ match, className }: { match: FuelMatchInfo; className?: string }) {
  const key = match ? match.confidence : 'estimate'
  const style = CONFIDENCE_STYLE[key]
  const title = match
    ? [
        `บิลที่จับคู่: ${match.fills.join(', ')}`,
        match.confidence === 'confirmed' ? 'แอดมินผูกบิลจบงานกับงานนี้แล้ว' : '',
        match.groupJobs > 1 ? `ใช้บิลชุดนี้ร่วมกัน ${match.groupJobs} งาน (แบ่งตามระยะงาน)` : 'บิลชุดนี้เป็นของงานนี้งานเดียว',
        match.ratio > 0 ? `ไมล์จริง ${Math.round(match.ratio * 100)}% ของระยะงานไป-กลับ` : 'ไม่มีเลขไมล์ให้ตรวจ',
        match.open ? 'ยังไม่มีบิลจบงานปิดรอบ — เป็นน้ำมันเท่าที่เติมถึงตอนนี้' : '',
      ].filter(Boolean).join('\n')
    : 'ยังไม่มีบิลจบงานมาปิดงานนี้ในช่วงที่เลือก — ใช้ค่าประมาณตามระยะทาง (รถร่วม = 0)'
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap cursor-help', style.className, className)}>
      {style.label}
      {match && match.ratio > 0 && <span className="opacity-70">{Math.round(match.ratio * 100)}%</span>}
      {match && match.groupJobs > 1 && <span className="opacity-70">· {match.groupJobs} งาน</span>}
    </span>
  )
}

const FLAG_LABEL: Record<FuelFlag['kind'], string> = {
  end_mid_trip: 'ป้าย "จบงาน" น่าสงสัย',
  no_job: 'รถวิ่งแต่ไม่มีงาน',
  km_mismatch: 'ไมล์ไม่ตรงระยะงาน',
  no_odometer: 'บิลไม่มีเลขไมล์',
  link_conflict: 'การผูกงานขัดกัน',
}

const fmtStamp = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`

/** Collapsible list of fills / jobs to review. */
export function FuelFlagsPanel({ flags, className }: { flags: FuelFlag[]; className?: string }) {
  if (!flags.length) return null
  const counts = flags.reduce<Record<string, number>>((m, f) => ({ ...m, [f.kind]: (m[f.kind] || 0) + 1 }), {})
  return (
    <details className={cn('rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs', className)}>
      <summary className="cursor-pointer font-semibold text-amber-700 dark:text-amber-400">
        ป้ายเติม / งานที่ควรตรวจ {flags.length} รายการ
        <span className="ml-2 font-normal text-muted-foreground">
          {Object.entries(counts).map(([k, n]) => `${FLAG_LABEL[k as FuelFlag['kind']]} ${n}`).join(' · ')}
        </span>
      </summary>
      <p className="mt-2 text-[11px] text-muted-foreground">
        ระบบใช้กติกา &quot;เติมจบงาน = ตัดน้ำมันงานล่าสุด&quot; แล้วตรวจกับเลขไมล์ (งานควรใช้ราว 2× ระยะงาน) — แก้ป้ายเติม/วันที่งาน หรือผูกบิลจบงานกับงานในแท็บ &quot;ประวัติการเติมน้ำมันละเอียด&quot; ตัวเลขจะแม่นขึ้น
      </p>
      <ul className="mt-2 space-y-1.5">
        {flags.map((f, i) => (
          <li key={i} className="flex flex-wrap gap-x-2 gap-y-0.5">
            <span className="font-semibold text-foreground whitespace-nowrap">{fmtStamp(f.at)} · {f.plate}</span>
            <span className="rounded bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">{FLAG_LABEL[f.kind]}</span>
            <span className="text-muted-foreground">{f.message}</span>
            {f.jobIds.length > 0 && <span className="text-[10px] text-muted-foreground">({f.jobIds.join(', ')})</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}
