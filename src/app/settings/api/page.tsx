"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { 
  Globe, 
  ArrowLeft, 
  Copy, 
  RefreshCw, 
  Key, 
  ShieldCheck, 
  Activity, 
  Zap, 
  Link as LinkIcon, 
  Cpu, 
  FileText, 
  Loader2, 
  AlertCircle 
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/components/providers/language-provider"
import { getSetting, saveSetting } from "@/lib/supabase/system_settings"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export default function ApiSettingsPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [apiKey, setApiKey] = useState("loading...")
  const [loading, setLoading] = useState(true)

  const loadInfo = useCallback(async () => {
    const key = await getSetting('api_key', 'tms_live_xxxxxxxxxxxxxxxx')
    setApiKey(key)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadInfo()
  }, [loadInfo])

  const generateNewKey = async () => {
    if (!confirm(t('settings_pages.api.confirm_regen'))) return
    const newKey = `tms_live_${Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)}`
    setApiKey(newKey)
    await saveSetting('api_key', newKey, 'Public API Key')
    toast.success(t('settings_pages.api.toast_new_key'))
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success(t('settings_pages.api.toast_copied'))
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
                    {t('settings_pages.api.back_cmd')}
                </button>
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
                        <Globe size={42} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-foreground leading-tight">
                            {t('settings_pages.api.title')}
                        </h1>
                        <p className="text-base font-semibold text-muted-foreground mt-2">{t('settings_pages.api.subtitle')}</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-4 relative z-10">
                <div className="bg-muted/50 border border-border px-4 py-2 rounded-xl flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-sm font-semibold text-muted-foreground">{t('settings_pages.api.nominal_state')}</span>
                </div>
                <div className="flex items-center gap-3 bg-primary/10 px-4 py-3 rounded-xl border border-primary/20">
                   <ShieldCheck className="text-primary" size={18} />
                   <span className="text-sm font-semibold text-foreground">{t('settings_pages.api.payload_protocol')}</span>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
             {/* Key Management Card */}
             <div className="lg:col-span-12">
                  <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden group/api">
                      <div className="p-8 md:p-12 relative overflow-hidden">
                          
                          <div className="max-w-4xl mx-auto space-y-16 relative z-10">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-10">
                                  <div className="space-y-4">
                                      <div className="flex items-center gap-4">
                                          <div className="p-3 bg-primary/10 rounded-2xl text-primary border border-primary/20">
                                              <Key size={32} strokeWidth={2.5} />
                                          </div>
                                          <h2 className="text-2xl font-black text-foreground">{t('settings_pages.api.token_label')}</h2>
                                      </div>
                                      <p className="text-base font-medium text-muted-foreground leading-relaxed">
                                          {t('settings_pages.api.token_desc')}
                                      </p>
                                  </div>
                                  <div className="flex items-center gap-3 px-6 py-3 bg-muted/50 rounded-2xl border border-border">
                                       <Cpu size={18} className="text-primary" />
                                       <span className="text-sm font-semibold text-muted-foreground">{t('settings_pages.api.encryption_active')}</span>
                                  </div>
                              </div>

                              <div className="space-y-8">
                                  <div className="relative group/input">
                                      <div className="absolute inset-y-0 left-0 pl-8 flex items-center pointer-events-none">
                                          <LinkIcon size={20} className="text-primary opacity-40 group-focus-within/input:opacity-100 transition-opacity" />
                                      </div>
                                      <Input 
                                          value={apiKey} 
                                          readOnly 
                                          className="h-16 bg-muted/25 border border-border rounded-2xl pl-16 pr-28 text-base font-mono font-bold text-primary shadow-inner group-hover/api:border-primary/20 transition-all select-all"
                                      />
                                      <div className="absolute inset-y-0 right-3 flex items-center">
                                          <PremiumButton 
                                             variant="outline" 
                                             onClick={() => copyToClipboard(apiKey)}
                                             className="h-11 px-5 rounded-xl bg-muted/50 border-border hover:bg-primary hover:text-primary-foreground transition-all text-sm font-bold"
                                          >
                                              <Copy size={16} className="mr-3" /> {t('settings_pages.api.copy_buffer')}
                                          </PremiumButton>
                                      </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-4 p-6 bg-rose-500/5 border border-rose-500/10 rounded-3xl group/warn">
                                       <AlertCircle size={20} className="text-rose-500 group-hover:rotate-12 transition-transform" />
                                       <p className="text-sm font-medium text-rose-500/80 leading-relaxed">
                                          {t('settings_pages.api.critical_security')}
                                       </p>
                                  </div>
                              </div>

                              <div className="pt-10 border-t border-border flex flex-col md:flex-row md:items-center justify-between gap-8">
                                  <div className="space-y-2">
                                      <p className="text-sm font-semibold text-muted-foreground mb-2">{t('settings_pages.api.lifecycle_mgmt')}</p>
                                      <div className="flex items-center gap-4">
                                          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)]" />
                                          <span className="text-base font-bold text-foreground">{t('settings_pages.api.token_stability')}</span>
                                      </div>
                                  </div>
                                  <PremiumButton 
                                      variant="outline" 
                                      className="h-12 px-6 rounded-xl border-rose-500/30 text-rose-500 bg-rose-500/5 hover:bg-rose-600 hover:text-white transition-all text-sm font-bold gap-3"
                                      onClick={generateNewKey}
                                  >
                                      <RefreshCw size={20} className="group-hover/api:rotate-180 transition-transform duration-1000" /> {t('settings_pages.api.regenerate_btn')}
                                  </PremiumButton>
                              </div>
                          </div>
                      </div>
                  </PremiumCard>
             </div>
        </div>

        {/* Advisory */}
        <div className="mt-12 p-8 rounded-2xl bg-primary/5 border border-primary/10 flex flex-col md:flex-row gap-8 items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
            <div className="p-4 rounded-2xl bg-primary/10 text-primary border border-primary/20">
                <Activity size={32} />
            </div>
            <div className="space-y-4 text-center md:text-left flex-1">
                <p className="text-lg font-black text-primary">{t('settings_pages.api.advisory_title')}</p>
                <p className="text-base font-medium text-muted-foreground leading-relaxed">
                    {t('settings_pages.api.advisory_desc')} <br />
                    {t('settings_pages.api.rate_limit_note')} <br />
                    {t('settings_pages.api.docs_note')}
                </p>
            </div>
            <PremiumButton variant="outline" className="h-12 px-6 rounded-xl border-border text-foreground gap-3 font-bold text-sm ml-auto">
                <FileText size={18} /> {t('settings_pages.api.view_docs')}
            </PremiumButton>
        </div>
      </div>
    </DashboardLayout>
  )
}



