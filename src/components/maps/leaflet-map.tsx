"use client"

import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, CircleMarker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useState, useRef, Fragment, useMemo } from 'react'
import { Truck, MapPin } from 'lucide-react'
import { ProfitabilityHeatmap, ProfitPoint } from './profitability-heatmap'
import { cn } from '@/lib/utils'

// Fix for default marker icons in Next.js - Move inside component or initialize lazily
let defaultIcon: any;
let redIcon: any;
let goldIcon: any;
let greenIcon: any;

const missionIconsCache: Record<string, L.DivIcon> = {};
const getMissionIcon = (type: 'origin' | 'destination', status?: string) => {
    const cacheKey = `${type}-${status === 'SOS' ? 'SOS' : 'normal'}`;
    if (!missionIconsCache[cacheKey]) {
        const color = type === 'origin' ? '#a855f7' : '#f43f5e';
        missionIconsCache[cacheKey] = L.divIcon({
            className: 'custom-mission-icon',
            html: `
                <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;">
                    <div style="position: absolute; inset: 0; background: rgba(255, 255, 255, 0.4); backdrop-filter: blur(2px); border-radius: 9999px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); border: 2px solid ${color};"></div>
                    <div style="position: relative; z-index: 10; width: 10px; height: 10px; border-radius: 9999px; background-color: ${color}; opacity: 0.8; ${status === 'SOS' ? 'animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;' : ''}"></div>
                    <div style="position: absolute; inset: 0; border-radius: 9999px; background-color: ${color}; opacity: 0.1; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;"></div>
                </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -10]
        });
    }
    return missionIconsCache[cacheKey];
}

const initIcons = () => {
    if (typeof window === 'undefined' || defaultIcon) return;
    
    defaultIcon = L.icon({
      iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    })

    redIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    })

    goldIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    })

    greenIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    })

    L.Marker.prototype.options.icon = defaultIcon
}

export type DriverLocation = {
  id: string
  name: string
  lat: number
  lng: number
  status?: string
  lastUpdate?: string
  speed?: number
  heading?: number
  vehiclePlate?: string
}

type LeafletMapProps = {
  center?: [number, number]
  zoom?: number
  drivers?: DriverLocation[]
  currentPosition?: [number, number]
  height?: string
  showCurrentPosition?: boolean
  routeHistory?: [number, number][]
  focusPosition?: [number, number]
  plannedRoute?: { lat: number; lng: number; name: string; type: 'start' | 'stop' | 'end' }[]
  jobMissions?: { id: string; jobId: string; name: string; lat: number; lng: number; type: 'origin' | 'destination'; status: string }[]
  profitPoints?: ProfitPoint[]
  showHeatmap?: boolean
  onShowRoute?: (plate: string) => void
  onMapClick?: (lat: number, lng: number) => void
}

function RecenterMap({ position, zoom }: { position: [number, number], zoom?: number }) {
  const map = useMap()
  useEffect(() => {
    if (position) {
      map.setView(position, zoom || map.getZoom(), { animate: true })
    }
  }, [position, zoom, map])
  return null
}

function FitBounds({ positions }: { positions: [number, number][] }) {
    const map = useMap()
    useEffect(() => {
        if (positions && positions.length > 0) {
            const bounds = L.latLngBounds(positions)
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true })
        }
    }, [positions, map])
    return null
}

export default function LeafletMap({ 
  center = [13.7563, 100.5018], 
  zoom = 13, 
  drivers = [], 
  currentPosition,
  height = "400px",
  showCurrentPosition = false,
  routeHistory = [],
  focusPosition,
  plannedRoute = [],
  jobMissions = [],
  profitPoints = [],
  showHeatmap = false,
  onShowRoute,
  onMapClick
}: LeafletMapProps) {
  const [isHydrated, setIsHydrated] = useState(false)
  const [showGeofences, setShowGeofences] = useState(true)
  const mapCenter = currentPosition || (routeHistory.length > 0 ? routeHistory[0] : (plannedRoute.length > 0 ? [plannedRoute[0].lat, plannedRoute[0].lng] : center)) as [number, number]

  useEffect(() => {
    initIcons()
    setIsHydrated(true)
  }, [])

  if (!isHydrated || typeof window === 'undefined') return <div style={{ height, width: '100%' }} className="bg-muted animate-pulse rounded-lg" />

  return (
    <div className="relative w-full h-full group/map overflow-hidden rounded-xl border border-border/50 shadow-2xl">
      {/* Dynamic Controls Overlay - Moved to top-left next to zoom controls */}
      <div className="absolute top-[12px] left-[44px] z-[1000] flex flex-col gap-2 transition-all duration-500">
          <button 
              onClick={() => setShowGeofences(!showGeofences)}
              className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 shadow-xl border backdrop-blur-md",
                  showGeofences 
                    ? "bg-primary text-white border-primary/20 scale-105" 
                    : "bg-background/80 text-muted-foreground border-border hover:bg-background"
              )}
          >
              <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  showGeofences ? "bg-white animate-pulse" : "bg-muted-foreground/30"
              )} />
              {showGeofences ? 'Hide Geofences' : 'Show Geofences'}
          </button>
      </div>

      <MapContainer 
        center={mapCenter} 
        zoom={zoom} 
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
      <MapClickHandler onClick={onMapClick} />
      {focusPosition && <RecenterMap position={focusPosition} zoom={15} />}
      
      {routeHistory.length > 0 && <FitBounds positions={routeHistory} />}

      <TileLayer
        attribution='&copy; Google Maps'
        url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
      />

      {showHeatmap && profitPoints.length > 0 && (
        <ProfitabilityHeatmap data={profitPoints} />
      )}

      {drivers.filter(d => isFinite(d.lat) && isFinite(d.lng)).map((driver) => (
        <MovingMarker key={driver.id} driver={driver} onShowRoute={onShowRoute} />
      ))}

      {/* Active Job Missions (Origins & Destinations) */}
      {jobMissions.length > 0 && (
          <>
            {/* 1. Connecting Lines between Origin and Destination for each job */}
            {Array.from(new Set(jobMissions.map(m => m.jobId))).map(jobId => {
                const points = jobMissions.filter(m => m.jobId === jobId)
                const origin = points.find(p => p.type === 'origin')
                const destination = points.find(p => p.type === 'destination')
                
                if (origin && destination) {
                    return (
                        <Polyline 
                            key={`job-link-${jobId}`}
                            positions={[[origin.lat, origin.lng], [destination.lat, destination.lng]]}
                            color={origin.status === 'Picked Up' || origin.status === 'In Transit' ? '#a855f7' : '#64748b'}
                            dashArray="10, 10"
                            weight={2}
                            opacity={0.4}
                        />
                    )
                }
                return null
            })}

            {/* 2. Mission Markers & Geofences */}
            {jobMissions.map((mission) => (
                <Fragment key={mission.id}>
                    <Marker 
                        position={[mission.lat, mission.lng]} 
                        icon={getMissionIcon(mission.type, mission.status)}
                    >
                        <Popup>
                            <div className="p-1 min-w-[150px]">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1 opacity-60">
                                    {mission.type === 'origin' ? '📦 จุดรับสินค้า' : '🚩 จุดส่งสินค้า'}
                                </p>
                                <p className="font-black text-base leading-tight mb-3 text-foreground">{mission.name}</p>

                                <div className="space-y-2 p-2.5 bg-muted/20 rounded-xl border border-border/5 mb-3">
                                    <div className="flex items-start gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1" />
                                        <div className="flex-1">
                                            <p className="text-[8px] font-black uppercase text-muted-foreground tracking-tighter leading-none mb-0.5">ต้นทาง (Origin)</p>
                                            <p className="text-[10px] font-bold leading-tight text-foreground/80">{(mission as any).originName || 'ไม่ระบุ'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1" />
                                        <div className="flex-1">
                                            <p className="text-[8px] font-black uppercase text-muted-foreground tracking-tighter leading-none mb-0.5">ปลายทาง (Destination)</p>
                                            <p className="text-[10px] font-bold leading-tight text-foreground/80">{(mission as any).destName || 'ไม่ระบุ'}</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="space-y-1 mb-3">
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground bg-muted/30 px-2 py-1 rounded-lg border border-border/10">
                                        <MapPin size={10} className="text-primary" />
                                        <span>พิกัด: {mission.lat.toFixed(6)}, {mission.lng.toFixed(6)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">
                                        <div className="w-1.5 h-1.5 rounded-full bg-border" />
                                        <span>พื้นที่จำลอง: {mission.type === 'origin' ? '20ม.' : '35ม.'} (รัศมี)</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-2 border-t border-border/10 pt-2">
                                    <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-tighter">ID: {(mission.jobId || '').slice(-6)}</span>
                                    <span className={cn(
                                        "text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest",
                                        mission.status === 'SOS' ? 'bg-rose-500 text-white animate-pulse' : 'bg-muted text-muted-foreground'
                                    )}>{mission.status}</span>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                    
                    {/* Visual Area Boundary (Geofence) */}
                    {showGeofences && (
                        <CircleMarker 
                            center={[mission.lat, mission.lng]}
                            radius={mission.type === 'origin' ? 20 : 35}
                            pathOptions={{ 
                                color: mission.type === 'origin' ? '#a855f7' : '#f43f5e', 
                                fillColor: mission.type === 'origin' ? '#a855f7' : '#f43f5e', 
                                fillOpacity: 0.05,
                                weight: 1,
                                dashArray: '5, 5'
                            }}
                        />
                    )}
                </Fragment>
            ))}
          </>
      )}

      {showCurrentPosition && currentPosition && (
        <Marker position={currentPosition}>
          <Popup>
              <div className="text-xl">
                <p className="font-bold">Your Location</p>
                <p className="text-gray-600">{currentPosition[0].toFixed(6)}, {currentPosition[1].toFixed(6)}</p>
              </div>
          </Popup>
        </Marker>
      )}

      {routeHistory.length > 1 && (
        <>
            <Polyline 
                positions={routeHistory} 
                color="#2563eb" 
                weight={5} 
                opacity={0.8}
            />
            {routeHistory.map((pos, idx) => (
                <CircleMarker 
                    key={`breadcrumb-${idx}`} 
                    center={pos} 
                    radius={3} 
                    pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 1 }} 
                />
            ))}
            <Marker position={routeHistory[0]} icon={getMissionIcon('origin')}>
                <Popup><p className="font-bold">📍 จุดเริ่มต้น</p></Popup>
            </Marker>
            <Marker position={routeHistory[routeHistory.length - 1]} icon={getMissionIcon('destination')}>
                <Popup><p className="font-bold">🚩 ตำแหน่งล่าสุด</p></Popup>
            </Marker>
        </>
      )}

      {plannedRoute.length > 0 && (
        <>
            <Polyline 
                positions={plannedRoute.map(p => [p.lat, p.lng] as [number, number])} 
                color="#10b981" 
                weight={6} 
                opacity={0.4}
            />
            {plannedRoute.map((p, idx) => (
                <Marker 
                    key={idx} 
                    position={[p.lat, p.lng]} 
                    icon={getMissionIcon(p.type === 'start' ? 'origin' : 'destination')}
                >
                    <Popup>
                        <div className="text-xl">
                            <p className="font-bold uppercase tracking-tighter text-lg font-bold text-gray-400">{p.type} point</p>
                            <p className="font-black">{p.name}</p>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </>
      )}
    </MapContainer>
    </div>
  )
}

function MapClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
    useMapEvents({
        click: (e) => {
            if (onClick) onClick(e.latlng.lat, e.latlng.lng)
        }
    })
    return null
}

function MovingMarker({ driver, onShowRoute }: { driver: DriverLocation, onShowRoute?: (plate: string) => void }) {
  const [currentPos, setCurrentPos] = useState<[number, number]>([driver.lat, driver.lng])
  const lastPosRef = useRef<[number, number]>([driver.lat, driver.lng])
  const [heading, setHeading] = useState<number>(driver.heading || 0)

  useEffect(() => {
    let animationFrame: number
    const startPos = lastPosRef.current
    const targetPos: [number, number] = [driver.lat, driver.lng]
    const duration = 2000 // Smooth 2 second interpolation
    const startTime = performance.now()

    if (startPos[0] !== targetPos[0] || startPos[1] !== targetPos[1]) {
        const y = Math.sin((targetPos[1] - startPos[1]) * (Math.PI / 180)) * Math.cos(targetPos[0] * (Math.PI / 180))
        const x = Math.cos(startPos[0] * (Math.PI / 180)) * Math.sin(targetPos[0] * (Math.PI / 180)) -
                  Math.sin(startPos[0] * (Math.PI / 180)) * Math.cos(targetPos[0] * (Math.PI / 180)) * Math.cos((targetPos[1] - startPos[1]) * (Math.PI / 180))
        let bearing = Math.atan2(y, x) * (180 / Math.PI)
        bearing = (bearing + 360) % 360
        setHeading(bearing)
    }

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2
      const lat = startPos[0] + (targetPos[0] - startPos[0]) * ease
      const lng = startPos[1] + (targetPos[1] - startPos[1]) * ease
      setCurrentPos([lat, lng])

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      } else {
        lastPosRef.current = targetPos
      }
    }

    animationFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationFrame)
  }, [driver.lat, driver.lng])

  const isSpeeding = (driver.speed || 0) * 3.6 > 90;

  const driverIcon = useMemo(() => {
    return L.divIcon({
        className: 'custom-div-icon',
        html: `
            <div class="relative flex items-center justify-center" style="width: 60px; height: 60px;">
                <!-- Speeding / SOS Alert Background -->
                ${isSpeeding || driver.status === 'SOS' ? `
                    <div class="absolute inset-0 bg-red-500/20 rounded-full animate-ping"></div>
                    <div class="absolute inset-0 border-4 border-red-500/50 rounded-full animate-pulse"></div>
                ` : ''}

                <!-- Floating License Plate -->
                <div class="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-card/90 text-foreground text-base font-bold font-black px-2 py-0.5 rounded-lg border border-border/20 shadow-2xl z-30 pointer-events-none">
                    ${driver.vehiclePlate || 'N/A'} ${isSpeeding ? `<span class="text-red-500 ml-1">⚡ ${((driver.speed || 0) * 3.6).toFixed(0)}</span>` : ''}
                </div>

                <!-- Direction indicator -->
                <div class="absolute" style="transform: rotate(${heading}deg) translateY(-28px);">
                    <div class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] ${isSpeeding ? 'border-b-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'border-b-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]'}"></div>
                </div>

                <!-- Marker Body -->
                <div class="relative flex items-center justify-center p-2.5 bg-background rounded-2xl shadow-2xl border border-border/20"
                     style="transform: rotate(${heading}deg); border-bottom: 4px solid ${isSpeeding || driver.status === 'SOS' ? '#ef4444' : '#10b981'};">
                    
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="${isSpeeding || driver.status === 'SOS' ? 'text-red-500' : 'text-emerald-400'}">
                        <path d="M1 14H17M1 14L2 7H14L17 14M1 14V18H3M17 14V18H15M17 14H23V18H21M17 11H21L23 14M7 18C7 19.1046 6.10457 20 5 20C3.89543 20 3 19.1046 3 18C3 16.8954 3.89543 16 5 18ZM7 18C7 16.8954 7.89543 16 9 16C10.1046 16 11 16.8954 11 18M11 18C11 19.1046 10.1046 20 9 20C7.89543 20 7 19.1046 7 18ZM19 18C19 19.1046 18.1046 20 17 20C15.8954 20 15 19.1046 15 18C15 16.8954 15.8954 16 17 16C18.1046 16 19 16.8954 19 18ZM21 18C21 19.1046 20.1046 20 19 20C17.8954 20 17 19.1046 17 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>

                <!-- Online Status Pulse -->
                <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-950 ${driver.status === 'Online' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,1)]' : 'bg-slate-500'} z-20">
                    ${driver.status === 'Online' ? '<div class="w-full h-full bg-emerald-400 rounded-full animate-ping opacity-75"></div>' : ''}
                </div>
            </div>
        `,
        iconSize: [60, 60],
        iconAnchor: [30, 30],
        popupAnchor: [0, -20]
    });
  }, [driver.vehiclePlate, driver.status, isSpeeding, heading]);

  return (
    <Marker 
        position={currentPos} 
        icon={driverIcon}>
      <Popup>
         <DriverPopup 
            driver={{ ...driver, lat: currentPos[0], lng: currentPos[1], heading }} 
            onShowRoute={onShowRoute}
         />
      </Popup>
    </Marker>
  )
}

function DriverPopup({ driver, onShowRoute }: { driver: DriverLocation, onShowRoute?: (plate: string) => void }) {
  const [address, setAddress] = useState<string>('Loading address...')

  useEffect(() => {
    let isMounted = true
    const fetchAddress = async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${driver.lat}&lon=${driver.lng}&zoom=14&addressdetails=1`, {
          headers: { 'User-Agent': 'TMS-ePOD/1.0' },
          signal: AbortSignal.timeout(5000) // 5 second timeout
        })
        
        if (!res.ok) throw new Error('API Response Error')
        const data = await res.json()
        
        if (isMounted) {
            const addr = data.address
            if (addr) {
                const district = addr.city_district || addr.district || addr.suburb || ''
                const province = addr.province || addr.state || ''
                const road = addr.road || ''
                setAddress(`${road} ${district} ${province}`.trim() || 'Address found (no details)')
            } else {
                setAddress('Address not found')
            }
        }
      } catch (err) {
        console.warn('Map geocoding failed:', err)
        if (isMounted) setAddress('Location services unavailable')
      }
    }

    fetchAddress()
    return () => { isMounted = false }
  }, [driver.lat, driver.lng])

  return (
    <div className="text-xl min-w-[200px]">
      <p className="font-bold text-base mb-1">{driver.name}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-gray-600">
            <Truck size={14} className="text-emerald-500" />
            <span className="font-bold">{driver.vehiclePlate || '-'}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
            <MapPin size={14} className="text-red-500" />
            <p className="text-lg font-bold leading-relaxed">
                {address}
            </p>
        </div>
        {driver.lastUpdate && <p className="text-gray-400 text-base font-bold mt-1 text-right">Updated: {driver.lastUpdate}</p>}
        
        {onShowRoute && driver.vehiclePlate && (
            <div className="pt-2 border-t border-border/10 mt-2">
                <button 
                    onClick={() => onShowRoute(driver.vehiclePlate!)}
                    className="w-full py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-sm font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all"
                >
                    Show Today's Path
                </button>
            </div>
        )}
      </div>
    </div>
  )
}
