"use client"

import { useState } from "react"
import { ScanLine, Plus, Minus, ChevronDown, CheckCircle2, AlertTriangle, PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { ContinuousScanModal, type ScannedItem } from "@/components/mobile/label-scanner"
import type { ReconciledItem } from "@/lib/actions/scan-actions"

interface DeliveryScannerProps {
  reconciled: ReconciledItem[]     // รับ + ส่งไปแล้ว (ทุกดรอป) จาก server
  items: ScannedItem[]             // การส่งของ "ดรอปนี้"
  onChange: (items: ScannedItem[]) => void
}

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const keyOf = (code: string | null, label: string) => code?.trim() || `label:${label.trim()}`

export function DeliveryScanner({ reconciled, items, onChange }: DeliveryScannerProps) {
  const [scanOpen, setScanOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const hasReceived = reconciled.length > 0
  // ถ้ามีของที่รับมา ควรให้ตรวจส่ง → กางไว้; ถ้าไม่มีข้อมูลรับเลย พับเป็นแถวบาง
  const active = expanded || hasReceived || items.length > 0

  // ยอด "ดรอปนี้" ต่อ key
  const thisDropQty = (key: string) =>
    items.filter(it => keyOf(it.code, it.label) === key).reduce((s, it) => s + (Number(it.qty) || 0), 0)

  const bump = (code: string | null, label: string, delta: number) => {
    const key = keyOf(code, label)
    const existing = items.find(it => keyOf(it.code, it.label) === key)
    if (existing) {
      const q = existing.qty + delta
      if (q <= 0) onChange(items.filter(it => it.id !== existing.id))
      else onChange(items.map(it => it.id === existing.id ? { ...it, qty: q } : it))
    } else if (delta > 0) {
      onChange([...items, { id: uid(), code: code?.trim() || null, label: label.trim(), qty: delta }])
    }
  }

  const addScanned = (raw: string) => {
    const code = raw.trim()
    if (!code) return
    const match = reconciled.find(r => r.code === code)
    bump(code, match?.label || code, 1)
    toast.success(match ? `✓ ${match.label}` : `นอกรายการ · ${code}`, { duration: 1200 })
    try { navigator.vibrate?.(60) } catch {}
  }

  // แถวนอกรายการ (สแกนเจอของที่ไม่ได้อยู่ในของที่รับมา)
  const extraItems = items.filter(it => !reconciled.some(r => r.key === keyOf(it.code, it.label)))

  const allDone = hasReceived && reconciled.every(r => (r.delivered + thisDropQty(r.key)) >= r.received)

  if (!active) {
    return (
      <>
        <button type="button" onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-2 py-2 text-muted-foreground hover:text-foreground transition-colors">
          <ScanLine size={16} className="text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest">ตรวจส่งสินค้า (สแกน)</span>
          <span className="text-[10px] font-medium opacity-60">· ไม่บังคับ</span>
          <ChevronDown size={14} className="ml-auto opacity-60" />
        </button>
        <ContinuousScanModal isOpen={scanOpen} onOpenChange={setScanOpen} onScan={addScanned} />
      </>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-foreground">
          <PackageCheck size={16} className="text-primary" /> ตรวจส่งสินค้า
        </span>
        {allDone && (
          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 rounded-full px-3 py-1 flex items-center gap-1">
            <CheckCircle2 size={12} /> ส่งครบ
          </span>
        )}
      </div>

      <Button type="button" onClick={() => setScanOpen(true)}
        className="w-full h-14 rounded-2xl font-black gap-2 shadow-lg active:scale-95">
        <ScanLine size={20} /> สแกนสินค้าที่ส่ง
      </Button>

      {/* Checklist ของที่รับมา */}
      {hasReceived && (
        <div className="space-y-2">
          {reconciled.map((r) => {
            const here = thisDropQty(r.key)
            const doneTotal = r.delivered + here
            const remaining = r.received - doneTotal
            const over = remaining < 0
            const complete = remaining <= 0
            return (
              <div key={r.key}
                className={`rounded-2xl p-3 border flex items-center gap-3 ${complete ? "bg-emerald-500/5 border-emerald-500/30" : "bg-card border-border"}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate text-foreground flex items-center gap-1.5">
                    {complete && !over && <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />}
                    {over && <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
                    {r.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    รับ {r.received} · ส่งแล้ว {doneTotal}
                    {over ? <span className="text-amber-400 font-bold"> · เกิน {Math.abs(remaining)}</span>
                          : remaining > 0 ? <span className="text-primary font-bold"> · เหลือ {remaining}</span>
                          : null}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => bump(r.code, r.label, -1)} disabled={here <= 0}
                    className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center active:scale-90 disabled:opacity-30">
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center font-black text-sm text-foreground">{here}</span>
                  <button type="button" onClick={() => bump(r.code, r.label, 1)}
                    className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center active:scale-90">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* นอกรายการ */}
      {extraItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">นอกรายการที่รับมา</p>
          {extraItems.map((it) => (
            <div key={it.id} className="rounded-2xl p-3 border border-amber-500/30 bg-amber-500/5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate text-foreground">{it.label}</p>
                {it.code && <p className="text-[10px] text-muted-foreground font-mono truncate">{it.code}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => bump(it.code, it.label, -1)}
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center active:scale-90">
                  <Minus size={14} />
                </button>
                <span className="w-8 text-center font-black text-sm text-foreground">{it.qty}</span>
                <button type="button" onClick={() => bump(it.code, it.label, 1)}
                  className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center active:scale-90">
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!hasReceived && extraItems.length === 0 && (
        <p className="text-center text-muted-foreground text-xs py-3">
          ไม่มีข้อมูลสินค้าที่สแกนตอนรับ — สแกนเพื่อบันทึกการส่งได้เลย
        </p>
      )}

      <ContinuousScanModal isOpen={scanOpen} onOpenChange={setScanOpen} onScan={addScanned} />
    </div>
  )
}
