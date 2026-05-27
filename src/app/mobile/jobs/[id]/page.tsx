import { getDriverSession } from "@/lib/actions/auth-actions"
import { redirect } from "next/navigation"
import { getJobById } from "@/lib/supabase/jobs"
import { JobDetailClient } from "@/components/mobile/job-detail-client"

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ success?: string }>
}

export default async function JobDetailPage(props: Props) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const success = searchParams.success;
  
  const session = await getDriverSession()
  if (!session) redirect("/mobile/login")

  const job = await getJobById(params.id)

  if (!job) {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center text-muted-foreground gap-4 p-6 text-center">
            <p className="text-lg font-bold">ไม่พบข้อมูลงาน</p>
            <a href="/mobile/dashboard" className="text-primary font-black uppercase tracking-widest text-lg font-bold">กลับหน้าหลัก</a>
        </div>
    )
  }

  return (
    <JobDetailClient job={job} success={success} />
  )
}
