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
/* โมดัลสแกนต่อเนื่อง — รองรับทั้งกล้องสด (Live stream) และ ถ่ายรูป (Photo Fallback) */
/* -------------------------------------------------------------------------- */

const FILE_HELPER_ID = "label-file-helper"

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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isStarted, setIsStarted] = useState(false)
  const [busyFile, setBusyFile] = useState(false)
  const [count, setCount] = useState(0)
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 })
  const onScanRef = useRef(onScan)

  useEffect(() => { onScanRef.current = onScan }, [onScan])

  const startLiveScanner = async () => {
    setError(null)
    setIsStarted(false)
    try {
      const element = document.getElementById("label-scanner-view")
      if (!element) return

      if (scannerRef.current) {
        try { await scannerRef.current.stop() } catch {}
        scannerRef.current = null
      }

      const html5QrCode = new Html5Qrcode("label-scanner-view", { verbose: false })
      scannerRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 260, height: 180 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          const now = Date.now()
          const last = lastScanRef.current
          // debounce 1.2 วิ สำหรับโค้ดเดิม กันยิงซ้ำรัวๆ
          if (last.code === decodedText && now - last.at < 1200) return
          lastScanRef.current = { code: decodedText, at: now }
          setLastScanned(decodedText)
          setCount(c => c + 1)
          onScanRef.current(decodedText)
          try { navigator.vibrate?.(60) } catch {}
        },
        () => {}
      )
      setIsStarted(true)
      setError(null)
    } catch (err: unknown) {
      console.warn("Live Camera start failed:", err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("NotAllowedError") || msg.includes("Permission denied") || msg.includes("Permission dismissed")) {
        setError("กล้องถูกบล็อกการเข้าถึง (Permission Denied)")
      } else if (msg.includes("NotFoundError") || msg.includes("DevicesNotFoundError")) {
        setError("ไม่พบกล้องในอุปกรณ์นี้")
      } else {
        setError("ไม่สามารถเปิดกล้องสดได้: " + msg)
      }
      setIsStarted(false)
    }
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    if (isOpen) {
      timer = setTimeout(startLiveScanner, 400)
    }
    return () => {
      if (timer) clearTimeout(timer)
      if (scannerRef.current) {
        scannerRef.current.stop().then(() => {
          scannerRef.current = null
          setIsStarted(false)
        }).catch(() => {})
      }
    }
  }, [isOpen])

  // ฟังก์ชันถ่ายรูปสแกน (ทำงานได้ 100% แม้เบราว์เซอร์บล็อก getUserMedia)
  const handleFileCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusyFile(true)
    try {
      const html5QrCode = new Html5Qrcode(FILE_HELPER_ID, { verbose: false })
      const text = await html5QrCode.scanFile(file, false)
      setLastScanned(text)
      setCount(c => c + 1)
      onScanRef.current(text)
      toast.success(`สแกนสำเร็จ: ${text}`)
      try { navigator.vibrate?.(60) } catch {}
      try { html5QrCode.clear() } catch {}
    } catch {
      toast.error("อ่านบาร์โค้ดไม่เจอ กรุณาถ่ายให้ชัดเจน เต็มกรอบ แล้วลองใหม่อีกครั้ง")
    } finally {
      setBusyFile(false)
    }
  }

  const close = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setIsStarted(false)
    setError(null)
    setCount(0)
    setLastScanned(null)
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
            สแกนลาเบลสินค้า
          </DialogTitle>
        </DialogHeader>

        {/* ช่องสแกนกล้องสด */}
        <div className="relative mt-2 aspect-square bg-card rounded-[2rem] overflow-hidden border border-border/5 shadow-inner">
          <div id="label-scanner-view" className="w-full h-full" />
          
          {/* Helper ซ่อนสำหรับ scanFile */}
          <div id={FILE_HELPER_ID} className="w-0 h-0 overflow-hidden" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileCapture}
            className="hidden"
          />

          {!isStarted && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/80 backdrop-blur-sm">
              <div className="text-center space-y-2">
                <Loader2 size={32} className="animate-spin text-primary mx-auto" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  กำลังเริ่มต้นกล้อง...
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-card/95 backdrop-blur-md space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                <Camera size={24} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-black text-red-400 leading-snug">{error}</p>
                <p className="text-[11px] text-muted-foreground">
                  แตะไอคอน 🔒 บนแถบที่อยู่เว็บ เพื่ออนุญาตให้เปิดกล้อง
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full pt-2">
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busyFile}
                  className="w-full h-12 rounded-xl font-bold bg-primary text-primary-foreground gap-2 shadow-md"
                >
                  {busyFile ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                  ถ่ายรูปเพื่อสแกนแทน
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={startLiveScanner}
                  className="w-full h-10 rounded-xl text-xs font-bold"
                >
                  ลองเปิดกล้องอีกครั้ง
                </Button>
              </div>
            </div>
          )}

          {/* Overlay กรอบเล็งบาร์โค้ด */}
          {isStarted && !error && (
            <>
              <div className="absolute inset-0 border-[30px] border-black/40 pointer-events-none" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] h-[140px] border-2 border-primary/70 rounded-2xl pointer-events-none shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                <div className="w-full h-[2px] bg-primary animate-pulse shadow-[0_0_8px_rgba(59,130,246,1)]" />
              </div>
            </>
          )}

          {count > 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white rounded-full px-4 py-1 text-xs font-black shadow-lg flex items-center gap-1 z-20">
              <CheckCircle2 size={14} /> สแกนแล้ว {count} ชิ้น
            </div>
          )}
        </div>

        {lastScanned && (
          <p className="text-center text-xs font-mono font-bold text-primary truncate px-2">
            ล่าสุด: {lastScanned}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={busyFile}
            className="h-12 rounded-2xl font-bold text-xs gap-1.5 border-border"
          >
            {busyFile ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            ถ่ายรูปสแกน
          </Button>
          <Button
            type="button"
            onClick={close}
            className="h-12 rounded-2xl font-black uppercase tracking-wider text-xs gap-1.5"
          >
            <X size={16} /> เสร็จสิ้น
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
