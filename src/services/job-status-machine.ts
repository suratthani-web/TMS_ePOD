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
  'Draft': ['New', 'Assigned', 'Cancelled', 'Verified'],
  'Requested': ['New', 'Assigned', 'Cancelled', 'Verified'],
  'New': ['Pending', 'Assigned', 'Confirmed', 'Accepted', 'Picked Up', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS', 'Verified'],
  'Pending': ['New', 'Assigned', 'Confirmed', 'Accepted', 'Picked Up', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS', 'Verified'],
  'Assigned': ['Accepted', 'Picked Up', 'In Transit', 'In Progress', 'Completed', 'New', 'Cancelled', 'SOS', 'Verified'],
  'Confirmed': ['Assigned', 'Accepted', 'Picked Up', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS', 'Verified'],
  'Accepted': ['Arrived Pickup', 'Arrived', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS', 'Verified'],
  'Picked Up': ['In Transit', 'In Progress', 'Arrived', 'Arrived Dropoff', 'Completed', 'Delivered', 'Cancelled', 'SOS', 'Verified'],
  'En Route': ['Picked Up', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS', 'Verified'],
  'En-Route': ['Picked Up', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS', 'Verified'],
  'In Transit': ['Arrived', 'Arrived Pickup', 'Arrived Dropoff', 'In Progress', 'Completed', 'Delivered', 'Cancelled', 'SOS', 'Verified'],
  'In Progress': ['Arrived', 'Completed', 'Delivered', 'Cancelled', 'SOS', 'Verified'],
  'Arrived': ['In Transit', 'Completed', 'Delivered', 'Cancelled', 'SOS', 'Verified'],
  'Arrived Pickup': ['Picked Up', 'In Transit', 'Completed', 'Cancelled', 'SOS', 'Verified'],
  'Arrived Dropoff': ['Completed', 'Delivered', 'Cancelled', 'SOS', 'Verified'],
  'Completed': ['Verified', 'Rejected', 'Billed', 'Cancelled'],
  'Complete': ['Verified', 'Rejected', 'Billed', 'Cancelled'],
  'Delivered': ['Verified', 'Rejected', 'Billed', 'Cancelled'],
  'Verified': ['Billed', 'Paid', 'Cancelled', 'Completed', 'Delivered', 'Rejected'],
  'Rejected': ['Completed', 'Delivered', 'Cancelled'], // Can go back if driver re-uploads or admin fixes
  'Billed': ['Paid', 'Cancelled', 'Verified', 'Completed', 'Delivered', 'Rejected'],
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
 
    // Trigger LINE notification if job is completed or delivered
    if (['Completed', 'Complete', 'Delivered'].includes(nextStatus)) {
      sendDeliveryCompletionNotification(jobId).catch(err => {
        console.error('[JobStatusMachine] Notification trigger failed:', err);
      });
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
    revalidatePath('/pod');
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

/**
 * Helper to fetch job details and push a completion LINE notification
 * to Super Admins, Admins, and the bound Customer.
 */
async function sendDeliveryCompletionNotification(jobId: string) {
  try {
    const supabase = createAdminClient();
    
    // Fetch job details
    const { data: job, error: jobErr } = await supabase
      .from('Jobs_Main')
      .select('Job_ID, Customer_Name, Route_Name, Driver_Name, Vehicle_Plate, Photo_Proof_Url, Signature_Url, Customer_ID, Actual_Delivery_Time, Delivery_Date')
      .eq('Job_ID', jobId)
      .single();
      
    if (jobErr || !job) {
      console.error(`[Notification] Job ${jobId} not found for completion notification.`);
      return;
    }
    
    // Format delivery time
    let deliveryTime = 'ไม่ระบุ';
    if (job.Actual_Delivery_Time) {
      try {
        const timePart = job.Actual_Delivery_Time.includes('T') 
          ? job.Actual_Delivery_Time.split('T')[1].slice(0, 5) 
          : job.Actual_Delivery_Time.slice(0, 5); // "HH:mm"
          
        const datePart = job.Actual_Delivery_Time.includes('T')
          ? job.Actual_Delivery_Time.split('T')[0]
          : (job.Delivery_Date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }));
          
        const [year, month, day] = datePart.split('-');
        const [hour, minute] = timePart.split(':');
        
        if (year && month && day && hour && minute) {
          const thaiMonths = [
            'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
            'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
          ];
          const monthIndex = parseInt(month, 10) - 1;
          const thaiYear = parseInt(year, 10) + 543;
          deliveryTime = `${parseInt(day, 10)} ${thaiMonths[monthIndex]} ${thaiYear} ${hour}:${minute} น.`;
        } else {
          deliveryTime = job.Actual_Delivery_Time + ' น.';
        }
      } catch (err) {
        deliveryTime = job.Actual_Delivery_Time + ' น.';
      }
    } else {
      deliveryTime = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) + ' น. (เวลาอ้างอิงของเซิร์ฟเวอร์)';
    }
    
    // Format Photos and Signatures
    const photoText = job.Photo_Proof_Url ? job.Photo_Proof_Url.split(',').map((url: string, index: number) => `🔗 รูปที่ ${index + 1}: ${url.trim()}`).join('\n') : '❌ ไม่มีรูปถ่าย';
    const signatureText = job.Signature_Url ? `🔗 ลายเซ็น: ${job.Signature_Url}` : '❌ ไม่มีลายเซ็น';
    
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tms-app-five.vercel.app';
    
    const message = [
      `📦 [ยืนยันการส่งมอบสินค้าสำเร็จ]`,
      `--------------------------------`,
      `📄 เลขที่งาน: ${job.Job_ID}`,
      `👤 ลูกค้า: ${job.Customer_Name || 'ไม่ระบุ'}`,
      `🗺️ เส้นทาง: ${job.Route_Name || 'ไม่ระบุ'}`,
      `🚛 พนักงานขับรถ: ${job.Driver_Name || 'ไม่ระบุ'} (${job.Vehicle_Plate || 'ไม่ระบุ'})`,
      `⏰ เวลาส่งสำเร็จ: ${deliveryTime}`,
      ``,
      `📸 หลักฐานการจัดส่ง (POD):`,
      `${photoText}`,
      `${signatureText}`,
      ``,
      `🌐 ติดตามสถานะและเอกสารเพิ่มเติม:`,
      `🔗 ${appUrl}/tracking`
    ].join('\n');
    
    // Find recipients (Line User IDs)
    const lineUserIds: string[] = [];
    
    // 1. Get Admins and Super Admins (Role_ID in [1, 2])
    const { data: admins } = await supabase
      .from('Master_Users')
      .select('Line_User_ID')
      .in('Role_ID', [1, 2])
      .not('Line_User_ID', 'is', null);
      
    if (admins) {
      admins.forEach(admin => {
        if (admin.Line_User_ID) lineUserIds.push(admin.Line_User_ID);
      });
    }
    
    // 2. Get the bound customer
    if (job.Customer_ID) {
      // Check Master_Customers first
      try {
        const { data: customer } = await supabase
          .from('Master_Customers')
          .select('Line_User_ID')
          .eq('Customer_ID', job.Customer_ID)
          .not('Line_User_ID', 'is', null)
          .single();
          
        if (customer?.Line_User_ID) {
          lineUserIds.push(customer.Line_User_ID);
        }
      } catch { /* ignore and proceed */ }

      // Also check Master_Users in case the customer account is registered as a user login (e.g. 'uni')
      try {
        const { data: userCust } = await supabase
          .from('Master_Users')
          .select('Line_User_ID')
          .eq('Customer_ID', job.Customer_ID)
          .not('Line_User_ID', 'is', null)
          .maybeSingle();

        if (userCust?.Line_User_ID) {
          lineUserIds.push(userCust.Line_User_ID);
        }
      } catch { /* ignore and proceed */ }
    }
    
    // Deduplicate Line User IDs
    const uniqueIds = Array.from(new Set(lineUserIds));
    
    if (uniqueIds.length === 0) {
      console.log(`[Notification] No bound Line users to notify for job completion.`);
      return;
    }
    
    console.log(`[Notification] Sending completion notification for job ${jobId} to ${uniqueIds.length} users...`);
    
    // Dynamically import pushToUser to prevent circular dependencies
    const { pushToUser } = await import('@/lib/integrations/line');
    
    for (const userId of uniqueIds) {
      await pushToUser(userId, message);
    }
    
  } catch (err) {
    console.error('[Notification] Error sending completion notification:', err);
  }
}
