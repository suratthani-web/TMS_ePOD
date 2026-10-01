"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, ChevronLeft, ChevronRight, Eye, Loader2, Mail, MessageSquareText, RefreshCw, Send, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { addDays, lastCompletedPeriod, periodLabel, periodOf, type PeriodType } from "@/lib/reports/period"
import type { ReportSettings } from "@/lib/reports/customer-report-service"
import {
    generateCustomerReportsAction, saveReportNoteAction, saveReportSettingsAction,
    sendCustomerReportAction, sendReadyReportsAction, type ReportListItem,
} from "./actions"

const STATUS: Record<string, { label: string; cls: string }> = {
    draft: { label: "ร่าง", cls: "bg-slate-100 text-slate-700 border-slate-300" },
    sent: { label: "ส่งแล้ว", cls: "bg-green-50 text-green-800 border-green-300" },
    failed: { label: "ส่งไม่สำเร็จ", cls: "bg-red-50 text-red-700 border-red-300" },
    skipped: { label: "ไม่มีงาน", cls: "bg-slate-50 text-slate-500 border-slate-200" },
}

const isBlocked = (it: ReportListItem) => (it.Flags_Json || []).some(f => f.level === "warning")

export function CustomerReportsQueue({ type, start, items, error }: { type: PeriodType; start: string; items: ReportListItem[]; error?: string }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [busyId, setBusyId] = useState<string | null>(null)
    const [settingsFor, setSettingsFor] = useState<ReportListItem | null>(null)
    const [noteFor, setNoteFor] = useState<ReportListItem | null>(null)
    const period = periodOf(type, start)
    const latest = lastCompletedPeriod(type)

    const go = (t: PeriodType, s: string) => router.push(`/reports/customer-reports?type=${t}&start=${periodOf(t, s).start}`)
    const run = (id: string | null, fn: () => Promise<{ success: boolean; message: string }>) => {
        setBusyId(id)
        startTransition(async () => {
            const res = await fn()
            if (res.success) toast.success(res.message)
            else toast.error(res.message)
            setBusyId(null)
            router.refresh()
        })
    }

    const ready = items.filter(it => (it.Status === "draft" || it.Status === "failed") && !isBlocked(it))
    const needsReview = items.filter(it => (it.Status === "draft" || it.Status === "failed") && isBlocked(it))
    const sent = items.filter(it => it.Status === "sent")

    return (
        <div className="mx-auto max-w-6xl space-y-5 pb-16">
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold text-foreground">รายงานลูกค้า (ส่งอีเมล)</h1>
                <p className="text-sm text-muted-foreground">
                    ระบบสร้างร่างให้อัตโนมัติทุกเช้าวันจันทร์ (รายสัปดาห์) และวันที่ 1 (รายเดือน) — ตรวจธงเตือน แล้วกด “ส่งทั้งหมดที่พร้อม”
                </p>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="รอบรายงาน">
                        {(["weekly", "monthly"] as const).map(t => (
                            <button key={t} role="tab" aria-selected={type === t} onClick={() => go(t, lastCompletedPeriod(t).start)}
                                className={`rounded-md px-3 py-1.5 text-sm font-medium ${type === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                                {t === "weekly" ? "รายสัปดาห์" : "รายเดือน"}
                            </button>
                        ))}
                    </div>
                    <button aria-label="ช่วงก่อนหน้า" onClick={() => go(type, addDays(period.start, -1))} className="rounded-lg p-2 hover:bg-muted"><ChevronLeft size={18} /></button>
                    <span className="min-w-[11rem] text-center text-sm font-semibold">{periodLabel(period)}</span>
                    <button aria-label="ช่วงถัดไป" disabled={period.start >= latest.start} onClick={() => go(type, addDays(period.end, 1))} className="rounded-lg p-2 hover:bg-muted disabled:opacity-30"><ChevronRight size={18} /></button>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={pending} onClick={() => run("__gen", () => generateCustomerReportsAction(type, period.start))}>
                        {busyId === "__gen" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        {items.length ? "อัปเดตตัวเลข" : "สร้างรายงาน"}
                    </Button>
                    <Button disabled={pending || ready.length === 0}
                        onClick={() => { if (confirm(`ส่งอีเมลรายงานให้ลูกค้า ${ready.length} ราย?`)) run("__send", () => sendReadyReportsAction(type, period.start)) }}>
                        {busyId === "__send" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        ส่งทั้งหมดที่พร้อม ({ready.length})
                    </Button>
                </div>
            </div>

            {error && <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">{error}</p>}

            {!error && items.length > 0 && (
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div className="rounded-xl border border-border bg-card p-3"><div className="text-2xl font-bold">{ready.length}</div><div className="text-muted-foreground">พร้อมส่ง</div></div>
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900"><div className="text-2xl font-bold">{needsReview.length}</div><div>ต้องตรวจ</div></div>
                    <div className="rounded-xl border border-border bg-card p-3"><div className="text-2xl font-bold">{sent.length}</div><div className="text-muted-foreground">ส่งแล้ว</div></div>
                </div>
            )}

            {!error && items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
                    ยังไม่มีรายงานของ{periodLabel(period)} — กด “สร้างรายงาน”
                </div>
            )}

            <ul className="space-y-3">
                {items.map(it => {
                    const m = it.Metrics_Json?.summary
                    const st = STATUS[it.Status] || STATUS.draft
                    const busy = busyId === it.Report_ID
                    return (
                        <li key={it.Report_ID} className="rounded-2xl border border-border bg-card p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold text-foreground">{it.Customer_Name || it.Customer_ID}</span>
                                        <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                                        {it.settings.Auto_Send && <span className="rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-800">ส่งอัตโนมัติ</span>}
                                    </div>
                                    {m && (
                                        <p className="text-sm text-muted-foreground">
                                            {m.jobs} งาน · ส่งตรงเวลา {m.onTimePct ?? "–"}% · หลักฐานครบ {m.podPct ?? "–"}% · {m.qty.toLocaleString()} ชิ้น
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        <Mail className="mr-1 inline h-3 w-3" />
                                        {it.settings.Recipients_To.length ? [...it.settings.Recipients_To, ...it.settings.Recipients_Cc.map(c => `cc: ${c}`)].join(", ") : "ยังไม่ได้ตั้งผู้รับ"}
                                    </p>
                                    {it.Status === "sent" && it.Sent_At && <p className="text-xs text-green-700">ส่งเมื่อ {new Date(it.Sent_At).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" })}</p>}
                                    {it.Status === "failed" && it.Error && <p className="text-xs text-red-600">{it.Error}</p>}
                                    {(it.Flags_Json || []).length > 0 && (
                                        <ul className="flex flex-wrap gap-1.5 pt-1">
                                            {it.Flags_Json.map(f => (
                                                <li key={f.code} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${f.level === "warning" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>
                                                    {f.level === "warning" && <AlertTriangle className="h-3 w-3" />}{f.message}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {it.Admin_Note && <p className="border-l-2 border-primary/40 pl-2 text-xs text-muted-foreground">หมายเหตุ: {it.Admin_Note}</p>}
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2">
                                    <Button asChild variant="outline" size="sm">
                                        <Link href={`/customer-report?type=${type}&start=${period.start}&customer=${encodeURIComponent(it.Customer_ID)}`} target="_blank"><Eye className="mr-1.5 h-4 w-4" />ดู</Link>
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => setSettingsFor(it)}><Settings2 className="mr-1.5 h-4 w-4" />ผู้รับ/ตั้งค่า</Button>
                                    <Button variant="outline" size="sm" onClick={() => setNoteFor(it)}><MessageSquareText className="mr-1.5 h-4 w-4" />หมายเหตุ</Button>
                                    <Button variant="outline" size="sm" disabled={pending} title="คำนวณตัวเลขใหม่"
                                        onClick={() => run(it.Report_ID, () => generateCustomerReportsAction(type, period.start, [it.Customer_ID]))}>
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                    {it.Status !== "skipped" && (
                                        <Button size="sm" disabled={pending || it.settings.Recipients_To.length === 0}
                                            variant={isBlocked(it) ? "outline" : "default"}
                                            onClick={() => {
                                                const warn = isBlocked(it) ? "\nรายงานนี้มีธงเตือน — ตรวจแล้วใช่ไหม?" : ""
                                                if (confirm(`ส่งรายงานให้ ${it.Customer_Name}${it.Status === "sent" ? " (ส่งซ้ำ)" : ""}?${warn}`)) run(it.Report_ID, () => sendCustomerReportAction(it.Report_ID))
                                            }}>
                                            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                                            {it.Status === "sent" ? "ส่งซ้ำ" : "ส่ง"}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </li>
                    )
                })}
            </ul>

            {settingsFor && (
                <SettingsDialog
                    item={settingsFor}
                    onClose={() => setSettingsFor(null)}
                    onSave={s => run(settingsFor.Report_ID, async () => {
                        const res = await saveReportSettingsAction(settingsFor.Customer_ID, s)
                        if (res.success) setSettingsFor(null)
                        return res
                    })}
                    saving={pending}
                />
            )}
            {noteFor && (
                <NoteDialog
                    item={noteFor}
                    onClose={() => setNoteFor(null)}
                    onSave={note => run(noteFor.Report_ID, async () => {
                        const res = await saveReportNoteAction(noteFor.Report_ID, note)
                        if (res.success) setNoteFor(null)
                        return res
                    })}
                    saving={pending}
                />
            )}
        </div>
    )
}

const splitEmails = (s: string) => s.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean)

function SettingsDialog({ item, onClose, onSave, saving }: { item: ReportListItem; onClose: () => void; onSave: (s: Partial<ReportSettings>) => void; saving: boolean }) {
    const [to, setTo] = useState(item.settings.Recipients_To.join("\n"))
    const [cc, setCc] = useState(item.settings.Recipients_Cc.join("\n"))
    const [flags, setFlags] = useState({
        Weekly_Enabled: item.settings.Weekly_Enabled,
        Monthly_Enabled: item.settings.Monthly_Enabled,
        Auto_Send: item.settings.Auto_Send,
    })
    const toggles: { key: keyof typeof flags; label: string; hint: string }[] = [
        { key: "Weekly_Enabled", label: "รายงานรายสัปดาห์", hint: "ส่งทุกเช้าวันจันทร์" },
        { key: "Monthly_Enabled", label: "รายงานรายเดือน", hint: "ส่งวันที่ 1 ของเดือน" },
        { key: "Auto_Send", label: "ส่งอัตโนมัติ", hint: "ส่งเองเฉพาะรายงานที่ไม่มีธงเตือน" },
    ]
    return (
        <Dialog open onOpenChange={o => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>ตั้งค่ารายงาน — {item.Customer_Name}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="rep-to">ผู้รับ (To) — หนึ่งอีเมลต่อบรรทัด</Label>
                        <Textarea id="rep-to" value={to} onChange={e => setTo(e.target.value)} rows={3} placeholder="logistics@customer.co.th" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="rep-cc">สำเนา (Cc)</Label>
                        <Textarea id="rep-cc" value={cc} onChange={e => setCc(e.target.value)} rows={2} placeholder="sales@ddservicegroup.com" />
                    </div>
                    <ul className="divide-y divide-border rounded-xl border border-border">
                        {toggles.map(t => (
                            <li key={t.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                                <div>
                                    <div className="text-sm font-medium">{t.label}</div>
                                    <div className="text-xs text-muted-foreground">{t.hint}</div>
                                </div>
                                <Switch aria-label={t.label} checked={flags[t.key]} onCheckedChange={v => setFlags(f => ({ ...f, [t.key]: v }))} />
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
                    <Button disabled={saving} onClick={() => onSave({ ...flags, Recipients_To: splitEmails(to), Recipients_Cc: splitEmails(cc) })}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึก
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function NoteDialog({ item, onClose, onSave, saving }: { item: ReportListItem; onClose: () => void; onSave: (note: string) => void; saving: boolean }) {
    const [note, setNote] = useState(item.Admin_Note || "")
    return (
        <Dialog open onOpenChange={o => !o && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>หมายเหตุถึงลูกค้า — {item.Customer_Name}</DialogTitle></DialogHeader>
                <Label htmlFor="rep-note" className="sr-only">หมายเหตุ</Label>
                <Textarea id="rep-note" value={note} onChange={e => setNote(e.target.value)} rows={5}
                    placeholder="เช่น สัปดาห์นี้มีงานส่งช้า 2 งานจากฝนตกหนักที่ชุมพร ทีมงานได้ประสานปลายทางแล้ว" />
                <p className="text-xs text-muted-foreground">ข้อความนี้จะแสดงด้านบนสุดของอีเมล</p>
                <div className="mt-2 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
                    <Button disabled={saving} onClick={() => onSave(note)}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึก</Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
