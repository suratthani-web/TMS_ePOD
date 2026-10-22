'use client'

import { FileDown, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { exportTripPerformanceXlsx } from "./export-actions"

interface ExportButtonProps {
    start?: string
    end?: string
    customers?: string[]
    disabled?: boolean
}

/** Executive Excel: summary / per-trip detail / internal audit (built on the server). */
export function ExportCSVButton({ start, end, customers, disabled }: ExportButtonProps) {
    const [loading, setLoading] = useState(false)

    const handleExport = async () => {
        setLoading(true)
        try {
            const res = await exportTripPerformanceXlsx(start || undefined, end || undefined, customers?.length ? customers : undefined)
            if (!res.success) {
                toast.error(res.error)
                return
            }
            const bytes = Uint8Array.from(atob(res.base64), c => c.charCodeAt(0))
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.download = res.fileName
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(url)
        } catch (error) {
            console.error("Export Excel Error:", error)
            toast.error('สร้างไฟล์ไม่สำเร็จ')
        } finally {
            setLoading(false)
        }
    }

    return (
        <button
            onClick={handleExport}
            disabled={loading || disabled}
            className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-2 group/btn text-sm border border-primary/20 disabled:opacity-50"
        >
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <FileDown size={18} className="group-hover/btn:translate-y-0.5 transition-transform" />
            )}
            Export Excel (ผู้บริหาร)
        </button>
    )
}
