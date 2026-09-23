"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isAdmin } from "@/lib/permissions"

export interface AdminAlert {
  id: string
  type: 'expiry' | 'inspection_fail' | 'maintenance' | 'location_incomplete'
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  date: string
  meta?: Record<string, string>
  href?: string
}

export async function getAdminAlerts(): Promise<AdminAlert[]> {
  const isAdminUser = await isAdmin()
  const supabase = isAdminUser ? createAdminClient() : await createClient()
  const branchId = await getUserBranchId()
  const alerts: AdminAlert[] = []
  const today = new Date()

  // 1. Vehicle document expiry alerts (tax, insurance, ACT)
  try {
    let vQuery = supabase
      .from('Master_Vehicles')
      .select('Vehicle_Plate, Tax_Expiry, Insurance_Expiry, Act_Expiry, Cargo_Insurance_Expiry, Active_Status, Current_Mileage, Next_Service_Mileage, Tire_Next_Change_Mileage')
      .eq('Active_Status', 'Active')

    if (branchId && branchId !== 'All') {
      vQuery = vQuery.eq('Branch_ID', branchId)
    }

    const { data: vehicles } = await vQuery
    vehicles?.forEach((v: Record<string, unknown>) => {
      const plate = String(v.Vehicle_Plate || '')
      const checks = [
        { field: v.Tax_Expiry as string, label: 'ภาษีรถ (Tax)', type: 'tax' },
        { field: v.Insurance_Expiry as string, label: 'ประกันภัย (Insurance)', type: 'insurance' },
        { field: v.Act_Expiry as string, label: 'พ.ร.บ. (ACT)', type: 'act' },
        { field: v.Cargo_Insurance_Expiry as string, label: 'ประกันสินค้า (Cargo)', type: 'cargo' },
      ]
      checks.forEach(c => {
        if (!c.field) return
        const expDate = new Date(c.field)
        if (isNaN(expDate.getTime())) return
        const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        if (diffDays <= 30) {
          alerts.push({
            id: `${plate}-${c.type}`,
            type: 'expiry',
            severity: diffDays <= 0 ? 'critical' : diffDays <= 15 ? 'warning' : 'info',
            title: `${c.label} — ${plate}`,
            description: diffDays <= 0
              ? `หมดอายุแล้ว ${Math.abs(diffDays)} วัน`
              : `เหลืออีก ${diffDays} วัน (หมดอายุ ${expDate.toLocaleDateString('th-TH')})`,
            date: c.field || '',
            href: `/vehicles?search=${encodeURIComponent(plate)}`,
            meta: { plate, expiryType: c.type }
          })
        }
      })

      // เช็คระยะ / เปลี่ยนยาง — ตามเลขไมล์
      const cur = Number(v.Current_Mileage) || 0
      if (cur > 0) {
        const mChecks = [
          { target: Number(v.Next_Service_Mileage) || 0, label: 'เช็คระยะ', type: 'service' },
          { target: Number(v.Tire_Next_Change_Mileage) || 0, label: 'เปลี่ยนยาง', type: 'tire' },
        ]
        mChecks.forEach(m => {
          if (m.target > 0 && cur >= m.target - 1000) {
            const over = cur >= m.target
            const diff = Math.abs(m.target - cur).toLocaleString()
            alerts.push({
              id: `${plate}-${m.type}`,
              type: 'expiry',
              severity: over ? 'critical' : 'warning',
              title: `${m.label} — ${plate}`,
              description: over ? `เกินกำหนด ${diff} กม. (ไมล์ ${cur.toLocaleString()}/${m.target.toLocaleString()})` : `อีก ${diff} กม. (ไมล์ ${cur.toLocaleString()}/${m.target.toLocaleString()})`,
              date: '',
              href: `/vehicles?search=${encodeURIComponent(plate)}`,
              meta: { plate, expiryType: m.type }
            })
          }
        })
      }
    })
  } catch { /* ignore */ }

  // 1.5 ใบขับขี่คนขับใกล้หมด/หมดอายุ
  try {
    let dQuery = supabase.from('Master_Drivers')
      .select('Driver_ID, Driver_Name, Expire_Date, Active_Status, Branch_ID')
      .eq('Active_Status', 'Active')
    if (branchId && branchId !== 'All') dQuery = dQuery.eq('Branch_ID', branchId)
    const { data: drivers } = await dQuery
    drivers?.forEach((d: { Driver_ID: string, Driver_Name: string, Expire_Date: string }) => {
      if (!d.Expire_Date) return
      const expDate = new Date(d.Expire_Date)
      if (isNaN(expDate.getTime())) return
      const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays <= 30) {
        const queryTerm = (d.Driver_Name || d.Driver_ID || '').trim()
        alerts.push({
          id: `lic-${d.Driver_ID}`,
          type: 'expiry',
          severity: diffDays <= 0 ? 'critical' : diffDays <= 15 ? 'warning' : 'info',
          title: `ใบขับขี่ — ${d.Driver_Name || d.Driver_ID}`,
          description: diffDays <= 0 ? `หมดอายุแล้ว ${Math.abs(diffDays)} วัน` : `เหลืออีก ${diffDays} วัน (หมดอายุ ${expDate.toLocaleDateString('th-TH')})`,
          date: d.Expire_Date,
          href: `/drivers?query=${encodeURIComponent(queryTerm)}&driverId=${encodeURIComponent(d.Driver_ID)}`,
          meta: { driver: d.Driver_Name, driverId: d.Driver_ID }
        })
      }
    })
  } catch { /* ignore */ }

  // 2. Recent failed vehicle inspections (last 7 days)
  try {
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: checks } = await supabase
      .from('Vehicle_Checks')
      .select('id, Vehicle_Plate, Driver_Name, Check_Date, Passed_Items')
      .gte('Check_Date', weekAgo)
      .order('Check_Date', { ascending: false })
      .limit(50)

    const CHECKLIST = ["น้ำมันเครื่อง", "น้ำในหม้อน้ำ", "ลมยาง", "ไฟเบรค/ไฟเลี้ยว", "สภาพยางรถยนต์", "อุปกรณ์ฉุกเฉิน", "เอกสารประจำรถ"]

    checks?.forEach((check: { id: string, Passed_Items?: Record<string, boolean>, Vehicle_Plate: string, Check_Date: string, Driver_Name: string }) => {
      const items = (check.Passed_Items || {}) as Record<string, boolean>
      const failedItems = CHECKLIST.filter(item => !items[item])
      if (failedItems.length > 0) {
        alerts.push({
          id: `check-${check.id}`,
          type: 'inspection_fail',
          severity: failedItems.length >= 3 ? 'critical' : 'warning',
          title: `ตรวจรถไม่ผ่าน — ${check.Vehicle_Plate}`,
          description: `ไม่ผ่าน ${failedItems.length} รายการ: ${failedItems.join(', ')}`,
          date: check.Check_Date || '',
          href: `/admin/vehicle-checks?id=${check.id}`,
          meta: { 
            plate: check.Vehicle_Plate || '', 
            driver: check.Driver_Name || '-',
            failCount: String(failedItems.length) 
          }
        })
      }
    })
  } catch { /* ignore */ }

  // 3. Pending maintenance (open repair tickets)
  try {
    const mQuery = supabase
      .from('Repair_Tickets')
      .select('Ticket_ID, Vehicle_Plate, Issue_Desc, Status, Date_Report, Priority')
      .in('Status', ['Pending', 'In Progress'])
      .order('Date_Report', { ascending: false })
      .limit(20)

    const { data: tickets } = await mQuery
    tickets?.forEach((ticket: { Ticket_ID: string, Date_Report: string, Vehicle_Plate: string, Priority: string, Issue_Desc: string, Status: string }) => {
      const reported = new Date(ticket.Date_Report)
      const daysOpen = Math.ceil((today.getTime() - reported.getTime()) / (1000 * 60 * 60 * 24))
      
      alerts.push({
        id: `repair-${ticket.Ticket_ID}`,
        type: 'maintenance',
        severity: ticket.Priority === 'High' || daysOpen > 7 ? 'critical' : daysOpen > 3 ? 'warning' : 'info',
        title: `แจ้งซ่อม — ${ticket.Vehicle_Plate || ''}`,
        description: `${ticket.Issue_Desc || 'ไม่ระบุ'} (เปิดมา ${daysOpen} วัน)`,
        date: ticket.Date_Report || '',
        href: `/maintenance?ticket=${ticket.Ticket_ID}`,
        meta: { plate: String(ticket.Vehicle_Plate || ''), status: String(ticket.Status || ''), ticketId: String(ticket.Ticket_ID || '') }
      })
    })
  } catch { /* ignore */ }

  // NOTE: "สถานที่ค้างเติมพิกัด" (locations missing coordinates) used to be listed
  // here too, but that's a location data-quality issue — unrelated to document
  // renewals/compliance — so it now lives on the Locations page (/routes) instead.

  // Sort: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}
