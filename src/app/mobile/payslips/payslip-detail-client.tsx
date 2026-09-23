"use client"

import { useRef, useState, useEffect } from "react"
import { PayslipGridView } from "@/components/payslip/payslip-grid"
import { PayslipVoucherView } from "@/components/payslip/payslip-voucher"
import type { PayslipGrid } from "@/lib/payslip/types"
import type { VoucherData } from "@/lib/payslip/voucher"
import { Button } from "@/components/ui/button"
import { FileDown, Loader2, ChevronLeft, ChevronRight, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  id?: string
  kind: string
  grid?: PayslipGrid | null
  voucher?: VoucherData | null
  title: string
  subtitle: string
  hasXlsx?: boolean
}

export function PayslipDetailClient({ kind, grid, voucher, title, subtitle }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [fitToOnePage, setFitToOnePage] = useState(true)

  // Drag-to-scroll state
  const [isDragging, setIsDragging] = useState(false)
  const isMouseDownRef = useRef(false)
  const startXRef = useRef(0)
  const scrollLeftRef = useRef(0)

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isMouseDownRef.current = false
      setIsDragging(false)
    }
    window.addEventListener("mouseup", handleGlobalMouseUp)
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp)
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !scrollContainerRef.current) return
    isMouseDownRef.current = true
    setIsDragging(true)
    startXRef.current = e.pageX - scrollContainerRef.current.offsetLeft
    scrollLeftRef.current = scrollContainerRef.current.scrollLeft
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDownRef.current || !scrollContainerRef.current) return
    e.preventDefault()
    const x = e.pageX - scrollContainerRef.current.offsetLeft
    const walk = (x - startXRef.current) * 1.5
    scrollContainerRef.current.scrollLeft = scrollLeftRef.current - walk
  }

  const handleMouseUp = () => {
    isMouseDownRef.current = false
    setIsDragging(false)
  }

  const handleScrollBy = (amount: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: amount, behavior: "smooth" })
    }
  }

  const safeName = `${title} ${subtitle}`.replace(/[^\p{L}\p{N}\-_. ]/gu, "_").trim().slice(0, 80) || "payslip"

  const handleDownloadPdf = async () => {
    if (!gridRef.current) return
    setPdfLoading(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ])
      const el = gridRef.current
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        windowWidth: el.scrollWidth,
      })

      const pdf = new jsPDF({ orientation: kind === "voucher" ? "portrait" : "landscape", unit: "mm", format: "a4" })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 8
      const usableW = pageW - margin * 2
      const usableH = pageH - margin * 2

      const imgWmm = usableW
      const totalHmm = (canvas.height / canvas.width) * imgWmm

      // หากเลือกให้พอดี 1 หน้า (หรือเนื้อหาสูงไม่เกิน 1.45 เท่าของหน้า A4)
      if (fitToOnePage || totalHmm <= usableH * 1.45) {
        let finalW = usableW
        let finalH = totalHmm
        if (totalHmm > usableH) {
          const ratio = usableH / totalHmm
          finalW = usableW * ratio
          finalH = usableH
        }
        const offsetX = margin + (usableW - finalW) / 2
        const offsetY = margin + (usableH - finalH) / 2
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", offsetX, offsetY, finalW, finalH)
        pdf.save(`${safeName}.pdf`)
        return
      }

      // โหมดแบ่งหลายหน้า (กรณีข้อมูลยาวมาก)
      const pxPerMm = canvas.width / imgWmm
      const pageHpx = usableH * pxPerMm

      let renderedPx = 0
      let first = true
      while (renderedPx < canvas.height) {
        const sliceHpx = Math.min(pageHpx, canvas.height - renderedPx)
        const pageCanvas = document.createElement("canvas")
        pageCanvas.width = canvas.width
        pageCanvas.height = sliceHpx
        const ctx = pageCanvas.getContext("2d")!
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
        ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx)

        const sliceHmm = sliceHpx / pxPerMm
        if (!first) pdf.addPage()
        pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", margin, margin, imgWmm, sliceHmm)
        first = false
        renderedPx += sliceHpx
      }

      pdf.save(`${safeName}.pdf`)
    } catch (e) {
      console.error(e)
      alert("สร้าง PDF ไม่สำเร็จ กรุณาลองใหม่")
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <Button onClick={handleDownloadPdf} disabled={pdfLoading} className="h-12 bg-rose-600 hover:bg-rose-700 text-white gap-2 font-bold shadow-sm">
          {pdfLoading ? <Loader2 className="animate-spin" size={18} /> : <FileDown size={18} />}
          ดาวน์โหลด PDF {fitToOnePage ? "(พอดี 1 หน้า)" : ""}
        </Button>

        {/* Options & Quick Navigation Buttons */}
        <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 px-3 py-2 rounded-xl shadow-xs">
          <label className="flex items-center gap-2 cursor-pointer font-medium text-xs text-slate-700 select-none">
            <input 
              type="checkbox" 
              checked={fitToOnePage} 
              onChange={(e) => setFitToOnePage(e.target.checked)} 
              className="w-4 h-4 text-rose-600 rounded border-gray-300 focus:ring-rose-500 accent-rose-600"
            />
            <span>ปรับพอดี 1 หน้า A4</span>
          </label>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleScrollBy(-350)}
              title="เลื่อนซ้าย"
              className="h-8 px-2.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-50 border-slate-200"
            >
              <ChevronLeft size={15} className="mr-0.5" /> ซ้าย
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleScrollBy(350)}
              title="เลื่อนขวา"
              className="h-8 px-2.5 text-xs text-slate-600 hover:text-slate-900 bg-slate-50 border-slate-200"
            >
              ขวา <ChevronRight size={15} className="ml-0.5" />
            </Button>
          </div>
        </div>
      </div>

      {kind !== "voucher" && grid && (
        <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground px-1">
          <p>
            🖱️ <strong>บนคอม:</strong> คลิกเมาส์ค้างแล้วลาก (Drag) เพื่อเลื่อนซ้าย-ขวา หรือใช้ปุ่ม &ldquo;ซ้าย/ขวา&rdquo; ด้านบน
          </p>
          <p className="hidden md:block text-[11px] text-slate-400">
            (หรือกด Shift + เลื่อนลูกกลิ้งเมาส์)
          </p>
        </div>
      )}

      {/* เนื้อหาตาราง — รองรับ Drag to Scroll ด้วยเมาส์ */}
      <div 
        ref={scrollContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className={cn(
          "rounded-xl border border-gray-200 bg-white overflow-x-auto transition-colors",
          isDragging ? "cursor-grabbing select-none" : "cursor-grab"
        )}
        style={{
          scrollbarWidth: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {kind === "voucher" && voucher ? (
          <PayslipVoucherView data={voucher} ref={gridRef} />
        ) : grid ? (
          <PayslipGridView grid={grid} ref={gridRef} />
        ) : (
          <div className="p-6 text-center text-muted-foreground">ไม่มีข้อมูลแสดงผล</div>
        )}
      </div>
    </div>
  )
}
