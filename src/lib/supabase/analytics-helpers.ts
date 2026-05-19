// Analytics shared helpers, types, and constants
// Note: No "use server" here — this is consumed by server action files

import { createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin } from "@/lib/permissions"
import { getSession } from "@/lib/session"

export type FinancialJob = {
    Price_Cust_Total: number;
    Cost_Driver_Total: number;
    Price_Cust_Extra?: number | null;
    Cost_Driver_Extra?: number | null;
}

// Revenue-generating completed statuses
export const REVENUE_STATUSES = [
    'Completed', 'Delivered', 'Finished', 'Closed', 'Complete', 'Success', 'Done', 'Finish', 'Arrived', 'Arrived Destination',
    'completed', 'delivered', 'finished', 'closed', 'complete', 'success', 'done', 'finish', 'arrived',
    'เสร็จสิ้น', 'เรียบร้อย', 'ส่งสำเร็จ', 'ปิดงาน', 'สำเร็จ', 'ถึงที่หมาย', 'ถึงจุดหมาย', 'ถึงที่ส่ง', 'จบงาน',
    'Verified', 'Verified Jobs', 'Verified Success', 'ยืนยันแล้ว', 'ตรวจสอบแล้ว'
]

// "In-progress" statuses for pipeline revenue
export const PIPELINE_STATUSES = [
    'Requested', 'Pending', 'Confirmed', 'Picked Up', 'In Transit', 'Ongoing', 'On Route', 'Assigned',
    'requested', 'pending', 'confirmed', 'picked up', 'in transit', 'ongoing', 'on route', 'assigned',
    'ร้องขอ', 'รอพิจารณา', 'รอยืนยัน', 'รับสินค้าแล้ว', 'กำลังเดินทาง', 'กำลังดำเนินการ', 'รับงานแล้ว', 'มอบหมายแล้ว'
]

// Date helpers to avoid extra dependencies
export const subDays = (date: Date, days: number) => new Date(date.getTime() - days * 24 * 60 * 60 * 1000)
export const differenceInDays = (d1: Date, d2: Date) => Math.floor(Math.abs(d1.getTime() - d2.getTime()) / (24 * 60 * 60 * 1000))

// Safety helper for ISO date strings - uses local time to avoid UTC shifts
export const formatDateSafe = (dateInput: string | Date | null | undefined) => {
    try {
        if (!dateInput) return null
        const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
        if (isNaN(d.getTime())) return null
        
        // Always use Thai timezone for date strings if possible
        const thaiStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) // YYYY-MM-DD
        return thaiStr
    } catch {
        return null
    }
}

/**
 * Get Thailand-local date components
 */
export const getThaiNow = () => {
    const now = new Date()
    const thaiStr = now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
    return new Date(thaiStr)
}

/**
 * Get Thailand-local month boundaries
 */
export const getThaiMonthBoundaries = () => {
    const now = getThaiNow()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { start, end }
}

// Helper to get vehicle plates for a branch
export async function getBranchPlates(branchId: string) {
    const supabase = await createAdminClient()
    const { data } = await supabase
        .from('Master_Vehicles')
        .select('Vehicle_Plate')
        .eq('Branch_ID', branchId)
    return (data || []).map(v => v.Vehicle_Plate).filter(Boolean) as string[]
}

// Common helper to resolve branch filtering
export async function getEffectiveBranchId(branchId?: string) {
    const session = await getSession().catch(() => null)
    
    // If there is NO active session (e.g. server-to-server, LINE webhook, or Cron job)
    if (!session) {
        if (!branchId || branchId.toLowerCase() === 'all' || branchId.toLowerCase() === 'ทุกสาขา' || branchId.toUpperCase() === 'HQ') {
            return null
        }
        
        // Robust ID Resolution for backend context
        const isName = branchId.length > 4 || branchId.includes(' ')
        if (isName) {
            try {
                const supabase = await createAdminClient()
                const { data: branches } = await supabase.from('Master_Branches').select('Branch_ID, Branch_Name')
                if (branches) {
                    const match = branches.find(b => 
                        b.Branch_Name.trim().toLowerCase() === branchId.trim().toLowerCase() ||
                        b.Branch_ID.trim().toLowerCase() === branchId.trim().toLowerCase()
                    )
                    if (match) return match.Branch_ID
                }
            } catch (e) {
                console.error('[getEffectiveBranchId] Resolution error:', e)
            }
        }
        return branchId.trim().toUpperCase()
    }

    const userBranchId = await getUserBranchId()
    const isSuper = await isSuperAdmin()
    
    // STRICT ISOLATION: Non-SuperAdmins are HARD LOCKED to their userBranchId
    if (!isSuper) {
        if (!userBranchId || userBranchId.toLowerCase() === 'all') return 'RESTRICTED_ACCESS'
        return userBranchId.trim().toUpperCase()
    }

    // Super Admin can override with provided branchId
    let target = branchId || userBranchId
    
    if (!target || target.toLowerCase() === 'all' || target.toLowerCase() === 'ทุกสาขา' || target.toUpperCase() === 'HQ') return null

    // Robust ID Resolution:
    // If target is NOT a known ID (e.g. it's a long name), try to find the ID.
    // IDs are usually 2-4 uppercase characters (HQ, SKN, PTE, etc.)
    const isName = target.length > 4 || target.includes(' ');
    
    if (isName) {
        try {
            const supabase = await createAdminClient()
            const { data: branches } = await supabase.from('Master_Branches').select('Branch_ID, Branch_Name')
            
            if (branches) {
                // Find by name (case-insensitive, trimmed)
                const match = branches.find(b => 
                    b.Branch_Name.trim().toLowerCase() === target.trim().toLowerCase() ||
                    b.Branch_ID.trim().toLowerCase() === target.trim().toLowerCase()
                )
                if (match) return match.Branch_ID
            }
        } catch (e) {
            console.error('[getEffectiveBranchId] Resolution error:', e)
        }
    }

    return target.trim().toUpperCase() // Default to uppercase ID (e.g. "skn" -> "SKN")
}
