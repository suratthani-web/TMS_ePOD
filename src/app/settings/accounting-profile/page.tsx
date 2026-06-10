"use client"

import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { 
    Building, 
    ArrowLeft, 
    Save, 
    Loader2, 
    CreditCard, 
    User, 
    MapPin, 
    Hash,
    Phone,
    Mail,
    Globe,
    FileText,
    ShieldCheck
} from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useLanguage } from "@/components/providers/language-provider"
import { getSystemSetting, saveSystemSetting } from "@/lib/actions/system-settings-actions"

interface AccountingProfile {
  company_name_th: string
  company_name_en: string
  logo_url: string
  stamp_url: string
  tax_id: string
  address: string
  phone: string
  email: string
  website: string
  bank_name: string
  bank_account_no: string
  bank_account_name: string
  contact_name: string
  invoice_notes: string
}

const DEFAULT_PROFILE: AccountingProfile = {
  company_name_th: "",
  company_name_en: "",
  logo_url: "",
  stamp_url: "",
  tax_id: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  bank_name: "",
  bank_account_no: "",
  bank_account_name: "",
  contact_name: "",
  invoice_notes: ""
}

export default function AccountingProfilePage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [profile, setProfile] = useState<AccountingProfile>(DEFAULT_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let isMounted = true
    async function loadData() {
      try {
        const data = await getSystemSetting('accounting_profile', DEFAULT_PROFILE)
        if (isMounted) {
            setProfile(data)
            setLoading(false)
        }
      } catch (err) {
        console.error("Load error:", err)
        if (isMounted) setLoading(false)
      }
    }
    loadData()
    return () => { isMounted = false }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
        const result = await saveSystemSetting('accounting_profile', profile, 'Accounting Entity Details')
        if (result.success) {
            toast.success("บันทึกข้อมูลบัญชีเรียบร้อยแล้ว")
        } else {
            const errorMsg = typeof result.error === 'string' ? result.error : "Unknown Error"
            toast.error(`บันทึกไม่สำเร็จ: ${errorMsg}`)
        }
    } catch (err: unknown) {
        toast.error(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'Internal Server Error'}`)
    } finally {
        setSaving(false)
    }
  }

  if (loading) {
    return (
        <DashboardLayout>
            <div className="min-h-[60vh] flex items-center justify-center">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
            </div>
        </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-12 pb-20 p-4 lg:p-10 max-w-6xl mx-auto">
        {/* Tactical Header */}
        <div className="bg-background/60 backdrop-blur-3xl p-10 rounded-br-[6rem] rounded-tl-[3rem] border border-border shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
            
            <div className="relative z-10 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-blue-500 transition-all font-black uppercase tracking-[0.1em] text-base font-bold group/back italic">
                    <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                    ย้อนกลับ
                </button>
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-blue-500/20 rounded-[2.5rem] border-2 border-blue-500/30 shadow-[0_0_40px_rgba(59,130,246,0.2)] text-blue-400 group-hover:scale-110 transition-all duration-500">
                        <Building size={42} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-5xl font-black text-foreground tracking-widest uppercase leading-none italic premium-text-gradient">
                            ข้อมูลฝ่ายบัญชี
                        </h1>
                        <p className="text-base font-bold font-black text-blue-500 uppercase tracking-[0.6em] mt-2 opacity-80 italic">รายละเอียดนิติบุคคลสำหรับออกใบกำกับภาษีและใบแจ้งหนี้</p>
                    </div>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 gap-10">
            {/* Entity Details Card */}
            <PremiumCard className="p-10 rounded-[3.5rem] bg-card/40 border-2 border-border">
                <div className="flex items-center gap-4 mb-10 border-b border-border pb-6">
                    <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-500">
                        <FileText size={24} />
                    </div>
                    <h2 className="text-2xl font-black text-foreground uppercase tracking-widest italic">ข้อมูลนิติบุคคล (ผู้ขาย)</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">URL โลโก้บริษัท (สำหรับใบวางบิล)</label>
                        <div className="relative group">
                            <Globe className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input 
                                value={profile.logo_url}
                                onChange={e => setProfile({...profile, logo_url: e.target.value})}
                                className="w-full h-16 pl-14 pr-6 rounded-2xl bg-muted/20 border-2 border-transparent focus:border-blue-500/50 outline-none font-bold text-lg transition-all"
                                placeholder="https://your-domain.com/logo.png"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">URL ตราประทับบริษัท (Stamp)</label>
                        <div className="relative group">
                            <ShieldCheck className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input 
                                value={profile.stamp_url || ''}
                                onChange={e => setProfile({...profile, stamp_url: e.target.value})}
                                className="w-full h-16 pl-14 pr-6 rounded-2xl bg-muted/20 border-2 border-transparent focus:border-blue-500/50 outline-none font-bold text-lg transition-all"
                                placeholder="https://your-domain.com/stamp.png"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">ชื่อบริษัท (ไทย)</label>
                        <div className="relative group">
                            <Building className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input 
                                value={profile.company_name_th}
                                onChange={e => setProfile({...profile, company_name_th: e.target.value})}
                                className="w-full h-16 pl-14 pr-6 rounded-2xl bg-muted/20 border-2 border-transparent focus:border-blue-500/50 outline-none font-bold text-lg transition-all"
                                placeholder="บริษัท ทีเอ็มเอส จำกัด..."
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">ชื่อบริษัท (อังกฤษ)</label>
                        <div className="relative group">
                            <Globe className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input 
                                value={profile.company_name_en}
                                onChange={e => setProfile({...profile, company_name_en: e.target.value})}
                                className="w-full h-16 pl-14 pr-6 rounded-2xl bg-muted/20 border-2 border-transparent focus:border-blue-500/50 outline-none font-bold text-lg transition-all"
                                placeholder="TMS CO., LTD..."
                            />
                        </div>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">ที่อยู่จดทะเบียน (สำหรับออกใบกำกับ)</label>
                        <div className="relative group">
                            <MapPin className="absolute left-5 top-6 text-muted-foreground group-focus-within:text-blue-500 transition-colors" size={18} />
                            <textarea 
                                value={profile.address}
                                onChange={e => setProfile({...profile, address: e.target.value})}
                                rows={3}
                                className="w-full pl-14 pr-6 py-5 rounded-2xl bg-muted/20 border-2 border-transparent focus:border-blue-500/50 outline-none font-bold text-lg transition-all resize-none"
                                placeholder="ระบุที่ตั้งบริษัทตามทะเบียนภาษี..."
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">เลขประจำตัวผู้เสียภาษี</label>
                        <div className="relative group">
                            <Hash className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input 
                                value={profile.tax_id}
                                onChange={e => setProfile({...profile, tax_id: e.target.value})}
                                className="w-full h-16 pl-14 pr-6 rounded-2xl bg-muted/20 border-2 border-transparent focus:border-blue-500/50 outline-none font-bold text-lg transition-all"
                                placeholder="0123456789012"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">เบอร์โทรศัพท์ (บัญชี)</label>
                        <div className="relative group">
                            <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input 
                                value={profile.phone}
                                onChange={e => setProfile({...profile, phone: e.target.value})}
                                className="w-full h-16 pl-14 pr-6 rounded-2xl bg-muted/20 border-2 border-transparent focus:border-blue-500/50 outline-none font-bold text-lg transition-all"
                                placeholder="02-XXX-XXXX"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">อีเมลติดต่อ (บัญชี)</label>
                        <div className="relative group">
                            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-blue-500 transition-colors" size={18} />
                            <input 
                                value={profile.email}
                                onChange={e => setProfile({...profile, email: e.target.value})}
                                className="w-full h-16 pl-14 pr-6 rounded-2xl bg-muted/20 border-2 border-transparent focus:border-blue-500/50 outline-none font-bold text-lg transition-all"
                                placeholder="accounting@company.com"
                            />
                        </div>
                    </div>
                </div>
            </PremiumCard>

            {/* Settlement Details Card */}
            <PremiumCard className="p-10 rounded-[3.5rem] bg-card/40 border-2 border-border">
                <div className="flex items-center gap-4 mb-10 border-b border-border pb-6">
                    <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-500">
                        <CreditCard size={24} />
                    </div>
                    <h2 className="text-2xl font-black text-foreground uppercase tracking-widest italic">ข้อมูลการชำระเงิน (สำหรับลูกค้า)</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">ธนาคาร</label>
                        <input 
                            value={profile.bank_name}
                            onChange={e => setProfile({...profile, bank_name: e.target.value})}
                            className="w-full h-16 px-6 rounded-2xl bg-muted/20 border-2 border-transparent focus:border-emerald-500/50 outline-none font-bold text-lg transition-all"
                            placeholder="ธนาคารไทยพาณิชย์ (SCB)..."
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">เลขที่บัญชี</label>
                        <input 
                            value={profile.bank_account_no}
                            onChange={e => setProfile({...profile, bank_account_no: e.target.value})}
                            className="w-full h-16 px-6 rounded-2xl bg-muted/20 border-2 border-transparent focus:border-emerald-500/50 outline-none font-bold text-lg transition-all"
                            placeholder="000-0-00000-0"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">ชื่อบัญชี</label>
                        <input 
                            value={profile.bank_account_name}
                            onChange={e => setProfile({...profile, bank_account_name: e.target.value})}
                            className="w-full h-16 px-6 rounded-2xl bg-muted/20 border-2 border-transparent focus:border-emerald-500/50 outline-none font-bold text-lg transition-all"
                            placeholder="บริษัท ทีเอ็มเอส จำกัด"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">ชื่อผู้ติดต่อกลับ (ในใบวางบิล)</label>
                        <div className="relative group">
                            <User className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-emerald-500 transition-colors" size={18} />
                            <input 
                                value={profile.contact_name}
                                onChange={e => setProfile({...profile, contact_name: e.target.value})}
                                className="w-full h-16 pl-14 pr-6 rounded-2xl bg-muted/20 border-2 border-transparent focus:border-emerald-500/50 outline-none font-bold text-lg transition-all"
                                placeholder="ระบุชื่อเจ้าหน้าที่..."
                            />
                        </div>
                    </div>
                </div>
            </PremiumCard>

            {/* Additional Notes Card */}
            <PremiumCard className="p-10 rounded-[3.5rem] bg-card/40 border-2 border-border">
                <div className="flex items-center justify-between mb-10 border-b border-border pb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-500">
                            <ShieldCheck size={24} />
                        </div>
                        <h2 className="text-2xl font-black text-foreground uppercase tracking-widest italic">หมายเหตุท้ายเอกสาร</h2>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest ml-2">หมายเหตุเริ่มต้น (Invoice Notes)</label>
                    <textarea 
                        value={profile.invoice_notes}
                        onChange={e => setProfile({...profile, invoice_notes: e.target.value})}
                        rows={4}
                        className="w-full p-6 rounded-3xl bg-muted/20 border-2 border-transparent focus:border-amber-500/50 outline-none font-bold text-lg transition-all resize-none"
                        placeholder="ข้อความที่ต้องการให้แสดงท้ายใบแจ้งหนี้ทุกใบ..."
                    />
                </div>
            </PremiumCard>

            {/* Save Button */}
            <div className="flex justify-end pt-10">
                <PremiumButton 
                    disabled={saving}
                    onClick={handleSave}
                    className="h-20 px-16 rounded-[2rem] gap-4 shadow-[0_20px_50px_rgba(59,130,246,0.3)] text-xl italic"
                >
                    {saving ? <Loader2 className="animate-spin" /> : <Save size={24} />}
                    บันทึกข้อมูลฝ่ายบัญชี
                </PremiumButton>
            </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
