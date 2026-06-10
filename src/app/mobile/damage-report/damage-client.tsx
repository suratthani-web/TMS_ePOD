"use client"

import { useState, useRef } from "react"
import { MobileHeader } from "@/components/mobile/mobile-header"
import { createDamageReport, getMyDamageReports, DamageReport } from "@/lib/supabase/damage-reports"
import { AlertOctagon, CheckCircle2, Send, Camera, FileText, X, Image as ImageIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

const CATEGORIES = [
  { value: 'อุบัติเหตุ', label: '💥 อุบัติเหตุ', color: 'bg-red-500/10 text-red-500 border-red-500/20' },
  { value: 'สินค้าชำรุด', label: '📦 สินค้าชำรุด', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  { value: 'สินค้าสูญหาย', label: '❓ สินค้าสูญหาย', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  { value: 'อื่นๆ', label: '📝 อื่นๆ', color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
]

interface RecentJob {
  Job_ID: string
  Plan_Date: string | null
  Customer_Name: string | null
  Vehicle_Plate: string | null
}

interface Props {
  driverId: string
  driverName: string
  initialReports: DamageReport[]
  recentJobs: RecentJob[]
}

export function MobileDamageClient({ driverId, driverName, initialReports, recentJobs }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [jobId, setJobId] = useState('')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [category, setCategory] = useState('')
  const [incidentDate, setIncidentDate] = useState(new Date().toISOString().split('T')[0])
  const [desc, setDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [reports, setReports] = useState(initialReports)
  const [image, setImage] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleJobSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const jId = e.target.value
    setJobId(jId)
    const job = recentJobs.find(j => j.Job_ID === jId)
    if (job?.Vehicle_Plate) {
      setVehiclePlate(job.Vehicle_Plate)
    }
  }

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async () => {
    if (!jobId || !category || !incidentDate) {
        toast.error("กรุณากรอกข้อมูลให้ครบถ้วน")
        return
    }
    setSubmitting(true)
    
    try {
        const result = await createDamageReport({
          Job_ID: jobId,
          Driver_ID: driverId,
          Driver_Name: driverName,
          Vehicle_Plate: vehiclePlate,
          Incident_Date: incidentDate,
          Reason_Category: category,
          Description: desc,
          Image_Base64: image || undefined // Added support for image
        })
        
        if (result.success) {
          setSuccess(true)
          setShowForm(false)
          setJobId('')
          setCategory('')
          setDesc('')
          setImage(null)
          
          const updated = await getMyDamageReports(driverId)
          setReports(updated)
          toast.success("ส่งรายงานเรียบร้อยแล้ว")
          setTimeout(() => setSuccess(false), 3000)
        } else {
            toast.error("ไม่สามารถส่งรายงานได้ กรุณาลองใหม่")
        }
    } catch (err) {
        toast.error("เกิดข้อผิดพลาดในการส่งข้อมูล")
    } finally {
        setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-32 pt-20 px-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-red-500/5 rounded-full blur-[100px] -translate-y-1/2 pointer-events-none" />
      
      <MobileHeader title="แจ้งปัญหา & เคลม" showBack />

      <div className="relative z-10 space-y-6 mt-4">
        {/* Create Button Section */}
        {!showForm ? (
          <div className="space-y-4">
            <div className="px-1">
                <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase italic">รายงานปัญหา</h2>
                <p className="text-muted-foreground text-sm font-bold">แจ้งอุบัติเหตุหรือสินค้าเสียหายทันที</p>
            </div>
            
            <button
                onClick={() => setShowForm(true)}
                className="w-full bg-gradient-to-r from-red-600 to-red-500 text-white rounded-[2.5rem] p-8 text-left relative overflow-hidden shadow-2xl shadow-red-600/20 active:scale-95 transition-all group"
            >
                <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                    <AlertOctagon size={100} />
                </div>
                <div className="relative z-10 flex flex-col gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                        <AlertOctagon size={32} className="text-red-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-black italic uppercase">สร้างรายงานใหม่</p>
                        <p className="text-sm font-bold opacity-60">กดที่นี่เพื่อแจ้งเหตุฉุกเฉิน</p>
                    </div>
                </div>
            </button>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-[3rem] border-red-500/20 p-8 space-y-8 shadow-2xl"
          >
            <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black text-foreground italic uppercase">🚨 รายละเอียดเหตุการณ์</h3>
                <button onClick={() => setShowForm(false)} className="p-2 bg-muted rounded-full text-muted-foreground">
                    <X size={20} />
                </button>
            </div>

            <div className="space-y-6">
                {/* Select Job */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">เลือกงานที่เกิดปัญหา</p>
                  <select
                    value={jobId}
                    onChange={handleJobSelect}
                    className="w-full h-16 px-6 rounded-2xl bg-card border border-border/10 text-foreground font-bold text-lg focus:ring-2 focus:ring-red-500/20 transition-all outline-none appearance-none"
                  >
                    <option value="">-- เลือกรายการงาน --</option>
                    {recentJobs.length === 0 ? (
                        <option disabled>ไม่มีงานในประวัติล่าสุด</option>
                    ) : recentJobs.map(j => (
                      <option key={j.Job_ID} value={j.Job_ID}>
                        #{String(j.Job_ID).slice(-8)} ({j.Customer_Name})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category Grid */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">ประเภทของปัญหา</p>
                  <div className="grid grid-cols-2 gap-3">
                    {CATEGORIES.map(t => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setCategory(t.value)}
                        className={cn(
                            "h-16 rounded-2xl border-2 flex items-center justify-center font-black text-sm transition-all",
                             category === t.value ? "bg-primary text-white border-primary scale-[1.02] shadow-lg shadow-primary/20" : "bg-muted/50 text-muted-foreground border-transparent hover:border-muted"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Photo Capture */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">หลักฐานภาพถ่าย</p>
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleCapture}
                  />
                  
                  {image ? (
                    <div className="relative rounded-[2rem] overflow-hidden border-2 border-red-500/20 aspect-video group">
                        <img src={image} alt="Captured" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="p-4 bg-white rounded-full text-foreground shadow-xl"
                            >
                                <Camera size={24} />
                            </button>
                            <button 
                                onClick={() => setImage(null)}
                                className="p-4 bg-red-500 rounded-full text-white shadow-xl"
                            >
                                <X size={24} />
                            </button>
                        </div>
                    </div>
                  ) : (
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full aspect-video rounded-[2.5rem] border-2 border-dashed border-muted-foreground/20 bg-muted/30 flex flex-col items-center justify-center gap-3 text-muted-foreground hover:bg-muted/50 transition-all active:scale-95"
                    >
                        <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center shadow-lg">
                            <Camera size={32} />
                        </div>
                        <p className="text-base font-black italic uppercase">แตะเพื่อถ่ายรูป</p>
                    </button>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">รายละเอียดเพิ่มเติม</p>
                  <textarea
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    placeholder="อธิบายเหตุการณ์ที่เกิดขึ้น..."
                    rows={3}
                    className="w-full p-6 rounded-2xl bg-card border border-border/10 text-foreground font-bold focus:ring-2 focus:ring-red-500/20 outline-none resize-none"
                  />
                </div>

                {/* Submit Button */}
                <Button
                    onClick={handleSubmit}
                    disabled={!jobId || !category || submitting}
                    className="w-full h-18 rounded-[2rem] bg-red-600 hover:bg-red-700 text-white font-black text-xl italic uppercase tracking-[0.1em] shadow-2xl shadow-red-600/30 active:scale-95 transition-all"
                >
                    {submitting ? (
                        <>
                            <Loader2 className="mr-2 animate-spin" />
                            กำลังส่งข้อมูล...
                        </>
                    ) : (
                        <>
                            <Send className="mr-2" size={24} />
                            ส่งรายงานด่วน
                        </>
                    )}
                </Button>
            </div>
          </motion.div>
        )}

        {/* History Section */}
        <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between px-1">
                <h3 className="text-xl font-black text-foreground uppercase italic flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-muted rounded-full" />
                    ประวัติการแจ้งเหตุ
                </h3>
                <Badge variant="outline" className="rounded-xl border-muted text-muted-foreground">{reports.length} รายการ</Badge>
            </div>

            {reports.length === 0 ? (
                <div className="glass-panel rounded-[2.5rem] p-12 text-center border-dashed border-border/20">
                    <FileText className="mx-auto mb-4 text-muted-foreground/30" size={48} />
                    <p className="text-muted-foreground font-bold italic uppercase tracking-widest">ยังไม่เคยมีรายงานในระบบ</p>
                </div>
            ) : (
                <div className="space-y-4 pb-10">
                    {reports.map((report) => (
                        <div key={report.id} className="glass-panel rounded-[2.5rem] p-6 border-border/5 bg-gradient-to-br from-card to-transparent shadow-lg">
                            <div className="flex justify-between items-start mb-4">
                                <div className="space-y-1">
                                    <div className="px-3 py-1 bg-red-500/10 rounded-xl border border-red-500/20 inline-block">
                                        <span className="text-red-500 font-black text-[10px] uppercase tracking-widest">{report.Reason_Category}</span>
                                    </div>
                                    <h4 className="text-lg font-black text-foreground tracking-tighter">#{String(report.Job_ID).slice(-8)}</h4>
                                </div>
                                <div className={cn(
                                    "px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest border shadow-sm",
                                    report.Status === 'Resolved' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                )}>
                                    {report.Status === 'Resolved' ? 'ตรวจสอบแล้ว' : 'รอการตรวจสอบ'}
                                </div>
                            </div>
                            
                            {report.Description && (
                                <p className="text-muted-foreground text-sm font-bold mb-4 line-clamp-2 italic leading-relaxed">
                                    "{report.Description}"
                                </p>
                            )}

                            <div className="flex items-center justify-between pt-4 border-t border-border/5">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <FileText size={14} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">
                                        {new Date(report.Created_At).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-primary">
                                    <ImageIcon size={14} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">ATTACHED</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  )
}


