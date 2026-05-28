"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isAdmin } from "@/lib/permissions"

export interface AdminAlert {
  id: string
  type: 'expiry' | 'inspection_fail' | 'maintenance' | 'sos'
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

  // 0. SOS Alerts from System_Logs (Last 24 hours)
  try {
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const { data: sosLogs } = await supabase
      .from('System_Logs')
      .select('*')
      .eq('module', 'Jobs')
      .eq('action_type', 'UPDATE')
      .gte('created_at', yesterday)
      .order('created_at', { ascending: false })

    sosLogs?.forEach((log: any) => {
      const details = log.details || {}
      if (details.alert_type === 'SOS' || details.alert_type === 'SILENT_SOS') {
        // Filter by branch
        if (isAdminUser && branchId && branchId !== 'All') {
            if (String(log.branch_id) !== String(branchId)) return
        }

        alerts.push({
          id: `sos-${log.id}`,
          type: 'sos',
          severity: 'critical',
          title: `🆘 SOS: ${details.driver_name || 'คนขับ'}`,
          description: details.alert_type === 'SILENT_SOS' 
            ? `แจ้งเหตุฉุกเฉิน (ไม่สะดวกคุย): ${details.address || 'ไม่ทราบตำแหน่ง'}`
            : `พนักงานกดโทรฉุกเฉินหาแอดมิน`,
          date: log.created_at,
          href: '/sos',
          meta: { 
            driverId: log.target_id || '', 
            driverName: details.driver_name || '',
            lat: String(details.lat || ''),
            lng: String(details.lng || ''),
            address: details.address || ''
          }
        })
      }
    })
  } catch (err) {
    console.error("Admin SOS alerts error:", err)
  }

  // 1. Vehicle document expiry alerts (tax, insurance, ACT)
  try {
    let vQuery = supabase
      .from('Master_Vehicles')
      .select('Vehicle_Plate, Tax_Expiry, Insurance_Expiry, Act_Expiry, Active_Status')
      .eq('Active_Status', 'Active')

    if (branchId && branchId !== 'All') {
      vQuery = vQuery.eq('Branch_ID', branchId)
    }

    const { data: vehicles } = await vQuery
    vehicles?.forEach((v: any) => {
      const checks = [
        { field: v.Tax_Expiry, label: 'ภาษีรถ (Tax)', type: 'tax' },
        { field: v.Insurance_Expiry, label: 'ประกันภัย (Insurance)', type: 'insurance' },
        { field: v.Act_Expiry, label: 'พ.ร.บ. (ACT)', type: 'act' },
      ]
      checks.forEach(c => {
        if (!c.field) return
        const expDate = new Date(c.field)
        const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        
        if (diffDays <= 30) {
          alerts.push({
            id: `${v.Vehicle_Plate}-${c.type}`,
            type: 'expiry',
            severity: diffDays <= 0 ? 'critical' : diffDays <= 15 ? 'warning' : 'info',
            title: `${c.label} — ${v.Vehicle_Plate}`,
            description: diffDays <= 0 
              ? `หมดอายุแล้ว ${Math.abs(diffDays)} วัน` 
              : `เหลืออีก ${diffDays} วัน (หมดอายุ ${expDate.toLocaleDateString('th-TH')})`,
            date: c.field,
            href: `/fleet?search=${v.Vehicle_Plate}`,
            meta: { plate: v.Vehicle_Plate, expiryType: c.type }
          })
        }
      })
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

    checks?.forEach((check: any) => {
      const items = (check.Passed_Items || {}) as Record<string, boolean>
      const failedItems = CHECKLIST.filter(item => !items[item])
      if (failedItems.length > 0) {
        alerts.push({
          id: `check-${check.id}`,
          type: 'inspection_fail',
          severity: failedItems.length >= 3 ? 'critical' : 'warning',
          title: `ตรวจรถไม่ผ่าน — ${check.Vehicle_Plate}`,
          description: `ไม่ผ่าน ${failedItems.length} รายการ: ${failedItems.join(', ')}`,
          date: check.Check_Date,
          href: `/admin/vehicle-checks?id=${check.id}`,
          meta: { 
            plate: check.Vehicle_Plate, 
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
    tickets?.forEach((ticket: any) => {
      const reported = new Date(ticket.Date_Report)
      const daysOpen = Math.ceil((today.getTime() - reported.getTime()) / (1000 * 60 * 60 * 24))
      
      alerts.push({
        id: `repair-${ticket.Ticket_ID}`,
        type: 'maintenance',
        severity: ticket.Priority === 'High' || daysOpen > 7 ? 'critical' : daysOpen > 3 ? 'warning' : 'info',
        title: `แจ้งซ่อม — ${ticket.Vehicle_Plate}`,
        description: `${ticket.Issue_Desc || 'ไม่ระบุ'} (เปิดมา ${daysOpen} วัน)`,
        date: ticket.Date_Report,
        href: `/maintenance?ticket=${ticket.Ticket_ID}`,
        meta: { plate: ticket.Vehicle_Plate, status: ticket.Status, ticketId: ticket.Ticket_ID }
      })
    })
  } catch { /* ignore */ }

  // Sort: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}
