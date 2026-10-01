// Report periods in Bangkok calendar days. Dates are plain "YYYY-MM-DD" strings
// (same shape as Jobs_Main.Plan_Date) so no timezone math leaks into queries.

export type PeriodType = 'weekly' | 'monthly'

export type ReportPeriod = {
    type: PeriodType
    start: string // inclusive
    end: string   // inclusive
}

const pad = (n: number) => String(n).padStart(2, '0')
const toYmd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const fromYmd = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`)

export function addDays(ymd: string, days: number): string {
    const d = fromYmd(ymd)
    d.setUTCDate(d.getUTCDate() + days)
    return toYmd(d)
}

/** Today's date in Bangkok. */
export function todayBkk(now = new Date()): string {
    return toYmd(new Date(now.getTime() + 7 * 3600_000))
}

/** Week = Monday..Sunday containing `ymd`. */
export function weekOf(ymd: string): ReportPeriod {
    const d = fromYmd(ymd)
    const dow = (d.getUTCDay() + 6) % 7 // Mon=0
    const start = addDays(ymd, -dow)
    return { type: 'weekly', start, end: addDays(start, 6) }
}

export function monthOf(ymd: string): ReportPeriod {
    const d = fromYmd(ymd)
    const start = toYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
    const end = toYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
    return { type: 'monthly', start, end }
}

export function periodOf(type: PeriodType, ymd: string): ReportPeriod {
    return type === 'weekly' ? weekOf(ymd) : monthOf(ymd)
}

/** The most recent fully finished period (what Monday's / the 1st's run reports on). */
export function lastCompletedPeriod(type: PeriodType, now = new Date()): ReportPeriod {
    const today = todayBkk(now)
    const current = periodOf(type, today)
    return periodOf(type, addDays(current.start, -1))
}

export function previousPeriod(p: ReportPeriod): ReportPeriod {
    return periodOf(p.type, addDays(p.start, -1))
}

/** Every date in the period, inclusive. */
export function eachDay(p: { start: string; end: string }): string[] {
    const out: string[] = []
    for (let d = p.start; d <= p.end; d = addDays(d, 1)) out.push(d)
    return out
}

/** Mon–Sun weeks overlapping a month, clipped to the month. */
export function weeksInMonth(p: ReportPeriod): { start: string; end: string }[] {
    const out: { start: string; end: string }[] = []
    let w = weekOf(p.start)
    while (w.start <= p.end) {
        out.push({ start: w.start < p.start ? p.start : w.start, end: w.end > p.end ? p.end : w.end })
        w = weekOf(addDays(w.end, 1))
    }
    return out
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

/** "2026-09-07" → "7 ก.ย." (withYear → "7 ก.ย. 2569") */
export function thaiShortDate(ymd: string, withYear = false): string {
    const d = fromYmd(ymd)
    const base = `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]}`
    return withYear ? `${base} ${d.getUTCFullYear() + 543}` : base
}

/** "สัปดาห์ 7–13 ก.ย. 2569" / "เดือนกันยายน 2569" */
export function periodLabel(p: ReportPeriod): string {
    if (p.type === 'monthly') {
        const d = fromYmd(p.start)
        return `เดือน${TH_MONTHS_FULL[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`
    }
    const s = fromYmd(p.start)
    const e = fromYmd(p.end)
    const sameMonth = s.getUTCMonth() === e.getUTCMonth()
    return `สัปดาห์ ${s.getUTCDate()}${sameMonth ? '' : ` ${TH_MONTHS[s.getUTCMonth()]}`}–${thaiShortDate(p.end, true)}`
}

export function isValidYmd(s: unknown): s is string {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromYmd(s).getTime())
}
