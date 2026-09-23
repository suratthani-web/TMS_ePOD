"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getPayslipDrivers,
  createPayslipSignedUpload,
  confirmPayslipsClient,
  deletePayslipBatch,
  type ClientConfirmItem,
} from "@/lib/actions/payslip-actions"
import { parseWorkbookClient, readWorkbookClient, buildSingleSheetFromWb, parseMasterRoster, masterPersonToGrid } from "@/lib/payslip/sheetjs"
import type { PayslipGrid } from "@/lib/payslip/types"
import { suggestDriverId, parseFileName, type DriverLite } from "@/lib/payslip/match"
import { createClient } from "@/utils/supabase/client"
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, Trash2, Users } from "lucide-react"
import { toast } from "sonner"

const BUCKET = "company-assets"

interface Row {
  sheetName: string
  rowCount: number
  isDriverSheet: boolean
  grid: PayslipGrid
  total: number | null
  selected: boolean
  driverId: string
  isSummary?: boolean   // สลิปสรุปจากตารางแม่ (Sheet1) — ไม่มีไฟล์ต้นทาง
}

export default function PayslipsClient({ initialList }: { initialList: Record<string, unknown>[] }) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState("")
  const [hasParsed, setHasParsed] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [drivers, setDrivers] = useState<DriverLite[]>([])
  const [title, setTitle] = useState("")
  const [period, setPeriod] = useState("")
  const [branch, setBranch] = useState("")
  const [fileName, setFileName] = useState("")
  const bufRef = useRef<ArrayBuffer | null>(null)
  const batchRef = useRef<string>("")

  const batches = useMemo(() => {
    const map = new Map<string, { title: string; period: string; file: string; date: string; count: number; batchId: string }>()
    for (const r of initialList) {
      const m = r as Record<string, unknown>
      const bid = String(m.batch_id || m.id)
      const ex = map.get(bid)
      if (ex) ex.count++
      else
        map.set(bid, {
          batchId: bid,
          title: String(m.title || ""),
          period: String(m.period_label || ""),
          file: String(m.source_file || ""),
          date: m.uploaded_at ? new Date(String(m.uploaded_at)).toLocaleString("th-TH") : "",
          count: 1,
        })
    }
    return Array.from(map.values())
  }, [initialList])

  const subs = useMemo(() => drivers.filter((d) => d.type === "sub"), [drivers])
  const individualDrivers = useMemo(() => drivers.filter((d) => d.type !== "sub"), [drivers])

  const handleFile = async (file: File) => {
    setUploading(true)
    setHasParsed(false)
    try {
      const ab = await file.arrayBuffer()
      bufRef.current = ab
      setFileName(file.name)
      // parse ฝั่ง browser (SheetJS) — ไม่ส่งไฟล์ใหญ่ขึ้น server
      await new Promise((r) => setTimeout(r, 30)) // ให้ spinner ทันแสดง
      const sheets = parseWorkbookClient(ab)
      const { drivers: drv } = await getPayslipDrivers()
      setDrivers(drv)
      const parsedName = parseFileName(file.name)
      setTitle(parsedName.title)
      setPeriod(parsedName.period)
      setBranch(parsedName.branch)
      const tabRows: Row[] = sheets.map((s) => ({
        sheetName: s.name,
        rowCount: s.rowCount,
        isDriverSheet: s.isDriverSheet,
        grid: s.grid,
        total: s.total,
        selected: s.isDriverSheet,
        driverId: s.isDriverSheet ? suggestDriverId(s.name, drv, s.extraText) || "" : "",
      }))

      // สลิปสรุปจากตารางแม่ (Sheet1): สร้างให้เฉพาะคนที่ "ไม่มีแท็บรายละเอียด"
      const detailNames = sheets.filter((s) => s.isDriverSheet).map((s) => s.name)
      const hasDetailTab = (fullName: string) =>
        detailNames.some((tab) => fullName.includes(tab) || suggestDriverId(tab, drv) === suggestDriverId(fullName, drv))
      const summaryRows: Row[] = []
      try {
        for (const p of parseMasterRoster(ab)) {
          if (hasDetailTab(p.name)) continue
          summaryRows.push({
            sheetName: `[สรุป] ${p.name}`,
            rowCount: 1,
            isDriverSheet: true,
            grid: masterPersonToGrid(p),
            total: p.transfer || p.net || p.income,
            selected: true,
            driverId: suggestDriverId(p.name, drv) || "",
            isSummary: true,
          })
        }
      } catch (e) { console.error("parse master roster failed", e) }

      setRows([...tabRows, ...summaryRows])
      batchRef.current = crypto.randomUUID()
      setHasParsed(true)
      const driverSheets = sheets.filter((s) => s.isDriverSheet)
      const matched = driverSheets.filter((s) => suggestDriverId(s.name, drv, s.extraText)).length
      toast.success(`พบ ${driverSheets.length} แผ่นคนขับ/สังกัด · จับคู่ได้ ${matched}` +
        (summaryRows.length ? ` · +${summaryRows.length} สลิปสรุปจากตารางแม่` : ""))
    } catch (e) {
      console.error(e)
      toast.error("อ่านไฟล์ไม่สำเร็จ (ไฟล์อาจเสียหรือไม่ใช่ .xlsx)")
    } finally {
      setUploading(false)
    }
  }

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const selectedCount = rows.filter((r) => r.selected && r.driverId).length
  const unmatched = rows.filter((r) => r.isDriverSheet && !r.driverId)

  const handleConfirm = async () => {
    const ab = bufRef.current
    if (!ab) return
    const mapped = rows.filter((r) => r.selected && r.driverId)
    if (mapped.length === 0) {
      toast.error("กรุณาเลือกและจับคู่คนขับอย่างน้อย 1 รายการ")
      return
    }
    // กันจับคู่คนขับซ้ำ
    const seen = new Set<string>()
    for (const m of mapped) {
      if (seen.has(m.driverId)) {
        const d = drivers.find((x) => x.id === m.driverId)
        toast.error(`คนขับ "${d?.name || m.driverId}" ถูกจับคู่มากกว่า 1 แผ่น`)
        return
      }
      seen.add(m.driverId)
    }
    if (unmatched.length > 0) {
      const names = unmatched.map((r) => `• ${r.sheetName}`).join("\n")
      const proceed = confirm(
        `มี ${unmatched.length} แผ่นที่จับคู่คนขับไม่ได้ (ไม่มีในระบบ) จะถูกข้าม ไม่บันทึก:\n\n${names}\n\n` +
          `บันทึกเฉพาะ ${mapped.length} รายการที่จับคู่แล้วต่อไปหรือไม่?`
      )
      if (!proceed) return
    }

    setSaving(true)
    try {
      const supabase = createClient()
      const batchId = batchRef.current
      const wb = readWorkbookClient(ab) // อ่านครั้งเดียว ใช้สร้างไฟล์รายคนทุกคน
      const items: ClientConfirmItem[] = []
      let done = 0
      for (const r of mapped) {
        done++
        setProgress(`กำลังเตรียมไฟล์ ${done}/${mapped.length} …`)
        let xlsxPath: string | null = null
        const matchedTarget = drivers.find((d) => d.id === r.driverId)
        const safeId = r.driverId.replace(/[^A-Za-z0-9_-]/g, "_")
        // สลิปสรุป (จากตารางแม่) ไม่มีไฟล์ต้นทาง — เก็บแค่ grid
        if (!r.isSummary) {
          try {
            const bytes = buildSingleSheetFromWb(wb, r.sheetName)
            const path = `payslips/${batchId}/${safeId}.xlsx`
            const signed = await createPayslipSignedUpload(path)
            if (signed.ok && signed.path && signed.token) {
              const { error } = await supabase.storage
                .from(BUCKET)
                .uploadToSignedUrl(signed.path, signed.token, new Blob([bytes as unknown as BlobPart], {
                  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                }))
              if (!error) xlsxPath = path
            }
          } catch (e) {
            console.error("build/upload xlsx failed", r.sheetName, e)
          }
        }
        items.push({
          driverId: matchedTarget?.rawId || r.driverId,
          rawId: matchedTarget?.rawId,
          driverName: matchedTarget?.name,
          sheetName: r.sheetName,
          grid: r.grid,
          total: r.total,
          xlsxPath,
          targetType: matchedTarget?.type,
          subId: matchedTarget?.subId,
        })
      }

      setProgress("กำลังบันทึก …")
      const res = await confirmPayslipsClient({ batchId, title, period, branch, fileName, items })
      if (!res.ok) {
        toast.error(res.error || "บันทึกไม่สำเร็จ")
        return
      }
      const noXlsx = items.filter((i) => !i.xlsxPath).length
      toast.success(
        `บันทึกสำเร็จ ${res.created} รายการ` +
          (unmatched.length > 0 ? ` · ข้าม ${unmatched.length} แผ่น (ไม่มีในระบบ)` : "") +
          (noXlsx > 0 ? ` · ${noXlsx} รายการไม่มีไฟล์ Excel ให้โหลด (ดูในแอปได้)` : "")
      )
      setHasParsed(false)
      setRows([])
      bufRef.current = null
      router.refresh()
    } finally {
      setSaving(false)
      setProgress("")
    }
  }

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm("ลบชุดสลิปนี้ทั้งหมด? คนขับจะไม่เห็นอีก")) return
    const res = await deletePayslipBatch(batchId)
    if (res.ok) {
      toast.success("ลบแล้ว")
      router.refresh()
    } else toast.error(res.error || "ลบไม่สำเร็จ")
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="text-indigo-600" /> ใบสรุปจ่ายรถ
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          อัปโหลดไฟล์ Excel รวม (1 แผ่นงาน = 1 คนขับ) ระบบจะแยกให้คนขับเปิดดู/โหลดในแอปได้เอง
        </p>
      </div>

      {!hasParsed && (
        <Card>
          <CardContent className="p-6">
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-300 rounded-xl py-10 cursor-pointer hover:border-indigo-400 transition-colors">
              {uploading ? (
                <>
                  <Loader2 className="animate-spin text-indigo-600" size={32} />
                  <span className="text-muted-foreground">กำลังอ่านไฟล์ในเครื่อง…</span>
                </>
              ) : (
                <>
                  <Upload className="text-indigo-500" size={32} />
                  <span className="font-medium">เลือกไฟล์ Excel (.xlsx)</span>
                  <span className="text-xs text-muted-foreground">
                    รองรับไฟล์ขนาดใหญ่ (อ่านในเครื่อง ไม่อัปทั้งไฟล์ขึ้นเซิร์ฟเวอร์)
                  </span>
                </>
              )}
              <input
                type="file"
                accept=".xlsx,.xlsm"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                  e.target.value = ""
                }}
              />
            </label>
          </CardContent>
        </Card>
      )}

      {hasParsed && (
        <Card>
          <CardContent className="p-4 md:p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">หัวเรื่อง</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="รถร่วม 1-15 ก.ค. 69" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">งวด</label>
                <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="1-15.7.69" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">สาขา</label>
                <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="มหาชัย" />
              </div>
            </div>

            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Users size={16} /> จับคู่แผ่นงานกับคนขับ/เจ้าของสังกัด ({selectedCount} รายการพร้อมบันทึก)
            </div>

            {unmatched.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm p-3">
                ⚠️ มี {unmatched.length} แผ่นที่ยังจับคู่ไม่ได้ —
                รายการเหล่านี้จะ <b>ถูกข้าม ไม่บันทึก</b> (หากไม่เลือกคนขับ/สังกัด): {unmatched.map((r) => r.sheetName).join(", ")}
                <div className="text-xs mt-1 text-amber-700">
                  คุณสามารถเลือกคนขับหรือเจ้าของสังกัดในช่องเลือกด้านขวาได้ หรือเพิ่มในระบบก่อนแล้วอัปโหลดใหม่
                </div>
              </div>
            )}

            <div className="border rounded-xl overflow-hidden divide-y max-h-[420px] overflow-y-auto">
              {rows.map((r, i) => (
                <div key={r.sheetName + i} className={`flex items-center gap-3 p-3 ${!r.isDriverSheet ? "bg-gray-50" : ""}`}>
                  <input
                    type="checkbox"
                    checked={r.selected}
                    onChange={(e) => updateRow(i, { selected: e.target.checked })}
                    className="w-4 h-4 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate flex items-center flex-wrap gap-1">
                      <span>{r.sheetName}</span>
                      {!r.isDriverSheet && <span className="text-xs text-amber-600">(ไม่ใช่แผ่นคนขับ?)</span>}
                      {r.isDriverSheet && !r.driverId && (
                        <span className="text-xs font-semibold text-rose-600">จับคู่ไม่ได้ – จะถูกข้าม</span>
                      )}
                      {r.isDriverSheet && r.driverId && (
                        (() => {
                          const matched = drivers.find((d) => d.id === r.driverId)
                          if (!matched) return null
                          if (matched.type === "sub") {
                            return <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">🏢 เจ้าของสังกัด</span>
                          }
                          if (matched.subId) {
                            return <span className="text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">👤 สังกัด: {matched.subId}</span>
                          }
                          return <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">👤 รายคัน</span>
                        })()
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.rowCount} แถว
                      {typeof r.total === "number" ? ` · ยอด ~฿${r.total.toLocaleString()}` : ""}
                    </p>
                  </div>
                  <select
                    value={r.driverId}
                    onChange={(e) => updateRow(i, { driverId: e.target.value, selected: true })}
                    className="border rounded-lg px-2 py-1.5 text-sm max-w-[45%] bg-background"
                  >
                    <option value="">— เลือกคนขับ / เจ้าของสังกัด —</option>
                    {subs.length > 0 && (
                      <optgroup label="🏢 เจ้าของสังกัด / รถร่วม">
                        {subs.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {individualDrivers.length > 0 && (
                      <optgroup label="👤 คนขับ">
                        {individualDrivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} {d.subId ? `(สังกัด ${d.subId})` : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end items-center">
              {progress && <span className="text-sm text-muted-foreground mr-auto">{progress}</span>}
              <Button variant="outline" onClick={() => { setHasParsed(false); bufRef.current = null }} disabled={saving}>
                ยกเลิก
              </Button>
              <Button onClick={handleConfirm} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                บันทึก {selectedCount} รายการ
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="font-semibold mb-2">ประวัติการอัปโหลด</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูล</p>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => (
              <Card key={b.batchId}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{b.title || b.file}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.period ? `งวด ${b.period} · ` : ""}
                      {b.count} คนขับ · {b.date}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1 shrink-0"
                    onClick={() => handleDeleteBatch(b.batchId)}
                  >
                    <Trash2 size={16} /> ลบ
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
