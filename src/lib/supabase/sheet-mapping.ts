"use server"

import { createClient, createAdminClient } from "@/utils/supabase/server"
import { isSuperAdmin, isAdmin } from "@/lib/permissions"

export interface SheetMapEntry {
  id: string
  label: string
  keywords: string          // comma-separated keywords matched against Customer_ID/Name
  masterCode: number | null // รหัสลูกค้าในชีต MASTER
  sheetTab: string | null   // ชื่อแท็บปลายทาง (null = ใช้ fallback)
  color: string | null      // โทนสีการ์ดแดชบอร์ด
  sortOrder: number         // ลำดับการจับคู่ (น้อยมาก่อน)
  isActive: boolean
}

type Row = {
  Map_ID: string
  Label: string
  Keywords: string | null
  Master_Code: number | null
  Sheet_Tab: string | null
  Color: string | null
  Sort_Order: number | null
  Is_Active: boolean
}

const toEntry = (r: Row): SheetMapEntry => ({
  id: r.Map_ID,
  label: r.Label,
  keywords: r.Keywords || "",
  masterCode: r.Master_Code ?? null,
  sheetTab: r.Sheet_Tab ?? null,
  color: r.Color ?? null,
  sortOrder: r.Sort_Order ?? 100,
  isActive: r.Is_Active,
})

// Full list for the settings UI (admin-gated).
export async function getSheetMappings(): Promise<SheetMapEntry[]> {
  const supabase = (await isSuperAdmin()) || (await isAdmin()) ? await createAdminClient() : await createClient()
  const { data, error } = await supabase
    .from("Customer_Sheet_Map")
    .select("*")
    .order("Sort_Order", { ascending: true })
    .order("Created_At", { ascending: true })
  if (error || !data) return []
  return (data as Row[]).map(toEntry)
}

// Active mappings for the sync engine — server-to-server (no user session needed).
// Returns [] on any error so callers fall back to their hardcoded defaults.
export async function getActiveSheetMappings(): Promise<SheetMapEntry[]> {
  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from("Customer_Sheet_Map")
      .select("*")
      .eq("Is_Active", true)
      .order("Sort_Order", { ascending: true })
    if (error || !data) return []
    return (data as Row[]).map(toEntry)
  } catch {
    return []
  }
}

export async function addSheetMapping(entry: Omit<SheetMapEntry, "id">) {
  const supabase = (await isSuperAdmin()) || (await isAdmin()) ? await createAdminClient() : await createClient()
  const { error } = await supabase.from("Customer_Sheet_Map").insert({
    Label: entry.label,
    Keywords: entry.keywords,
    Master_Code: entry.masterCode,
    Sheet_Tab: entry.sheetTab,
    Color: entry.color,
    Sort_Order: entry.sortOrder,
    Is_Active: entry.isActive,
  })
  return { success: !error, error }
}

export async function updateSheetMapping(id: string, updates: Partial<Omit<SheetMapEntry, "id">>) {
  const supabase = (await isSuperAdmin()) || (await isAdmin()) ? await createAdminClient() : await createClient()
  const dbUpdates: Record<string, unknown> = {}
  if (updates.label !== undefined) dbUpdates.Label = updates.label
  if (updates.keywords !== undefined) dbUpdates.Keywords = updates.keywords
  if (updates.masterCode !== undefined) dbUpdates.Master_Code = updates.masterCode
  if (updates.sheetTab !== undefined) dbUpdates.Sheet_Tab = updates.sheetTab
  if (updates.color !== undefined) dbUpdates.Color = updates.color
  if (updates.sortOrder !== undefined) dbUpdates.Sort_Order = updates.sortOrder
  if (updates.isActive !== undefined) dbUpdates.Is_Active = updates.isActive
  const { error } = await supabase.from("Customer_Sheet_Map").update(dbUpdates).eq("Map_ID", id)
  return { success: !error, error }
}

export async function deleteSheetMapping(id: string) {
  const supabase = (await isSuperAdmin()) || (await isAdmin()) ? await createAdminClient() : await createClient()
  const { error } = await supabase.from("Customer_Sheet_Map").delete().eq("Map_ID", id)
  return { success: !error, error }
}
