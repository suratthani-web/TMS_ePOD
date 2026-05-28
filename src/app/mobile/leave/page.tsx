import { getDriverSession } from "@/lib/actions/auth-actions"
import { redirect } from "next/navigation"
import { getMyLeaves } from "@/lib/supabase/driver-leaves"
import { MobileLeaveClient } from "./leave-client"
import { Suspense } from "react"
import { MobileHeader } from "@/components/mobile/mobile-header"

export const dynamic = 'force-dynamic'

async function LeavePageContent() {
  const session = await getDriverSession()
  if (!session) redirect("/mobile/login")

  let leaves: any[] = []
  try {
    leaves = await getMyLeaves(session.driverId)
  } catch (err) {
    console.error("Leave Data Fetch Error:", err)
  }

  return (
    <MobileLeaveClient 
      driverId={session.driverId}
      driverName={session.name || session.driverId}
      initialLeaves={leaves}
    />
  )
}

export default function MobileLeavePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background pt-20 px-4">
        <MobileHeader title="แจ้งลางาน" showBack />
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground font-bold">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    }>
      <LeavePageContent />
    </Suspense>
  )
}
