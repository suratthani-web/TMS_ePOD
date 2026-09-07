"use client"

/**
 * LocationPicker — TMS 2026
 * Enhanced location picker modal with:
 *   - AI Geocoding search (Gemini) for Thai businesses, companies, factories & POIs
 *   - Direct Coordinate detection (13.528431, 100.672911)
 *   - Google Maps URL resolver (including maps.app.goo.gl short links)
 *   - OpenStreetMap / Photon autocomplete fallback
 *   - Interactive Leaflet map with draggable pin & reverse geocode
 */

import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, MapPin, Search as SearchIcon, Check, Crosshair, Sparkles, Navigation, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { searchPlacesGoogle, searchLocationWithAI, resolveGoogleMapsUrl, reverseGeocode as serverReverseGeocode, placesAutocompleteGoogle, placeDetailsGoogle } from '@/lib/ai/geocoding'

// Thailand centroid — default view when no point is chosen yet.
const TH_CENTER: [number, number] = [13.7563, 100.5018]
// Thailand bounding box
const TH_BBOX = { minLon: 97.3, minLat: 5.5, maxLon: 105.7, maxLat: 20.6 }

const pinIcon = L.icon({
  iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

type PhotonFeature = {
  geometry: { coordinates: [number, number] } // [lng, lat]
  properties: {
    name?: string
    street?: string
    housenumber?: string
    district?: string
    city?: string
    county?: string
    state?: string
    postcode?: string
    country?: string
    countrycode?: string
  }
}

type Suggestion = {
  label: string
  address?: string
  lat: number
  lng: number
  source?: 'ai' | 'coordinate' | 'google_maps' | 'google' | 'osm'
  placeId?: string // when set, coords are resolved lazily via Place Details on pick
}

export type PickedLocation = { name: string; lat: number; lng: number }

type LocationPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialLat?: string | number
  initialLng?: string | number
  initialName?: string
  onConfirm: (loc: PickedLocation) => void
  title?: string
}

// Build a readable Thai-friendly label from a Photon feature.
function labelFromFeature(f: PhotonFeature): string {
  const p = f.properties
  const parts = [
    p.name,
    [p.housenumber, p.street].filter(Boolean).join(' '),
    p.district,
    p.city || p.county,
    p.state,
  ].filter(Boolean)
  const out: string[] = []
  for (const part of parts) {
    if (out[out.length - 1] !== part) out.push(part as string)
  }
  return out.join(', ')
}

function RecenterOnPoint({ point }: { point: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (point && map && typeof map.getContainer === 'function') {
      const c = map.getContainer()
      if (c && document.body.contains(c)) map.setView(point, Math.max(map.getZoom(), 15), { animate: true })
    }
  }, [point, map])
  return null
}

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

// Force a size recalculation on mount to prevent grey tiles bug in dialog.
function InvalidateOnMount() {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 150)
    return () => clearTimeout(t)
  }, [map])
  return null
}

export default function LocationPicker({
  open,
  onOpenChange,
  initialLat,
  initialLng,
  initialName,
  onConfirm,
  title = 'เลือกตำแหน่งบนแผนที่',
}: LocationPickerProps) {
  const parsedLat = initialLat != null && initialLat !== '' ? Number(initialLat) : NaN
  const parsedLng = initialLng != null && initialLng !== '' ? Number(initialLng) : NaN
  const hasInitial = !Number.isNaN(parsedLat) && !Number.isNaN(parsedLng)

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [showList, setShowList] = useState(false)
  const [point, setPoint] = useState<[number, number] | null>(hasInitial ? [parsedLat, parsedLng] : null)
  const [name, setName] = useState(initialName || '')
  const [reverseLoading, setReverseLoading] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Autocomplete session token — keeps all keystrokes + the final Place Details
  // call billed as one cheap Autocomplete session. Rotated after each pick.
  const sessionTokenRef = useRef<string>('')
  const newSessionToken = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`

  // Reset state each time the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setQuery(initialName || '')
      setName(initialName || '')
      setPoint(hasInitial ? [parsedLat, parsedLng] : null)
      setSuggestions([])
      setShowList(false)
      sessionTokenRef.current = newSessionToken()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Reverse geocode a picked point → place name.
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setReverseLoading(true)
    try {
      const serverLabel = await serverReverseGeocode(lat, lng)
      if (serverLabel) {
        setName(serverLabel)
        return
      }

      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=th`,
        { headers: { 'User-Agent': 'TMS-Logistics-Platform-v2 (contact@logispro-epod.app)' }, signal: AbortSignal.timeout(4000) }
      )
      if (!res.ok) return
      const data = await res.json()
      const label = (data?.name && String(data.name).trim()) || (data?.display_name && String(data.display_name).trim())
      if (label) setName(label)
    } catch {
      /* keep whatever name we had */
    } finally {
      setReverseLoading(false)
    }
  }, [])

  // Smart Search: Coordinates, Google Maps URLs, AI POI, and OpenStreetMap
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setSuggestions([])
      return
    }

    // 1. Instant check: Lat, Lng coordinates (e.g. "13.528431, 100.672911")
    const coordMatch = q.match(/^(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/)
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1])
      const lng = parseFloat(coordMatch[2])
      if (lat >= 5.5 && lat <= 20.6 && lng >= 97.3 && lng <= 105.7) {
        setSuggestions([
          {
            label: `พิกัด: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
            address: `ละติจูด ${lat.toFixed(6)}, ลองจิจูด ${lng.toFixed(6)}`,
            lat,
            lng,
            source: 'coordinate',
          },
        ])
        setShowList(true)
        return
      }
    }

    // 2. Instant check: Google Maps URLs
    if (q.startsWith('http') && (q.includes('maps') || q.includes('goo.gl'))) {
      setSearching(true)
      resolveGoogleMapsUrl(q)
        .then((res) => {
          if (res) {
            setSuggestions([
              {
                label: res.name || 'ตำแหน่งจากลิงก์ Google Maps',
                address: `พิกัด ${res.lat.toFixed(6)}, ${res.lng.toFixed(6)}`,
                lat: res.lat,
                lng: res.lng,
                source: 'google_maps',
              },
            ])
            setShowList(true)
          }
        })
        .finally(() => setSearching(false))
      return
    }

    // 3. Fast Debounced Search: Google Places first (instant), with OSM/AI fallback
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setSearching(true)

      try {
        const results: Suggestion[] = []

        // 3.0a Google Places Autocomplete (New) — cheapest per keystroke.
        // Coords are resolved lazily on pick (placeId set, lat/lng = 0).
        const acResults = await placesAutocompleteGoogle(q, sessionTokenRef.current).catch(() => [])

        if (ctrl.signal.aborted) return

        if (acResults && acResults.length > 0) {
          setSuggestions(acResults.slice(0, 8).map((p) => ({
            label: p.primary,
            address: p.secondary,
            lat: 0,
            lng: 0,
            source: 'google' as const,
            placeId: p.placeId,
          })))
          setShowList(true)
          setSearching(false)
          return
        }

        // 3.0b Google Places Text Search — fallback if Autocomplete returns nothing
        const googleResults = await searchPlacesGoogle(q).catch(() => [])

        if (ctrl.signal.aborted) return

        if (googleResults && googleResults.length > 0) {
          for (const item of googleResults) {
            results.push({
              label: item.name,
              address: item.address,
              lat: item.lat,
              lng: item.lng,
              source: item.source || 'google',
            })
          }
          setSuggestions(results.slice(0, 8))
          setShowList(true)
          setSearching(false)
          return
        }

        // 3.1 Photon OSM Search (Fast fallback)
        const bbox = `${TH_BBOX.minLon},${TH_BBOX.minLat},${TH_BBOX.maxLon},${TH_BBOX.maxLat}`
        const photonUrl =
          `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=default` +
          `&lat=${TH_CENTER[0]}&lon=${TH_CENTER[1]}&bbox=${bbox}`
        const photonRes = await fetch(photonUrl, { signal: ctrl.signal }).catch(() => null)
        const photonData = photonRes && photonRes.ok ? await photonRes.json().catch(() => null) : null

        if (ctrl.signal.aborted) return

        if (photonData?.features) {
          const feats: PhotonFeature[] = photonData.features
          const osmItems = feats
            .filter((f) => !f.properties.countrycode || f.properties.countrycode.toUpperCase() === 'TH')
            .map((f) => ({
              label: labelFromFeature(f),
              lat: f.geometry.coordinates[1],
              lng: f.geometry.coordinates[0],
              source: 'osm' as const,
            }))
            .filter((s) => s.label)

          for (const osm of osmItems) {
            if (!results.some((r) => r.label === osm.label)) {
              results.push(osm)
            }
          }
        }

        if (results.length > 0) {
          setSuggestions(results.slice(0, 8))
          setShowList(true)
          setSearching(false)
          return
        }

        // 3.2 AI Geocoding Search (Gemini) — Only if Google and OSM found nothing
        const aiResults = await searchLocationWithAI(q).catch(() => [])
        if (ctrl.signal.aborted) return

        if (aiResults && aiResults.length > 0) {
          for (const item of aiResults) {
            results.push({
              label: item.name,
              address: item.address,
              lat: item.lat,
              lng: item.lng,
              source: item.source || 'ai',
            })
          }
        }

        // Fallback to Nominatim if still empty
        if (results.length === 0) {
          try {
            const nres = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=th&accept-language=th&addressdetails=1`,
              { headers: { 'User-Agent': 'TMS-Logistics-Platform-v2 (contact@logispro-epod.app)' }, signal: ctrl.signal }
            )
            if (nres.ok) {
              const ndata: Array<{ lat: string; lon: string; display_name: string; name?: string }> = await nres.json()
              for (const n of ndata) {
                const label = (n.name && n.name.trim()) || n.display_name
                if (label && !results.some((r) => r.label === label)) {
                  results.push({
                    label,
                    lat: parseFloat(n.lat),
                    lng: parseFloat(n.lon),
                    source: 'osm',
                  })
                }
              }
            }
          } catch {
            /* keep results */
          }
        }

        if (!ctrl.signal.aborted) {
          setSuggestions(results.slice(0, 8))
          setShowList(true)
        }
      } catch {
        /* ignore */
      } finally {
        if (!ctrl.signal.aborted) {
          setSearching(false)
        }
      }
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open])

  const pickSuggestion = async (s: Suggestion) => {
    setName(s.label)
    setQuery(s.label)
    setShowList(false)
    setSuggestions([])

    // Autocomplete predictions carry no coords — resolve them now (closes the
    // billing session), then start a fresh token for the next search.
    if (s.placeId && (!s.lat || !s.lng)) {
      setReverseLoading(true)
      try {
        const details = await placeDetailsGoogle(s.placeId, sessionTokenRef.current)
        if (details) {
          setPoint([details.lat, details.lng])
          setName(details.name || s.label)
        } else {
          // fall back to reverse geocode only if we somehow got coords elsewhere
        }
      } finally {
        setReverseLoading(false)
        sessionTokenRef.current = newSessionToken()
      }
      return
    }

    setPoint([s.lat, s.lng])
  }

  const pickOnMap = (lat: number, lng: number) => {
    setPoint([lat, lng])
    reverseGeocode(lat, lng)
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => pickOnMap(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const confirm = () => {
    if (!point) return
    onConfirm({ name: name.trim(), lat: point[0], lng: point[1] })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <MapPin className="w-5 h-5 text-primary" /> {title}
          </DialogTitle>
        </DialogHeader>

        {/* Search box + autocomplete */}
        <div className="px-5 relative z-[1200]">
          <div className="relative">
            <SearchIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowList(true)}
              placeholder="ค้นหาชื่อบริษัท / โรงงาน / พิกัด (13.52, 100.67) / วางลิงก์ Google Maps..."
              className="pl-10 pr-10 h-12 text-base font-medium shadow-sm"
            />
            {searching && <Loader2 className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
          </div>

          <p className="text-[11px] text-muted-foreground mt-1 px-1">
            💡 รองรับทั้งชื่อบริษัท/โรงงาน (AI ค้นหา), พิกัด Lat,Lng และวางลิงก์ Google Maps โดยตรง
          </p>

          {showList && suggestions.length > 0 && (
            <ul className="absolute left-5 right-5 mt-1 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto z-[1300]">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => pickSuggestion(s)}
                    className="w-full text-left px-4 py-3 hover:bg-accent flex items-start gap-3 transition-colors border-b border-border/50 last:border-0"
                  >
                    {s.source === 'ai' && (
                      <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4" />
                      </div>
                    )}
                    {s.source === 'coordinate' && (
                      <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 shrink-0 mt-0.5">
                        <Navigation className="w-4 h-4" />
                      </div>
                    )}
                    {s.source === 'google_maps' && (
                      <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 shrink-0 mt-0.5">
                        <Globe className="w-4 h-4" />
                      </div>
                    )}
                    {(!s.source || s.source === 'osm') && (
                      <div className="p-1.5 rounded-lg bg-muted text-muted-foreground shrink-0 mt-0.5">
                        <MapPin className="w-4 h-4" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">{s.label}</span>
                        {s.source === 'ai' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
                            ✨ AI
                          </span>
                        )}
                        {s.source === 'coordinate' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
                            GPS
                          </span>
                        )}
                        {s.source === 'google_maps' && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                            Google Maps
                          </span>
                        )}
                      </div>
                      {s.address && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{s.address}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Map */}
        <div className="relative mt-3 h-[380px] w-full">
          <MapContainer center={point || TH_CENTER} zoom={point ? 15 : 6} style={{ height: '100%', width: '100%' }} className="z-0">
            <InvalidateOnMount />
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
            <ClickCapture onPick={pickOnMap} />
            <RecenterOnPoint point={point} />
            {point && (
              <Marker
                position={point}
                icon={pinIcon}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const m = e.target as L.Marker
                    const ll = m.getLatLng()
                    pickOnMap(ll.lat, ll.lng)
                  },
                }}
              />
            )}
          </MapContainer>

          <button
            type="button"
            onClick={useMyLocation}
            title="ใช้ตำแหน่งปัจจุบัน"
            className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5 px-3 py-2 rounded-xl bg-background/90 backdrop-blur border border-border shadow-lg text-xs font-bold hover:bg-background"
          >
            <Crosshair className="w-4 h-4 text-primary" /> ตำแหน่งฉัน
          </button>

          {!point && (
            <div className="absolute inset-x-0 top-3 z-[1000] flex justify-center pointer-events-none">
              <span className="px-3 py-1.5 rounded-full bg-background/90 backdrop-blur border border-border shadow text-xs font-bold text-muted-foreground">
                คลิกบนแผนที่หรือค้นหาด้านบนเพื่อปักหมุด
              </span>
            </div>
          )}
        </div>

        {/* Footer: selected value + confirm */}
        <div className="px-5 py-4 border-t border-border bg-muted/20">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่อสถานที่ (แก้ไขได้)"
              className="h-10 text-sm flex-1"
            />
            {reverseLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className={cn('text-xs font-mono', point ? 'text-foreground' : 'text-muted-foreground')}>
              {point ? `${point[0].toFixed(6)}, ${point[1].toFixed(6)}` : 'ยังไม่ได้เลือกพิกัด'}
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
              <Button type="button" onClick={confirm} disabled={!point} className="gap-1.5">
                <Check className="w-4 h-4" /> ใช้ตำแหน่งนี้
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
