"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
    CloudSync, RefreshCcw, CheckCircle2, XCircle, ArrowLeft, 
    Save, Loader2, Key, Building2, Activity, Zap, ShieldCheck,
    Target, Link as LinkIcon, Cpu
} from "lucide-react"
import { checkAccountingConnection, saveAccountingSettings } from "@/app/settings/accounting/actions"
import { getSetting } from "@/lib/supabase/system_settings"
import { hasPermission } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"

export default function AccountingSettingsPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'connected' | 'failed'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const [apiKey, setApiKey] = useState("")
  const [companyId, setCompanyId] = useState("1")
  const [userEmail, setUserEmail] = useState("")
  const [loading, setLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)

  const loadSettings = useCallback(async () => {
    // Check permissions
    const [viewAllowed, manageAllowed] = await Promise.all([
      hasPermission('billing_view'),
      hasPermission('settings_company')
    ])

    if (!viewAllowed && !manageAllowed) {
      router.push('/')
      return
    }

    setCanManage(manageAllowed)

    const savedKey = await getSetting('akaunting_api_key', "")
    const savedCompany = await getSetting('akaunting_company_id', "1")
    const savedEmail = await getSetting('akaunting_user_email', "")
    setApiKey(savedKey)
    setCompanyId(savedCompany)
    setUserEmail(savedEmail)
    setLoading(false)
  }, [router])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSaveSettings = async () => {
    if (!canManage) return
    setSaving(true)
    const result = await saveAccountingSettings(apiKey, companyId, userEmail)
    setSaving(false)
    if (result.success) {
      toast.success(t('settings_pages.accounting.toasts.sync_success'))
      setStatus('idle')
    } else {
      toast.error(t('settings_pages.accounting.toasts.sync_failed') + result.message)
    }
  }

  const handleCheckConnection = async () => {
    setChecking(true)
    setErrorMsg(null)
    const result = await checkAccountingConnection()
    setChecking(false)
    if (result.success && result.connected) {
        setStatus('connected')
        toast.success(t('settings_pages.accounting.toasts.uplink_success'))
    } else {
        setStatus('failed')
        setErrorMsg(result.message || "Unknown connection error")
        toast.error(t('settings_pages.accounting.toasts.uplink_failed'))
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh] opacity-30">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-12 pb-20 p-4 lg:p-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-card p-8 md:p-10 rounded-2xl border border-border shadow-sm relative overflow-hidden group">
            
            <div className="relative z-10 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all text-sm font-semibold group/back">
                    <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                    {t('settings_pages.roles.config_back')}
                </button>
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
                        <CloudSync size={42} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-foreground leading-tight">
                            {t('settings_pages.accounting.interlink_title')}
                        </h1>
                        <p className="text-base font-semibold text-muted-foreground mt-2">{t('settings_pages.accounting.interlink_subtitle')}</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-4 relative z-10">
                <div className="bg-muted/50 border border-border px-4 py-2 rounded-xl flex items-center gap-3">
                    <div className={cn(
                        "w-2 h-2 rounded-full",
                        status === 'connected' ? "bg-emerald-500" : status === 'failed' ? "bg-rose-500" : "bg-primary"
                    )} />
                    <span className="text-sm font-semibold text-muted-foreground">
                        {t('settings_pages.accounting.uplink_status')}: {status === 'connected' ? t('settings_pages.accounting.status_established') : status === 'failed' ? t('settings_pages.accounting.status_interrupted') : t('settings_pages.accounting.status_standby')}
                    </span>
                </div>
                {canManage && (
                    <PremiumButton 
                        onClick={handleSaveSettings} 
                        disabled={saving}
                        className="h-12 px-6 rounded-xl bg-primary text-primary-foreground border-0 shadow-sm gap-3 text-sm font-bold"
                    >
                        {saving ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}
                        {t('settings_pages.accounting.commit_protocols')}
                    </PremiumButton>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
             {/* Credentials & Config */}
             <div className="lg:col-span-7 space-y-10">
                <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden group/cred">
                    <div className="p-10 border-b border-border bg-muted/25 flex items-center justify-between">
                        <h3 className="text-lg font-black text-foreground flex items-center gap-3">
                            <Key size={20} className="text-primary" />
                            {t('settings_pages.accounting.access_geometry')}
                        </h3>
                        <div className="px-4 py-1.5 rounded-xl bg-primary/10 text-sm font-semibold text-primary border border-primary/20">
                            {t('settings_pages.accounting.credentials')}
                        </div>
                    </div>
                    <div className="p-12 space-y-10">
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                <Cpu size={12} /> {t('settings_pages.accounting.api_vector')}
                            </Label>
                            <Input 
                                type="password"
                                placeholder="..."
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-mono font-semibold pl-5 shadow-inner"
                                disabled={!canManage}
                            />
                            <p className="text-sm font-medium text-muted-foreground ml-4">{t('settings_pages.accounting.api_hint')}</p>
                        </div>

                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4">{t('settings_pages.accounting.authorized_email')}</Label>
                            <Input 
                                type="email"
                                placeholder="operator@..."
                                value={userEmail}
                                onChange={(e) => setUserEmail(e.target.value)}
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-semibold pl-5 shadow-inner"
                                disabled={!canManage}
                            />
                        </div>
                        
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                 <Building2 size={12} /> {t('settings_pages.accounting.entity_identifier')}
                            </Label>
                            <Input 
                                placeholder="1"
                                value={companyId}
                                onChange={(e) => setCompanyId(e.target.value)}
                                className="h-14 bg-muted/25 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-semibold pl-5 shadow-inner max-w-[200px]"
                                disabled={!canManage}
                            />
                        </div>
                    </div>
                </PremiumCard>
             </div>

             {/* Connection Status & Analytics */}
             <div className="lg:col-span-5 space-y-10">
                <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden group/status">
                    <div className="p-10 border-b border-border bg-muted/25">
                        <h3 className="text-lg font-black text-foreground">{t('settings_pages.accounting.uplink_telemetry')}</h3>
                    </div>
                    <div className="p-12 space-y-10">
                        <div className="flex flex-col gap-8">
                            <div className="flex items-center justify-between p-6 bg-muted/25 rounded-2xl border border-border relative overflow-hidden">
                                <div className="flex items-center gap-6 relative z-10">
                                    <div className="p-4 bg-primary/10 rounded-2xl text-primary border border-primary/20 shadow-sm">
                                        <CloudSync size={28} strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <p className="text-lg font-black text-foreground">{t('settings_pages.accounting.akaunting_cloud')}</p>
                                        <p className="text-sm font-semibold text-emerald-500 mt-1">{t('settings_pages.accounting.sync_active')}</p>
                                    </div>
                                </div>
                                <div className="absolute top-0 right-0 w-32 h-full bg-primary/[0.03] pointer-events-none" />
                            </div>

                            <div className="flex flex-col gap-6">
                                <div className="flex items-center justify-center gap-6">
                                    {status === 'connected' && (
                                        <div className="flex items-center gap-3 text-sm font-semibold text-emerald-500 bg-emerald-500/10 px-5 py-3 rounded-xl border border-emerald-500/20 shadow-sm">
                                            <CheckCircle2 size={16} /> {t('settings_pages.accounting.signal_established')}
                                        </div>
                                    )}
                                    {status === 'failed' && (
                                        <div className="flex items-center gap-3 text-sm font-semibold text-rose-500 bg-rose-500/10 px-5 py-3 rounded-xl border border-rose-500/20 shadow-sm">
                                            <XCircle size={16} /> {t('settings_pages.accounting.signal_collapsed')}
                                        </div>
                                    )}
                                </div>
                                
                                <PremiumButton 
                                    variant="outline" 
                                    className="h-12 w-full rounded-xl gap-3 bg-muted/50 border-border hover:bg-muted/80 hover:border-primary/30 transition-all text-foreground font-bold text-sm"
                                    onClick={handleCheckConnection}
                                    disabled={checking || !apiKey}
                                >
                                    {checking ? <RefreshCcw size={20} className="animate-spin" /> : <RefreshCcw size={20} />}
                                    {t('settings_pages.accounting.run_uplink')}
                                </PremiumButton>
                            </div>
                        </div>

                        {status === 'failed' && errorMsg && (
                            <div className="p-8 bg-rose-500/5 border-2 border-rose-500/10 rounded-3xl relative overflow-hidden group/error">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <Activity className="text-rose-500" size={32} />
                                </div>
                                <p className="text-sm font-semibold text-rose-500 mb-3">{t('settings_pages.accounting.error_telemetry')}:</p>
                                <p className="text-sm font-semibold text-rose-500 font-mono leading-relaxed bg-muted/25 p-4 rounded-xl border border-rose-500/5 select-all">
                                    &gt; {errorMsg}
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-6 pt-6">
                            <div className="p-8 bg-emerald-500/5 rounded-3xl border-2 border-emerald-500/10 flex flex-col gap-2">
                                <p className="text-sm font-semibold text-emerald-500 opacity-80">{t('settings_pages.accounting.invoicing_matrix')}</p>
                                <p className="text-lg font-black text-foreground leading-tight">{t('settings_pages.accounting.billing_note_interfacing')}</p>
                            </div>
                            <div className="p-8 bg-indigo-500/5 rounded-3xl border-2 border-indigo-500/10 flex flex-col gap-2">
                                <p className="text-sm font-semibold text-indigo-500 opacity-80">{t('settings_pages.accounting.settlement_matrix')}</p>
                                <p className="text-lg font-black text-foreground leading-tight">{t('settings_pages.accounting.driver_payout_interfacing')}</p>
                            </div>
                        </div>
                    </div>
                </PremiumCard>
             </div>
        </div>

        {/* Advisory */}
        <div className="mt-12 p-8 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex flex-col md:flex-row gap-8 items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-indigo-500/5 to-transparent pointer-events-none" />
            <div className="p-4 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                <Target size={32} />
            </div>
            <div className="space-y-4 text-center md:text-left flex-1">
                <p className="text-lg font-black text-indigo-500">{t('settings_pages.accounting.advisory_title')}</p>
                <p className="text-base font-medium text-muted-foreground leading-relaxed">
                    {t('settings_pages.accounting.advisory_desc')}
                </p>
            </div>
            <PremiumButton variant="outline" className="h-12 px-6 rounded-xl border-border text-foreground gap-3 font-bold text-sm ml-auto">
                <Activity size={18} /> {t('settings_pages.accounting.event_log_uplink')}
            </PremiumButton>
        </div>
      </div>
    </DashboardLayout>
  )
}

