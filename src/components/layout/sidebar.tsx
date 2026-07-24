"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Truck,
  FileText,
  AlertTriangle,
  MessageSquare,
  Wrench,
  Fuel,
  BarChart3,
  ChevronLeft,
  Activity,
  Navigation,
  Users,
  Calendar,
  CalendarDays,
  Receipt,
  Wallet,
  History,
  CheckCircle2,
  Zap,
  Settings,
  ShieldCheck,
  Leaf,
  ShieldAlert,
  Key,
  Compass,
  MapPin,
  HeartPulse,
  Siren,
} from "lucide-react"

import { SidebarProfile } from "./sidebar-profile"
import { useLanguage } from "@/components/providers/language-provider"

type Translate = (path: string, data?: Record<string, string | number>) => string

interface NavItem {
  titleKey: string
  href: string
  icon: React.ReactNode
  badge?: number | string
  badgeColor?: "red" | "blue" | "green" | "yellow"
}

interface NavGroup {
  titleKey: string
  titleFallback?: {
    th: string
    en: string
  }
  items: NavItem[]
}

const navigation: NavGroup[] = [
  {
    titleKey: "nav_groups.ops_command",
    titleFallback: { th: "ภาพรวม", en: "Overview" },
    items: [
      { titleKey: "navigation.dashboard", href: "/dashboard", icon: <LayoutDashboard size={20} /> },
      { titleKey: "navigation.exception_center", href: "/admin/exceptions", icon: <Siren size={20} />, badgeColor: "red" },
      { titleKey: "navigation.operations_health", href: "/admin/health", icon: <HeartPulse size={20} /> },
      { titleKey: "navigation.user_monitor", href: "/admin/monitoring/users", icon: <Users size={20} /> },
    ],
  },
  {
    titleKey: "nav_groups.operations",
    titleFallback: { th: "งานขนส่ง", en: "Transport Operations" },
    items: [
      { titleKey: "navigation.planning", href: "/planning", icon: <CalendarDays size={20} /> },
      { titleKey: "navigation.tracking_hub", href: "/admin/tracking", icon: <Compass size={20} /> },
      { titleKey: "navigation.calendar", href: "/calendar", icon: <Calendar size={20} /> },
      { titleKey: "navigation.history", href: "/jobs/history", icon: <History size={20} /> },
      { titleKey: "navigation.monitoring", href: "/monitoring", icon: <MapPin size={20} /> },
      { titleKey: "navigation.chat", href: "/chat", icon: <MessageSquare size={20} />, badgeColor: "blue" },    
    ],
  },
  {
    titleKey: "nav_groups.asset_control",
    titleFallback: { th: "รถและทรัพยากร", en: "Fleet & Resources" },
    items: [
      { titleKey: "navigation.routes", href: "/routes", icon: <Navigation size={20} /> },
      { titleKey: "navigation.danger_zones", href: "/routes/danger-zones", icon: <ShieldAlert size={20} />, badgeColor: "red" },
      { titleKey: "navigation.drivers", href: "/drivers", icon: <Users size={20} /> },
      { titleKey: "navigation.driver_leaves", href: "/admin/driver-leaves", icon: <CalendarDays size={20} /> }, 
      { titleKey: "navigation.fleet", href: "/vehicles", icon: <Truck size={20} /> },
      { titleKey: "navigation.notifications", href: "/notifications", icon: <ShieldCheck size={20} />, badgeColor: "blue" },
      { titleKey: "navigation.checks", href: "/admin/vehicle-checks", icon: <CheckCircle2 size={20} /> },       
      { titleKey: "navigation.maintenance", href: "/maintenance", icon: <Wrench size={20} /> },
      { titleKey: "navigation.fuel", href: "/fuel", icon: <Fuel size={20} /> },
    ],
  },
  {
    titleKey: "nav_groups.intelligence",
    titleFallback: { th: "รายงานและวิเคราะห์", en: "Reports & Analytics" },
    items: [
      { titleKey: "navigation.analytics", href: "/admin/analytics", icon: <BarChart3 size={20} />, badgeColor: "blue" },
      { titleKey: "navigation.reports", href: "/reports", icon: <BarChart3 size={20} /> },
    ],
  },
  {
    titleKey: "nav_groups.financial",
    titleFallback: { th: "การเงินและวางบิล", en: "Finance & Billing" },
    items: [
      { titleKey: "navigation.billing_customer", href: "/billing/customer", icon: <Receipt size={20} /> },      
      { titleKey: "navigation.billing_automation", href: "/billing/automation", icon: <Zap size={20} />, badge: "common.new", badgeColor: "yellow" },
      { titleKey: "navigation.invoices", href: "/billing/invoices", icon: <FileText size={20} /> },
      { titleKey: "navigation.payouts", href: "/billing/driver", icon: <Wallet size={20} /> },
    ],
  },
  {
    titleKey: "nav_groups.settings",
    titleFallback: { th: "ตั้งค่าระบบ", en: "System Settings" },
    items: [
      { titleKey: "navigation.settings", href: "/settings", icon: <Settings size={20} /> },
      { titleKey: "navigation.fleet_standards", href: "/settings/fleet-standards", icon: <ShieldCheck size={20} /> },
      { titleKey: "navigation.esg_settings", href: "/settings/esg", icon: <Leaf size={20} /> },
      { titleKey: "settings.items.change_password", href: "/settings/security", icon: <Key size={20} /> },
    ],
  },
]

const customerNavigation: NavGroup[] = [
  {
    titleKey: "nav_groups.client_portal",
    titleFallback: { th: "งานของลูกค้า", en: "Client Portal" },
    items: [
      { titleKey: "navigation.dashboard", href: "/dashboard", icon: <LayoutDashboard size={20} /> },
      { titleKey: "navigation.customer_tracking_hub", href: "/dashboard/tracking", icon: <Compass size={20} /> },
      { titleKey: "navigation.monitoring", href: "/monitoring", icon: <MapPin size={20} /> },
      { titleKey: "navigation.routes", href: "/routes", icon: <Navigation size={20} /> },
      { titleKey: "navigation.history", href: "/jobs/history", icon: <History size={20} /> },
    ],
  },
]

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const { t, language } = useLanguage()
  const [sidebarState, setSidebarState] = React.useState<{
    allowedMenus: string[] | null
    isCustomerUser: boolean
    isLoaded: boolean
  }>({
    allowedMenus: null,
    isCustomerUser: false,
    isLoaded: false
  })

  React.useEffect(() => {
    async function loadPermissions() {
        // 1. Instant Cache Load
        const cachedContent = localStorage.getItem("sidebar_permissions")
        const cachedCustomer = localStorage.getItem("sidebar_is_customer")
        if (cachedContent) {
            try {
                let parsed = JSON.parse(cachedContent)
                if (parsed && parsed.length === 0) parsed = null
                setSidebarState({ 
                    allowedMenus: parsed, 
                    isCustomerUser: cachedCustomer === 'true',
                    isLoaded: true 
                })
            } catch (e) {}
        }

        // 2. Background Fetch & Sync
        try {
            const { getEffectivePermissions } = await import("@/lib/actions/permission-actions")
            const perms = await getEffectivePermissions()

            const { getUserRole, isCustomer } = await import("@/lib/permissions")
            const { getUserProfile } = await import("@/lib/supabase/users")
            
            const role = await getUserRole()
            const profile = await getUserProfile()
            const isCust = (await isCustomer()) || (Number(role) === 7) || (profile?.Role === 'Customer')

            localStorage.setItem("sidebar_permissions", JSON.stringify(perms))
            localStorage.setItem("sidebar_is_customer", String(isCust))
            setSidebarState({
                allowedMenus: perms,
                isCustomerUser: !!isCust,
                isLoaded: true
            })
        } catch (error) {
            console.error("Sidebar permission error:", error)
            if (!cachedContent) {
                setSidebarState({ allowedMenus: [], isCustomerUser: false, isLoaded: true })
            }
        }
    }
    loadPermissions()
  }, [])

  const { allowedMenus, isCustomerUser, isLoaded } = sidebarState
  const activeNavigation = isCustomerUser ? customerNavigation : navigation
  const getGroupTitle = (group: NavGroup) => {
    if (group.titleFallback) return group.titleFallback[language]

    return t(group.titleKey)
  }

  const filteredNavigation = activeNavigation.map(group => ({
    ...group,
    items: group.items.filter(item => {
        if (!isLoaded) return false // Don't show until loaded to prevent "มาๆหายๆ"
        
        if (!allowedMenus) {
            // Super Admin - Show all EXCEPT redundant quick link
            if (item.titleKey === 'settings.items.change_password') return false
            return true
        }

        // Hide "Change Password" quick link if user has full Security/Vault access to avoid redundancy
        const hasFullSecurity = allowedMenus.includes('settings.items.vault') || allowedMenus.includes('settings.items.security')
        if (item.titleKey === 'settings.items.change_password' && hasFullSecurity) {
            return false
        }

        return allowedMenus.includes(item.titleKey)
    })
  })).filter(group => group.items.length > 0)

  // Waterfall animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.2
      }
    }
  }

  return (
    <motion.aside
      initial={{ x: -240 }}
      animate={{ x: 0, width: collapsed ? 80 : 240 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "h-screen z-[1000] flex flex-col font-sans",
        "glass-elite"
      )}
    >
      {/* Header Container - Balanced brand lockup */}
      <div className={cn(
        "relative flex items-center justify-center border-b border-border bg-background/55 backdrop-blur-md overflow-hidden transition-all duration-300",
        collapsed ? "h-16 px-3" : "h-24 px-5"
      )}>
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "absolute z-[1001] p-1.5 rounded-full bg-primary text-white shadow-md transition-all duration-300 hover:scale-105 active:scale-95",
            collapsed ? "right-2 top-2" : "-right-3 top-6"
          )}
        >
          <ChevronLeft
            size={16}
            className={cn("transition-transform duration-300", collapsed && "rotate-180")}
          />
        </button>

        <div
          className={cn(
            "relative z-10 flex items-center transition-all duration-300",
            collapsed ? "justify-center" : "w-full justify-start gap-3"
          )}
        >
          <div className={cn(
            "relative shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-border/50",
            "shadow-[0_12px_28px_rgba(0,30,76,0.14)] dark:shadow-[0_12px_28px_rgba(0,0,0,0.35)]",
            collapsed ? "h-10 w-10 rounded-xl" : "h-14 w-14"
          )}>
            <Image
              src="/drouteMind-mark.svg"
              alt="DRouteMind"
              fill
              priority
              loading="eager"
              sizes="56px"
              className={cn(
                "object-contain p-1.5 transition-transform duration-300 hover:scale-105"
              )}
            />
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-none">
              <div className="text-[1.35rem] font-black tracking-tight">
                <span className="text-primary">D</span><span className="text-accent">Route</span><span className="text-primary">Mind</span>
              </div>
              <div className="mt-1 truncate text-[0.68rem] font-bold text-muted-foreground">
                {t('header.command_centre')}
              </div>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto pt-6 pb-4 px-3 custom-scrollbar">
        <AnimatePresence mode="wait">
            {!isLoaded ? (
              <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <SidebarSkeleton collapsed={collapsed} />
              </motion.div>
            ) : (
              <div className="space-y-4">
                {filteredNavigation.map((group) => (
                  <div 
                    key={group.titleKey} 
                    className="glass-category-card p-2 group/card"
                  >
                    {!collapsed && (
                        <h3 className="category-title transition-colors duration-300">
                            {getGroupTitle(group)}
                        </h3>
                    )}
                    <div className="space-y-1">
                      {group.items.map((item) => (
                         <SidebarItem 
                            key={item.href} 
                            item={item} 
                            collapsed={collapsed} 
                            pathname={pathname} 
                            t={t} 
                         />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </AnimatePresence>
      </nav>

      <div className="p-5 border-t border-border bg-background/20 backdrop-blur-sm">
        <SidebarProfile collapsed={collapsed} />
      </div>
    </motion.aside>
  )
}

function SidebarItem({ item, collapsed, pathname, t }: { item: NavItem, collapsed: boolean, pathname: string | null, t: Translate }) {
    const isActive = pathname === item.href
    const [tooltipTop, setTooltipTop] = React.useState<number | null>(null)
    const label = t(item.titleKey)

    const showTooltip = (event: React.MouseEvent<HTMLAnchorElement> | React.FocusEvent<HTMLAnchorElement>) => {
        if (!collapsed) return

        const rect = event.currentTarget.getBoundingClientRect()
        setTooltipTop(rect.top + rect.height / 2)
    }
    
    return (
        <Link
            href={item.href}
            prefetch={true}
            className="block group relative"
            title={collapsed ? label : undefined}
            aria-label={label}
            onMouseEnter={showTooltip}
            onMouseLeave={() => setTooltipTop(null)}
            onFocus={showTooltip}
            onBlur={() => setTooltipTop(null)}
        >
            <div 
                className={cn(
                    "relative flex items-center gap-3 px-3 h-10 rounded-xl transition-all duration-200 overflow-hidden",
                    isActive
                        ? "nav-item-active"
                        : "text-secondary-foreground/70 hover:bg-muted/50 hover:text-foreground"
                )}
            >
                {/* Active Indicator Layer */}
                {isActive && (
                <>
                    <div className="absolute inset-0 bg-primary/5 dark:bg-primary/10 pointer-events-none" />
                    <div className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r-full" />
                </>
                )}

                <div className={cn(
                    "flex-shrink-0 transition-all duration-200 z-10 text-accent",
                    isActive ? "scale-105" : "group-hover:scale-105"   
                )}>
                    {item.icon}
                </div>

                {!collapsed && (
                <span className={cn(
                    "text-sm font-bold tracking-wide z-10 transition-colors duration-200 whitespace-nowrap",
                    isActive ? "text-accent dark:text-foreground font-black" : "text-secondary-foreground/80 group-hover:text-foreground"
                )}>
                    {label}
                </span>
                )}

                {item.badge && !collapsed && (
                <span 
                    className={cn(
                        "ml-auto px-1.5 py-0.5 text-[9px] font-black rounded-md border z-10",
                        item.badgeColor === "red" && "bg-destructive/20 text-destructive border-destructive/30",    
                        item.badgeColor === "blue" && "bg-blue-500/20 text-blue-500 border-blue-500/30",
                        item.badgeColor === "green" && "bg-primary/20 text-primary border-primary/30",
                        item.badgeColor === "yellow" && "bg-yellow-500/20 text-yellow-500 border-yellow-500/30"     
                    )}
                >
                    {typeof item.badge === 'string' ? t(item.badge).toUpperCase() : item.badge}
                </span>
                )}
            </div>
            {collapsed && tooltipTop !== null && (
                <span className={cn(
                    "pointer-events-none fixed left-[88px] z-[1200] -translate-y-1/2",
                    "max-w-64 whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-2",
                    "text-xs font-bold text-popover-foreground shadow-[0_16px_40px_rgba(0,0,0,0.22)]",
                    "opacity-100 transition-all duration-150"
                )}
                    style={{ top: tooltipTop }}
                >
                    {label}
                </span>
            )}
        </Link>
    )
}

function SidebarSkeleton({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="space-y-8 px-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-4">
          {!collapsed && <div className="h-2 w-20 bg-muted/40 rounded-full animate-pulse ml-4" />}
          {[1, 2].map((j) => (
            <div
              key={j}
              className={cn(
                "h-11 bg-muted/20 rounded-xl animate-pulse border border-border/5",
                collapsed ? "w-11 mx-auto" : "w-full"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
