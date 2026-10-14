import { getDriverPendingCounts } from "@/lib/supabase/jobs"
import { getActiveDrivers } from "@/lib/supabase/drivers"
import { getCompanyProfile } from "@/lib/supabase/settings"
import { getAllSubcontractors } from "@/lib/supabase/subcontractors"
import { getSystemSetting } from "@/lib/actions/system-settings-actions"
import DriverPaymentClient from "./client-page"

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    dateFrom?: string
    dateTo?: string
  }>
}

export default async function DriverPaymentPage({ searchParams }: PageProps) {
  const params = await searchParams
  const dateFrom = params.dateFrom || undefined
  const dateTo = params.dateTo || undefined

  // ส่งแค่ "ยอดงานค้างต่อคนขับ" (payload เล็ก) แทนงานทั้งพัน
  // งานจริงของแต่ละคนขับโหลดตอนเลือก (client เรียก getJobsForBilling ต่อคน)
  const [pendingCounts, drivers, baseProfile, accountingProfile, subcontractors] = await Promise.all([
    getDriverPendingCounts(dateFrom, dateTo),
    getActiveDrivers(),
    getCompanyProfile(),
    getSystemSetting<Record<string, unknown> | null>('accounting_profile', null),
    getAllSubcontractors()
  ])
  // รวมแบบเดียวกับ getDriverPaymentByIdWithJobs (accounting_profile ทับ company_profile)
  // ให้หัวใบตัวอย่างตรงกับใบที่พิมพ์จากประวัติ
  const companyProfile = baseProfile || accountingProfile
    ? { ...(baseProfile || {}), ...(accountingProfile || {}) } as NonNullable<typeof baseProfile>
    : null

  return (
    <DriverPaymentClient
      initialCounts={pendingCounts}
      drivers={drivers}
      companyProfile={companyProfile}
      subcontractors={subcontractors}
      initialDateFrom={dateFrom}
      initialDateTo={dateTo}
    />
  )
}
