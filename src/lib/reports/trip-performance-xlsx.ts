// Trip Performance → Excel for executives (3 sheets):
//   1. สรุปผู้บริหาร   — KPIs, cost structure, key findings, by customer / by truck,
//                        fuel-bill reconciliation, document checks, method notes
//   2. รายละเอียดรายเที่ยว — one row per trip + totals
//   3. ตรวจสอบ (ภายใน)  — how each trip's fuel was matched + review flags
// Standalone (no app imports) so scripts can build the same file.
import ExcelJS from 'exceljs'

export type XlsxTrip = {
  Job_ID: string
  Plan_Date: string | null
  Customer_Name: string | null
  Vehicle_Plate: string | null
  Driver_Name: string | null
  Origin_Location: string | null
  drops: string[]
  drop_count: number
  distance_km: number
  est_km: number
  real_km_source: 'odometer' | 'job'
  Cost_Customer_Total: number
  Cost_Driver_Total: number
  extra_cost: number
  extra_items: { type: string; amount: number }[]
  fuel_real: number
  fuel_liters: number
  fuel_source: 'bill' | 'estimate' | 'subcontract'
  fuel_match: { confidence: string; ratio: number; groupJobs: number; fills: string[]; open: boolean } | null
  maint_real: number
  total_cost: number
  profit: number
  profit_pct: number
}

export type XlsxSummary = {
  fuelBills: { cost: number; count: number; liters: number; allocatedToTrips: number; trailingCost: number; beforePeriodCost: number; beforePeriodCount: number; noJobCost: number; noJobKm: number; noJobCount: number; noJobDates: string[] }
  fuelFlags: { at: string; plate: string; kind: string; message: string; jobIds: string[] }[]
  documentChecks?: { kind: 'invoice' | 'driver_payment'; docId: string; status: string; docAmount: number; currentAmount: number; detail: string }[]
}

export type XlsxMeta = {
  start: string
  end: string
  branchLabel: string
  scopeLabel: string
  generatedAt: Date
  generatedBy?: string
}

const FONT = 'Tahoma'
const NAVY = 'FF1E3A5F'
const LIGHT = 'FFF1F5F9'
const BORDER = 'FFD7DEE7'
const RED = 'FFC0392B'
const GREEN = 'FF1E8449'
const AMBER = 'FFB9770E'
const BAHT = '#,##0;[Red]-#,##0'
const BAHT2 = '#,##0.00;[Red]-#,##0.00'
const PCT = '0.0%;[Red]-0.0%'

const thDate = (d: string | null | Date, withTime = false) => {
  if (!d) return '-'
  const dt = typeof d === 'string' ? new Date(`${d.slice(0, 10)}T00:00:00`) : d
  return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) })
}
const CONF_TH: Record<string, string> = { confirmed: 'ยืนยันแล้ว (แอดมินผูก)', high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ' }
const FLAG_TH: Record<string, string> = { end_mid_trip: 'ป้าย "จบงาน" น่าสงสัย', no_job: 'รถวิ่งแต่ไม่มีงาน', km_mismatch: 'ไมล์ไม่ตรงระยะงาน', no_odometer: 'บิลไม่มีเลขไมล์', link_conflict: 'การผูกงานขัดกัน' }

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell(c => {
    c.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    c.border = { top: { style: 'thin', color: { argb: NAVY } }, bottom: { style: 'thin', color: { argb: NAVY } }, left: { style: 'thin', color: { argb: NAVY } }, right: { style: 'thin', color: { argb: NAVY } } }
  })
  row.height = 30
}
function styleBodyRow(row: ExcelJS.Row, zebra = false) {
  row.eachCell({ includeEmpty: true }, c => {
    c.font = { name: FONT, size: 10, ...(c.font || {}) }
    c.border = { top: { style: 'thin', color: { argb: BORDER } }, bottom: { style: 'thin', color: { argb: BORDER } }, left: { style: 'thin', color: { argb: BORDER } }, right: { style: 'thin', color: { argb: BORDER } } }
    c.alignment = { vertical: 'top', wrapText: true, ...(c.alignment || {}) }
    if (zebra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFC' } }
  })
}
function styleTotalRow(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, c => {
    c.font = { name: FONT, size: 10, bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
    c.border = { top: { style: 'medium', color: { argb: NAVY } }, bottom: { style: 'medium', color: { argb: NAVY } } }
  })
}
function sectionTitle(ws: ExcelJS.Worksheet, text: string, cols: number) {
  ws.addRow([])
  const r = ws.addRow([text])
  ws.mergeCells(r.number, 1, r.number, cols)
  r.getCell(1).font = { name: FONT, size: 12, bold: true, color: { argb: NAVY } }
  r.getCell(1).border = { bottom: { style: 'medium', color: { argb: NAVY } } }
  r.height = 22
  return r
}

export async function buildTripPerformanceWorkbook(trips: XlsxTrip[], summary: XlsxSummary, meta: XlsxMeta): Promise<Buffer> {
  const rows = [...trips].sort((a, b) => (a.Plan_Date || '').localeCompare(b.Plan_Date || '') || a.Job_ID.localeCompare(b.Job_ID))
  const sum = (f: (t: XlsxTrip) => number) => rows.reduce((s, t) => s + (f(t) || 0), 0)
  const revenue = sum(t => t.Cost_Customer_Total)
  const driver = sum(t => t.Cost_Driver_Total + t.extra_cost)
  const fuel = sum(t => t.fuel_real)
  const wear = sum(t => t.maint_real)
  const cost = driver + fuel + wear
  const profit = revenue - cost
  const realKm = sum(t => t.distance_km)
  const jobKm = sum(t => t.est_km)
  const liters = sum(t => t.fuel_liters)
  const drops = sum(t => t.drop_count)
  const lossTrips = rows.filter(t => t.profit < 0)
  const estimated = rows.filter(t => t.fuel_source === 'estimate')
  const confirmed = rows.filter(t => t.fuel_match?.confidence === 'confirmed').length
  const perKm = (v: number) => (realKm > 0 ? v / realKm : 0)
  const pct = (v: number) => (revenue > 0 ? v / revenue : 0)

  const wb = new ExcelJS.Workbook()
  wb.creator = meta.generatedBy || 'TMS'
  wb.created = meta.generatedAt

  // ───────────────────────── 1. สรุปผู้บริหาร ─────────────────────────
  const ws = wb.addWorksheet('สรุปผู้บริหาร', { views: [{ showGridLines: false }], pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } } })
  ws.columns = [{ width: 34 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }]
  const t1 = ws.addRow(['รายงานผลประกอบการรายเที่ยว (Trip Performance)'])
  ws.mergeCells(t1.number, 1, t1.number, 6)
  t1.getCell(1).font = { name: FONT, size: 16, bold: true, color: { argb: NAVY } }
  t1.height = 28
  const info: [string, string][] = [
    ['ช่วงวันที่วิ่งงาน', `${thDate(meta.start)} – ${thDate(meta.end)}`],
    ['สาขา', meta.branchLabel],
    ['ขอบเขต', meta.scopeLabel],
    ['ออกรายงานเมื่อ', `${thDate(meta.generatedAt, true)}${meta.generatedBy ? ` โดย ${meta.generatedBy}` : ''}`],
  ]
  for (const [k, v] of info) {
    const r = ws.addRow([k, v])
    ws.mergeCells(r.number, 2, r.number, 6)
    r.getCell(1).font = { name: FONT, size: 10, color: { argb: 'FF5B6B7F' } }
    r.getCell(2).font = { name: FONT, size: 10, bold: true }
  }

  // KPI table
  sectionTitle(ws, 'ภาพรวมผลประกอบการ', 6)
  styleHeaderRow(ws.addRow(['รายการ', 'ยอด (บาท)', '% ของรายได้', '฿ / กม.ไมล์จริง', '', '']))
  ws.mergeCells(ws.lastRow!.number, 4, ws.lastRow!.number, 6)
  const kpi: [string, number, boolean][] = [
    ['รายได้', revenue, false],
    ['ค่าคนขับ (ค่าเที่ยว + ค่าใช้จ่ายอื่น)', driver, true],
    ['ค่าน้ำมัน (บิลจริง)', fuel, true],
    ['ค่าสึกหรอ (ซ่อม + ยาง ต่อ กม.)', wear, true],
    ['ต้นทุนรวม', cost, true],
  ]
  kpi.forEach(([label, v], i) => {
    const r = ws.addRow([label, v, pct(v), perKm(v)])
    ws.mergeCells(r.number, 4, r.number, 6)
    r.getCell(2).numFmt = BAHT; r.getCell(3).numFmt = PCT; r.getCell(4).numFmt = BAHT2
    styleBodyRow(r, i % 2 === 1)
  })
  const pr = ws.addRow(['กำไร / (ขาดทุน)', profit, pct(profit), perKm(profit)])
  ws.mergeCells(pr.number, 4, pr.number, 6)
  pr.getCell(2).numFmt = BAHT; pr.getCell(3).numFmt = PCT; pr.getCell(4).numFmt = BAHT2
  styleTotalRow(pr)
  pr.getCell(2).font = { name: FONT, size: 11, bold: true, color: { argb: profit < 0 ? RED : GREEN } }

  // Operations
  sectionTitle(ws, 'ข้อมูลการวิ่งงาน', 6)
  const ops: [string, string | number, string?][] = [
    ['จำนวนเที่ยว', rows.length, `ขาดทุน ${lossTrips.length} เที่ยว · กำไร ${rows.length - lossTrips.length} เที่ยว`],
    ['จำนวนจุดส่ง (ดรอป)', drops, rows.length ? `เฉลี่ย ${(drops / rows.length).toFixed(1)} ดรอป/เที่ยว` : ''],
    ['ระยะทางไมล์จริง (กม.)', Math.round(realKm), `ระยะตามงาน (เที่ยวเดียว) ${Math.round(jobKm).toLocaleString()} กม. · ไมล์จริง ${jobKm > 0 ? (realKm / jobKm).toFixed(2) : '-'} เท่า`],
    ['น้ำมันที่ใช้ (ลิตร)', Math.round(liters), liters > 0 ? `อัตราสิ้นเปลือง ${(realKm / liters).toFixed(2)} กม./ลิตร · ราคาเฉลี่ย ${(fuel / liters).toFixed(2)} ฿/ลิตร` : ''],
    ['รายได้เฉลี่ยต่อเที่ยว (บาท)', rows.length ? Math.round(revenue / rows.length) : 0, ''],
    ['การจับคู่บิลน้ำมัน', `${confirmed}/${rows.length} เที่ยวยืนยันแล้ว`, estimated.length ? `ใช้ค่าประมาณ ${estimated.length} เที่ยว (ยังไม่มีบิลจบงาน)` : 'ทุกเที่ยวใช้บิลจริง'],
  ]
  ops.forEach(([k, v, note], i) => {
    const r = ws.addRow([k, v, note || ''])
    ws.mergeCells(r.number, 3, r.number, 6)
    if (typeof v === 'number') r.getCell(2).numFmt = '#,##0'
    styleBodyRow(r, i % 2 === 1)
    r.getCell(3).font = { name: FONT, size: 9, color: { argb: 'FF5B6B7F' } }
  })

  // Key findings (generated from the numbers)
  sectionTitle(ws, 'ข้อสรุปสำคัญ', 6)
  const findings: string[] = []
  findings.push(profit < 0
    ? `ช่วงนี้ขาดทุน ${Math.abs(Math.round(profit)).toLocaleString()} บาท (${(pct(profit) * 100).toFixed(1)}% ของรายได้) — ขาดทุน ${lossTrips.length} จาก ${rows.length} เที่ยว`
    : `ช่วงนี้กำไร ${Math.round(profit).toLocaleString()} บาท (${(pct(profit) * 100).toFixed(1)}% ของรายได้) — ขาดทุน ${lossTrips.length} จาก ${rows.length} เที่ยว`)
  findings.push(`ค่าน้ำมันเป็นต้นทุนหลัก ${(pct(fuel) * 100).toFixed(1)}% ของรายได้ (${perKm(fuel).toFixed(2)} ฿/กม.) เทียบรายได้ ${perKm(revenue).toFixed(2)} ฿/กม. และต้นทุนรวม ${perKm(cost).toFixed(2)} ฿/กม.`)
  if (jobKm > 0 && realKm / jobKm > 1.5) {
    findings.push(`รถวิ่งจริง ${Math.round(realKm).toLocaleString()} กม. = ${(realKm / jobKm).toFixed(2)} เท่าของระยะงาน (ระยะงานเป็นเที่ยวเดียว รถต้องวิ่งเปล่ากลับฐาน) — หากราคาลูกค้าคิดจากระยะเที่ยวเดียว ควรทบทวนอัตราค่าขนส่ง`)
  }
  if (revenue > 0 && perKm(cost) > perKm(revenue)) {
    findings.push(`ต้นทุนต่อ กม. (${perKm(cost).toFixed(2)} ฿) สูงกว่ารายได้ต่อ กม. (${perKm(revenue).toFixed(2)} ฿) — ต้องปรับราคาหรือลดต้นทุน กม.เปล่า จึงจะมีกำไร`)
  }
  const best = [...rows].sort((a, b) => b.profit - a.profit)[0]
  const worst = [...rows].sort((a, b) => a.profit - b.profit)[0]
  if (best && worst && rows.length > 1) {
    findings.push(`เที่ยวกำไรสูงสุด: ${thDate(best.Plan_Date)} ${best.Job_ID} (${Math.round(best.profit).toLocaleString()} บาท) · ขาดทุนมากสุด: ${thDate(worst.Plan_Date)} ${worst.Job_ID} (${Math.round(worst.profit).toLocaleString()} บาท)`)
  }
  findings.forEach((f, i) => {
    const r = ws.addRow([`${i + 1}. ${f}`])
    ws.mergeCells(r.number, 1, r.number, 6)
    r.getCell(1).font = { name: FONT, size: 10 }
    r.getCell(1).alignment = { wrapText: true, vertical: 'top' }
    r.height = Math.max(18, Math.ceil(f.length / 95) * 16)
  })

  // By customer / by truck
  const group = (key: (t: XlsxTrip) => string) => {
    const m = new Map<string, { n: number; km: number; rev: number; drv: number; fuel: number; wear: number }>()
    for (const t of rows) {
      const k = key(t) || '-'
      const g = m.get(k) || { n: 0, km: 0, rev: 0, drv: 0, fuel: 0, wear: 0 }
      g.n++; g.km += t.distance_km; g.rev += t.Cost_Customer_Total; g.drv += t.Cost_Driver_Total + t.extra_cost; g.fuel += t.fuel_real; g.wear += t.maint_real
      m.set(k, g)
    }
    return [...m.entries()].sort((a, b) => b[1].rev - a[1].rev)
  }
  const groupTable = (title: string, label: string, entries: ReturnType<typeof group>) => {
    sectionTitle(ws, title, 6)
    styleHeaderRow(ws.addRow([label, 'เที่ยว / กม.', 'รายได้', 'ต้นทุนรวม', 'กำไร', 'Margin']))
    entries.forEach(([k, g], i) => {
      const c = g.drv + g.fuel + g.wear
      const r = ws.addRow([k, `${g.n} / ${Math.round(g.km).toLocaleString()}`, g.rev, c, g.rev - c, g.rev > 0 ? (g.rev - c) / g.rev : 0])
      r.getCell(3).numFmt = BAHT; r.getCell(4).numFmt = BAHT; r.getCell(5).numFmt = BAHT; r.getCell(6).numFmt = PCT
      styleBodyRow(r, i % 2 === 1)
    })
  }
  groupTable('สรุปตามลูกค้า', 'ลูกค้า', group(t => t.Customer_Name || '-'))
  groupTable('สรุปตามรถ', 'ทะเบียนรถ / คนขับ', group(t => `${t.Vehicle_Plate || '-'}${t.Driver_Name ? ` (${t.Driver_Name})` : ''}`))

  // Fuel reconciliation
  const fb = summary.fuelBills
  sectionTitle(ws, 'กระทบยอดบิลน้ำมัน', 6)
  styleHeaderRow(ws.addRow(['รายการ', 'บาท', 'บิล', 'หมายเหตุ', '', '']))
  ws.mergeCells(ws.lastRow!.number, 4, ws.lastRow!.number, 6)
  const recon: [string, number, number | string, string][] = [
    ['บิลน้ำมันที่ลงวันที่ในช่วงนี้', fb.cost, fb.count, `${Math.round(fb.liters).toLocaleString()} ลิตร`],
    ['− บิลของงานก่อนช่วงนี้ (ผูกแล้ว)', -fb.beforePeriodCost, fb.beforePeriodCount, 'นับในช่วงของงานนั้น'],
    ['+ บิลหลังวันสิ้นสุดที่ปิดงานในช่วงนี้', fb.trailingCost, '', 'เติมจบงานหลังวันสิ้นสุด (ตามที่ผูก)'],
    ['− รถวิ่งแต่ไม่มีงานในระบบ', -fb.noJobCost, fb.noJobCount || '', fb.noJobCost > 0 ? `${Math.round(fb.noJobKm).toLocaleString()} กม. — ตรวจว่าลืมเปิดงาน` : 'ไม่มี'],
  ]
  recon.forEach(([k, v, n, note], i) => {
    const r = ws.addRow([k, v, n, note])
    ws.mergeCells(r.number, 4, r.number, 6)
    r.getCell(2).numFmt = BAHT2
    styleBodyRow(r, i % 2 === 1)
  })
  const rr = ws.addRow(['= ค่าน้ำมันที่ลงเที่ยวในรายงานนี้', fb.allocatedToTrips, '', ''])
  ws.mergeCells(rr.number, 4, rr.number, 6)
  rr.getCell(2).numFmt = BAHT2
  styleTotalRow(rr)

  // Document checks
  const docs = summary.documentChecks || []
  sectionTitle(ws, 'ตรวจสอบกับเอกสาร (ใบแจ้งหนี้ / ใบทำจ่ายคนขับ)', 6)
  if (!docs.length) {
    const r = ws.addRow(['ยอดในงานตรงกับใบแจ้งหนี้และใบทำจ่ายคนขับที่ออกแล้ว'])
    ws.mergeCells(r.number, 1, r.number, 6)
    r.getCell(1).font = { name: FONT, size: 10, color: { argb: GREEN } }
  } else {
    styleHeaderRow(ws.addRow(['เอกสาร', 'ยอดในเอกสาร', 'ยอดในงานตอนนี้', 'ต่างกัน', 'รายละเอียด', '']))
    ws.mergeCells(ws.lastRow!.number, 5, ws.lastRow!.number, 6)
    docs.forEach((d, i) => {
      const r = ws.addRow([`${d.kind === 'invoice' ? 'ใบแจ้งหนี้' : 'ใบทำจ่ายคนขับ'} ${d.docId} (${d.status})`, d.docAmount, d.currentAmount, d.currentAmount - d.docAmount, d.detail])
      ws.mergeCells(r.number, 5, r.number, 6)
      r.getCell(2).numFmt = BAHT; r.getCell(3).numFmt = BAHT; r.getCell(4).numFmt = BAHT
      styleBodyRow(r, i % 2 === 1)
      r.getCell(4).font = { name: FONT, size: 10, bold: true, color: { argb: AMBER } }
    })
  }

  // Method notes
  sectionTitle(ws, 'วิธีคิด', 6)
  const notes = [
    'รายได้ = ค่าขนส่ง + ค่าบริการเสริมที่เก็บลูกค้า (ตามงานในระบบ)',
    'ค่าคนขับ = ค่าเที่ยว + ค่าใช้จ่ายอื่นฝั่งคนขับ (เด็กรถ/ขึ้นชั้น/ทางด่วน/ประหยัดน้ำมัน) — ยอดก่อนหัก ณ ที่จ่าย',
    'ค่าน้ำมัน = บิลเติมน้ำมันจริงที่ผูกกับงาน: "เติมจบงาน" ตัดน้ำมันของงานล่าสุด (รวมเติมระหว่างทาง) — รวมขาวิ่งเปล่ากลับฐาน; รถร่วมไม่มีค่าน้ำมัน',
    'ระยะทาง = ไมล์จริงจากบิลชนบิล (เลขไมล์บิลนี้ − บิลก่อนหน้า) ของบิลที่ผูกกับงาน',
    'ค่าสึกหรอ = ระยะตามงาน × อัตรา ฿/กม. ของรถคันนั้น (ค่าซ่อมที่ปิดงาน + ค่ายาง ย้อนหลัง 12 เดือน)',
  ]
  notes.forEach(n => {
    const r = ws.addRow([`• ${n}`])
    ws.mergeCells(r.number, 1, r.number, 6)
    r.getCell(1).font = { name: FONT, size: 9, color: { argb: 'FF5B6B7F' } }
    r.getCell(1).alignment = { wrapText: true, vertical: 'top' }
    r.height = Math.max(16, Math.ceil(n.length / 100) * 14)
  })

  // ───────────────────────── 2. รายละเอียดรายเที่ยว ─────────────────────────
  const wd = wb.addWorksheet('รายละเอียดรายเที่ยว', { views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  const cols: { h: string; w: number; fmt?: string }[] = [
    { h: 'ลำดับ', w: 6 }, { h: 'วันที่', w: 12 }, { h: 'Job ID', w: 22 }, { h: 'ลูกค้า', w: 26 }, { h: 'ทะเบียนรถ', w: 11 }, { h: 'คนขับ', w: 18 },
    { h: 'ดรอป', w: 6 }, { h: 'จุดส่ง', w: 46 }, { h: 'ไมล์จริง (กม.)', w: 10, fmt: '#,##0' }, { h: 'รายได้', w: 11, fmt: BAHT },
    { h: 'ค่าเที่ยว', w: 10, fmt: BAHT }, { h: 'ค่าใช้จ่ายอื่นคนขับ', w: 11, fmt: BAHT }, { h: 'รายละเอียดค่าใช้จ่ายอื่น', w: 26 }, { h: 'ค่าคนขับรวม', w: 11, fmt: BAHT },
    { h: 'น้ำมัน (ลิตร)', w: 10, fmt: '#,##0.0' }, { h: 'ค่าน้ำมัน', w: 11, fmt: BAHT }, { h: 'กม./ลิตร', w: 8, fmt: '0.00' }, { h: 'ค่าสึกหรอ', w: 9, fmt: BAHT },
    { h: 'ต้นทุนรวม', w: 11, fmt: BAHT }, { h: 'กำไร', w: 11, fmt: BAHT }, { h: 'Margin', w: 8, fmt: PCT }, { h: 'รายได้/กม.', w: 9, fmt: '0.00' }, { h: 'ต้นทุน/กม.', w: 9, fmt: '0.00' },
  ]
  wd.columns = cols.map(c => ({ width: c.w }))
  styleHeaderRow(wd.addRow(cols.map(c => c.h)))
  rows.forEach((t, i) => {
    const km = t.distance_km || 0
    const r = wd.addRow([
      i + 1, thDate(t.Plan_Date), t.Job_ID, t.Customer_Name || '-', t.Vehicle_Plate || '-', t.Driver_Name || '-',
      t.drop_count, t.drops.join(' → ') || '-', km, t.Cost_Customer_Total,
      t.Cost_Driver_Total, t.extra_cost, t.extra_items.map(e => `${e.type} ${e.amount.toLocaleString()}`).join(', ') || '-', t.Cost_Driver_Total + t.extra_cost,
      t.fuel_liters, t.fuel_real, t.fuel_liters > 0 && km > 0 ? km / t.fuel_liters : null, t.maint_real,
      t.total_cost, t.profit, t.Cost_Customer_Total > 0 ? t.profit / t.Cost_Customer_Total : 0, km > 0 ? t.Cost_Customer_Total / km : null, km > 0 ? t.total_cost / km : null,
    ])
    cols.forEach((c, ci) => { if (c.fmt) r.getCell(ci + 1).numFmt = c.fmt })
    styleBodyRow(r, i % 2 === 1)
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'top' }
    r.getCell(7).alignment = { horizontal: 'center', vertical: 'top' }
    if (t.profit < 0) { r.getCell(20).font = { name: FONT, size: 10, bold: true, color: { argb: RED } } }
    else r.getCell(20).font = { name: FONT, size: 10, bold: true, color: { argb: GREEN } }
    if (t.fuel_source === 'estimate') r.getCell(16).note = 'ค่าประมาณ — ยังไม่มีบิลเติมจบงาน'
  })
  const first = 2, last = rows.length + 1
  const totalRow = wd.addRow([
    '', 'รวม', `${rows.length} เที่ยว`, '', '', '', drops, '', { formula: `SUM(I${first}:I${last})` }, { formula: `SUM(J${first}:J${last})` },
    { formula: `SUM(K${first}:K${last})` }, { formula: `SUM(L${first}:L${last})` }, '', { formula: `SUM(N${first}:N${last})` },
    { formula: `SUM(O${first}:O${last})` }, { formula: `SUM(P${first}:P${last})` }, { formula: `IF(O${last + 1}>0,I${last + 1}/O${last + 1},0)` }, { formula: `SUM(R${first}:R${last})` },
    { formula: `SUM(S${first}:S${last})` }, { formula: `SUM(T${first}:T${last})` }, { formula: `IF(J${last + 1}>0,T${last + 1}/J${last + 1},0)` },
    { formula: `IF(I${last + 1}>0,J${last + 1}/I${last + 1},0)` }, { formula: `IF(I${last + 1}>0,S${last + 1}/I${last + 1},0)` },
  ])
  cols.forEach((c, ci) => { if (c.fmt) totalRow.getCell(ci + 1).numFmt = c.fmt })
  styleTotalRow(totalRow)
  wd.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: cols.length } }

  // ───────────────────────── 3. ตรวจสอบ (ภายใน) ─────────────────────────
  const wa = wb.addWorksheet('ตรวจสอบ (ภายใน)', { views: [{ state: 'frozen', ySplit: 1 }] })
  wa.columns = [{ width: 12 }, { width: 22 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 22 }, { width: 10 }, { width: 50 }]
  styleHeaderRow(wa.addRow(['วันที่', 'Job ID', 'ระยะตามงาน (เที่ยวเดียว)', 'ไมล์จริง', 'ไมล์จริง / ระยะงานไป-กลับ', 'ที่มาค่าน้ำมัน', 'ความมั่นใจการจับคู่บิล', 'งานในรอบเดียวกัน', 'บิลที่จับคู่']))
  rows.forEach((t, i) => {
    const r = wa.addRow([
      thDate(t.Plan_Date), t.Job_ID, t.est_km, t.distance_km, t.fuel_match?.ratio || null,
      t.fuel_source === 'bill' ? 'บิลจริง' : t.fuel_source === 'subcontract' ? 'รถร่วม' : 'ประมาณ',
      t.fuel_match ? CONF_TH[t.fuel_match.confidence] || t.fuel_match.confidence : '-', t.fuel_match?.groupJobs || '-', t.fuel_match?.fills.join(', ') || '-',
    ])
    r.getCell(3).numFmt = '#,##0.0'; r.getCell(4).numFmt = '#,##0'; r.getCell(5).numFmt = '0%'
    styleBodyRow(r, i % 2 === 1)
  })
  if (summary.fuelFlags.length) {
    wa.addRow([])
    const h = wa.addRow(['ธงที่ควรตรวจ'])
    h.getCell(1).font = { name: FONT, size: 11, bold: true, color: { argb: NAVY } }
    styleHeaderRow(wa.addRow(['เวลา', 'ทะเบียน', 'ประเภท', '', '', '', '', '', 'รายละเอียด']))
    summary.fuelFlags.forEach((f, i) => {
      const r = wa.addRow([f.at.replace('T', ' '), f.plate, FLAG_TH[f.kind] || f.kind, '', '', '', '', '', `${f.message}${f.jobIds.length ? ` (${f.jobIds.join(', ')})` : ''}`])
      wa.mergeCells(r.number, 3, r.number, 8)
      styleBodyRow(r, i % 2 === 1)
    })
  }

  return Buffer.from(await wb.xlsx.writeBuffer())
}
