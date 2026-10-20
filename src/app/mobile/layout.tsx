export const dynamic = 'force-dynamic'

import { BottomNav } from "@/components/mobile/bottom-nav"
import { LocationTracker } from "@/components/mobile/location-tracker"
import { LocationGate } from "@/components/mobile/location-gate"
import { PermissionRequester } from "@/components/mobile/permission-requester"
import { getDriverSession } from "@/lib/actions/auth-actions"
import { SyncManager } from "@/components/mobile/sync-manager"
import { SessionStabilizer } from "@/components/mobile/session-stabilizer"
import { SWUpdater } from "@/components/mobile/sw-updater"
import { PresenceManager } from "@/components/mobile/presence-manager"
import { RealtimeJobsTrigger } from "@/components/mobile/realtime-jobs-trigger"
import { JobReminder } from "@/components/mobile/job-reminder"

export default async function MobileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getDriverSession()
  
  return (
    <div className="tms-driver flex flex-col h-[100dvh] w-screen overflow-hidden bg-background text-foreground relative pt-[var(--sat)]">
      <SyncManager />
      <SWUpdater />
      <SessionStabilizer session={session} />
      {session && <LocationTracker driverId={session.driverId} branchId={session.branchId} />}
      {session && <LocationGate />}
      {session && <PermissionRequester driverId={session.driverId} />}
      {session?.driverId && <PresenceManager driverId={session.driverId} />}
      {session?.driverId && <RealtimeJobsTrigger driverId={session.driverId} />}
      {session?.driverId && <JobReminder driverId={session.driverId} />}
      
      {/* safe-area (รอยบาก/แถบสถานะ) เว้นที่ wrapper ด้านบน ไม่ใช่ใน main ที่ scroll
          → เลื่อนแล้วเนื้อหาไม่ไหลขึ้นไปซ้อนใต้นาฬิกา/แบต; เครื่องไม่มีรอยบาก --sat=0 */}
      <main className="flex-1 overflow-y-auto custom-scrollbar relative z-0">
        {children}
      </main>

      {session && <BottomNav />}
    </div>
  )
}
