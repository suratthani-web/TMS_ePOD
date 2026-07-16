"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { logActivity } from '@/lib/supabase/logs'
import { revalidatePath } from 'next/cache'
import { isAdmin } from '@/lib/permissions'
import { getSession } from '@/lib/session'

import { transitionJobStatus } from "@/services/job-status-machine"
import { requireAdmin } from "@/services/permission-guards"
import { appendJobToMaster } from "@/lib/actions/master-sheet-sync"

export async function verifyJob(
  jobId: string, 
  status: 'Verified' | 'Rejected', 
  note?: string
) {
  try {
    await requireAdmin()
    const session = await getSession()
    const supabase = createAdminClient()

    // 1. Transition main Job_Status
    const transition = await transitionJobStatus(jobId, status, {
        reason: `Admin Verification: ${status}`,
        notes: note,
        force: true
    })

    if (!transition.success) {
        throw new Error(transition.message)
    }

    // 2. Perform verification detail update
    const { error } = await supabase
      .from('Jobs_Main')
      .update({
        Verification_Status: status,
        Verification_Note: note || null,
        Verified_By: session?.username || session?.userId,
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
      action_type: status === 'Verified' ? 'APPROVE' : 'REJECT',
      target_id: jobId,
      details: { status, note, verified_by: session?.username || session?.userId || 'system' }
    })

    revalidatePath('/jobs/history')
    revalidatePath('/planning')
    revalidatePath('/pod')

    // Mirror into the MASTER Google Sheet on verification. Dedup is handled by
    // appendJobToMaster itself (skips when the Job_ID is already in the ledger),
    // so we must NOT gate on Job_Status here: a job can be Job_Status='Verified'
    // yet never written to the sheet (e.g. an earlier write failed, or the
    // status was set via a bulk/override path). Best-effort — never block
    // verification, but return the outcome so a failed ledger write isn't silent.
    let sheetSync: { success: boolean; error?: string; skipped?: boolean } | undefined
    if (status === 'Verified') {
      sheetSync = await appendJobToMaster(jobId)
    }

    return { success: true, sheetSync }
  } catch (err) {
    const error = err as Error
    console.error('Error in verifyJob:', error.message)
    return { success: false, error: error.message }
  }
}
