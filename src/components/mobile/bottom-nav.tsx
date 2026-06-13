"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutGrid, Users, Truck } from "lucide-react"
import { cn } from "@/lib/utils"

export function BottomNav() {
  const pathname = usePathname()

  if (!pathname.startsWith("/mobile")) return null

  // Security: Never show BottomNav on login or chat page
  if (pathname === "/mobile/login" || pathname === "/mobile/chat") return null

  const navItems = [
    { href: "/mobile/dashboard", icon: LayoutGrid, label: "หน้าแรก" },
    { href: "/mobile/jobs", icon: Truck, label: "งาน" },
    { href: "/mobile/profile", icon: Users, label: "โปรไฟล์" },
  ]

  return (
    <nav className="w-full bg-card border-t border-border shadow-[0_-4px_12px_rgba(0,0,0,0.03)] px-6 pb-[env(safe-area-inset-bottom)] h-[calc(72px+env(safe-area-inset-bottom))] flex items-center justify-between relative z-50">
      {navItems.map((item) => {
        // Highlight the tab for its sub-routes too (e.g. /mobile/jobs/[id]).
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
        return (
          <Link 
            key={item.href} 
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center min-w-[64px] transition-all active:scale-95",
              isActive ? "text-primary" : "text-muted-foreground/50"
            )}
          >
            <div className={cn(
                "p-1.5 rounded-lg transition-colors",
                isActive ? "bg-primary/5" : ""
            )}>
              <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
            </div>
            <span className={cn(
              "text-[10px] font-bold mt-1 transition-all",
              isActive ? "opacity-100" : "opacity-60"
            )}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}


