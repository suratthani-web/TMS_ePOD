"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getSheetMappings,
  addSheetMapping,
  updateSheetMapping,
  deleteSheetMapping,
  type SheetMapEntry,
} from "@/lib/supabase/sheet-mapping"
import { Sheet, Plus, Edit, Trash2, Save, X, ArrowLeft, Loader2, Table2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

type Draft = Omit<SheetMapEntry, "id">

const emptyDraft: Draft = {
  label: "",
  keywords: "",
  masterCode: null,
  sheetTab: "",
  color: "",
  sortOrder: 100,
  isActive: true,
}

export default function SheetMappingPage() {
  const router = useRouter()
  const [rows, setRows] = useState<SheetMapEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setRows(await getSheetMappings())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const startEdit = (r: SheetMapEntry) => {
    setEditingId(r.id)
    setDraft({ label: r.label, keywords: r.keywords, masterCode: r.masterCode, sheetTab: r.sheetTab, color: r.color, sortOrder: r.sortOrder, isActive: r.isActive })
  }

  const cancel = () => { setEditingId(null); setShowAdd(false); setDraft(emptyDraft) }

  // Suggest the next sort order = (highest specific order, ignoring the
  // default-fallback rows at 900+) + 10, so a new customer is simply appended
  // and the admin never has to invent a number.
  const nextSortOrder = () => {
    const specific = rows.map(r => r.sortOrder).filter(o => o < 900)
    return (specific.length ? Math.max(...specific) : 90) + 10
  }

  const openAdd = () => { setShowAdd(true); setDraft({ ...emptyDraft, sortOrder: nextSortOrder() }) }

  const validate = (d: Draft) => {
    if (!d.label.trim()) { toast.warning("กรอกชื่อลูกค้า/กลุ่ม"); return false }
    if (!d.keywords.trim()) { toast.warning("กรอกคีย์เวิร์ดอย่างน้อย 1 คำ"); return false }
    return true
  }

  const saveNew = async () => {
    if (!validate(draft)) return
    setSaving(true)
    const res = await addSheetMapping(draft)
    setSaving(false)
    if (!res.success) { toast.error("บันทึกไม่สำเร็จ"); return }
    toast.success("เพิ่มการเชื่อมชีตแล้ว")
    cancel(); load()
  }

  const saveEdit = async (id: string) => {
    if (!validate(draft)) return
    setSaving(true)
    const res = await updateSheetMapping(id, draft)
    setSaving(false)
    if (!res.success) { toast.error("บันทึกไม่สำเร็จ"); return }
    toast.success("อัปเดตแล้ว")
    cancel(); load()
  }

  const remove = async (r: SheetMapEntry) => {
    if (!confirm(`ลบการเชื่อมชีตของ "${r.label}"?`)) return
    const res = await deleteSheetMapping(r.id)
    if (!res.success) { toast.error("ลบไม่สำเร็จ"); return }
    toast.success("ลบแล้ว"); load()
  }

  const DraftForm = ({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) => (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 bg-muted/30 rounded-2xl border border-border">
      <div className="md:col-span-3 space-y-1">
        <Label className="text-xs font-bold text-muted-foreground uppercase">ชื่อลูกค้า / กลุ่ม</Label>
        <Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="เอ็ม โกลบอล ซอร์สซิ่ง" />
      </div>
      <div className="md:col-span-3 space-y-1">
        <Label className="text-xs font-bold text-muted-foreground uppercase">คีย์เวิร์ด (คั่นด้วย ,)</Label>
        <Input value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} placeholder="เอ็ม โกลบอล,m global,ซอร์สซิ่ง" />
      </div>
      <div className="md:col-span-2 space-y-1">
        <Label className="text-xs font-bold text-muted-foreground uppercase">รหัส MASTER</Label>
        <Input type="number" value={draft.masterCode ?? ""} onChange={(e) => setDraft({ ...draft, masterCode: e.target.value === "" ? null : Number(e.target.value) })} placeholder="127" />
      </div>
      <div className="md:col-span-2 space-y-1">
        <Label className="text-xs font-bold text-muted-foreground uppercase">แท็บชีต</Label>
        <Input value={draft.sheetTab ?? ""} onChange={(e) => setDraft({ ...draft, sheetTab: e.target.value })} placeholder="ยูนิคอร์ด" />
      </div>
      <div className="md:col-span-1 space-y-1">
        <Label className="text-xs font-bold text-muted-foreground uppercase" title="ลำดับการจับคู่ — เลขน้อยจับก่อน ระบบเติมให้อัตโนมัติ ไม่ต้องแก้เว้นแต่คีย์เวิร์ดซ้อนกับรายอื่น">ลำดับ (อัตโนมัติ)</Label>
        <Input type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) || 100 })} />
      </div>
      <div className="md:col-span-1 flex gap-1 justify-end">
        <PremiumButton onClick={onSave} disabled={saving} className="h-10 px-3 bg-primary text-white">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        </PremiumButton>
        <PremiumButton variant="outline" onClick={onCancel} className="h-10 px-3"><X size={16} /></PremiumButton>
      </div>
    </div>
  )

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-20">
        <button onClick={() => router.push("/settings")} className="flex items-center gap-2 text-primary hover:text-foreground text-sm font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" /> Settings
        </button>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-card p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 text-primary rounded-2xl"><Sheet size={26} /></div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">การเชื่อมชีต MASTER</h1>
              <p className="text-sm text-muted-foreground mt-1">กำหนดลูกค้า → รหัส MASTER และแท็บชีตปลายทาง เพิ่มลูกค้าใหม่ได้เองโดยไม่ต้องแก้โค้ด</p>
            </div>
          </div>
          {!showAdd && !editingId && (
            <PremiumButton onClick={openAdd} className="h-11 px-6 rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[11px]">
              <Plus size={18} className="mr-2" /> เพิ่มลูกค้า
            </PremiumButton>
          )}
        </div>

        {showAdd && <DraftForm onSave={saveNew} onCancel={cancel} />}

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center gap-2 text-sm font-black text-foreground uppercase tracking-widest">
            <Table2 size={16} className="text-primary" /> รายการเชื่อมชีต ({rows.length})
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-primary" size={40} /></div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm font-medium">ยังไม่มีการเชื่อมชีต — กด "เพิ่มลูกค้า"</div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((r) => (
                editingId === r.id ? (
                  <div key={r.id} className="p-3"><DraftForm onSave={() => saveEdit(r.id)} onCancel={cancel} /></div>
                ) : (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-[160px]">
                      <p className="font-black text-foreground">{r.label}{!r.isActive && <span className="ml-2 text-[10px] font-bold text-amber-500">(ปิดใช้)</span>}</p>
                      <p className="text-xs text-muted-foreground truncate">คีย์เวิร์ด: {r.keywords}</p>
                    </div>
                    <div className="text-center px-3">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">รหัส</p>
                      <p className="font-black text-primary">{r.masterCode ?? "—"}</p>
                    </div>
                    <div className="text-center px-3 min-w-[90px]">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">แท็บ</p>
                      <p className="font-bold text-foreground text-sm">{r.sheetTab || "fallback"}</p>
                    </div>
                    <div className="text-center px-3">
                      <p className="text-[10px] font-bold text-muted-foreground uppercase">ลำดับ</p>
                      <p className="font-bold text-muted-foreground text-sm">{r.sortOrder}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(r)} className="h-9 w-9 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"><Edit size={15} /></button>
                      <button onClick={() => remove(r)} className="h-9 w-9 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-rose-500 hover:bg-rose-500 hover:text-white transition-all"><Trash2 size={15} /></button>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground px-1">
          หมายเหตุ: <b>ลำดับเติมให้อัตโนมัติ</b> — ปกติไม่ต้องแก้ ปรับก็ต่อเมื่อคีย์เวิร์ดลูกค้าใหม่ซ้อนกับอีกราย (ให้ตั้งเลขน้อยกว่าตัวที่กว้างกว่าเพื่อจับก่อน) • แท็บว่าง = ใช้ fallback (ยูนิคอร์ด) • ระบบ cache 60 วินาที
        </p>
      </div>
    </DashboardLayout>
  )
}
