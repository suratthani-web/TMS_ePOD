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
    <nav
      className="w-full bg-card border-t border-border px-4 pb-[var(--sab)] h-[calc(64px+var(--sab))] grid grid-flow-col auto-cols-fr items-center relative z-50"
      style={{ boxShadow: '0 -4px 16px rgba(24,27,24,0.04)', touchAction: 'manipulation' }}
    >
      {navItems.map((item) => {
        // Highlight the tab for its sub-routes too (e.g. /mobile/jobs/[id]).
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center justify-center gap-1 min-h-[48px] transition-all active:scale-95",
              isActive ? "text-foreground" : "text-muted-foreground"
            )}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <item.icon
              size={22}
              strokeWidth={isActive ? 2.4 : 1.9}
              style={isActive ? { color: 'var(--pd-hi)' } : undefined}
            />
            <span className={cn("text-[10px] transition-all", isActive ? "font-bold" : "font-medium opacity-70")}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}


