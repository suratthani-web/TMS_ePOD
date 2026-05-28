"use client"

import { motion } from "framer-motion"
import { 
    Activity, 
    AlertCircle, 
    TrendingUp,
    Users,
    ShieldCheck,
    Zap
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"

interface DailySummaryProps {
    stats: {
        total: number
        delivered: number
        inProgress: number
        pending: number
        sos?: number
        totalQty?: number
    }
    driverStats: {
        total: number
        active: number
        onJob: number
    }
    biddingCount: number
    sosCount: number
    fleetAlertsCount: number
    customerMode?: boolean
}

export function DailySummary({ stats, driverStats, biddingCount, sosCount, fleetAlertsCount, customerMode = false }: DailySummaryProps) {
    const { t } = useLanguage()
    
    const deliveryRate = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : 0
    const readyDrivers = Math.max(0, driverStats.active - driverStats.onJob)

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    }

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    }

    return (
        <motion.div 
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-6 h-full"
        >
            {/* Main Delivery Progress - Big Card (2x2) or (4x2 for customers) */}
            <motion.div variants={item} className={customerMode ? "md:col-span-4 md:row-span-2" : "md:col-span-2 md:row-span-2"}>
                <Card variant="glass" className="h-full relative overflow-hidden group">
                    <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-700" />
                    
                    <CardContent className="h-full flex flex-col justify-between p-8">
                        <div>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-primary/10 rounded-2xl">
                                    <Activity className="text-primary" size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-foreground uppercase tracking-wider">
                                        {t('dashboard.todays_mission')}
                                    </h3>
                                    <p className="text-lg font-bold text-muted-foreground uppercase tracking-widest text-xs opacity-70">
                                        {t('dashboard.operational_success')}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-end gap-6 mb-8">
                                <span className="text-7xl font-black premium-text-gradient leading-none">
                                    {deliveryRate}%
                                </span>
                                <div className="pb-2">
                                    <div className="flex items-center gap-1 text-emerald-500 font-black text-lg">
                                        <TrendingUp size={16} /> 
                                        +{Math.round(deliveryRate * 0.1)}%
                                    </div>
                                    <p className="text-muted-foreground text-sm font-bold uppercase">{t('dashboard.vs_yesterday')}</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${deliveryRate}%` }}
                                    transition={{ duration: 1, ease: "easeOut", delay: 0.5 }}
                                    className="h-full bg-gradient-to-r from-primary to-indigo-400 rounded-full shadow-[0_0_15px_rgba(255,30,133,0.3)]"
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-4 bg-muted/30 rounded-2xl border border-border/5">
                                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1">{t('common.all')}</p>
                                    <p className="text-2xl font-black">{stats.total}</p>
                                </div>
                                <div className="p-4 bg-emerald-50/50 dark:bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-1">{t('jobs.status_delivered')}</p>
                                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{stats.delivered}</p>
                                </div>
                                <div className="p-4 bg-blue-50/50 dark:bg-blue-500/5 rounded-2xl border border-blue-500/10">
                                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">{t('dashboard.activity.active')}</p>
                                    <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{stats.inProgress}</p>
                                </div>
                                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                                    <p className="text-xs font-bold text-primary uppercase mb-1">ยอดสินค้า</p>
                                    <p className="text-2xl font-black text-primary">{(stats.totalQty || 0).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Fleet Availability Card (1x1) - HIDE FOR CUSTOMERS */}
            {!customerMode && (
                <motion.div variants={item} className="md:col-span-1 md:row-span-1">
                    <Card variant="default" className="h-full bg-indigo-600 border-0 group hover:bg-indigo-700 transition-colors">
                        <CardContent className="h-full flex flex-col justify-between p-8 text-white">
                            <div className="flex items-center justify-between">
                                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                    <Users size={20} />
                                </div>
                                <span className="text-xs font-black uppercase tracking-widest opacity-60">{t('dashboard.ready_units')}</span>
                            </div>
                            <div>
                                <p className="text-4xl font-black mb-1">{readyDrivers}</p>
                                <p className="text-sm font-bold opacity-80 uppercase tracking-widest leading-tight">
                                    {t('dashboard.available_drivers')}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* Marketplace Bids Card (1x1) - HIDE FOR CUSTOMERS */}
            {!customerMode && (
                <motion.div variants={item} className="md:col-span-1 md:row-span-1">
                    <Card variant="default" className="h-full bg-slate-900 border-0 group hover:bg-black transition-colors">
                        <CardContent className="h-full flex flex-col justify-between p-8 text-white">
                            <div className="flex items-center justify-between">
                                <div className="p-2 bg-orange-500 rounded-xl">
                                    <Activity size={20} />
                                </div>
                                <span className="text-xs font-black uppercase tracking-widest opacity-60">{t('dashboard.market_pulse')}</span>
                            </div>
                            <div>
                                <p className="text-4xl font-black mb-1 text-orange-500">{biddingCount}</p>
                                <p className="text-sm font-bold opacity-80 uppercase tracking-widest leading-tight">
                                    {t('dashboard.open_jobs_market')}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}

            {/* Fleet Intelligence Card (1x1) - NEW */}
            {!customerMode && (
                <motion.div variants={item} className="md:col-span-1 md:row-span-1">
                    <div 
                        className="h-full cursor-pointer"
                        onClick={() => window.location.href = '/vehicles/intelligence'}
                    >
                        <Card 
                            variant="default" 
                            className={cn(
                                "h-full border-0 group transition-colors",
                                fleetAlertsCount > 0 ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
                            )}
                        >
                            <CardContent className="h-full flex flex-col justify-between p-8 text-white">
                                <div className="flex items-center justify-between">
                                    <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
                                        <Zap size={20} />
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-widest opacity-60">Fleet Intel</span>
                                </div>
                                <div>
                                    <p className="text-4xl font-black mb-1">{fleetAlertsCount}</p>
                                    <p className="text-sm font-bold opacity-80 uppercase tracking-widest leading-tight">
                                        {fleetAlertsCount > 0 ? "พบความผิดปกติ" : "สถานะปกติ"}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </motion.div>
            )}

            {/* Critical Alerts Card (1x1) - REPOSITIONED */}
            {!customerMode && (
                <motion.div variants={item} className="md:col-span-1 md:row-span-1">
                    <Card variant="glass" className={`h-full border-l-4 ${sosCount > 0 ? 'border-l-rose-500 bg-rose-500/5' : 'border-l-indigo-500'}`}>
                        <CardContent className="h-full flex flex-col justify-between p-8">
                            <div className="flex items-center justify-between">
                                <div className={`p-2 rounded-xl ${sosCount > 0 ? 'bg-rose-500/20 text-rose-500 animate-pulse' : 'bg-indigo-500/20 text-indigo-500'}`}>
                                    <AlertCircle size={20} />
                                </div>
                                <span className="text-xs font-black text-muted-foreground uppercase tracking-widest opacity-60">SOS Signal</span>
                            </div>
                            <div>
                                <p className={cn("text-4xl font-black mb-1", sosCount > 0 ? "text-rose-500" : "text-foreground")}>{sosCount}</p>
                                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest leading-tight">
                                    {t('dashboard.sos_reporting')}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}
        </motion.div>
    )
}
