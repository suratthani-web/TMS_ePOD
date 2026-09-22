// อ่าน/สร้าง xlsx ฝั่ง browser ด้วย SheetJS (เบา + ข้าม sheet ใหญ่ได้ด้วย sheetRows)
import * as XLSX from "xlsx"
import type { PayslipGrid, PayslipCell, PayslipMerge } from "./types"

const MAX_COLS = 24
const MAX_ROWS = 400
const ROW_CAP = 500 // cap ตอน parse กัน sheet หมื่นแถวระเบิด memory

export interface ClientSheet {
  name: string
  rowCount: number
  isDriverSheet: boolean
  grid: PayslipGrid
  total: number | null
}

const isNumericText = (s: string) => s !== "" && /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/.test(s.trim())

function wsToGrid(ws: XLSX.WorkSheet): PayslipGrid {
  // ค่าแบบที่แสดงในไฟล์ (raw:false -> ใช้ข้อความที่ฟอร์แมตแล้ว เช่นวันที่)
  const aoa = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  }) as unknown as string[][]

  let rows = aoa.slice(0, MAX_ROWS)
  let maxCols = 0
  for (const r of rows) maxCols = Math.max(maxCols, r.length)
  maxCols = Math.min(maxCols || 1, MAX_COLS)

  const gridRows: PayslipCell[][] = rows.map((r) => {
    const cells: PayslipCell[] = []
    for (let c = 0; c < maxCols; c++) {
      const t = (r[c] ?? "").toString().replace(/\r?\n/g, " ").trim()
      const cell: PayslipCell = { t }
      if (isNumericText(t)) cell.n = true
      cells.push(cell)
    }
    return cells
  })

  // ตัดแถวว่างท้าย
  while (gridRows.length > 0 && gridRows[gridRows.length - 1].every((c) => c.t === "")) gridRows.pop()

  // ความกว้างคอลัมน์
  const cols: number[] = []
  const wsCols = (ws["!cols"] || []) as { wch?: number; wpx?: number }[]
  for (let c = 0; c < maxCols; c++) {
    const w = wsCols[c]?.wch
    cols.push(typeof w === "number" && w > 0 ? w : 10)
  }

  // merges
  const merges: PayslipMerge[] = []
  for (const m of (ws["!merges"] || []) as XLSX.Range[]) {
    if (m.s.c >= maxCols) continue
    merges.push({ r: m.s.r, c: m.s.c, rs: m.e.r - m.s.r + 1, cs: Math.min(m.e.c - m.s.c + 1, maxCols - m.s.c) })
  }

  rows = [] // free
  return { cols, merges, rows: gridRows, maxCols }
}

function looksLikeDriverGrid(grid: PayslipGrid): boolean {
  const keys = new Set<string>()
  for (let r = 0; r < Math.min(grid.rows.length, 6); r++) {
    for (const c of grid.rows[r]) if (c.t) keys.add(c.t)
  }
  const hasDate = keys.has("วันที่")
  const hasMoney = keys.has("รวม") || keys.has("ราคา") || keys.has("ค่าขึ้นชั้น")
  return hasDate && hasMoney
}

function guessTotal(grid: PayslipGrid): number | null {
  let best: number | null = null
  for (const row of grid.rows) {
    for (const cell of row) {
      if (cell.n) {
        const num = Number(cell.t.replace(/,/g, ""))
        if (!isNaN(num)) best = num
      }
    }
  }
  return best
}

/** parse ทั้งไฟล์ฝั่ง browser -> รายการ sheet + grid */
export function parseWorkbookClient(ab: ArrayBuffer): ClientSheet[] {
  const wb = XLSX.read(ab, { type: "array", sheetRows: ROW_CAP, cellDates: false, cellStyles: false })
  // ข้ามชีตที่ถูกซ่อนใน Excel (Hidden=1 / VeryHidden=2) — มักเป็นของเก่า/พัง (#REF!)
  // เพื่อให้หน้าอัปเห็นเฉพาะคนขับที่มองเห็นจริงในไฟล์ (ตรงกับที่ผู้ใช้เห็น)
  const wbMeta = (wb.Workbook && wb.Workbook.Sheets) || []
  const hiddenByName = new Map<string, number>()
  wb.SheetNames.forEach((n, i) => {
    const h = wbMeta[i]?.Hidden
    if (h) hiddenByName.set(n, h)
  })
  const out: ClientSheet[] = []
  for (const name of wb.SheetNames) {
    if (hiddenByName.get(name)) continue
    const ws = wb.Sheets[name]
    if (!ws) continue
    const ref = ws["!ref"]
    const rowCount = ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0
    const grid = wsToGrid(ws)
    const isDriver = looksLikeDriverGrid(grid)
    out.push({ name, rowCount, isDriverSheet: isDriver, grid, total: isDriver ? guessTotal(grid) : null })
  }
  return out
}

/** อ่าน workbook ครั้งเดียว (ใช้ตอนสร้างไฟล์รายคนหลายคน จะได้ไม่ parse ซ้ำ) */
export function readWorkbookClient(ab: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(ab, { type: "array", sheetRows: ROW_CAP, cellStyles: true })
}

/** สร้างไฟล์ xlsx รายคน (sheet เดียว) จาก workbook ที่อ่านไว้แล้ว -> Uint8Array */
export function buildSingleSheetFromWb(wb: XLSX.WorkBook, sheetName: string): Uint8Array {
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error("ไม่พบ sheet: " + sheetName)
  const out = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(out, ws, sheetName.slice(0, 31) || "Sheet1")
  return XLSX.write(out, { type: "array", bookType: "xlsx" }) as Uint8Array
}
