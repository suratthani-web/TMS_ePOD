"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { getSession } from "@/lib/session"
import argon2 from "argon2"
import { logActivity } from "@/lib/supabase/logs"

import { StandardRole } from "@/types/role"

export interface UserData {
    Username: string;
    Password?: string;
    Name: string;
    Branch_ID: string;
    Role_ID?: number;
    Role: StandardRole; 
    Active_Status: string;
    Customer_ID?: string | null;
    Permissions?: string[];
}

import { getUserBranchId, isSuperAdmin, isAdmin as checkIsAdmin } from "@/lib/permissions"
import { requireAdmin } from "@/services/permission-guards"

export async function getUsers(providedBranchId?: string) {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await checkIsAdmin()
    const { createAdminClient } = await import("@/utils/supabase/server")
    const supabase = (isSuper || isAdminUser) ? createAdminClient() : await createClient()
    
    let query = supabase
        .from("Master_Users")
        .select(`
            *,
            Master_Customers ( Customer_Name )
        `)
    
    // Filter by Branch
    const branchId = await getUserBranchId()
    
    // STRICT ISOLATION
    if (!isSuper) {
        if (branchId && branchId !== 'All') {
            query = query.eq('Branch_ID', branchId)
        } else {
            return []
        }
    } else if (providedBranchId && providedBranchId !== 'All') {
        query = query.eq('Branch_ID', providedBranchId)
    }

    const { data, error } = await query.order("Username")

    if (error) {
        return []
    }

    return data
}

const ROLE_MAP: Record<string, number> = {
    'Super Admin': 1,
    'Admin': 2,
    'Dispatcher': 3,
    'Dispatcher (Dispatch)': 3,
    'Accountant': 4,
    'Staff': 5,
    'Driver': 6,
    'Customer': 7
}

export async function createUser(user: UserData) {
    await requireAdmin()
    const { createAdminClient } = await import("@/utils/supabase/server")
    const supabase = createAdminClient()
    
    // Check if username exists
    const { data: existing } = await supabase
        .from("Master_Users")
        .select("Username")
        .eq("Username", user.Username)
        .single()
        
    if (existing) {
        return { success: false, error: "ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว" }
    }

    const session = await getSession()
    if (!session) return { success: false, error: "Not authenticated" }

    if (user.Role === "Super Admin" && session.roleId !== 1) {
        return { success: false, error: "คุณไม่มีสิทธิ์สร้างผู้ใช้งานระดับ Super Admin" }
    }

    const hashedPassword = await argon2.hash(user.Password || "123456")

    const roleId = ROLE_MAP[user.Role] || 5 // Default to Staff

    const { error } = await supabase
        .from("Master_Users")
        .insert([{
            Username: user.Username,
            Password: hashedPassword,
            Name: user.Name,
            Branch_ID: user.Branch_ID,
            Role: user.Role,
            Role_ID: roleId,
            Customer_ID: user.Customer_ID || null,
            Permissions: user.Permissions || {},
            Active_Status: 'Active'
        }])

    if (error) {
        return { success: false, error: error.message }
    }

    revalidatePath("/settings/users")
    return { success: true }
}

export async function updateUser(username: string, updates: Partial<UserData>) {
    await requireAdmin()
    const { createAdminClient } = await import("@/utils/supabase/server")
    const supabase = createAdminClient()
    
    const session = await getSession()
    if (!session) return { success: false, error: "Not authenticated" }

    // Check target user's current role
    const { data: targetUser } = await supabase
        .from("Master_Users")
        .select("Role")
        .eq("Username", username)
        .single()

    if (targetUser?.Role === "Super Admin" && session.roleId !== 1) {
        return { success: false, error: "คุณไม่มีสิทธิ์แก้ไขข้อมูลของ Super Admin" }
    }

    if (targetUser?.Role === "Admin" && session.roleId !== 1) {
        return { success: false, error: "คุณไม่มีสิทธิ์แก้ไขข้อมูลของ Admin" }
    }

    const updatePayload: Record<string, unknown> = {
        Name: updates.Name,
        Branch_ID: updates.Branch_ID,
        Active_Status: updates.Active_Status,
        Customer_ID: updates.Customer_ID,
        Permissions: updates.Permissions,
        Role: updates.Role
    }

    if (updates.Role) {
        updatePayload.Role_ID = ROLE_MAP[updates.Role] || 5
    }

    if (updates.Password) {
        updatePayload.Password = await argon2.hash(updates.Password)
        
        // Log password change for security
        await logActivity({
            module: 'Settings',
            action_type: 'UPDATE',
            target_id: username,
            details: { 
                action: 'PASSWORD_CHANGE',
                updated_by: session.username,
                target_user: username
            }
        })
    }

    const { error } = await supabase
        .from("Master_Users")
        .update(updatePayload)
        .eq("Username", username)

    if (error) {
        return { success: false, error: error.message }
    }

    revalidatePath("/settings/users")
    return { success: true }
}

export async function getCurrentUserRole() {
    const session = await getSession()
    if (!session) return { roleId: 3, username: null } // Default to Staff
    return {
        roleId: session.roleId,
        username: session.username
    }
}

export async function deleteUser(username: string) {
    await requireAdmin()
    const { createAdminClient } = await import("@/utils/supabase/server")
    const supabase = createAdminClient()
    
    const session = await getSession()
    if (!session) return { success: false, error: "Not authenticated" }

    // Check target user's current role
    const { data: targetUser } = await supabase
        .from("Master_Users")
        .select("Role")
        .eq("Username", username)
        .single()

    if (targetUser?.Role === "Super Admin" && session.roleId !== 1) {
        return { success: false, error: "คุณไม่มีสิทธิ์ลบข้อมูลของ Super Admin" }
    }

    if (targetUser?.Role === "Admin" && session.roleId !== 1) {
        return { success: false, error: "คุณไม่มีสิทธิ์ลบข้อมูลของ Admin" }
    }

    const { error } = await supabase
        .from("Master_Users")
        .delete()
        .eq("Username", username)

    if (error) {
        return { success: false, error: error.message }
    }

    revalidatePath("/settings/users")
    return { success: true }
}

export async function createBulkUsers(users: Record<string, unknown>[]) {
    await requireAdmin()
    const isSuper = await isSuperAdmin()
    const isAdminUser = await checkIsAdmin()
    const { createAdminClient } = await import("@/utils/supabase/server")
    const supabase = (isSuper || isAdminUser) ? createAdminClient() : await createClient()
    const session = await getSession()
    
    if (!session) return { success: false, message: "Not authenticated" }
    
    // Permission check:
    // - Super Admin (1): Can create anyone
    // - Admin (2): Can create Staff/Drivers, cannot create Super Admin
    // - Staff/Manager (3): Can create Staff/Drivers? -> Matching createUser logic which allows creation but restricts Super Admin. 
    //   However, usually Role 3 shouldn't create Users. But since they have access to the page, we allow it but restricted.
    
    // Prevent creating Super Admin if not Super Admin
    const hasSuperAdminInList = users.some(u => 
        String(u.Role).toLowerCase() === 'super admin' || 
        String(u.Role).toLowerCase() === 'superadmin' ||
        String(u.role).toLowerCase() === 'super admin'
    )

    if (hasSuperAdminInList && session.roleId !== 1) {
         return { success: false, message: "คุณไม่มีสิทธิ์สร้างผู้ใช้งานระดับ Super Admin" }
    }

    // Optional: Prevent creating Admin if not Super Admin (Logic from deleteUser/updateUser implies strictness)
    // For now, we allow it but maybe warn? Or just stick to the checks we have.
    // The previous check was (session.roleId > 2), we remove it to allow Role 3.

    // Normalize keys
    const normalizeData = (row: Record<string, unknown>) => {
        const normalized: Record<string, unknown> = {}
        const getValue = (keys: string[]) => {
            const rowKeys = Object.keys(row)
            for (const key of keys) {
                const foundKey = rowKeys.find(k => k.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase().replace(/\s+/g, '_'))
                if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
                    return row[foundKey]
                }
            }
            return undefined
        }

        normalized.Username = getValue(['username', 'user', 'ชื่อผู้ใช้'])
        normalized.Name = getValue(['name', 'fullname', 'ชื่อ', 'ชื่อ-นามสกุล', 'ชื่อนามสกุล'])
        normalized.Branch_ID = getValue(['branch_id', 'branch', 'สาขา', 'รหัสสาขา'])
        normalized.Role = getValue(['role', 'position', 'ตำแหน่ง', 'บทบาท']) || 'Staff'
        normalized.Password = getValue(['password', 'pass', 'รหัสผ่าน']) || '123456'
        normalized.Active_Status = getValue(['active_status', 'status', 'สถานะ']) || 'Active'
        normalized.Customer_ID = getValue(['customer_id', 'client_id', 'รหัสลูกค้า'])
        
        return normalized
    }

    const cleanData = users.map(u => normalizeData(u)).filter(u => u.Username && u.Name) // Filter invalid

    if (cleanData.length === 0) {
        return { success: false, message: "ไม่พบข้อมูลที่ถูกต้อง (ต้องมี Username และ Name)" }
    }

    // Deduplicate input
    const uniqueData = Array.from(new Map(cleanData.map(item => [item.Username, item])).values())

    // Hash passwords efficiently
    const hashedData = await Promise.all(uniqueData.map(async (u) => ({
        Username: u.Username,
        Password: await argon2.hash(String(u.Password)),
        Name: u.Name,
        Branch_ID: u.Branch_ID || 'HQ', 
        Role: u.Role,
        Role_ID: ROLE_MAP[String(u.Role)] || 5,
        Active_Status: u.Active_Status,
        Customer_ID: u.Customer_ID || null
    })))

    // Use upsert or insert? creating users usually shouldn't overwrite existing ones easily to avoid password reset
    // But for bulk import, maybe skip existing?
    
    // Let's use insert with ignoreDuplicates? Supabase js insert doesn't support ignoreDuplicates on some adapters easily without onConflict
    // We will use upsert but preserve password if exists? No, that's too complex for bulk.
    // Let's iterate and check or use onConflict DO NOTHING (ignoreDuplicates: true)
    
    const { error } = await supabase
        .from('Master_Users')
        .upsert(hashedData, { 
            onConflict: 'Username', 
            ignoreDuplicates: true 
        })

    if (error) {
        return { success: false, message: `Failed to import: ${error.message}` }
    }

    revalidatePath("/settings/users")
    return { success: true, message: `นำเข้าสำเร็จ ${uniqueData.length} รายการ (ข้ามรายการที่ซ้ำ)` }
}
