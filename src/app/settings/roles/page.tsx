'use client'

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { 
    Shield, Loader2, Target, 
    FileText, Truck, Wallet, Users, Settings,
    Lock, AlertCircle, Zap, Fingerprint, ArrowLeft
} from "lucide-react"
import { motion } from "framer-motion"
import { getRolePermissions, updateRolePermissions } from "@/lib/actions/permission-actions"
import { toast } from "sonner"
import { 
    SYSTEM_PERMISSIONS, 
    STANDARD_ROLES,
    PERMISSION_CATEGORIES,
    RolePermission
} from "@/types/role"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { useLanguage } from "@/components/providers/language-provider"
import { LucideIcon } from "lucide-react"

const CATEGORY_ICONS: Record<string, LucideIcon> = {
    Executive: Target,
    Operations: FileText,
    Fleet: Truck,
    Financial: Wallet,
    People: Users,
    System: Settings
}

export default function RolesPage() {
    const { t } = useLanguage()
    const router = useRouter()
    const [roles, setRoles] = useState<RolePermission[]>([])
    const [selectedRoleIndex, setSelectedRoleIndex] = useState(0)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        const result = await getRolePermissions()
        let fetchedData: RolePermission[] = []
        
        if (result.success && result.data) {
             fetchedData = result.data.map((item) => ({
                 ...item,
                 Permissions: typeof item.Permissions === 'string' 
                     ? JSON.parse(item.Permissions) 
                     : (item.Permissions && typeof item.Permissions === 'object' ? item.Permissions as Record<string, boolean> : {})
             }))
        }

        const mergedData: RolePermission[] = []
        STANDARD_ROLES.forEach(roleName => {
            const existing = fetchedData.find(r => r.Role === roleName)
            mergedData.push({
                Role: roleName,
                Permissions: existing ? existing.Permissions : {}
            })
        })
             
        setRoles(mergedData)
        setLoading(false)
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    const togglePermission = (permId: string) => {
        if (roles[selectedRoleIndex].Role === 'Super Admin') return 

        setRoles(prev => {
            const newRoles = [...prev]
            const roleToUpdate = { ...newRoles[selectedRoleIndex] }
            
            const currentPerms = typeof roleToUpdate.Permissions === 'string'
                ? JSON.parse(roleToUpdate.Permissions)
                : { ...(roleToUpdate.Permissions || {}) }

            roleToUpdate.Permissions = {
                ...currentPerms,
                [permId]: !currentPerms[permId]
            }
            
            newRoles[selectedRoleIndex] = roleToUpdate
            return newRoles
        })
    }

    const handleSave = async () => {
        const role = roles[selectedRoleIndex]
        setSaving(true)
        try {
            const result = await updateRolePermissions(role.Role, role.Permissions)
            if (result.success) toast.success(t('settings_pages.roles.toasts.success') + role.Role)
            else toast.error(result.error || t('settings_pages.roles.toasts.save_failed'))
        } catch {
            toast.error(t('settings_pages.roles.toasts.error'))
        } finally {
            setSaving(false)
        }
    }

    if (loading) return (
        <DashboardLayout>
            <div className="flex h-[80vh] items-center justify-center opacity-30">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
            </div>
        </DashboardLayout>
    )

    const activeRole = roles[selectedRoleIndex]
    const isSuperAdmin = activeRole.Role === 'Super Admin'

    return (
        <DashboardLayout>
            <div className="space-y-12 pb-20 p-4 lg:p-10">
                {/* Enterprise Security Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 bg-background/60 backdrop-blur-3xl p-10 rounded-br-[6rem] rounded-tl-[3rem] border border-border shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
                    
                    <div className="relative z-10 space-y-8">
                        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.1em] text-base font-bold group/back italic">
                            <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                            {t('settings_pages.roles.config_back')}
                        </button>
                        <div className="flex items-center gap-6">
                            <div className="p-4 bg-primary/20 rounded-[2.5rem] border-2 border-primary/30 shadow-[0_0_40px_rgba(255,30,133,0.2)] text-primary group-hover:scale-110 transition-all duration-500">
                                <Shield size={42} strokeWidth={2.5} />
                            </div>
                            <div>
                                <h1 className="text-5xl font-black text-foreground tracking-widest uppercase leading-none italic premium-text-gradient">
                                    {t('settings_pages.roles.title')}
                                </h1>
                                <p className="text-base font-bold font-black text-primary uppercase tracking-[0.2em] mt-2 opacity-80 italic">{t('settings_pages.roles.subtitle')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-6 relative z-10">
                        <div className="bg-muted/50 border border-border px-6 py-3 rounded-2xl flex items-center gap-3 backdrop-blur-md">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,1)]" />
                            <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">{t('settings_pages.roles.protocol_sync')}</span>
                        </div>
                        <PremiumButton 
                            onClick={handleSave} 
                            disabled={saving || isSuperAdmin}
                            className="h-16 px-12 rounded-2xl bg-primary text-foreground border-0 shadow-[0_20px_50px_rgba(255,30,133,0.3)] gap-4 text-xl tracking-widest disabled:opacity-20"
                        >
                            {saving ? <Loader2 size={20} className="animate-spin" /> : <Fingerprint size={20} />}
                            {t('settings_pages.roles.commit_changes')}
                        </PremiumButton>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                    {/* Role Tactical Select */}
                    <div className="lg:col-span-3 space-y-4">
                        <p className="text-muted-foreground font-black text-base font-bold uppercase tracking-[0.1em] mb-6 ml-4 italic">{t('settings_pages.roles.entity_label')}</p>
                        {roles.map((role, idx) => (
                            <button
                                key={role.Role}
                                onClick={() => setSelectedRoleIndex(idx)}
                                className={cn(
                                    "w-full flex items-center justify-between p-6 rounded-3xl transition-all border-2 relative overflow-hidden group/role-btn",
                                    selectedRoleIndex === idx 
                                    ? "bg-primary/10 border-primary shadow-[0_0_30px_rgba(255,30,133,0.15)] translate-x-3" 
                                    : "bg-muted/50 border-transparent hover:bg-muted/80 text-muted-foreground"
                                )}
                            >
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className={cn(
                                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-xl",
                                        selectedRoleIndex === idx 
                                        ? "bg-primary text-foreground rotate-6 scale-110" 
                                        : "bg-muted/25 text-muted-foreground group-hover/role-btn:text-foreground group-hover/role-btn:bg-primary/20"
                                    )}>
                                        {role.Role === 'Super Admin' ? <Lock size={22} /> : <Users size={22} />}
                                    </div>
                                    <span className={cn(
                                        "font-black text-[13px] uppercase tracking-widest italic transition-colors",
                                        selectedRoleIndex === idx ? "text-foreground" : "text-muted-foreground group-hover/role-btn:text-muted-foreground"
                                    )}>
                                        {t(`settings.roles_list.${role.Role}`) || role.Role}
                                    </span>
                                </div>
                                {selectedRoleIndex === idx && <Zap size={16} className="text-primary animate-pulse" />}
                            </button>
                        ))}
                        
                        <div className="mt-10 p-8 rounded-[2.5rem] bg-indigo-500/5 border border-border shadow-inner">
                             <div className="flex items-center gap-3 mb-4 text-indigo-400">
                                <AlertCircle size={14} strokeWidth={2.5} />
                                <span className="text-base font-bold font-black uppercase tracking-[0.1em]">{t('settings_pages.roles.integrity_check')}</span>
                             </div>
                             <p className="text-base font-bold font-bold text-muted-foreground uppercase tracking-widest leading-relaxed italic">
                                {t('settings_pages.roles.audit_log_warn')}
                             </p>
                        </div>
                    </div>

                    {/* Permissions Tactical Matrix */}
                    <div className="lg:col-span-9 space-y-8">
                        {isSuperAdmin ? (
                            <PremiumCard className="bg-background border-2 border-indigo-500/30 p-20 rounded-[4rem] flex flex-col items-center text-center gap-10 relative overflow-hidden group/super">
                                <div className="absolute inset-0 bg-indigo-500/5 pointer-events-none" />
                                <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
                                
                                <div className="w-32 h-32 bg-indigo-500/10 rounded-[3rem] flex items-center justify-center text-indigo-500 border-2 border-indigo-500/20 shadow-2xl relative z-10 group-hover/super:scale-110 transition-transform duration-700">
                                    <Lock size={64} strokeWidth={1.5} className="animate-pulse" />
                                </div>
                                <div className="max-w-xl relative z-10 space-y-4">
                                    <h3 className="text-4xl font-black text-foreground tracking-widest uppercase italic premium-text-gradient">{t('settings_pages.roles.master_override')}</h3>
                                    <p className="text-indigo-400 font-black text-base font-bold uppercase tracking-[0.2em] mb-4">{t('settings_pages.roles.identity_level')}</p>
                                    <p className="text-muted-foreground font-bold text-xl leading-relaxed uppercase tracking-widest italic">
                                        {t('settings_pages.roles.super_admin_desc')}
                                    </p>
                                </div>
                            </PremiumCard>
                        ) : (
                            <div className="space-y-10 pb-20">
                                {PERMISSION_CATEGORIES.map((category, catIdx) => {
                                    const Icon = CATEGORY_ICONS[category.id] || Shield
                                    const catPerms = SYSTEM_PERMISSIONS.filter(p => p.category === category.id)
                                    
                                    return (
                                        <motion.div 
                                            key={category.id}
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: catIdx * 0.1 }}
                                            className="bg-background/40 rounded-[3rem] border-2 border-border shadow-3xl overflow-hidden group/cat hover:border-primary/20 transition-all duration-500"
                                        >
                                            <div className="bg-muted/25 px-10 py-8 border-b border-border flex items-center justify-between relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-64 h-full bg-primary/[0.02] pointer-events-none" />
                                                <div className="flex items-center gap-5 relative z-10">
                                                    <div className="p-3 bg-muted/50 rounded-2xl text-primary border border-border group-hover/cat:scale-110 transition-transform">
                                                        <Icon size={24} />
                                                    </div>
                                                    <h3 className="font-black text-foreground uppercase tracking-[0.3em] italic text-xl">{t(`settings_pages.roles.categories.${category.id}`)}</h3>
                                                </div>
                                                <div className="text-base font-bold font-black text-muted-foreground bg-muted/50 px-5 py-2 rounded-full border border-border uppercase tracking-widest italic">
                                                    {catPerms.length} {t('settings_pages.roles.vector_points')}
                                                </div>
                                            </div>
                                            <div className="p-8">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    {catPerms.map(perm => (
                                                        <div 
                                                            key={perm.id}
                                                            onClick={() => togglePermission(perm.id)}
                                                            className={cn(
                                                                "flex items-center justify-between p-6 rounded-[2rem] transition-all cursor-pointer border-2 group/perm relative overflow-hidden",
                                                                activeRole.Permissions?.[perm.id] 
                                                                ? "bg-primary/5 border-primary/20 shadow-inner" 
                                                                : "bg-transparent border-border hover:border-border"
                                                            )}
                                                        >
                                                            <div className="flex flex-col gap-2 relative z-10">
                                                                <span className={cn(
                                                                    "font-black text-[13px] uppercase tracking-widest italic transition-colors",
                                                                    activeRole.Permissions?.[perm.id] ? "text-primary shadow-[0_0_10px_rgba(255,30,133,0.3)]" : "text-muted-foreground group-hover/perm:text-foreground"
                                                                )}>
                                                                    {t(`settings_pages.roles.permissions.${perm.id}`)}
                                                                </span>
                                                                <span className={cn(
                                                                    "text-base font-bold font-black leading-tight uppercase tracking-tight italic transition-colors",
                                                                    activeRole.Permissions?.[perm.id] ? "text-primary/60" : "text-muted-foreground"
                                                                )}>
                                                                    {t(`settings_pages.roles.descriptions.${perm.id}`)}
                                                                </span>
                                                            </div>
                                                            <Switch 
                                                                checked={activeRole.Permissions?.[perm.id] || false}
                                                                onCheckedChange={() => togglePermission(perm.id)}
                                                                className="data-[state=checked]:bg-primary relative z-10"
                                                            />
                                                            {activeRole.Permissions?.[perm.id] && (
                                                                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-30 pointer-events-none" />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}

