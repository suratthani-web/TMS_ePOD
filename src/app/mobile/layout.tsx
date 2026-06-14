export const dynamic = 'force-dynamic'

import { BottomNav } from "@/components/mobile/bottom-nav"
import { LocationTracker } from "@/components/mobile/location-tracker"
import { PermissionRequester } from "@/components/mobile/permission-requester"
import { getDriverSession } from "@/lib/actions/auth-actions"
import { SyncManager } from "@/components/mobile/sync-manager"
import { SessionStabilizer } from "@/components/mobile/session-stabilizer"
import { SWUpdater } from "@/components/mobile/sw-updater"
import { PresenceManager } from "@/components/mobile/presence-manager"
import { RealtimeJobsTrigger } from "@/components/mobile/realtime-jobs-trigger"

export default async function MobileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getDriverSession()
  
  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-background text-foreground relative">
      <SyncManager />
      <SWUpdater />
      <SessionStabilizer session={session} />
      {session && <LocationTracker driverId={session.driverId} branchId={session.branchId} />}
      {session && <PermissionRequester driverId={session.driverId} />}
      {session?.driverId && <PresenceManager driverId={session.driverId} />}
      {session?.driverId && <RealtimeJobsTrigger driverId={session.driverId} />}
      
      <main className="flex-1 overflow-y-auto custom-scrollbar relative z-0">
        {children}
      </main>

      {session && <BottomNav />}
    </div>
  )
}
