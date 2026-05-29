"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
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
  Building,
  CalendarDays,
  Receipt,
  Wallet,
  History,
  CheckCircle2,
  Zap,
  Bot,
  Settings,
} from "lucide-react"

import { SidebarProfile } from "../layout/sidebar-profile"
import { getUserRole } from "@/lib/permissions"
import { useLanguage } from "@/components/providers/language-provider"

interface NavItem {
  titleKey: string
  href: string
  icon: React.ReactNode
  badge?: number | string
  badgeColor?: "red" | "blue" | "green" | "yellow"
}

interface NavGroup {
  titleKey: string
  items: NavItem[]
}

const navigation: NavGroup[] = [
  {
    titleKey: "nav_groups.ops_command",
    items: [
      { titleKey: "navigation.dashboard", href: "/dashboard", icon: <LayoutDashboard size={20} /> },
    ],
  },
  {
    titleKey: "nav_groups.operations",
    items: [
      { titleKey: "navigation.planning", href: "/planning", icon: <CalendarDays size={20} /> },
      { titleKey: "navigation.calendar", href: "/calendar", icon: <CalendarDays size={20} /> },
      { titleKey: "navigation.history", href: "/jobs/history", icon: <History size={20} /> },
      { titleKey: "navigation.monitoring", href: "/monitoring", icon: <Activity size={20} />, badge: "common.live", badgeColor: "green" },
      { titleKey: "navigation.pod", href: "/pod", icon: <FileText size={20} /> },
      { titleKey: "navigation.notifications", href: "/notifications", icon: <AlertTriangle size={20} />, badgeColor: "red" },
      { titleKey: "navigation.chat", href: "/chat", icon: <MessageSquare size={20} />, badgeColor: "blue" },
    ],
  },
  {
    titleKey: "nav_groups.asset_control",
    items: [
      { titleKey: "navigation.routes", href: "/routes", icon: <Navigation size={20} /> },
      { titleKey: "navigation.drivers", href: "/drivers", icon: <Users size={20} /> },
      { titleKey: "navigation.customers", href: "/settings/customers", icon: <Building size={20} /> },
      { titleKey: "navigation.fleet", href: "/vehicles", icon: <Truck size={20} /> },
      { titleKey: "navigation.checks", href: "/admin/vehicle-checks", icon: <CheckCircle2 size={20} /> },
      { titleKey: "navigation.maintenance", href: "/maintenance", icon: <Wrench size={20} /> },
      { titleKey: "navigation.fuel", href: "/fuel", icon: <Fuel size={20} /> },
    ],
  },
  {
    titleKey: "nav_groups.intelligence",
    items: [
      { titleKey: "navigation.analytics", href: "/admin/analytics", icon: <BarChart3 size={20} />, badgeColor: "blue" },
      { titleKey: "navigation.ai", href: "/intelligence", icon: <Bot size={20} />, badgeColor: "green" },
      { titleKey: "navigation.reports", href: "/reports", icon: <BarChart3 size={20} /> },
    ],
  },
  {
    titleKey: "nav_groups.financial",
    items: [
      { titleKey: "navigation.billing_customer", href: "/billing/customer", icon: <Receipt size={20} /> },
      { titleKey: "navigation.billing_automation", href: "/billing/automation", icon: <Zap size={20} />, badge: "common.new", badgeColor: "yellow" },
      { titleKey: "navigation.invoices", href: "/billing/invoices", icon: <FileText size={20} /> },
      { titleKey: "navigation.payouts", href: "/billing/driver", icon: <Wallet size={20} /> },
    ],
  },
  {
    titleKey: "nav_groups.settings",
    items: [
      { titleKey: "navigation.settings", href: "/settings", icon: <Settings size={20} /> },
    ],
  },
]

const customerNavigation: NavGroup[] = [
    {
      titleKey: "nav_groups.client_portal",
      items: [
        { titleKey: "navigation.dashboard", href: "/dashboard", icon: <LayoutDashboard size={20} /> },
        { titleKey: "navigation.customer_tracking_hub", href: "/dashboard/tracking", icon: <Activity size={20} />, badge: "common.live", badgeColor: "blue" },
        { titleKey: "navigation.monitoring", href: "/monitoring", icon: <Activity size={20} />, badge: "common.live", badgeColor: "green" },
        { titleKey: "navigation.routes", href: "/routes", icon: <Navigation size={20} /> },
        { titleKey: "navigation.history", href: "/jobs/history", icon: <History size={20} /> },
      ],
    },
    {
        titleKey: "nav_groups.documents",
        items: [
            { titleKey: "navigation.pod", href: "/pod", icon: <FileText size={20} /> },
        ]
    }
]

interface SidebarProps {
  collapsed?: boolean
  onToggle?: () => void
}

const navContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.1
    }
  }
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const { t } = useLanguage()
  const [sidebarState, setSidebarState] = React.useState<{
    userRole: number | null
    isCustomerUser: boolean
    roleLoaded: boolean
  }>({
    userRole: null,
    isCustomerUser: false,
    roleLoaded: false
  })

  React.useEffect(() => {
    async function checkRole() {
        // 1. Instant Cache Load
        const cachedRole = localStorage.getItem("sidebar_fix_role")
        const cachedCustomer = localStorage.getItem("sidebar_fix_isCustomer")
        
        if (cachedRole !== null && cachedCustomer !== null) {
            setSidebarState({
                userRole: Number(cachedRole),
                isCustomerUser: cachedCustomer === 'true',
                roleLoaded: true
            })
        }

        // 2. Background Sync
        try {
            const role = await getUserRole()
            const { isCustomer } = await import("@/lib/permissions")
            const { getUserProfile } = await import("@/lib/supabase/users")
            
            const profile = await getUserProfile()
            const isCust = (await isCustomer()) || (Number(role) === 7) || (profile?.Role === 'Customer')
            const finalRole = role || (profile?.Role === 'Customer' ? 7 : null)
            
            if (finalRole !== null) localStorage.setItem("sidebar_fix_role", String(finalRole))
            localStorage.setItem("sidebar_fix_isCustomer", String(isCust))

            setSidebarState({
                userRole: finalRole,
                isCustomerUser: !!isCust,
                roleLoaded: true
            })
        } catch {
            if (!cachedRole) {
                setSidebarState(prev => ({ ...prev, roleLoaded: true }))
            }
        }
    }
    checkRole()
  }, [])

  const { userRole, isCustomerUser, roleLoaded } = sidebarState
  const activeNavigation = isCustomerUser ? customerNavigation : navigation

  const filteredNavigation = activeNavigation.filter(group => {
    if (!roleLoaded || userRole === null) return true 
    
    // If identified as customer, ONLY allow customerNavigation items
    if (isCustomerUser) return true

    // Safety for Role 7 if for some reason isCustomerUser is false
    if (Number(userRole) === 7) {
        return group.titleKey === "nav_groups.client_portal" || group.titleKey === "nav_groups.documents"
    }

    if (group.titleKey === "nav_groups.intelligence") return [1, 2].includes(userRole)
    if (group.titleKey === "nav_groups.financial") return [1, 2, 4].includes(userRole)
    if (group.titleKey === "nav_groups.settings") return [1, 2].includes(userRole)
    
    if (group.titleKey === "nav_groups.operations" || group.titleKey === "nav_groups.asset_control") {
        if (userRole === 4 || userRole === 7) return false
    }

    return true
  })

  return (
    <motion.aside
      initial={{ x: -280 }}
      animate={{ x: 0, width: collapsed ? 100 : 320 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "fixed top-0 left-0 h-screen z-[1000] flex flex-col font-sans",
        "bg-secondary border-r border-border text-secondary-foreground shadow-2xl transition-all duration-500"
      )}
    >
      {/* Brand Signature - Optimized Logo Only Edition */}
      <div className={cn(
        "relative flex flex-col items-center justify-center border-b border-border bg-background/80 backdrop-blur-3xl overflow-hidden transition-all duration-500",
        collapsed ? "h-20" : "h-40"
      )}>
        {/* Toggle Button - Floating Edition */}
        <button
          onClick={onToggle}
          className={cn(
            "absolute z-[1001] p-1.5 rounded-full bg-primary text-white shadow-xl transition-all duration-500 hover:scale-110 active:scale-95",
            collapsed ? "right-2 top-2" : "-right-3 top-6"
          )}
        >
          <ChevronLeft
            size={16}
            className={cn("transition-transform duration-500", collapsed && "rotate-180")}
          />
        </button>

        <div className={cn(
            "relative flex items-center justify-center logo-container-pure transition-all duration-700",
            "bg-muted rounded-full shadow-lg border border-border/10",
            collapsed ? "w-12 h-12 p-2" : "w-36 h-36 p-4"
        )}>
          <div className="relative w-full h-full rounded-full overflow-hidden bg-background/20 flex items-center justify-center">
            <Image 
              src="/logo2.png" 
              alt="LogisPro" 
              fill 
              priority
              loading="eager"
              sizes="(max-width: 768px) 48px, 144px"
              className={cn(
                "object-contain logo-pure transition-all duration-700 hover:scale-110",
                "mix-blend-multiply dark:mix-blend-normal dark:brightness-110"
              )} 
            />
          </div>
        </div>
      </div>

      {/* Navigation Matrix */}
      <nav className="flex-1 overflow-y-auto pt-8 pb-4 px-4 custom-scrollbar">
        {!roleLoaded ? (
          <SidebarSkeleton collapsed={collapsed} />
        ) : (
          <motion.div variants={navContainer} initial="hidden" animate="show" className="space-y-8">
            {filteredNavigation.map((group) => (
              <div key={group.titleKey} className="space-y-4">
                {!collapsed && (
                  <h2 className="px-4 text-base font-bold font-black uppercase tracking-[0.4em] text-accent/90">
                    {t(group.titleKey)}
                  </h2>
                )}
                
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const isActive = pathname === item.href
                    return (
                      <Link key={item.href} href={item.href} prefetch={true} className="block group">
                        <div className={cn(
                            "relative flex items-center gap-4 px-4 h-14 rounded-2xl transition-all duration-300 overflow-hidden",
                             isActive
                             ? "bg-primary/10 text-accent shadow-[inset_0_0_20px_rgba(182,9,0,0.05)]"
                             : "text-secondary-foreground hover:bg-muted hover:text-foreground"
                        )}>
                          {/* Active Neon Line */}
                          {isActive && (
                            <motion.div 
                                layoutId="active-nav"
                                className="absolute left-0 top-3 bottom-3 w-1 bg-accent rounded-r-full shadow-[0_0_15px_rgba(182,9,0,0.8)]"
                            />
                          )}
                          
                          <div className={cn(
                              "flex-shrink-0 transition-transform duration-300",
                              isActive ? "text-primary scale-110" : "group-hover:scale-110 group-hover:text-primary/70"
                          )}>
                             {item.icon}
                          </div>
                          
                          {!collapsed && (
                            <span className={cn(
                                "text-xl font-black tracking-tight",
                                isActive ? "text-accent" : "text-secondary-foreground group-hover:text-foreground"
                            )}>
                                {t(item.titleKey)}
                            </span>
                          )}
                          
                          {item.badge && !collapsed && (
                            <span className={cn(
                                "ml-auto px-2 py-0.5 text-base font-bold font-black rounded-lg border",
                                item.badgeColor === "red" && "bg-destructive/10 text-destructive border-destructive/20",
                                item.badgeColor === "blue" && "bg-blue-500/10 text-blue-500 border-blue-500/20",
                                item.badgeColor === "green" && "bg-primary/10 text-primary border-primary/20",
                                item.badgeColor === "yellow" && "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                            )}>
                                {typeof item.badge === 'string' ? t(item.badge) : item.badge}
                            </span>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </nav>

      {/* User Core */}
      <div className="p-6 border-t border-border bg-background/80">
        <SidebarProfile collapsed={collapsed} />
      </div>
    </motion.aside>
  )
}

function SidebarSkeleton({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="space-y-8 px-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-4">
          {!collapsed && (
            <div className="h-2 w-20 bg-muted rounded-full animate-pulse ml-4" />
          )}
          {[1, 2].map((j) => (
            <div
              key={j}
              className={cn(
                "h-14 bg-muted/50 rounded-2xl animate-pulse border border-border/5",
                collapsed ? "w-14 mx-auto" : "w-full"
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
