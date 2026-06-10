"use client"

import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Save, Loader2, ArrowLeft, Fingerprint, ShieldCheck, Activity, Zap } from "lucide-react"
import Link from "next/link"
import { getUserProfile, updateUserProfile, UserProfile } from "@/lib/supabase/users"
import { toast } from "sonner"
import { useLanguage } from "@/components/providers/language-provider"

export default function AdminProfilePage() {
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    First_Name: "",
    Last_Name: "",
    Email: "",
    Username: "",
    Role: ""
  })

  useEffect(() => {
    async function loadProfile() {
      const profile = await getUserProfile()
      if (profile) {
        setFormData(profile)
      }
      setLoading(false)
    }
    loadProfile()
  }, [])

  const handleSave = async () => {
    if (!formData.First_Name?.trim()) {
        toast.error(t('settings_pages.profile.toasts.first_name_req'))
        return
    }
    if (!formData.Last_Name?.trim()) {
        toast.error(t('settings_pages.profile.toasts.last_name_req'))
        return
    }
    if (!formData.Email?.trim()) {
        toast.error(t('settings_pages.profile.toasts.email_req'))
        return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.Email)) {
        toast.error(t('settings_pages.profile.toasts.email_invalid'))
        return
    }

    setSaving(true)
    try {
        const result = await updateUserProfile(formData)
        if (result.success) {
            toast.success(t('settings_pages.profile.toasts.save_success'))
            const updatedProfile = await getUserProfile()
            if (updatedProfile) {
                setFormData(updatedProfile)
            }
        } else {
            toast.error(result.error || t('settings_pages.profile.toasts.save_failed'))
        }
    } catch {
        toast.error(t('settings_pages.profile.toasts.error'))
    } finally {
        setSaving(false)
    }
  }

  if (loading) {
      return (
          <DashboardLayout>
              <div className="flex items-center justify-center h-[60vh]">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" strokeWidth={3} />
              </div>
          </DashboardLayout>
      )
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-10 pb-20">
        <Link href="/settings" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.3em] text-base font-bold group italic">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            {t('settings_pages.profile.return_config')}
        </Link>

        {/* Tactical Profile Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 bg-background/60 backdrop-blur-3xl p-10 rounded-[3.5rem] border border-border shadow-2xl relative group overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none" />
            
            <div className="relative z-10 flex items-center gap-8">
                <div className="relative">
                    <div className="w-32 h-32 rounded-[2.5rem] bg-gradient-to-br from-primary via-indigo-500 to-accent p-1 shadow-2xl shadow-primary/20 rotate-3 group-hover:rotate-6 transition-transform duration-700">
                        <div className="w-full h-full rounded-[2.3rem] bg-background flex items-center justify-center text-foreground text-5xl font-black italic border-2 border-border overflow-hidden relative">
                            <div className="absolute inset-0 bg-primary/5" />
                            {(formData.First_Name || "A").charAt(0)}
                        </div>
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-background rounded-2xl border-2 border-primary flex items-center justify-center text-primary shadow-xl animate-pulse">
                        <Fingerprint size={20} />
                    </div>
                </div>
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Activity className="text-primary animate-pulse" size={16} />
                        <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em]">{t('settings_pages.profile.identity_node')}</span>
                    </div>
                    <h1 className="text-5xl font-black text-foreground tracking-tighter uppercase premium-text-gradient italic">
                        {t('settings_pages.profile.title')}
                    </h1>
                    <p className="text-muted-foreground font-bold text-xl tracking-wide opacity-80 uppercase tracking-widest italic leading-none">{t('settings_pages.profile.subtitle')}</p>
                </div>
            </div>

            <div className="flex items-center gap-4 bg-muted/50 p-4 rounded-2xl border border-border backdrop-blur-md relative z-10">
                <div className="flex flex-col items-end">
                    <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest">{t('settings_pages.profile.clearance_level')}</span>
                    <span className="text-lg font-bold font-black text-primary uppercase tracking-tighter">{formData.Role || 'USER'}</span>
                </div>
                <div className="p-3 bg-primary/20 rounded-xl">
                    <ShieldCheck className="text-primary" size={20} />
                </div>
            </div>
        </div>

        <PremiumCard className="bg-background/40 border-2 border-border shadow-3xl p-12 rounded-[4rem] relative overflow-hidden group/card">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.02] to-transparent pointer-events-none" />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                <div className="space-y-3">
                    <Label className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] mb-2 block ml-4">{t('settings_pages.profile.first_name')}</Label>
                    <Input 
                        value={formData.First_Name || ""}
                        onChange={(e) => setFormData({...formData, First_Name: e.target.value})}
                        className="h-16 rounded-2xl bg-background border-border text-foreground placeholder:text-muted-foreground px-8 focus-visible:ring-primary/40 focus:border-primary/50 transition-all text-xl font-black uppercase tracking-widest shadow-inner italic"
                        placeholder="FIRST_NAME"
                    />
                </div>
                <div className="space-y-3">
                    <Label className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] mb-2 block ml-4">{t('settings_pages.profile.last_name')}</Label>
                    <Input 
                        value={formData.Last_Name || ""}
                        onChange={(e) => setFormData({...formData, Last_Name: e.target.value})}
                        className="h-16 rounded-2xl bg-background border-border text-foreground placeholder:text-muted-foreground px-8 focus-visible:ring-primary/40 focus:border-primary/50 transition-all text-xl font-black uppercase tracking-widest shadow-inner italic"
                        placeholder="LAST_NAME"
                    />
                </div>
            </div>

            <div className="mt-10 space-y-3 relative z-10">
                <Label className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] mb-2 block ml-4">{t('settings_pages.profile.email')}</Label>
                <div className="relative group/input">
                    <Input 
                        value={formData.Email || ""}
                        onChange={(e) => setFormData({...formData, Email: e.target.value})}
                        className="h-16 rounded-2xl bg-background border-border text-foreground placeholder:text-muted-foreground px-8 focus-visible:ring-primary/40 focus:border-primary/50 transition-all text-xl font-black uppercase tracking-widest shadow-inner italic"
                        placeholder="EMAIL_ADDRESS"
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none opacity-20">
                        <Zap size={14} className="text-primary" />
                    </div>
                </div>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                <div className="space-y-3 opacity-50">
                    <Label className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] mb-2 block ml-4">{t('settings_pages.profile.username')}</Label>
                    <Input 
                        value={formData.Username || ""}
                        disabled
                        className="h-16 rounded-2xl bg-muted/25 border-border text-muted-foreground px-8 cursor-not-allowed text-xl font-black uppercase tracking-widest italic"
                    />
                </div>
                <div className="space-y-3 opacity-50">
                    <Label className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] mb-2 block ml-4">{t('settings_pages.profile.assigned_clearance')}</Label>
                    <Input 
                        value={formData.Role || "Node Operator"}
                        disabled
                        className="h-16 rounded-2xl bg-muted/25 border-border text-muted-foreground px-8 cursor-not-allowed text-xl font-black uppercase tracking-widest italic"
                    />
                </div>
            </div>

            <div className="mt-16 flex justify-end relative z-10">
                <PremiumButton 
                    onClick={handleSave} 
                    disabled={saving} 
                    className="h-20 px-12 rounded-[2rem] gap-4 shadow-[0_20px_50px_rgba(255,30,133,0.3)] hover:scale-105 transition-all text-base tracking-[0.2em]"
                >
                    {saving ? <Loader2 className="w-6 h-6 animate-spin" strokeWidth={3} /> : <Save className="w-6 h-6" strokeWidth={2.5} />}
                    {t('settings_pages.profile.sync_changes')}
                </PremiumButton>
            </div>
        </PremiumCard>

        <div className="text-center opacity-40 py-10">
            <p className="inline-flex items-center gap-3 px-6 py-2 bg-muted/50 rounded-full border border-border text-base font-bold font-black text-muted-foreground uppercase tracking-[0.6em]">
                {t('settings_pages.profile.session_active')}
            </p>
        </div>
      </div>
    </DashboardLayout>
  )
}

