"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getChatSchema } from './chat'
import { getUserBranchId, isAdmin as isAnyAdmin, isSuperAdmin as isUserSuperAdmin } from '@/lib/permissions'
import { cookies } from 'next/headers'

export interface AppNotification {
  id: string
  type: 'sos' | 'job_status' | 'maintenance' | 'system'
  title: string
  message: string
  timestamp: string
  read: boolean
  href?: string
  severity: 'critical' | 'warning' | 'info'
}

// Generate notifications from existing data sources
export async function getNotifications(): Promise<AppNotification[]> {
  const isAdmin = await isAnyAdmin()
  const isSuperAdmin = await isUserSuperAdmin()
  const supabase = isAdmin ? createAdminClient() : await createClient()
  const branchId = await getUserBranchId()
  const cookieStore = await cookies()
  const selectedBranch = cookieStore.get('selectedBranch')?.value
  
  const notifications: AppNotification[] = []
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  try {
    // 1. Admin Alerts (Critical/Warning) — last 24 hours from System_Logs
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const { data: adminLogs } = await supabase
      .from('System_Logs')
      .select('*')
      .in('module', ['Jobs', 'Fuel', 'Reports', 'Maintenance', 'Auth', 'Settings'])
      .gte('created_at', yesterday)
      .order('created_at', { ascending: false })

    if (adminLogs) {
      adminLogs.forEach((log: any) => {
        const details = log.details || {}
        
        // Filter by branch (Flexible comparison)
        if (isAdmin && selectedBranch && selectedBranch !== 'All') {
            if (String(log.branch_id) !== String(selectedBranch)) return
        } else if (branchId && !isAdmin) {
            if (String(log.branch_id) !== String(branchId)) return
        }

        // --- MAP LOG TO NOTIFICATION ---
        
        // SOS
        if (details.alert_type === 'SOS' || details.alert_type === 'SILENT_SOS') {
          notifications.push({
            id: `sos-log-${log.id}`,
            type: 'sos',
            title: `🆘 SOS: ${details.driver_name || log.username || 'คนขับ'}`,
            message: details.alert_type === 'SILENT_SOS' 
              ? `แจ้งเหตุฉุกเฉิน (ไม่สะดวกคุย): ${details.address || 'ไม่ทราบตำแหน่ง'}`
              : (details.message || `พนักงานกดโทรฉุกเฉินหาแอดมิน`),
            timestamp: log.created_at,
            read: false,
            href: `/monitoring?driver=${log.target_id}`,
            severity: 'critical'
          })
        }

        // FUEL
        else if (log.module === 'Fuel' && log.action_type === 'CREATE') {
           notifications.push({
             id: `fuel-log-${log.id}`,
             type: 'system',
             title: `⛽ แจ้งเติมน้ำมันใหม่`,
             message: details.message || `${details.vehicle || 'ไม่ระบุทะเบียน'} • ${details.amount || '0'} บาท`,
             timestamp: log.created_at,
             read: false,
             href: '/fuel',
             severity: 'info'
           })
        }

        // LEAVE
        else if (details.alert_type === 'LEAVE') {
           notifications.push({
             id: `leave-log-${log.id}`,
             type: 'system',
             title: `📅 แจ้งลางานใหม่`,
             message: details.message || `${details.driver_name || 'คนขับ'} ขอลา: ${details.type || 'ไม่ระบุ'}`,
             timestamp: log.created_at,
             read: false,
             href: '/admin/driver-leaves',
             severity: 'info'
           })
        }

        // DAMAGE / REPAIR
        else if (details.alert_type === 'DAMAGE' || log.module === 'Reports') {
           notifications.push({
             id: `damage-log-${log.id}`,
             type: 'maintenance',
             title: `📦❌ สินค้าเสียหาย/แจ้งซ่อม`,
             message: details.message || `${details.driver_name || 'คนขับ'} แจ้งเหตุ: ${details.reason || 'ไม่ระบุ'}`,
             timestamp: log.created_at,
             read: false,
             href: '/reports',
             severity: 'warning'
           })
        }

        // NEW IP SECURITY ALERT - Strictly for Super Admins
        else if (details.alert === 'NEW_IP_DETECTED' && details.status === 'Pending' && isSuperAdmin) {
           notifications.push({
             id: `ip-alert-${log.id}`,
             type: 'system',
             title: `🛡️ พบการขอเข้าใช้จาก IP ใหม่`,
             message: `ผู้ใช้: ${log.username} | IP: ${details.ip}`,
             timestamp: log.created_at,
             read: false,
             severity: 'critical',
             href: '/settings/security'
           })
        }
      })
    }

    // 1.1 Also check for jobs currently in SOS status
    let activeSOSQuery = supabase
      .from('Jobs_Main')
      .select('Job_ID, Driver_Name, Failed_Reason, Failed_Time, Driver_ID, Branch_ID')
      .eq('Job_Status', 'SOS')
      .limit(5)
    
    if (isAdmin && selectedBranch && selectedBranch !== 'All') {
        activeSOSQuery = activeSOSQuery.eq('Branch_ID', selectedBranch)
    }

    const { data: activeSOS } = await activeSOSQuery
    if (activeSOS) {
        activeSOS.forEach((job: any) => {
            // Avoid duplicate if already in logs
            if (notifications.some(n => n.id.includes(job.Job_ID))) return

            notifications.push({
                id: `sos-job-${job.Job_ID}`,
                type: 'sos',
                title: `🆘 งานสถานะ SOS: ${job.Job_ID}`,
                message: `${job.Driver_Name || 'คนขับ'}: ${job.Failed_Reason || 'แจ้งเหตุฉุกเฉิน'}`,
                timestamp: job.Failed_Time || now.toISOString(),
                read: false,
                href: `/monitoring?driver=${job.Driver_ID}`,
                severity: 'critical'
            })
        })
    }
  } catch (err) {
    console.error("SOS Notification fetch error:", err)
  }

  try {
    // 2. Recent Job Status Changes — jobs updated today
    let jobQuery = supabase
      .from('Jobs_Main')
      .select('Job_ID, Job_Status, Driver_Name, Customer_Name, updated_at')
      .eq('Plan_Date', today)
      .in('Job_Status', ['Failed', 'Cancelled', 'Completed', 'Delivered'])
      .order('updated_at', { ascending: false })
      .limit(10)

    if (isAdmin && selectedBranch && selectedBranch !== 'All') {
      jobQuery = jobQuery.eq('Branch_ID', selectedBranch)
    } else if (branchId && !isAdmin) {
      jobQuery = jobQuery.eq('Branch_ID', branchId)
    }

    const { data: statusJobs } = await jobQuery

    if (statusJobs) {
      // Only show failures prominently
      statusJobs.filter((j: any) => j.Job_Status === 'Failed' || j.Job_Status === 'Cancelled').forEach((job: any) => {
        notifications.push({
          id: `job-fail-${job.Job_ID}`,
          type: 'job_status',
          title: job.Job_Status === 'Failed' ? '❌ งานล้มเหลว' : '⚠️ งานถูกยกเลิก',
          message: `${job.Job_ID} • ${job.Customer_Name || 'ลูกค้า'} (${job.Driver_Name || 'ไม่ระบุคนขับ'})`,
          timestamp: job.updated_at || now.toISOString(),
          read: false,
          href: '/jobs/history',
          severity: job.Job_Status === 'Failed' ? 'critical' : 'warning'
        })
      })

      // Show completed count as info
      const completedCount = statusJobs.filter((j: any) => j.Job_Status === 'Completed' || j.Job_Status === 'Delivered').length
      if (completedCount > 0) {
        notifications.push({
          id: `job-completed-${today}`,
          type: 'job_status',
          title: '✅ งานเสร็จวันนี้',
          message: `${completedCount} งานเสร็จสิ้นเรียบร้อย`,
          timestamp: now.toISOString(),
          read: true,
          href: '/jobs/history',
          severity: 'info'
        })
      }
    }
  } catch {
    // Jobs table query error
  }

  try {
    // 3. New Shipment Requests (Pending)
    let requestQuery = supabase
      .from('Jobs_Main')
      .select('Job_ID, Customer_Name, Created_At, Job_Status, Plan_Date')
      .eq('Job_Status', 'Requested')
      .order('Created_At', { ascending: false })
      .limit(5)

    if (isAdmin && selectedBranch && selectedBranch !== 'All') {
      requestQuery = requestQuery.eq('Branch_ID', selectedBranch)
    } else if (branchId && !isAdmin) {
      requestQuery = requestQuery.eq('Branch_ID', branchId)
    }

    const { data: requests } = await requestQuery

    if (requests) {
      requests.forEach((req: { Job_ID: string, Customer_Name?: string, Created_At?: string, Plan_Date?: string }) => {
        notifications.push({
          id: `request-${req.Job_ID}`,
          type: 'system',
          title: '🆕 คำขอส่งสินค้าใหม่',
          message: `${req.Customer_Name || 'ลูกค้า'} ขอรถสำหรับวันที่ ${req.Plan_Date || 'ไม่ระบุ'}`,
          timestamp: req.Created_At || now.toISOString(),
          read: false,
          href: '/planning',
          severity: 'info'
        })
      })
    }
  } catch {
    // Request query error
  }

  try {
    // 4. Maintenance Due Soon (within 7 days)
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    
    const { data: maintenanceDue } = await supabase
      .from('vehicle_maintenance')
      .select('id, vehicle_plate, maintenance_type, next_maintenance_date')
      .lte('next_maintenance_date', weekFromNow)
      .gte('next_maintenance_date', today)
      .limit(5)

    if (maintenanceDue) {
      maintenanceDue.forEach((m: any) => {
        notifications.push({
          id: `maint-${m.id}`,
          type: 'maintenance',
          title: '🔧 ซ่อมบำรุงใกล้ถึง',
          message: `${m.vehicle_plate} — ${m.maintenance_type} (${m.next_maintenance_date})`,
          timestamp: now.toISOString(),
          read: false,
          href: '/maintenance',
          severity: 'warning'
        })
      })
    }
  } catch {
    // Maintenance table may not have next_maintenance_date
  }

  try {
    // 4. Unread Chat Messages from Drivers
    // Detect correct schema resilience
    const { tableName: chatTableName, columns: chatCols } = await getChatSchema(supabase)

    const chatQuery = supabase
      .from(chatTableName)
      .select('*')
      .eq(chatCols.receiver_id, 'admin')
      .eq(chatCols.is_read, false)
      .order(chatCols.created_at, { ascending: false })
      .limit(10)

    const { data: unreadMsgs } = await chatQuery

    if (unreadMsgs && unreadMsgs.length > 0) {
      // Get driver names for better display
      const { data: drivers } = await supabase
        .from('Master_Drivers')
        .select('Driver_ID, Driver_Name, Branch_ID')
        .in('Driver_ID', (unreadMsgs as Record<string, string>[]).map(m => m[chatCols.sender_id]))

      const driverMap = new Map<string, Record<string, string>>()
      if (drivers) {
        drivers.forEach((d: any) => driverMap.set(d.Driver_ID, d))
      }

      (unreadMsgs as Record<string, string>[]).forEach((msg: Record<string, string>) => {
        const senderId = msg[chatCols.sender_id]
        const driver = driverMap.get(senderId)
        
        // Filter by branch if needed
        if (isAdmin && selectedBranch && selectedBranch !== 'All') {
            if (driver?.Branch_ID !== selectedBranch) return
        } else if (branchId && !isAdmin) {
            if (driver?.Branch_ID !== branchId) return
        }

        notifications.push({
          id: `chat-${msg[chatCols.id]}`,
          type: 'system',
          title: `💬 ข้อความใหม่จาก ${driver?.Driver_Name || senderId}`,
          message: msg[chatCols.message],
          timestamp: msg[chatCols.created_at],
          read: false,
          href: `/monitoring?driver=${senderId}&openChat=true`,
          severity: 'info'
        })
      })
    }
  } catch {
    // Chat notification error
  }

    // 5. Idle Detection (Smart Alert) — Optimized Bulk Fetch
    const activeJobs = await supabase
      .from('Jobs_Main')
      .select('Job_ID, Driver_ID, Driver_Name, Vehicle_Plate, updated_at')
      .in('Job_Status', ['In Transit', 'In Progress', 'Arrived Pickup', 'Arrived Dropoff'])
      .not('Driver_ID', 'is', null)

    if (activeJobs.data && activeJobs.data.length > 0) {
      const driverIds = activeJobs.data.map((j: any) => j.Driver_ID)
      
      // Get the latest 2 logs for all active drivers in one go
      // Note: Supabase doesn't easily support "limit 2 per group" in a simple query, 
      // so we fetch the most recent log for each first to check idle time.
      const { data: latestLogs } = await supabase
        .from('gps_logs')
        .select('driver_id, latitude, longitude, timestamp')
        .in('driver_id', driverIds)
        .order('timestamp', { ascending: false })

      if (latestLogs && latestLogs.length > 0) {
        // Group by driver to get the absolute latest for each
        const driverLatestMap = new Map<string, any>()
        latestLogs.forEach((log: any) => {
          if (!driverLatestMap.has(log.driver_id)) {
            driverLatestMap.set(log.driver_id, log)
          }
        })

        for (const job of activeJobs.data) {
          const latest = driverLatestMap.get(job.Driver_ID)
          if (!latest) continue

          const lastUpdate = new Date(latest.timestamp)
          const idleMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60)

          if (idleMinutes > 30) {
            notifications.push({
                id: `idle-${job.Job_ID}`,
                type: 'system',
                title: '🐢 รถจอดแช่นานผิดปกติ',
                message: `${job.Driver_Name || 'คนขับ'} (${job.Vehicle_Plate || job.Job_ID}) จอดนิ่งเกิน ${Math.round(idleMinutes)} นาที`,
                timestamp: latest.timestamp,
                read: false,
                href: `/monitoring?driver=${job.Driver_ID}`,
                severity: idleMinutes > 60 ? 'critical' : 'warning'
            })
          }
        }
      }
    }

  // Sort: critical first, then by timestamp
  return notifications.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 }
    if (severityOrder[a.severity] !== severityOrder[b.severity]) {
      return severityOrder[a.severity] - severityOrder[b.severity]
    }
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })
}

export async function getUnreadCount(): Promise<number> {
  const notifications = await getNotifications()
  return notifications.filter(n => !n.read).length
}

export async function markAllNotificationsAsRead() {
    try {
        const isAdmin = await isAnyAdmin()
        const supabase = isAdmin ? createAdminClient() : await createClient()

        // 1. Mark Chat messages as read
        const { tableName: chatTableName, columns: chatCols } = await getChatSchema(supabase)
        await supabase
            .from(chatTableName)
            .update({ [chatCols.is_read]: true })
            .eq(chatCols.receiver_id, 'admin')
            .eq(chatCols.is_read, false)

        // 2. Clear any persistent SOS or active alerts if applicable
        // (For now, we mostly deal with Chat as the primary 'read/unread' state)
        
        return { success: true }
    } catch (err) {
        console.error("Error marking alerts as read:", err)
        return { success: false, error: err }
    }
}
