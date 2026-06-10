"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Building2, Loader2, Users } from "lucide-react"
import { useBranch } from "@/components/providers/branch-provider"
import { useCustomer } from "@/components/providers/customer-provider"
import { useLanguage } from "@/components/providers/language-provider"
import { NotificationDropdown } from "@/components/notifications/notification-dropdown"
import { LanguageSwitcher } from "@/components/ui/language-switcher"
import { ThemeToggle } from "@/components/ui/theme-toggle"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"

interface HeaderProps {
  sidebarCollapsed?: boolean
}

export function Header({ sidebarCollapsed = false }: HeaderProps) {
  const { selectedBranch, setSelectedBranch, branches, isAdmin, isPending } = useBranch()
  const { selectedCustomer, setSelectedCustomer, customers, isCustomerUser, isPending: isCustomerPending } = useCustomer()
  const { t } = useLanguage()

  return (
    <header
      className={cn(
        "fixed top-0 right-0 h-20 z-50 flex items-center justify-between px-6 font-sans",
        "bg-background/80 backdrop-blur-3xl border-b border-border shadow-[0_10px_40px_rgba(0,0,0,0.1)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.3)] transition-all duration-300",
        sidebarCollapsed ? "left-20" : "left-[240px]"
      )}
      style={{ transition: "left 0.5s ease-in-out" }}
    >
      {/* Global Filters */}
      <div className="flex items-center gap-6 flex-1">
         {/* Branch Selector (Global) - Only for Admins */}
         {isAdmin && (
            <div className="w-56 shrink-0 relative z-[60]">
                <Select 
                    value={selectedBranch} 
                    onValueChange={setSelectedBranch}
                    disabled={isPending}
                >
                    <SelectTrigger className="bg-muted border-border text-foreground h-14 w-full focus:ring-1 focus:ring-primary/40 hover:bg-muted/80 transition-all rounded-2xl group">
                            <div className="flex items-center gap-3 truncate">
                            <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                                {isPending ? (
                                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                ) : (
                                    <Building2 className="w-4 h-4 text-primary shrink-0" />
                                )}
                            </div>
                             <span className={cn(
                                 "truncate font-black text-accent text-sm font-bold uppercase tracking-normal",
                                 isPending && "opacity-50"
                             )}>
                                {selectedBranch === 'All' ? t('header.all_branches') : branches.find(b => b.Branch_ID === selectedBranch)?.Branch_Name || selectedBranch}
                            </span>
                            </div>
                    </SelectTrigger>
                    <SelectContent className="z-[70] bg-popover border border-border shadow-[0_20px_60px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)] rounded-[2rem] text-popover-foreground p-2">
                        <SelectItem value="All" className="rounded-xl hover:bg-primary/10 focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer py-3 h-12">{t('header.all_branches')}</SelectItem>
                        {branches.map(b => (
                            <SelectItem key={b.Branch_ID} value={b.Branch_ID} className="rounded-xl hover:bg-primary/10 focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer py-3 h-12">
                                {b.Branch_Name?.toUpperCase()}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
          )}

         {/* Customer Selector (Global) - For Admins and Dispatchers */}
         {!isCustomerUser && (
            <div className="w-56 shrink-0 relative z-[60]">
                <Select 
                    value={selectedCustomer} 
                    onValueChange={setSelectedCustomer}
                    disabled={isCustomerPending}
                >
                    <SelectTrigger className="bg-muted border-border text-foreground h-14 w-full focus:ring-1 focus:ring-primary/40 hover:bg-muted/80 transition-all rounded-2xl group">
                            <div className="flex items-center gap-3 truncate">
                            <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                                {isCustomerPending ? (
                                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                ) : (
                                    <Users className="w-4 h-4 text-primary shrink-0" />
                                )}
                            </div>
                             <span className={cn(
                                 "truncate font-black text-accent text-sm font-bold uppercase tracking-normal",
                                 isCustomerPending && "opacity-50"
                             )}>
                                {selectedCustomer === 'All' ? t('header.all_customers') : customers.find(c => c.Customer_ID === selectedCustomer)?.Customer_Name || selectedCustomer}
                            </span>
                            </div>
                    </SelectTrigger>
                    <SelectContent className="z-[70] bg-popover border border-border shadow-[0_20px_60px_rgba(0,0,0,0.2)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.6)] rounded-[2rem] text-popover-foreground p-2">
                        <SelectItem value="All" className="rounded-xl hover:bg-primary/10 focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer py-3 h-12">{t('header.all_customers')}</SelectItem>
                        {customers.map(c => (
                            <SelectItem key={c.Customer_ID} value={c.Customer_ID} className="rounded-xl hover:bg-primary/10 focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer py-3 h-12">
                                {c.Customer_Name?.toUpperCase()}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
          )}

      </div>

      {/* Right Section */}
      <div className="flex items-center gap-6">
        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Language Selection */}
        <LanguageSwitcher />

        {/* Notifications */}
        <NotificationDropdown />
      </div>
    </header>
  )
}

