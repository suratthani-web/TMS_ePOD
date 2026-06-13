"use client"

import { useMemo, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { TrendingUp, Activity, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useLanguage } from '@/components/providers/language-provider'
import { MapOverlay } from './map-overlay'
import { getVehicleRouteHistory } from '@/lib/supabase/gps'
import { getAllVehiclePlates } from '@/lib/supabase/jobs'
import { toast } from 'sonner'
import { Calendar, History, Search, X } from 'lucide-react'

const LeafletMap = dynamic(() => import('@/components/maps/leaflet-map'), {
  ssr: false,
  loading: () => <LoadingMap />
})

function LoadingMap() {
  const { t } = useLanguage()
  return (
    <div className="absolute inset-0 bg-muted flex items-center justify-center">
      <div className="text-emerald-500 animate-pulse font-medium">{t('dashboard.map.loading')}</div>
    </div>
  )
}

type RoutePoint = {
    lat?: number | string | null
    lng?: number | string | null
    name?: string | null
}

type DashboardMapJob = {
    Job_ID: string
    Job_Status?: string | null
    Pickup_Lat?: number | string | null
    Pickup_Lon?: number | string | null
    Delivery_Lat?: number | string | null
    Delivery_Lon?: number | string | null
    Origin_Location?: string | null
    Dest_Location?: string | null
    original_origins_json?: string | RoutePoint[] | null
    original_destinations_json?: string | RoutePoint[] | null
    Price_Cust_Total?: number | string | null
    Cost_Driver_Total?: number | string | null
}

type MissionMarker = {
    id: string
    jobId: string
    name: string
    lat: number
    lng: number
    type: 'origin' | 'destination'
    status: string
    originName: string
    destName: string
}

type RouteHistoryPoint = {
    lat: number
    lng: number
}

interface DashboardMapProps {
    drivers: {
        Driver_ID: string
        Driver_Name: string
        Vehicle_Plate: string
        Last_Update: string | null
        Latitude: number | null
        Longitude: number | null
    }[]
    allJobs?: DashboardMapJob[]
    activeJobs?: DashboardMapJob[]
    focusPosition?: [number, number]
    plannedRoute?: { lat: number; lng: number; name: string; type: 'start' | 'stop' | 'end' }[]
    routeSummary?: {
        start: string
        end: string
        target: string
        eta?: string
        distance?: string
    } | null
    sosDriverIds?: (string | null)[]
    dangerZones?: { id?: string; name: string; coordinates: [number, number][] }[]
}

export function DashboardMap({ drivers, allJobs = [], activeJobs = [], focusPosition, plannedRoute, routeSummary, sosDriverIds = [], dangerZones = [] }: DashboardMapProps) {
    const { t } = useLanguage()
    const [currentTime, setCurrentTime] = useState<number>(0)
    
    useEffect(() => {
        setCurrentTime(Date.now())
    }, [])
    const [showHeatmap, setShowHeatmap] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const [routeHistory, setRouteHistory] = useState<[number, number][]>([])
    const [isLoadingRoute, setIsLoadingRoute] = useState(false)
    
    // History selection state
    const [vehicles, setVehicles] = useState<string[]>([])
    const [selectedVehicle, setSelectedVehicle] = useState('')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')

    useEffect(() => {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
        setStartDate(today)
        setEndDate(today)
    }, [])

    // Map fleetStatus to LeafletMap's DriverLocation format
    const activeDrivers = useMemo(() => {
        const tenMinutes = 600000 // Consistent with MonitoringCommandCenter
        
        return drivers
            .filter(d => d.Latitude !== null && d.Longitude !== null)
            .map(d => ({
                id: d.Driver_ID,
                name: d.Driver_Name,
                lat: d.Latitude!,
                lng: d.Longitude!,
                status: sosDriverIds.includes(d.Driver_ID) ? 'SOS' : (d.Last_Update ? (new Date(d.Last_Update).getTime() > currentTime - tenMinutes ? 'Online' : 'Offline') : 'Offline'),
                vehicle: d.Vehicle_Plate,
                vehiclePlate: d.Vehicle_Plate,
                speed: (d as { Speed?: number }).Speed || 0,
                heading: (d as { Heading?: number }).Heading
            }))
    }, [drivers, currentTime, sosDriverIds])

    // Generate Mission Locations (Origins & Destinations) for each job
    const jobMissions = useMemo(() => {
        const missions: MissionMarker[] = []
        // Only render interactive mission markers for active (live) jobs
        const jobsToUse = activeJobs
        
        jobsToUse.forEach(j => {
            const oLat = Number(j.Pickup_Lat) || 0
            const oLng = Number(j.Pickup_Lon) || 0
            const dLat = Number(j.Delivery_Lat) || 0
            const dLng = Number(j.Delivery_Lon) || 0

            // 1. Resolve Origin (root columns, then JSON fallback)
            let finalOLat = oLat
            let finalOLng = oLng
            let oName = j.Origin_Location

            if (!finalOLat || !finalOLng) {
                try {
                    const json = typeof j.original_origins_json === 'string' ? JSON.parse(j.original_origins_json) : j.original_origins_json
                    if (Array.isArray(json) && json.length > 0) {
                        finalOLat = Number(json[0].lat); finalOLng = Number(json[0].lng)
                        if (!oName) oName = json[0].name
                    }
                } catch { /* ignore parse errors */ }
            }

            // 2. Resolve Destinations — every drop in order (multi-drop aware)
            const destinations: { lat: number; lng: number; name: string }[] = []
            try {
                const json = typeof j.original_destinations_json === 'string' ? JSON.parse(j.original_destinations_json) : j.original_destinations_json
                if (Array.isArray(json)) {
                    json.forEach((pt: RoutePoint) => {
                        const lat = Number(pt?.lat); const lng = Number(pt?.lng)
                        if (lat && lng) destinations.push({ lat, lng, name: (pt?.name as string) || 'จุดส่งสินค้า' })
                    })
                }
            } catch { /* ignore parse errors */ }

            // Fallback to the single root delivery column if JSON had no usable point
            if (destinations.length === 0 && dLat && dLng) {
                destinations.push({ lat: dLat, lng: dLng, name: j.Dest_Location || 'จุดส่งสินค้า' })
            }

            const status = j.Job_Status || 'Unknown'
            const lastDestName = destinations.length > 0
                ? destinations[destinations.length - 1].name
                : (j.Dest_Location || 'Delivery')

            // Push Origin (route order: origin first so the connecting line starts here)
            if (finalOLat && finalOLng) {
                missions.push({
                    id: `${j.Job_ID}-origin`,
                    jobId: j.Job_ID,
                    name: oName || 'Pickup',
                    lat: finalOLat,
                    lng: finalOLng,
                    type: 'origin',
                    status,
                    originName: oName || 'Pickup',
                    destName: lastDestName
                })
            }

            // Push every destination (drop) in sequence
            destinations.forEach((dest, idx) => {
                missions.push({
                    id: `${j.Job_ID}-destination-${idx}`,
                    jobId: j.Job_ID,
                    name: destinations.length > 1 ? `${dest.name} (จุดที่ ${idx + 1})` : dest.name,
                    lat: dest.lat,
                    lng: dest.lng,
                    type: 'destination',
                    status,
                    originName: oName || 'Pickup',
                    destName: lastDestName
                })
            })
        })
        return missions
    }, [activeJobs])

    // Generate Profit Points for Heatmap
    const profitPoints = useMemo(() => {
        return allJobs
            .map(j => {
                let lat = Number(j.Delivery_Lat)
                let lng = Number(j.Delivery_Lon)
                
                // Fallback to JSON if root columns are empty
                if (!lat || !lng) {
                    try {
                        const json = typeof j.original_destinations_json === 'string' 
                            ? JSON.parse(j.original_destinations_json) 
                            : j.original_destinations_json
                        
                        if (Array.isArray(json) && json.length > 0) {
                            const lastPoint = json[json.length - 1]
                            lat = Number(lastPoint.lat)
                            lng = Number(lastPoint.lng)
                        }
                    } catch (e) {
                        // ignore parse errors
                    }
                }

                if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null

                return {
                    lat,
                    lng,
                    profit: (Number(j.Price_Cust_Total) || 0) - (Number(j.Cost_Driver_Total) || 0)
                }
            })
            .filter((p): p is { lat: number, lng: number, profit: number } => p !== null)
    }, [allJobs])

    const fetchHistory = async (plate: string, s: string, e: string) => {
        setIsLoadingRoute(true)
        try {
            const data = await getVehicleRouteHistory(plate, s, e)
            if (data.length === 0) {
                toast.info("No route data found for this period")
                setRouteHistory([])
            } else {
                setRouteHistory((data as RouteHistoryPoint[]).map((d) => [d.lat, d.lng] as [number, number]))
                toast.success(`Loaded ${data.length} GPS points`)
            }
        } catch {
            toast.error("Failed to fetch route history")
        } finally {
            setIsLoadingRoute(false)
        }
    }

    const handleShowTodayRoute = (plate: string) => {
        setSelectedVehicle(plate)
        const today = new Date().toISOString().split('T')[0]
        setStartDate(today)
        setEndDate(today)
        setShowHistory(true)
        fetchHistory(plate, today, today)
    }

    // Load vehicles on panel open
    useEffect(() => {
        const loadVehicles = async () => {
            if (showHistory && vehicles.length === 0) {
                const data = await getAllVehiclePlates()
                setVehicles(data as string[])
            }
        }
        loadVehicles()
    }, [showHistory, vehicles.length])

    return (
        <div className="absolute inset-0 z-0">
             <LeafletMap 
                drivers={activeDrivers}
                height="100%"
                zoom={10}
                center={focusPosition || (activeDrivers.length > 0 ? [activeDrivers[0].lat, activeDrivers[0].lng] : [13.7563, 100.5018])}
                focusPosition={focusPosition}
                plannedRoute={plannedRoute}
                jobMissions={jobMissions}
                profitPoints={profitPoints}
                showHeatmap={showHeatmap}
                routeHistory={routeHistory}
                onShowRoute={handleShowTodayRoute}
                dangerZones={dangerZones}
            />

            {/* Map Mode Toggle */}
            <div className="absolute top-6 right-6 z-10 flex flex-col gap-3">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setShowHeatmap(!showHeatmap)
                        if (!showHeatmap) setShowHistory(false)
                    }}
                    className={cn(
                        "h-12 px-6 rounded-2xl border-2 font-black uppercase tracking-tighter transition-all shadow-2xl backdrop-blur-xl",
                        showHeatmap 
                            ? "bg-emerald-500 border-emerald-400 text-white hover:bg-emerald-600 scale-105" 
                            : "bg-background/80 border-border/10 text-muted-foreground hover:bg-muted"
                    )}
                >
                    <TrendingUp className={cn("mr-2 h-5 w-5", showHeatmap && "animate-pulse")} />
                    {showHeatmap ? t('dashboard.map.live_fleet') : t('dashboard.map.profit_heatmap')}
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setShowHistory(!showHistory)
                        if (!showHistory) setShowHeatmap(false)
                    }}
                    className={cn(
                        "h-12 px-6 rounded-2xl border-2 font-black uppercase tracking-tighter transition-all shadow-2xl backdrop-blur-xl",
                        showHistory 
                            ? "bg-blue-500 border-blue-400 text-white hover:bg-blue-600 scale-105" 
                            : "bg-background/80 border-border/10 text-muted-foreground hover:bg-muted"
                    )}
                >
                    <History className={cn("mr-2 h-5 w-5", isLoadingRoute && "animate-spin")} />
                    {showHistory ? "CLOSE HISTORY" : "ROUTE HISTORY"}
                </Button>
            </div>

            {/* History Selector Panel */}
            {showHistory && (
                <div className="absolute top-6 left-6 z-20 w-80 bg-background/95 backdrop-blur-2xl p-6 rounded-[2.5rem] border-2 border-primary/20 shadow-[0_0_50px_rgba(0,0,0,0.3)] ring-1 ring-white/10">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-black text-foreground tracking-tighter flex items-center gap-2">
                            <History className="text-primary" size={20} />
                            TRACKER
                        </h3>
                        <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-muted rounded-full">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">Vehicle Plate</label>
                            <select 
                                value={selectedVehicle}
                                onChange={(e) => setSelectedVehicle(e.target.value)}
                                className="w-full bg-muted/50 border border-border/10 rounded-xl px-4 h-11 text-sm font-bold focus:outline-none focus:ring-2 ring-primary/20 appearance-none"
                            >
                                <option value="">Select Vehicle</option>
                                {vehicles.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">Start</label>
                                <input 
                                    type="date" 
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full bg-muted/50 border border-border/10 rounded-xl px-3 h-11 text-xs font-bold focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5 block">End</label>
                                <input 
                                    type="date" 
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full bg-muted/50 border border-border/10 rounded-xl px-3 h-11 text-xs font-bold focus:outline-none"
                                />
                            </div>
                        </div>

                        <Button 
                            className="w-full h-12 rounded-xl font-black uppercase tracking-widest mt-2 shadow-lg shadow-primary/20"
                            disabled={!selectedVehicle || isLoadingRoute}
                            onClick={() => fetchHistory(selectedVehicle, startDate, endDate)}
                        >
                            {isLoadingRoute ? "FETCHING DATA..." : "VIEW HISTORY"}
                        </Button>

                        {routeHistory.length > 0 && (
                            <div className="pt-4 border-t border-border/10">
                                <div className="flex items-center justify-between text-xs font-bold text-muted-foreground mb-3">
                                    <span>Captured Points:</span>
                                    <span className="text-primary">{routeHistory.length}</span>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="w-full h-9 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/10 hover:text-rose-500"
                                    onClick={() => setRouteHistory([])}
                                >
                                    Clear Path
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Map Overlay Badge */}
            <MapOverlay route={routeSummary} />
        </div>
    )
}
