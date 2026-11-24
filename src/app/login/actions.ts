'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/server'
import { hashPassword, verifyPassword, isHashed } from '@/lib/password'
import { createSession, deleteSession, getSession } from '@/lib/session'
import { logActivity } from '@/lib/supabase/logs'
import { headers, cookies } from 'next/headers'
import { notifyAdminIPPending } from '@/lib/actions/push-actions'
import { verifyDeviceToken, setTrustedDeviceCookie } from '@/lib/device-trust'

export type LoginFormState = {
  error?: string
}

export async function login(prevState: LoginFormState | undefined, formData: FormData): Promise<LoginFormState | undefined> {
  const supabase = createAdminClient()
  
  // Trim surrounding whitespace: password managers, mobile keyboards and
  // autofill intermittently append a space to the username/password, which
  // previously surfaced as a random "wrong password" error.
  const data = {
    email: ((formData.get('email') as string) || '').trim(),
    password: (formData.get('password') as string) || '',
  }

  try {
    // 1. Query Master_Users with Case-Insensitive Username
    const { data: users, error } = await supabase
      .from('Master_Users')
      .select('*')
      .ilike('Username', data.email)
      .maybeSingle()

    if (error || !users) {
      console.warn(`[AUTH] Login failed: User not found (${data.email})`)
      return { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }
    }

    // 2. Verify Password
    let isValid = false
    const dbPassword = users.Password || ""
    // Try the password exactly as typed first (preserves passwords that
    // legitimately contain spaces), then fall back to a trimmed version.
    let effectivePassword = data.password

    try {
      isValid = await verifyPassword(dbPassword, data.password)
      if (!isValid && data.password !== data.password.trim()) {
        effectivePassword = data.password.trim()
        isValid = await verifyPassword(dbPassword, effectivePassword)
      }

      // Auto-migrate plain-text passwords to Argon2 on first successful login
      if (isValid && effectivePassword && !isHashed(dbPassword)) {
        const hashedPassword = await hashPassword(effectivePassword)
        await supabase
          .from('Master_Users')
          .update({ Password: hashedPassword })
          .eq('Username', users.Username)
      }
    } catch (err) {
      // A thrown error here means the hashing runtime failed — NOT a wrong
      // password. Surface it distinctly so users aren't told "รหัสผิด" wrongly.
      console.error(`[AUTH] Password Verification Error:`, err)
      return { error: 'ระบบตรวจสอบรหัสผ่านขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง' }
    }

    if (!isValid) {
      console.warn(`[AUTH] Login failed: Invalid password for ${data.email}`)
      return { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' }
    }

    // 3. Create Session (Custom)
    // Map string Role to numeric Role_ID if Role_ID is missing
    let roleId = users.Role_ID
    const trimmedRole = users.Role?.trim() || ''
    
    if ((roleId === undefined || roleId === null) && trimmedRole) {
      const roleMap: Record<string, number> = {
        'super admin': 1,
        'admin': 2,
        'executive': 3,
        'dispatcher': 3,
        'accountant': 4,
        'staff': 5,
        'driver': 6,
        'customer': 7
      }
      roleId = roleMap[trimmedRole.toLowerCase()] || 5
    } else if (roleId === undefined || roleId === null) {
      roleId = 5
    }

    const branchId = users.Branch_ID || users.branch_id || null
    const customerId = users.Customer_ID || users.customer_id || null
    
    // SECURITY: If role is Customer, ensure customerId is strictly enforced
    const isCustomerRole = trimmedRole.toLowerCase() === 'customer' || roleId === 7
    const finalCustomerId = customerId ? String(customerId) : null

    // CRITICAL: Prevent login for customers with missing IDs
    if (isCustomerRole && !finalCustomerId) {
        console.warn(`[AUTH] Login failed: Customer ${data.email} is missing a Customer_ID linking.`)
        return { error: 'บัญชีลูกค้าของคุณยังไม่ได้ระบุรหัสลูกค้า (Customer ID) กรุณาติดต่อแอดมิน' }
    }
    
    // 4. IP-Based Security Check - Mandatory for Admin/Staff (Role <= 5)
    const headerList = await headers()
    let ip = headerList.get('x-forwarded-for')?.split(',')[0] || headerList.get('x-real-ip') || '127.0.0.1'
    
    // Normalize IP: Trim and handle IPv4-mapped IPv6 (::ffff:1.2.3.4)
    ip = ip.trim()
    if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7)
    }

    // CHECK FOR TRUSTED DEVICE (BYPASS IP CHECK)
    const cookieStore = await cookies()
    const trustedToken = cookieStore.get('tms_trusted_device')?.value
    const trustedPayload = await verifyDeviceToken(trustedToken)
    const isTrustedDevice = trustedPayload && trustedPayload.username.toLowerCase() === users.Username.toLowerCase()
    
    // EMERGENCY BYPASS: Super Admin (roleId === 1)
    const isSuperAdmin = roleId === 1
    // EXEMPT: Drivers (6) and Customers (7) - Skip IP Logic
    const isMobileUser = roleId === 6 || roleId === 7
    
    // Skip IP logic entirely for Mobile Users or Trusted Devices
    if (isMobileUser || isTrustedDevice) {
        if (isTrustedDevice) {
            console.log(`[AUTH] Bypassing IP check for trusted device: ${users.Username}`)
        }
        // Proceed to session creation
    } else {
        const { data: ipRecord, error: ipError } = await supabase
          .from('user_approved_ips')
          .select('*')
          .eq('username', users.Username)
          .eq('ip_address', ip)
          .maybeSingle()

        if (ipError) {
          console.error(`[AUTH] IP Check Error:`, ipError)
        }

        if (!ipRecord) {
          // First time on this IP: Create a record
          await supabase.from('user_approved_ips').insert({
            username: users.Username,
            ip_address: ip,
            status: isSuperAdmin ? 'Approved' : 'Pending', 
            device_info: headerList.get('user-agent') || 'Unknown'
          })

          await logActivity({
            module: 'Auth',
            action_type: 'UPDATE',
            user_id: users.Username,
            username: users.Username,
            details: { alert: 'NEW_IP_DETECTED', ip, status: isSuperAdmin ? 'Approved' : 'Pending' }
          })

          if (!isSuperAdmin) {
            // Send Push Notification to Super Admins
            notifyAdminIPPending(users.Username, ip).catch(err => console.error('[PUSH] Failed to notify admins:', err))
            return { error: 'IP_PENDING' }
          }
        }

        if (ipRecord && !isSuperAdmin && ipRecord.status === 'Pending') {
          return { error: 'IP_PENDING' }
        }

        if (ipRecord && ipRecord.status === 'Blocked') {
          return { error: 'IP_BLOCKED' }
        }

        // Update last used time (only if record exists)
        if (ipRecord) {
          await supabase
            .from('user_approved_ips')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', ipRecord.id)
        }

        // Successfully passed IP check: Mark this device as trusted for 30 days
        await setTrustedDeviceCookie(users.Username)
    }

    // 5. Create Session (Custom)
    await createSession(
      users.Username, 
      roleId, 
      branchId ? String(branchId) : null, 
      users.Username, 
      finalCustomerId
    )

    // Log successful login
    const fallbackRole =
      roleId === 1 ? 'Super Admin'
      : roleId === 2 ? 'Admin'
      : roleId === 6 ? 'Driver'
      : roleId === 7 ? 'Customer'
      : 'Staff'
    await logActivity({
      module: 'Auth',
      action_type: 'LOGIN',
      user_id: users.Username,
      username: users.Username,
      role: users.Role?.trim() || fallbackRole,
      branch_id: branchId || undefined,
      details: { method: 'credentials', login_time: new Date().toISOString() }
    })
    
  } catch (err) {
    console.error(`[AUTH] Critical Login Error:`, err)
    return { error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง' }
  }

  // Final successful redirect
  redirect('/dashboard')
}

export async function logout() {
  const session = await getSession()
  if (session) {
    await logActivity({
      module: 'Auth',
      action_type: 'LOGOUT',
      user_id: session.userId,
      username: session.username,
      details: { logout_time: new Date().toISOString() }
    })
  }
  await deleteSession()
  redirect('/login')
}
