"use client"

import { useEffect, useRef, useState } from "react"
import { Html5Qrcode } from "html5-qrcode"
import { ScanLine, Plus, Minus, Trash2, X, Keyboard, PackageCheck, ChevronDown } from "lucide-react"
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
/* โมดัลสแกนต่อเนื่อง — สแกนได้หลายชิ้นโดยไม่ปิดกล้อง                          */
/* -------------------------------------------------------------------------- */

export function ContinuousScanModal({
  isOpen,
  onOpenChange,
  onScan,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onScan: (code: string) => void
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isStarted, setIsStarted] = useState(false)
  const [count, setCount] = useState(0)
  // กันยิงซ้ำรัวๆ ของโค้ดเดิมภายในเสี้ยววินาที
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 })
  const onScanRef = useRef(onScan)

  useEffect(() => { onScanRef.current = onScan }, [onScan])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    if (isOpen && !isStarted) {
      const start = async () => {
        try {
          if (!document.getElementById("label-reader")) return
          const html5QrCode = new Html5Qrcode("label-reader", { verbose: false })
          scannerRef.current = html5QrCode
          const cfg = { fps: 10, qrbox: { width: 260, height: 180 } }
          const onDecode = (decodedText: string) => {
            const now = Date.now()
            const last = lastScanRef.current
            // debounce โค้ดเดิม 1.5 วิ กันสแกนค้างเป็นสิบชิ้น
            if (last.code === decodedText && now - last.at < 1500) return
            lastScanRef.current = { code: decodedText, at: now }
            onScanRef.current(decodedText)
            setCount(c => c + 1)
          }

          try {
            // ทางแรก: constraint facingMode (ปกติเร็วสุด)
            await html5QrCode.start({ facingMode: "environment" }, cfg, onDecode, () => {})
          } catch (envErr) {
            // fallback: บาง WebView ไม่รับ facingMode → เลือกกล้องหลังด้วย deviceId
            const cameras = await Html5Qrcode.getCameras()
            if (!cameras || cameras.length === 0) throw envErr
            const back = cameras.find(c => /back|rear|environment|หลัง/i.test(c.label)) || cameras[cameras.length - 1]
            await html5QrCode.start(back.id, cfg, onDecode, () => {})
          }
          setIsStarted(true)
          setError(null)
        } catch (err: unknown) {
          const name = err instanceof Error ? err.name : ""
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes("NotFoundError") || name === "NotFoundError") {
            setError("ไม่พบกล้องในอุปกรณ์นี้")
          } else {
            // แสดง error ดิบเพื่อวินิจฉัย (ชื่อ + ข้อความ)
            setError(`เปิดกล้องไม่ได้ [${name || "?"}] ${msg}`)
          }
          setIsStarted(false)
        }
      }
      timer = setTimeout(start, 600)
    }
    return () => {
      if (timer) clearTimeout(timer)
      if (scannerRef.current && isStarted) {
        scannerRef.current.stop().then(() => {
          scannerRef.current = null
          setIsStarted(false)
        }).catch(() => {})
      }
    }
  }, [isOpen, isStarted])

  const close = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setIsStarted(false)
    setCount(0)
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
            สแกนลาเบลต่อเนื่อง
          </DialogTitle>
        </DialogHeader>

        <div className="relative mt-2 aspect-square bg-card rounded-[2rem] overflow-hidden border border-border/5 shadow-inner">
          <div id="label-reader" className="w-full h-full" />
          {!isStarted && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
                กำลังเปิดกล้อง...
              </p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <p className="text-sm font-black text-red-400 leading-relaxed">{error}</p>
            </div>
          )}
          {isStarted && count > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-full px-4 py-1.5 text-sm font-black shadow-lg">
              สแกนแล้ว {count} ครั้ง
            </div>
          )}
        </div>

        <p className="text-center text-muted-foreground text-sm font-bold uppercase tracking-widest mt-4">
          เล็งลาเบลในกรอบ · สแกนต่อได้เรื่อยๆ
        </p>

        <Button onClick={close} className="w-full h-14 mt-4 rounded-2xl font-black uppercase tracking-widest gap-2">
          <X size={18} /> เสร็จสิ้น
        </Button>
      </DialogContent>
    </Dialog>
  )
}
