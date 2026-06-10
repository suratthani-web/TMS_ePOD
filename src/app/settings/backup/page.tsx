"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Database, ArrowLeft, Download, FileJson, ShieldCheck, Zap, HardDrive, Share2, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { useLanguage } from "@/components/providers/language-provider"

export default function BackupSettingsPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleBackup = async (table: string) => {
    setLoading(true)
    try {
        const supabase = createClient()
        const { data, error } = await supabase.from(table).select('*')
        if (error) throw error
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${table}_backup_${new Date().toISOString().split('T')[0]}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success(`สำรองข้อมูลตาราง ${table} สำเร็จแล้ว`)
    } catch (error) {
        toast.error("การสำรองข้อมูลล้มเหลว: " + (error instanceof Error ? error.message : "Unknown error"))
    } finally {
        setLoading(false)
    }
  }

  const backupItems = [
    { label: "บันทึกงานขนส่ง", table: "Jobs_Main", desc: "ข้อมูลการดำเนินงานหลักและประวัติงานวิ่งทั้งหมด" },
    { label: "ทะเบียนผู้ใช้งาน", table: "Master_Users", desc: "ข้อมูลบัญชีผู้ใช้ สิทธิ์ และประวัติพนักงาน" },
    { label: "คลังข้อมูลยานพาหนะ", table: "Master_Vehicles", desc: "ข้อมูลรถ ทะเบียน และข้อกำหนดทางเทคนิค" },
    { label: "บันทึกการใช้พลังงาน", table: "Fuel_Logs", desc: "ข้อมูลการเติมน้ำมันและสถิติประสิทธิภาพเชื้อเพลิง" },
    { label: "ข้อมูลซ่อมบำรุง", table: "Repair_Tickets", desc: "ประวัติการซ่อมและสถานะทางเทคนิคของอุปกรณ์" },
    { label: "ฐานข้อมูลลูกค้า", table: "Master_Customers", desc: "ข้อมูลบริษัทคู่ค้าและรายละเอียดผู้ว่าจ้าง" },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-12 pb-20 p-4 lg:p-10 max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-card p-8 md:p-10 rounded-2xl border border-border shadow-sm relative overflow-hidden group">
            
            <div className="relative z-10 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-emerald-500 transition-all text-sm font-semibold group/back">
                    <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                    {t('common.back')}
                </button>
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-emerald-500">
                        <Database size={42} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-foreground leading-tight">
                            คลังข้อมูลระบบ
                        </h1>
                        <p className="text-base font-semibold text-muted-foreground mt-2">{t('settings.items.vault_desc')}</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-4 relative z-10">
                <div className="bg-muted/50 border border-border px-4 py-2 rounded-xl flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-sm font-medium text-muted-foreground">สถานะคลัง: พร้อมใช้งาน</span>
                </div>
                <div className="flex items-center gap-3 bg-emerald-500/10 px-4 py-3 rounded-xl border border-emerald-500/20">
                   <ShieldCheck className="text-emerald-500" size={18} />
                   <span className="text-sm font-semibold text-foreground">ระบบเข้ารหัสข้อมูลเปิดทำงาน</span>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {backupItems.map((item) => (
              <PremiumCard key={item.table} className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden group/vault hover:border-emerald-500/30 transition-all duration-300">
                  <div className="p-8 space-y-6">
                      <div className="flex justify-between items-start">
                          <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              <FileJson size={28} />
                          </div>
                          <div className="flex items-center gap-2 opacity-70 transition-opacity">
                             <Zap size={14} className="text-emerald-500" />
                             <span className="text-sm font-medium text-muted-foreground">พร้อมส่งออก</span>
                          </div>
                      </div>
                      
                      <div>
                          <h3 className="text-xl font-black text-foreground group-hover/vault:text-emerald-600 transition-colors">{item.label}</h3>
                          <p className="text-sm font-medium text-muted-foreground mt-2 min-h-10">
                            {item.desc}
                          </p>
                      </div>

                      <div className="space-y-4 pt-4">
                           <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                                <span>โปรโตคอล: JSON_EXPORT</span>
                                <span>สถานะ: ปกติ</span>
                           </div>
                           <PremiumButton 
                              variant="outline" 
                              className="w-full h-12 rounded-xl gap-3 bg-muted/50 border-border hover:bg-emerald-600 hover:text-white hover:border-emerald-500 transition-all shadow-sm font-semibold text-sm" 
                              onClick={() => handleBackup(item.table)}
                              disabled={loading}
                           >
                              {loading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                              ดึงข้อมูลสำรอง
                           </PremiumButton>
                      </div>
                  </div>
              </PremiumCard>
          ))}
        </div>

        {/* Advisory */}
        <div className="mt-12 p-8 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 flex flex-col md:flex-row gap-6 items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-emerald-500/5 to-transparent pointer-events-none" />
            <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <HardDrive size={32} />
            </div>
            <div className="space-y-4 text-center md:text-left flex-1">
                <p className="text-lg font-semibold text-emerald-500">ข้อแนะนำการสำรองข้อมูล</p>
                <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                    ข้อมูลสำรองจะถูกบันทึกในรูปแบบไฟล์ JSON ที่มีความแม่นยำสูง สำหรับการกู้คืนข้อมูลหรือย้ายระบบ กรุณาตรวจสอบความครบถ้วนของข้อมูลก่อนนำไปใช้งานในเครื่องสำรอง <br />
                    ระบบจะทำการซิงค์ข้อมูลอัตโนมัติทุกๆ รอบวันเวลา 00:00 UTC
                </p>
            </div>
            <PremiumButton variant="outline" className="h-12 px-6 rounded-xl border-border text-foreground gap-3 font-bold text-sm ml-auto">
                <Share2 size={18} /> ซิงค์ข้อมูลภายนอก
            </PremiumButton>
        </div>
      </div>
    </DashboardLayout>
  )
}
