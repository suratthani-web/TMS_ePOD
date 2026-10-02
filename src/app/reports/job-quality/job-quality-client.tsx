"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlarmClock, CalendarClock, ChevronLeft, ChevronRight, FileWarning, Hand, Hourglass, X } from "lucide-react"
import { addDays, periodLabel, periodOf, todayBkk, type PeriodType } from "@/lib/reports/period"
import type { DriverQuality, JobQualityData, QualityIssue } from "@/lib/reports/job-quality"

const TABS: { key: QualityIssue; label: string; hint: string; icon: React.ReactNode }[] = [
    { key: "stuck_open", label: "งานค้างไม่ปิด", hint: "ยังไม่ปิดทั้งที่เลยกำหนดส่งแล้ว — แอดมินพลาดหรือคนขับลืมปิด", icon: <Hourglass size={16} /> },
    { key: "closed_late", label: "ปิดงานช้า", hint: "หลักฐานการส่งเข้าระบบหลังกำหนด (วันส่ง + 08:00 น. เช้าวันถัดไป)", icon: <AlarmClock size={16} /> },
    { key: "pod_missing", label: "POD ไม่ครบ", hint: "สถานะส่งแล้ว แต่ไม่มีรูปหรือลายเซ็น", icon: <FileWarning size={16} /> },
    { key: "created_late", label: "สร้างงานย้อนหลัง", hint: "สร้างงานในระบบหลังวันที่วางแผนไว้ (ส่วนใหญ่เป็นงานฝั่งแอดมิน)", icon: <CalendarClock size={16} /> },
    { key: "backfilled", label: "กดรับ-ส่งพร้อมกัน", hint: "กดรับสินค้าพร้อมกับส่ง (ห่างกันไม่ถึง 10 นาที) แทนการกดตอนรับของจริง — ใช้ดูวินัย ไม่นับเป็นปัญหา", icon: <Hand size={16} /> },
]

const pctText = (n: number | null) => (n === null ? "–" : `${n}%`)

function Tile({ label, value, sub, tone = "default", onClick, active }: { label: string; value: string; sub?: string; tone?: "default" | "warn"; onClick?: () => void; active?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-xl border p-4 text-left transition-colors ${tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100" : "border-border bg-card text-foreground"} ${active ? "ring-2 ring-primary" : ""} ${onClick ? "hover:border-primary/50" : "cursor-default"}`}
        >
            <div className="text-sm opacity-80">{label}</div>
            <div className="text-2xl font-bold tabular-nums">{value}</div>
            {sub && <div className="text-xs opacity-70">{sub}</div>}
        </button>
    )
}

export function JobQualityClient({ type, start, data }: { type: PeriodType; start: string; data: JobQualityData }) {
    const router = useRouter()
    const [tab, setTab] = useState<QualityIssue>("stuck_open")
    const [driver, setDriver] = useState<DriverQuality | null>(null)
    const period = periodOf(type, start)
    const current = periodOf(type, todayBkk())
    const t = data.totals

    const go = (nt: PeriodType, s: string) => router.push(`/reports/job-quality?type=${nt}&start=${periodOf(nt, s).start}`)
    const lines = useMemo(() => (driver ? data.lists[tab].filter(l => l.driverKey === driver.key) : data.lists[tab]), [data, tab, driver])
    const countFor = (k: QualityIssue) => (driver ? data.lists[k].filter(l => l.driverKey === driver.key).length : data.lists[k].length)
    const activeTab = TABS.find(x => x.key === tab)!

    return (
        <div className="mx-auto max-w-7xl space-y-5 pb-16 text-foreground">
            <div>
                <h1 className="text-2xl font-bold text-foreground">คุณภาพการปิดงาน</h1>
                <p className="text-sm text-muted-foreground">ใช้ภายในสำหรับผู้บริหาร/แอดมิน — ลูกค้าไม่เห็นข้อมูลหน้านี้ · ใช้ประเมินคนขับและติดตามงานค้าง</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
                <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="ช่วงเวลา">
                    {(["weekly", "monthly"] as const).map(x => (
                        <button key={x} role="tab" aria-selected={type === x} onClick={() => go(x, todayBkk())}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium ${type === x ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                            {x === "weekly" ? "รายสัปดาห์" : "รายเดือน"}
                        </button>
                    ))}
                </div>
                <button aria-label="ช่วงก่อนหน้า" onClick={() => go(type, addDays(period.start, -1))} className="rounded-lg p-2 hover:bg-muted"><ChevronLeft size={18} /></button>
                <span className="min-w-[11rem] text-center text-sm font-semibold">{periodLabel(period)}</span>
                <button aria-label="ช่วงถัดไป" disabled={period.start >= current.start} onClick={() => go(type, addDays(period.end, 1))} className="rounded-lg p-2 hover:bg-muted disabled:opacity-30"><ChevronRight size={18} /></button>
                <span className="ml-auto text-xs text-muted-foreground">{t.jobs.toLocaleString()} งาน · ส่งแล้ว {t.delivered.toLocaleString()}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {TABS.map(x => {
                    const n = { stuck_open: t.stuckOpen, closed_late: t.closedLate, pod_missing: t.podMissing, created_late: t.createdLate, backfilled: t.backfilled }[x.key]
                    return <Tile key={x.key} label={x.label} value={n.toLocaleString()} tone={x.key !== "backfilled" && n > 0 ? "warn" : "default"}
                        sub={x.key === "backfilled" ? `กดรับตามจริง ${pctText(t.pickupCompliancePct)}` : undefined}
                        onClick={() => setTab(x.key)} active={tab === x.key} />
                })}
                <Tile label="ปิดงานทันเวลา (กดตามจริง)" value={pctText(t.onTimeClosePct)} sub="ของงานที่ส่งแล้ว" />
            </div>

            <section className="rounded-2xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h2 className="font-semibold">รายคนขับ</h2>
                    <span className="text-xs text-muted-foreground">คลิกชื่อเพื่อกรองรายการด้านล่าง · เรียงตามจำนวนปัญหา</span>
                </div>
                <div className="max-h-[420px] overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-card">
                            <tr className="border-b border-border text-left text-muted-foreground">
                                <th className="px-4 py-2 font-medium">คนขับ</th>
                                <th className="px-2 py-2 text-right font-medium">งาน</th>
                                <th className="px-2 py-2 text-right font-medium">ค้าง</th>
                                <th className="px-2 py-2 text-right font-medium">ปิดช้า</th>
                                <th className="px-2 py-2 text-right font-medium">POD ไม่ครบ</th>
                                <th className="px-2 py-2 text-right font-medium">สร้างย้อนหลัง</th>
                                <th className="px-2 py-2 text-right font-medium">กดรับตามจริง</th>
                                <th className="px-4 py-2 text-right font-medium">รวมปัญหา</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.drivers.map(d => (
                                <tr key={d.key} onClick={() => setDriver(driver?.key === d.key ? null : d)}
                                    className={`cursor-pointer border-b border-border/60 hover:bg-muted/50 ${driver?.key === d.key ? "bg-primary/10" : ""}`}>
                                    <td className="px-4 py-2 font-medium">{d.name}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{d.jobs}</td>
                                    <td className={`px-2 py-2 text-right tabular-nums ${d.stuckOpen ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{d.stuckOpen}</td>
                                    <td className={`px-2 py-2 text-right tabular-nums ${d.closedLate ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{d.closedLate}</td>
                                    <td className={`px-2 py-2 text-right tabular-nums ${d.podMissing ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{d.podMissing}</td>
                                    <td className={`px-2 py-2 text-right tabular-nums ${d.createdLate ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{d.createdLate}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{pctText(d.pickupCompliancePct)}</td>
                                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{d.issues}</td>
                                </tr>
                            ))}
                            {data.drivers.length === 0 && (
                                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">ไม่มีงานในช่วงนี้</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="rounded-2xl border border-border bg-card">
                <div className="flex flex-wrap gap-1 border-b border-border p-2" role="tablist">
                    {TABS.map(x => (
                        <button key={x.key} role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${tab === x.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                            {x.icon}{x.label} <span className="tabular-nums opacity-80">({countFor(x.key)})</span>
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
                    <span>{activeTab.hint}</span>
                    {driver && (
                        <button onClick={() => setDriver(null)} className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-primary">
                            เฉพาะ {driver.name} <X size={12} />
                        </button>
                    )}
                </div>
                <div className="max-h-[520px] overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-card">
                            <tr className="border-b border-border text-left text-muted-foreground">
                                <th className="px-4 py-2 font-medium">วันที่</th>
                                <th className="px-2 py-2 font-medium">งาน</th>
                                <th className="px-2 py-2 font-medium">คนขับ</th>
                                <th className="px-2 py-2 font-medium">ลูกค้า / ปลายทาง</th>
                                <th className="px-4 py-2 font-medium">รายละเอียด</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.slice(0, 300).map(l => (
                                <tr key={`${tab}-${l.jobId}`} className="border-b border-border/60 align-top">
                                    <td className="whitespace-nowrap px-4 py-2">{new Date(`${l.date}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" })}</td>
                                    <td className="px-2 py-2 font-mono text-xs">{l.jobId}</td>
                                    <td className="px-2 py-2">{l.driver}</td>
                                    <td className="px-2 py-2">{l.customer}<div className="text-xs text-muted-foreground">{l.destination}</div></td>
                                    <td className="px-4 py-2 text-muted-foreground">{l.detail}</td>
                                </tr>
                            ))}
                            {lines.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-green-700 dark:text-green-400">✓ ไม่มีรายการ</td></tr>}
                        </tbody>
                    </table>
                    {lines.length > 300 && <p className="px-4 py-2 text-xs text-muted-foreground">แสดง 300 จาก {lines.length} รายการ — กรองตามคนขับเพื่อดูเพิ่ม</p>}
                </div>
            </section>
        </div>
    )
}
