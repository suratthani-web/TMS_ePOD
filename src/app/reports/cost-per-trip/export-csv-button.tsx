'use client'

import { FileDown, Loader2 } from "lucide-react"
import { useState } from "react"
import type { TripCost } from "./actions"
import { todayTH } from "@/lib/utils/date-th"

interface ExportCSVButtonProps {
    data: TripCost[]
}

export function ExportCSVButton({ data }: ExportCSVButtonProps) {
    const [loading, setLoading] = useState(false)

    const handleExport = () => {
        setLoading(true)
        try {
            if (!data || data.length === 0) {
                alert("ไม่มีข้อมูลสำหรับส่งออก")
                return
            }

            // 1. Define Headers
            const headers = [
                "วันที่",
                "Job ID",
                "ทะเบียนรถ",
                "ลูกค้า",
                "ต้นทาง",
                "ปลายทาง",
                "เส้นทางรวม",
                "จำนวนดรอป",
                "จุดดรอป",
                "จำนวนชิ้น",
                "ระยะทางไมล์จริง (KM)",
                "ระยะทางตามงาน (KM)",
                "ราคา/ชิ้น",
                "รายได้ (THB)",
                "ค่าเที่ยวคนขับ (THB)",
                "ค่าใช้จ่ายอื่นคนขับ (THB)",
                "รายละเอียดค่าใช้จ่ายอื่น",
                "ค่าคนขับรวม (THB)",
                "น้ำมัน (ลิตร)",
                "ค่าน้ำมัน (THB)",
                "ที่มาค่าน้ำมัน",
                "ความมั่นใจการจับคู่บิล",
                "ไมล์จริง/ระยะงานไป-กลับ (%)",
                "บิลที่จับคู่",
                "ค่าสึกหรอ (THB)",
                "ต้นทุนรวม (THB)",
                "กำไร (THB)",
                "Margin (%)"
            ]

            // 2. Map Data to Rows
            const rows = data.map(t => {
                let origin = (t.Origin_Location || "").trim()
                let dest = (t.Dest_Location || "").trim()
                const loadedQty = Number(t.loaded_qty) || 0

                // Fallback: Parse from Route_Name if locations are missing
                if ((!origin || !dest) && t.Route_Name) {
                    const parts = t.Route_Name.split(/[-→/]/)
                    if (parts.length >= 2) {
                        if (!origin) origin = parts[0].trim()
                        if (!dest) dest = parts.slice(1).join(" - ").trim()
                    }
                }

                return [
                    t.Plan_Date || "-",
                    t.Job_ID,
                    t.Vehicle_Plate || "-",
                    t.Customer_Name || "-",
                    origin || "-",
                    dest || "-",
                    t.Route_Name || "-",
                    t.drop_count,
                    t.drops.join(" → ") || "-",
                    loadedQty,
                    t.real_km_source === 'odometer' ? t.distance_km : "-",
                    t.est_km || 0,
                    (loadedQty > 0 && (t.Cost_Customer_Total % loadedQty === 0)) 
                        ? (t.Cost_Customer_Total / loadedQty).toString() 
                        : "-",
                    t.Cost_Customer_Total || 0,
                    t.Cost_Driver_Total || 0,
                    t.extra_cost || 0,
                    t.extra_items.map(e => `${e.type} ${e.amount}`).join(" / ") || "-",
                    (t.Cost_Driver_Total || 0) + (t.extra_cost || 0),
                    t.fuel_liters || 0,
                    t.fuel_real || 0,
                    t.fuel_source === 'bill' ? "บิลจริง" : t.fuel_source === 'subcontract' ? "รถร่วม" : "ประมาณ (ยังไม่มีบิลจบงาน)",
                    t.fuel_match ? ({ confirmed: 'ยืนยันแล้ว', high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ' } as const)[t.fuel_match.confidence] : '-',
                    t.fuel_match && t.fuel_match.ratio > 0 ? Math.round(t.fuel_match.ratio * 100) : '-',
                    t.fuel_match ? t.fuel_match.fills.join(' / ') : '-',
                    t.maint_real || 0,
                    t.total_cost || 0,
                    t.profit || 0,
                    t.profit_pct || 0
                ]
            })

            // 3. Convert to CSV String
            // We use \ufeff (BOM) to ensure Excel opens Thai characters correctly
            const csvContent = "\ufeff" + [
                headers.join(","),
                ...rows.map(r => r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
            ].join("\n")

            // 4. Trigger Download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            const fileName = `Trip_Performance_${todayTH()}.csv`
            
            link.setAttribute("href", url)
            link.setAttribute("download", fileName)
            link.style.visibility = "hidden"
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        } catch (error) {
            console.error("Export CSV Error:", error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <button 
            onClick={handleExport}
            disabled={loading || !data || data.length === 0}
            className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-2 group/btn text-sm border border-primary/20 disabled:opacity-50"
        >
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <FileDown size={18} className="group-hover/btn:translate-y-0.5 transition-transform" />
            )}
            Export CSV
        </button>
    )
}
