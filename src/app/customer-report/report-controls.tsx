"use client"

import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Printer } from "lucide-react"
import { addDays, periodLabel, periodOf, todayBkk, type PeriodType } from "@/lib/reports/period"

type Props = {
    type: PeriodType
    start: string
    customers?: { Customer_ID: string; Customer_Name: string }[]
    customerId: string
}

export function ReportControls({ type, start, customers, customerId }: Props) {
    const router = useRouter()
    const period = periodOf(type, start || todayBkk())
    const current = periodOf(type, todayBkk())

    const go = (next: { type?: PeriodType; start?: string; customer?: string }) => {
        const q = new URLSearchParams()
        const t = next.type ?? type
        q.set("type", t)
        q.set("start", periodOf(t, next.start ?? period.start).start)
        const c = next.customer ?? customerId
        if (c) q.set("customer", c)
        router.push(`/customer-report?${q.toString()}`)
    }

    return (
        <div className="report-controls flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="รอบรายงาน">
                    {(["weekly", "monthly"] as const).map(t => (
                        <button
                            key={t}
                            role="tab"
                            aria-selected={type === t}
                            onClick={() => go({ type: t })}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium ${type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        >
                            {t === "weekly" ? "รายสัปดาห์" : "รายเดือน"}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    <button aria-label="ช่วงก่อนหน้า" onClick={() => go({ start: addDays(period.start, -1) })} className="rounded-lg p-2 hover:bg-muted"><ChevronLeft size={18} /></button>
                    <span className="min-w-[11rem] text-center text-sm font-semibold">{periodLabel(period)}</span>
                    <button
                        aria-label="ช่วงถัดไป"
                        disabled={period.start >= current.start}
                        onClick={() => go({ start: addDays(period.end, 1) })}
                        className="rounded-lg p-2 hover:bg-muted disabled:opacity-30"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {customers && (
                    <select
                        aria-label="เลือกลูกค้า"
                        value={customerId}
                        onChange={e => go({ customer: e.target.value })}
                        className="h-9 max-w-[22rem] rounded-lg border border-border bg-background px-2 text-sm"
                    >
                        <option value="">— เลือกลูกค้า —</option>
                        {customers.map(c => <option key={c.Customer_ID} value={c.Customer_ID}>{c.Customer_Name}</option>)}
                    </select>
                )}
                <button onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted">
                    <Printer size={16} /> พิมพ์ / บันทึก PDF
                </button>
            </div>
        </div>
    )
}
