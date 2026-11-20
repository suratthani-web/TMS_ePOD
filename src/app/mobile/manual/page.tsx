import { MobileHeader } from "@/components/mobile/mobile-header"
import { ManualClient } from "./manual-client"

export default function MobileManualPage() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="fixed top-0 left-0 right-0 z-50">
        <MobileHeader title="คู่มือการใช้งาน" showBack />
      </div>

      <ManualClient />
    </div>
  )
}
