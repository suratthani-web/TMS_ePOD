"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin, isAdmin } from "@/lib/permissions"
import { getBranches as _getBranches, getCurrentUserRole as _getCurrentUserRole } from './routes'

// Master_Locations = แหล่งข้อมูลสถานที่หลัก (single source)
// การเขียนจะถูก sync ไป Master_Routes อัตโนมัติผ่าน DB trigger
export type Location = {
  Location_ID?: string
  Name: string
  Lat: number | null
  Lon: number | null
  Phone: string | null
  Map_Link: string | null
  Address?: string | null
  Branch_ID: string | null
  Is_Incomplete?: boolean
  Created_At?: string
}

// re-use branch loader (wrap: "use server" อนุญาตให้ export เฉพาะ async function)
export async function getBranches() {
  return _getBranches()
}
export async function getCurrentUserRole() {
  return _getCurrentUserRole()
}

// Get all locations (pagination + search + branch isolation)
export async function getAllLocations(page?: number, limit?: number, query?: string, branchId?: string) {
  try {
    const isAdminUser = await isAdmin()
    const supabase = isAdminUser ? createAdminClient() : await createClient()

    const userBranchId = await getUserBranchId()
    const isSuper = await isSuperAdmin()

    // Resolve which branch (if any) constrains the query, honouring the
    // caller's branch selection for super admins and the user's own branch
    // otherwise. Non-super users without a branch see nothing.
    let branchFilter: string | null = null
    if (!isSuper) {
      if (userBranchId && userBranchId !== 'All') {
        branchFilter = userBranchId
      } else {
        return { data: [], count: 0 }
      }
    } else {
      const targetBranch = branchId || userBranchId
      if (targetBranch && targetBranch !== 'All') branchFilter = targetBranch
    }

    // Build a filtered query builder (search + branch) from scratch each call,
    // so paging can issue several independent requests.
    const buildQuery = () => {
      let q = supabase.from('Master_Locations').select('*', { count: 'exact' })
      if (query) q = q.or(`Name.ilike.%${query}%,Phone.ilike.%${query}%`)
      if (branchFilter) q = q.eq('Branch_ID', branchFilter)
      return q.order('Name', { ascending: true })
    }

    // Explicit page/limit → single ranged page (kept for callers that paginate).
    if (page && limit) {
      const from = (page - 1) * limit
      const { data, error, count } = await buildQuery().range(from, from + limit - 1)
      if (error) return { data: [], count: 0 }
      return { data: data || [], count: count || 0 }
    }

    // No pagination requested → return ALL matching rows. Supabase caps a single
    // response at 1000 rows, so page through in chunks until exhausted (711+
    // locations today would otherwise be silently truncated).
    const CHUNK = 1000
    const all: Location[] = []
    let total = 0
    for (let from = 0; ; from += CHUNK) {
      const { data, error, count } = await buildQuery().range(from, from + CHUNK - 1)
      if (error) return { data: all, count: all.length }
      total = count || total
      if (!data || data.length === 0) break
      all.push(...(data as Location[]))
      if (data.length < CHUNK) break
    }
    return { data: all, count: total || all.length }
  } catch {
    return { data: [], count: 0 }
  }
}

// Create location
export async function createLocation(loc: Partial<Location>) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? createAdminClient() : await createClient()

    if (!loc.Name || !loc.Name.trim()) {
      return { success: false, error: "Location Name is required" }
    }

    const userBranch = await getUserBranchId()
    const branchId = (isSuper && loc.Branch_ID && loc.Branch_ID !== 'All')
      ? loc.Branch_ID
      : (userBranch !== 'All' ? userBranch : 'HQ')

    const { data, error } = await supabase
      .from('Master_Locations')
      .insert({
        Name: loc.Name.trim(),
        Lat: loc.Lat ?? null,
        Lon: loc.Lon ?? null,
        Phone: loc.Phone ?? null,
        Map_Link: loc.Map_Link ?? null,
        Address: loc.Address ?? null,
        Branch_ID: branchId,
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    return { success: true, data }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Update location by Location_ID.
// รองรับการแก้ "ชื่อสถานที่" ได้แล้ว — แต่ประวัติงานเก่า (Jobs_Main.Origin/Dest/Route_Name)
// เก็บชื่อเป็น text copy จึงยังคงชื่อเดิมไว้ตามประวัติ ไม่ถูกเปลี่ยนตาม (โดยตั้งใจ).
// ถ้าต้องการให้ประวัติเก่าเปลี่ยนชื่อตามด้วย ใช้ propagateLocationRename แยกต่างหาก.
export async function updateLocation(locationId: string, loc: Partial<Location>) {
  try {
    const isAdminUser = await isAdmin()
    const supabase = isAdminUser ? createAdminClient() : await createClient()

    const patch: Record<string, unknown> = {
      Lat: loc.Lat ?? null,
      Lon: loc.Lon ?? null,
      Phone: loc.Phone ?? null,
      Map_Link: loc.Map_Link ?? null,
      Address: loc.Address ?? null,
    }
    // อนุญาตแก้ชื่อได้ (ถ้าส่งค่ามาและไม่ว่าง). ระวังชนกับ unique (Name, Branch_ID) —
    // ถ้าซ้ำ Supabase จะคืน error ให้ UI แจ้งเตือน.
    if (typeof loc.Name === 'string' && loc.Name.trim()) patch.Name = loc.Name.trim()
    if (loc.Branch_ID) patch.Branch_ID = loc.Branch_ID

    const { data, error } = await supabase
      .from('Master_Locations')
      .update(patch)
      .eq('Location_ID', locationId)
      .select()
      .single()

    if (error) {
      // 23505 = unique_violation (ชื่อ+สาขาซ้ำกับที่มีอยู่)
      const dup = (error as { code?: string }).code === '23505'
      return { success: false, error: dup ? 'มีสถานที่ชื่อนี้ในสาขาแล้ว กรุณาใช้ชื่ออื่น' : error.message }
    }
    return { success: true, data }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// (ทางเลือก) เปลี่ยนชื่อสถานที่ในประวัติงานเก่าให้ตรงกับชื่อใหม่ด้วย.
// เรียกเฉพาะเมื่อแอดมินยืนยันว่าต้องการให้ประวัติเปลี่ยนตาม — อัปเดต
// Origin_Location / Dest_Location ที่ match ชื่อเดิมแบบตรงตัว.
// หมายเหตุ: Route_Name (เส้นทางหลายจุด "A → B") ไม่แตะ เพื่อกันพังสตริง multi-drop.
export async function propagateLocationRename(oldName: string, newName: string, branchId?: string | null) {
  try {
    const isAdminUser = await isAdmin()
    if (!isAdminUser) return { success: false, error: 'Unauthorized' }
    const supabase = createAdminClient()
    const oldTrim = (oldName || '').trim()
    const newTrim = (newName || '').trim()
    if (!oldTrim || !newTrim || oldTrim === newTrim) return { success: true, updated: 0 }

    let originQ = supabase.from('Jobs_Main').update({ Origin_Location: newTrim }).eq('Origin_Location', oldTrim)
    let destQ = supabase.from('Jobs_Main').update({ Dest_Location: newTrim }).eq('Dest_Location', oldTrim)
    if (branchId && branchId !== 'All') {
      originQ = originQ.eq('Branch_ID', branchId)
      destQ = destQ.eq('Branch_ID', branchId)
    }
    const [o, d] = await Promise.all([originQ.select('Job_ID'), destQ.select('Job_ID')])
    const updated = (o.data?.length || 0) + (d.data?.length || 0)
    return { success: true, updated }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Delete location by Location_ID
export async function deleteLocation(locationId: string) {
  try {
    const isAdminUser = await isAdmin()
    const supabase = isAdminUser ? createAdminClient() : await createClient()
    const { error } = await supabase
      .from('Master_Locations')
      .delete()
      .eq('Location_ID', locationId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Bulk import locations (upsert by Name+Branch_ID)
export async function createBulkLocations(rows: Record<string, unknown>[]) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? createAdminClient() : await createClient()
    const currentUserBranch = await getUserBranchId()

    const { data: branches } = await supabase.from('Master_Branches').select('Branch_ID, Branch_Name')
    const branchMap = new Map<string, string>()
    if (branches) {
      branches.forEach((b: { Branch_ID: string; Branch_Name: string }) => {
        branchMap.set(String(b.Branch_Name).trim(), b.Branch_ID)
        branchMap.set(b.Branch_ID, b.Branch_ID)
      })
    }

    const getValue = (row: Record<string, unknown>, keys: string[]) => {
      const rowKeys = Object.keys(row)
      for (const key of keys) {
        const fk = rowKeys.find(k => k.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase().replace(/\s+/g, '_'))
        if (fk && row[fk] !== undefined && row[fk] !== null && String(row[fk]).trim() !== '') return row[fk]
      }
      return undefined
    }

    const prepared = rows.map(r => {
      const name = String(getValue(r, ['name', 'location_name', 'ชื่อสถานที่', 'สถานที่', 'route_name', 'origin']) || '').trim()
      if (!name) return null
      const rawBranch = getValue(r, ['branch_id', 'branch', 'สาขา', 'รหัสสาขา'])
      let branchId = (currentUserBranch && currentUserBranch !== 'All') ? currentUserBranch : 'HQ'
      if (rawBranch) {
        const key = String(rawBranch).trim()
        if (branchMap.has(key)) branchId = branchMap.get(key)!
        else {
          const found = branches?.find((b: { Branch_ID: string; Branch_Name: string }) => {
            const bn = String(b.Branch_Name || '')
            return bn && (bn.includes(key) || key.includes(bn))
          })
          if (found) branchId = found.Branch_ID
        }
      }
      const lat = getValue(r, ['latitude', 'ละติจูด', 'lat', 'origin_lat'])
      const lon = getValue(r, ['longitude', 'ลองจิจูด', 'ลองติจูด', 'lon', 'lng', 'origin_lon'])
      return {
        Name: name,
        Lat: lat ? parseFloat(String(lat)) : null,
        Lon: lon ? parseFloat(String(lon)) : null,
        Phone: (getValue(r, ['phone', 'เบอร์ติดต่อ', 'เบอร์โทร', 'origin_phone']) as string) || null,
        Map_Link: (getValue(r, ['map_link', 'ลิงก์แผนที่', 'แผนที่', 'map_link_origin']) as string) || null,
        Branch_ID: branchId,
      }
    }).filter(Boolean) as Location[]

    if (prepared.length === 0) return { success: false, message: "ไม่พบข้อมูลที่ถูกต้อง (ต้องมีชื่อสถานที่)" }

    // de-dup by Name+Branch within the batch
    const uniq = new Map<string, Location>()
    prepared.forEach(p => uniq.set(p.Name.trim() + '||' + p.Branch_ID, { ...p, Name: p.Name.trim() }))
    const list = Array.from(uniq.values())

    const { error } = await supabase
      .from('Master_Locations')
      .upsert(list, { onConflict: 'Name,Branch_ID', ignoreDuplicates: false })

    if (error) return { success: false, message: `นำเข้าไม่สำเร็จ: ${error.message}` }
    return { success: true, message: `นำเข้าสำเร็จ ${list.length} สถานที่` }
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : String(e) }
  }
}

// ตัวคั่นเส้นทางหลายจุด (multi-drop) ที่ระบบใช้ join เช่น "A → B → C"
// แยกเฉพาะลูกศร ไม่แยกที่ขีดกลาง "-" เพราะชื่อจริงมี เช่น DC-LOTUS, DC-Big-C
const ROUTE_STOP_SEPARATOR = /\s*(?:→|➔|➜|⟶|=>|->|>)\s*/g

// แตกสตริงเส้นทางหลายจุดออกเป็นชื่อสถานที่รายจุด + ตัดซ้ำ (case-insensitive)
function splitStopNames(raw: string | null | undefined): string[] {
  if (!raw) return []
  const parts = String(raw).split(ROUTE_STOP_SEPARATOR).map(s => s.trim()).filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const key = p.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

// สร้าง Master_Locations แบบ "ค้างเติมพิกัด" ให้ชื่อสถานที่ที่ยังไม่มีในระบบ
// ใช้ตอนสร้างงาน/นำเข้างานเส้นทางใหม่เร่งด่วน — อนุโลมให้ผ่าน แล้ว flag ไว้ให้แอดมินตามเติม
// รับได้ทั้งชื่อจุดเดียวและสตริงหลายจุด "A → B → C" — จะถูกแตกเป็นรายจุด + ตัดซ้ำก่อนบันทึก
// non-blocking: จับ error ภายใน ไม่ throw ออกไปกระทบการสร้างงาน
// คืนรายชื่อที่เพิ่งสร้างใหม่ (incomplete)
export async function ensureJobLocations(
  names: (string | null | undefined)[],
  branchId: string | null
): Promise<string[]> {
  try {
    const supabase = createAdminClient()
    // แตกทุก input เป็นรายจุด (กันสตริงหลายจุดถูกบันทึกเป็นสถานที่เดียว) แล้ว dedupe รวม
    const expanded = names.flatMap(n => splitStopNames(n))
    const seen = new Set<string>()
    const clean: string[] = []
    for (const p of expanded) {
      const key = p.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      clean.push(p)
    }
    if (clean.length === 0) return []

    const { data: existing } = await supabase.from('Master_Locations').select('Name')
    const existLower = (existing || []).map((l: { Name: string | null }) => (l.Name || '').trim().toLowerCase())

    const created: string[] = []
    for (const name of clean) {
      const lower = name.toLowerCase()
      // มีชื่อตรงอยู่แล้ว (ไม่สนสาขา เพื่อเลี่ยง unique conflict + ใช้ข้อมูลเดิมได้)
      if (existLower.includes(lower)) continue

      // Geocode immediately so the new location is created WITH coordinates
      // (ESG forward-correctness — Fix 2). Best-effort: if geocoding fails the
      // row is still created coord-less and surfaced to admins to backfill.
      let lat: number | null = null
      let lon: number | null = null
      try {
        const { geocodeAddress } = await import('@/lib/ai/geocoding')
        const geo = await geocodeAddress(name)
        if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) {
          lat = geo.lat
          lon = geo.lng
        }
      } catch { /* geocoder unavailable → leave coords null */ }

      const { error } = await supabase
        .from('Master_Locations')
        .insert({ Name: name, Branch_ID: branchId || 'HQ', Lat: lat, Lon: lon })
      if (!error) { created.push(name); existLower.push(lower) }
    }
    return created
  } catch {
    return []
  }
}

// จับคู่ "คีย์เวิร์ด" ที่ลูกค้าพิมพ์ → ชื่อสถานที่มาตรฐานในระบบ (Master_Locations).
// ใช้ตอนลูกค้ากดสร้างงาน: ลูกค้าพิมพ์ปลายทางเอง แล้วระบบ normalize ให้ตรงกับเส้นทางจริง
// เพื่อให้ได้พิกัด/ระยะทาง/รายงานที่สะอาด. คืน Map ของ input(เดิม) → canonical(ชื่อในระบบ)
// เฉพาะตัวที่จับคู่ได้; ตัวที่ไม่เจอจะไม่อยู่ใน Map (ให้ผู้เรียกใช้ข้อความเดิม).
// กติกา: ตรงเป๊ะ (ไม่สนตัวพิมพ์) > ชื่อในระบบมีคำที่พิมพ์เป็นส่วนหนึ่ง > คำที่พิมพ์คลุมชื่อในระบบ.
export async function resolveLocationKeywords(
  inputs: (string | null | undefined)[],
  branchId?: string | null
): Promise<Record<string, string>> {
  try {
    const wanted = inputs.map(s => (s || '').trim()).filter(Boolean)
    if (wanted.length === 0) return {}
    const supabase = createAdminClient()

    // ดึงชื่อสถานที่ของสาขานี้ + ที่ไม่ระบุสาขา (global) มาเป็น candidate
    let q = supabase.from('Master_Locations').select('Name, Branch_ID').not('Name', 'is', null)
    const { data } = await q
    const candidates = (data || [])
      .filter((r: { Name: string | null; Branch_ID: string | null }) =>
        !branchId || branchId === 'All' || !r.Branch_ID || r.Branch_ID === branchId)
      .map((r: { Name: string | null }) => (r.Name || '').trim())
      .filter(Boolean)

    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
    const byNorm = new Map<string, string>()
    for (const c of candidates) { const n = norm(c); if (!byNorm.has(n)) byNorm.set(n, c) }

    const out: Record<string, string> = {}
    for (const input of wanted) {
      const ni = norm(input)
      // 1) ตรงเป๊ะ
      if (byNorm.has(ni)) { out[input] = byNorm.get(ni)!; continue }
      // 2/3) จับคู่บางส่วน — เลือกชื่อในระบบที่ยาวสุด (เฉพาะเจาะจงสุด)
      let best: string | null = null
      for (const c of candidates) {
        const nc = norm(c)
        if (nc.includes(ni) || ni.includes(nc)) {
          if (!best || c.length > best.length) best = c
        }
      }
      if (best) out[input] = best
    }
    return out
  } catch {
    return {}
  }
}

// รายชื่อสถานที่ไม่ซ้ำ (สำหรับ autocomplete)
export async function getUniqueLocationNames() {
  try {
    const isAdminUser = await isAdmin()
    const supabase = isAdminUser ? createAdminClient() : await createClient()
    const branchId = await getUserBranchId()
    const isSuper = await isSuperAdmin()

    let q = supabase.from('Master_Locations').select('Name').not('Name', 'is', null)
    if (branchId && branchId !== 'All' && !isSuper) q = q.eq('Branch_ID', branchId)

    const { data } = await q
    const set = new Set<string>()
    ;(data || []).forEach((r: { Name: string | null }) => { if (r.Name) set.add(r.Name.trim()) })
    return Array.from(set).sort()
  } catch {
    return []
  }
}
