import { createClient, createAdminClient } from "@/utils/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, User, Clock, FileText, ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"
import { getAdminSession } from "@/lib/actions/auth-actions"
import { cn } from "@/lib/utils"
import { LeaveActionsClient } from "./leave-actions-client"
import Link from "next/link"
import type { DriverLeave } from "@/lib/supabase/driver-leaves"

export const dynamic = 'force-dynamic'

export default async function AdminLeavesPage() {
  const session = await getAdminSession()
  if (!session) redirect("/login")

  const supabase = await createAdminClient()
  const { getUserBranchId, isSuperAdmin } = await import("@/lib/permissions")
  const branchId = await getUserBranchId()
  const isSuper = await isSuperAdmin()

  let query = supabase
    .from('Driver_Leaves')
    .select('*, Master_Drivers!inner(Branch_ID)')

  if (branchId && branchId !== 'All' && !isSuper) {
    query = query.eq('Master_Drivers.Branch_ID', branchId)
  }

  const { data: leaves, error } = await query
    .order('Created_At', { ascending: false })

  return (
    <div className="space-y-8 pb-20 p-4 lg:p-10">
        {/* Tactical Elite Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-background/60 backdrop-blur-3xl p-8 rounded-3xl border border-primary/20 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
            
            <div className="relative z-10 space-y-4">
                <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.1em] text-xs font-bold group/back italic leading-none">
                    <ArrowLeft className="w-3.5 h-3.5 group-hover/back:-translate-x-1 transition-transform" /> 
                    ศูนย์ควบคุม (COMMAND CENTRE)
                </Link>
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-primary/20 rounded-xl border-2 border-primary/30 shadow-[0_0_20px_rgba(255,30,133,0.3)] text-primary group-hover:scale-110 transition-all duration-500">
                        <Calendar size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-widest uppercase leading-none italic premium-text-gradient">
                            การลาของพนักงาน
                        </h1>
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.6em] mt-1 opacity-80 italic">Operator Availability & Schedule Matrix</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-end gap-3 relative z-10">
                <div className="bg-primary/10 border border-primary/20 px-5 py-2 rounded-xl flex items-center gap-3 backdrop-blur-md shadow-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(255,30,133,1)]" />
                    <span className="text-primary font-black uppercase tracking-widest italic text-xs">{leaves?.filter((l: { Status?: string | null }) => l.Status === 'Pending').length || 0} รายการรอตรวจ</span>
                </div>
            </div>
        </div>

        <div className="grid gap-4">
              {(!leaves || leaves.length === 0) ? (
                  <div className="bg-muted/30 rounded-2xl p-16 text-center border-2 border-dashed border-border/10">
                      <Calendar className="mx-auto mb-4 text-muted-foreground opacity-20" size={48} />
                      <p className="text-muted-foreground font-black text-sm uppercase tracking-widest">ไม่มีคำขอลาในขณะนี้</p>
                  </div>
              ) : (
                  leaves.map((leave: DriverLeave) => (
                      <Card key={leave.id} className="rounded-2xl border border-border/5 shadow-lg overflow-hidden group hover:border-primary/20 transition-all">
                          <div className={cn(
                              "h-1.5",
                              leave.Status === 'Approved' ? "bg-emerald-500" : 
                              leave.Status === 'Rejected' ? "bg-red-500" : "bg-amber-500"
                          )} />
                          <CardContent className="p-6">
                              <div className="flex flex-col md:flex-row justify-between gap-6">
                                  <div className="space-y-4 flex-1">
                                      <div className="flex items-center gap-4">
                                          <div className={cn(
                                              "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500 border",
                                              leave.Status === 'Approved' ? "bg-emerald-500/10 border-emerald-500/20" : 
                                              leave.Status === 'Rejected' ? "bg-red-500/10 border-red-500/20" : "bg-muted/50 border-border/10"
                                          )}>
                                              <User size={20} strokeWidth={2.5} className={cn(
                                                  leave.Status === 'Approved' ? "text-emerald-500" : 
                                                  leave.Status === 'Rejected' ? "text-red-500" : "text-foreground"
                                              )} />
                                          </div>
                                          <div>
                                              <h3 className="text-xl font-black text-foreground leading-tight uppercase italic">{leave.Driver_Name || 'ไม่ระบุชื่อ'}</h3>
                                              <div className="flex items-center gap-2 mt-0.5">
                                                  <Badge variant="outline" className="rounded-md bg-primary/5 text-primary border-primary/20 font-black text-[9px] uppercase tracking-widest">{leave.Leave_Type}</Badge>
                                              </div>
                                          </div>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border/5">
                                              <Calendar className="text-primary" size={16} />
                                              <div>
                                                  <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">ช่วงเวลาที่ลา</p>
                                                  <p className="text-foreground font-black text-xs uppercase">
                                                      {new Date(leave.Start_Date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}
                                                      {" - "}
                                                      {new Date(leave.End_Date).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })}
                                                  </p>
                                              </div>
                                          </div>
                                          <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border/5">
                                              <Clock className="text-accent" size={16} />
                                              <div>
                                                  <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">สถานะรายการ</p>
                                                  <p className={cn(
                                                      "font-black uppercase tracking-widest text-xs",
                                                      leave.Status === 'Approved' ? "text-emerald-500" : 
                                                      leave.Status === 'Rejected' ? "text-red-500" : "text-amber-500"
                                                  )}>
                                                      {leave.Status === 'Approved' ? 'อนุมัติแล้ว' : 
                                                       leave.Status === 'Rejected' ? 'ปฏิเสธแล้ว' : 'รอการพิจารณา'}
                                                  </p>
                                              </div>
                                          </div>
                                      </div>

                                      <div className="p-4 bg-muted/20 rounded-xl border border-border/5 italic text-muted-foreground font-bold relative overflow-hidden text-sm">
                                          <div className="flex items-center gap-2 mb-1.5 text-muted-foreground/40 relative z-10">
                                              <FileText size={12} />
                                              <span className="text-[8px] font-black uppercase tracking-widest italic">Reasoning & Log Data</span>
                                          </div>
                                          <p className="relative z-10 uppercase tracking-tight font-black">"{leave.Reason || 'ไม่ได้ระบุเหตุผล'}"</p>
                                          <FileText size={60} className="absolute bottom-[-20%] right-[-5%] text-foreground/[0.03] -rotate-12 pointer-events-none" />
                                      </div>
                                  </div>

                                  {leave.Status === 'Pending' && (
                                      <div className="pt-2">
                                        <LeaveActionsClient leaveId={leave.id} />
                                      </div>
                                  )}
                              </div>
                          </CardContent>
                      </Card>
                  ))
              )}
          </div>
    </div>
  )
}
