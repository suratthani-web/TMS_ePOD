import type { SupabaseClient } from '@supabase/supabase-js'
import { dateKeyTH } from '@/lib/utils/date-th'

/**
 * Delivery_Date is the date the admin set when creating the job (the planned /
 * billed delivery day — e.g. a back-dated entry keyed in two days late). Completion
 * paths (POD, LINE bot, LIFF signature, admin status override) used to overwrite
 * it with "today", so admins had to edit every back-dated job back by hand.
 *
 * Completion now only FILLS it when empty; the actual completion moment is still
 * kept in Actual_Delivery_Time and POD_Drops_Json[].deliveredAt. Atomic via the
 * `is null` filter — no read-then-write race. Uses the Bangkok calendar day
 * (the old POD path wrote a UTC ISO timestamp, shifting 00:00–07:00 to yesterday).
 */
export async function fillDeliveryDateIfEmpty(
  supabase: SupabaseClient,
  jobId: string,
  when: Date = new Date()
): Promise<void> {
  const { error } = await supabase
    .from('Jobs_Main')
    .update({ Delivery_Date: dateKeyTH(when) })
    .eq('Job_ID', jobId)
    .is('Delivery_Date', null)
  if (error) console.warn(`[DeliveryDate] fill failed for ${jobId}:`, error.message)
}
