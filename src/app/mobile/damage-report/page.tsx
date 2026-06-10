import { getDriverSession } from "@/lib/actions/auth-actions"
import { redirect } from "next/navigation"
import { getMyDamageReports, type DamageReport } from "@/lib/supabase/damage-reports"
import { MobileDamageClient } from "./damage-client"
import { createClient } from "@/utils/supabase/server"
import { Suspense } from "react"
import { MobileHeader } from "@/components/mobile/mobile-header"

export const dynamic = 'force-dynamic'

type RecentDamageJob = {
  Job_ID: string
  Plan_Date: string | null
  Customer_Name: string | null
  Vehicle_Plate: string | null
}

async function DamageReportContent() {
  const session = await getDriverSession()
  if (!session) redirect("/mobile/login")

  let reports: DamageReport[] = []
  let jobs: RecentDamageJob[] = []

  try {
    reports = await getMyDamageReports(session.driverId)
    
    // Fetch recent active jobs for the dropdown
    const supabase = await createClient()
    const { data } = await supabase
      .from('Jobs_Main')
      .select('Job_ID, Plan_Date, Customer_Name, Vehicle_Plate')
      .eq('Driver_ID', session.driverId)
      .neq('Job_Status', 'Cancelled')
      .order('Created_At', { ascending: false })
      .limit(20)
    
    jobs = (data || []) as RecentDamageJob[]
  } catch (err) {
    console.error("Damage Report Data Fetch Error:", err)
  }

  return (
    <MobileDamageClient 
      driverId={session.driverId}
      driverName={session.name || session.driverId}
      initialReports={reports}
      recentJobs={jobs}
    />
  )
}

export default function MobileDamagePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background pt-20 px-4">
        <MobileHeader title="แจ้งปัญหา/เคลม" showBack />
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground font-bold">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    }>
      <DamageReportContent />
    </Suspense>
  )
}
