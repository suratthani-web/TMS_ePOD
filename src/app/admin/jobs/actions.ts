'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { getUserBranchId, isSuperAdmin } from '@/lib/permissions'

import { type JobStatus, transitionJobStatus } from "@/services/job-status-machine"

const JOB_STATUSES: readonly JobStatus[] = [
  'Draft',
  'Requested',
  'New',
  'Pending',
  'Assigned',
  'Confirmed',
  'Picked Up',
  'En Route',
  'En-Route',
  'In Transit',
  'In Progress',
  'Arrived',
  'Arrived Pickup',
  'Arrived Dropoff',
  'Completed',
  'Complete',
  'Delivered',
  'Verified',
  'Rejected',
  'Billed',
  'Paid',
  'Cancelled',
  'Failed',
  'SOS'
]

function isJobStatus(status: string): status is JobStatus {
  return JOB_STATUSES.includes(status as JobStatus)
}

export async function adminUpdateJobStatus(jobId: string, newStatus: string, note?: string) {
  if (!isJobStatus(newStatus)) {
      return { success: false, message: `Invalid job status: ${newStatus}` }
  }

  const isAdmin = await isSuperAdmin()
  const supabase = isAdmin ? await createAdminClient() : await createClient()
  const branchId = await getUserBranchId()

  // 1. Verify Permission (Check if job belongs to admin's branch)
  if (!isAdmin && branchId) {
      const { data: job } = await supabase
          .from('Jobs_Main')
          .select('Branch_ID')
          .eq('Job_ID', jobId)
          .single()
      
      if (!job || (job.Branch_ID !== branchId && branchId !== 'All')) {
          return { success: false, message: 'Unauthorized: Job belongs to another branch' }
      }
  }

  // 2. Transition Status using Machine
  const transition = await transitionJobStatus(jobId, newStatus, {
      reason: 'Admin manual status update',
      notes: note
  })

  if (!transition.success) {
      return { success: false, message: `Status Machine Error: ${transition.message}` }
  }

  // 3. Handle additional timestamp updates if needed
  const updateData: Record<string, unknown> = {}
  const now = new Date()
  const timeString = now.toTimeString().split(' ')[0] 
  const dateString = now.toISOString().split('T')[0]  
  
  if (newStatus === 'Picked Up') {
      updateData.Actual_Pickup_Time = timeString
      updateData.Pickup_Date = dateString
  }
  
  if (newStatus === 'Delivered' || newStatus === 'Completed') {
      updateData.Actual_Delivery_Time = timeString
      updateData.Delivery_Date = dateString
  }

  if (Object.keys(updateData).length > 0) {
      await supabase.from('Jobs_Main').update(updateData).eq('Job_ID', jobId)
  }

  revalidatePath(`/admin/jobs/${jobId}`)
  revalidatePath('/planning')
  
  return { success: true, message: 'Job status updated successfully' }
}

export async function adminOverrideSensorVerification(jobId: string, status: 'Verified' | 'Suspect', notes: string) {
  try {
    const isAdmin = await isSuperAdmin()
    const supabase = isAdmin ? await createAdminClient() : await createClient()

    const { error } = await supabase
      .from('Jobs_Main')
      .update({
        Sensor_Verified: status,
        Notes: notes
      })
      .eq('Job_ID', jobId)

    if (error) {
      return { success: false, message: `Failed to override status: ${error.message}` }
    }

    revalidatePath(`/admin/jobs/${jobId}`)
    return { success: true, message: 'Sensor status updated successfully' }
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Internal Server Error' }
  }
}
