"use client"

import { useEffect, useRef, useState } from "react"
import { Html5Qrcode } from "html5-qrcode"
import { ScanLine, Plus, Minus, Trash2, X, Keyboard, PackageCheck, ChevronDown, Camera, Loader2, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

export interface ScannedItem {
  id: string          // client-side uid
  code: string | null // raw scanned string; null = ใส่มือ/ไม่มีลาเบล
  label: string       // ชื่อที่คนอ่านได้
  qty: number
}

interface LabelScannerProps {
  items: ScannedItem[]
  onChange: (items: ScannedItem[]) => void
  title?: string
}

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

export function LabelScanner({ items, onChange, title = "สแกนลาเบลสินค้า" }: LabelScannerProps) {
  const [scanOpen, setScanOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0)
  // งานที่ไม่ใช้ฟีเจอร์: พับเป็นแถวบางๆ เส้นเดียว จนกว่าจะกดหรือมีรายการ
  const active = expanded || items.length > 0

  // เพิ่มหนึ่งชิ้นจากการสแกน: ถ้ารหัสเดิมมีอยู่แล้ว → +1 (กันสแกนซ้ำเป็นแถวใหม่)
  const addScanned = (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    const existing = items.find(it => it.code === trimmed)
    if (existing) {
      onChange(items.map(it => it.id === existing.id ? { ...it, qty: it.qty + 1 } : it))
      toast.success(`+1 · ${trimmed}`, { duration: 1200 })
    } else {
      onChange([...items, { id: uid(), code: trimmed, label: trimmed, qty: 1 }])
      toast.success(`สแกนแล้ว · ${trimmed}`, { duration: 1500 })
    }
    // เสียงตอบรับสั้นๆ (ถ้าอุปกรณ์รองรับ)
    try { navigator.vibrate?.(60) } catch {}
  }

  const addManual = () => {
    onChange([...items, { id: uid(), code: null, label: "", qty: 1 }])
  }

  const setQty = (id: string, qty: number) => {
    onChange(items.map(it => it.id === id ? { ...it, qty: Math.max(1, qty) } : it))
  }

  const setLabel = (id: string, label: string) => {
    onChange(items.map(it => it.id === id ? { ...it, label } : it))
  }

  const remove = (id: string) => {
    onChange(items.filter(it => it.id !== id))
  }

  // แถวบางๆ ตอนพับ — ไม่กินพื้นที่ ไม่รบกวนงานที่ไม่สแกน
  if (!active) {
    return (
      <>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-2 py-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ScanLine size={16} className="text-primary" />
          <span className="text-xs font-bold uppercase tracking-widest">{title}</span>
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
        <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
          <PackageCheck size={16} className="text-primary" /> {title}
        </span>
        {items.length > 0 ? (
          <span className="text-xs font-bold text-primary bg-primary/10 rounded-full px-3 py-1">
            {items.length} รายการ · {totalQty} ชิ้น
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 py-1"
          >
            ซ่อน
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          onClick={() => setScanOpen(true)}
          className="h-14 rounded-2xl font-black gap-2 shadow-lg active:scale-95"
        >
          <ScanLine size={20} /> สแกน
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={addManual}
          className="h-14 rounded-2xl font-black gap-2 border-border active:scale-95"
        >
          <Keyboard size={18} /> เพิ่มมือ
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center text-muted-foreground py-6 border-2 border-dashed border-border rounded-2xl text-sm font-medium">
          ยังไม่มีรายการ — แตะ "สแกน" เพื่อเริ่ม
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <input
                  value={it.label}
                  onChange={(e) => setLabel(it.id, e.target.value)}
                  placeholder={it.code ? it.code : "ชื่อสินค้า (ไม่มีลาเบล)"}
                  className="w-full bg-transparent font-bold text-sm focus:outline-none truncate"
                />
                {it.code && (
                  <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">{it.code}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => setQty(it.id, it.qty - 1)}
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center active:scale-90">
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  value={it.qty}
                  onChange={(e) => setQty(it.id, Number(e.target.value) || 1)}
                  className="w-10 h-8 bg-background border border-border rounded-lg text-center font-black text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button type="button" onClick={() => setQty(it.id, it.qty + 1)}
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center active:scale-90">
                  <Plus size={14} />
                </button>
              </div>
              <button type="button" onClick={() => remove(it.id)}
                className="w-8 h-8 rounded-lg text-red-500 flex items-center justify-center active:scale-90 shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <ContinuousScanModal
        isOpen={scanOpen}
        onOpenChange={setScanOpen}
        onScan={addScanned}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* โมดัลสแกน — ถ่ายรูปบาร์โค้ด/QR แล้วถอดรหัสจากรูป                            */
/* ใช้กล้องเนทีฟ (file input capture) เหมือนถ่ายรูป POD — เลี่ยงข้อจำกัด        */
/* getUserMedia ของ Capacitor WebView บน external URL ที่บล็อกกล้องสด           */
/* -------------------------------------------------------------------------- */

const FILE_READER_ID = "label-file-reader"

export function ContinuousScanModal({
  isOpen,
  onOpenChange,
  onScan,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onScan: (code: string) => void
}) {
  const readerRef = useRef<Html5Qrcode | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [count, setCount] = useState(0)
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const onScanRef = useRef(onScan)

  useEffect(() => { onScanRef.current = onScan }, [onScan])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // เผื่อถ่ายรูปเดิมซ้ำ
    if (!file) return
    setBusy(true)
    setStatus(null)
    try {
      if (!readerRef.current) {
        readerRef.current = new Html5Qrcode(FILE_READER_ID, { verbose: false })
      }
      const text = await readerRef.current.scanFile(file, false)
      onScanRef.current(text)
      setCount(c => c + 1)
      setStatus({ ok: true, msg: `อ่านได้: ${text}` })
      try { navigator.vibrate?.(60) } catch {}
    } catch {
      setStatus({ ok: false, msg: "อ่านบาร์โค้ดไม่เจอ — ถ่ายให้ชัด เต็มกรอบ ตรงๆ ไม่เอียง แล้วลองใหม่" })
    } finally {
      setBusy(false)
    }
  }

  const close = () => {
    if (readerRef.current) {
      try { readerRef.current.clear() } catch {}
      readerRef.current = null
    }
    setCount(0)
    setStatus(null)
    setBusy(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="bg-background border-border/10 rounded-[2.5rem] p-6 max-w-[90vw] md:max-w-md overflow-hidden">
        <DialogHeader className="space-y-3">
          <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center text-primary mx-auto">
            <ScanLine size={24} />
          </div>
          <DialogTitle className="text-lg font-black text-center uppercase tracking-tighter">
            สแกนลาเบล (ถ่ายรูป)
          </DialogTitle>
        </DialogHeader>

        {/* container ซ่อนสำหรับถอดรหัสจากรูป + input กล้องเนทีฟ */}
        <div id={FILE_READER_ID} className="w-0 h-0 overflow-hidden" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="hidden"
        />

        {count > 0 && (
          <div className="mx-auto bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-black">
            สแกนแล้ว {count} ชิ้น
          </div>
        )}

        {status && (
          <div className={`rounded-2xl p-3 text-sm font-bold flex items-start gap-2 ${status.ok ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
            {status.ok ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="shrink-0 mt-0.5" />}
            <span className="break-all">{status.msg}</span>
          </div>
        )}

        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="w-full h-16 rounded-2xl font-black uppercase tracking-widest gap-2 shadow-lg active:scale-95"
        >
          {busy ? <><Loader2 size={22} className="animate-spin" /> กำลังอ่าน...</> : <><Camera size={22} /> ถ่ายรูปบาร์โค้ด</>}
        </Button>

        <p className="text-center text-muted-foreground text-xs font-bold mt-1">
          ถ่ายให้บาร์โค้ด/QR อยู่กลางรูป ชัด เต็มกรอบ · ถ่ายทีละชิ้นได้เรื่อยๆ
        </p>

        <Button onClick={close} variant="outline" className="w-full h-12 mt-2 rounded-2xl font-black gap-2 border-border">
          <X size={18} /> เสร็จสิ้น
        </Button>
      </DialogContent>
    </Dialog>
  )
}
