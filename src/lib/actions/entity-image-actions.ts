"use server"

import { createAdminClient } from "@/utils/supabase/server"
import { getSession } from "@/lib/session"
import { getDriverSession } from "@/lib/auth-utils"
import { getImageMap } from "@/lib/gdrive/entity-images"
import { formatGoogleDriveImageUrl } from "@/lib/gdrive/utils"

export type EntityImageIndex = {
  drivers: Record<string, string>
  vehicles: Record<string, string>
  users: Record<string, string>
}

const EMPTY: EntityImageIndex = { drivers: {}, vehicles: {}, users: {} }

/**
 * ดัชนีรูปทั้งหมด (คนขับ→Driver_ID, รถ→Vehicle_Plate, ผู้ใช้→Username)
 * รวมจากคอลัมน์ Image_Url/Avatar_Url (ถ้ารัน SQL แล้ว) + map Google Drive ใน System_Settings
 * ทุกขั้นกลืน error → คืนเท่าที่หาได้ (ไม่มีรูป = ไม่มี key; UI แสดงตัวอักษรแทน)
 */
export async function getEntityImageIndex(): Promise<EntityImageIndex> {
  const [session, driverSession] = await Promise.all([getSession(), getDriverSession()])
  if (!session?.userId && !driverSession) return EMPTY

  const index: EntityImageIndex = { drivers: {}, vehicles: {}, users: {} }
  try {
    const map = await getImageMap()
    Object.assign(index.drivers, map.drivers)
    Object.assign(index.vehicles, map.vehicles)
    Object.assign(index.users, map.users)
  } catch { /* ignore */ }

  const supabase = createAdminClient()
  const pull = async (table: string, key: string, col: string, target: Record<string, string>) => {
    try {
      const { data, error } = await supabase.from(table).select(`${key}, ${col}`).not(col, "is", null)
      if (error || !data) return // คอลัมน์ยังไม่มี (ยังไม่รัน SQL) → ใช้ map อย่างเดียว
      for (const row of data as unknown as Record<string, string | null>[]) {
        const k = row[key]
        const v = row[col]
        if (k && v) target[String(k)] = v
      }
    } catch { /* ignore */ }
  }
  await Promise.all([
    pull("Master_Drivers", "Driver_ID", "Image_Url", index.drivers),
    pull("Master_Vehicles", "Vehicle_Plate", "Image_Url", index.vehicles),
    pull("Master_Users", "Username", "Avatar_Url", index.users),
  ])

  for (const group of [index.drivers, index.vehicles, index.users]) {
    for (const k of Object.keys(group)) group[k] = formatGoogleDriveImageUrl(group[k])
  }
  return index
}
