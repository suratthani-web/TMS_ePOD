import { getDriverSession } from "@/lib/actions/auth-actions"
import { redirect } from "next/navigation"
import { MobileHeader } from "@/components/mobile/mobile-header"
import { getDriverDashboardStats } from "@/lib/supabase/jobs"
import { DashboardClient } from "@/components/mobile/dashboard-client"
import { Suspense } from "react"
import DashboardLoading from "./loading"

export const dynamic = 'force-dynamic'

async function DashboardContent() {
  const session = await getDriverSession()
  if (!session) redirect("/mobile/login")
  // เจ้าของสังกัดไม่มีแดชบอร์ดคนขับ → ไปหน้าใบสรุปจ่าย
  if (session.subId && !session.driverId) redirect("/mobile/payslips")

  const { stats, currentJob, activeJobs, gamification, todayIncome } = await getDriverDashboardStats(session.driverId) || {
      stats: { total: 0, completed: 0 }, 
      todayIncome: 0,
      gamification: { points: 0, rank: 'Bronze', nextRankPoints: 300, monthlyCompleted: 0 },
      currentJob: null,
      activeJobs: []
  }

  return (
    <DashboardClient 
      session={session}
      currentJob={currentJob}
      activeJobs={activeJobs}
      gamification={gamification}
      todayIncome={todayIncome ?? 0}
    />
  )
}

export default function MobileDashboard() {
  return (
    <div className="relative w-full bg-background pt-16 overflow-hidden">
      <MobileHeader title="DD Service" />

      <div className="relative z-10">
        <Suspense fallback={<DashboardLoading />}>
          <DashboardContent />
        </Suspense>
      </div>
    </div>
  )
}
