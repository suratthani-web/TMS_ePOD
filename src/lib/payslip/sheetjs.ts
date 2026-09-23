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
  extraText?: string
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

  const srcRows = aoa.slice(0, MAX_ROWS)
  let srcMaxCols = 0
  for (const r of srcRows) srcMaxCols = Math.max(srcMaxCols, r.length)
  srcMaxCols = Math.min(srcMaxCols || 1, MAX_COLS)

  // แถว/คอลัมน์ที่ถูก "ซ่อน" ใน Excel (แอดมินซ่อนส่วนที่ไม่มีจ่ายรอบนั้น) → ข้ามทั้งหมด
  const rowMeta = (ws["!rows"] || []) as ({ hidden?: boolean } | undefined)[]
  const colMeta = (ws["!cols"] || []) as ({ hidden?: boolean; wch?: number } | undefined)[]
  const isRowHidden = (i: number) => !!rowMeta[i]?.hidden
  const isColHidden = (i: number) => !!colMeta[i]?.hidden

  // map คอลัมน์เดิม -> ใหม่ (เฉพาะที่ไม่ซ่อน)
  const visCols: number[] = []
  for (let c = 0; c < srcMaxCols; c++) if (!isColHidden(c)) visCols.push(c)
  const colNew = new Map<number, number>()
  visCols.forEach((oldC, newC) => colNew.set(oldC, newC))
  const maxCols = visCols.length || 1

  // map แถวเดิม -> ใหม่ (เฉพาะที่ไม่ซ่อน)
  const visRows: number[] = []
  for (let r = 0; r < srcRows.length; r++) if (!isRowHidden(r)) visRows.push(r)
  const rowNew = new Map<number, number>()
  visRows.forEach((oldR, newR) => rowNew.set(oldR, newR))

  const gridRows: PayslipCell[][] = visRows.map((oldR) => {
    const src = srcRows[oldR] || []
    return visCols.map((oldC) => {
      const t = (src[oldC] ?? "").toString().replace(/\r?\n/g, " ").trim()
      const cell: PayslipCell = { t }
      if (isNumericText(t)) cell.n = true
      return cell
    })
  })

  // ตัดแถวว่างท้าย
  while (gridRows.length > 0 && gridRows[gridRows.length - 1].every((c) => c.t === "")) gridRows.pop()

  // ความกว้างคอลัมน์ (เฉพาะคอลัมน์ที่แสดง)
  const cols: number[] = visCols.map((oldC) => {
    const w = colMeta[oldC]?.wch
    return typeof w === "number" && w > 0 ? w : 10
  })

  // merges — remap เป็นดัชนีใหม่ ตัดส่วนที่อยู่ในแถว/คอลัมน์ที่ซ่อนออก
  const merges: PayslipMerge[] = []
  for (const m of (ws["!merges"] || []) as XLSX.Range[]) {
    const rIn: number[] = []
    for (let r = m.s.r; r <= m.e.r; r++) if (rowNew.has(r)) rIn.push(rowNew.get(r)!)
    const cIn: number[] = []
    for (let c = m.s.c; c <= m.e.c; c++) if (colNew.has(c)) cIn.push(colNew.get(c)!)
    if (rIn.length === 0 || cIn.length === 0) continue
    const newR = Math.min(...rIn), newC = Math.min(...cIn)
    if (newR >= gridRows.length) continue
    merges.push({ r: newR, c: newC, rs: rIn.length, cs: cIn.length })
  }

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
  // cellStyles:true จำเป็นเพื่ออ่านสถานะ "ซ่อน" ของแถว/คอลัมน์ (!rows/!cols hidden)
  const wb = XLSX.read(ab, { type: "array", sheetRows: ROW_CAP, cellDates: false, cellStyles: true })
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
    const extraText = grid.rows[0]?.map((c) => c.t).filter(Boolean).join(" ") || ""
    out.push({ name, rowCount, isDriverSheet: isDriver, grid, total: isDriver ? guessTotal(grid) : null, extraText })
  }
  return out
}

// ---------------------------------------------------------------------------
// ตารางแม่ (master roster) — Sheet ที่รวมรายชื่อ+ยอดของทุกคนในงวด
// ใช้สร้าง "สลิปสรุป" ให้คนที่ไม่มีแท็บรายละเอียด
// ---------------------------------------------------------------------------
export interface MasterPerson {
  seq?: number
  code?: string
  name: string
  bankName?: string
  bankNo?: string
  income: number
  deductions: { label: string; amount: number }[]
  net: number       // คงเหลือ
  wht: number       // หัก ณ ที่จ่าย
  transfer: number  // ยอดโอนสุทธิ
}

const toNum = (v: unknown): number => {
  if (typeof v === "number") return v
  const n = parseFloat(String(v ?? "").replace(/[, ]/g, ""))
  return isNaN(n) ? 0 : n
}

/** หา + parse ตารางแม่ (Sheet1) → รายชื่อผู้รับเงินพร้อมยอด */
export function parseMasterRoster(ab: ArrayBuffer): MasterPerson[] {
  const wb = XLSX.read(ab, { type: "array", sheetRows: 2000, cellDates: false, cellStyles: false })
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" })
    if (aoa.length < 3) continue
    const h1 = (aoa[0] || []).map((c) => String(c || "").trim())
    const h2 = (aoa[1] || []).map((c) => String(c || "").trim())
    // ต้องเป็นตารางแม่: มีคอลัมน์ "ชื่อ-นามสกุล" + "รายได้"
    const nameCol = h1.findIndex((c) => c.includes("ชื่อ"))
    const incomeCol = h1.findIndex((c) => c.includes("รายได้"))
    if (nameCol < 0 || incomeCol < 0) continue
    const codeCol = h1.findIndex((c) => c.includes("ผู้รับเงิน") || c.includes("คู่ค้า"))
    const bankNoCol = h1.findIndex((c) => c.includes("เลขที่บัญชี"))
    const bankNameCol = h2.findIndex((c) => c.includes("ธนาคาร"))
    const netCol = h1.findIndex((c) => c.includes("คงเหลือ"))
    const whtCol = h1.findIndex((c) => c.includes("ณ ที่จ่าย"))
    const transferCol = h1.findIndex((c) => c.includes("ยอดโอน"))
    // คอลัมน์หัก = อยู่ระหว่าง "หัก" กับ "คงเหลือ"
    const dedStart = h1.findIndex((c) => c === "หัก")
    const people: MasterPerson[] = []
    for (let r = 2; r < aoa.length; r++) {
      const row = aoa[r] || []
      const nm = String(row[nameCol] || "").trim()
      if (!nm) continue
      const income = toNum(row[incomeCol])
      const deductions: { label: string; amount: number }[] = []
      if (dedStart >= 0 && netCol > dedStart) {
        for (let c = dedStart; c < netCol; c++) {
          const amt = toNum(row[c])
          const label = String(h2[c] || "").trim() || "หัก"
          if (amt > 0) deductions.push({ label, amount: amt })
        }
      }
      people.push({
        seq: toNum(row[0]) || undefined,
        code: codeCol >= 0 ? String(row[codeCol] || "").trim() : undefined,
        name: nm,
        bankName: bankNameCol >= 0 ? String(row[bankNameCol] || "").trim() : undefined,
        bankNo: bankNoCol >= 0 ? String(row[bankNoCol] || "").trim() : undefined,
        income,
        deductions,
        net: netCol >= 0 ? toNum(row[netCol]) : income,
        wht: whtCol >= 0 ? toNum(row[whtCol]) : 0,
        transfer: transferCol >= 0 ? toNum(row[transferCol]) : income,
      })
    }
    if (people.length) return people
  }
  return []
}

const fmtMoney = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** สร้าง grid สรุป (ใช้ PayslipGridView เดิม render ได้เลย) จากคน 1 คนในตารางแม่ */
export function masterPersonToGrid(p: MasterPerson): PayslipGrid {
  const rows: PayslipCell[][] = []
  rows.push([{ t: p.name, b: true }, { t: p.code || "" }])
  rows.push([{ t: "รายการ", b: true }, { t: "จำนวนเงิน (บาท)", b: true, a: "right" }])
  rows.push([{ t: "รายได้รวม" }, { t: fmtMoney(p.income), n: true }])
  for (const d of p.deductions) rows.push([{ t: `หัก: ${d.label}` }, { t: `-${fmtMoney(d.amount)}`, n: true }])
  rows.push([{ t: "คงเหลือ", b: true }, { t: fmtMoney(p.net), n: true, b: true }])
  if (p.wht > 0) rows.push([{ t: "หัก ณ ที่จ่าย 1%" }, { t: `-${fmtMoney(p.wht)}`, n: true }])
  rows.push([{ t: "ยอดโอนสุทธิ", b: true }, { t: fmtMoney(p.transfer), n: true, b: true }])
  const bank = [p.bankName, p.bankNo].filter(Boolean).join(" ")
  if (bank) rows.push([{ t: "ธนาคาร" }, { t: bank }])
  return { cols: [34, 22], merges: [], rows, maxCols: 2 }
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
