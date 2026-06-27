import { getSession } from "@/lib/session"
import { redirect } from "next/navigation"
import { getPortalCustomerJobs, portalLogout } from "@/app/portal/actions"
import Link from "next/link"
import {
  Package, CheckCircle2, Clock, Truck, LogOut,
  Download, MapPin, Calendar, Search, ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils"

export const dynamic = 'force-dynamic'

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  'New':        { label: 'งานใหม่',       color: 'text-slate-600',  bg: 'bg-slate-100' },
  'Assigned':   { label: 'จัดรถแล้ว',     color: 'text-blue-600',   bg: 'bg-blue-50' },
  'Picked Up':  { label: 'รับสินค้าแล้ว', color: 'text-amber-600',  bg: 'bg-amber-50' },
  'In Transit': { label: 'กำลังส่ง',      color: 'text-indigo-600', bg: 'bg-indigo-50' },
  'Delivered':  { label: 'ส่งแล้ว',       color: 'text-emerald-600',bg: 'bg-emerald-50' },
  'Completed':  { label: 'เสร็จสมบูรณ์',  color: 'text-emerald-600',bg: 'bg-emerald-50' },
  'Verified':   { label: 'ยืนยันแล้ว',    color: 'text-emerald-700',bg: 'bg-emerald-100' },
  'Cancelled':  { label: 'ยกเลิก',        color: 'text-red-600',    bg: 'bg-red-50' },
}

function hasPOD(job: { Photo_Proof_Url?: string | null; Signature_Url?: string | null }) {
  return !!(job.Photo_Proof_Url || job.Signature_Url)
}

export default async function PortalJobsPage(props: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>
}) {
  const session = await getSession()
  if (!session?.customerId) redirect('/portal/login')

  const params = await props.searchParams
  const status = params.status || 'all'
  const search = params.search || ''
  const page = Number(params.page || 1)

  const { jobs, total } = await getPortalCustomerJobs(page, 20, status === 'all' ? undefined : status, search || undefined)
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-black text-slate-900 text-sm leading-none">Customer Portal</h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{session.username}</p>
            </div>
          </div>
          <form action={portalLogout}>
            <button type="submit" className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-red-500 transition-colors px-3 py-2 rounded-lg hover:bg-red-50">
              <LogOut className="w-4 h-4" />
              ออกจากระบบ
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard icon={<Package className="w-5 h-5" />} label="งานทั้งหมด" value={total} color="text-slate-700" />
          <SummaryCard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label="ส่งสำเร็จ"
            value={jobs.filter(j => ['Delivered','Completed','Verified'].includes(j.Job_Status)).length}
            color="text-emerald-600"
          />
          <SummaryCard
            icon={<Clock className="w-5 h-5" />}
            label="อยู่ระหว่างนำส่ง"
            value={jobs.filter(j => ['In Transit','Picked Up','Assigned'].includes(j.Job_Status)).length}
            color="text-blue-600"
          />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <form method="get" className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                name="search"
                defaultValue={search}
                placeholder="ค้นหาเลขงาน, ต้นทาง, ปลายทาง..."
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              name="status"
              defaultValue={status}
              className="h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="Assigned">จัดรถแล้ว</option>
              <option value="In Transit">กำลังส่ง</option>
              <option value="Delivered">ส่งแล้ว</option>
              <option value="Completed">เสร็จสมบูรณ์</option>
              <option value="Cancelled">ยกเลิก</option>
            </select>
            <button type="submit" className="h-10 px-4 bg-blue-600 text-white text-sm font-black rounded-lg hover:bg-blue-700 transition-colors">
              ค้นหา
            </button>
          </form>
        </div>

        {/* Job List */}
        <div className="space-y-2">
          {jobs.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-bold">ไม่พบข้อมูลงาน</p>
            </div>
          )}

          {jobs.map(job => {
            const statusInfo = STATUS_MAP[job.Job_Status] || { label: job.Job_Status, color: 'text-slate-500', bg: 'bg-slate-50' }
            const podAvailable = hasPOD(job)

            return (
              <div key={job.Job_ID} className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Job ID + Status */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-black text-slate-900 text-sm">{job.Job_ID}</span>
                      <span className={cn("text-xs font-black px-2 py-0.5 rounded-full", statusInfo.color, statusInfo.bg)}>
                        {statusInfo.label}
                      </span>
                      {podAvailable && (
                        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          มี POD
                        </span>
                      )}
                    </div>

                    {/* Route */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-2">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{job.Origin_Location || '-'}</span>
                      <ChevronRight className="w-3 h-3 shrink-0" />
                      <span className="truncate">{job.Dest_Location || '-'}</span>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400 font-medium">
                      {job.Plan_Date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(job.Plan_Date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </span>
                      )}
                      {job.Vehicle_Plate && (
                        <span className="flex items-center gap-1">
                          <Truck className="w-3 h-3" />
                          {job.Vehicle_Plate}
                        </span>
                      )}
                      {job.Driver_Name && (
                        <span>คนขับ: {job.Driver_Name}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <Link
                      href={`/track/${job.Job_ID}`}
                      target="_blank"
                      className="flex items-center gap-1 text-xs font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      ติดตาม
                    </Link>
                    {podAvailable && (
                      <Link
                        href={`/track/${job.Job_ID}#pod`}
                        target="_blank"
                        className="flex items-center gap-1 text-xs font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        POD
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            {page > 1 && (
              <Link href={`?status=${status}&search=${search}&page=${page - 1}`} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                ← ก่อนหน้า
              </Link>
            )}
            <span className="text-sm font-bold text-slate-500">หน้า {page} / {totalPages}</span>
            {page < totalPages && (
              <Link href={`?status=${status}&search=${search}&page=${page + 1}`} className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                ถัดไป →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number; color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
      <div className={cn("flex justify-center mb-1", color)}>{icon}</div>
      <div className={cn("text-2xl font-black tabular-nums", color)}>{value}</div>
      <div className="text-xs font-bold text-slate-400 mt-0.5">{label}</div>
    </div>
  )
}
