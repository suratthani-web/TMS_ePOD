'use server'

import { createAdminClient } from "@/utils/supabase/server"
import { getSession } from "@/lib/session"
import { redirect } from "next/navigation"
import argon2 from "argon2"

import { getDriverSession } from "@/lib/auth-utils"
export { getDriverSession }

/**
 * Helper to get cookies dynamically to avoid build issues in some environments.
 */
async function getCookieStore() {
  const { cookies, headers } = await import("next/headers")
  return { cookies: await cookies(), headers: await headers() }
}

/**
 * Get the current admin session from the cookie.
 * Returns the session object if found and the user is an admin or superadmin.
 */
export async function getAdminSession() {
  try {
    const session = await getSession()
    if (!session || !session.userId) return null
    
    // Roles 1 (Superadmin) and 2 (Admin) are allowed
    if (session.roleId === 1 || session.roleId === 2) {
      return session
    }
    return null
  } catch (error) {
    console.error("[AUTH] Failed to get admin session:", error)
    return null
  }
}

/**
 * RESTORED: Driver login with Identifier (Phone/ID) and Password
 */
export async function loginDriver(formData: FormData) {
  const identifier = formData.get("identifier") as string
  const password = formData.get("password") as string

  if (!identifier || !password) {
    return { error: "กรุณากรอกข้อมูลให้ครบถ้วน" }
  }

  const supabase = createAdminClient()

  let driver = null
  const cleanInput = identifier.trim()
  const cleanDigits = cleanInput.replace(/\D/g, '')

  // 1. Try exact match by Mobile_No or Driver_ID or Vehicle_Plate
  const { data: exactMatches } = await supabase
    .from("Master_Drivers")
    .select("*")
    .or(`Mobile_No.eq.${cleanInput},Driver_ID.eq.${cleanInput},Vehicle_Plate.eq.${cleanInput},Mobile_No.eq.${cleanDigits}`)

  if (exactMatches && exactMatches.length > 0) {
    driver = exactMatches[0]
  }

  // 2. If cleanDigits exists (e.g. 0902824017 or 0627570879), search by clean digits
  if (!driver && cleanDigits.length >= 8) {
    const { data: phoneMatches } = await supabase
      .from("Master_Drivers")
      .select("*")
      .ilike("Mobile_No", `%${cleanDigits}%`)

    if (phoneMatches && phoneMatches.length > 0) {
      driver = phoneMatches[0]
    }
  }

  // 3. Fallback: Search all drivers by cleaned phone digits
  if (!driver && cleanDigits.length >= 8) {
    const { data: allDrivers } = await supabase
      .from("Master_Drivers")
      .select("*")

    if (allDrivers) {
      driver = allDrivers.find(d => {
        const dbPhoneDigits = (d.Mobile_No || "").replace(/\D/g, "")
        const dbId = (d.Driver_ID || "").trim()
        return dbPhoneDigits.includes(cleanDigits) || cleanDigits.includes(dbPhoneDigits) || dbId === cleanInput
      })
    }
  }

  if (!driver) {
    return { error: "ไม่พบข้อมูลในระบบ กรุณาตรวจสอบเบอร์โทรหรือ Username" }
  }

  // 2. Password Check
  let isValid = false
  const dbPassword = driver.Password || ""

  try {
    if (dbPassword.startsWith("$argon2")) {
      // Hashed password
      isValid = await argon2.verify(dbPassword, password)
    } else {
      // Plain-text password fallback
      isValid = password === dbPassword

      // If plain-text is correct, migrate to Argon2 automatically
      if (isValid) {
        const hashedPassword = await argon2.hash(password)
        await supabase
          .from("Master_Drivers")
          .update({ Password: hashedPassword })
          .eq("Driver_ID", driver.Driver_ID)
      }
    }
  } catch (error) {
    console.error("Driver Auth Error:", error)
    isValid = false
  }

  if (!isValid) {
      return { error: "รหัสผ่านไม่ถูกต้อง" }
  }

  // 3. Fetch permissions from Master_Users
  let userData = null
  const { data: userData1 } = await supabase
    .from("Master_Users")
    .select("*")
    .eq("Username", identifier)
    .single()
  userData = userData1

  if (!userData && driver.Mobile_No) {
    const { data: userData2 } = await supabase
      .from("Master_Users")
      .select("*")
      .eq("Username", driver.Mobile_No)
      .single()
    userData = userData2
  }

  // 3. IP-Based Security Check (TEMPORARILY DISABLED for Drivers)
  /*
  const { headers: headerList } = await getCookieStore()
  const ip = headerList.get('x-forwarded-for')?.split(',')[0] || headerList.get('x-real-ip') || '127.0.0.1'

  const { data: ipRecord, error: ipError } = await supabase
    .from('user_approved_ips')
    .select('*')
    .eq('username', driver.Driver_ID)
    .eq('ip_address', ip)
    .maybeSingle()

  if (!ipRecord) {
    // First time on this IP: Create an Approved record (Drivers change IPs frequently)
    await supabase.from('user_approved_ips').insert({
      username: driver.Driver_ID,
      ip_address: ip,
      status: 'Approved', 
      device_info: headerList.get('user-agent') || 'Mobile Driver'
    })
    // No error return: allow driver to proceed
  } else {
    if (ipRecord.status === 'Blocked') {
      return { error: 'IP_BLOCKED' }
    }

    // Update last used time
    await supabase
      .from('user_approved_ips')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', ipRecord.id)
  }
  */

  // 4. Create Session (Cookie)
  const userPermissions = (userData as { Permissions?: unknown; permissions?: unknown })?.Permissions || (userData as { Permissions?: unknown; permissions?: unknown })?.permissions || { show_income: true }

  const sessionData = {
    driverId: driver.Driver_ID,
    driverName: driver.Driver_Name,
    branchId: driver.Branch_ID,
    role: "driver",
    permissions: userPermissions
  }

  const { cookies: cookieStore, headers: headersStore } = await getCookieStore()
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Extend to 30 days for better experience

  let isSecure = true
  try {
    const proto = headersStore.get('x-forwarded-proto')
    if (proto) {
      isSecure = proto.toLowerCase() === 'https'
    }
  } catch (err) {}

  cookieStore.set("driver_session", JSON.stringify(sessionData), {
    httpOnly: true,
    secure: isSecure,
    expires,
    maxAge: 30 * 24 * 60 * 60,
    sameSite: "lax",
    path: "/",
    priority: "high"
  })

  return { success: true }
}

/**
 * RESTORED/IMPLEMENTED: Driver Logout
 */
export async function logoutDriver() {
  // On logout, clean up device-linked state for this driver so they don't keep
  // showing on the live map or keep receiving push notifications afterwards.
  // Best-effort: never let a cleanup failure block logout.
  try {
    const driverSession = await getDriverSession()
    const driverId = driverSession?.driverId
    if (driverId) {
      const supabase = createAdminClient()

      // Remove the live map pin immediately (otherwise it lingers until the
      // recency window expires).
      await supabase
        .from("driver_latest_locations")
        .delete()
        .eq("driver_id", driverId)

      // Remove push subscriptions so the server stops sending notifications
      // (e.g. job assignments) to a logged-out device. Re-subscribes on next login.
      await supabase
        .from("Push_Subscriptions")
        .delete()
        .eq("Driver_ID", driverId)
    }
  } catch (err) {
    console.error("[AUTH] Failed to clear driver device state on logout:", err)
  }

  const { cookies: cookieStore } = await getCookieStore()

  // Clear cookie with specific options to ensure it is deleted
  cookieStore.set("driver_session", "", {
    maxAge: 0,
    path: "/",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax"
  })

  cookieStore.delete("driver_session")
  redirect("/mobile/login")
}

/**
 * RESTORED: Login with QR Token
 */
export async function loginWithQRToken(token: string) {
  if (!token) return { error: "ไม่พบรหัส Token" }

  const supabase = createAdminClient()

  try {
      let driverId = ""

      if (token.startsWith('{')) {
          const data = JSON.parse(token)
          driverId = data.driverId || data.Driver_ID
      } else {
          driverId = token
      }

      const { data: driver } = await supabase
          .from("Master_Drivers")
          .select("*")
          .eq("Driver_ID", driverId)
          .single()

      if (!driver) return { error: "รหัส Token ไม่ถูกต้องหรือไม่พบผู้ใช้งาน" }

      const sessionData = {
          driverId: driver.Driver_ID,
          driverName: driver.Driver_Name,
          branchId: driver.Branch_ID,
          role: "driver",
      }

      const { cookies: cookieStore, headers: headersStore } = await getCookieStore()
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      let isSecure = true
      try {
          const proto = headersStore.get('x-forwarded-proto')
          if (proto) {
              isSecure = proto.toLowerCase() === 'https'
          }
      } catch (err) {}

      cookieStore.set("driver_session", JSON.stringify(sessionData), {
          httpOnly: true,
          secure: isSecure,
          expires,
          maxAge: 30 * 24 * 60 * 60,
          sameSite: "lax",
          path: "/",
          priority: "high"
      })

      return { success: true }
  } catch (error) {
      console.error("QR Login Error:", error)
      return { error: "รหัส QR ไม่ถูกต้อง" }
  }
}

/**
 * RESTORED: Recover Driver Session
 */
export async function recoverDriverSession(driverId: string) {
    if (!driverId) return { success: false }

    const supabase = createAdminClient()
    const { data: driver, error } = await supabase
        .from("Master_Drivers")
        .select("*")
        .eq("Driver_ID", driverId)
        .single()

    if (error || !driver) return { success: false }

    const sessionData = {
        driverId: driver.Driver_ID,
        driverName: driver.Driver_Name,
        branchId: driver.Branch_ID,
        role: "driver",
    }

    const { cookies: cookieStore, headers: headersStore } = await getCookieStore()
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    let isSecure = true
    try {
        const proto = headersStore.get('x-forwarded-proto')
        if (proto) {
            isSecure = proto.toLowerCase() === 'https'
        }
    } catch (err) {}

    cookieStore.set("driver_session", JSON.stringify(sessionData), {
        httpOnly: true,
        secure: isSecure,
        expires,
        maxAge: 30 * 24 * 60 * 60,
        sameSite: "lax",
        path: "/",
        priority: "high"
    })

    return { success: true }
}

/**
 * PRESERVED: Identity matching for Push Notifications
 */
export async function getPushIdentityAction() {
  try {
    const session = await getSession()
    if (session && session.userId) {
      return {
        userId: session.userId,
        roleId: session.roleId,
        isDriver: false,
        username: session.username
      }
    }

    const driverSession = await getDriverSession()
    if (driverSession && driverSession.driverId) {
      return {
        driverId: driverSession.driverId,
        isDriver: true,
        username: driverSession.driverName
      }
    }

    return null
  } catch (error) {
    console.error("[AUTH] Failed to get push identity:", error)
    return null
  }
}
