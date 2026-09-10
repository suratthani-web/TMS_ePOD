"use server"

import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/supabase/logs";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { isCompleted } from "@/lib/constants/job-status";
import { calculateJobEmissions } from "@/lib/utils/esg-utils";
import { getCarbonFactors } from "@/lib/actions/carbon-factors";

// ชุดสถานะที่ใช้งานจริง (operational) — ตัด alias ที่ไม่เคยถูกเขียน/ไม่มีในข้อมูลออก
// (เดิมมี Pending, En Route, En-Route, Arrived เดี่ยว, Complete, Failed ที่ไม่ถูกใช้จริง)
export type JobStatus =
  | 'Draft'
  | 'Requested'
  | 'New'
  | 'Assigned'
  | 'Confirmed'
  | 'Accepted'
  | 'Picked Up'
  | 'In Transit'
  | 'In Progress'
  | 'Arrived Pickup'
  | 'Arrived Dropoff'
  | 'Completed'
  | 'Delivered'
  | 'Verified'
  | 'Rejected'
  | 'Billed'
  | 'Paid'
  | 'Cancelled'
  | 'SOS';

/**
 * Definition of allowed transitions for the Job Status State Machine.
 * Key is the current status, value is an array of statuses it can transition TO.
 */
const ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  'Draft': ['New', 'Assigned', 'Cancelled', 'Verified'],
  'Requested': ['New', 'Assigned', 'Cancelled', 'Verified'],
  'New': ['Assigned', 'Confirmed', 'Accepted', 'Picked Up', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS', 'Verified'],
  'Assigned': ['Accepted', 'Picked Up', 'In Transit', 'In Progress', 'Completed', 'New', 'Cancelled', 'SOS', 'Verified'],
  'Confirmed': ['Assigned', 'Accepted', 'Picked Up', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS', 'Verified'],
  'Accepted': ['Arrived Pickup', 'In Transit', 'In Progress', 'Completed', 'Cancelled', 'SOS', 'Verified'],
  'Picked Up': ['In Transit', 'In Progress', 'Arrived Dropoff', 'Completed', 'Delivered', 'Cancelled', 'SOS', 'Verified'],
  'In Transit': ['Arrived Pickup', 'Arrived Dropoff', 'In Progress', 'Completed', 'Delivered', 'Cancelled', 'SOS', 'Verified'],
  'In Progress': ['Arrived Dropoff', 'Completed', 'Delivered', 'Cancelled', 'SOS', 'Verified'],
  'Arrived Pickup': ['Picked Up', 'In Transit', 'Completed', 'Cancelled', 'SOS', 'Verified'],
  'Arrived Dropoff': ['In Transit', 'Completed', 'Delivered', 'Cancelled', 'SOS', 'Verified'],
  'Completed': ['Verified', 'Rejected', 'Billed', 'Cancelled'],
  'Delivered': ['Verified', 'Rejected', 'Billed', 'Cancelled'],
  'Verified': ['Billed', 'Paid', 'Cancelled', 'Completed', 'Delivered', 'Rejected'],
  'Rejected': ['Completed', 'Delivered', 'Cancelled'], // Can go back if driver re-uploads or admin fixes
  'Billed': ['Paid', 'Cancelled', 'Verified', 'Completed', 'Delivered', 'Rejected'],
  'Paid': [], // Final state
  'Cancelled': [], // Final state
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
            if (isCompleted(nextStatus)) {
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
 
    // Trigger LINE notification if job is completed or delivered.
    // Run it via after() so the serverless function stays alive until the
    // notification finishes. Previously this was fire-and-forget (not awaited),
    // so on Vercel the platform could freeze/kill the lambda once the POD
    // response returned — dropping completion alerts intermittently (the
    // notification never even claimed its Delivery_Notified_At slot).
    if (isCompleted(nextStatus)) {
      after(async () => {
        try {
          await sendDeliveryCompletionNotification(jobId);
        } catch (err) {
          console.error('[JobStatusMachine] Notification trigger failed:', err);
        }
      });
    }

    // Trigger WMS webhook if job originated from WMS / Enterprise API (Auto-Close with POD)
    if (['In Transit', 'Picked Up', 'Delivered', 'Completed'].includes(nextStatus)) {
      after(async () => {
        try {
          const { sendWmsStatusWebhook } = await import('@/lib/integrations/wms-webhook');
          await sendWmsStatusWebhook(jobId, isCompleted(nextStatus) ? 'job.completed' : 'job.status_updated');
        } catch (err) {
          console.error('[JobStatusMachine] WMS webhook trigger failed:', err);
        }
      });
    }

    // Notify admins in-app (Web Push). This is the single chokepoint every status
    // change flows through, so admins get the notification whether the driver
    // finished via POD upload (submitJobPOD), the status button (updateJobStatus)
    // or LINE. Previously the completion push only fired from the status-button
    // path, so POD-completed jobs never notified admins.
    const NOTIFY_STATUSES = ['Picked Up', 'In Transit', 'Delivered', 'Completed', 'Failed', 'SOS'];
    if (NOTIFY_STATUSES.includes(nextStatus)) {
      // after() (not fire-and-forget) so the Web Push isn't dropped when the
      // serverless function returns before the promise settles.
      after(async () => {
        try {
          const { data: j } = await supabase
            .from('Jobs_Main')
            .select('Driver_ID, Driver_Name')
            .eq('Job_ID', jobId)
            .maybeSingle();
          const { notifyAdminJobStatus } = await import('@/lib/actions/push-actions');
          await notifyAdminJobStatus(j?.Driver_ID || '', j?.Driver_Name || 'คนขับ', jobId, nextStatus);
        } catch (err) {
          console.error('[JobStatusMachine] Admin push failed:', err);
        }
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
      .select('Job_ID, Customer_Name, Route_Name, Driver_Name, Vehicle_Plate, Vehicle_Type, Est_Distance_KM, Weight_Kg, Photo_Proof_Url, Signature_Url, Customer_ID, Branch_ID, Actual_Delivery_Time, Delivery_Date, Delivery_Notified_At, original_destinations_json, POD_Drops_Json, job_type, container:jobs_container(*)')
      .eq('Job_ID', jobId)
      .single();

    if (jobErr || !job) {
      console.error(`[Notification] Job ${jobId} not found for completion notification.`);
      return;
    }

    // Idempotency: this completion notification must fire only once per job.
    // A re-submitted POD, an offline replay, or a later re-verify all re-run the
    // Completed/Delivered transition — without this guard each one would re-push
    // to every admin + the customer, silently burning the limited LINE quota.
    if (job.Delivery_Notified_At) {
      console.log(`[Notification] Job ${jobId} already notified at ${job.Delivery_Notified_At}, skipping.`);
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
    
    // Per-drop evidence log (photos + signature + SO per drop) captured at POD time.
    type DropLog = { drop?: number; so_no?: string; destination?: string; photos?: string[]; signature?: string | null };
    let drops: DropLog[] = [];
    try {
      const raw = job.POD_Drops_Json;
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed)) drops = parsed.filter(Boolean);
    } catch { /* ignore */ }

    // Fallback: destinations (name + so_no) + index-matched signatures, when the
    // per-drop log isn't available (older jobs before POD_Drops_Json).
    let destsFallback: Array<{ name?: string; so_no?: string }> = [];
    try {
      const parsed = typeof job.original_destinations_json === 'string' ? JSON.parse(job.original_destinations_json) : job.original_destinations_json;
      if (Array.isArray(parsed)) destsFallback = parsed;
    } catch { /* ignore */ }
    const sigFallback = job.Signature_Url ? job.Signature_Url.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tms-e-pod.vercel.app';

    // Build a per-drop section: SO + destination + that drop's OWN photos + signature.
    let dropCount: number;
    let dropText: string;
    if (drops.length > 0) {
      dropCount = drops.length;
      dropText = drops.map((d, i) => {
        const so = String(d?.so_no || '').trim();
        const name = String(d?.destination || '').trim() || `จุดส่งที่ ${i + 1}`;
        const photos = Array.isArray(d?.photos) ? d.photos.filter(Boolean) : [];
        const lines = [
          `📍 ดรอปที่ ${d?.drop || i + 1}${so ? ` — SO: ${so}` : ''}`,
          `   ปลายทาง: ${name}`,
        ];
        photos.forEach((u, k) => lines.push(`   📸 รูปที่ ${k + 1}: ${String(u).trim()}`));
        lines.push(d?.signature ? `   ✍️ ลายเซ็น: ${d.signature}` : `   ✍️ ลายเซ็น: —`);
        return lines.join('\n');
      }).join('\n\n');
    } else if (destsFallback.length > 0) {
      dropCount = destsFallback.length;
      dropText = destsFallback.map((d, i) => {
        const so = String(d?.so_no || '').trim();
        const name = String(d?.name || '').trim() || `จุดส่งที่ ${i + 1}`;
        return [
          `📍 ดรอปที่ ${i + 1}${so ? ` — SO: ${so}` : ''}`,
          `   ปลายทาง: ${name}`,
          sigFallback[i] ? `   ✍️ ลายเซ็น: ${sigFallback[i]}` : `   ✍️ ลายเซ็น: —`,
        ].join('\n');
      }).join('\n\n');
    } else {
      dropCount = 1;
      dropText = `📍 ปลายทาง: ${job.Route_Name || 'ไม่ระบุ'}` + (sigFallback[0] ? `\n   ✍️ ลายเซ็น: ${sigFallback[0]}` : '');
    }

    // Photos not attributable to a drop are only shown in the fallback path;
    // when POD_Drops_Json exists, photos are already listed under each drop.
    const flatPhotoText = drops.length === 0 && job.Photo_Proof_Url
      ? '\n\n📸 หลักฐานการจัดส่ง (POD):\n' + job.Photo_Proof_Url.split(',').map((url: string, index: number) => `🔗 รูปที่ ${index + 1}: ${url.trim()}`).join('\n')
      : '';

    // Carbon footprint summary for this trip (TGO / อบก. standard). Normalize the
    // vehicle type ("4" → "4-Wheel", etc.) so it maps to the emission-factor keys;
    // no recorded fuel volume → distance-estimated (Scope 3).
    const normalizeVehicleType = (v: unknown): string => {
      const s = String(v ?? '').trim().toLowerCase()
      if (!s) return 'default'
      if (s.includes('motor') || s.includes('มอเตอร์')) return 'Motorcycle'
      // เช็กเลขล้อมากก่อน (กันชนกับ 2 หลัก)
      if (s.startsWith('22')) return '22-Wheel'
      if (s.startsWith('18')) return '18-Wheel'
      if (s.startsWith('10')) return '10-Wheel'
      if (s.startsWith('6')) return '6-Wheel'
      if (s.startsWith('4')) return '4-Wheel'
      return 'default'
    }
    // ใบแจ้งหนี้ + LINE: คิด "1 ขา รถหนัก" (เที่ยวเดียว บรรทุกจริง) ไม่รวมตีเปล่ากลับ
    const oneWayKm = Number(job.Est_Distance_KM) || 0
    let carbonText = ''
    if (oneWayKm > 0) {
      const carbonFactors = await getCarbonFactors()
      // น้ำหนักสินค้าจริง (ถ้ามี) → คำนวณแบบ tonne-km ตาม ISO 14083; emptyReturnRatio=0 (ไม่รวมขากลับ)
      const rawWeight = Number(job.Weight_Kg) || 0
      const cargoWeightTonnes = rawWeight > 0 ? rawWeight / 1000 : null
      const esg = calculateJobEmissions(oneWayKm, null, normalizeVehicleType(job.Vehicle_Type), carbonFactors, cargoWeightTonnes, 0)
      carbonText = [
        ``,
        `🌱 คาร์บอนฟุตพริ้นต์เที่ยวนี้ (มาตรฐาน ISO 14083 / GLEC / อบก.):`,
        `   ระยะทางขนส่ง ~${oneWayKm.toLocaleString()} กม. • ปล่อย ~${esg.co2EmissionsKg.toLocaleString()} kgCO₂e`,
        `   เทียบเท่าปลูกต้นไม้ ~${esg.treesEquivalentToOffset.toLocaleString()} ต้น เพื่อชดเชย`,
      ].join('\n')
    }

    // Container jobs: append a container-info block (เลขตู้/ซีล/สายเรือ/Booking) and
    // the EIR gate-in (คืนตู้) evidence link. Normal jobs get none of this.
    let containerText = ''
    if (job.job_type === 'container') {
      const rawC = (job as { container?: unknown }).container
      const c = (Array.isArray(rawC) ? rawC[0] : rawC) as Record<string, unknown> | null | undefined
      if (c) {
        const line = (label: string, val: unknown) => {
          const v = String(val ?? '').trim()
          return v ? `   ${label}: ${v}` : ''
        }
        const eir = String(c.eir_gate_in_url ?? '').trim()
        containerText = [
          ``,
          `🚢 ข้อมูลตู้คอนเทนเนอร์:`,
          line('เลขตู้', c.container_no),
          line('ซีล', c.seal_no),
          line('ขนาด', c.container_size),
          line('สายเรือ', c.shipping_line),
          line('Booking', c.booking_no),
          eir ? `   📄 หลักฐานคืนตู้ (EIR Gate-In): ${eir}` : '',
        ].filter(Boolean).join('\n')
      }
    }

    const message = [
      `📦 [ยืนยันการส่งมอบสินค้าสำเร็จ]`,
      `--------------------------------`,
      `📄 เลขที่งาน: ${job.Job_ID}`,
      `👤 ลูกค้า: ${job.Customer_Name || 'ไม่ระบุ'}`,
      `🚛 พนักงานขับรถ: ${job.Driver_Name || 'ไม่ระบุ'} (${job.Vehicle_Plate || 'ไม่ระบุ'})`,
      `⏰ เวลาส่งสำเร็จ: ${deliveryTime}`,
      ``,
      `📦 รายการจุดส่ง (${dropCount} ดรอป):`,
      dropText + flatPhotoText,
      ...(containerText ? [containerText] : []),
      ...(carbonText ? [carbonText] : []),
      ``,
      `🌐 ติดตามสถานะและเอกสารเพิ่มเติม:`,
      `🔗 ${appUrl}/track/${job.Job_ID}`
    ].join('\n');
    
    // Find recipient customers. Each target carries both LINE ids (one per bot);
    // pushToCustomerActive picks the right id for whichever bot is active now.
    //
    // NOTE: Regular Admins (Role 2) normally receive completion alerts via a free
    // in-app Web Push (notifyAdminJobStatus(), see app/mobile/jobs/actions.ts) and
    // are NOT put on LINE, to spare the limited 300-msg/month quota.
    // *** TEMPORARY (TILOG booth): Role 2 is currently ALSO notified via LINE —
    // see the admin-monitor block below for how to revert. ***
    type CustTarget = { Line_User_ID?: string | null; Line_User_ID_2?: string | null };
    const targets: CustTarget[] = [];

    // Extra LINE recipients for this customer's team: a group chat and/or several
    // individual members, stored one row each in Customer_Line_Contacts. Pushed
    // after the legacy targets, de-duplicated against them.
    type LineContactRow = { Line_Target_ID: string; Bot_Index?: number | null; Target_Type?: string | null; Active?: boolean | null };
    let lineContacts: LineContactRow[] = [];

    // Telegram: เก็บ chat_id ปลายทางแยกจาก LINE (ใช้ routing กฎเดียวกัน)
    //   ลูกค้า → Telegram_Chat_ID ของลูกค้ารายนั้น (ส่วนตัว)
    //   Super Admin (Role 1) → ลูกค้าทั้งระบบ; Admin (Role 2) → เฉพาะสาขาตัวเอง
    // ใช้ query แยก + try/catch เอง เพื่อไม่ให้พังตอนคอลัมน์ยังไม่มี (SQL ยังไม่รัน)
    const telegramChatIds = new Set<string>();

    // Resolve the customer id even when the job only stored a customer NAME.
    // Jobs created by typing the customer name (no linked id) would otherwise
    // never reach the bound customer's LINE — a silent "bound but no alerts" bug.
    let effectiveCustomerId: string | null = job.Customer_ID || null;
    // Per-customer LINE switch — single source of truth is the DB flag
    // Master_Customers.Line_Notify_Disabled (toggle it from the customer screen).
    let isLineNotifyDisabled = false;

    if (!effectiveCustomerId && job.Customer_Name) {
      try {
        const { data: cById } = await supabase
          .from('Master_Customers')
          .select('Customer_ID, Line_Notify_Disabled')
          .eq('Customer_Name', job.Customer_Name)
          .maybeSingle();
        effectiveCustomerId = cById?.Customer_ID || null;
        if (cById?.Line_Notify_Disabled) isLineNotifyDisabled = true;
      } catch { /* ignore */ }
    }

    if (effectiveCustomerId) {
      // Check Master_Customers first (has both bot ids and Line_Notify_Disabled)
      try {
        const { data: customer } = await supabase
          .from('Master_Customers')
          .select('Line_User_ID, Line_User_ID_2, Line_Notify_Disabled, Customer_Name')
          .eq('Customer_ID', effectiveCustomerId)
          .maybeSingle();

        if (customer) {
          if (customer.Line_Notify_Disabled) {
            isLineNotifyDisabled = true;
          }
          if (!isLineNotifyDisabled && (customer.Line_User_ID || customer.Line_User_ID_2)) {
            targets.push(customer);
          }
        }
      } catch { /* ignore and proceed */ }

      if (!isLineNotifyDisabled) {
        // Also check Master_Users in case the customer account is registered as a
        // user login (e.g. 'uni'). User logins only ever link the primary bot.
        try {
          const { data: userCust } = await supabase
            .from('Master_Users')
            .select('Line_User_ID')
            .eq('Customer_ID', effectiveCustomerId)
            .not('Line_User_ID', 'is', null)
            .maybeSingle();

          if (userCust?.Line_User_ID) {
            targets.push({ Line_User_ID: userCust.Line_User_ID });
          }
        } catch { /* ignore and proceed */ }

        // Team recipients (LINE group + individual members). Wrapped in try/catch
        // so completion notifications keep working even if the table isn't created
        // yet (SQL migration run manually in Supabase).
        try {
          const { data: contacts } = await supabase
            .from('Customer_Line_Contacts')
            .select('Line_Target_ID, Bot_Index, Target_Type, Active')
            .eq('Customer_ID', effectiveCustomerId)
            .eq('Active', true);
          if (contacts && contacts.length > 0) lineContacts = contacts as LineContactRow[];
        } catch { /* table may not exist yet → skip */ }
      }
    }

    // Admin monitoring copy, routed through pushToCustomerActive so it follows the
    // active-bot / fallback logic (admins only ever link bot 1, so it falls back
    // to bot 1). To stop receiving these, clear the admin's Line_User_ID in
    // Master_Users (Supabase).
    //   • Super Admin (Role 1): receives EVERY branch's completion (monitoring).
    //   • Admin (Role 2): receives ONLY completions for its OWN branch, matched
    //     against the job's Branch_ID.
    //
    // ┌─── TEMPORARY (TILOG booth event) ────────────────────────────────────┐
    // │ Role 2 (Admin) LINE alerts are enabled for the TILOG booth, scoped to │
    // │ the admin's branch. This intentionally spends the limited             │
    // │ 300-msg/month LINE quota. TO REVERT AFTER THE BOOTH: drop 2 from the   │
    // │ .in([1, 2]) below (back to .eq('Role_ID', 1)) and remove the branch    │
    // │ filter, then restore the "Role 2 not notified" note above.            │
    // └───────────────────────────────────────────────────────────────────────┘
    // When a customer is muted for LINE, suppress the ADMIN monitoring copy too —
    // otherwise a high-frequency customer (the reason for muting) still spams the
    // admins' LINE. In-app web push and Telegram are unaffected.
    if (!isLineNotifyDisabled) {
      try {
        const { data: adminMonitors } = await supabase
          .from('Master_Users')
          .select('Line_User_ID, Line_User_ID_2, Role_ID, Branch_ID')
          .in('Role_ID', [1, 2]) // TEMPORARY: [1] normally; 2 added for TILOG booth
          .or('Line_User_ID.not.is.null,Line_User_ID_2.not.is.null');

        adminMonitors?.forEach((a: { Line_User_ID: string | null; Line_User_ID_2?: string | null; Role_ID: number | null; Branch_ID: string | number | null }) => {
          if (!a.Line_User_ID && !a.Line_User_ID_2) return;
          // Role 1 → all branches; Role 2 → only its own branch matches the job.
          const branchOk = Number(a.Role_ID) === 1
            || (job.Branch_ID != null && String(a.Branch_ID) === String(job.Branch_ID));
          // Carry BOTH bot ids so pushToCustomerActive picks the right OA (and
          // falls back to the other) — an admin may have linked either or both.
          if (branchOk) targets.push({ Line_User_ID: a.Line_User_ID, Line_User_ID_2: a.Line_User_ID_2 });
        });
      } catch { /* ignore and proceed */ }
    }

    // ── Telegram targets (routing เดียวกับ LINE ด้านบน) ──
    // 1) ลูกค้าเจ้าของงาน
    if (effectiveCustomerId) {
      try {
        const { data: c } = await supabase
          .from('Master_Customers')
          .select('Telegram_Chat_ID')
          .eq('Customer_ID', effectiveCustomerId)
          .maybeSingle();
        if (c?.Telegram_Chat_ID) telegramChatIds.add(String(c.Telegram_Chat_ID));
      } catch { /* คอลัมน์อาจยังไม่มี → ข้าม */ }

      try {
        const { data: uc } = await supabase
          .from('Master_Users')
          .select('Telegram_Chat_ID')
          .eq('Customer_ID', effectiveCustomerId)
          .not('Telegram_Chat_ID', 'is', null)
          .maybeSingle();
        if (uc?.Telegram_Chat_ID) telegramChatIds.add(String(uc.Telegram_Chat_ID));
      } catch { /* ข้าม */ }
    }

    // 2) แอดมินที่รับผิดชอบ: Role 1 → ทุกสาขา, Role 2 → เฉพาะสาขาของงาน
    try {
      const { data: tgAdmins } = await supabase
        .from('Master_Users')
        .select('Telegram_Chat_ID, Role_ID, Branch_ID')
        .in('Role_ID', [1, 2])
        .not('Telegram_Chat_ID', 'is', null);

      tgAdmins?.forEach((a: { Telegram_Chat_ID: string | null; Role_ID: number | null; Branch_ID: string | number | null }) => {
        if (!a.Telegram_Chat_ID) return;
        const branchOk = Number(a.Role_ID) === 1
          || (job.Branch_ID != null && String(a.Branch_ID) === String(job.Branch_ID));
        if (branchOk) telegramChatIds.add(String(a.Telegram_Chat_ID));
      });
    } catch { /* ข้าม */ }

    // Deduplicate by the primary (bot 1) id so the same person in both tables
    // isn't notified twice.
    const seen = new Set<string>();
    const uniqueTargets = targets.filter(t => {
      if (t.Line_User_ID) {
        if (seen.has(t.Line_User_ID)) return false;
        seen.add(t.Line_User_ID);
      }
      return !!(t.Line_User_ID || t.Line_User_ID_2);
    });

    if (uniqueTargets.length === 0 && telegramChatIds.size === 0 && lineContacts.length === 0) {
      console.log(`[Notification] No bound LINE/Telegram users to notify for job completion.`);
      return;
    }

    // Claim the notification slot before sending: only the update that flips a
    // still-null timestamp wins, so two concurrent transitions can't both push.
    const { data: claimed } = await supabase
      .from('Jobs_Main')
      .update({ Delivery_Notified_At: new Date().toISOString() })
      .eq('Job_ID', jobId)
      .is('Delivery_Notified_At', null)
      .select('Job_ID');
    if (!claimed || claimed.length === 0) {
      console.log(`[Notification] Job ${jobId} was notified by a concurrent transition, skipping.`);
      return;
    }

    console.log(`[Notification] Sending completion notification for job ${jobId} to ${uniqueTargets.length} customer(s)...`);

    // Dynamically import to prevent circular dependencies
    const { pushToCustomerActive, pushToContacts } = await import('@/lib/integrations/line');

    for (const target of uniqueTargets) {
      await pushToCustomerActive(target, message);
    }

    // Team recipients: LINE group + individual members. Skip any id already
    // reached through a legacy Line_User_ID / Line_User_ID_2 above so nobody is
    // messaged twice (and the 300/mo quota isn't double-spent).
    if (lineContacts.length > 0) {
      const legacyIds = uniqueTargets.flatMap(t => [t.Line_User_ID, t.Line_User_ID_2]);
      const { sent } = await pushToContacts(lineContacts, message, legacyIds);
      console.log(`[Notification] Sent completion to ${sent} team contact(s) for job ${jobId}.`);
    }

    // Telegram: ส่งข้อความเดียวกันไปยัง chat_id ที่ผูกไว้ (ส่วนตัว/รายคน) — ฟรี ไม่กินโควต้า LINE
    if (telegramChatIds.size > 0) {
      const { sendTelegramText } = await import('@/lib/integrations/telegram');
      console.log(`[Notification] Sending Telegram completion to ${telegramChatIds.size} chat(s)...`);
      await Promise.allSettled(
        Array.from(telegramChatIds).map(id => sendTelegramText(id, message))
      );
    }

  } catch (err) {
    console.error('[Notification] Error sending completion notification:', err);
  }
}
