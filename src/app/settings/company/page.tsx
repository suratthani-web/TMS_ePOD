"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { getCompanyProfile, saveCompanyProfile, uploadCompanyLogo } from "@/lib/supabase/settings"
import {
  Building,
  Upload,
  Save,
  Phone,
  Mail,
  MapPin,
  FileText,
  Globe,
  CreditCard,
  ImageIcon,
  Loader2,
  ArrowLeft,
  ShieldCheck,
  Target,
  UserCheck
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/components/providers/language-provider"

export default function CompanySettingsPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    company_name: "",
    company_name_en: "",
    tax_id: "",
    branch: t('settings_pages.branches.hub_matrix.main_hub'),
    address: "",
    phone: "",
    fax: "",
    email: "",
    website: "",
    bank_name: "",
    bank_account_name: "",
    bank_account_no: "",
    logo_url: ""
  })

  const loadSettings = useCallback(async () => {
    const profile = await getCompanyProfile()
    if (profile) {
        setFormData(prev => ({ ...prev, ...profile }))
        if (profile.logo_url) setLogoPreview(profile.logo_url)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const updateForm = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onloadend = () => {
      setLogoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)

    setUploading(true)
    try {
      const result = await uploadCompanyLogo(file)
      if (result.success && result.url) {
        updateForm("logo_url", result.url)
        toast.success(t('settings_pages.company.toasts.logo_success'))
      } else {
        toast.error(t('settings_pages.company.toasts.logo_failed') + (result.error?.message || "Unknown error"))
      }
    } catch {
      toast.error(t('settings_pages.company.toasts.upload_error'))
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const result = await saveCompanyProfile(formData)
      if (result.success) {
        toast.success(t('settings_pages.company.toasts.save_success'))
      } else {
        throw result.error
      }
    } catch {
      toast.error(t('settings_pages.company.toasts.save_failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-12 pb-20 p-4 lg:p-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-card p-8 md:p-10 rounded-2xl border border-border shadow-sm relative overflow-hidden group">
            <div className="relative z-10 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all text-sm font-semibold group/back">
                    <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                    {t('settings_pages.company.command_control')}
                </button>
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
                        <Building size={42} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-foreground leading-tight">
                            {t('settings_pages.company.title')}
                        </h1>
                        <p className="text-base font-semibold text-muted-foreground mt-2">{t('settings_pages.company.subtitle')}</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-4 relative z-10">
                <div className="bg-muted/50 border border-border px-4 py-2 rounded-xl flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-sm font-semibold text-muted-foreground">{t('settings_pages.company.profile_status')}</span>
                </div>
                <PremiumButton 
                    onClick={handleSave} 
                    disabled={loading} 
                    className="h-12 px-6 rounded-xl bg-primary text-primary-foreground border-0 shadow-sm gap-3 text-base font-bold"
                >
                    {loading ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}
                    {t('settings_pages.company.commit_changes')}
                </PremiumButton>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Logo Entity Card */}
          <div className="lg:col-span-4 lg:sticky lg:top-10 h-fit">
            <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden group/logo">
                <div className="p-10 border-b border-border bg-muted/25 relative overflow-hidden">
                    <h3 className="text-lg font-black text-foreground flex items-center gap-3">
                        <ImageIcon size={20} className="text-primary" />
                        {t('settings_pages.company.visual_signature')}
                    </h3>
                </div>
                <div className="p-10 space-y-8 flex flex-col items-center">
                    <div 
                        className="w-64 h-64 rounded-2xl border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 transition-all bg-muted/25 overflow-hidden relative group/upload"
                        onClick={() => !uploading && fileInputRef.current?.click()}
                    >
                        {uploading && (
                            <div className="absolute inset-0 bg-muted/30 flex flex-col items-center justify-center z-10 backdrop-blur-md">
                                <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                                <span className="text-sm font-semibold text-primary">{t('settings_pages.company.uploading')}</span>
                            </div>
                        )}
                        {logoPreview ? (
                            <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-8 group-hover/upload:scale-105 transition-transform duration-700" />
                        ) : (
                            <div className="text-center space-y-4">
                                <div className="p-6 bg-muted/50 rounded-full border border-border text-muted-foreground group-hover/upload:text-primary group-hover/upload:bg-primary/20 transition-all">
                                    <Upload size={40} />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-base font-semibold text-foreground">{t('settings_pages.company.init_uplink')}</p>
                                    <p className="text-sm font-medium text-muted-foreground">PNG/JPG, max 2MB</p>
                                </div>
                            </div>
                        )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    
                    <div className="w-full p-6 rounded-3xl bg-muted/50 border border-border text-center">
                         <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                            {t('settings_pages.company.optimal_dims')} <br />
                            {t('settings_pages.company.alpha_channel')}
                         </p>
                    </div>

                    {logoPreview && (
                      <PremiumButton 
                        variant="outline" 
                        className="w-full h-12 rounded-xl border-rose-500/20 text-rose-500 bg-rose-500/5 hover:bg-rose-600 hover:text-white transition-all text-sm font-semibold"
                        onClick={() => setLogoPreview(null)}
                      >
                        {t('settings_pages.company.purge_signature')}
                      </PremiumButton>
                    )}
                </div>
            </PremiumCard>
          </div>

          {/* Form Details */}
          <div className="lg:col-span-8 space-y-10">
            {/* General Intelligence */}
            <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden group/info">
                <div className="p-10 border-b border-border bg-muted/25 flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-foreground flex items-center gap-3">
                        <FileText size={20} className="text-primary" />
                        {t('settings_pages.company.entity_params')}
                    </h3>
                    <div className="px-4 py-1.5 rounded-xl bg-primary/10 text-sm font-semibold text-primary border border-primary/20">
                        {t('settings_pages.company.general_intel')}
                    </div>
                </div>
                <div className="p-12 space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.company.entity_name_th')}</Label>
                            <Input
                                value={formData.company_name}
                                onChange={(e) => updateForm("company_name", e.target.value)}
                                placeholder={t('settings_pages.company.placeholders.company_name_th')}
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-medium pl-5"
                            />
                        </div>
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.company.entity_name_en')}</Label>
                            <Input
                                value={formData.company_name_en}
                                onChange={(e) => updateForm("company_name_en", e.target.value)}
                                placeholder={t('settings_pages.company.placeholders.company_name_en')}
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-medium pl-5"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                <CreditCard size={12} /> {t('settings_pages.company.tax_id')}
                            </Label>
                            <Input
                                value={formData.tax_id}
                                onChange={(e) => updateForm("tax_id", e.target.value)}
                                placeholder={t('settings_pages.company.placeholders.tax_id')}
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-medium pl-5"
                            />
                        </div>
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.company.node_designation')}</Label>
                            <Input
                                value={formData.branch}
                                onChange={(e) => updateForm("branch", e.target.value)}
                                placeholder={t('settings_pages.company.placeholders.branch')}
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-medium pl-5"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Label className="text-sm font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                            <MapPin size={12} /> {t('settings_pages.company.geospatial_core')}
                        </Label>
                        <Textarea
                            value={formData.address}
                            onChange={(e) => updateForm("address", e.target.value)}
                            placeholder={t('settings_pages.company.placeholders.address')}
                            className="bg-muted/25 border-border rounded-xl text-foreground font-medium p-5 min-h-[120px] focus:border-primary/50 transition-all resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                <Phone size={12} /> {t('settings_pages.company.voice_link')}
                            </Label>
                            <Input
                                value={formData.phone}
                                onChange={(e) => updateForm("phone", e.target.value)}
                                placeholder={t('settings_pages.company.placeholders.phone')}
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-medium pl-5"
                            />
                        </div>
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.company.fax_link')}</Label>
                            <Input
                                value={formData.fax}
                                onChange={(e) => updateForm("fax", e.target.value)}
                                placeholder={t('settings_pages.company.placeholders.fax')}
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-medium pl-5"
                            />
                        </div>
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                <Mail size={12} /> {t('settings_pages.company.signal_smtp')}
                            </Label>
                            <Input
                                type="email"
                                value={formData.email}
                                onChange={(e) => updateForm("email", e.target.value)}
                                placeholder="info@..."
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-medium pl-5"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Label className="text-sm font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                            <Globe size={12} /> {t('settings_pages.company.digital_domain')}
                        </Label>
                        <Input
                            value={formData.website}
                            onChange={(e) => updateForm("website", e.target.value)}
                            placeholder="https://..."
                            className="h-14 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-medium pl-5"
                        />
                    </div>
                </div>
            </PremiumCard>

            {/* Financial Config */}
            <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden group/finance">
                <div className="p-10 border-b border-border bg-muted/25 flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-foreground flex items-center gap-3">
                        <CreditCard size={20} className="text-indigo-400" />
                        {t('settings_pages.company.settlement_params')}
                    </h3>
                    <div className="px-4 py-1.5 rounded-xl bg-indigo-500/10 text-sm font-semibold text-indigo-500 border border-indigo-500/20">
                        {t('settings_pages.company.fiscal_config')}
                    </div>
                </div>
                <div className="p-12 space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.company.institution')}</Label>
                            <select
                                value={formData.bank_name}
                                onChange={(e) => updateForm("bank_name", e.target.value)}
                                className="w-full h-14 px-5 rounded-xl bg-muted/25 border border-border text-foreground font-medium focus:border-indigo-500/50 transition-all outline-none"
                            >
                                <option value="" className="bg-black">{t('settings_pages.company.select_link')}</option>
                                <option value="กรุงเทพ" className="bg-black text-foreground">{t('settings_pages.company.banks.bkk')}</option>
                                <option value="กสิกรไทย" className="bg-black text-foreground">{t('settings_pages.company.banks.kbank')}</option>
                                <option value="ไทยพาณิชย์" className="bg-black text-foreground">{t('settings_pages.company.banks.scb')}</option>
                                <option value="กรุงไทย" className="bg-black text-foreground">{t('settings_pages.company.banks.ktb')}</option>
                                <option value="ทหารไทยธนชาต" className="bg-black text-foreground">{t('settings_pages.company.banks.ttb')}</option>
                                <option value="กรุงศรี" className="bg-black text-foreground">{t('settings_pages.company.banks.bay')}</option>
                            </select>
                        </div>
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.company.account_holder')}</Label>
                            <Input
                                value={formData.bank_account_name}
                                onChange={(e) => updateForm("bank_account_name", e.target.value)}
                                placeholder={t('settings_pages.company.placeholders.account_holder')}
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-indigo-500/50 transition-all text-foreground font-medium pl-5"
                            />
                        </div>
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.company.account_number')}</Label>
                            <Input
                                value={formData.bank_account_no}
                                onChange={(e) => updateForm("bank_account_no", e.target.value)}
                                placeholder={t('settings_pages.company.placeholders.account_number')}
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-indigo-500/50 transition-all text-foreground font-medium pl-5"
                            />
                        </div>
                    </div>
                    
                    <div className="p-6 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <ShieldCheck size={40} className="text-indigo-400" />
                        </div>
                        <p className="text-sm font-medium text-indigo-500/80 leading-relaxed relative z-10">
                            {t('settings_pages.company.fiscal_warn')}
                        </p>
                    </div>
                </div>
            </PremiumCard>
          </div>
        </div>

        {/* Global Advisory */}
        <div className="mt-12 p-8 rounded-2xl bg-primary/5 border border-primary/10 flex flex-col md:flex-row gap-6 items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
            <div className="p-4 rounded-2xl bg-primary/10 text-primary border border-primary/20">
                <Target size={32} />
            </div>
            <div className="space-y-4 text-center md:text-left flex-1">
                <p className="text-lg font-semibold text-primary">{t('settings_pages.company.tactical_advisory')}</p>
                <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                    {t('settings_pages.company.advisory_desc')}
                </p>
            </div>
            <PremiumButton variant="outline" className="h-12 px-6 rounded-xl border-border text-foreground gap-3 font-bold text-sm ml-auto">
                <UserCheck size={18} /> {t('settings_pages.company.verify_identity')}
            </PremiumButton>
        </div>
      </div>
    </DashboardLayout>
  )
}

