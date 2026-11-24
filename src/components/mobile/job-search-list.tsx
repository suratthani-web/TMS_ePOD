"use client"

import { useState } from "react"
import Link from "next/link"
import { Search, MapPin, ChevronRight, Calendar, Truck } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Job } from "@/types/database"
import { extractSoNumbers, formatSoLabel } from "@/lib/utils/so-helpers"

type MobileJobListItem = Pick<Job, "Job_ID" | "Customer_Name" | "Dest_Location" | "Route_Name" | "Job_Status"> & {
  Pickup_Date?: string | null
  Delivery_Date?: string | null
  original_destinations_json?: unknown
  Ref_No?: string | null
}

const fmtDayMonth = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) : null

// Map any Job_Status the system uses onto a driver-facing label + colour.
// Admins close jobs with several closed statuses (Delivered/Billed/Paid/Closed/…);
// the previous switch only handled Completed/Verified, so every other closed
// status fell through to "รอเริ่มงาน" and looked like the status never changed.
const SUCCESS_STATUSES = ['Completed', 'Complete', 'Delivered', 'Finished', 'Closed', 'Billed', 'Paid']
const ACTIVE_STATUSES = ['In Progress', 'In Transit', 'Arrived', 'Arrived Pickup', 'Arrived Dropoff', 'Picked Up']
function statusMeta(status?: string | null): { label: string; className: string } {
  const s = status || ''
  if (s === 'Verified') return { label: 'สำเร็จ (ตรวจสอบแล้ว)', className: 'bg-emerald-100 text-emerald-700' }
  if (SUCCESS_STATUSES.includes(s)) return { label: 'สำเร็จ', className: 'bg-emerald-100 text-emerald-700' }
  if (s === 'Rejected') return { label: 'ถูกปฏิเสธ', className: 'bg-destructive/10 text-destructive' }
  if (s === 'Cancelled' || s === 'Canceled') return { label: 'ยกเลิก', className: 'bg-destructive/10 text-destructive' }
  if (s === 'SOS') return { label: 'ฉุกเฉิน (SOS)', className: 'bg-destructive/10 text-destructive' }
  if (ACTIVE_STATUSES.includes(s)) return { label: 'กำลังดำเนินการ', className: 'bg-primary/10 text-primary' }
  return { label: 'รอเริ่มงาน', className: 'bg-muted text-muted-foreground' }
}

export function MobileJobSearchList({ jobs }: { jobs: MobileJobListItem[] }) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredJobs = jobs.filter(job => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    
    // Support searching the full Job_ID, individual tokens (comma separated) or customer names
    return (
      job.Job_ID.toLowerCase().includes(q) ||
      (job.Customer_Name || "").toLowerCase().includes(q) ||
      (job.Dest_Location || "").toLowerCase().includes(q) ||
      (job.Route_Name || "").toLowerCase().includes(q) ||
      extractSoNumbers(job.original_destinations_json, job.Ref_No).some(so => so.toLowerCase().includes(q))
    );
  })

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-foreground transition-colors">
          <Search size={18} />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ค้นหาเลขงาน, ชื่อลูกค้า, ปลายทาง..."
          className="w-full h-12 pl-11 pr-4 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 transition-all font-medium text-sm"
          style={{ boxShadow: 'var(--pd-lift-1)' }}
        />
      </div>

      {searchQuery && (
        <p className="text-[11px] text-muted-foreground px-1 pd-num">พบ {filteredJobs.length} รายการ</p>
      )}

      {/* Job List */}
      <div className="space-y-2.5">
        {filteredJobs.length === 0 ? (
          <div className="text-center py-16 rounded-2xl" style={{ background: 'var(--pd-paper)', border: '1px dashed var(--pd-line)' }}>
            <Truck className="text-muted-foreground/40 mx-auto mb-3" size={40} />
            <p className="text-muted-foreground font-semibold text-sm">ไม่พบรายการงาน</p>
            <p className="text-muted-foreground/70 text-xs mt-1">ลองปรับตัวกรองหรือคำค้นหา</p>
          </div>
        ) : filteredJobs.map((job) => {
          const meta = statusMeta(job.Job_Status)
          return (
          <Link href={`/mobile/jobs/${job.Job_ID}`} key={job.Job_ID} className="block active:scale-[0.98] transition-all">
            <div className="bg-card p-4 rounded-2xl border border-border space-y-3" style={{ boxShadow: 'var(--pd-lift-1)' }}>
              {/* Customer + status */}
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-foreground leading-tight truncate">{job.Customer_Name || 'ไม่ระบุลูกค้า'}</h3>
                  <p className="text-[11px] font-medium text-muted-foreground mt-0.5 pd-num">#{job.Job_ID.toUpperCase()}</p>
                  {(() => {
                    const soLabel = formatSoLabel(job.original_destinations_json, job.Ref_No)
                    return soLabel ? (
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold truncate max-w-full">
                        SO: {soLabel}
                      </span>
                    ) : null
                  })()}
                </div>
                <div className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap shrink-0", meta.className)}>
                  {meta.label}
                </div>
              </div>

              {/* Route + dates */}
              <div className="flex items-center gap-2.5 pt-2.5" style={{ borderTop: '1px solid var(--pd-line-2)' }}>
                <MapPin size={15} className="shrink-0" style={{ color: 'var(--pd-hi)' }} />
                <p className="text-[13px] font-medium text-foreground truncate flex-1">
                  {job.Dest_Location || job.Route_Name || 'ไม่ระบุปลายทาง'}
                </p>
                <ChevronRight size={18} className="text-muted-foreground/40 shrink-0" />
              </div>
              <div className="flex items-center gap-3 -mt-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--pd-go)' }}>
                  <Calendar size={12} /> รับ {fmtDayMonth(job.Pickup_Date) || "ไม่ระบุ"}
                </span>
                {job.Delivery_Date && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--pd-hi-ink)' }}>
                    <MapPin size={12} /> ส่ง {fmtDayMonth(job.Delivery_Date)}
                  </span>
                )}
              </div>
            </div>
          </Link>
          )
        })}
      </div>
    </div>
  )
}
