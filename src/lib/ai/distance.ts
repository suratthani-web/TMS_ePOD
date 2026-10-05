"use server"

type OsrmWaypoint = {
  trips_index: number;
  waypoint_index: number;
}

type OsrmTripResponse = {
  code?: string;
  waypoints?: OsrmWaypoint[];
  routes?: { distance?: number }[];
}

type LatLng = { lat: number; lng: number }

/**
 * Distance Utility — TMS 2026
 *
 * Preference order for driving distance / routing:
 *   1. Google Routes API (routes.googleapis.com) — accurate, reliable
 *   2. OSRM public server — free fallback when Google is unavailable / over quota
 *   3. Haversine straight-line — deterministic last resort (never blank)
 *
 * Google usage is capped in the Cloud console (ComputeRoutes 300/day) so an
 * accidental loop can never generate a bill: past the cap Google returns an
 * error and we simply fall through to OSRM/Haversine.
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"

function toWaypoint(p: LatLng) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } }
}

/**
 * Google Routes API — driving distance (km) for an ordered set of points.
 * First point = origin, last = destination, middle points = intermediates.
 * Returns null on any failure (missing key, over quota, network) so callers
 * can fall back to OSRM.
 */
async function getGoogleDrivingDistance(points: LatLng[]): Promise<number | null> {
  if (!GOOGLE_MAPS_API_KEY || points.length < 2) return null

  try {
    const origin = points[0]
    const destination = points[points.length - 1]
    const intermediates = points.slice(1, -1).map(toWaypoint)

    const body: Record<string, unknown> = {
      origin: toWaypoint(origin),
      destination: toWaypoint(destination),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    }
    if (intermediates.length > 0) body.intermediates = intermediates

    const response = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) return null

    const data = (await response.json()) as { routes?: { distanceMeters?: number }[] }
    const meters = data.routes?.[0]?.distanceMeters
    if (typeof meters === "number" && meters > 0) {
      return parseFloat((meters / 1000).toFixed(2))
    }
    return null
  } catch (error) {
    console.warn("[getGoogleDrivingDistance] failed, falling back to OSRM:", error)
    return null
  }
}

/**
 * OSRM public routing server — driving distance (km). Free but flaky/rate-limited,
 * so it now serves as a fallback behind Google Routes.
 */
export async function getDrivingDistance(
  points: LatLng[]
): Promise<number | null> {
  if (points.length < 2) return null

  // 1. Google Routes API (primary)
  const google = await getGoogleDrivingDistance(points)
  if (google !== null) return google

  // 2. OSRM (fallback)
  try {
    const coordsStr = points.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=false&alternatives=false`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DRouteMind-TMS/2 (+https://tms-e-pod.vercel.app)'
      }
    });

    if (!response.ok) return null;

    const data = await response.json() as OsrmTripResponse;

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const distanceMeters = data.routes[0].distance ?? 0;
      return parseFloat((distanceMeters / 1000).toFixed(2));
    }

    return null;
  } catch (error) {
    console.error('Distance calculation failed:', error);
    return null;
  }
}

/**
 * Straight-line (Haversine) distance across a sequence of points, in km.
 * Used as a deterministic fallback when both Google and OSRM are unreachable,
 * so a job never ends up with a blank distance.
 */
function haversineDistanceKm(points: LatLng[]): number {
  const R = 6371 // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dLat = toRad(b.lat - a.lat)
    const dLng = toRad(b.lng - a.lng)
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
    total += 2 * R * Math.asin(Math.sqrt(s))
  }
  return parseFloat(total.toFixed(2))
}

/**
 * Resolve a driving distance for a set of ordered points, guaranteeing a
 * value whenever there are >= 2 valid points.
 *
 * Order of preference:
 *   1. Google Routes API (accurate)
 *   2. OSRM driving distance
 *   3. Haversine straight-line distance (always available)
 *
 * Returns null only when there are fewer than 2 points to measure.
 * This is the single source of truth used by BOTH job creation and file
 * import so distances are populated consistently on the server.
 */
export async function resolveDistanceKm(
  points: LatLng[]
): Promise<number | null> {
  const valid = points.filter(
    p =>
      typeof p.lat === 'number' &&
      typeof p.lng === 'number' &&
      !Number.isNaN(p.lat) &&
      !Number.isNaN(p.lng)
  )
  if (valid.length < 2) return null

  // getDrivingDistance already tries Google → OSRM internally.
  const routed = await getDrivingDistance(valid)
  if (routed !== null && routed > 0) return routed

  // Fallback: never leave the field blank when we have coordinates.
  return haversineDistanceKm(valid)
}

/**
 * Google Routes API — optimize the order of intermediate stops.
 * Origin (first) and destination (last) are fixed; the middle stops are
 * reordered for the shortest drive. Returns the full visit order as indices
 * into the original `points` array, or null on failure.
 */
async function optimizeWithGoogle(points: LatLng[]): Promise<number[] | null> {
  if (!GOOGLE_MAPS_API_KEY || points.length < 3) return null

  try {
    const origin = points[0]
    const destination = points[points.length - 1]
    const intermediates = points.slice(1, -1).map(toWaypoint)

    const body = {
      origin: toWaypoint(origin),
      destination: toWaypoint(destination),
      intermediates,
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      optimizeWaypointOrder: true,
    }

    const response = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "routes.optimizedIntermediateWaypointIndex",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) return null

    const data = (await response.json()) as {
      routes?: { optimizedIntermediateWaypointIndex?: number[] }[]
    }
    const order = data.routes?.[0]?.optimizedIntermediateWaypointIndex
    if (!Array.isArray(order)) return null

    // order[] are indices into `intermediates` (i.e. original index - 1).
    // Rebuild the full sequence: origin, optimized intermediates, destination.
    const lastIdx = points.length - 1
    const sequence = [0, ...order.map(i => i + 1), lastIdx]
    return sequence
  } catch (error) {
    console.warn("[optimizeWithGoogle] failed, falling back to OSRM:", error)
    return null
  }
}

/**
 * Route Optimization — TMS 2026
 * Preference: Google Routes (optimizeWaypointOrder) → OSRM Trip service (TSP).
 * Returns the optimized sequence of indices into the input array.
 */
export async function optimizeRouteSequence(
  points: LatLng[]
): Promise<number[] | null> {
  // Need at least 3 points to have something to optimize (1 start + 2 destinations)
  if (points.length < 3) return points.map((_, i) => i);

  // 1. Google Routes (primary)
  const google = await optimizeWithGoogle(points)
  if (google && google.length === points.length) return google

  // 2. OSRM Trip service (fallback)
  try {
    const coordsStr = points.map(p => `${p.lng},${p.lat}`).join(';');
    // source=first: fix the start point
    // roundtrip=false: don't return to start
    const url = `https://router.project-osrm.org/trip/v1/driving/${coordsStr}?source=first&destination=any&roundtrip=false&overview=false`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DRouteMind-TMS/2 (+https://tms-e-pod.vercel.app)'
      }
    });

    if (!response.ok) return null;

    const data = await response.json() as OsrmTripResponse;

    if (data.code === 'Ok' && data.waypoints) {
      const optimizedIndices = data.waypoints
        .sort((a: OsrmWaypoint, b: OsrmWaypoint) => a.trips_index - b.trips_index)
        .map((w: OsrmWaypoint) => w.waypoint_index);

      return optimizedIndices;
    }

    return null;
  } catch (error) {
    console.error('Route optimization failed:', error);
    return null;
  }
}
