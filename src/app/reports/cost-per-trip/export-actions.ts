"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId } from '@/lib/permissions'
import { buildTripPerformanceWorkbook } from '@/lib/reports/trip-performance-xlsx'
import { getCostPerTrip } from './actions'

/** Trip Performance → executive Excel (summary / per-trip / internal audit). Base64 for download. */
export async function exportTripPerformanceXlsx(startDate?: string, endDate?: string, customerNames?: string[]) {
  try {
    // same default window as getCostPerTrip (last 30 days)
    const now = new Date()
    const start = startDate || endDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const end = endDate || startDate || now.toISOString().split('T')[0]

    const { trips, summary } = await getCostPerTrip(start, end, customerNames)
    if (!trips.length) return { success: false as const, error: 'ไม่มีข้อมูลในช่วงเวลาที่เลือก' }

    const branchId = await getUserBranchId()
    let branchLabel = 'ทุกสาขา'
    if (branchId && branchId !== 'All') {
      const { data } = await createAdminClient().from('Master_Branches').select('Branch_Name').eq('Branch_ID', branchId).maybeSingle()
      branchLabel = `${data?.Branch_Name || branchId} (${branchId})`
    }

    const buffer = await buildTripPerformanceWorkbook(trips, summary, {
      start,
      end,
      branchLabel,
      scopeLabel: customerNames?.length ? `ลูกค้า: ${customerNames.join(', ')}` : 'ทุกลูกค้า',
      generatedAt: new Date(),
    })
    return {
      success: true as const,
      base64: buffer.toString('base64'),
      fileName: `Trip_Performance_${start}_${end}.xlsx`,
    }
  } catch (err) {
    console.error('[exportTripPerformanceXlsx]', err)
    return { success: false as const, error: 'สร้างไฟล์ไม่สำเร็จ' }
  }
}
