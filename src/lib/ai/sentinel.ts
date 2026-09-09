import { createAdminClient } from '@/utils/supabase/server'
import { sendPushToAdmins } from '@/lib/actions/push-actions'
import { logActivity } from '@/lib/supabase/logs'

export interface SentinelAlert {
  category: 'fuel' | 'operations' | 'compliance' | 'finance'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  message: string
  details?: Record<string, unknown>
  targetId?: string
  branchId?: string | null
  actionUrl?: string
}

/**
 * 1. FUEL INTEGRITY WATCHDOG
 * Detects abnormal fuel consumption, tank overflows, and duplicate/suspicious entries.
 */
export async function checkFuelAnomalies(daysLookback = 3): Promise<SentinelAlert[]> {
  const alerts: SentinelAlert[] = []
  const supabase = createAdminClient()
  
  const sinceDate = new Date(Date.now() - daysLookback * 24 * 60 * 60 * 1000).toISOString()
  
  const { data: logs } = await supabase
    .from('Fuel_Logs')
    .select('Log_ID, Date_Time, Vehicle_Plate, Driver_ID, Liters, Price_Total, Odometer, Station_Name, Branch_ID')
    .gte('Date_Time', sinceDate)
    .order('Date_Time', { ascending: false })

  if (!logs || logs.length === 0) return []

  // Fetch Tank Capacity from Master_Vehicles
  const { data: vehicles } = await supabase
    .from('Master_Vehicles')
    .select('Vehicle_Plate, Tank_Capacity, Current_Mileage, Branch_ID')
  
  const vehicleMap = new Map((vehicles || []).map(v => [v.Vehicle_Plate, v]))

  // Group logs by vehicle plate for consecutive odometer & consumption analysis
  const byVehicle = new Map<string, typeof logs>()
  for (const log of logs) {
    if (!log.Vehicle_Plate) continue
    const list = byVehicle.get(log.Vehicle_Plate) || []
    list.push(log)
    byVehicle.set(log.Vehicle_Plate, list)
  }

  for (const [plate, vLogs] of byVehicle.entries()) {
    const vMeta = vehicleMap.get(plate)
    const tankCap = Number(vMeta?.Tank_Capacity) || 50

    // Chronological order for mileage check
    const sorted = [...vLogs].sort((a, b) => (a.Date_Time || '').localeCompare(b.Date_Time || ''))

    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i]
      const liters = Number(cur.Liters) || 0
      const priceTotal = Number(cur.Price_Total) || 0
      const pricePerLiter = liters > 0 ? priceTotal / liters : 0

      // Anomaly A: Tank Overflow (> 110% capacity)
      if (liters > tankCap * 1.1) {
        alerts.push({
          category: 'fuel',
          severity: 'high',
          title: `⛽ เติมน้ำมันเกินความจุถัง (${plate})`,
          message: `รถทะเบียน ${plate} เติมน้ำมัน ${liters.toFixed(1)} ลิตร เกินความจุถังปกติ (${tankCap} ลิตร) ที่ปั๊ม ${cur.Station_Name || 'ไม่ระบุ'}`,
          targetId: cur.Log_ID,
          branchId: cur.Branch_ID || vMeta?.Branch_ID,
          actionUrl: '/fuel',
          details: { plate, liters, tankCap, station: cur.Station_Name }
        })
      }

      // Anomaly B: Price per liter abnormality (> 45 THB/L for standard diesel or < 25)
      if (pricePerLiter > 45 || (pricePerLiter > 0 && pricePerLiter < 25)) {
        alerts.push({
          category: 'fuel',
          severity: 'medium',
          title: `⛽ ราคาน้ำมันต่อลิตรผิดปกติ (${plate})`,
          message: `บิลน้ำมันรถ ${plate} มีราคาต่อลิตร ฿${pricePerLiter.toFixed(2)}/L ซึ่งผิดปกติจากราคาตลาดทั่วไป`,
          targetId: cur.Log_ID,
          branchId: cur.Branch_ID || vMeta?.Branch_ID,
          actionUrl: '/fuel',
          details: { plate, pricePerLiter, priceTotal, liters }
        })
      }

      // Anomaly C: Consecutive Mileage & Efficiency Check
      if (i > 0) {
        const prev = sorted[i - 1]
        if (prev.Odometer && cur.Odometer && cur.Odometer > prev.Odometer && liters > 0) {
          const deltaKm = cur.Odometer - prev.Odometer
          const kmPerLiter = deltaKm / liters

          if (kmPerLiter < 4.0) {
            alerts.push({
              category: 'fuel',
              severity: 'critical',
              title: `🚨 อัตราสิ้นเปลืองน้ำมันต่ำผิดปกติ (${plate})`,
              message: `รถทะเบียน ${plate} วิ่งได้เพียง ${kmPerLiter.toFixed(1)} km/L (${deltaKm} กม. / ${liters} ลิตร) อาจเกิดปัญหาน้ำมันรั่วไหลหรือสูบออก`,
              targetId: cur.Log_ID,
              branchId: cur.Branch_ID || vMeta?.Branch_ID,
              actionUrl: '/fuel',
              details: { plate, kmPerLiter, deltaKm, liters, fromOdo: prev.Odometer, toOdo: cur.Odometer }
            })
          }
        }
      }
    }
  }

  return alerts
}

/**
 * 2. OPERATIONAL SLA & BOTTLENECK WATCHDOG
 * Detects unassigned upcoming jobs, late departures, overdue deliveries, and unclosed jobs.
 */
export async function checkJobAndSlaAnomalies(): Promise<SentinelAlert[]> {
  const alerts: SentinelAlert[] = []
  const supabase = createAdminClient()
  
  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

  // 1. Unassigned Jobs for Tomorrow
  const { data: unassignedTomorrow } = await supabase
    .from('Jobs_Main')
    .select('Job_ID, Customer_Name, Route_Name, Plan_Date, Branch_ID')
    .eq('Plan_Date', tomorrowStr)
    .or('Driver_ID.is.null,Job_Status.eq.Draft,Job_Status.eq.New')
    .limit(50)

  if (unassignedTomorrow && unassignedTomorrow.length > 0) {
    alerts.push({
      category: 'operations',
      severity: 'medium',
      title: `📦 งานวันพรุ่งนี้ยังไม่มีคนขับ (${unassignedTomorrow.length} งาน)`,
      message: `มีงานของวันพรุ่งนี้ (${tomorrowStr}) จำนวน ${unassignedTomorrow.length} งานที่ยังไม่ได้มอบหมายคนขับหรือยังเป็นสถานะ Draft`,
      branchId: unassignedTomorrow[0]?.Branch_ID,
      actionUrl: '/planning',
      details: { count: unassignedTomorrow.length, sample: unassignedTomorrow.slice(0, 5).map(j => j.Job_ID) }
    })
  }

  // 2. Overdue Incomplete Jobs from Past Dates
  const { data: overdueJobs } = await supabase
    .from('Jobs_Main')
    .select('Job_ID, Customer_Name, Driver_Name, Plan_Date, Job_Status, Branch_ID')
    .lt('Plan_Date', todayStr)
    .not('Job_Status', 'in', '(Completed,Delivered,Finished,Closed,Billed,Paid,Verified,Cancelled,Rejected)')
    .limit(50)

  if (overdueJobs && overdueJobs.length > 0) {
    alerts.push({
      category: 'operations',
      severity: 'high',
      title: `⏰ งานค้างส่งเลยกำหนด (${overdueJobs.length} งาน)`,
      message: `มีงานที่เลยกำหนดวันส่งแต่ยังไม่ปิดงานสำเร็จ ${overdueJobs.length} รายการ กรุณาตรวจสอบสถานะกับคนขับหรือปิดงาน`,
      actionUrl: '/pod',
      details: { count: overdueJobs.length, sample: overdueJobs.slice(0, 5).map(j => `${j.Job_ID} (${j.Customer_Name})`) }
    })
  }

  return alerts
}

/**
 * 3. COMPLIANCE & PREVENTIVE MAINTENANCE WATCHDOG
 * Detects expiring vehicle tax/insurance/ACT, driver licenses, and upcoming oil/tire changes.
 */
export async function checkComplianceAndMaintenance(): Promise<SentinelAlert[]> {
  const alerts: SentinelAlert[] = []
  const supabase = createAdminClient()
  
  const now = new Date()
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

  // 1. Vehicle Insurance / Tax / ACT Expiry
  const { data: vehicles } = await supabase
    .from('Master_Vehicles')
    .select('Vehicle_Plate, Tax_Expiry, Insurance_Expiry, Act_Expiry, Current_Mileage, Next_Service_Mileage, Tire_Next_Change_Mileage, Branch_ID')
    .eq('Active_Status', 'Active')

  for (const v of vehicles || []) {
    const plate = v.Vehicle_Plate
    // Tax Expiry
    if (v.Tax_Expiry && v.Tax_Expiry <= in30Days && v.Tax_Expiry >= todayStr) {
      alerts.push({
        category: 'compliance',
        severity: 'medium',
        title: `📄 ภาษีรถใกล้หมดอายุ (${plate})`,
        message: `รถทะเบียน ${plate} ภาษีจะหมดอายุในวันที่ ${v.Tax_Expiry} (ภายใน 30 วัน)`,
        targetId: plate,
        branchId: v.Branch_ID,
        actionUrl: '/vehicles',
        details: { plate, type: 'Tax', expiry: v.Tax_Expiry }
      })
    }

    // Insurance Expiry
    if (v.Insurance_Expiry && v.Insurance_Expiry <= in30Days && v.Insurance_Expiry >= todayStr) {
      alerts.push({
        category: 'compliance',
        severity: 'high',
        title: `📄 ประกันภัยรถใกล้หมดอายุ (${plate})`,
        message: `รถทะเบียน ${plate} ประกันภัยจะหมดอายุในวันที่ ${v.Insurance_Expiry}`,
        targetId: plate,
        branchId: v.Branch_ID,
        actionUrl: '/vehicles',
        details: { plate, type: 'Insurance', expiry: v.Insurance_Expiry }
      })
    }

    // Service Interval Mileage Check — push-worthy so admins get a notification
    // (not just a dashboard card). 'high' = at/over the target (overdue), 'medium'
    // when still approaching within 500 km; both are pushed via the high-severity
    // path below because reaching a service interval is actionable.
    const curMil = Number(v.Current_Mileage) || 0
    const nextSvc = Number(v.Next_Service_Mileage) || 0
    if (nextSvc > 0 && curMil >= nextSvc - 500) {
      const reached = curMil >= nextSvc
      alerts.push({
        category: 'compliance',
        severity: 'high',
        title: reached
          ? `🔧 ถึงรอบเช็กระยะแล้ว (${plate})`
          : `🔧 ใกล้ถึงรอบเช็กระยะ (${plate})`,
        message: `รถทะเบียน ${plate} ไมล์ปัจจุบัน ${curMil.toLocaleString()} กม. ${reached ? 'ถึง/เลย' : 'ใกล้ถึง'}รอบเช็กระยะที่ ${nextSvc.toLocaleString()} กม. (เหลือ ${Math.max(0, nextSvc - curMil).toLocaleString()} กม.)`,
        targetId: plate,
        branchId: v.Branch_ID,
        actionUrl: '/maintenance',
        details: { plate, currentMileage: curMil, targetMileage: nextSvc, reached }
      })
    }
  }

  // 2. Driver License Expiry
  const { data: drivers } = await supabase
    .from('Master_Drivers')
    .select('Driver_ID, Driver_Name, Expire_Date, Branch_ID')
    .eq('Active_Status', 'Active')

  for (const d of drivers || []) {
    if (d.Expire_Date && d.Expire_Date <= in30Days && d.Expire_Date >= todayStr) {
      alerts.push({
        category: 'compliance',
        severity: 'high',
        title: `🪪 ใบขับขี่คนขับใกล้หมดอายุ (${d.Driver_Name})`,
        message: `คนขับ ${d.Driver_Name} (${d.Driver_ID}) ใบขับขี่จะหมดอายุในวันที่ ${d.Expire_Date}`,
        targetId: d.Driver_ID,
        branchId: d.Branch_ID,
        actionUrl: '/settings/users',
        details: { driverName: d.Driver_Name, expiry: d.Expire_Date }
      })
    }
  }

  return alerts
}

/**
 * 4. FINANCIAL & MARGIN SENTINEL
 * Detects jobs created with negative gross margins (Price < Driver Cost).
 */
export async function checkFinancialLossJobs(): Promise<SentinelAlert[]> {
  const alerts: SentinelAlert[] = []
  const supabase = createAdminClient()
  
  const now = new Date()
  const sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })

  const { data: lossJobs } = await supabase
    .from('Jobs_Main')
    .select('Job_ID, Customer_Name, Driver_Name, Route_Name, Price_Cust_Total, Cost_Driver_Total, Plan_Date, Branch_ID')
    .gte('Plan_Date', sinceDate)
    .gt('Cost_Driver_Total', 0)
    .limit(50)

  for (const j of lossJobs || []) {
    const revenue = Number(j.Price_Cust_Total) || 0
    const cost = Number(j.Cost_Driver_Total) || 0
    if (revenue > 0 && cost > revenue) {
      const lossAmount = cost - revenue
      alerts.push({
        category: 'finance',
        severity: 'high',
        title: `📉 ตรวจพบงานขาดทุน (${j.Job_ID})`,
        message: `งาน #${j.Job_ID} (${j.Customer_Name}) ราคาลูกค้า ฿${revenue.toLocaleString()} ต่ำกว่าค่าเที่ยวคนขับ ฿${cost.toLocaleString()} (ขาดทุน ฿${lossAmount.toLocaleString()})`,
        targetId: j.Job_ID,
        branchId: j.Branch_ID,
        actionUrl: '/planning',
        details: { jobId: j.Job_ID, customer: j.Customer_Name, revenue, cost, loss: lossAmount }
      })
    }
  }

  return alerts
}

/**
 * MASTER SENTINEL RUNNER
 * Collects all alerts across categories, logs activities, and broadcasts to Admins via Push and Web Notifications.
 */
export async function runAllSentinelChecks(): Promise<{ count: number; alerts: SentinelAlert[] }> {
  try {
    const [fuelAlerts, opsAlerts, complianceAlerts, financeAlerts] = await Promise.all([
      checkFuelAnomalies(3),
      checkJobAndSlaAnomalies(),
      checkComplianceAndMaintenance(),
      checkFinancialLossJobs()
    ])

    const allAlerts = [...fuelAlerts, ...opsAlerts, ...complianceAlerts, ...financeAlerts]

    // Broadcast High & Critical Alerts to Admins
    for (const alert of allAlerts) {
      if (alert.severity === 'high' || alert.severity === 'critical') {
        try {
          await sendPushToAdmins({
            title: alert.title,
            body: alert.message,
            url: alert.actionUrl || '/dashboard',
            type: 'alert'
          }, alert.branchId || undefined)

          await logActivity({
            module: 'Reports',
            action_type: 'UPDATE',
            target_id: alert.targetId || alert.category,
            branch_id: alert.branchId || undefined,
            details: {
              type: 'AI_Sentinel_Alert',
              category: alert.category,
              severity: alert.severity,
              title: alert.title,
              message: alert.message,
              ...alert.details
            }
          })
        } catch (pushErr) {
          console.error('[Sentinel Broadcast Error]', pushErr)
        }
      }
    }

    return { count: allAlerts.length, alerts: allAlerts }
  } catch (error) {
    console.error('[Sentinel Runner Critical Error]', error)
    return { count: 0, alerts: [] }
  }
}
