"use client"

import { Button } from "@/components/ui/button"
import * as XLSX from "xlsx"

interface ExcelExportProps {
  data: object[]
  filename?: string
  title?: string
  trigger?: React.ReactNode
}

export function ExcelExport({ 
  data, 
  filename = "export", 
  trigger 
}: ExcelExportProps) {

  const handleExport = () => {
    if (!data || data.length === 0) return

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(data)

    XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
    XLSX.writeFile(wb, `${filename}.xlsx`)
  }

  return (
    <div onClick={handleExport} className="cursor-pointer">
      {trigger || <Button variant="outline">Export to Excel</Button>}
    </div>
  )
}
