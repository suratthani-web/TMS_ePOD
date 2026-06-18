import 'server-only'

import { createAdminClient } from '@/utils/supabase/server'
import { getSheetsClient } from '@/lib/google-sheets'
import { getFuelPriceNumber } from '@/lib/actions/fuel-actions'

// Test sheet by default; set MASTER_SHEET_ID to swap to the real one.
const SHEET_ID = process.env.MASTER_SHEET_ID || '1PELYgiHBeIuweu64cctWV3kK0LIyIBqednrsUx5maWg'
const TAB = process.env.MASTER_SHEET_TAB || 'MASTER'

type ExtraCost = { type?: string; charge_cust?: number | string; cost_driver?: number | string }

// Keyword groups → the fixed MASTER charge columns (decision D).
// Anything not matching a group falls into "อื่นๆ" / "อื่นๆรถร่วม".
const CHARGE_GROUPS = {
  labor: ['ขึ้นชั้น', 'แรงงาน', 'ยกของ'],   // ค่าขึ้นชั้น
  move: ['ย้าย'],                            // ย้าย
  forward: ['ส่งต่อ'],                        // ค่าส่งต่อ (customer side only)
  return: ['ตีกลับ', 'ตี กลับ'],             // ตีกลับ
}
const ALL_KEYWORDS = Object.values(CHARGE_GROUPS).flat()

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parseExtras(raw: unknown): ExtraCost[] {
  let v = raw
  if (typeof v === 'string') {
    try { v = JSON.parse(v) } catch { return [] }
  }
  return Array.isArray(v) ? (v as ExtraCost[]) : []
}

// Sum a charge side (charge_cust / cost_driver) for extras whose type matches any keyword.
function sumByKeywords(extras: ExtraCost[], side: 'charge_cust' | 'cost_driver', keywords: string[]): number {
  return extras
    .filter(e => keywords.some(k => (e.type || '').includes(k)))
    .reduce((s, e) => s + num(e[side]), 0)
}

// Sum extras whose type matches NONE of the known charge groups → "อื่นๆ".
function sumUnmatched(extras: ExtraCost[], side: 'charge_cust' | 'cost_driver'): number {
  return extras
    .filter(e => !ALL_KEYWORDS.some(k => (e.type || '').includes(k)))
    .reduce((s, e) => s + num(e[side]), 0)
}

function totalSide(extras: ExtraCost[], side: 'charge_cust' | 'cost_driver'): number {
  return extras.reduce((s, e) => s + num(e[side]), 0)
}

// 2026-06-17 -> 17/06/2026 (matches the sheet's existing format)
function fmtDate(d?: string | null): string {
  if (!d) return ''
  const m = String(d).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d)
}

// Blank instead of 0 so the sheet stays clean for empty charges.
function n(v: number): number | '' {
  return v ? v : ''
}

/**
 * Append one verified job as a row to the MASTER tab of the Google Sheet.
 * Best-effort: returns {success,error} and never throws.
 * Column order matches the live MASTER tab (29 columns, A..AC).
 */
export async function appendJobToMaster(jobId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient()
    const { data: job, error } = await supabase
      .from('Jobs_Main')
      .select('*')
      .eq('Job_ID', jobId)
      .single()

    if (error || !job) return { success: false, error: 'Job not found' }

    const extras = parseExtras(job.extra_costs_json)

    // Decision C: fuel price for the job's date (blank if unavailable)
    let fuel: number | '' = ''
    try {
      const fp = await getFuelPriceNumber(String(job.Plan_Date || '').slice(0, 10) || undefined)
      fuel = fp ?? ''
    } catch { fuel = '' }

    // Customer-side charges
    const custLabor = sumByKeywords(extras, 'charge_cust', CHARGE_GROUPS.labor)
    const custMove = sumByKeywords(extras, 'charge_cust', CHARGE_GROUPS.move)
    const custForward = sumByKeywords(extras, 'charge_cust', CHARGE_GROUPS.forward)
    const custReturn = sumByKeywords(extras, 'charge_cust', CHARGE_GROUPS.return)
    const custOther = num(job.Price_Cust_Extra) + sumUnmatched(extras, 'charge_cust')
    const custBase = num(job.Price_Cust_Total)
    const custTotal = custBase + num(job.Price_Cust_Extra) + totalSide(extras, 'charge_cust')

    // Subcontractor (รถร่วม) charges
    const subLabor = sumByKeywords(extras, 'cost_driver', CHARGE_GROUPS.labor)
    const subMove = sumByKeywords(extras, 'cost_driver', CHARGE_GROUPS.move)
    const subReturn = sumByKeywords(extras, 'cost_driver', CHARGE_GROUPS.return)
    // รถร่วม side has no "ส่งต่อ" column → forwarding folds into อื่นๆรถร่วม
    const subOther = num(job.Cost_Driver_Extra) + sumUnmatched(extras, 'cost_driver') + sumByKeywords(extras, 'cost_driver', CHARGE_GROUPS.forward)
    const subBase = num(job.Cost_Driver_Total)
    const subTotal = subBase + num(job.Cost_Driver_Extra) + totalSide(extras, 'cost_driver')

    const distanceRoundTrip = num(job.Est_Distance_KM) * 2 // Decision B

    // Values keyed by the EXACT MASTER column header (not position). We then
    // place them according to the sheet's actual header row, so inserting,
    // adding or reordering columns later keeps working — matching is by name.
    // (Renaming a header is the only thing that would need a code update.)
    const byName: Record<string, string | number> = {
      'วันที่': fmtDate(job.Plan_Date),     // decision A: Plan_Date
      'รหัสลูกค้า': '',                       // blank: TMS Customer_ID format differs from the MASTER code
      'ลูกค้า': job.Customer_Name || '',
      'ประเภทรถลูกค้า': job.Vehicle_Type || '',
      'จำนวนสินค้าลูกค้า': n(num(job.Loaded_Qty)),
      'ต้นทางลูกค้า': job.Origin_Location || '',
      'ปลายทางลูกค้า': job.Dest_Location || '',
      'ระยะทางไป-กลับลูกค้า': n(distanceRoundTrip),   // decision B: ×2
      'ราคาน้ำมันลูกค้า': fuel,                          // decision C
      'ราคาลูกค้า': n(custBase),
      'ค่าขึ้นชั้นลูกค้า': n(custLabor),
      'ย้ายลูกค้า': n(custMove),
      'ค่าส่งต่อ': n(custForward),
      'เพิ่ม นน.': '',                       // no source — left blank
      'ตีกลับลูกค้า': n(custReturn),
      'อื่นๆ': n(custOther),
      'รวมลูกค้า': n(custTotal),
      'ทะเบียนรถร่วม': job.Vehicle_Plate || '',
      'ชื่อรถร่วม': job.Driver_Name || '',
      'ประเภทรถรถร่วม': job.Vehicle_Type || '',
      'ต้นทางรถร่วม': job.Origin_Location || '',
      'ปลายทางรถร่วม': job.Dest_Location || '',
      'ราคาน้ำมัน': fuel,
      'ราคารถร่วม': n(subBase),
      'ค่าขึ้นชั้นรถร่วม': n(subLabor),
      'ย้ายรถร่วม': n(subMove),
      'อื่นๆรถร่วม': n(subOther),
      'ตีกลับรถร่วม': n(subReturn),
      'รวมรถร่วม': n(subTotal),
    }

    // Fixed order, used only if the header row can't be read from the sheet.
    const FALLBACK_ORDER = [
      'วันที่', 'รหัสลูกค้า', 'ลูกค้า', 'ประเภทรถลูกค้า', 'จำนวนสินค้าลูกค้า', 'ต้นทางลูกค้า', 'ปลายทางลูกค้า',
      'ระยะทางไป-กลับลูกค้า', 'ราคาน้ำมันลูกค้า', 'ราคาลูกค้า', 'ค่าขึ้นชั้นลูกค้า', 'ย้ายลูกค้า', 'ค่าส่งต่อ',
      'เพิ่ม นน.', 'ตีกลับลูกค้า', 'อื่นๆ', 'รวมลูกค้า', 'ทะเบียนรถร่วม', 'ชื่อรถร่วม', 'ประเภทรถรถร่วม',
      'ต้นทางรถร่วม', 'ปลายทางรถร่วม', 'ราคาน้ำมัน', 'ราคารถร่วม', 'ค่าขึ้นชั้นรถร่วม', 'ย้ายรถร่วม',
      'อื่นๆรถร่วม', 'ตีกลับรถร่วม', 'รวมรถร่วม',
    ]

    const sheets = getSheetsClient()

    // Accept either a tab NAME or a gid (e.g. "gid=1430884426" copied from the
    // sheet URL) — the Sheets API ranges need the tab name, so resolve a gid.
    let tabName = TAB
    const gidMatch = TAB.match(/^(?:gid=)?(\d+)$/)
    if (gidMatch) {
      try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties(sheetId,title)' })
        const t = meta.data.sheets?.find(s => String(s.properties?.sheetId) === gidMatch[1])?.properties?.title
        if (t) tabName = t
      } catch { /* keep TAB as-is */ }
    }
    // Quote the tab name so names with spaces (e.g. "MASTER เดือนมกราคม") work.
    const qtab = `'${tabName.replace(/'/g, "''")}'`

    // Find the header row (the one containing "วันที่") and place values by name.
    let headers: string[] = []
    try {
      const head = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${qtab}!A1:BZ3` })
      const found = (head.data.values || []).find(r => (r || []).some(c => String(c).trim() === 'วันที่'))
      headers = (found || []).map(h => String(h || '').trim())
    } catch {
      // fall back to fixed order
    }

    const order = headers.length > 0 ? headers : FALLBACK_ORDER
    // Unknown columns (e.g. ones added later) get an empty value, not a crash.
    const row = order.map(h => byName[h] ?? '')

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${qtab}!A:BZ`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[MASTER_SHEET] append failed:', msg)
    return { success: false, error: msg }
  }
}
