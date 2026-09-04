import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { createAdminClient } from "@/lib/supabase/admin"
import { getJobRouteAdherence } from "@/lib/supabase/route-adherence"
import { ArrowLeft, MapPin, Route, Navigation, CheckCircle2, AlertTriangle, ExternalLink, PackageCheck } from "lucide-react"
import Link from "next/link"
import { DropReorder } from "@/components/mobile/drop-reorder"
import { getJobScanSummary } from "@/lib/actions/scan-actions"

export const dynamic = 'force-dynamic'

export default async function AdminJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: job } = await supabase
    .from('Jobs_Main')
    .select('Job_ID, Customer_Name, Driver_Name, Vehicle_Plate, Route_Name, Origin_Location, Dest_Location, Job_Status, Plan_Date, Est_Distance_KM, Total_Drop, original_destinations_json, Signature_Url')
    .eq('Job_ID', id)
    .single()

  const adherence = await getJobRouteAdherence(id)
  const scanSummary = await getJobScanSummary(id)

  // รายการจุดส่งทั้งหมด (multi-drop + จุดย่อยที่คนขับเพิ่มหน้างาน เช่น โกดัง)
  const allDrops: { name?: string; so_no?: string }[] = (() => {
    try {
      const raw = (job as { original_destinations_json?: string | unknown[] } | null)?.original_destinations_json
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  })()

  // จุดที่ส่งแล้ว = จำนวนลายเซ็น (ล็อกไว้ ห้ามจัดลำดับ)
  const completedDrops = (job as { Signature_Url?: string | null } | null)?.Signature_Url
    ? String((job as { Signature_Url?: string | null }).Signature_Url).split(',').filter(Boolean).length
    : 0

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-10 space-y-8 max-w-5xl mx-auto">
        <Link href="/jobs/history" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all text-sm font-bold">
          <ArrowLeft className="w-4 h-4" /> กลับไปประวัติงาน
        </Link>

        {/* Header */}
        <div className="bg-background/60 border border-border/10 rounded-3xl p-8 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-primary/10 rounded-2xl text-primary"><Navigation size={24} /></div>
            <div>
              <h1 className="text-2xl font-black text-foreground">{job?.Job_ID || id}</h1>
              <p className="text-sm text-muted-foreground font-bold">{job?.Customer_Name || '-'} · {job?.Job_Status || '-'}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted-foreground text-xs font-bold block">คนขับ</span><span className="font-bold">{job?.Driver_Name || '-'}</span></div>
            <div><span className="text-muted-foreground text-xs font-bold block">ทะเบียนรถ</span><span className="font-bold">{job?.Vehicle_Plate || '-'}</span></div>
            <div><span className="text-muted-foreground text-xs font-bold block">เส้นทาง</span><span className="font-bold">{job?.Route_Name || `${job?.Origin_Location || '?'} → ${job?.Dest_Location || '?'}`}</span></div>
            <div><span className="text-muted-foreground text-xs font-bold block">วันที่</span><span className="font-bold">{job?.Plan_Date ? new Date(job.Plan_Date).toLocaleDateString('th-TH') : '-'}</span></div>
          </div>

          {/* จุดส่งทั้งหมด (multi-drop) — แอดมินจัดลำดับใหม่ได้ */}
          {allDrops.length > 1 && (
            <div className="mt-6 pt-5 border-t border-border/10">
              <DropReorder
                jobId={job?.Job_ID || id}
                destinations={allDrops}
                completedDrops={completedDrops}
                locked={['Completed', 'Verified', 'Rejected'].includes(job?.Job_Status || '')}
              />
            </div>
          )}
        </div>

        {/* สรุปการสแกนสินค้า (รับ vs ส่ง) */}
        {scanSummary.hasData && (() => {
          const shortfall = scanSummary.totalReceived - scanSummary.totalDelivered
          const anyMismatch = scanSummary.items.some(i => i.received === 0 && i.delivered > 0)
          const anyShort = scanSummary.items.some(i => i.delivered < i.received)
          const complete = scanSummary.totalReceived > 0 && !anyMismatch && !anyShort
          return (
            <div className="bg-background/60 border border-border/10 rounded-3xl p-8 shadow-lg">
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                <PackageCheck className="text-primary" size={20} />
                <h2 className="text-lg font-black text-foreground">สแกนสินค้า (รับ / ส่ง)</h2>
                {scanSummary.totalReceived > 0 && (
                  complete ? (
                    <span className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 font-bold text-sm">
                      <CheckCircle2 size={16} /> ส่งครบ-ถูกต้อง
                    </span>
                  ) : anyMismatch ? (
                    <span className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-red-600 font-bold text-sm">
                      <AlertTriangle size={16} /> ส่งผิดรหัส/นอกรายการ
                    </span>
                  ) : (
                    <span className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 text-amber-600 font-bold text-sm">
                      <AlertTriangle size={16} /> ส่งขาด {shortfall > 0 ? `${shortfall} ชิ้น` : ""}
                    </span>
                  )
                )}
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <Stat label="รับเข้า (ชิ้น)" value={String(scanSummary.totalReceived)} />
                <Stat label="ส่งแล้ว (ชิ้น)" value={String(scanSummary.totalDelivered)} />
                <Stat label="คงเหลือ (ชิ้น)" value={shortfall > 0 ? String(shortfall) : "0"} tone={shortfall > 0 ? 'warn' : 'ok'} />
              </div>

              {scanSummary.items.length > 0 && (
                <div className="overflow-x-auto rounded-2xl border border-border/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground text-xs font-black uppercase tracking-widest">
                        <th className="text-left px-4 py-3">สินค้า</th>
                        <th className="text-right px-4 py-3">รับ</th>
                        <th className="text-right px-4 py-3">ส่ง</th>
                        <th className="text-right px-4 py-3">เหลือ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanSummary.items.map((it) => {
                        const rem = it.received - it.delivered
                        return (
                          <tr key={it.key} className="border-t border-border/5">
                            <td className="px-4 py-3">
                              <span className="font-bold text-foreground">{it.label}</span>
                              {it.code && it.code !== it.label && (
                                <span className="block text-[10px] text-muted-foreground font-mono">{it.code}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-bold">{it.received}</td>
                            <td className="px-4 py-3 text-right font-bold">{it.delivered}</td>
                            <td className={`px-4 py-3 text-right font-black ${rem > 0 ? 'text-amber-600' : rem < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {rem > 0 ? rem : rem < 0 ? `เกิน ${Math.abs(rem)}` : '✓'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {scanSummary.drops.length > 0 && (
                <div className="mt-6 space-y-3">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">การส่งแยกตามดรอป</p>
                  {scanSummary.drops.map((d) => (
                    <div key={String(d.dropIndex)} className="rounded-2xl bg-muted/30 border border-border/5 p-4">
                      <p className="font-bold text-sm mb-1">
                        {d.dropIndex != null && allDrops[d.dropIndex]?.name
                          ? `ดรอป ${d.dropIndex + 1}: ${allDrops[d.dropIndex]?.name}`
                          : d.dropIndex != null ? `ดรอป ${d.dropIndex + 1}` : 'ไม่ระบุดรอป'}
                        <span className="text-muted-foreground font-medium"> · {d.total} ชิ้น</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {d.items.map(i => `${i.label} ×${i.qty}`).join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* 6.4 — แผน vs วิ่งจริง (เก็บจาก GPS อัตโนมัติ) */}
        <div className="bg-background/60 border border-border/10 rounded-3xl p-8 shadow-lg">
          <div className="flex items-center gap-2 mb-6">
            <Route className="text-primary" size={20} />
            <h2 className="text-lg font-black text-foreground">แผน vs วิ่งจริง</h2>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-2">เก็บจาก GPS อัตโนมัติ</span>
          </div>

          {!adherence || !adherence.hasGps ? (
            <p className="text-sm text-muted-foreground italic py-6 text-center">
              ยังไม่มีข้อมูล GPS เพียงพอสำหรับงานนี้ (คนขับอาจยังไม่ได้เริ่มวิ่ง หรือไม่ได้เปิดตำแหน่ง)
            </p>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="ระยะประเมิน (แผน)" value={adherence.plannedKm != null ? `${adherence.plannedKm} กม.` : '-'} />
                <Stat label="ระยะวิ่งจริง (GPS)" value={adherence.actualKm != null ? `${adherence.actualKm} กม.` : '-'} />
                <Stat
                  label="ต่างจากแผน"
                  value={adherence.deviationPct != null ? `${adherence.deviationPct > 0 ? '+' : ''}${adherence.deviationPct}%` : '-'}
                  tone={adherence.offRoute ? 'warn' : 'ok'}
                />
                <Stat label="ผ่านจุดที่วางแผน" value={`${adherence.stopsVisited}/${adherence.stopsTotal}`} />
              </div>

              <div className="flex items-center gap-2 text-sm flex-wrap">
                {adherence.offRoute ? (
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 text-amber-600 font-bold">
                    <AlertTriangle size={16} /> วิ่งเกินแผนมาก ({adherence.deviationPct}%) — อาจมีการเลี่ยงเส้นทาง/จุดเพิ่ม
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 font-bold">
                    <CheckCircle2 size={16} /> วิ่งใกล้เคียงแผน
                  </span>
                )}
                <span className="text-xs text-muted-foreground">({adherence.gpsPoints} จุด GPS)</span>
              </div>

              <p className="text-xs text-muted-foreground italic">
                * ระยะประเมินเป็นเที่ยวเดียว ระยะวิ่งจริงอาจรวมเที่ยวกลับ/เลี่ยงรถติด — ใช้ดูแนวโน้ม ไม่ใช่ค่าตายตัว
              </p>
            </div>
          )}

          <Link href={`/track/${id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-6 text-primary font-bold text-sm hover:underline">
            <MapPin size={14} /> ดูแผนที่/ไทม์ไลน์เต็ม <ExternalLink size={12} />
          </Link>
        </div>
      </div>
    </DashboardLayout>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="p-4 rounded-2xl bg-muted/40 border border-border/5">
      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1">{label}</span>
      <span className={`text-xl font-black ${tone === 'warn' ? 'text-amber-600' : tone === 'ok' ? 'text-emerald-600' : 'text-foreground'}`}>{value}</span>
    </div>
  )
}
