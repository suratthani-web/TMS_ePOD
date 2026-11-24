"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/utils/supabase/server"
import { getUserBranchId, isAdmin, isSuperAdmin } from "@/lib/permissions"
import { getSession } from "@/lib/session"
import { haversineMeters } from "@/services/location-pin-collector"

export type PendingPinSuggestion = {
  normalizedName: string
  locationName: string
  branchId: string | null
  latestLat: number
  latestLng: number
  sampleCount: number
  distinctDrivers: number
  distinctDevices: number
  latestCreatedAt: string
  candidateIds: string[]
  existingLat: number | null
  existingLon: number | null
  distanceFromExistingMeters: number | null
}

type CandidateRow = {
  id: string
  location_name: string
  normalized_name: string
  branch_id: string | null
  driver_id: string
  device_id: string
  lat: number
  lng: number
  created_at: string
}

export async function getPendingPinCandidates(branchId?: string): Promise<PendingPinSuggestion[]> {
  try {
    const admin = await isAdmin()
    if (!admin) return []

    const [superAdmin, userBranch] = await Promise.all([isSuperAdmin(), getUserBranchId()])
    let branchFilter: string | null = null
    if (!superAdmin) {
      if (!userBranch || userBranch === "All") return []
      branchFilter = userBranch
    } else if (branchId && branchId !== "All") {
      branchFilter = branchId
    }

    const supabase = createAdminClient()
    let query = supabase
      .from("Location_Pin_Candidates")
      .select("id, location_name, normalized_name, branch_id, driver_id, device_id, lat, lng, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(500)

    if (branchFilter) {
      query = query.eq("branch_id", branchFilter)
    }

    const { data, error } = await query
    if (error || !data || data.length === 0) return []

    const groups = new Map<
      string,
      {
        latest: CandidateRow
        drivers: Set<string>
        devices: Set<string>
        candidateIds: string[]
      }
    >()

    for (const row of data as CandidateRow[]) {
      const key = row.normalized_name
      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, {
          latest: row,
          drivers: new Set(row.driver_id ? [row.driver_id] : []),
          devices: new Set(row.device_id ? [row.device_id] : []),
          candidateIds: [row.id],
        })
      } else {
        if (row.driver_id) existing.drivers.add(row.driver_id)
        if (row.device_id) existing.devices.add(row.device_id)
        existing.candidateIds.push(row.id)
      }
    }

    const locationNames = Array.from(new Set(Array.from(groups.values()).map((g) => g.latest.location_name)))
    const { data: locRows } = locationNames.length > 0
      ? await supabase
          .from("Master_Locations")
          .select("Name, Lat, Lon, Branch_ID")
          .in("Name", locationNames)
      : { data: [] }

    const locByNormName = new Map<string, Array<{ Name: string; Lat: number | null; Lon: number | null; Branch_ID: string | null }>>()
    for (const loc of locRows || []) {
      const norm = String(loc.Name || "").trim().toLowerCase().replace(/\s+/g, " ")
      if (!locByNormName.has(norm)) locByNormName.set(norm, [])
      locByNormName.get(norm)!.push(loc)
    }

    const suggestions: PendingPinSuggestion[] = []
    for (const [normalizedName, group] of groups.entries()) {
      const { latest, drivers, devices, candidateIds } = group
      const matches = locByNormName.get(normalizedName) || []
      const matchedLoc =
        matches.find((m) => latest.branch_id && m.Branch_ID === latest.branch_id) ||
        matches[0] ||
        null

      const existingLat = matchedLoc?.Lat != null ? Number(matchedLoc.Lat) : null
      const existingLon = matchedLoc?.Lon != null ? Number(matchedLoc.Lon) : null
      const distanceFromExistingMeters =
        existingLat != null && existingLon != null
          ? Math.round(haversineMeters(latest.lat, latest.lng, existingLat, existingLon))
          : null

      suggestions.push({
        normalizedName,
        locationName: latest.location_name,
        branchId: latest.branch_id,
        latestLat: latest.lat,
        latestLng: latest.lng,
        sampleCount: candidateIds.length,
        distinctDrivers: drivers.size,
        distinctDevices: devices.size,
        latestCreatedAt: latest.created_at,
        candidateIds,
        existingLat,
        existingLon,
        distanceFromExistingMeters,
      })
    }

    return suggestions
  } catch {
    return []
  }
}

export async function approvePinCandidateGroup(
  candidateIds: string[],
  locationName: string,
  lat: number,
  lng: number,
  branchId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await isAdmin()
    if (!admin) return { success: false, error: "Unauthorized" }

    const trimmedName = String(locationName ?? "").trim()
    if (!trimmedName || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      return { success: false, error: "ข้อมูลพิกัดไม่ครบถ้วน" }
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      return { success: false, error: "พิกัดไม่ถูกต้อง" }
    }

    const session = await getSession()
    const reviewedBy = session?.username || "admin"
    const nowIso = new Date().toISOString()
    const roundedLat = Number(lat.toFixed(6))
    const roundedLng = Number(lng.toFixed(6))
    const mapLink = `https://www.google.com/maps?q=${roundedLat},${roundedLng}`

    const supabase = createAdminClient()

    const { data: locRows } = await supabase
      .from("Master_Locations")
      .select("Location_ID, Branch_ID")
      .ilike("Name", trimmedName)
      .limit(10)

    const existingLoc =
      (locRows || []).find((l) => branchId && l.Branch_ID === branchId) ||
      (locRows || [])[0] ||
      null

    if (existingLoc) {
      const { error: updErr } = await supabase
        .from("Master_Locations")
        .update({
          Lat: roundedLat,
          Lon: roundedLng,
          Map_Link: mapLink,
          Is_Incomplete: false,
        })
        .eq("Location_ID", existingLoc.Location_ID)

      if (updErr) return { success: false, error: updErr.message }
    } else {
      const { error: insErr } = await supabase.from("Master_Locations").insert({
        Name: trimmedName,
        Lat: roundedLat,
        Lon: roundedLng,
        Map_Link: mapLink,
        Branch_ID: branchId || null,
        Is_Incomplete: false,
      })

      if (insErr) return { success: false, error: insErr.message }
    }

    const { error: candErr } = await supabase
      .from("Location_Pin_Candidates")
      .update({
        status: "approved",
        reviewed_at: nowIso,
        reviewed_by: reviewedBy,
      })
      .in("id", candidateIds)

    if (candErr) return { success: false, error: candErr.message }

    revalidatePath("/routes")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

export async function rejectPinCandidateGroup(
  candidateIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = await isAdmin()
    if (!admin) return { success: false, error: "Unauthorized" }

    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      return { success: false, error: "ไม่พบรายการที่จะปฏิเสธ" }
    }

    const session = await getSession()
    const reviewedBy = session?.username || "admin"
    const supabase = createAdminClient()

    const { error } = await supabase
      .from("Location_Pin_Candidates")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: reviewedBy,
      })
      .in("id", candidateIds)

    if (error) return { success: false, error: error.message }

    revalidatePath("/routes")
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}
