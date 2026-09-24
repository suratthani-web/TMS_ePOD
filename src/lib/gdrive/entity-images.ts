"use server"

import { createAdminClient } from "@/utils/supabase/server"
import { formatGoogleDriveImageUrl } from "./utils"

export type ImageMap = {
  drivers: Record<string, string>
  vehicles: Record<string, string>
  users: Record<string, string>
  folders?: {
    drivers?: string
    vehicles?: string
    users?: string
  }
}

const DEFAULT_MAP: ImageMap = {
  drivers: {},
  vehicles: {},
  users: {},
  folders: {},
}

/**
 * Retrieves the global Google Drive image mapping from System_Settings.
 */
export async function getImageMap(): Promise<ImageMap> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from("System_Settings")
      .select("value")
      .eq("key", "gdrive_image_map")
      .single()

    if (!data?.value) return DEFAULT_MAP
    const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value
    return {
      drivers: parsed.drivers || {},
      vehicles: parsed.vehicles || {},
      users: parsed.users || {},
      folders: parsed.folders || {},
    }
  } catch {
    return DEFAULT_MAP
  }
}

/**
 * Saves a single entity's photo URL (dual-saved to native table column and System_Settings fallback).
 */
export async function saveEntityImage(
  type: "driver" | "vehicle" | "user",
  id: string,
  rawUrl?: string | null
): Promise<{ success: boolean; message?: string }> {
  try {
    const formattedUrl = rawUrl ? formatGoogleDriveImageUrl(rawUrl) : ""
    const supabase = createAdminClient()

    // 1. Attempt to update native table column (if schema migration has been applied)
    try {
      if (type === "driver") {
        await supabase.from("Master_Drivers").update({ Image_Url: formattedUrl || null }).eq("Driver_ID", id)
      } else if (type === "vehicle") {
        await supabase.from("Master_Vehicles").update({ Image_Url: formattedUrl || null }).eq("Vehicle_Plate", id)
      } else if (type === "user") {
        await supabase.from("Master_Users").update({ Avatar_Url: formattedUrl || null }).eq("Username", id)
      }
    } catch {
      // Ignore column-missing errors; fallback below guarantees persistence
    }

    // 2. Persist in System_Settings image map
    const map = await getImageMap()
    if (formattedUrl) {
      if (type === "driver") map.drivers[id] = formattedUrl
      else if (type === "vehicle") map.vehicles[id] = formattedUrl
      else if (type === "user") map.users[id] = formattedUrl
    } else {
      if (type === "driver") delete map.drivers[id]
      else if (type === "vehicle") delete map.vehicles[id]
      else if (type === "user") delete map.users[id]
    }

    const { error: setErr } = await supabase
      .from("System_Settings")
      .upsert({
        key: "gdrive_image_map",
        value: JSON.stringify(map),
        description: "Google Drive synced image mappings for drivers, vehicles, and users",
      }, { onConflict: "key" })

    if (setErr) {
      return { success: false, message: setErr.message }
    }

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error saving entity image"
    return { success: false, message: msg }
  }
}

/**
 * Batch saves multiple entity photo mappings at once.
 */
export async function batchSaveEntityImages(
  mappings: {
    drivers?: Record<string, string>
    vehicles?: Record<string, string>
    users?: Record<string, string>
    folders?: { drivers?: string; vehicles?: string; users?: string }
  }
): Promise<{ success: boolean; updatedCount: number; message?: string }> {
  try {
    const supabase = createAdminClient()
    const map = await getImageMap()
    let count = 0

    // Drivers
    if (mappings.drivers) {
      for (const [id, url] of Object.entries(mappings.drivers)) {
        if (!url) continue
        const formatted = formatGoogleDriveImageUrl(url)
        map.drivers[id] = formatted
        count++
        try {
          await supabase.from("Master_Drivers").update({ Image_Url: formatted }).eq("Driver_ID", id)
        } catch { /* column fallback */ }
      }
    }

    // Vehicles
    if (mappings.vehicles) {
      for (const [plate, url] of Object.entries(mappings.vehicles)) {
        if (!url) continue
        const formatted = formatGoogleDriveImageUrl(url)
        map.vehicles[plate] = formatted
        count++
        try {
          await supabase.from("Master_Vehicles").update({ Image_Url: formatted }).eq("Vehicle_Plate", plate)
        } catch { /* column fallback */ }
      }
    }

    // Users
    if (mappings.users) {
      for (const [username, url] of Object.entries(mappings.users)) {
        if (!url) continue
        const formatted = formatGoogleDriveImageUrl(url)
        map.users[username] = formatted
        count++
        try {
          await supabase.from("Master_Users").update({ Avatar_Url: formatted }).eq("Username", username)
        } catch { /* column fallback */ }
      }
    }

    // Folders
    if (mappings.folders) {
      map.folders = { ...map.folders, ...mappings.folders }
    }

    await supabase
      .from("System_Settings")
      .upsert({
        key: "gdrive_image_map",
        value: JSON.stringify(map),
        description: "Google Drive synced image mappings for drivers, vehicles, and users",
      }, { onConflict: "key" })

    return { success: true, updatedCount: count }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error saving batch entity images"
    return { success: false, updatedCount: 0, message: msg }
  }
}
