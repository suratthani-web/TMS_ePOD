"use client"

import { useState, useMemo, useRef, useEffect } from 'react'
import {
    Search,
    Activity,
    Truck,
    FileSpreadsheet,
    Star,
    Filter,
    Users,
    Check
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSearchParams } from 'next/navigation'
import { DashboardMap } from "@/components/dashboard/dashboard-map"
import { Job } from "@/lib/supabase/jobs"
import { Driver } from "@/lib/supabase/drivers"
import { predictJobDelay } from "@/services/ai-prediction"
import { SafetyScoreBadge } from "./safety-score-badge"
import { useLanguage } from "@/components/providers/language-provider"
import { useRealtime } from "@/hooks/useRealtime"
import { RealtimeIndicator } from "@/components/ui/realtime-indicator"
import { toast } from "sonner"
import { calculateSafetyScore } from "@/services/safety-scoring"
import { Button } from "@/components/ui/button"
import { ExcelExport } from "@/components/ui/excel-export"

export type DriverWithGPS = Driver & {
    Latitude: number | null
    Longitude: number | null
    Last_Update: string | null
    Speed?: number
    Heading?: number
}

interface Vehicle {
    vehicle_plate: string
    vehicle_type: string
    max_weight_kg: number | null
    max_volume_cbm: number | null
}

interface MonitoringCommandCenterProps {
    initialJobs: Job[]
    initialDrivers: DriverWithGPS[]
    initialContacts?: any[]
    allDrivers?: any[]
    initialHealthAlerts?: any[]
    heatmapJobs?: any[]
    dangerZones?: { id?: string; name: string; coordinates: [number, number][] }[]
}

export function MonitoringCommandCenter({
    initialJobs,
    initialDrivers,
    initialContacts = [],
    allDrivers = [],
    initialHealthAlerts = [],
    heatmapJobs = [],
    dangerZones = []
}: MonitoringCommandCenterProps) {
    const { t } = useLanguage()
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [filter, setFilter] = useState<'all' | 'jobs' | 'drivers' | 'alerts' | 'health'>('all')
    const [drivers, setDrivers] = useState(initialDrivers)
    const [jobs, setJobs] = useState(initialJobs)
    const healthAlerts = initialHealthAlerts
    const [focusPosition, setFocusPosition] = useState<[number, number] | undefined>(undefined)

    const [isChatOpen, setIsChatOpen] = useState(false)
    const [chatDriverId, setChatDriverId] = useState<string | null>(null)
    const isMounted = useRef(true)
    const searchParams = useSearchParams()

    // --- Personalization & Filtering ---
    const [pinnedCustomerNames, setPinnedCustomerNames] = useState<string[]>([])
    const [showPinnedOnly, setShowPinnedOnly] = useState(false)
    const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false)

    // Load preferences
    useEffect(() => {
        const saved = localStorage.getItem('tms_pinned_customers')
        if (saved) {
            try {
                setPinnedCustomerNames(JSON.parse(saved))
            } catch (e) {
                console.error('Failed to load pinned customers')
            }
        }
    }, [])

    // Save preferences
    useEffect(() => {
        localStorage.setItem('tms_pinned_customers', JSON.stringify(pinnedCustomerNames))
    }, [pinnedCustomerNames])

    // Get list of all customers from current jobs
    const allCustomerNames = useMemo(() => {
        const names = new Set<string>()
        jobs.forEach(j => { if (j.Customer_Name) names.add(j.Customer_Name) })
        return Array.from(names).sort()
    }, [jobs])

    const togglePinCustomer = (name: string) => {
        setPinnedCustomerNames(prev => 
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        )
    }

    // Driver-to-Customer mapping based on active jobs
    const driverToCustomerMap = useMemo(() => {
        const map: Record<string, string[]> = {}
        jobs.forEach(j => {
            if (j.Driver_ID && j.Customer_Name) {
                if (!map[j.Driver_ID]) map[j.Driver_ID] = []
                if (!map[j.Driver_ID].includes(j.Customer_Name)) {
                    map[j.Driver_ID].push(j.Customer_Name)
                }
            }
        })
        return map
    }, [jobs])

    // Real-time: gps_logs
    useRealtime('gps_logs', (payload) => {
        if (payload.eventType === 'INSERT') {
            const newLog = payload.new as any
            const driverId = newLog.driver_id || newLog.Driver_ID
            setDrivers(prev => prev.map(d => {
                if (d.Driver_ID === driverId) {
                    return {
                        ...d,
                        Latitude: (newLog.latitude || newLog.Latitude) as number | null,
                        Longitude: (newLog.longitude || newLog.Longitude) as number | null,
                        Speed: (newLog.speed || newLog.Speed || 0) as number,
                        Heading: (newLog.heading || newLog.Heading) as number | undefined,
                        Last_Update: (newLog.timestamp || newLog.Timestamp || new Date().toISOString()) as string | null
                    }
                }
                return d
            }))
        }
    })

    // Real-time: Jobs_Main
    useRealtime('Jobs_Main', (payload) => {
        const updatedJob = payload.new as Job
        setJobs(prev => {
            const index = prev.findIndex(j => j.Job_ID === updatedJob.Job_ID)
            if (index !== -1) {
                const newJobs = [...prev]
                newJobs[index] = { ...newJobs[index], ...updatedJob }
                return newJobs
            }
            if (updatedJob.Job_Status === 'SOS' || updatedJob.Job_Status === 'Failed') {
                return [updatedJob, ...prev]
            }
            return prev
        })
    })

    // Real-time: Notifications
    useRealtime('Notifications', (payload) => {
        if (payload.eventType === 'INSERT') {
            const notification = payload.new as any
            const isSOS = String(notification.Title || '').includes('SOS')
            
            if (isSOS) {
                toast.error(String(notification.Title || ''), {
                    description: String(notification.Message || ''),
                    duration: 20000, // 20 seconds for SOS
                    action: {
                        label: '📍 ดูตำแหน่ง',
                        onClick: () => {
                            if (notification.Driver_ID) {
                                setSelectedId(String(notification.Driver_ID))
                                const drv = drivers.find(d => d.Driver_ID === String(notification.Driver_ID))
                                if (drv?.Latitude && drv?.Longitude) {
                                    setFocusPosition([drv.Latitude, drv.Longitude])
                                }
                            }
                        }
                    }
                })
            } else {
                toast(String(notification.Title || t('monitoring.alerts')), {
                    description: String(notification.Message || '')
                })
            }
        }
    })

    const handleJobClick = (job: Job) => {
        setSelectedId(job.Job_ID)
        const jobAny = job as any
        if (jobAny.Pickup_Lat && jobAny.Pickup_Lon) {
            setFocusPosition([jobAny.Pickup_Lat, jobAny.Pickup_Lon])
        }
    }

    const handleDriverClick = (driver: DriverWithGPS) => {
        if (driver.Latitude && driver.Longitude) {
            setSelectedId(driver.Driver_ID)
            setFocusPosition([driver.Latitude, driver.Longitude])
        } else {
            toast.error(t('monitoring.no_location'))
        }
    }

    const getPrediction = (job: Job) => {
        const jobStatus = job.Job_Status || ''
        if (['Completed', 'Delivered', 'Cancelled'].includes(jobStatus)) return null
        const driver = drivers.find(d => d.Driver_ID === (job as any).Driver_ID)
        if (!driver || !driver.Latitude || !driver.Longitude) return null
        return predictJobDelay(job as any, driver.Latitude, driver.Longitude, driver.Speed || 0)
    }

    const driversWithGPS = useMemo(() => {
        return drivers
            .filter(d => {
                // Search filter
                const matchesSearch = !searchQuery || 
                    d.Driver_Name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    d.Vehicle_Plate?.toLowerCase().includes(searchQuery.toLowerCase())
                
                // Focus Mode filter
                if (showPinnedOnly && pinnedCustomerNames.length > 0) {
                    const customers = driverToCustomerMap[d.Driver_ID] || []
                    const isPinned = customers.some(c => pinnedCustomerNames.includes(c))
                    return matchesSearch && isPinned
                }

                return matchesSearch
            })
            .map(d => {
                const lastUpdateDate = d.Last_Update ? new Date(d.Last_Update) : null
                const isOnline = lastUpdateDate && (new Date().getTime() - lastUpdateDate.getTime() < 10 * 60 * 1000)
                return { ...d, status: isOnline ? 'Online' : 'Offline' }
            })
            .sort((a, b) => (a.status === 'Online' ? -1 : 1))
    }, [drivers, searchQuery, showPinnedOnly, pinnedCustomerNames, driverToCustomerMap])

    const filteredJobs = useMemo(() => {
        return jobs.filter(j => {
            const matchesSearch = !searchQuery || 
                j.Job_ID?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                j.Customer_Name?.toLowerCase().includes(searchQuery.toLowerCase())
            
            if (showPinnedOnly && pinnedCustomerNames.length > 0) {
                return matchesSearch && j.Customer_Name && pinnedCustomerNames.includes(j.Customer_Name)
            }
            return matchesSearch
        })
    }, [jobs, searchQuery, showPinnedOnly, pinnedCustomerNames])

    const alertCount = filteredJobs.filter(j => j.Job_Status === 'SOS' || j.Job_Status === 'Failed').length

    return (
        <div className="flex h-[calc(100vh-64px)] bg-background text-muted-foreground overflow-hidden font-sans rounded-xl border border-border shadow-sm relative z-10">
            {/* 1. Sidebar */}
            <div className="w-[360px] shrink-0 z-20 border-r border-border flex flex-col bg-card shadow-xl relative">
                <div className="p-6 border-b border-border">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
                            <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                <Activity className="text-primary" size={18} />
                            </div>
                            {t('monitoring.title')}
                        </h2>
                        <div className="flex items-center gap-2">
                            <ExcelExport 
                                data={driversWithGPS}
                                filename="logispro_live_tracking_export"
                                trigger={
                                    <button className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center border border-emerald-500/20">
                                        <FileSpreadsheet size={14} />
                                    </button>
                                }
                            />
                            <RealtimeIndicator isLive={true} className="bg-muted/30 border border-border text-primary scale-75 origin-right" />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                        <div className="relative group flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={14} />
                            <input 
                                type="text" 
                                placeholder={t('common.search')}
                                className="w-full h-10 bg-muted/30 border border-border rounded-lg pl-10 pr-3 text-xs focus:outline-none focus:border-primary/50 transition-all placeholder:text-muted-foreground outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="relative">
                            <button 
                                onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                                className={cn(
                                    "p-2.5 rounded-lg border transition-all flex items-center justify-center relative",
                                    pinnedCustomerNames.length > 0 
                                        ? "bg-primary/10 border-primary/20 text-primary shadow-sm" 
                                        : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                                )}
                            >
                                <Users size={18} />
                                {pinnedCustomerNames.length > 0 && (
                                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[8px] flex items-center justify-center rounded-full font-bold">
                                        {pinnedCustomerNames.length}
                                    </div>
                                )}
                            </button>

                            {/* Dropdown Menu */}
                            {isFilterMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setIsFilterMenuOpen(false)} />
                                    <div className="absolute right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-lg z-50 p-4 animate-in fade-in zoom-in duration-200">
                                        <p className="text-[10px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <Star size={12} className="text-yellow-500 fill-yellow-500" />
                                            Pinned Customers
                                        </p>
                                        <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
                                            {allCustomerNames.map(name => (
                                                <button 
                                                    key={name}
                                                    onClick={() => togglePinCustomer(name)}
                                                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 text-left transition-all"
                                                >
                                                    <span className={cn(
                                                        "text-[10px] font-bold uppercase",
                                                        pinnedCustomerNames.includes(name) ? "text-primary" : "text-foreground"
                                                    )}>{name}</span>
                                                    {pinnedCustomerNames.includes(name) && <Check size={12} className="text-primary" />}
                                                </button>
                                            ))}
                                            {allCustomerNames.length === 0 && (
                                                <p className="text-[10px] text-muted-foreground italic py-4 text-center">No customers found</p>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label={t('common.all')} />
                        <FilterButton active={filter === 'jobs'} onClick={() => setFilter('jobs')} label={t('navigation.jobs')} count={filteredJobs.length} color="blue" />
                        <FilterButton active={filter === 'drivers'} onClick={() => setFilter('drivers')} label={t('monitoring.active_fleet')} count={driversWithGPS.length} color="emerald" />
                        <FilterButton active={filter === 'alerts'} onClick={() => setFilter('alerts')} label={t('monitoring.alerts')} count={alertCount} color="rose" />
                        
                        <button 
                            onClick={() => setShowPinnedOnly(!showPinnedOnly)}
                            className={cn(
                                "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border flex items-center gap-1.5 ml-2",
                                showPinnedOnly
                                    ? "bg-amber-500 text-black border-amber-500 shadow-sm"
                                    : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Star size={12} className={showPinnedOnly ? "fill-black" : ""} />
                            {pinnedCustomerNames.length > 0 ? `My Focus (${pinnedCustomerNames.length})` : "Focus Mode"}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {(filter === 'all' || filter === 'jobs') && (
                        filteredJobs.map(job => (
                            <div key={job.Job_ID}
                                 onClick={() => handleJobClick(job)}
                                 className={cn(
                                    "bg-muted/50 border border-border/10 p-3 rounded-2xl hover:bg-muted/80 transition-all cursor-pointer group",
                                    selectedId === job.Job_ID && "ring-1 ring-primary bg-primary/5"
                                 )}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary/10 rounded-xl text-primary">
                                            <Truck size={16} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-foreground uppercase">
                                                {job.Vehicle_Plate ? `${job.Vehicle_Plate} - ` : ''}{job.Driver_Name || (job.Driver_ID ? (allDrivers.find(d => d.Driver_ID === job.Driver_ID)?.Driver_Name || '...') : '') || job.Job_ID}
                                            </p>
                                            <p className={cn(
                                                "text-[10px] font-bold uppercase tracking-widest",
                                                job.Driver_Name ? "text-muted-foreground" : "text-amber-500"
                                            )}>
                                                {job.Customer_Name || t('common.status_pending')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-foreground/80 uppercase">{job.Job_Status}</p>
                                        <p className="text-[8px] font-bold text-muted-foreground uppercase opacity-60">{job.Dest_Location}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}

                    {(filter === 'all' || filter === 'drivers') && (
                        driversWithGPS
                            .map(driver => (
                                <div key={driver.Driver_ID} 
                                     onClick={() => handleDriverClick(driver)}
                                     className={cn(
                                        "bg-muted/50 border border-border/10 p-3 rounded-2xl hover:bg-muted/80 transition-all cursor-pointer group",
                                        selectedId === driver.Driver_ID && "ring-1 ring-primary bg-primary/5"
                                     )}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                                                    <Truck size={16} className="text-primary" />
                                                </div>
                                                <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#050110]", driver.status === 'Online' ? "bg-emerald-500" : "bg-slate-500")} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-foreground uppercase">{driver.Driver_Name}</p>
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight italic">{driver.Vehicle_Plate || '-'}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5 scale-90 origin-right">
                                            <SafetyScoreBadge metrics={calculateSafetyScore(driver)} />
                                            {driver.Latitude && driver.Longitude && (
                                                <button 
                                                    className="px-2 py-1 text-[8px] font-black uppercase tracking-widest border border-primary/20 text-primary hover:bg-primary hover:text-white rounded-md transition-all whitespace-nowrap"
                                                    onClick={(e: React.MouseEvent) => {
                                                        e.stopPropagation()
                                                        window.open(`https://www.google.com/maps/search/?api=1&query=${driver.Latitude},${driver.Longitude}`, '_blank')
                                                    }}
                                                >
                                                    MAPS
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                    )}

                    {filter === 'alerts' && (
                        filteredJobs.filter(j => j.Job_Status === 'SOS' || j.Job_Status === 'Failed').map(job => (
                            <div key={job.Job_ID}
                                 onClick={() => handleJobClick(job)}
                                 className={cn(
                                    "bg-rose-500/5 border border-rose-500/10 p-3 rounded-2xl hover:bg-rose-500/10 transition-all cursor-pointer group",
                                    selectedId === job.Job_ID && "ring-1 ring-rose-500"
                                 )}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-rose-500/20 rounded-xl text-rose-500">
                                            <Activity size={16} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-foreground">{job.Job_ID}</p>
                                            <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">{job.Job_Status}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-foreground truncate max-w-[100px]">{job.Dest_Location}</p>
                                        <p className="text-[8px] font-black text-muted-foreground uppercase opacity-60">{job.Driver_Name || 'No Driver'}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* 2. Integrated Map */}
            <div className="flex-1 relative">
                <DashboardMap
                    drivers={driversWithGPS as any}
                    allJobs={heatmapJobs}
                    activeJobs={filteredJobs}
                    focusPosition={focusPosition}
                    dangerZones={dangerZones}
                />
            </div>
        </div>
    )
}

function FilterButton({ active, onClick, label, count, color = "primary" }: any) {
    return (
        <button 
            onClick={onClick}
            className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border flex items-center gap-1.5",
                active 
                    ? `bg-primary text-white border-primary shadow-lg shadow-primary/20` 
                    : "bg-muted/50 border-border/10 text-muted-foreground hover:text-foreground"
            )}
        >
            {label}
            {count > 0 && <span className="px-1 py-0.5 bg-white text-rose-500 rounded-md text-[9px] font-black">{count}</span>}
        </button>
    )
}

