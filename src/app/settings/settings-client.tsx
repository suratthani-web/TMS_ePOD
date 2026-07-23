"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { 
  Settings as SettingsIcon, 
  User,
  Bell,
  Shield,
  Palette,
  Database,
  LogOut,
  ChevronRight,
  Building,
  Loader2,
  Fingerprint,
  Globe,
  Users,
  Truck,
  Receipt,
  ArrowLeft,
  UserCog,
  Workflow
} from "lucide-react"
import { getUserProfile, UserProfile } from "@/lib/supabase/users"
import { PremiumButton } from "@/components/ui/premium-button"
import { PremiumCard } from "@/components/ui/premium-card"
import { useLanguage } from "@/components/providers/language-provider"
import { getPermissionsByRole } from "@/lib/actions/permission-actions"
import Link from "next/link"

const settingsSections = [
  {
    titleKey: "settings.sections.profile",
    titleFallback: { th: "โปรไฟล์ผู้ใช้งาน", en: "Profile" },
    icon: User,
    items: [
      { labelKey: "settings.items.identity", descKey: "settings.items.identity_desc", path: "/settings/profile", permKey: "settings.items.identity" },
      { labelKey: "settings.items.security", descKey: "settings.items.security_desc", path: "/settings/security", permKey: "settings.items.security" },
      { labelKey: "settings.items.change_password", descKey: "settings.items.change_password_desc", path: "/settings/security", permKey: "settings.items.change_password" },
    ]
  },
  {
    titleKey: "settings.sections.org",
    titleFallback: { th: "บริษัทและโครงสร้างองค์กร", en: "Company & Organization" },
    icon: Building,
    items: [
        { labelKey: "settings.items.company", descKey: "settings.items.company_desc", path: "/settings/company", permKey: "settings.items.company" },
        { labelKey: "settings.items.branches", descKey: "settings.items.branches_desc", path: "/settings/branches", permKey: "settings.items.branches" },
    ]
  },
  {
    titleKey: "settings.sections.master_data",
    titleFallback: { th: "ข้อมูลหลักสำหรับปฏิบัติงาน", en: "Master Data" },
    icon: Database,
    items: [
      { labelKey: "settings.items.customers", descKey: "settings.items.customers_desc", path: "/settings/customers", permKey: "settings.items.customers" },
      { labelKey: "settings.items.partners", descKey: "settings.items.partners_desc", path: "/settings/subcontractors", permKey: "settings.items.partners" },
      { labelKey: "settings.items.vehicles", descKey: "settings.items.vehicles_desc", path: "/settings/vehicle-types", permKey: "settings.items.vehicles" },
      { labelKey: "settings.items.fleet_standards", descKey: "settings.items.fleet_standards_desc", path: "/settings/fleet-standards", permKey: "settings.items.fleet_standards" },
      { labelKey: "navigation.esg_settings", descKey: "navigation.esg_settings_desc", path: "/settings/esg", permKey: "settings.items.fleet_standards" },
      { labelKey: "settings.items.expense_types", descKey: "settings.items.expense_types_desc", path: "/settings/expense-types", permKey: "settings.items.expense_types" },
    ]
  },
  {
    titleKey: "settings.sections.users_access",
    titleFallback: { th: "ผู้ใช้และสิทธิ์เข้าถึง", en: "Users & Access" },
    icon: UserCog,
    items: [
      { labelKey: "settings.items.operators", descKey: "settings.items.operators_desc", path: "/settings/users", permKey: "settings.items.operators" },
      { labelKey: "settings.items.permissions", descKey: "settings.items.permissions_desc", path: "/settings/permissions", permKey: "settings.items.permissions" },
      { labelKey: "settings.items.security", descKey: "settings.items.security_desc", path: "/settings/security", permKey: "settings.items.security" },
    ]
  },
  {
    titleKey: "settings.sections.finance_documents",
    titleFallback: { th: "การเงินและเอกสาร", en: "Finance & Documents" },
    icon: Receipt,
    items: [
      { labelKey: "settings.items.accounting_profile", descKey: "settings.items.accounting_profile_desc", path: "/settings/accounting-profile", permKey: "settings.items.accounting_profile" },
      { labelKey: "settings.items.accounting", descKey: "settings.items.accounting_desc", path: "/settings/accounting", permKey: "settings.items.accounting" },
    ]
  },
  {
    titleKey: "settings.sections.system",
    titleFallback: { th: "ระบบและการเชื่อมต่อ", en: "System & Integrations" },
    icon: Workflow,
    items: [
      { labelKey: "settings.items.alerts_config", descKey: "settings.items.alerts_config_desc", path: "/settings/notifications", permKey: "settings.items.notifications" },
      { labelKey: "settings.items.theme", descKey: "settings.items.theme_desc", path: "/settings/theme", permKey: "settings.items.theme" },
      { labelKey: "settings.items.vault", descKey: "settings.items.vault_desc", path: "/settings/backup", permKey: "settings.items.vault" },
    ]
  },
]

export default function SettingsPage() {
  const router = useRouter()
  const { t, language } = useLanguage()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [allowedMenus, setAllowedMenus] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    async function loadData() {
      const userData = await getUserProfile()
      setProfile(userData)
      
      if (userData?.Role) {
          const perms = await getPermissionsByRole(userData.Role)
          setAllowedMenus(perms)
      }
      
      setLoading(false)
    }
    loadData()
  }, [])

  const handleNavigate = (path: string) => {
    router.push(path)
  }

  const roleKey = profile?.Role ? `settings.roles_list.${profile.Role}` : ""
  const getSectionTitle = (section: (typeof settingsSections)[number]) => {
    const translated = t(section.titleKey)
    return translated === section.titleKey ? section.titleFallback[language] : translated
  }

  // Filter sections and items based on permissions
  const filteredSections = settingsSections.map(section => ({
      ...section,
      items: section.items.filter(item => {
          if (loading) return false // Wait for load to prevent "มาๆหายๆ"
          
          if (allowedMenus === null) {
              // Super Admin - Show all EXCEPT redundant "Change Password" card
              if (item.permKey === 'settings.items.change_password') return false
              return true
          }
          
          const hasFullSecurity = allowedMenus.includes('settings.items.vault') || allowedMenus.includes('settings.items.security')
          if (item.permKey === 'settings.items.change_password' && hasFullSecurity) {
              return false
          }

          return allowedMenus.includes(item.permKey || "") || allowedMenus.includes(item.labelKey)
      })
  })).filter(section => section.items.length > 0)

  return (
    <div className="space-y-12 pb-20">
      <div className="bg-card p-8 md:p-10 rounded-2xl border border-border shadow-sm relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 relative z-10">
          <div>
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all text-sm font-semibold mb-6">
                <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                {t('navigation.dashboard')}
            </Link>
            <div className="flex items-center gap-6 mb-4">
               <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
                  <SettingsIcon size={40} strokeWidth={2.5} />
               </div>
               <div>
                  <h1 className="text-4xl font-black text-foreground leading-tight mb-2">{t('settings.title')}</h1>
                  <p className="text-base font-semibold text-muted-foreground">{t('settings.subtitle')}</p>
               </div>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-muted/50 p-4 rounded-2xl border border-border">
             <div className="flex flex-col items-end">
                <span className="text-sm font-semibold text-muted-foreground">{t('settings.auth_level')}</span>
                <span className="text-base font-bold text-primary">{profile?.Role || "Administrator"}</span>
             </div>
             <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <Fingerprint size={24} />
             </div>
          </div>
        </div>
      </div>

      <PremiumCard className="bg-card border border-border shadow-sm p-0 overflow-hidden rounded-2xl">
        <div className="p-10 relative z-10">
          {loading ? (
            <div className="flex items-center justify-center py-10">
               <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row items-center gap-12">
              <div className="relative group">
                 <div className="w-28 h-28 rounded-2xl bg-primary/10 p-1 border border-primary/20">
                    <div className="w-full h-full rounded-xl bg-background flex items-center justify-center text-foreground text-5xl font-black border border-border overflow-hidden relative">
                       {(profile?.First_Name || profile?.Username || "A").charAt(0)}
                    </div>
                 </div>
                 <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-background rounded-xl border border-primary flex items-center justify-center text-primary shadow-sm">
                    <Fingerprint size={20} />
                 </div>
              </div>
              
              <div className="flex-1 text-center lg:text-left space-y-6">
                 <div>
                    <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 mb-2">
                       <h2 className="text-3xl font-black text-foreground leading-tight">
                         {profile ? `${profile.First_Name || ""} ${profile.Last_Name || ""}`.trim() || profile.Username : "USER"}
                       </h2>
                       <div className="px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
                          <span className="text-sm font-semibold text-primary">{t('settings.identified')}</span>
                       </div>
                    </div>
                    <p className="text-muted-foreground text-base font-medium">{profile?.Email || t('settings.secure_pending')}</p>
                 </div>

                 <div className="flex flex-wrap items-center justify-center lg:justify-start gap-10">
                    <div className="flex flex-col gap-2">
                       <span className="text-sm font-semibold text-muted-foreground leading-none">{t('settings.auth_level')}</span>
                       <span className="px-4 py-2 bg-muted/50 rounded-xl border border-border text-base font-bold text-primary shadow-sm">{roleKey ? t(roleKey) : profile?.Role || "Staff"}</span>
                    </div>
                    <div className="w-px h-12 bg-muted/50 hidden lg:block" />
                    <div className="flex flex-col gap-2">
                       <span className="text-sm font-semibold text-muted-foreground leading-none">{t('settings.temporal_id')}</span>
                       <span className="text-xl font-black text-foreground">@{profile?.Username || "user"}</span>
                    </div>
                 </div>
              </div>

              <PremiumButton 
                  className="h-12 px-6 rounded-xl gap-3 shadow-sm"
                  onClick={() => handleNavigate("/settings/profile")}
              >
                  {t('settings.edit_matrix')}
              </PremiumButton>
            </div>
          )}
        </div>
      </PremiumCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {filteredSections.map((section, sectionIndex) => (
          <motion.div
            key={section.titleKey}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: sectionIndex * 0.05 }}
          >
            <PremiumCard className="bg-card border border-border h-full hover:border-primary/40 transition-all duration-300 rounded-2xl shadow-sm overflow-hidden group/section p-0">
              <div className="bg-muted/30 border-b border-border p-5 flex items-center justify-between gap-4">
                <h3 className="flex items-center gap-3 text-lg font-black text-foreground">
                  <div className="p-2.5 bg-background rounded-xl text-muted-foreground group-hover/section:bg-primary group-hover/section:text-primary-foreground transition-all duration-300">
                    <section.icon size={20} />
                  </div>
                  {getSectionTitle(section)}
                </h3>
                <span className="text-sm font-semibold text-muted-foreground">{section.items.length}</span>
                 </div>
                 <div className="p-4 space-y-2">
                   {section.items.map((item) => (
                     <motion.div
                       key={item.labelKey}
                       whileHover={{ x: 10, backgroundColor: 'rgba(255,255,255,0.03)' }}
                       className="flex items-center justify-between p-5 rounded-xl cursor-pointer transition-all group/item border border-transparent hover:border-border hover:bg-muted/30"
                       onClick={() => handleNavigate(item.path)}
                     >
                       <div className="space-y-1">
                         <p className="font-bold text-base text-foreground">{t(item.labelKey)}</p>
                         <p className="text-sm font-medium text-muted-foreground group-hover/item:text-primary transition-colors">{t(item.descKey)}</p>
                       </div>
                       <div className="p-2.5 rounded-full bg-muted/50 group-hover/item:bg-primary/10 transition-all">
                          <ChevronRight className="text-muted-foreground group-hover/item:text-primary transition-colors" size={20} />
                       </div>
                     </motion.div>
                   ))}
                 </div>
               </PremiumCard>
             </motion.div>
           ))}
         </div>
   
         <div className="mt-12">
           <h3 className="text-lg font-black text-foreground mb-4">{t('settings.core_protocols')}</h3>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               <PremiumCard 
                 onClick={() => handleNavigate("/settings/backup")}
                 className="group/action hover:border-primary/50 cursor-pointer overflow-hidden p-6 flex flex-col items-center text-center gap-4 bg-card border-border rounded-2xl"
               >
                  <div className="p-4 bg-primary/10 rounded-2xl text-primary group-hover/action:scale-105 transition-transform">
                     <Database size={32} />
                  </div>
                  <span className="text-base font-bold text-foreground">{t('settings.backup_node')}</span>
               </PremiumCard>
   
               <PremiumCard 
                 onClick={() => handleNavigate("/settings/api")}
                 className="group/action hover:border-emerald-500/50 cursor-pointer overflow-hidden p-6 flex flex-col items-center text-center gap-4 bg-card border-border rounded-2xl"
               >
                  <div className="p-4 bg-emerald-500/10 rounded-2xl text-emerald-500 group-hover/action:scale-105 transition-transform">
                     <Globe size={32} />
                  </div>
                  <span className="text-base font-bold text-foreground">{t('settings.api_signal')}</span>
               </PremiumCard>
   
               <PremiumCard 
                 onClick={() => window.location.href = "/api/auth/logout"}
                 className="group/action hover:border-rose-500/50 cursor-pointer overflow-hidden p-6 flex flex-col items-center text-center gap-4 bg-card border-border rounded-2xl"
               >
                  <div className="p-4 bg-rose-500/10 rounded-2xl text-rose-500 group-hover/action:scale-105 transition-transform">
                     <LogOut size={32} />
                  </div>
                  <span className="text-base font-bold text-foreground">{t('settings.terminate')}</span>
               </PremiumCard>
           </div>
         </div>
   
         <div className="mt-12 py-8 border-t border-border flex flex-col items-center opacity-70">
            <p className="text-sm font-semibold text-foreground">{t('settings.terminal_version')}</p>
            <p className="text-sm font-medium text-muted-foreground">{t('settings.encrypted_op')}</p>
         </div>
    </div>
  )
}
