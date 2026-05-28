"use client"

import dynamicImport from 'next/dynamic'
import { MapPin, NavigationOff } from "lucide-react"

// Dynamically import LeafletMap to avoid SSR issues with 'window'
const LeafletMap = dynamicImport(() => import('@/components/maps/leaflet-map'), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-900 animate-pulse flex items-center justify-center text-slate-500 font-black uppercase tracking-widest text-xs italic">INITIALIZING GEOSPATIAL ENGINE...</div>
})

interface TrackingMapProps {
  lastLocation?: {
    lat: number
    lng: number
    timestamp: string
  } | null
  driverName: string
  status: string
  pickup?: { lat: number | null, lng: number | null, name: string }
  dropoff?: { lat: number | null, lng: number | null, name: string }
  vehiclePlate?: string
}

export function TrackingMap({ lastLocation, driverName, status, pickup, dropoff, vehiclePlate }: TrackingMapProps) {
  const jobMissions = []
  
  if (pickup?.lat && pickup?.lng) {
    jobMissions.push({
        id: 'origin',
        jobId: 'tracking',
        name: pickup.name,
        lat: pickup.lat,
        lng: pickup.lng,
        type: 'origin' as const,
        status: status
    })
  }

  if (dropoff?.lat && dropoff?.lng) {
    jobMissions.push({
        id: 'destination',
        jobId: 'tracking',
        name: dropoff.name,
        lat: dropoff.lat,
        lng: dropoff.lng,
        type: 'destination' as const,
        status: status
    })
  }

  // Determine fallback center (e.g., Destination or Pickup or Thailand Default)
  const defaultCenter: [number, number] = [13.7563, 100.5018] // Bangkok
  const centerLat = lastLocation?.lat ?? dropoff?.lat ?? pickup?.lat ?? defaultCenter[0]
  const centerLng = lastLocation?.lng ?? dropoff?.lng ?? pickup?.lng ?? defaultCenter[1]

  if (!lastLocation) {
    return (
        <div className="relative h-full w-full">
            <LeafletMap 
                center={[centerLat, centerLng]}
                zoom={12}
                jobMissions={jobMissions}
                drivers={[]}
            />
            <div className="absolute inset-0 z-[1000] pointer-events-none flex flex-col items-center justify-center bg-black/20 backdrop-blur-[2px]">
                <div className="bg-slate-950/80 border border-white/10 p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-4 text-center">
                    <div className="p-3 bg-rose-500/10 rounded-2xl text-rose-500">
                        <NavigationOff size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-black text-foreground uppercase tracking-widest italic">AWAITING GPS UPLINK</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">DRIVER LOCATION DATA IS CURRENTLY OFFLINE</p>
                    </div>
                </div>
            </div>
        </div>
    )
  }

  return (
    <LeafletMap 
        center={[lastLocation.lat, lastLocation.lng]}
        zoom={15}
        focusPosition={[lastLocation.lat, lastLocation.lng]}
        jobMissions={jobMissions}
        drivers={[{
            id: driverName,
            name: driverName,
            lat: lastLocation.lat,
            lng: lastLocation.lng,
            status: status,
            lastUpdate: new Date(lastLocation.timestamp).toLocaleTimeString('th-TH'),
            vehiclePlate: vehiclePlate || "N/A"
        }]}
    />
  )
}
