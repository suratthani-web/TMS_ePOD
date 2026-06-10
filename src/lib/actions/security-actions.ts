'use server'

import { createAdminClient } from "@/utils/supabase/server"
import { requireAdmin } from "@/services/permission-guards"
import { revalidatePath } from "next/cache"
import { logActivity } from "@/lib/supabase/logs"
import { getAdminSession } from "./auth-actions"
import { getSession } from "@/lib/session"
import argon2 from "argon2"

export async function getCurrentUserSession() {
    return await getSession()
}

export async function getPendingIPs() {
    await requireAdmin()
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('user_approved_ips')
        .select('*')
        .eq('status', 'Pending')
        .order('created_at', { ascending: false })
    
    if (error) return []
    return data
}

export async function approveIP(id: string, username: string, ip: string) {
    const adminSession = await getAdminSession()
    if (!adminSession) return { success: false, error: 'Unauthorized' }

    await requireAdmin()
    const supabase = createAdminClient()
    const { error } = await supabase
        .from('user_approved_ips')
        .update({ 
            status: 'Approved',
            approved_by: adminSession.username,
            approved_at: new Date().toISOString()
        })
        .eq('id', id)
    
    if (error) return { success: false, error: error.message }

    await logActivity({
        module: 'Settings',
        action_type: 'APPROVE',
        user_id: adminSession.userId,
        username: adminSession.username,
        details: { action: 'APPROVE_IP', target_user: username, target_ip: ip }
    })

    revalidatePath('/settings/security')
    return { success: true }
}

export async function blockIP(id: string, username: string, ip: string) {
    const adminSession = await getAdminSession()
    if (!adminSession) return { success: false, error: 'Unauthorized' }

    await requireAdmin()
    const supabase = createAdminClient()
    const { error } = await supabase
        .from('user_approved_ips')
        .update({ 
            status: 'Blocked',
            approved_by: adminSession.username,
            approved_at: new Date().toISOString()
        })
        .eq('id', id)
    
    if (error) return { success: false, error: error.message }

    await logActivity({
        module: 'Settings',
        action_type: 'UPDATE',
        user_id: adminSession.userId,
        username: adminSession.username,
        details: { action: 'BLOCK_IP', target_user: username, target_ip: ip }
    })

    revalidatePath('/settings/security')
    return { success: true }
}

export async function deleteIPRecord(id: string) {
    const adminSession = await getAdminSession()
    if (!adminSession) return { success: false, error: 'Unauthorized' }

    await requireAdmin()
    const supabase = createAdminClient()
    const { error } = await supabase
        .from('user_approved_ips')
        .delete()
        .eq('id', id)
    
    if (error) return { success: false, error: error.message }

    revalidatePath('/settings/security')
    return { success: true }
}

export async function changePassword(currentPassword: string, newPassword: string) {
    const session = await getSession()
    if (!session) return { success: false, error: 'ไม่พบ Session กรุณา Login ใหม่' }

    if (!newPassword || newPassword.length < 6) {
        return { success: false, error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' }
    }

    const supabase = createAdminClient()

    // 1. Fetch current password hash from DB
    const { data: user, error: fetchError } = await supabase
        .from('Master_Users')
        .select('Username, Password')
        .eq('Username', session.userId)
        .single()

    if (fetchError || !user) {
        return { success: false, error: 'ไม่พบข้อมูลผู้ใช้งาน' }
    }

    // 2. Verify current password
    let isValid = false
    try {
        const dbPassword = user.Password || ''
        if (dbPassword.startsWith('$argon2')) {
            isValid = await argon2.verify(dbPassword, currentPassword)
        } else {
            // Plain-text fallback
            isValid = currentPassword === dbPassword
        }
    } catch {
        return { success: false, error: 'ไม่สามารถตรวจสอบรหัสผ่านปัจจุบันได้' }
    }

    if (!isValid) {
        return { success: false, error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }
    }

    // 3. Hash and save new password
    const hashedPassword = await argon2.hash(newPassword)
    const { error: updateError } = await supabase
        .from('Master_Users')
        .update({ Password: hashedPassword })
        .eq('Username', session.userId)

    if (updateError) {
        return { success: false, error: 'ไม่สามารถบันทึกรหัสผ่านได้: ' + updateError.message }
    }

    // 4. Log activity
    await logActivity({
        module: 'Settings',
        action_type: 'UPDATE',
        user_id: session.userId,
        username: user.Username,
        details: { action: 'CHANGE_PASSWORD' }
    })

    revalidatePath('/settings/security')
    return { success: true }
}
