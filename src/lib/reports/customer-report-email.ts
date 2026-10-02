// Customer report e-mail — table-based HTML with inline styles only, so it renders
// the same in Gmail / Outlook / mobile mail. Charts are drawn as table bars (no
// images, no JS, no third-party chart service) from the same CustomerReportData
// the web dashboard uses.

import type { CustomerReportData, JobLine } from './customer-metrics'
import { periodLabel, thaiShortDate } from './period'

const C = {
    ink: '#1f2937',
    muted: '#6b7280',
    line: '#e5e7eb',
    surface: '#f8fafc',
    brand: '#001E4C',
    blue: '#0047BB', // on-time / main series
    red: '#d03b3b',  // late (always paired with a text label)
    good: '#0a7d0a',
    bad: '#b42318',
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
const num = (n: number) => n.toLocaleString('en-US')
const fmtPct = (n: number | null) => (n === null ? '–' : `${n}%`)

/** ▲ 12% / ▼ 3.1 จุด — compared with the previous period */
function delta(curr: number | null, prev: number | null, mode: 'relative' | 'points', higherIsBetter = true): string {
    if (curr === null || prev === null) return ''
    let diff: number
    let unit: string
    if (mode === 'relative') {
        if (prev === 0) return ''
        diff = Math.round(((curr - prev) / prev) * 1000) / 10
        unit = '%'
    } else {
        diff = Math.round((curr - prev) * 10) / 10
        unit = ' จุด'
    }
    if (diff === 0) return `<span style="color:${C.muted}">เท่าเดิม</span>`
    const good = diff > 0 === higherIsBetter
    return `<span style="color:${good ? C.good : C.bad}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}${unit}</span>`
}

function kpi(label: string, value: string, sub: string): string {
    return `<td width="50%" style="padding:6px" valign="top">
      <div style="border:1px solid ${C.line};border-radius:10px;padding:14px 16px;background:#fff">
        <div style="font-size:13px;color:${C.muted}">${label}</div>
        <div style="font-size:26px;font-weight:700;color:${C.ink};line-height:1.3">${value}</div>
        <div style="font-size:12px;color:${C.muted}">${sub}</div>
      </div></td>`
}

function section(title: string, body: string): string {
    return `<tr><td style="padding:20px 24px 4px"><div style="font-size:16px;font-weight:700;color:${C.brand};margin-bottom:10px">${title}</div>${body}</td></tr>`
}

/** Horizontal bars: label | [on-time | late] | value. Width relative to the max row. */
function volumeBars(d: CustomerReportData): string {
    const max = Math.max(1, ...d.series.map(s => s.jobs))
    const rows = d.series.map(s => {
        const label = d.period.type === 'weekly' ? thaiShortDate(s.start) : `${s.label} (${thaiShortDate(s.start)}–${thaiShortDate(s.end)})`
        const unmeasured = Math.max(0, s.jobs - s.onTime - s.late)
        const w = (n: number) => Math.round((n / max) * 100)
        const seg = (n: number, color: string) => (n > 0 ? `<td width="${w(n)}%" style="background:${color};height:14px;font-size:0;line-height:0">&nbsp;</td>` : '')
        const rest = 100 - w(s.onTime + unmeasured) - w(s.late)
        return `<tr>
          <td style="font-size:12px;color:${C.ink};padding:4px 8px 4px 0;white-space:nowrap" width="1%">${esc(label)}</td>
          <td style="padding:4px 0"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
            ${seg(s.onTime + unmeasured, C.blue)}${seg(s.late, C.red)}${rest > 0 ? `<td width="${rest}%" style="font-size:0;line-height:0">&nbsp;</td>` : ''}
          </tr></table></td>
          <td style="font-size:12px;color:${C.ink};padding:4px 0 4px 8px;white-space:nowrap;text-align:right" width="1%">${s.jobs} งาน${s.late ? ` <span style="color:${C.red}">(ช้า ${s.late})</span>` : ''}</td>
        </tr>`
    }).join('')
    const legend = `<div style="font-size:12px;color:${C.muted};margin-top:6px">
      <span style="display:inline-block;width:10px;height:10px;background:${C.blue};vertical-align:middle"></span> ส่งตรงเวลา
      &nbsp;&nbsp;<span style="display:inline-block;width:10px;height:10px;background:${C.red};vertical-align:middle"></span> ส่งช้า</div>`
    return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>${legend}`
}

function jobTable(lines: JobLine[], limit = 10): string {
    const shown = lines.slice(0, limit)
    return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="font-size:12px;color:${C.ink};border-collapse:collapse">
      ${shown.map(l => `<tr>
        <td style="padding:6px 8px 6px 0;border-bottom:1px solid ${C.line};white-space:nowrap" valign="top">${thaiShortDate(l.date)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid ${C.line}" valign="top">${esc(l.destination)}<br><span style="color:${C.muted}">${esc(l.jobId)}</span></td>
        <td style="padding:6px 0 6px 8px;border-bottom:1px solid ${C.line};color:${C.muted}" valign="top">${esc(l.detail)}</td>
      </tr>`).join('')}
    </table>${lines.length > limit ? `<div style="font-size:12px;color:${C.muted};margin-top:6px">และอีก ${lines.length - limit} รายการ</div>` : ''}`
}

export function buildCustomerReportEmail(d: CustomerReportData, opts: { companyName: string; adminNote?: string | null }): { subject: string; html: string } {
    const label = periodLabel(d.period)
    const s = d.summary
    const p = d.previous
    const prevWord = d.period.type === 'weekly' ? 'สัปดาห์ก่อน' : 'เดือนก่อน'
    const subject = `รายงานสรุปงานขนส่ง ${label} — ${d.customerName}`

    const kpis = `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        ${kpi('งานขนส่งทั้งหมด', `${num(s.jobs)} <span style="font-size:14px;font-weight:400">งาน</span>`, `${delta(s.jobs, p.jobs, 'relative')} เทียบ${prevWord}${s.drops !== s.jobs ? ` · ${num(s.drops)} จุดส่ง` : ''}`)}
        ${kpi('ส่งตรงเวลา', fmtPct(s.onTimePct), `${delta(s.onTimePct, p.onTimePct, 'points')} · ${num(s.onTime)}/${num(s.onTimeMeasured)} งาน`)}
      </tr>
      <tr>
        ${kpi('หลักฐานการส่งครบ', fmtPct(s.podPct), `รูป/ลายเซ็น ${num(s.podComplete)}/${num(s.delivered)} งาน`)}
        ${kpi('ระยะทางรวม', `${num(s.distanceKm)} <span style="font-size:14px;font-weight:400">กม.</span>`, `${delta(s.distanceKm, p.distanceKm, 'relative')} เทียบ${prevWord}`)}
      </tr>
    </table>`

    const issues = [
        d.lateJobs.length ? `<div style="font-weight:600;margin:4px 0 6px">ส่งช้า ${d.lateJobs.length} งาน</div>${jobTable(d.lateJobs)}` : '',
        d.failedJobs.length ? `<div style="font-weight:600;margin:14px 0 6px">ส่งไม่สำเร็จ ${d.failedJobs.length} งาน</div>${jobTable(d.failedJobs)}` : '',
    ].join('')

    const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${C.surface};font-family:Tahoma,'Segoe UI',Arial,sans-serif;color:${C.ink}">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${C.surface}"><tr><td align="center" style="padding:24px 12px">
<table width="640" cellpadding="0" cellspacing="0" role="presentation" style="max-width:640px;width:100%;background:#fff;border:1px solid ${C.line};border-radius:12px;overflow:hidden">
  <tr><td style="background:${C.brand};padding:22px 24px;color:#fff">
    <div style="font-size:13px;opacity:.8">${esc(opts.companyName)}</div>
    <div style="font-size:20px;font-weight:700;margin-top:4px">รายงานสรุปงานขนส่ง</div>
    <div style="font-size:14px;margin-top:2px">${esc(d.customerName)} · ${esc(label)}</div>
  </td></tr>
  ${opts.adminNote ? `<tr><td style="padding:18px 24px 0"><div style="border-left:3px solid ${C.blue};background:${C.surface};padding:10px 14px;font-size:14px;white-space:pre-line">${esc(opts.adminNote)}</div></td></tr>` : ''}
  <tr><td style="padding:14px 18px 0">${kpis}</td></tr>
  ${s.jobs > 0 ? section(d.period.type === 'weekly' ? 'ปริมาณงานรายวัน' : 'ปริมาณงานรายสัปดาห์', volumeBars(d)) : ''}
  ${issues ? section('งานที่ต้องติดตาม', issues) : section('งานที่ต้องติดตาม', `<div style="font-size:14px;color:${C.good}">✓ ไม่มีงานส่งช้าหรือส่งไม่สำเร็จในช่วงนี้</div>`)}
  ${d.carbon ? section('การปล่อยคาร์บอน (ESG)', `<div style="font-size:14px"><b>${num(d.carbon.co2Kg)} kgCO₂e</b> · เฉลี่ย ${d.carbon.kgPerJob} kg/งาน</div><div style="font-size:12px;color:${C.muted};margin-top:4px">คำนวณตาม GLEC Framework / ISO 14083 จาก ${num(d.carbon.jobsCounted)} งานที่มีระยะทาง · เทียบเท่าการดูดซับของต้นไม้ ${num(Math.round(d.carbon.trees))} ต้น/ปี</div>`) : ''}
  <tr><td style="padding:22px 24px 22px;font-size:11px;color:${C.muted};text-align:center;line-height:1.6">
    ส่งตรงเวลา = ส่งถึงภายในวันส่งที่กำหนด หรือก่อน 08:00 น. ของวันถัดไปสำหรับรอบกลางคืน (วัดจากเวลาในหลักฐานการส่ง) · ตัวเลขตามข้อมูล ณ วันที่สร้างรายงาน<br>
    อีเมลนี้ส่งจากระบบ DRouteMind ของ ${esc(opts.companyName)} หากต้องการเปลี่ยนผู้รับ กรุณาตอบกลับอีเมลนี้
  </td></tr>
</table></td></tr></table></body></html>`

    return { subject, html }
}
