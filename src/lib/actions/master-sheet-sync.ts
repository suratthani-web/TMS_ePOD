import 'server-only'

import { createAdminClient } from '@/utils/supabase/server'
import { getSheetsClient } from '@/lib/google-sheets'
import { getFuelPriceNumber } from '@/lib/actions/fuel-actions'

// Test sheet by default; set MASTER_SHEET_ID to swap to the real one.
const SHEET_ID = process.env.MASTER_SHEET_ID || '1PELYgiHBeIuweu64cctWV3kK0LIyIBqednrsUx5maWg'
const TAB = process.env.MASTER_SHEET_TAB || 'สยามรุ่งเรือง'

type ExtraCost = { type?: string; charge_cust?: number | string; cost_driver?: number | string }
type MasterJob = Record<string, unknown>
type LegacyLedgerRow = { rowNumber: number; date: string; fingerprint: string }

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

// Fixed order, used only if the header row can't be read from the sheet.
const FALLBACK_ORDER = [
  'วันที่', 'รหัสสร้างงาน', 'รหัสลูกค้า', 'ลูกค้า', 'ประเภทรถลูกค้า', 'จำนวนสินค้าลูกค้า', 'ต้นทางลูกค้า', 'ปลายทางลูกค้า',
  'ระยะทางไป-กลับลูกค้า', 'ราคาน้ำมันลูกค้า', 'ราคาลูกค้า', 'ค่าขึ้นชั้นลูกค้า', 'ย้ายลูกค้า', 'ค่าส่งต่อ',
  'เพิ่ม นน.', 'ตีกลับลูกค้า', 'อื่นๆ', 'รวมลูกค้า', 'ทะเบียนรถร่วม', 'ชื่อรถร่วม', 'ประเภทรถรถร่วม',
  'ต้นทางรถร่วม', 'ปลายทางรถร่วม', 'ราคาน้ำมัน', 'ราคารถร่วม', 'ค่าขึ้นชั้นรถร่วม', 'ย้ายรถร่วม',
  'อื่นๆรถร่วม', 'ตีกลับรถร่วม', 'รวมรถร่วม', 'สังกัด', 'เลขที่บัญชีรถร่วม', 'สถานะการจ่ายเงิน',
]

type SheetsClient = ReturnType<typeof getSheetsClient>

// Resolve the tab name (accepting a gid) and read the header row once, so a
// batch backfill doesn't repeat this per row.
async function resolveOrder(sheets: SheetsClient, tabOverride?: string): Promise<{ qtab: string; order: string[]; headerRow: number }> {
  let tabName = tabOverride || TAB
  const gidMatch = tabName.match(/^(?:gid=)?(\d+)$/)
  if (gidMatch) {
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties(sheetId,title)' })
      const t = meta.data.sheets?.find(s => String(s.properties?.sheetId) === gidMatch[1])?.properties?.title
      if (t) tabName = t
    } catch { /* keep TAB as-is */ }
  }
  const qtab = `'${tabName.replace(/'/g, "''")}'`

  let headers: string[] = []
  let headerRow = 1
  try {
    const head = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${qtab}!A1:BZ3` })
    const rows = head.data.values || []
    const foundIndex = rows.findIndex(r => (r || []).some(c => String(c).trim() === 'วันที่'))
    const found = foundIndex >= 0 ? rows[foundIndex] : undefined
    if (foundIndex >= 0) headerRow = foundIndex + 1
    headers = (found || []).map(h => String(h || '').trim())
  } catch { /* fall back to fixed order */ }

  return { qtab, order: headers.length > 0 ? headers : FALLBACK_ORDER, headerRow }
}

function normalizeSheetDate(value: unknown): string | null {
  const raw = String(value || '').trim()
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

function fingerprintText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function fingerprintNumber(value: unknown): string {
  const parsed = Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(parsed) ? String(parsed) : fingerprintText(value)
}

function legacyFingerprint(values: {
  date: unknown
  customer: unknown
  quantity: unknown
  origin: unknown
  destination: unknown
  plate: unknown
  customerPrice: unknown
  subcontractorPrice: unknown
}): string {
  return [
    normalizeSheetDate(values.date) || String(values.date || '').slice(0, 10),
    fingerprintText(values.customer),
    fingerprintNumber(values.quantity),
    fingerprintText(values.origin),
    fingerprintText(values.destination),
    fingerprintText(values.plate),
    fingerprintNumber(values.customerPrice),
    fingerprintNumber(values.subcontractorPrice),
  ].join('|')
}

function jobLegacyFingerprint(job: MasterJob): string {
  return legacyFingerprint({
    date: job.Plan_Date,
    customer: job.Customer_Name,
    quantity: job.Loaded_Qty,
    origin: job.Origin_Location,
    destination: job.Dest_Location,
    plate: job.Vehicle_Plate,
    customerPrice: job.Price_Cust_Total,
    subcontractorPrice: job.Cost_Driver_Total,
  })
}

function columnLetter(index: number): string {
  let value = index + 1
  let result = ''
  while (value > 0) {
    value--
    result = String.fromCharCode(65 + (value % 26)) + result
    value = Math.floor(value / 26)
  }
  return result
}

/**
 * Read identifiers already present in the ledger. Older rows have no Job_ID,
 * so retain a per-date count for those rows; this lets a one-time migration
 * continue after the last complete legacy date without duplicating it.
 */
async function readLedgerState(
  sheets: SheetsClient,
  qtab: string,
  order: string[],
  headerRow: number
): Promise<{
  jobIds: Set<string>
  legacyRowsByDate: Map<string, number>
  legacyFingerprints: Map<string, number>
  legacyRows: LegacyLedgerRow[]
}> {
  const dateIndex = order.indexOf('วันที่')
  const jobIdIndex = order.indexOf('รหัสสร้างงาน')
  if (dateIndex < 0 || jobIdIndex < 0) {
    throw new Error('MASTER sheet must contain วันที่ and รหัสสร้างงาน columns')
  }

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${qtab}!A${headerRow + 1}:BZ`,
    valueRenderOption: 'FORMATTED_VALUE',
  })
  const jobIds = new Set<string>()
  const legacyRowsByDate = new Map<string, number>()
  const legacyFingerprints = new Map<string, number>()
  const legacyRows: LegacyLedgerRow[] = []
  const valueAt = (row: unknown[], header: string) => row[order.indexOf(header)]
  for (const [offset, row] of (existing.data.values || []).entries()) {
    const jobId = String(row[jobIdIndex] || '').trim()
    if (jobId) {
      jobIds.add(jobId)
      continue
    }
    const date = normalizeSheetDate(row[dateIndex])
    if (date) {
      legacyRowsByDate.set(date, (legacyRowsByDate.get(date) || 0) + 1)
      const fingerprint = legacyFingerprint({
        date,
        customer: valueAt(row, 'ลูกค้า'),
        quantity: valueAt(row, 'จำนวนสินค้าลูกค้า'),
        origin: valueAt(row, 'ต้นทางลูกค้า'),
        destination: valueAt(row, 'ปลายทางลูกค้า'),
        plate: valueAt(row, 'ทะเบียนรถร่วม'),
        customerPrice: valueAt(row, 'ราคาลูกค้า'),
        subcontractorPrice: valueAt(row, 'ราคารถร่วม'),
      })
      legacyFingerprints.set(fingerprint, (legacyFingerprints.get(fingerprint) || 0) + 1)
      legacyRows.push({ rowNumber: headerRow + 1 + offset, date, fingerprint })
    }
  }
  return { jobIds, legacyRowsByDate, legacyFingerprints, legacyRows }
}

async function fillLegacyJobIds(
  sheets: SheetsClient,
  qtab: string,
  order: string[],
  jobs: MasterJob[],
  ledger: Awaited<ReturnType<typeof readLedgerState>>
): Promise<number> {
  const jobIdIndex = order.indexOf('รหัสสร้างงาน')
  if (jobIdIndex < 0 || ledger.legacyRows.length === 0) return 0

  const availableByFingerprint = new Map<string, string[]>()
  for (const job of jobs) {
    const jobId = String(job.Job_ID || '').trim()
    if (!jobId || ledger.jobIds.has(jobId)) continue
    const fingerprint = jobLegacyFingerprint(job)
    const ids = availableByFingerprint.get(fingerprint) || []
    ids.push(jobId)
    availableByFingerprint.set(fingerprint, ids)
  }

  const jobIdColumn = columnLetter(jobIdIndex)
  const updates: { range: string; values: string[][] }[] = []
  for (const row of ledger.legacyRows) {
    const ids = availableByFingerprint.get(row.fingerprint)
    const jobId = ids?.shift()
    if (!jobId) continue
    updates.push({ range: `${qtab}!${jobIdColumn}${row.rowNumber}`, values: [[jobId]] })
  }

  for (let i = 0; i < updates.length; i += 500) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates.slice(i, i + 500),
      },
    })
  }
  return updates.length
}

function jobsMissingFromLedger(
  jobs: MasterJob[],
  jobIds: Set<string>,
  legacyRowsByDate: Map<string, number>,
  legacyFingerprints: Map<string, number>
): MasterJob[] {
  const candidates = jobs.filter(job => {
    const jobId = String(job.Job_ID || '').trim()
    return !jobId || !jobIds.has(jobId)
  })

  const fingerprintsLeft = new Map(legacyFingerprints)
  const legacyRowsLeft = new Map(legacyRowsByDate)
  const unmatched: MasterJob[] = []
  for (const job of candidates) {
    const fingerprint = jobLegacyFingerprint(job)
    const matches = fingerprintsLeft.get(fingerprint) || 0
    if (matches > 0) {
      fingerprintsLeft.set(fingerprint, matches - 1)
      const date = String(job.Plan_Date || '').slice(0, 10)
      legacyRowsLeft.set(date, Math.max(0, (legacyRowsLeft.get(date) || 0) - 1))
    } else {
      unmatched.push(job)
    }
  }

  // Fallback for a legacy row that was manually edited after export. Exact
  // fingerprints handle normal rows; the remaining per-date count prevents a
  // changed legacy row from being duplicated when its Job_ID is unavailable.
  return unmatched.filter(job => {
    const date = String(job.Plan_Date || '').slice(0, 10)
    const count = legacyRowsLeft.get(date) || 0
    if (count > 0) {
      legacyRowsLeft.set(date, count - 1)
      return false
    }
    return true
  })
}

// Build the MASTER row for a job, keyed by column header name.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRowValues(job: any, fuel: number | ''): Record<string, string | number> {
    const extras = parseExtras(job.extra_costs_json)

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
    let custId = 20
    const idStr = String(job.Customer_ID || '').toLowerCase()
    const nameStr = String(job.Customer_Name || '').toLowerCase()

    if (idStr.includes('unicord') || idStr.includes('ยูนิคอร์ด') || nameStr.includes('unicord') || nameStr.includes('ยูนิคอร์ด')) {
      custId = 2
    } else if (idStr.includes('siam') || idStr.includes('สยามรุ่งเรือง') || nameStr.includes('siam') || nameStr.includes('สยามรุ่งเรือง')) {
      custId = 20
    } else if (job.Customer_ID) {
      const parsedId = Number(job.Customer_ID)
      if (!isNaN(parsedId)) custId = parsedId
    }

    const byName: Record<string, string | number> = {
      'วันที่': fmtDate(job.Plan_Date),     // decision A: Plan_Date
      'รหัสสร้างงาน': job.Job_ID || '',
      'รหัสลูกค้า': custId,
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
      // Use ROW() so the same formulas work for single appends and every row
      // in a multi-row backfill without knowing the destination row in advance.
      'สังกัด': '=IFERROR(VLOOKUP(INDEX($S:$S,ROW()),\'รถร่วม\'!$A$4:$D$350,4,FALSE),"")',
      'เลขที่บัญชีรถร่วม': '=IFERROR(VLOOKUP(INDEX($S:$S,ROW()),\'รถร่วม\'!$A:$E,5,FALSE),"")',
    }

    return byName
}

/**
 * Helper to match a job's customer name or ID to an existing Google Sheet tab title.
 */
export function getJobTabName(
  job: { Customer_Name?: unknown; Customer_ID?: unknown },
  existingTabs: string[]
): string {
  if (!job.Customer_Name && !job.Customer_ID) return TAB

  const cleanStr = (s: string) => {
    return s.toLowerCase()
      .replace(/บริษัท|จำกัด\(มหาชน\)|จำกัด|ห้างหุ้นส่วนจำกัด|หจก\./g, '')
      .replace(/[\s\(\)\-\.,_]/g, '')
      .trim()
  }

  const normCustName = job.Customer_Name ? cleanStr(String(job.Customer_Name)) : ''
  const normCustId = job.Customer_ID ? cleanStr(String(job.Customer_ID)) : ''

  const matchedTab = existingTabs.find(tab => {
    const normTab = cleanStr(tab)
    if (!normTab) return false
    
    if (normCustName === normTab || normCustId === normTab) return true
    if (normCustName && normTab && (normCustName.includes(normTab) || normTab.includes(normCustName))) return true
    if (normCustId && normTab && (normCustId.includes(normTab) || normTab.includes(normCustId))) return true
    
    return false
  })

  if (matchedTab) return matchedTab

  // If no exact dedicated tab exists for this customer:
  // Siam Rungrueng -> "สยามรุ่งเรือง" tab
  if (normCustName.includes('สยามรุ่งเรือง') || normCustName.includes('siam') || normCustId === '20') {
    const siamTab = existingTabs.find(t => t.includes('สยามรุ่งเรือง'))
    if (siamTab) return siamTab
  }

  // Multi-customer tab (Unicord + 4 new customers) -> "ยูนิคอร์ด" tab
  const unicordTab = existingTabs.find(t => t.includes('ยูนิคอร์ด'))
  if (unicordTab) return unicordTab

  return TAB
}

/**
 * Sort range in a Google Sheet tab by Date (Col 1) ascending and Customer (Col 4) ascending.
 */
export async function sortSheetTab(
  sheets: SheetsClient,
  tabName: string
): Promise<void> {
  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
      fields: 'sheets.properties(sheetId,title)',
    })
    const sheetProp = meta.data.sheets?.find(
      (s: { properties?: { title?: string | null; sheetId?: number | null } | null }) => s.properties?.title === tabName
    )?.properties
    if (!sheetProp || sheetProp.sheetId === undefined) return

    const sheetId = sheetProp.sheetId
    const { order, headerRow } = await resolveOrder(sheets, tabName)

    const dateColIndex = order.indexOf('วันที่') >= 0 ? order.indexOf('วันที่') : 0
    const custColIndex = order.indexOf('ลูกค้า') >= 0 ? order.indexOf('ลูกค้า') : 3

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            sortRange: {
              range: {
                sheetId: sheetId,
                startRowIndex: headerRow, // Skip header row
                startColumnIndex: 0,
                endColumnIndex: order.length,
              },
              sortSpecs: [
                {
                  dimensionIndex: dateColIndex,
                  sortOrder: 'ASCENDING',
                },
                {
                  dimensionIndex: custColIndex,
                  sortOrder: 'ASCENDING',
                },
              ],
            },
          },
        ],
      },
    })
    console.log(`[MASTER_SHEET] Auto-sorted tab '${tabName}' chronologically by Date and Customer.`)
  } catch (err) {
    console.warn(`[MASTER_SHEET] Auto-sort tab '${tabName}' warning:`, err)
  }
}

/**
 * Append one verified job as a row to the MASTER tab of the Google Sheet.
 * Best-effort: returns {success,error} and never throws.
 */
export async function appendJobToMaster(jobId: string): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  try {
    const supabase = createAdminClient()
    const { data: job, error } = await supabase.from('Jobs_Main').select('*').eq('Job_ID', jobId).single()
    if (error || !job) return { success: false, error: 'Job not found' }

    let fuel: number | '' = ''
    try { fuel = (await getFuelPriceNumber(String(job.Plan_Date || '').slice(0, 10) || undefined)) ?? '' } catch { fuel = '' }

    const byName = buildRowValues(job, fuel)
    const sheets = getSheetsClient()

    let tabOverride = TAB
    if (job.Customer_Name || job.Customer_ID) {
      try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties(title)' })
        const existingTabs = meta.data.sheets?.map(s => s.properties?.title || '') || []
        tabOverride = getJobTabName(job, existingTabs)
      } catch (e) {
        console.warn('[MASTER_SHEET] failed to fetch sheet metadata, using default tab:', e)
      }
    }

    const { qtab, order, headerRow } = await resolveOrder(sheets, tabOverride)
    const ledger = await readLedgerState(sheets, qtab, order, headerRow)
    if (ledger.jobIds.has(jobId)) return { success: true, skipped: true }
    const row = order.map(h => byName[h] ?? '')

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${qtab}!A:BZ`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })

    // Auto-sort the tab chronologically by Date & Customer
    await sortSheetTab(sheets, tabOverride)

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[MASTER_SHEET] append failed:', msg)
    return { success: false, error: msg }
  }
}

// Job statuses that represent finished/delivered work (eligible for the
// historical verification backfill). Cancelled/Draft/in-progress are excluded.
const DONE_STATUSES = ['Completed', 'Complete', 'Delivered', 'Finished', 'Closed', 'Billed', 'Paid', 'Verified']
const BILLING_LOCKED = ['Billed', 'Paid'] // keep Job_Status; only flag verification

/**
 * ONE-TIME historical backfill: for every finished job in the optional
 * `startDate`..`endDate` range (or everything on/before `endDate`),
 * mark it Verified (Job_Status -> 'Verified' unless already Billed/Paid) and
 * write it to the MASTER tab. Intended for a fresh tab.
 */
export async function verifyAndBackfillHistorical(
  endDate: string,
  startDate?: string,
  customerId?: string
): Promise<{ success: boolean; verified?: number; appended?: number; jobIdsFilled?: number; error?: string }> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate))) {
      return { success: false, error: 'Date range must use YYYY-MM-DD' }
    }
    if (startDate && startDate > endDate) {
      return { success: false, error: 'Start date must not be after end date' }
    }

    const supabase = createAdminClient()

    // Supabase caps a single request at ~1000 rows (server max-rows), so page
    // through with .range() until exhausted — otherwise only the earliest 1000
    // jobs came back and the tail (later dates) was silently dropped.
    const PAGE = 1000
    const jobs: MasterJob[] = []
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from('Jobs_Main')
        .select('*')
        .lte('Plan_Date', endDate)
        .in('Job_Status', DONE_STATUSES)
        .order('Plan_Date', { ascending: true })
        .order('Job_ID', { ascending: true })
        .range(from, from + PAGE - 1)
      if (startDate) query = query.gte('Plan_Date', startDate)
      if (customerId && customerId !== 'All') query = query.eq('Customer_ID', customerId)
      
      const { data, error } = await query
      if (error) return { success: false, error: error.message }
      if (!data || data.length === 0) break
      jobs.push(...data)
      if (data.length < PAGE) break
    }

    if (jobs.length === 0) return { success: true, verified: 0, appended: 0 }

    // Only touch jobs not already verified. This makes the action safe to
    // re-run: a second run processes just the remaining unverified jobs and
    // won't duplicate rows already written for the verified ones.
    const pending = jobs.filter(j => j.Verification_Status !== 'Verified')

    // Split: billing-locked jobs keep their status, the rest move to 'Verified'.
    const now = new Date().toISOString()
    const toVerifyStatus: string[] = [] // -> Job_Status='Verified'
    const toFlagOnly: string[] = []     // -> Verification only
    for (const job of pending) {
      const jobId = String(job.Job_ID || '')
      if (!jobId) continue
      if (BILLING_LOCKED.includes(String(job.Job_Status || ''))) toFlagOnly.push(jobId)
      else toVerifyStatus.push(jobId)
    }

    const chunk = <T,>(arr: T[], size: number) =>
      Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

    const sheets = getSheetsClient()
    
    // Fetch all existing tabs from Google Sheets to group properly
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties(title)' })
    const existingTabs = meta.data.sheets?.map(s => s.properties?.title || '') || []

    const jobsByTab = new Map<string, MasterJob[]>()
    for (const job of jobs) {
      const tabName = getJobTabName(job, existingTabs)
      if (!jobsByTab.has(tabName)) {
        jobsByTab.set(tabName, [])
      }
      jobsByTab.get(tabName)!.push(job)
    }

    const fuelCache = new Map<string, number | ''>()
    let totalAppended = 0
    let totalJobIdsFilled = 0

    for (const [tabName, tabJobs] of jobsByTab.entries()) {
      const { qtab, order, headerRow } = await resolveOrder(sheets, tabName)
      const ledger = await readLedgerState(sheets, qtab, order, headerRow)
      const jobIdsFilled = await fillLegacyJobIds(sheets, qtab, order, tabJobs, ledger)
      totalJobIdsFilled += jobIdsFilled

      const missingJobs = jobsMissingFromLedger(
        tabJobs,
        ledger.jobIds,
        ledger.legacyRowsByDate,
        ledger.legacyFingerprints
      )

      const rows: (string | number)[][] = []
      for (const job of missingJobs) {
        const dateKey = String(job.Plan_Date || '').slice(0, 10)
        let fuel = fuelCache.get(dateKey)
        if (fuel === undefined) {
          try { fuel = (await getFuelPriceNumber(dateKey || undefined)) ?? '' } catch { fuel = '' }
          fuelCache.set(dateKey, fuel)
        }
        rows.push(order.map(h => buildRowValues(job, fuel as number | '')[h] ?? ''))
      }

      for (let i = 0; i < rows.length; i += 500) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${qtab}!A:BZ`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: rows.slice(i, i + 500) },
        })
      }
      totalAppended += rows.length

      // Auto-sort the tab chronologically by Date & Customer after backfill
      if (rows.length > 0) {
        await sortSheetTab(sheets, tabName)
      }
    }

    // Mark verification only after the ledger write succeeds. If a database
    // update fails, a rerun sees the Job_ID in the sheet and safely retries the
    // status update without appending the row again.
    for (const ids of chunk(toVerifyStatus, 400)) {
      const { error } = await supabase.from('Jobs_Main')
        .update({ Job_Status: 'Verified', Verification_Status: 'Verified', Verified_By: 'backfill', Verified_At: now })
        .in('Job_ID', ids)
      if (error) return { success: false, appended: totalAppended, jobIdsFilled: totalJobIdsFilled, error: error.message }
    }
    for (const ids of chunk(toFlagOnly, 400)) {
      const { error } = await supabase.from('Jobs_Main')
        .update({ Verification_Status: 'Verified', Verified_By: 'backfill', Verified_At: now })
        .in('Job_ID', ids)
      if (error) return { success: false, appended: totalAppended, jobIdsFilled: totalJobIdsFilled, error: error.message }
    }

    return { success: true, verified: toVerifyStatus.length + toFlagOnly.length, appended: totalAppended, jobIdsFilled: totalJobIdsFilled }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[MASTER_SHEET] historical backfill failed:', msg)
    return { success: false, error: msg }
  }
}

/**
 * Backfill already-verified jobs in an optional date range. Existing rows are
 * reconciled first, so this is safe to re-run and can also populate Job_ID on
 * exact legacy matches.
 */
export async function backfillMasterSheet(
  startDate?: string,
  endDate?: string,
  customerId?: string
): Promise<{ success: boolean; count?: number; jobIdsFilled?: number; error?: string }> {
  try {
    if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) || (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
      return { success: false, error: 'Date range must use YYYY-MM-DD' }
    }
    if (startDate && endDate && startDate > endDate) {
      return { success: false, error: 'Start date must not be after end date' }
    }

    const supabase = createAdminClient()
    const PAGE = 1000
    const jobs: MasterJob[] = []
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from('Jobs_Main')
        .select('*')
        .eq('Verification_Status', 'Verified')
        .order('Plan_Date', { ascending: true })
        .order('Job_ID', { ascending: true })
        .range(from, from + PAGE - 1)
      if (startDate) query = query.gte('Plan_Date', startDate)
      if (endDate) query = query.lte('Plan_Date', endDate)
      if (customerId && customerId !== 'All') query = query.eq('Customer_ID', customerId)
      
      const { data, error } = await query
      if (error) return { success: false, error: error.message }
      if (!data || data.length === 0) break
      jobs.push(...data)
      if (data.length < PAGE) break
    }

    if (jobs.length === 0) return { success: true, count: 0 }

    const sheets = getSheetsClient()
    
    // Fetch all existing tabs from Google Sheets to group properly
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties(title)' })
    const existingTabs = meta.data.sheets?.map(s => s.properties?.title || '') || []

    const jobsByTab = new Map<string, MasterJob[]>()
    for (const job of jobs) {
      const tabName = getJobTabName(job, existingTabs)
      if (!jobsByTab.has(tabName)) {
        jobsByTab.set(tabName, [])
      }
      jobsByTab.get(tabName)!.push(job)
    }

    const fuelCache = new Map<string, number | ''>()
    let totalAppended = 0
    let totalJobIdsFilled = 0

    for (const [tabName, tabJobs] of jobsByTab.entries()) {
      const { qtab, order, headerRow } = await resolveOrder(sheets, tabName)
      const ledger = await readLedgerState(sheets, qtab, order, headerRow)
      const jobIdsFilled = await fillLegacyJobIds(sheets, qtab, order, tabJobs, ledger)
      totalJobIdsFilled += jobIdsFilled

      const missingJobs = jobsMissingFromLedger(
        tabJobs,
        ledger.jobIds,
        ledger.legacyRowsByDate,
        ledger.legacyFingerprints
      )

      const rows: (string | number)[][] = []
      for (const job of missingJobs) {
        const dateKey = String(job.Plan_Date || '').slice(0, 10)
        let fuel = fuelCache.get(dateKey)
        if (fuel === undefined) {
          try { fuel = (await getFuelPriceNumber(dateKey || undefined)) ?? '' } catch { fuel = '' }
          fuelCache.set(dateKey, fuel)
        }
        rows.push(order.map(h => buildRowValues(job, fuel as number | '')[h] ?? ''))
      }

      for (let i = 0; i < rows.length; i += 500) {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${qtab}!A:BZ`,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: rows.slice(i, i + 500) },
        })
      }
      totalAppended += rows.length
    }

    return { success: true, count: totalAppended, jobIdsFilled: totalJobIdsFilled }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[MASTER_SHEET] backfill failed:', msg)
    return { success: false, error: msg }
  }
}
