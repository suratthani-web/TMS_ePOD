"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function MobileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[MOBILE] Route error:", error)
  }, [error])

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-6 text-center gap-5">
      <div className="w-20 h-20 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center border border-destructive/20">
        <AlertTriangle size={36} />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-foreground">เกิดข้อผิดพลาด</h1>
        <p className="text-muted-foreground text-sm max-w-[260px]">
          ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง หากยังไม่หายให้ปิดและเปิดแอปใหม่
        </p>
      </div>
      <Button
        onClick={() => reset()}
        className="h-12 px-6 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95 transition-all gap-2"
      >
        <RefreshCw size={18} />
        ลองใหม่อีกครั้ง
      </Button>
    </div>
  )
}
