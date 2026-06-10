export const dynamic = 'force-dynamic'

import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { getDriverLeaves } from "@/lib/supabase/driver-leaves"
import { CalendarDays, ArrowLeft, User, CheckCircle2, XCircle, Clock } from "lucide-react"
import Link from "next/link"
import { PremiumCard } from "@/components/ui/premium-card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'รออนุมัติ' },
  Approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'อนุมัติแล้ว' },
  Rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'ไม่อนุมัติ' },
}

const LEAVE_TYPE_STYLES: Record<string, string> = {
  'ลาป่วย': 'bg-red-50 text-red-600 border-red-200',
  'ลากิจ': 'bg-blue-50 text-blue-600 border-blue-200',
  'ลาพักร้อน': 'bg-emerald-50 text-emerald-600 border-emerald-200',
}

export default async function DriverSchedulePage() {
  const leaves = await getDriverLeaves()

  const pendingCount = leaves.filter(l => l.Status === 'Pending').length

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-20">
        {/* Tactical Registry Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-background/60 backdrop-blur-3xl p-8 rounded-3xl border border-primary/20 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
            
            <div className="relative z-10 space-y-4">
                <Link href="/drivers" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.1em] text-xs font-bold group/back italic leading-none">
                    <ArrowLeft className="w-3.5 h-3.5 group-hover/back:-translate-x-1 transition-transform" /> 
                    ย้อนกลับ
                </Link>
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-primary/20 rounded-xl border-2 border-primary/30 shadow-[0_0_20px_rgba(255,30,133,0.3)] text-primary group-hover:scale-110 transition-all duration-500">
                        <CalendarDays size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-widest uppercase leading-none italic premium-text-gradient">
                            ตารางเวร / ใบลาคนขับ
                        </h1>
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.6em] mt-1 opacity-80 italic">Operator Availability & Schedule Matrix</p>
                    </div>
                </div>
            </div>

            {pendingCount > 0 && (
                <div className="flex flex-col items-end gap-3 relative z-10">
                    <div className="bg-amber-500/10 border border-amber-500/20 px-5 py-2 rounded-xl flex items-center gap-3 backdrop-blur-md shadow-lg">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,1)]" />
                        <span className="text-amber-500 font-black uppercase tracking-widest italic text-xs">มี {pendingCount} ใบลารออนุมัติ</span>
                    </div>
                </div>
            )}
        </div>

        {/* Leave List Registry */}
        <PremiumCard className="bg-background/40 border border-border shadow-xl rounded-3xl overflow-hidden group/registry">
          <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] pointer-events-none" />
            <h2 className="text-lg font-black text-foreground tracking-tight uppercase italic relative z-10 flex items-center gap-2">
                <div className="w-1 h-6 bg-primary rounded-full" />
                รายการใบลาทั้งหมด
            </h2>
          </div>

          {leaves.length === 0 ? (
            <div className="p-24 text-center space-y-4">
              <CalendarDays size={48} strokeWidth={1.5} className="mx-auto text-muted-foreground opacity-20 animate-pulse" />
              <p className="text-muted-foreground font-black uppercase tracking-widest text-sm italic">ไม่มีใบลาในเดือนนี้</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.02]">
              {leaves.map(leave => {
                const statusStyle = STATUS_STYLES[leave.Status] || STATUS_STYLES.Pending
                const leaveStyle = LEAVE_TYPE_STYLES[leave.Leave_Type] || 'bg-gray-50 text-gray-600 border-gray-200'
                const startDate = new Date(leave.Start_Date + 'T00:00:00')
                const endDate = new Date(leave.End_Date + 'T00:00:00')
                const days = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1

                return (
                  <div key={leave.id} className="px-8 py-6 flex items-center gap-6 group/item hover:bg-primary/[0.02] transition-colors">
                    <div className="flex-shrink-0">
                      <div className={cn(
                          "w-12 h-12 rounded-xl border flex items-center justify-center transition-all duration-500 group-hover/item:scale-110 shadow-lg",
                          leave.Status === 'Approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                          leave.Status === 'Rejected' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' :
                          'bg-amber-500/10 border-amber-500/20 text-amber-500'
                      )}>
                        {leave.Status === 'Approved' && <CheckCircle2 size={24} />}
                        {leave.Status === 'Rejected' && <XCircle size={24} />}
                        {leave.Status === 'Pending' && <Clock size={24} className="animate-pulse" />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 mb-1.5">
                        <span className="flex items-center gap-2 font-black text-foreground text-sm uppercase italic">
                          <User size={14} className="text-primary" /> {leave.Driver_Name || leave.Driver_ID}
                        </span>
                        <Badge variant="outline" className={cn("font-black text-[9px] uppercase tracking-widest rounded-md border shadow-sm", leaveStyle)}>
                          {leave.Leave_Type}
                        </Badge>
                        <span className={cn(
                            "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border",
                            leave.Status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            leave.Status === 'Rejected' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                            'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        )}>
                          {statusStyle.label}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        📅 {startDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        {days > 1 ? ` — ${endDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}` : ''}
                        {' '}({days} วัน)
                      </p>
                      {leave.Reason && (
                        <p className="text-xs font-black text-muted-foreground/40 mt-1 uppercase italic truncate max-w-2xl">💬 {leave.Reason}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </PremiumCard>
      </div>
    </DashboardLayout>
  )
}

