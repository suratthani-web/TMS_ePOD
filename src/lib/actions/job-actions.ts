"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { logActivity } from '@/lib/supabase/logs'
import { revalidatePath } from 'next/cache'
import { isAdmin } from '@/lib/permissions'
import { getSession } from '@/lib/session'

export async function verifyJob(
  jobId: string, 
  status: 'Verified' | 'Rejected', 
  note?: string
) {
  try {
    const session = await getSession()

    if (!session) {
      throw new Error('Unauthorized: No active session found')
    }

    const isAdminUser = await isAdmin()
    if (!isAdminUser) {
        throw new Error('Unauthorized: Admin privilege required for verification')
    }

    const supabase = createAdminClient()

    // Perform verification update using PascalCase column names matching the DB schema
    const { error } = await supabase
      .from('Jobs_Main')
      .update({
        Verification_Status: status,
        Verification_Note: note || null,
        Verified_By: session.username || session.userId,
        Verified_At: new Date().toISOString()
      })
      .eq('Job_ID', jobId)

    if (error) {
        // Detailed error message if column is still missing or RLS blocks it
        console.error('[DB ERROR] Verification failed:', error)
        if (error.code === '42703') {
            throw new Error('Database schema mismatch: Verification columns might be missing. Please ensure SQL migration is applied.')
        }
        throw new Error(`Database error: ${error.message}`)
    }

    // Log the verification event
    await logActivity({
      module: 'Jobs',
      action_type: (status === 'Verified' ? 'APPROVE' : 'REJECT') as any,
      target_id: jobId,
      details: { status, note, verified_by: session.username }
    })

    revalidatePath('/jobs/history')
    revalidatePath('/planning')
    
    return { success: true }
  } catch (err) {
    const error = err as Error
    console.error('Error in verifyJob:', error.message)
    return { success: false, error: error.message }
  }
}
