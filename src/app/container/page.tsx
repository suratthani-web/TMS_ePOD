"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
    Package, ShieldCheck, Clock, AlertTriangle, 
    Search, Filter, Plus, ChevronRight,
    TrendingUp, Activity, Box, Truck,
    MapPin, Ship, Calendar, FileText,
    Thermometer
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"
import { getContainerJobs, getContainerStats, ContainerJob } from "./actions"
import { format, differenceInDays, parseISO } from "date-fns"
import { th } from "date-fns/locale"
import Link from "next/link"

export default function ContainerDashboard() {
    const { t, language } = useLanguage()
    const [jobs, setJobs] = useState<ContainerJob[]>([])
    const [stats, setStats] = useState({ total: 0, active: 0, nearLfd: 0, overdue: 0 })
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [activeTab, setActiveTab] = useState("tracking")

    useEffect(() => {
        refreshData()
    }, [])

    const refreshData = async () => {
        setLoading(true)
        const [jobsData, statsData] = await Promise.all([
            getContainerJobs(),
            getContainerStats()
        ])
        setJobs(jobsData)
        setStats(statsData)
        setLoading(false)
    }

    const filteredJobs = jobs.filter(job => 
        job.Job_ID.toLowerCase().includes(search.toLowerCase()) ||
        job.container?.container_no?.toLowerCase().includes(search.toLowerCase()) ||
        job.container?.seal_no?.toLowerCase().includes(search.toLowerCase()) ||
        job.Customer_Name?.toLowerCase().includes(search.toLowerCase())
    )

    const activeChassisJobs = filteredJobs.filter(job => job.chassis_plate && job.Job_Status !== 'Completed')
    
    const lfdJobs = filteredJobs
        .filter(job => job.container?.lfd_detention || job.container?.lfd_demurrage)
        .sort((a, b) => {
            const dateA = a.container?.lfd_detention || a.container?.lfd_demurrage || '9999-12-31'
            const dateB = b.container?.lfd_detention || b.container?.lfd_demurrage || '9999-12-31'
            return new Date(dateA).getTime() - new Date(dateB).getTime()
        })

    const getLFDStatus = (lfdDate: string | null | undefined) => {
        if (!lfdDate) return { color: "text-muted-foreground", label: "N/A", bg: "bg-muted" }
        const today = new Date()
        const lfd = parseISO(lfdDate)
        const diff = differenceInDays(lfd, today)

        if (diff < 0) return { color: "text-red-500", label: "Overdue", bg: "bg-red-500/10 border-red-500/20" }
        if (diff <= 2) return { color: "text-amber-500", label: `${diff} Days Left`, bg: "bg-amber-500/10 border-amber-500/20" }
        return { color: "text-emerald-500", label: `${diff} Days Left`, bg: "bg-emerald-500/10 border-emerald-500/20" }
    }

    return (
        <div className="p-8 space-y-10 min-h-screen bg-slate-50/50 dark:bg-transparent">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="space-y-2">
                    <h1 className="text-5xl font-black tracking-tighter uppercase italic text-foreground flex items-center gap-4">
                        <Package className="w-12 h-12 text-primary" />
                        {t('container.title')}
                    </h1>
                    <p className="text-xl font-bold text-muted-foreground uppercase tracking-widest">{t('container.subtitle')}</p>
                </div>
                <div className="flex gap-4">
                    <Button 
                        size="lg" 
                        variant="outline" 
                        onClick={refreshData}
                        disabled={loading}
                        className="h-14 px-8 text-lg font-black border-2"
                    >
                        REFRESH_INTEL
                    </Button>
                    <Link href="/planning">
                        <Button size="lg" className="h-14 px-8 text-lg font-black bg-primary text-white shadow-xl shadow-primary/20">
                            <Plus className="w-6 h-6 mr-2" /> CREATE_MISSION
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: t('container.stats.total'), value: stats.total, icon: Box, color: "text-blue-500" },
                    { label: t('container.stats.active'), value: stats.active, icon: Activity, color: "text-indigo-500" },
                    { label: t('container.stats.near_lfd'), value: stats.nearLfd, icon: Clock, color: "text-amber-500" },
                    { label: t('container.stats.overdue'), value: stats.overdue, icon: AlertTriangle, color: "text-red-500" },
                ].map((stat, i) => (
                    <Card key={i} className="p-6 border-none shadow-sm bg-background hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-4">
                            <div className={cn("p-3 rounded-2xl bg-muted/50", stat.color)}>
                                <stat.icon size={24} />
                            </div>
                            <TrendingUp className="text-muted-foreground/30" size={20} />
                        </div>
                        <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">{stat.label}</p>
                        <h3 className="text-4xl font-black mt-1">{stat.value.toLocaleString()}</h3>
                    </Card>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="bg-background rounded-[2.5rem] border border-border/50 shadow-sm overflow-hidden">
                <Tabs defaultValue="tracking" onValueChange={setActiveTab} className="w-full">
                    <div className="px-8 pt-8 flex items-center justify-between border-b border-border/50 pb-6 flex-wrap gap-6">
                        <TabsList className="bg-muted p-1 rounded-2xl h-14 border border-border">
                            <TabsTrigger value="tracking" className="rounded-xl px-8 text-lg font-black data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm">
                                {t('container.tabs.tracking')}
                            </TabsTrigger>
                            <TabsTrigger value="chassis" className="rounded-xl px-8 text-lg font-black data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm">
                                {t('container.tabs.chassis')}
                            </TabsTrigger>
                            <TabsTrigger value="lfd_alerts" className="rounded-xl px-8 text-lg font-black data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm">
                                {t('container.tabs.lfd_alerts')}
                            </TabsTrigger>
                        </TabsList>

                        <div className="relative w-full md:w-96 group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
                            <Input 
                                placeholder="Search Intel..." 
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="h-14 pl-12 pr-4 bg-muted border-none rounded-2xl text-lg font-bold group-focus-within:ring-2 group-focus-within:ring-primary/20"
                            />
                        </div>
                    </div>

                    <TabsContent value="tracking" className="m-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-muted/30">
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">{t('container.form.container_no')}</th>
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">MISSION_INFO</th>
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">FLEET_STATUS</th>
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">LFD_WATCH</th>
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em] text-center">ACTION</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {loading ? (
                                        [...Array(3)].map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td colSpan={5} className="px-8 py-12 text-center">
                                                    <div className="h-8 bg-muted rounded-full w-3/4 mx-auto" />
                                                </td>
                                            </tr>
                                        ))
                                    ) : filteredJobs.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-8 py-20 text-center text-muted-foreground font-black italic">
                                                NO_CONTAINERS_MATCHING_CRITERIA
                                            </td>
                                        </tr>
                                    ) : filteredJobs.map((job) => {
                                        const detentionStatus = getLFDStatus(job.container?.lfd_detention)
                                        const demurrageStatus = getLFDStatus(job.container?.lfd_demurrage)
                                        const targetTemp = job.container?.target_temperature
                                        const latestTemp = Number((job as { latest_temp?: number | string | null }).latest_temp ?? 0)
                                        const isTempWarning = targetTemp !== null && targetTemp !== undefined && latestTemp !== null && latestTemp > (targetTemp + 2)

                                        return (
                                            <tr key={job.Job_ID} className="group hover:bg-muted/20 transition-colors">
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary relative">
                                                            <Box size={24} />
                                                            {job.container?.container_size === 'REEFER' && (
                                                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center border-2 border-background">
                                                                    <Thermometer size={10} className="text-white" />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="text-xl font-black text-foreground tracking-tighter">{job.container?.container_no || 'NOT_ASSIGNED'}</p>
                                                            <div className="flex items-center gap-3 mt-0.5">
                                                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                                                                    <ShieldCheck size={12} className="text-indigo-500" />
                                                                    {job.container?.seal_no || '-'}
                                                                </p>
                                                                {job.container?.container_size === 'REEFER' && latestTemp !== null && (
                                                                    <Badge className={cn(
                                                                        "text-[10px] font-black py-0 px-2 rounded-full border-none",
                                                                        isTempWarning ? "bg-red-500 animate-pulse" : "bg-blue-500"
                                                                    )}>
                                                                        {latestTemp}°C
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="space-y-1.5">
                                                        <p className="text-sm font-black text-primary italic uppercase tracking-tight">#{job.Job_ID.slice(-8)}</p>
                                                        <p className="text-base font-bold line-clamp-1">{job.Customer_Name}</p>
                                                        <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground">
                                                            <Ship size={12} /> {job.container?.shipping_line || '-'}
                                                            <span className="opacity-20">|</span>
                                                            <MapPin size={12} /> {job.Dest_Location || '-'}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className="rounded-lg bg-blue-500/10 text-blue-500 border-blue-500/20 font-black px-3 py-1">
                                                                {job.Job_Status}
                                                            </Badge>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-black text-muted-foreground uppercase">Prime Mover</span>
                                                                <span className="text-sm font-black italic">{job.Vehicle_Plate || '-'}</span>
                                                            </div>
                                                            <div className="w-px h-6 bg-border" />
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-black text-muted-foreground uppercase">Chassis</span>
                                                                <span className="text-sm font-black italic text-indigo-500">{job.chassis_plate || '-'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col gap-2">
                                                        <div className={cn("px-3 py-1.5 rounded-xl border flex items-center justify-between gap-3", detentionStatus.bg)}>
                                                            <span className="text-[10px] font-black uppercase text-muted-foreground">Detention</span>
                                                            <span className={cn("text-xs font-black", detentionStatus.color)}>{detentionStatus.label}</span>
                                                        </div>
                                                        <div className={cn("px-3 py-1.5 rounded-xl border flex items-center justify-between gap-3", demurrageStatus.bg)}>
                                                            <span className="text-[10px] font-black uppercase text-muted-foreground">Demurrage</span>
                                                            <span className={cn("text-xs font-black", demurrageStatus.color)}>{demurrageStatus.label}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-center">
                                                    <Link href={`/jobs/history?id=${job.Job_ID}`}>
                                                        <Button variant="ghost" size="icon" className="w-12 h-12 rounded-xl hover:bg-primary/10 hover:text-primary transition-all">
                                                            <ChevronRight size={24} />
                                                        </Button>
                                                    </Link>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>

                    <TabsContent value="chassis" className="m-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-muted/30">
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Chassis Plate / ทะเบียนหาง</th>
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Connected Head / ทะเบียนหัว</th>
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Loaded Container / ตู้ที่บรรทุก</th>
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Active Mission / ภารกิจ</th>
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em] text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {activeChassisJobs.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-8 py-20 text-center text-muted-foreground font-black italic">
                                                NO_ACTIVE_CHASSIS_IN_TRANSIT
                                            </td>
                                        </tr>
                                    ) : activeChassisJobs.map((job) => (
                                        <tr key={job.Job_ID} className="group hover:bg-muted/20 transition-colors">
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-3">
                                                    <Truck className="w-6 h-6 text-indigo-500" />
                                                    <span className="text-lg font-black text-foreground italic tracking-tight">{job.chassis_plate}</span>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div>
                                                    <p className="text-base font-black italic">{job.Vehicle_Plate || '-'}</p>
                                                    <p className="text-xs text-muted-foreground font-bold">{job.Driver_Name || 'No Driver'}</p>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div>
                                                    <p className="text-base font-black text-primary">{job.container?.container_no || '-'}</p>
                                                    <p className="text-xs text-muted-foreground font-bold">{job.container?.container_size || '-'}</p>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div>
                                                    <p className="text-sm font-black text-primary italic">#{job.Job_ID.slice(-8)}</p>
                                                    <p className="text-xs text-muted-foreground line-clamp-1 font-bold">{job.Customer_Name}</p>
                                                </div>
                                            </td>
                                            <td className="px-8 py-6 text-center">
                                                <Badge variant="outline" className="rounded-lg bg-indigo-500/10 text-indigo-500 border-indigo-500/20 font-black px-3 py-1">
                                                    {job.Job_Status}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>

                    <TabsContent value="lfd_alerts" className="m-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-muted/30">
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">{t('container.form.container_no')}</th>
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Shipping Line</th>
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Detention LFD</th>
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em]">Demurrage LFD</th>
                                        <th className="px-8 py-6 text-xs font-black text-muted-foreground uppercase tracking-[0.2em] text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {lfdJobs.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-8 py-20 text-center text-muted-foreground font-black italic">
                                                NO_LFD_ALERTS_FOUND
                                            </td>
                                        </tr>
                                    ) : lfdJobs.map((job) => {
                                        const detentionStatus = getLFDStatus(job.container?.lfd_detention)
                                        const demurrageStatus = getLFDStatus(job.container?.lfd_demurrage)
                                        return (
                                            <tr key={job.Job_ID} className="group hover:bg-muted/20 transition-colors">
                                                <td className="px-8 py-6">
                                                    <div>
                                                        <p className="text-lg font-black text-foreground tracking-tight">{job.container?.container_no || '-'}</p>
                                                        <p className="text-xs text-muted-foreground font-bold">Seal: {job.container?.seal_no || '-'}</p>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div>
                                                        <p className="text-base font-black italic">{job.container?.shipping_line || '-'}</p>
                                                        <p className="text-xs text-muted-foreground font-bold">{job.container?.container_size || '-'}</p>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-sm font-bold">{job.container?.lfd_detention ? format(parseISO(job.container.lfd_detention), 'dd/MM/yyyy') : '-'}</span>
                                                        {job.container?.lfd_detention && (
                                                            <Badge className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border-none", detentionStatus.color === 'text-red-500' ? 'bg-red-500 text-white animate-pulse' : detentionStatus.color === 'text-amber-500' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white')}>
                                                                {detentionStatus.label}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-sm font-bold">{job.container?.lfd_demurrage ? format(parseISO(job.container.lfd_demurrage), 'dd/MM/yyyy') : '-'}</span>
                                                        {job.container?.lfd_demurrage && (
                                                            <Badge className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border-none", demurrageStatus.color === 'text-red-500' ? 'bg-red-500 text-white animate-pulse' : demurrageStatus.color === 'text-amber-500' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white')}>
                                                                {demurrageStatus.label}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-center">
                                                    <Link href={`/jobs/history?id=${job.Job_ID}`}>
                                                        <Button variant="ghost" size="icon" className="w-12 h-12 rounded-xl hover:bg-primary/10 hover:text-primary transition-all">
                                                            <ChevronRight size={24} />
                                                        </Button>
                                                    </Link>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
