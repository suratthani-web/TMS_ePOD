import { createAdminClient } from '@/utils/supabase/server'

/**
 * Validates an API Key against the Master_API_Keys table.
 * Returns the client context if valid, or throws an error.
 */
export async function validateApiKey(apiKey: string) {
    if (!apiKey) {
        throw new Error('API Key is required')
    }

    // Strip 'Bearer ' if present
    const cleanKey = apiKey.startsWith('Bearer ') ? apiKey.substring(7) : apiKey

    const supabase = createAdminClient()
    
    const { data, error } = await supabase
        .from('Master_API_Keys')
        .select('client_name, is_active, permissions')
        .eq('api_key', cleanKey)
        .single()

    if (error || !data) {
        console.warn(`Invalid API Key attempt: ${cleanKey.substring(0, 10)}...`)
        throw new Error('Unauthorized: Invalid API Key')
    }

    if (!data.is_active) {
        throw new Error('Unauthorized: API Key is inactive')
    }

    // Update last used timestamp (Fire and forget)
    supabase.from('Master_API_Keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('api_key', cleanKey)
        .then()

    return {
        client_name: data.client_name,
        permissions: data.permissions as string[] || []
    }
}
