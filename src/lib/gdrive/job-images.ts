import "server-only"

import { createAdminClient } from "@/utils/supabase/server"
import { getImageMap } from "@/lib/gdrive/entity-images"
import { formatGoogleDriveImageUrl } from "@/lib/gdrive/utils"

// ไม่ใช่ server action (ไม่มี "use server") — เรียกได้จาก server component เท่านั้น
/** รูปคนขับ/รถ ของงานเดียว — ใช้กับหน้าสาธารณะ (/track) ที่ไม่มี session */
export async function getJobEntityImages(driverId?: string | null, plate?: string | null) {
  const out: { driver: string | null; vehicle: string | null } = { driver: null, vehicle: null }
  try {
    const supabase = createAdminClient()
    const map = await getImageMap().catch(() => null)
    if (driverId) {
      const { data } = await supabase.from("Master_Drivers").select("Image_Url").eq("Driver_ID", driverId).maybeSingle()
      out.driver = (data as { Image_Url?: string | null } | null)?.Image_Url || map?.drivers[driverId] || null
    }
    if (plate) {
      const { data } = await supabase.from("Master_Vehicles").select("Image_Url").eq("Vehicle_Plate", plate).maybeSingle()
      out.vehicle = (data as { Image_Url?: string | null } | null)?.Image_Url || map?.vehicles[plate] || null
    }
  } catch { /* ignore */ }
  return {
    driver: out.driver ? formatGoogleDriveImageUrl(out.driver) : null,
    vehicle: out.vehicle ? formatGoogleDriveImageUrl(out.vehicle) : null,
  }
}
