"use client"

import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
    Shield, 
    ArrowLeft, 
    Key, 
    Lock, 
    Smartphone, 
    Activity, 
    Zap, 
    ShieldCheck, 
    Target, 
    Loader2,
    Check,
    X as XIcon,
    Trash2,
    Globe,
    Monitor
} from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { useLanguage } from "@/components/providers/language-provider"
import { getPendingIPs, approveIP, blockIP, deleteIPRecord, getCurrentUserSession, changePassword } from "@/lib/actions/security-actions"
import { Badge } from "@/components/ui/badge"
import { getUserProfile } from "@/lib/supabase/users"
import { getPermissionsByRole } from "@/lib/actions/permission-actions"

type PendingIPRequest = {
  id: string
  username: string
  ip_address: string
  created_at: string
  device_info?: string | null
}

type SecuritySession = {
  roleId?: number
}

export default function SecuritySettingsPage() {
  const { t } = useLanguage()
  const router = useRouter()
  const [currentPassword, setCurrentPassword] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [pendingIPs, setPendingIPs] = useState<PendingIPRequest[]>([])
  const [session, setSession] = useState<SecuritySession | null>(null)
  const [ipLoading, setIpLoading] = useState(false)
  const [allowedMenus, setAllowedMenus] = useState<string[] | null>(null)
  const [isPermsLoaded, setIsPermsLoaded] = useState(false)

  useEffect(() => {
    async function init() {
        const sess = await getCurrentUserSession()
        setSession(sess)
        
        // Fetch permissions
        const profile = await getUserProfile()
        if (profile?.Role) {
            const perms = await getPermissionsByRole(profile.Role)
            setAllowedMenus(perms)
        }
        setIsPermsLoaded(true)

        if (sess && (sess.roleId === 1 || sess.roleId === 2)) {
            const ips = await getPendingIPs()
            setPendingIPs(ips)
        }
    }
    init()
  }, [])

  const refreshIPs = async () => {
    const ips = await getPendingIPs()
    setPendingIPs(ips)
  }

  const handleApproveIP = async (id: string, username: string, ip: string) => {
    setIpLoading(true)
    const res = await approveIP(id, username, ip)
    if (res.success) {
        toast.success(`Approved IP ${ip} for ${username}`)
        refreshIPs()
    } else {
        toast.error(res.error)
    }
    setIpLoading(false)
  }

  const handleBlockIP = async (id: string, username: string, ip: string) => {
    setIpLoading(true)
    const res = await blockIP(id, username, ip)
    if (res.success) {
        toast.success(`Blocked IP ${ip}`)
        refreshIPs()
    } else {
        toast.error(res.error)
    }
    setIpLoading(false)
  }

  const handleUpdatePassword = async () => {
    if (!currentPassword) {
      toast.warning('กรุณากรอกรหัสผ่านปัจจุบัน')
      return
    }
    if (!password) {
        toast.warning('กรุณากรอกรหัสผ่านใหม่')
        return
    }
    if (password !== confirmPassword) {
      toast.warning(t('security.toasts.match_error'))
      return
    }
    if (password.length < 6) {
      toast.warning(t('security.toasts.length_error'))
      return
    }

    setLoading(true)
    try {
        const result = await changePassword(currentPassword, password)
        if (result.success) {
            toast.success('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว')
            setCurrentPassword("")
            setPassword("")
            setConfirmPassword("")
        } else {
            toast.error(result.error || 'ไม่สามารถเปลี่ยนรหัสผ่านได้')
        }
    } catch (e) {
        toast.error('เกิดข้อผิดพลาด: ' + (e as Error).message)
    } finally {
        setLoading(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-12 pb-20 p-4 lg:p-10 max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 bg-card p-8 md:p-10 rounded-2xl border border-border shadow-sm relative overflow-hidden group">
            
            <div className="relative z-10 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all text-sm font-semibold group/back">
                    <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                    {t('common.back')}
                </button>
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
                        <Shield size={42} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-foreground leading-tight">
                            {!allowedMenus || allowedMenus.includes('settings.items.vault') || allowedMenus.includes('settings.items.security') 
                                ? t('settings.items.security') 
                                : t('settings.items.change_password')}
                        </h1>
                        <p className="text-base font-semibold text-muted-foreground mt-2">
                            {!allowedMenus || allowedMenus.includes('settings.items.vault') || allowedMenus.includes('settings.items.security') 
                                ? t('settings.items.security_desc') 
                                : t('settings.items.change_password_desc')}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-4 relative z-10">
                <div className="bg-muted/50 border border-border px-4 py-2 rounded-xl flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-sm font-semibold text-muted-foreground">{t('security.defense_status')}</span>
                </div>
                <div className="flex items-center gap-3 bg-primary/10 px-4 py-3 rounded-xl border border-primary/20">
                   <ShieldCheck className="text-primary" size={18} />
                   <span className="text-sm font-semibold text-foreground">{t('security.encryption_label')}</span>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
             {/* Password update */}
             <div className="lg:col-span-12">
                  <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden group/security">
                      <div className="p-8 md:p-12 relative overflow-hidden">
                          
                          <div className="max-w-xl mx-auto space-y-12 relative z-10">
                              <div className="flex flex-col items-center text-center space-y-6 mb-16">
                                   <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                                        <Key size={40} strokeWidth={2.5} />
                                   </div>
                                   <div className="space-y-2">
                                        <h2 className="text-3xl font-black text-foreground">{t('security.key_rotation_title')}</h2>
                                        <p className="text-base font-medium text-muted-foreground">{t('security.key_rotation_desc')}</p>
                                   </div>
                              </div>

                              <div className="space-y-10">
                                  <div className="space-y-4">
                                      <Label className="text-sm font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                          <Lock size={12} /> รหัสผ่านปัจจุบัน
                                      </Label>
                                      <Input 
                                          type="password" 
                                          value={currentPassword}
                                          onChange={(e) => setCurrentPassword(e.target.value)}
                                          className="h-14 bg-muted/30 border-border rounded-xl focus:border-amber-500/50 transition-all text-foreground font-semibold pl-5 shadow-inner"
                                          placeholder="••••••••••••"
                                      />
                                  </div>
                                  <div className="space-y-4">
                                      <Label className="text-sm font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                          <Lock size={12} /> {t('security.new_key_label')}
                                      </Label>
                                      <Input 
                                          type="password" 
                                          value={password}
                                          onChange={(e) => setPassword(e.target.value)}
                                          className="h-14 bg-muted/30 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-semibold pl-5 shadow-inner"
                                          placeholder="••••••••••••"
                                      />
                                  </div>
                                  <div className="space-y-4">
                                      <Label className="text-sm font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                          <Shield size={12} /> {t('security.verify_key_label')}
                                      </Label>
                                      <Input 
                                          type="password" 
                                          value={confirmPassword}
                                          onChange={(e) => setConfirmPassword(e.target.value)}
                                          className="h-14 bg-muted/30 border-border rounded-xl focus:border-primary/50 transition-all text-foreground font-semibold pl-5 shadow-inner"
                                          placeholder="••••••••••••"
                                      />
                                  </div>
                                  
                                  <div className="pt-10">
                                    <PremiumButton 
                                        onClick={handleUpdatePassword} 
                                        disabled={loading} 
                                        className="w-full h-14 rounded-xl bg-primary text-primary-foreground font-bold shadow-sm border-0 text-sm gap-3 group/save"
                                    >
                                      {loading ? <Loader2 size={24} className="animate-spin" /> : <Zap size={24} className="group-hover/save:scale-125 transition-transform" />}
                                      {loading ? t('security.updating_indicator') : t('security.save_button')}
                                    </PremiumButton>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </PremiumCard>
             </div>

             {/* IP approval requests */}
             {(session?.roleId === 1 || session?.roleId === 2) && (
              <div className="lg:col-span-12">
                   <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden group/ip">
                       <div className="p-10 border-b border-border bg-muted/25 flex items-center justify-between">
                           <div className="space-y-1">
                               <h3 className="text-lg font-black text-foreground flex items-center gap-3">
                                   <Globe size={20} className="text-primary" />
                                   คำขออนุมัติ IP / อุปกรณ์ใหม่
                               </h3>
                               <p className="text-sm font-medium text-muted-foreground ml-8">
                                   จัดการการเข้าถึงระบบจากอุปกรณ์ที่ไม่รู้จัก
                               </p>
                           </div>
                           <Badge variant="outline" className="px-4 py-1.5 border-primary/20 text-primary bg-primary/5 font-semibold">
                                 {pendingIPs.length} PENDING
                           </Badge>
                       </div>
                       
                       <div className="p-0">
                           {pendingIPs.length === 0 ? (
                               <div className="p-20 text-center space-y-6">
                                   <div className="w-20 h-20 bg-muted/20 rounded-full flex items-center justify-center mx-auto text-muted-foreground border border-border">
                                        <Shield size={32} className="opacity-30" />
                                   </div>
                                   <p className="text-base font-semibold text-muted-foreground">ไม่พบคำขอที่ค้างอยู่</p>
                               </div>
                           ) : (
                               <div className="overflow-x-auto">
                                   <table className="w-full text-left border-collapse">
                                       <thead>
                                           <tr className="border-b border-border bg-muted/10">
                                               <th className="px-8 py-6 text-xs font-semibold text-muted-foreground">User</th>
                                               <th className="px-8 py-6 text-xs font-semibold text-muted-foreground">IP address</th>
                                               <th className="px-8 py-6 text-xs font-semibold text-muted-foreground">Device</th>
                                               <th className="px-8 py-6 text-xs font-semibold text-muted-foreground text-right">Actions</th>
                                           </tr>
                                       </thead>
                                       <tbody className="divide-y divide-border/5">
                                           {pendingIPs.map((req) => (
                                               <tr key={req.id} className="hover:bg-primary/5 transition-colors group/row">
                                                   <td className="px-8 py-6">
                                                       <div className="flex items-center gap-4">
                                                           <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center text-foreground font-black italic border border-border group-hover/row:bg-primary/20 group-hover/row:text-primary transition-all">
                                                               {req.username.charAt(0).toUpperCase()}
                                                           </div>
                                                           <div className="flex flex-col">
                                                               <span className="text-base font-black text-foreground">{req.username}</span>
                                                               <span className="text-xs font-medium text-muted-foreground">
                                                                   ร้องขอเมื่อ: {new Date(req.created_at).toLocaleString('th-TH')}
                                                               </span>
                                                           </div>
                                                       </div>
                                                   </td>
                                                   <td className="px-8 py-6 font-mono text-primary font-bold text-base">
                                                       {req.ip_address}
                                                   </td>
                                                   <td className="px-8 py-6">
                                                       <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                                                           <Monitor size={14} />
                                                           <span className="truncate max-w-[200px]">{req.device_info || 'Unknown Device'}</span>
                                                       </div>
                                                   </td>
                                                   <td className="px-8 py-6 text-right">
                                                       <div className="flex items-center justify-end gap-3">
                                                           <button 
                                                               onClick={() => handleApproveIP(req.id, req.username, req.ip_address)}
                                                               disabled={ipLoading}
                                                               className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl hover:bg-emerald-500 hover:text-white transition-all shadow-lg shadow-emerald-500/5 disabled:opacity-50"
                                                               title="Approve Access"
                                                           >
                                                               <Check size={20} strokeWidth={3} />
                                                           </button>
                                                           <button 
                                                               onClick={() => handleBlockIP(req.id, req.username, req.ip_address)}
                                                               disabled={ipLoading}
                                                               className="p-3 bg-amber-500/10 text-amber-500 rounded-xl hover:bg-amber-500 hover:text-white transition-all shadow-lg shadow-amber-500/5 disabled:opacity-50"
                                                               title="Block IP"
                                                           >
                                                               <XIcon size={20} strokeWidth={3} />
                                                           </button>
                                                           <button 
                                                               onClick={async () => {
                                                                    if (confirm('ยืนยันการลบข้อมูล?')) {
                                                                        const res = await deleteIPRecord(req.id)
                                                                        if (res.success) {
                                                                            toast.success('Deleted record')
                                                                            refreshIPs()
                                                                        }
                                                                    }
                                                               }}
                                                               disabled={ipLoading}
                                                               className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5 disabled:opacity-50"
                                                               title="Delete Record"
                                                           >
                                                               <Trash2 size={20} />
                                                           </button>
                                                       </div>
                                                   </td>
                                               </tr>
                                           ))}
                                       </tbody>
                                   </table>
                               </div>
                           )}
                       </div>
                   </PremiumCard>
              </div>
              )}

             {/* Two-factor authentication */}
             {(!allowedMenus || allowedMenus.includes('settings.items.vault') || allowedMenus.includes('settings.items.security')) && (
              <div className="lg:col-span-12">
                   <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden group/2fa">
                       <div className="p-10 border-b border-border bg-muted/25 flex items-center justify-between">
                           <h3 className="text-lg font-black text-foreground flex items-center gap-3">
                               <Smartphone size={20} className="text-indigo-400" />
                               {t('security.mfa_title')}
                           </h3>
                           <div className="px-4 py-1.5 rounded-xl bg-indigo-500/10 text-sm font-semibold text-indigo-500 border border-indigo-500/20">
                               {t('security.mfa_status')}
                           </div>
                       </div>
                       <div className="p-12 flex flex-col md:flex-row items-center justify-between gap-10">
                           <div className="space-y-4 text-center md:text-left">
                               <p className="text-lg font-black text-foreground">{t('security.mfa_desc_title')}</p>
                               <p className="text-base font-medium text-muted-foreground leading-relaxed">
                                   {t('security.mfa_desc')}
                               </p>
                           </div>
                           <PremiumButton variant="outline" disabled className="h-12 px-6 rounded-xl border-border text-muted-foreground gap-3 font-bold text-sm cursor-not-allowed">
                               {t('security.system_lock')}
                           </PremiumButton>
                       </div>
                   </PremiumCard>
              </div>
             )}
        </div>

        {/* Advisory */}
        <div className="mt-12 p-8 rounded-2xl bg-primary/5 border border-primary/10 flex flex-col md:flex-row gap-8 items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
            <div className="p-4 rounded-2xl bg-primary/10 text-primary border border-primary/20">
                <Target size={32} />
            </div>
            <div className="space-y-4 text-center md:text-left flex-1">
                <p className="text-lg font-black text-primary">{t('security.advisory_title')}</p>
                <p className="text-base font-medium text-muted-foreground leading-relaxed">
                    {t('security.advisory_desc')}
                </p>
            </div>
            <PremiumButton variant="outline" className="h-12 px-6 rounded-xl border-border text-foreground gap-3 font-bold text-sm ml-auto">
                <Activity size={18} /> {t('security.view_logs')}
            </PremiumButton>
        </div>
      </div>
    </DashboardLayout>
  )
}
