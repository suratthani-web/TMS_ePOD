import 'server-only'

import { createAdminClient } from '@/utils/supabase/server'

export type CapturedPinPayload = {
  lat: number
  lng: number
  accuracy: number | null
  speed: number | null
  deviceId: string
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6_371_000
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function normalizeLocationName(name: string): string {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function parsePinFromFormData(formData: FormData): CapturedPinPayload | null {
  const latRaw = formData.get('pin_lat')
  const lngRaw = formData.get('pin_lng')
  const deviceRaw = formData.get('pin_device_id')
  if (latRaw == null || lngRaw == null || deviceRaw == null) return null

  const lat = Number(latRaw)
  const lng = Number(lngRaw)
  const deviceId = String(deviceRaw).trim()
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    (lat === 0 && lng === 0) ||
    !deviceId
  ) {
    return null
  }

  const accRaw = formData.get('pin_accuracy')
  const spdRaw = formData.get('pin_speed')
  const accNum = accRaw != null && String(accRaw).trim() !== '' ? Number(accRaw) : null
  const spdNum = spdRaw != null && String(spdRaw).trim() !== '' ? Number(spdRaw) : null

  return {
    lat,
    lng,
    accuracy: accNum != null && Number.isFinite(accNum) ? accNum : null,
    speed: spdNum != null && Number.isFinite(spdNum) ? spdNum : null,
    deviceId,
  }
}

export async function recordDriverLocationPin(params: {
  jobId: string
  driverId: string
  branchId?: string | null
  locationName: string
  dropIndex: number
  eventType: 'pickup' | 'dropoff'
  pickupLat?: number | null
  pickupLng?: number | null
  originName?: string | null
  pin: CapturedPinPayload
}): Promise<void> {
  try {
    const {
      jobId,
      driverId,
      branchId,
      locationName,
      dropIndex,
      eventType,
      pickupLat,
      pickupLng,
      originName,
      pin,
    } = params

    const trimmedName = String(locationName ?? '').trim()
    const normalizedName = normalizeLocationName(trimmedName)
    const trimmedDriverId = String(driverId ?? '').trim()
    const trimmedDeviceId = String(pin?.deviceId ?? '').trim()

    if (
      !trimmedName ||
      !normalizedName ||
      !trimmedDriverId ||
      !trimmedDeviceId ||
      !Number.isFinite(pin.lat) ||
      !Number.isFinite(pin.lng) ||
      (pin.lat === 0 && pin.lng === 0)
    ) {
      return
    }

    const supabase = createAdminClient()

    // Layer 1: Quality Gate
    let flagReason: string | null = null
    if (pin.accuracy != null && pin.accuracy > 60) {
      flagReason = 'low_accuracy'
    } else if (pin.speed != null && pin.speed > 10) {
      flagReason = 'moving'
    }

    // Layer 2: Anti-Poisoning Checks
    if (!flagReason) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: deviceRows } = await supabase
        .from('Location_Pin_Candidates')
        .select('driver_id')
        .eq('device_id', trimmedDeviceId)
        .gte('created_at', sevenDaysAgo)

      const distinctDeviceDrivers = new Set<string>([trimmedDriverId])
      for (const r of deviceRows || []) {
        if (r?.driver_id) distinctDeviceDrivers.add(String(r.driver_id))
      }
      if (distinctDeviceDrivers.size >= 3) {
        flagReason = 'proxy_device'
      }
    }

    if (!flagReason && eventType === 'dropoff' && pickupLat != null && pickupLng != null) {
      if (
        normalizeLocationName(originName || '') !== normalizedName &&
        haversineMeters(pin.lat, pin.lng, pickupLat, pickupLng) < 300
      ) {
        flagReason = 'office_or_origin_zone'
      }
    }

    if (!flagReason) {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const { data: nightLogs } = await supabase
        .from('gps_logs')
        .select('latitude, longitude, timestamp')
        .eq('driver_id', trimmedDriverId)
        .gte('timestamp', fourteenDaysAgo)
        .order('timestamp', { ascending: false })
        .limit(300)

      const nightPoints = (nightLogs || []).filter((row) => {
        const lat = Number(row?.latitude)
        const lng = Number(row?.longitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return false
        const ts = row?.timestamp ? new Date(String(row.timestamp)) : null
        if (!ts || Number.isNaN(ts.getTime())) return false
        const bkkHour = (ts.getUTCHours() + 7) % 24
        return bkkHour >= 0 && bkkHour <= 4
      })

      if (nightPoints.length >= 5) {
        const nearHomeCount = nightPoints.filter(
          (p) => haversineMeters(pin.lat, pin.lng, Number(p.latitude), Number(p.longitude)) <= 300
        ).length
        if (nearHomeCount >= 5) {
          flagReason = 'driver_home_zone'
        }
      }
    }

    if (!flagReason) {
      const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString()
      const { data: trailLogs } = await supabase
        .from('gps_logs')
        .select('latitude, longitude')
        .eq('driver_id', trimmedDriverId)
        .gte('timestamp', ninetyMinsAgo)
        .order('timestamp', { ascending: false })
        .limit(100)

      const validTrail = (trailLogs || [])
        .map((r) => ({ lat: Number(r?.latitude), lng: Number(r?.longitude) }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && (p.lat !== 0 || p.lng !== 0))

      if (validTrail.length >= 3) {
        const maxDist = Math.max(
          ...validTrail.map((p) => haversineMeters(pin.lat, pin.lng, p.lat, p.lng))
        )
        if (maxDist < 500) {
          flagReason = 'no_approach_trail'
        }
      }
    }

    if (!flagReason) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: nearbyCandidates } = await supabase
        .from('Location_Pin_Candidates')
        .select('normalized_name, lat, lng')
        .gte('created_at', thirtyDaysAgo)
        .gte('lat', pin.lat - 0.002)
        .lte('lat', pin.lat + 0.002)
        .gte('lng', pin.lng - 0.002)
        .lte('lng', pin.lng + 0.002)
        .limit(500)

      const distinctNames = new Set<string>([normalizedName])
      for (const r of nearbyCandidates || []) {
        const rLat = Number(r?.lat)
        const rLng = Number(r?.lng)
        if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) continue
        if (haversineMeters(pin.lat, pin.lng, rLat, rLng) <= 100 && r?.normalized_name) {
          distinctNames.add(String(r.normalized_name))
        }
      }
      if (distinctNames.size >= 3) {
        flagReason = 'multi_destination_collision'
      }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('Location_Pin_Candidates')
      .insert({
        location_name: trimmedName,
        normalized_name: normalizedName,
        branch_id: branchId || null,
        job_id: jobId,
        drop_index: dropIndex,
        event_type: eventType,
        driver_id: trimmedDriverId,
        device_id: trimmedDeviceId,
        lat: pin.lat,
        lng: pin.lng,
        accuracy: pin.accuracy,
        speed: pin.speed,
        status: flagReason ? 'flagged' : 'pending',
        flag_reason: flagReason,
      })
      .select('id')
      .single()

    if (insertErr || !inserted?.id || flagReason) {
      return
    }

    // Layer 3 & 4: Cross-Driver + Cross-Device Consensus
    const { data: locRows } = await supabase
      .from('Master_Locations')
      .select('Location_ID, Name, Lat, Lon, Branch_ID')
      .ilike('Name', trimmedName)
      .limit(10)

    const existingLoc =
      (locRows || []).find((l) => branchId && l.Branch_ID === branchId) ||
      (locRows || [])[0] ||
      null

    const nowIso = new Date().toISOString()

    if (existingLoc && existingLoc.Lat != null && existingLoc.Lon != null) {
      const dist = haversineMeters(pin.lat, pin.lng, Number(existingLoc.Lat), Number(existingLoc.Lon))
      if (dist <= 200) {
        await supabase
          .from('Location_Pin_Candidates')
          .update({
            status: 'auto_approved',
            reviewed_at: nowIso,
            reviewed_by: 'auto_match',
          })
          .eq('id', inserted.id)
      }
      // > 200m stays 'pending' for Admin 1-click review — never silently overwrite
      return
    }

    // Location missing or missing Lat/Lon -> check pending consensus cluster
    const { data: pendingRows } = await supabase
      .from('Location_Pin_Candidates')
      .select('id, driver_id, device_id, lat, lng')
      .eq('normalized_name', normalizedName)
      .eq('status', 'pending')

    const cluster = (pendingRows || []).filter((r) => {
      const rLat = Number(r?.lat)
      const rLng = Number(r?.lng)
      return Number.isFinite(rLat) && Number.isFinite(rLng) && haversineMeters(pin.lat, pin.lng, rLat, rLng) <= 150
    })

    const clusterDrivers = new Set(cluster.map((r) => String(r.driver_id)).filter(Boolean))
    const clusterDevices = new Set(cluster.map((r) => String(r.device_id)).filter(Boolean))

    if (clusterDrivers.size >= 2 && clusterDevices.size >= 2 && cluster.length >= 2) {
      const avgLat = Number((cluster.reduce((s, r) => s + Number(r.lat), 0) / cluster.length).toFixed(6))
      const avgLng = Number((cluster.reduce((s, r) => s + Number(r.lng), 0) / cluster.length).toFixed(6))
      const mapLink = `https://www.google.com/maps?q=${avgLat},${avgLng}`

      if (existingLoc) {
        await supabase
          .from('Master_Locations')
          .update({
            Lat: avgLat,
            Lon: avgLng,
            Map_Link: mapLink,
            Is_Incomplete: false,
          })
          .eq('Location_ID', existingLoc.Location_ID)
      } else {
        await supabase
          .from('Master_Locations')
          .insert({
            Name: trimmedName,
            Lat: avgLat,
            Lon: avgLng,
            Map_Link: mapLink,
            Branch_ID: branchId || null,
            Is_Incomplete: false,
          })
      }

      const clusterIds = cluster.map((r) => r.id).filter(Boolean)
      if (clusterIds.length > 0) {
        await supabase
          .from('Location_Pin_Candidates')
          .update({
            status: 'auto_approved',
            reviewed_at: nowIso,
            reviewed_by: 'auto_consensus',
          })
          .in('id', clusterIds)
      }
    }
  } catch (err) {
    console.warn('[PIN_COLLECTOR] skipped:', err)
  }
}
