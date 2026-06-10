'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/supabase/logs'
import { sendPushToDriver } from '@/lib/actions/push-actions'

export type JobBid = {
  bid_id: string
  job_id: string
  driver_id: string
  driver_name: string
  bid_amount: number
  status: string
  created_at: string
}

// ฝั่งคนขับ: ดึงงานที่ยังไม่มีคนรับ
export async function getUnassignedJobs() {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('Jobs_Main')
    .select('*')
    .in('Job_Status', ['New', 'Requested', 'Assigned'])
    .is('Driver_ID', null)
    .order('Created_At', { ascending: false })

  if (error) {
    return []
  }

  return data
}

// ฝั่งคนขับ: ดึงข้อมูลการประมูลของตัวเองสำหรับงานนี้ (ถ้าเคยเสนอไปแล้ว)
export async function getMyBidForJob(jobId: string, driverId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('Job_Bids')
        .select('*')
        .eq('job_id', jobId)
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
    return data as JobBid | null
}

// ฝั่งคนขับ: ดึงรายการประมูลทั้งหมดของตัวเอง
export async function getMyBidsForJobs(driverId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('Job_Bids')
        .select('job_id, bid_amount')
        .eq('driver_id', driverId)
    return data || []
}

// ฝั่งคนขับ: เสนอราคา
export async function submitBid(jobId: string, driverId: string, driverName: string, amount: number) {
  try {
    const supabase = createAdminClient()

    // 1. Check if bid already exists
    const { data: existingBid } = await supabase
        .from('Job_Bids')
        .select('bid_id')
        .eq('job_id', jobId)
        .eq('driver_id', driverId)
        .maybeSingle()

    let error;
    
    if (existingBid) {
        // Update existing
        const { error: updateError } = await supabase
            .from('Job_Bids')
            .update({
                bid_amount: amount,
                created_at: new Date().toISOString()
            })
            .eq('bid_id', existingBid.bid_id)
        error = updateError
    } else {
        // Insert new
        const { error: insertError } = await supabase
            .from('Job_Bids')
            .insert({
                job_id: jobId,
                driver_id: driverId,
                driver_name: driverName,
                bid_amount: amount,
                status: 'Pending'
            })
        error = insertError
    }

    if (error) {
      console.error('[DEBUG] submitBid Error:', error)
      return { success: false, message: `DB Error: ${error.message} (Code: ${error.code})` }
    }

    revalidatePath('/mobile/marketplace')
    revalidatePath('/dashboard') // Update admin dashboard
    
    await logActivity({
        module: 'Jobs',
        action_type: 'CREATE',
        target_id: jobId,
        details: { description: `Driver ${driverName} bid ฿${amount} for job ${jobId}` }
    })

    return { success: true, message: 'เสนอราคาสำเร็จ! แอดมินกำลังตรวจสอบข้อเสนอของคุณ' }
  } catch (err) {
    console.error('[DEBUG] submitBid Exception:', err)
    return { success: false, message: 'เกิดข้อผิดพลาดในการเสนอราคา (System Exception)' }
  }
}

// ฝั่งแอดมิน: ดึงรายการประมูลทั้งหมดของแต่ละงาน
export async function getBidsForJob(jobId: string) {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('Job_Bids')
        .select('*')
        .eq('job_id', jobId)
        .order('bid_amount', { ascending: true }) // เรียงจากราคาถูกสุดขึ้นก่อน
        
    if (error) {
        console.error('[DEBUG] getBidsForJob Error:', error)
        return []
    }
    return data as JobBid[]
}

// ฝั่งแอดมิน: ดึงรายการประมูลทั้งหมดสำหรับงาน Unassigned ที่รออยู่
export async function getAllActiveBids() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('Job_Bids')
        .select('*')
        .eq('status', 'Pending')
        .order('created_at', { ascending: false })
        
    if (error) {
        return []
    }
    return data as JobBid[]
}

import { transitionJobStatus } from "@/services/job-status-machine"

// ฝั่งแอดมิน: ยืนยันเลือกคนขับ (Accept Bid)
export async function acceptBid(jobId: string, bidId: string, driverId: string, driverName: string, amount: number) {
    const supabase = createAdminClient()

    // 0. ตรวจสอบก่อนว่างานนี้มีคนรับไปหรือยัง
    const { data: currentJob } = await supabase
        .from('Jobs_Main')
        .select('Driver_ID, Job_Status')
        .eq('Job_ID', jobId)
        .single()

    if (currentJob?.Driver_ID) {
        return { success: false, message: 'ขออภัย งานนี้มีคนขับรับไปเรียบร้อยแล้ว' }
    }

    // 1. Transition Status using Machine
    const transition = await transitionJobStatus(jobId, 'Assigned', {
        reason: 'Bid Accepted',
        notes: `Driver: ${driverName}, Amount: ${amount}`
    })

    if (!transition.success) {
        return { success: false, message: `Status Error: ${transition.message}` }
    }

    // 2. อัปเดตข้อมูลอื่นๆ ในตาราง Jobs_Main (จ่ายงานให้คนขับ และลงราคาจ้าง)
    const { error: updateJobError } = await supabase
        .from('Jobs_Main')
        .update({
            Driver_ID: driverId,
            Driver_Name: driverName,
            Cost_Driver_Total: amount
        })
        .eq('Job_ID', jobId)

    if (updateJobError) {
        return { success: false, message: 'ไม่สามารถอัปเดตงานได้' }
    }

    // 3. อัปเดตให้ Bid นี้เป็น Accepted
    await supabase
        .from('Job_Bids')
        .update({ status: 'Accepted' })
        .eq('bid_id', bidId)

    // 3. ดึงรายชื่อคนขับคนอื่นที่ประมูลงานนี้ เพื่อส่งแจ้งเตือนว่าไม่ได้รับเลือก
    const { data: otherBidders } = await supabase
        .from('Job_Bids')
        .select('driver_id')
        .eq('job_id', jobId)
        .neq('bid_id', bidId)

    // 4. ปฏิเสธการประมูลอื่นๆ ของงานนี้ (Rejected)
    await supabase
        .from('Job_Bids')
        .update({ status: 'Rejected' })
        .eq('job_id', jobId)
        .neq('bid_id', bidId)

    // แจ้งเตือน Push Notification หาคนขับที่ชนะ
    await sendPushToDriver(driverId, {
      title: '🎉 ยินดีด้วย! คุณได้รับงานจากการประมูล',
      body: `แอดมินยืนยันให้คุณรับงาน ${jobId} แล้วในราคา ฿${amount}`,
      url: `/mobile/jobs/${jobId}`
    })

    // แจ้งเตือนคนขับคนอื่นๆ ที่ไม่ได้รับเลือก
    if (otherBidders && otherBidders.length > 0) {
        for (const bidder of otherBidders) {
            await sendPushToDriver(bidder.driver_id, {
                title: '📌 งานประมูลปิดแล้ว',
                body: `งาน ${jobId} มีผู้รับไปแล้ว ขอบคุณที่ร่วมเสนอราคา ลองดูงานอื่นใน Marketplace นะ!`,
                url: `/mobile/marketplace`
            }).catch(err => console.error('Failed to notify rejected bidder:', err))
        }
    }

    revalidatePath('/dashboard')
    revalidatePath('/planning')
    revalidatePath('/jobs')
    revalidatePath('/mobile/dashboard')
    revalidatePath('/mobile/jobs')
    revalidatePath('/mobile/marketplace')

    await logActivity({
        module: 'Jobs',
        action_type: 'UPDATE',
        target_id: jobId,
        details: { description: `Admin accepted bid from ${driverName} at ฿${amount}` }
    })

    return { success: true, message: 'ยืนยันเลือกคนขับรถสำเร็จ งานถูกส่งให้คนขับแล้ว!' }
}

// ฝั่งแอดมิน: ยกเลิกงานที่รอประมูล (กรณีลูกค้ายกเลิกแผน)
export async function cancelBiddingJob(jobId: string) {
    const supabase = createAdminClient()

    try {
        // 1. ตรวสอบสถานะก่อนลบ (ต้องยังไม่มีคนรับงาน)
        const { data: job } = await supabase
            .from('Jobs_Main')
            .select('Driver_ID, Job_Status')
            .eq('Job_ID', jobId)
            .single()

        if (job?.Driver_ID) {
            return { success: false, message: 'ไม่สามารถยกเลิกได้ เนื่องจากมีคนรับงานไปแล้ว' }
        }

        // 2. Transition Status using Machine
        const transition = await transitionJobStatus(jobId, 'Cancelled', {
            reason: 'Admin cancelled bidding job (Customer cancelled plan)'
        })

        if (!transition.success) {
            return { success: false, message: transition.message }
        }

        // 3. ปฏิเสธการประมูลที่มีอยู่ทั้งหมด (ถ้ามี)
        await supabase
            .from('Job_Bids')
            .update({ status: 'Rejected' })
            .eq('job_id', jobId)

        await logActivity({
            module: 'Jobs',
            action_type: 'UPDATE', // Use UPDATE as it's a status change
            target_id: jobId,
            details: { description: `Admin cancelled bidding job ${jobId} (Customer cancelled plan)` }
        })

        revalidatePath('/dashboard')
        revalidatePath('/planning')
        revalidatePath('/mobile/marketplace')

        return { success: true, message: 'ยกเลิกรายการประมูลเรียบร้อยแล้ว' }
    } catch (err) {
        console.error('Cancel bidding job exception:', err)
        return { success: false, message: 'ระบบขัดข้อง ไม่สามารถดำเนินการได้' }
    }
}
