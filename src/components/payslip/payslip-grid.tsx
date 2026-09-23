"use client"

import React from "react"
import type { PayslipGrid } from "@/lib/payslip/types"

interface Props {
  grid: PayslipGrid
  /** px ต่อ 1 หน่วยความกว้าง Excel */
  pxPerUnit?: number
}

/**
 * แสดง PayslipGrid เป็นตาราง HTML (รักษา merge, ความกว้างคอลัมน์, ตัวหนา, การจัดชิด)
 * ใช้ทั้งฝั่งแอดมิน (preview) และฝั่งคนขับ (มือถือ + แหล่ง render สำหรับ PDF)
 */
export const PayslipGridView = React.forwardRef<HTMLDivElement, Props>(function PayslipGridView(
  { grid, pxPerUnit = 7 },
  ref
) {
  const maxCols = grid.maxCols || (grid.rows[0]?.length ?? 0)

  // สร้างแผนที่ merge: key "r:c" -> {rs,cs} สำหรับ top-left, และ set ของ cell ที่ถูกคลุม
  const spanMap = new Map<string, { rs: number; cs: number }>()
  const covered = new Set<string>()
  for (const m of grid.merges || []) {
    if (m.c >= maxCols) continue
    const cs = Math.min(m.cs, maxCols - m.c)
    spanMap.set(`${m.r}:${m.c}`, { rs: m.rs, cs })
    for (let r = m.r; r < m.r + m.rs; r++) {
      for (let c = m.c; c < m.c + cs; c++) {
        if (r === m.r && c === m.c) continue
        covered.add(`${r}:${c}`)
      }
    }
  }

  return (
    <div ref={ref} style={{ background: "#ffffff", padding: 12, display: "inline-block", minWidth: "100%" }}>
      <table
        style={{
          borderCollapse: "collapse",
          fontSize: 13,
          color: "#111827",
          fontFamily:
            "'Noto Sans Thai', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          {Array.from({ length: maxCols }).map((_, c) => (
            <col key={c} style={{ width: Math.round((grid.cols[c] || 10) * pxPerUnit) }} />
          ))}
        </colgroup>
        <tbody>
          {grid.rows.map((row, r) => {
            // ข้ามแถวว่างเปล่า (จากเทมเพลต Excel ที่มีแถวสำรอง) — แต่ไม่ข้ามถ้าเป็นส่วนของ merge
            const isEmptyRow = Array.from({ length: maxCols }).every((_, c) => {
              const val = (row[c]?.t ?? "").trim()
              return (val === "" || val === "-") && !covered.has(`${r}:${c}`) && !spanMap.has(`${r}:${c}`)
            })
            if (isEmptyRow) return null
            return (
            <tr key={r}>
              {Array.from({ length: maxCols }).map((_, c) => {
                if (covered.has(`${r}:${c}`)) return null
                const cell = row[c] || { t: "" }
                const span = spanMap.get(`${r}:${c}`)
                const align = cell.a || (cell.n ? "right" : "left")
                return (
                  <td
                    key={c}
                    rowSpan={span?.rs}
                    colSpan={span?.cs}
                    style={{
                      border: "1px solid #d1d5db",
                      padding: "3px 6px",
                      textAlign: align,
                      fontWeight: cell.b ? 700 : 400,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      verticalAlign: "middle",
                    }}
                  >
                    {cell.t}
                  </td>
                )
              })}
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})
