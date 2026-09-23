"use client"

import { useRef, useState } from "react"
import { PayslipGridView } from "@/components/payslip/payslip-grid"
import { PayslipVoucherView } from "@/components/payslip/payslip-voucher"
import type { PayslipGrid } from "@/lib/payslip/types"
import type { VoucherData } from "@/lib/payslip/voucher"
import { Button } from "@/components/ui/button"
import { FileDown, Loader2 } from "lucide-react"

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
  const [pdfLoading, setPdfLoading] = useState(false)

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
      const pxPerMm = canvas.width / imgWmm
      const pageHpx = usableH * pxPerMm // ความสูง 1 หน้า (px ในภาพต้นฉบับ)

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
      <div className="flex gap-2">
        <Button onClick={handleDownloadPdf} disabled={pdfLoading} className="flex-1 h-12 bg-rose-600 hover:bg-rose-700 text-white gap-2">
          {pdfLoading ? <Loader2 className="animate-spin" size={18} /> : <FileDown size={18} />}
          ดาวน์โหลด PDF
        </Button>
      </div>

      {kind !== "voucher" && grid && (
        <p className="text-xs text-muted-foreground text-center -mb-1">
          👉 เลื่อนซ้าย/ขวาเพื่อดูทุกคอลัมน์ · หรือกด &ldquo;ดาวน์โหลด PDF&rdquo; เพื่อดูแบบเต็ม
        </p>
      )}
      {/* เนื้อหา — เป็นแหล่ง render สำหรับ PDF ด้วย */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
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
