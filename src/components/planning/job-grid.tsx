"use client"

import { motion } from "framer-motion"
import { Job } from "@/lib/supabase/jobs"
import { Driver } from "@/lib/supabase/drivers"
import { Vehicle } from "@/lib/supabase/vehicles"
import { Customer } from "@/lib/supabase/customers"
import { Route } from "@/lib/supabase/routes"
import { Subcontractor } from "@/types/subcontractor"
import { RecentJobItem } from "@/components/planning/recent-job-item"
import { PremiumCard, PremiumCardHeader, PremiumCardTitle } from "@/components/ui/premium-card"
import { Package, ArrowRight, Plus } from "lucide-react"
import Link from "next/link"
import { PremiumButton } from "@/components/ui/premium-button"
import { JobDialog } from "@/components/planning/job-dialog"
import { useLanguage } from "@/components/providers/language-provider"

interface JobGridProps {
    jobs: Job[]
    drivers: Driver[]
    vehicles: Vehicle[]
    customers: Customer[]
    routes: Route[]
    subcontractors: Subcontractor[]
    canViewIncome: boolean
    canViewExpense: boolean
    canDelete: boolean
    canAssign: boolean
    view?: 'list' | 'requests'
    canCreate?: boolean
}

export function JobGrid({ 
    jobs,
    drivers,
    vehicles,
    customers,
    routes,
    subcontractors,
    canViewIncome,
    canViewExpense,
    canDelete,
    canAssign,
    view = 'list',
    canCreate = true
}: JobGridProps) {
    const { t } = useLanguage()
    
    return (
        <PremiumCard className="p-0 overflow-hidden shadow-sm border border-border rounded-2xl">
            <PremiumCardHeader className="p-5 border-b border-border bg-muted/20 relative overflow-hidden flex flex-row items-center justify-between">
                <div className="flex items-center gap-3 relative z-10 flex-1">
                   <div className="p-2 bg-primary/10 rounded-lg">
                      <Package className="text-primary" size={18} />
                   </div>
                   <h2 className="text-lg font-black text-foreground tracking-tight uppercase">
                      {view === 'requests' ? t('jobs.head_requests') : t('jobs.head_live_feed')}
                   </h2>
                </div>
                <Link href="/jobs/history" className="relative z-10">
                    <PremiumButton variant="ghost" size="sm" className="text-[10px] font-black tracking-[0.2em] text-muted-foreground hover:text-foreground hover:bg-muted/50 h-9">
                        {t('navigation.history').toUpperCase()} <ArrowRight className="w-4 h-4 ml-2" />
                    </PremiumButton>
                </Link>
            </PremiumCardHeader>
                
                {jobs.length === 0 ? (
                    <div className="text-center py-16 bg-background/20">
                        <div className="bg-muted/50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border/5">
                            <Package className="w-8 h-8 text-muted-foreground opacity-20" />
                        </div>
                        <p className="text-base text-muted-foreground font-bold mb-4 uppercase tracking-widest opacity-60">
                            {view === 'requests' ? t('jobs.dialog.zero_missions') : t('common.no_data')}
                        </p>
                        <div className="flex justify-center gap-2">
                            {view !== 'requests' && (
                                <JobDialog 
                                    drivers={drivers} 
                                    vehicles={vehicles}
                                    customers={customers}
                                    routes={routes}
                                    subcontractors={subcontractors}
                                    canViewIncome={canViewIncome}
                                    canViewExpense={canViewExpense}
                                    canAssign={canAssign}
                                    canDelete={canDelete}
                                    trigger={
                                        canCreate ? (
                                            <PremiumButton className="h-11 px-8 rounded-xl text-xs font-black uppercase tracking-widest">
                                                <Plus size={18} className="mr-2" />
                                                {t('planning.new_job')}
                                            </PremiumButton>
                                        ) : <></>
                                    }
                                />
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-5 bg-transparent">
                        {jobs.map((job) => (
                            <motion.div 
                                key={job.Job_ID}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="h-full"
                            >
                                <RecentJobItem 
                                    job={job}
                                    drivers={drivers}
                                    vehicles={vehicles}
                                    customers={customers}
                                    routes={routes}
                                    subcontractors={subcontractors}
                                    canViewIncome={canViewIncome}
                                    canViewExpense={canViewExpense}
                                    canAssign={canAssign}
                                    canDelete={canDelete}
                                />
                            </motion.div>
                        ))}
                    </div>
                )}
                
                {jobs.length > 0 && (
                    <div className="p-4 bg-muted/20 text-center border-t border-border">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] opacity-50">
                            LOGIS-PRO 360 • Transport Management System
                        </p>
                    </div>
                )}
        </PremiumCard>
    )
}
