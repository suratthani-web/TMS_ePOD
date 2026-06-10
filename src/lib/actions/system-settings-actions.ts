'use server'

import { createAdminClient } from "@/utils/supabase/server"
import { requireAdmin } from "@/services/permission-guards"
import { revalidatePath } from "next/cache"

/**
 * Get a system setting using Admin Client to bypass RLS
 */
export async function getSystemSetting<T>(key: string, defaultValue: T): Promise<T> {
    try {
        const supabase = createAdminClient()
        const { data, error } = await supabase
            .from('System_Settings')
            .select('value')
            .eq('key', key)
            .maybeSingle()

        if (error || !data || !data.value) {
            return defaultValue
        }

        return typeof data.value === 'string' ? JSON.parse(data.value) : data.value
    } catch (err) {
        console.error(`Exception fetching setting [${key}]:`, err)
        return defaultValue
    }
}

/**
 * Save a system setting using Admin Client to bypass RLS
 */
export async function saveSystemSetting(key: string, value: unknown, description: string = '') {
    try {
        await requireAdmin()
        const supabase = createAdminClient()
        
        const { error } = await supabase
            .from('System_Settings')
            .upsert({ 
                key, 
                value: JSON.stringify(value),
                description
            }, { onConflict: 'key' })

        if (error) {
            console.error(`Error saving setting [${key}]:`, error)
            return { success: false, error: error.message }
        }

        revalidatePath('/settings')
        return { success: true }
    } catch (err: unknown) {
        console.error(`Exception saving setting [${key}]:`, err)
        return { success: false, error: err instanceof Error ? err.message : 'Internal Server Error' }
    }
}
