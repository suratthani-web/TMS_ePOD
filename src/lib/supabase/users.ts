"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'

export type UserProfile = {
  Username: string
  First_Name: string | null
  Last_Name: string | null
  Email: string | null
  Role: string | null
  Branch_ID: string | null
  Name?: string | null
  Avatar_Url?: string | null
  Line_User_ID?: string | null
}

// Get current user profile
export async function getUserProfile() {
  try {
    const session = await getSession()
    
    if (!session || !session.userId) {
        return null
    }

    const supabase = createAdminClient()

    const { data: rawData, error } = await supabase
      .from('Master_Users')
      .select('*')
      .eq('Username', session.userId)
      .single()
    
    if (error) {
      return null
    }

    const data = rawData as UserProfile
    
    // Auto-fill First_Name/Last_Name from Name if they are empty
    if ((!data.First_Name || !data.Last_Name) && data.Name) {
        const parts = data.Name.trim().split(/\s+/)
        if (!data.First_Name) data.First_Name = parts[0] || ""
        if (!data.Last_Name) data.Last_Name = parts.slice(1).join(" ") || ""
    }

    return data
  } catch {
    return null
  }
}

// Update user profile
export async function updateUserProfile(data: Partial<UserProfile>) {
  try {
    const session = await getSession()
    if (!session || !session.userId) return { success: false, error: 'Not authenticated' }

    const supabase = createAdminClient()

    const updatePayload: Record<string, unknown> = {
        First_Name: data.First_Name,
        Last_Name: data.Last_Name,
        Email: data.Email,
    }

    // Sync Name column if First_Name and Last_Name are provided
    if (data.First_Name || data.Last_Name) {
        updatePayload.Name = `${data.First_Name || ''} ${data.Last_Name || ''}`.trim()
    }

    const { error, count } = await supabase
      .from('Master_Users')
      .update(updatePayload, { count: 'exact' })
      .eq('Username', session.userId)

    if (error) {
      return { success: false, error: error.message }
    }

    if (count === 0) {
      return { success: false, error: 'User record not found or no changes applied' }
    }

    revalidatePath('/settings/profile')
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to update profile'
    return { success: false, error: message }
  }
}
