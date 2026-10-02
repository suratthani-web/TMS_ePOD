"use client"

// Customer report dashboard — a light "report sheet" (fixed palette, not theme
// tokens) so it matches the e-mail and prints cleanly, in any app theme.
// Data comes from lib/reports/customer-metrics (same numbers as the e-mail).

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { AlertTriangle, CheckCircle2, Clock, Leaf, MapPin, Truck } from "lucide-react"
import type { CustomerReportData, JobLine, PeriodSummary } from "@/lib/reports/customer-metrics"
import { periodLabel, thaiShortDate } from "@/lib/reports/period"

const BLUE = "#0047BB" // on-time / main series
const RED = "#d03b3b"  // late — always with a text label
const GRID = "#e5e7eb"
const AXIS = "#6b7280"

const num = (n: number) => n.toLocaleString("en-US")
const fmtPct = (n: number | null) => (n === null ? "–" : `${n}%`)

function Delta({ curr, prev, mode, higherIsBetter = true, word }: { curr: number | null; prev: number | null; mode: "relative" | "points"; higherIsBetter?: boolean; word: string }) {
    if (curr === null || prev === null || (mode === "relative" && prev === 0)) return <span className="text-slate-500">ไม่มีข้อมูล{word}</span>
    const diff = mode === "relative" ? Math.round(((curr - prev) / prev) * 1000) / 10 : Math.round((curr - prev) * 10) / 10
    if (diff === 0) return <span className="text-slate-500">เท่ากับ{word}</span>
    const good = diff > 0 === higherIsBetter
    return (
        <span className={good ? "text-green-700" : "text-red-700"}>
            {diff > 0 ? "▲" : "▼"} {Math.abs(diff)}{mode === "relative" ? "%" : " จุด"} <span className="text-slate-500">เทียบ{word}</span>
        </span>
    )
}

function Kpi({ icon, label, value, unit, foot }: { icon: React.ReactNode; label: string; value: string; unit?: string; foot: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">{icon}{label}</div>
            <div className="mt-1 text-3xl font-bold text-slate-900 tabular-nums">
                {value}{unit && <span className="ml-1 text-base font-normal text-slate-600">{unit}</span>}
            </div>
            <div className="mt-1 text-xs">{foot}</div>
        </div>
    )
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
    return (
        <section className={`report-panel rounded-xl border border-slate-200 bg-white p-4 sm:p-5 ${className}`}>
            <h3 className="mb-3 font-semibold text-[#001E4C]">{title}</h3>
            {children}
        </section>
    )
}

function JobList({ lines, empty }: { lines: JobLine[]; empty?: string }) {
    if (!lines.length) return <p className="text-sm text-green-700">{empty || "ไม่มีรายการ"}</p>
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-1.5 pr-3 font-medium">วันที่</th>
                        <th className="py-1.5 pr-3 font-medium">ปลายทาง</th>
                        <th className="py-1.5 font-medium">รายละเอียด</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map(l => (
                        <tr key={l.jobId} className="border-b border-slate-100 align-top">
                            <td className="py-1.5 pr-3 whitespace-nowrap">{thaiShortDate(l.date)}</td>
                            <td className="py-1.5 pr-3">{l.destination}<div className="font-mono text-xs text-slate-500">{l.jobId}</div></td>
                            <td className="py-1.5 text-slate-600">{l.detail}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

type TooltipPayload = { payload?: { label: string; jobs: number; onTime: number; late: number; onTimePct: number | null } }[]

function VolumeTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload }) {
    const p = active && payload?.[0]?.payload
    if (!p) return null
    return (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-md">
            <div className="mb-1 font-semibold">{p.label}</div>
            <div>งานทั้งหมด {p.jobs}</div>
            <div className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: BLUE }} />ตรงเวลา/อื่นๆ {p.jobs - p.late}</div>
            <div className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: RED }} />ส่งช้า {p.late}</div>
            <div className="mt-1 text-slate-500">ส่งตรงเวลา {fmtPct(p.onTimePct)}</div>
        </div>
    )
}

export function CustomerReportDashboard({ data, isAdminView = false }: { data: CustomerReportData; isAdminView?: boolean }) {
    const s: PeriodSummary = data.summary
    const p: PeriodSummary = data.previous
    const word = data.period.type === "weekly" ? "สัปดาห์ก่อน" : "เดือนก่อน"
    const chartData = data.series.map(x => ({
        ...x,
        label: data.period.type === "weekly" ? thaiShortDate(x.start) : `${x.label}`,
        onTimeBar: x.jobs - x.late,
    }))

    return (
        <div className="customer-report space-y-4 text-slate-900">
            <div className="rounded-xl bg-[#001E4C] px-5 py-4 text-white">
                <p className="text-sm opacity-80">รายงานสรุปงานขนส่ง</p>
                <h2 className="text-xl font-bold sm:text-2xl">{data.customerName}</h2>
                <p className="text-sm">{periodLabel(data.period)} · {thaiShortDate(data.period.start, true)} – {thaiShortDate(data.period.end, true)}</p>
            </div>

            {isAdminView && data.flags.length > 0 && (
                <div className="report-admin-only rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle size={16} />ตรวจก่อนส่ง (ลูกค้าไม่เห็นส่วนนี้)</div>
                    <ul className="list-disc pl-5">{data.flags.map(f => <li key={f.code}>{f.message}</li>)}</ul>
                </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi icon={<Truck size={16} />} label="งานขนส่งทั้งหมด" value={num(s.jobs)} unit="งาน"
                    foot={<><Delta curr={s.jobs} prev={p.jobs} mode="relative" word={word} />{s.drops !== s.jobs && <span className="text-slate-500"> · {num(s.drops)} จุดส่ง</span>}</>} />
                <Kpi icon={<Clock size={16} />} label="ส่งตรงเวลา" value={fmtPct(s.onTimePct)}
                    foot={<><Delta curr={s.onTimePct} prev={p.onTimePct} mode="points" word={word} /><span className="text-slate-500"> · {num(s.onTime)}/{num(s.onTimeMeasured)} งาน</span></>} />
                <Kpi icon={<CheckCircle2 size={16} />} label="หลักฐานการส่งครบ" value={fmtPct(s.podPct)}
                    foot={<span className="text-slate-500">มีรูป/ลายเซ็น {num(s.podComplete)}/{num(s.delivered)} งาน</span>} />
                <Kpi icon={<MapPin size={16} />} label="ระยะทางรวม" value={num(s.distanceKm)} unit="กม."
                    foot={<Delta curr={s.distanceKm} prev={p.distanceKm} mode="relative" word={word} />} />
            </div>

            {s.jobs > 0 && (
                <Panel title={data.period.type === "weekly" ? "ปริมาณงานรายวัน" : "ปริมาณงานรายสัปดาห์"}>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="28%">
                                <CartesianGrid vertical={false} stroke={GRID} />
                                <XAxis dataKey="label" tick={{ fontSize: 12, fill: AXIS }} axisLine={{ stroke: GRID }} tickLine={false} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: AXIS }} axisLine={false} tickLine={false} />
                                <Tooltip content={<VolumeTooltip />} cursor={{ fill: "rgba(0,71,187,0.06)" }} />
                                <Legend iconType="square" wrapperStyle={{ fontSize: 12, color: AXIS }} />
                                <Bar dataKey="onTimeBar" name="ส่งตรงเวลา" stackId="v" fill={BLUE} stroke="#fff" strokeWidth={1} isAnimationActive={false} />
                                <Bar dataKey="late" name="ส่งช้า" stackId="v" fill={RED} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <details className="mt-2 text-sm">
                        <summary className="cursor-pointer text-slate-500">ดูเป็นตาราง</summary>
                        <table className="mt-2 w-full text-sm">
                            <thead><tr className="border-b text-left text-slate-500"><th className="py-1 font-medium">ช่วง</th><th className="py-1 text-right font-medium">งาน</th><th className="py-1 text-right font-medium">ส่งช้า</th><th className="py-1 text-right font-medium">ตรงเวลา</th></tr></thead>
                            <tbody>{data.series.map(x => (
                                <tr key={x.start} className="border-b border-slate-100">
                                    <td className="py-1">{data.period.type === "weekly" ? thaiShortDate(x.start) : `${x.label} (${thaiShortDate(x.start)}–${thaiShortDate(x.end)})`}</td>
                                    <td className="py-1 text-right tabular-nums">{x.jobs}</td>
                                    <td className="py-1 text-right tabular-nums">{x.late}</td>
                                    <td className="py-1 text-right tabular-nums">{fmtPct(x.onTimePct)}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </details>
                </Panel>
            )}

            <Panel title="สรุปการขนส่ง">
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><dt className="text-slate-500">ส่งสำเร็จ</dt><dd className="text-xl font-semibold tabular-nums">{num(s.delivered)} งาน</dd></div>
                    <div><dt className="text-slate-500">ส่งไม่สำเร็จ</dt><dd className="text-xl font-semibold tabular-nums">{num(s.failed)} งาน</dd></div>
                    <div><dt className="text-slate-500">จุดส่งทั้งหมด</dt><dd className="text-xl font-semibold tabular-nums">{num(s.drops)} จุด</dd></div>
                    <div><dt className="text-slate-500">เวลารับ→ส่งเฉลี่ย</dt><dd className="text-xl font-semibold tabular-nums">{s.avgLeadTimeHours !== null ? `${s.avgLeadTimeHours} ชม.` : "–"}</dd></div>
                </dl>
            </Panel>

            {data.carbon && (
                <Panel title="การปล่อยคาร์บอน (ESG)">
                    <div className="flex items-start gap-3">
                        <Leaf className="mt-1 text-green-700" size={20} />
                        <div>
                            <p className="text-2xl font-bold tabular-nums">{num(data.carbon.co2Kg)} <span className="text-base font-normal text-slate-600">kgCO₂e</span></p>
                            <p className="text-sm text-slate-600">เฉลี่ย {data.carbon.kgPerJob} kg/งาน · GLEC / ISO 14083 จาก {num(data.carbon.jobsCounted)} งาน · เทียบเท่าต้นไม้ {num(Math.round(data.carbon.trees))} ต้น/ปี</p>
                        </div>
                    </div>
                </Panel>
            )}

            <Panel title={`ส่งช้า (${data.lateJobs.length})`}>
                <JobList lines={data.lateJobs} empty="✓ ไม่มีงานส่งช้าในช่วงนี้" />
            </Panel>
            {data.failedJobs.length > 0 && (
                <Panel title={`ส่งไม่สำเร็จ (${data.failedJobs.length})`}><JobList lines={data.failedJobs} /></Panel>
            )}

            {isAdminView && (data.openJobs.length > 0 || data.podMissing.length > 0) && (
                <div className="report-admin-only grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {data.openJobs.length > 0 && <Panel title={`งานยังไม่ปิด (${data.openJobs.length}) — แอดมินเท่านั้น`}><JobList lines={data.openJobs} /></Panel>}
                    {data.podMissing.length > 0 && <Panel title={`ไม่มีหลักฐานการส่ง (${data.podMissing.length}) — แอดมินเท่านั้น`}><JobList lines={data.podMissing} /></Panel>}
                </div>
            )}

            <p className="flex items-start gap-1.5 text-xs text-slate-500">
                <MapPin size={12} className="mt-0.5 shrink-0" />
                ส่งตรงเวลา = ส่งถึงภายในวันส่งที่กำหนด หรือก่อน 08:00 น. ของวันถัดไปสำหรับรอบกลางคืน วัดจากเวลาในหลักฐานการส่ง (POD) · ข้อมูล ณ {new Date(data.generatedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })}
            </p>
        </div>
    )
}
