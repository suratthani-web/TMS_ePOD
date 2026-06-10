"use server"

import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/supabase/logs";
import { revalidatePath } from "next/cache";

export type JobStatus = 
  | 'Draft' 
  | 'Requested' 
  | 'New' 
  | 'Pending'
  | 'Assigned' 
  | 'Confirmed'
  | 'Accepted'
  | 'Picked Up' 
  | 'En Route'
  | 'En-Route'
  | 'In Transit' 
  | 'In Progress'
  | 'Arrived'
  | 'Arrived Pickup'
  | 'Arrived Dropoff'
  | 'Completed' 
  | 'Complete'
  | 'Delivered'
  | 'Verified' 
  | 'Rejected' 
  | 'Billed' 
  | 'Paid' 
  | 'Cancelled'
  | 'Failed'
  | 'SOS';

/**
 * Definition of allowed transitions for the Job Status State Machine.
 * Key is the current status, value is an array of statuses it can transition TO.
 */
const ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  'Draft': ['New', 'Assigned', 'Cancelled'],
  'Requested': ['New', 'Assigned', 'Cancelled'],
  'New': ['Pending', 'Assigned', 'Confirmed', 'Accepted', 'Picked Up', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS'],
  'Pending': ['New', 'Assigned', 'Confirmed', 'Accepted', 'Picked Up', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS'],
  'Assigned': ['Accepted', 'Picked Up', 'In Transit', 'In Progress', 'Completed', 'New', 'Cancelled', 'SOS'],
  'Confirmed': ['Assigned', 'Accepted', 'Picked Up', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS'],
  'Accepted': ['Arrived Pickup', 'Arrived', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS'],
  'Picked Up': ['In Transit', 'In Progress', 'Arrived', 'Arrived Dropoff', 'Completed', 'Delivered', 'Cancelled', 'SOS'],
  'En Route': ['Picked Up', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS'],
  'En-Route': ['Picked Up', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS'],
  'In Transit': ['Arrived', 'Arrived Pickup', 'Arrived Dropoff', 'In Progress', 'Completed', 'Delivered', 'Cancelled', 'SOS'],
  'In Progress': ['Arrived', 'Completed', 'Delivered', 'Cancelled', 'SOS'],
  'Arrived': ['In Transit', 'Completed', 'Delivered', 'Cancelled', 'SOS'],
  'Arrived Pickup': ['Picked Up', 'In Transit', 'Completed', 'Cancelled', 'SOS'],
  'Arrived Dropoff': ['Completed', 'Delivered', 'Cancelled', 'SOS'],
  'Completed': ['Verified', 'Rejected', 'Billed', 'Cancelled'],
  'Complete': ['Verified', 'Rejected', 'Billed', 'Cancelled'],
  'Delivered': ['Verified', 'Rejected', 'Billed', 'Cancelled'],
  'Verified': ['Billed', 'Paid', 'Cancelled'],
  'Rejected': ['Completed', 'Delivered', 'Cancelled'], // Can go back if driver re-uploads or admin fixes
  'Billed': ['Paid', 'Cancelled'],
  'Paid': [], // Final state
  'Cancelled': [], // Final state
  'Failed': ['Cancelled'],
  'SOS': ['In Transit', 'In Progress', 'Completed', 'Cancelled']
};

export interface StatusTransitionResult {
  success: boolean;
  message?: string;
  previousStatus?: JobStatus;
  newStatus?: JobStatus;
}

export async function transitionJobStatus(
  jobId: string, 
  nextStatus: JobStatus, 
  metadata?: {
    reason?: string;
    userId?: string;
    username?: string;
    notes?: string;
    force?: boolean; // Bypass transition check if absolutely necessary (use with caution)
  }
): Promise<StatusTransitionResult> {
  try {
    const supabase = createAdminClient();

    // 1. Get current status
    const { data: job, error: fetchError } = await supabase
      .from('Jobs_Main')
      .select('Job_Status')
      .eq('Job_ID', jobId)
      .single();

    if (fetchError || !job) {
      return { success: false, message: `Job ${jobId} not found.` };
    }

    const currentStatus = (job.Job_Status as JobStatus) || 'New';

    if (currentStatus === nextStatus) {
      return {
        success: true,
        previousStatus: currentStatus,
        newStatus: nextStatus
      };
    }

    // 2. Validate transition legality
    if (!metadata?.force) {
      const allowed = ALLOWED_TRANSITIONS[currentStatus];
      if (!allowed || !allowed.includes(nextStatus)) {
        return { 
          success: false, 
          message: `Illegal transition: Cannot move from ${currentStatus} to ${nextStatus}.`,
          previousStatus: currentStatus
        };
      }
    }

    // 3. DATA QUALITY GUARDS: Enforce mandatory fields before allowing transition
    if (!metadata?.force) {
        const { data: fullJob } = await supabase
            .from('Jobs_Main')
            .select('Customer_ID, Branch_ID, Route_Name, Price_Cust_Total, Photo_Proof_Url, Signature_Url, Driver_ID, Vehicle_Plate')
            .eq('Job_ID', jobId)
            .single();

        if (fullJob) {
            // Guard: Progression beyond Requested/Draft requires basic identity
            if (['Assigned', 'Picked Up', 'In Transit'].includes(nextStatus)) {
                if (!fullJob.Customer_ID) return { success: false, message: "Missing Customer_ID" };
                if (!fullJob.Branch_ID) return { success: false, message: "Missing Branch_ID" };
            }

            // Guard: Cannot Assign without Driver/Vehicle
            if (nextStatus === 'Assigned') {
                if (!fullJob.Driver_ID) return { success: false, message: "Cannot assign without Driver_ID" };
            }

            // Guard: Cannot close delivery without proof (unless explicitly allowed)
            if (['Completed', 'Complete', 'Delivered'].includes(nextStatus)) {
                if (!fullJob.Photo_Proof_Url && !fullJob.Signature_Url) {
                    return { success: false, message: "Missing POD proof (Photo or Signature)" };
                }
            }

            // Guard: Cannot Bill without Price
            if (nextStatus === 'Billed') {
                if (!fullJob.Price_Cust_Total || Number(fullJob.Price_Cust_Total) <= 0) {
                    return { success: false, message: "Cannot bill job with zero price" };
                }
            }
        }
    }

    // 4. Perform update
    const { error: updateError } = await supabase
      .from('Jobs_Main')
      .update({ 
        Job_Status: nextStatus
      })
      .eq('Job_ID', jobId);

    if (updateError) {
      throw updateError;
    }

    // 5. Log the transition

    await logActivity({
      module: 'Jobs',
      action_type: 'UPDATE',
      target_id: jobId,
      details: {
        action: 'STATUS_TRANSITION',
        from: currentStatus,
        to: nextStatus,
        reason: metadata?.reason,
        notes: metadata?.notes,
        forced: metadata?.force || false
      },
      user_id: metadata?.userId,
      username: metadata?.username
    });

    // 5. Revalidate relevant paths
    revalidatePath('/planning');
    revalidatePath('/jobs/history');
    revalidatePath(`/jobs/${jobId}`);
    
    return { 
      success: true, 
      previousStatus: currentStatus, 
      newStatus: nextStatus 
    };

  } catch (error: any) {
    console.error(`[JobStatusMachine] Error transitioning ${jobId}:`, error);
    const msg = error instanceof Error 
      ? error.message 
      : (error && typeof error === 'object' && 'message' in error)
        ? String(error.message)
        : "Unknown error occurred";
    return { 
      success: false, 
      message: msg
    };
  }
}

export async function transitionBulkJobStatus(
  jobIds: string[],
  nextStatus: JobStatus,
  metadata?: {
    reason?: string;
    userId?: string;
    username?: string;
    notes?: string;
  }
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    let count = 0;
    const errors: string[] = [];

    for (const jobId of jobIds) {
      const result = await transitionJobStatus(jobId, nextStatus, metadata);
      if (result.success) {
        count += 1;
      } else {
        errors.push(`${jobId}: ${result.message || 'Transition failed'}`);
      }
    }

    if (errors.length > 0) {
      return { success: false, count, error: errors.join('; ') };
    }

    return { success: true, count };
  } catch (error) {
    console.error(`[JobStatusMachine] Bulk Error:`, error);
    return { 
      success: false, 
      count: 0, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

export async function isTransitionAllowed(current: JobStatus, next: JobStatus): Promise<boolean> {
  return ALLOWED_TRANSITIONS[current]?.includes(next) || false;
}
