import { Loader2 } from "lucide-react"

export default function JobDetailLoading() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <Loader2 className="animate-spin text-primary mb-4" size={40} />
      <p className="text-muted-foreground font-bold">กำลังโหลดข้อมูลงาน...</p>
    </div>
  )
}
