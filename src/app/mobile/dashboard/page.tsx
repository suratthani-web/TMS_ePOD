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
      todayIncome={todayIncome}
    />
  )
}

export default function MobileDashboard() {
  return (
    <div className="relative w-full bg-transparent pt-16 px-4 overflow-hidden">
      {/* Animated Background Mesh */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/5 rounded-full blur-[120px] animate-pulse delay-1000" />
        <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] bg-teal-500/10 rounded-full blur-[100px] animate-pulse delay-500" />
      </div>

      <MobileHeader title="TMS Elite" />
      
      <div className="relative z-10">
        <Suspense fallback={<DashboardLoading />}>
          <DashboardContent />
        </Suspense>
      </div>
    </div>
  )
}
