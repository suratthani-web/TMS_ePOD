'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Legacy compatibility: Get role permissions in { success, data } format
 */
export async function getRolePermissions() {
    try {
        const supabase = createAdminClient()
        const { data, error } = await supabase
            .from('role_permissions')
            .select('*')
        
        if (error) throw error
        
        // Map fields for legacy compatibility if needed
        const legacyData = data?.map((item: any) => ({
            id: item.id,
            Role: item.role_name,
            Permissions: item.allowed_menus
        }))

        return { success: true, data: legacyData || [] }
    } catch (error: any) {
        console.error("Error fetching role permissions:", error)
        return { success: false, error: error.message }
    }
}

/**
 * Legacy compatibility: Update role permissions
 */
export async function updateRolePermissions(role: string, permissions: any) {
    try {
        const supabase = createAdminClient()
        
        // Standardize to Allowed_Menus (Array of strings)
        const allowedMenus = Array.isArray(permissions) 
            ? permissions 
            : Object.keys(permissions).filter(key => permissions[key] === true)

        const { error } = await supabase
            .from('role_permissions')
            .upsert({ 
                role_name: role, 
                allowed_menus: allowedMenus,
                updated_at: new Date().toISOString()
            }, { onConflict: 'role_name' })

        if (error) throw error
        
        revalidatePath('/')
        return { success: true }
    } catch (error: any) {
        console.error("Error updating role permissions:", error)
        return { success: false, error: error.message }
    }
}

/**
 * Modern Module-Based: Get all permissions
 */
export async function getAllRolePermissions() {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('role_permissions')
        .select('*')
    
    if (error) {
        console.error("Error fetching permissions:", error)
        return []
    }
    
    return data || []
}

/**
 * Modern Module-Based: Save permissions
 */
export async function saveRolePermissions(roleName: string, allowedMenus: string[]) {
    try {
        const supabase = createAdminClient()
        
        // Log for debugging (will show in server console)
        console.log(`Attempting to save permissions for role: ${roleName}`, allowedMenus)

        const { data, error } = await supabase
            .from('role_permissions')
            .upsert({ 
                role_name: roleName, 
                allowed_menus: allowedMenus || [],
                updated_at: new Date().toISOString()
            }, { 
                onConflict: 'role_name',
                ignoreDuplicates: false 
            })
            .select()

        if (error) {
            console.error("Supabase Error saving permissions:", error)
            return { 
                success: false, 
                message: `Supabase Error: ${error.message} (${error.code})`,
                details: error 
            }
        }

        console.log("Save successful:", data)
        revalidatePath('/')
        return { success: true }
    } catch (err: any) {
        console.error("Critical Exception saving permissions:", err)
        return { 
            success: false, 
            message: `Exception: ${err.message || 'Unknown error'}` 
        }
    }
}

/**
 * Used by Sidebar to fetch current user's allowed menus
 */
export async function getPermissionsByRole(roleName: string) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('role_permissions')
        .select('allowed_menus')
        .eq('role_name', roleName)
        .maybeSingle()
    
    if (error || !data) return null
    return data.allowed_menus as string[]
}

/**
 * Get current user's effective permissions (Combined Role + Individual Overrides)
 */
export async function getEffectivePermissions() {
    try {
        const { getSession } = await import("@/lib/session")
        const session = await getSession()
        if (!session) return []

        // Super Admin Bypass
        if (session.roleId === 1) return null

        const supabase = createAdminClient()
        const { data: profile } = await supabase
            .from('Master_Users')
            .select('Role, Permissions')
            .eq('Username', session.userId)
            .maybeSingle()

        if (!profile) return []

        // 1. Individual Overrides
        if (profile.Permissions && Array.isArray(profile.Permissions) && profile.Permissions.length > 0) {
            return profile.Permissions as string[]
        }

        // 2. Role Fallback
        if (profile.Role) {
            return await getPermissionsByRole(profile.Role) || []
        }

        return []
    } catch (error) {
        console.error("Error fetching effective permissions:", error)
        return []
    }
}
