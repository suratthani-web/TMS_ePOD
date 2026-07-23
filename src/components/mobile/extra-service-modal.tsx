"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Package, Layers, Truck, UserCheck, Plus, Minus, CheckCircle2, Phone, PenTool } from "lucide-react"
import { SignaturePad } from "@/components/mobile/signature-pad"

export type ExtraServiceData = {
  soNo: string
  storeName: string
  movedQty: number
  floorClimbQty: number
  shelvedQty: number
  approverPhone: string
  approverSignatureUrl?: string | null
  approverSignatureBlob?: Blob | null
  notes: string
}

type ExtraServiceModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ExtraServiceData) => void
  currentJobId: string
  currentCustomerName?: string
  originalDestinations?: Array<{ name?: string; so_no?: string }>
  initialData?: ExtraServiceData | null
}

export function ExtraServiceModal({
  isOpen,
  onClose,
  onSave,
  currentJobId,
  currentCustomerName,
  originalDestinations,
  initialData
}: ExtraServiceModalProps) {
  // Extract all available SOs / Jobs for dropdown
  const [soOptions, setSoOptions] = useState<Array<{ so: string; store: string }>>([])
  
  const [selectedSo, setSelectedSo] = useState<string>(currentJobId)
  const [storeName, setStoreName] = useState<string>(currentCustomerName || "")
  const [movedQty, setMovedQty] = useState<number>(0)
  const [floorClimbQty, setFloorClimbQty] = useState<number>(0)
  const [shelvedQty, setShelvedQty] = useState<number>(0)
  const [approverPhone, setApproverPhone] = useState<string>("")
  const [approverSigBlob, setApproverSigBlob] = useState<Blob | null>(null)
  const [approverSigUrl, setApproverSigUrl] = useState<string | null>(null)
  const [notes, setNotes] = useState<string>("")

  useEffect(() => {
    // Build options from current job + originalDestinations
    const list: Array<{ so: string; store: string }> = []

    if (originalDestinations && Array.isArray(originalDestinations) && originalDestinations.length > 0) {
      originalDestinations.forEach((dest, idx) => {
        const soVal = dest.so_no ? String(dest.so_no).trim() : `${currentJobId}-${idx + 1}`
        const storeVal = dest.name ? String(dest.name).trim() : `จุดส่งที่ ${idx + 1}`
        list.push({
          so: soVal,
          store: storeVal
        })
      })
    } else {
      list.push({
        so: currentJobId,
        store: currentCustomerName || "งานปัจจุบัน"
      })
    }

    setSoOptions(list)

    if (initialData) {
      setSelectedSo(initialData.soNo || (list[0]?.so || currentJobId))
      setStoreName(initialData.storeName || (list[0]?.store || currentCustomerName || ""))
      setMovedQty(initialData.movedQty || 0)
      setFloorClimbQty(initialData.floorClimbQty || 0)
      setShelvedQty(initialData.shelvedQty || 0)
      setApproverPhone(initialData.approverPhone || "")
      setApproverSigUrl(initialData.approverSignatureUrl || null)
      setNotes(initialData.notes || "")
    } else {
      setSelectedSo(list[0]?.so || currentJobId)
      setStoreName(list[0]?.store || currentCustomerName || "")
    }
  }, [currentJobId, currentCustomerName, originalDestinations, initialData, isOpen])

  const handleSoChange = (so: string) => {
    setSelectedSo(so)
    const match = soOptions.find((o) => o.so === so)
    if (match) {
      setStoreName(match.store)
    }
  }

  const handleSignatureSave = (blob: Blob | null) => {
    setApproverSigBlob(blob)
    if (blob) {
      const url = URL.createObjectURL(blob)
      setApproverSigUrl(url)
    } else {
      setApproverSigUrl(null)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      soNo: selectedSo,
      storeName,
      movedQty,
      floorClimbQty,
      shelvedQty,
      approverPhone,
      approverSignatureUrl: approverSigUrl,
      approverSignatureBlob: approverSigBlob,
      notes
    })
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-slate-900 text-white border-slate-800 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center gap-2 text-indigo-400">
            <div className="p-2 bg-indigo-500/10 rounded-xl">
              <Package size={20} />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-white">
              แบบฟอร์มย้ายสินค้าและขึ้นชั้น
            </DialogTitle>
          </div>
          <p className="text-xs text-slate-400 font-medium">
            บันทึกรายละเอียดและลงลายเซ็นรับรองบริการหน้างาน
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Dropdown SO Selector & Manual Input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Truck size={14} className="text-indigo-400" />
              เลือก SO / ใบงาน หรือระบุเลข SO
            </Label>
            <select
              value={selectedSo}
              onChange={(e) => handleSoChange(e.target.value)}
              className="w-full h-11 bg-slate-800 border border-slate-700 rounded-xl px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
            >
              {soOptions.map((opt, i) => (
                <option key={i} value={opt.so}>
                  {opt.so} - {opt.store}
                </option>
              ))}
            </select>
            <Input 
              value={selectedSo}
              onChange={(e) => setSelectedSo(e.target.value)}
              placeholder="ระบุเลข SO หรือแก้ไขเลข SO..."
              className="w-full h-11 bg-slate-800/80 border border-slate-700/80 rounded-xl px-3 text-sm text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold mt-2 placeholder:text-slate-500"
            />
          </div>

          {/* Moved Qty (Boxes) */}
          <div className="bg-slate-800/60 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-200">จำนวนย้ายสินค้า (กล่อง)</p>
              <p className="text-[11px] text-slate-400">พิมพ์ตัวเลขหรือกดปุ่มบวก-ลบ</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-xl border-slate-700 bg-slate-800 text-slate-200 shrink-0"
                onClick={() => setMovedQty(Math.max(0, movedQty - 1))}
              >
                <Minus size={14} />
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                value={movedQty === 0 ? "" : movedQty}
                onChange={(e) => setMovedQty(Math.max(0, parseInt(e.target.value || "0", 10)))}
                placeholder="0"
                className="w-16 h-10 bg-slate-900 border-slate-700 text-center font-black text-white text-base rounded-xl focus-visible:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-xl border-slate-700 bg-slate-800 text-slate-200 shrink-0"
                onClick={() => setMovedQty(movedQty + 1)}
              >
                <Plus size={14} />
              </Button>
            </div>
          </div>

          {/* Floor Climb Selector (Pills) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers size={14} className="text-indigo-400" />
              ระดับชั้นที่แบกขึ้น (ชั้น)
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {[0, 2, 3, 4].map((floor) => (
                <button
                  key={floor}
                  type="button"
                  onClick={() => setFloorClimbQty(floor)}
                  className={`h-11 rounded-xl text-xs font-bold transition-all border ${
                    floorClimbQty === floor
                      ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/30"
                      : "bg-slate-800/80 text-slate-400 border-slate-700/60 hover:bg-slate-800"
                  }`}
                >
                  {floor === 0 ? "ไม่ขึ้นชั้น" : `ชั้น ${floor}`}
                </button>
              ))}
            </div>
          </div>

          {/* Shelved Qty (Boxes) */}
          {floorClimbQty > 0 && (
            <div className="bg-indigo-950/40 p-3 rounded-2xl border border-indigo-900/50 flex items-center justify-between animate-in fade-in duration-300">
              <div>
                <p className="text-sm font-bold text-indigo-200">จำนวนสินค้าขึ้นชั้น (กล่อง)</p>
                <p className="text-[11px] text-indigo-400">พิมพ์ระบุจำนวนสินค้าที่ยกขึ้นชั้น {floorClimbQty}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl border-indigo-800 bg-indigo-900/50 text-indigo-200 shrink-0"
                  onClick={() => setShelvedQty(Math.max(0, shelvedQty - 1))}
                >
                  <Minus size={14} />
                </Button>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={shelvedQty === 0 ? "" : shelvedQty}
                  onChange={(e) => setShelvedQty(Math.max(0, parseInt(e.target.value || "0", 10)))}
                  placeholder="0"
                  className="w-16 h-10 bg-indigo-950 border-indigo-700 text-center font-black text-indigo-100 text-base rounded-xl focus-visible:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-xl border-indigo-800 bg-indigo-900/50 text-indigo-200 shrink-0"
                  onClick={() => setShelvedQty(shelvedQty + 1)}
                >
                  <Plus size={14} />
                </Button>
              </div>
            </div>
          )}

          {/* Approver Signature Pad */}
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <PenTool size={14} className="text-indigo-400" />
              ลายเซ็นผู้เซ็นรับรอง (ลายมือชื่อลูกค้า/ผู้รับ)
            </Label>
            <div className="bg-white rounded-2xl p-2 border border-slate-700">
              <SignaturePad onSave={handleSignatureSave} />
            </div>
          </div>

          {/* Approver Phone */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Phone size={14} className="text-indigo-400" />
              เบอร์โทรศัพท์ผู้เซ็นรับรอง
            </Label>
            <Input
              type="tel"
              placeholder="ระบุเบอร์โทรศัพท์ผู้เซ็นรับรอง..."
              value={approverPhone}
              onChange={(e) => setApproverPhone(e.target.value)}
              className="h-11 bg-slate-800 border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 focus-visible:ring-indigo-500 font-medium"
            />
          </div>

          <DialogFooter className="pt-2 flex-row gap-2 sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="flex-1 h-12 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 font-bold"
            >
              ยกเลิก
            </Button>
            <Button
              type="submit"
              className="flex-1 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={16} />
              บันทึกข้อมูล
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
