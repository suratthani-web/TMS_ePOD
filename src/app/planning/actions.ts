'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

import { getAllDriversFromTable } from '@/lib/supabase/drivers'
import { todayTH } from '@/lib/utils/date-th'
import { getAllVehiclesFromTable } from '@/lib/supabase/vehicles'
import { logActivity } from '@/lib/supabase/logs'
import { getUserBranchId, getFixedUserBranchId } from '@/lib/permissions'
import { notifyDriverNewJob, notifyMarketplaceNewJob, notifyDriverNewBatch } from '@/lib/actions/push-actions'
import { getCustomerId, getUserId, isCustomer, isSuperAdmin, isAdmin } from '@/lib/permissions'
import { sanitizeJobData } from '@/lib/supabase/utils'
import { getFuelPriceNumber, getSuggestedRate } from '@/lib/actions/fuel-actions'
import { optimizeRoute, RoutePoint } from '@/lib/ai/route-optimizer'
import { appendJobToMaster } from '@/lib/actions/master-sheet-sync'
import { getSession } from '@/lib/session'
import { resolveDistanceKm } from '@/lib/ai/distance'
import { resolvePcgPrice, PCG_CUSTOMER_ID } from '@/lib/pricing/pcg-rate-card'
import { getJobById } from '@/lib/supabase/jobs'

export type JobFormData = {
  Job_ID: string
  Branch_ID?: string | null
  Plan_Date?: string | null
  Pickup_Date?: string | null
  Delivery_Date?: string | null
  Customer_ID?: string | null
  Customer_Name?: string | null
  Route_Name?: string | null
  Driver_ID?: string | null
  Driver_Name?: string | null
  Vehicle_Plate?: string | null
  Vehicle_Type?: string
  Job_Status?: string | null
  Cargo_Type?: string
  Notes?: string
  Price_Cust_Total?: number | string | null
  Cost_Driver_Total?: number | string | null
  original_origins_json?: string
  original_destinations_json?: string
  extra_costs_json?: string
  Sub_ID?: string | null
  Show_Price_To_Driver?: boolean
  Weight_Kg?: number | null
  Volume_Cbm?: number | null
  Origin_Location?: string | null
  Dest_Location?: string | null
  Est_Distance_KM?: number | null
  Pickup_Lat?: number | null
  Pickup_Lon?: number | null
  Delivery_Lat?: number | null
  Delivery_Lon?: number | null
  Ref_No?: string | null
  Round?: string | number | null
  Loaded_Qty?: number | string | null
  Price_Per_Unit?: number | null
  // Container Fields
  job_type?: 'normal' | 'container' | null
  chassis_plate?: string | null
  container_no?: string | null
  seal_no?: string | null
  container_size?: string | null
  shipping_line?: string | null
  vessel_voyage?: string | null
  lfd_demurrage?: string | null
  lfd_detention?: string | null
  target_temperature?: number | string | null
  booking_no?: string | null
  container_subtype?: string | null
  pickup_empty_date?: string | null
  port_closing_datetime?: string | null
}

const parseIfString = (val: string | undefined | null) => {
  if (!val) return null
  if (typeof val !== 'string') return val
  try { return JSON.parse(val) } catch { return val }
}

import { calculateJobPrice } from "@/services/pricing-engine"

// The ordered drops for a job (multi-drop JSON first, else Dest_Location),
// carrying coordinates so PCG pricing can reverse-geocode a name that has no อ./จ.
function jobDrops(data: JobFormData): { name?: string; lat?: number | string | null; lng?: number | string | null }[] {
  const parsed = parseIfString(data.original_destinations_json as string)
  if (Array.isArray(parsed)) {
    const drops = parsed
      .map(p => {
        const o = p as { name?: unknown; lat?: unknown; lng?: unknown }
        return { name: String(o?.name ?? '').trim(), lat: (o?.lat as number | string | null) ?? null, lng: (o?.lng as number | string | null) ?? null }
      })
      .filter(d => d.name || d.lat)
    if (drops.length > 0) return drops
  }
  return data.Dest_Location
    ? [{ name: String(data.Dest_Location), lat: data.Delivery_Lat ?? null, lng: data.Delivery_Lon ?? null }]
    : []
}

// PCG customer price = rate of the farthest drop at the day's diesel band.
// Only fills when the customer is PCG and no price was entered; a lookup miss
// (unknown fuel price / unmatched destination) leaves the price for manual entry.
async function applyPcgAutoPrice(data: JobFormData): Promise<void> {
  try {
    if (String(data.Customer_ID || '') !== PCG_CUSTOMER_ID) return
    if (Number(data.Price_Cust_Total) > 0) return
    const result = await resolvePcgPrice(jobDrops(data), data.Plan_Date as string | undefined)
    if (result) data.Price_Cust_Total = result.price
  } catch (e) {
    console.warn('[createJob] PCG auto-price failed:', e instanceof Error ? e.message : e)
  }
}

export async function createJob(data: JobFormData) {
  const supabase = createAdminClient()

  // Data-quality guard (server-side, defense in depth): delivery date must not
  // precede pickup date. Dates are 'YYYY-MM-DD' so string compare is chronological.
  if (data.Plan_Date && data.Delivery_Date && data.Delivery_Date < data.Plan_Date) {
    return { success: false, message: `วันที่ส่ง (${data.Delivery_Date}) ก่อนวันที่รับ (${data.Plan_Date}) — ตรวจสอบวันรับ/วันส่ง` }
  }

  // Auto-assign Branch_ID if missing
  if (!data.Branch_ID || data.Branch_ID === 'All') {
    const fixedBranchId = await getFixedUserBranchId()
    if (fixedBranchId && fixedBranchId !== 'All') {
      data.Branch_ID = fixedBranchId
    } else {
      const userBranchId = await getUserBranchId()
      if (userBranchId && userBranchId !== 'All') {
        data.Branch_ID = userBranchId
      }
    }
  }

  // Get Driver Name and Sub_ID based on Driver_ID
  let driverName = data.Driver_Name || ''
  let subId = data.Sub_ID || null
  
  if (data.Driver_ID) {
    const { data: driver, error: driverErr } = await supabase
      .from('Master_Drivers')
      .select('Driver_Name, Sub_ID, Show_Price_Default')
      .eq('Driver_ID', data.Driver_ID)
      .single()
    if (!driverErr && driver) {
      if (!driverName) driverName = driver.Driver_Name
      if (!subId) subId = driver.Sub_ID || null
      if (data.Show_Price_To_Driver === undefined) {
         data.Show_Price_To_Driver = driver.Show_Price_Default ?? true
      }
    } else if (driverErr) {
      console.warn('[createJob] Driver lookup failed:', driverErr.message)
    }
  }

  // If subId still null, try looking up via Vehicle_Plate
  if (!subId && data.Vehicle_Plate) {
    const { data: vehicle, error: vehicleErr } = await supabase
      .from('Master_Vehicles')
      .select('Sub_ID')
      .eq('Vehicle_Plate', data.Vehicle_Plate)
      .single()
    if (!vehicleErr && vehicle) subId = vehicle.Sub_ID || null
    else if (vehicleErr) console.warn('[createJob] Vehicle lookup failed:', vehicleErr.message)
  }

  // Get Pricing from Engine
  const pricing = await calculateJobPrice({
      ...data,
      Driver_Name: driverName,
      Sub_ID: subId
  })

  // Fill coordinates from the location master, then ensure distance is populated
  // server-side (OSRM + Haversine fallback) so it never depends on the flaky
  // client-side calculation completing before save.
  await hydrateJobCoordinates(data)
  data.Est_Distance_KM = await resolveJobDistance(data)

  // PCG customer: auto-fill customer price from the PCG rate card (rate of the
  // farthest drop at the day's diesel band) when no price was entered.
  await applyPcgAutoPrice(data)

  // Attempt 1
  const payload = buildInsertPayload(data, driverName, subId, pricing.unitPrice)
  const { error: error1 } = await supabase.from('Jobs_Main').insert(payload)
  
  if (!error1) {
      // Save Container Data if applicable — rollback job if container save fails
      const containerResult = await handleContainerData(supabase, data.Job_ID, data, true)
      if (!containerResult.success) {
        return { success: false, message: `ข้อมูลตู้บันทึกไม่สำเร็จ งานถูกยกเลิก: ${containerResult.error}` }
      }

      // Send notifications - ONLY if NOT a draft
      if (data.Job_Status !== 'Draft') {
          if (data.Driver_ID) {
              try { await notifyDriverNewJob(data.Driver_ID, data.Job_ID, data.Customer_Name || 'ไม่ระบุ') } catch (e) { console.error(e) }
          } else {
              try { await notifyMarketplaceNewJob(data.Job_ID, data.Customer_Name || 'ไม่ระบุ') } catch (e) { console.error(e) }
          }
      }

      // non-blocking: เส้นทางใหม่ที่ยังไม่มีในระบบ → บันทึกเป็น "สถานที่ค้างเติมพิกัด" (แจ้งเตือนแอดมินผ่าน getAdminAlerts)
      try {
        const { ensureJobLocations } = await import('@/lib/supabase/locations')
        await ensureJobLocations([data.Origin_Location, data.Dest_Location], data.Branch_ID ?? null)
      } catch { /* ignore */ }

      revalidatePath('/planning')

      return { success: true, message: 'Job created successfully' }
  }

  // If duplicate key (23505), try regenerating ID once
  if (error1.code === '23505') {
      const newId = `${data.Job_ID}-${Math.floor(Math.random() * 1000)}`
      const { error: error2 } = await supabase.from('Jobs_Main').insert(buildInsertPayload({ ...data, Job_ID: newId }, driverName, subId, pricing.unitPrice))
      
      if (!error2) {
          const containerResult2 = await handleContainerData(supabase, newId, data, true)
          if (!containerResult2.success) {
            return { success: false, message: `ข้อมูลตู้บันทึกไม่สำเร็จ งานถูกยกเลิก: ${containerResult2.error}` }
          }

          if (data.Job_Status !== 'Draft') {
              if (data.Driver_ID) {
                  try { await notifyDriverNewJob(data.Driver_ID, newId, data.Customer_Name || 'ไม่ระบุ') } catch (e) { console.error(e) }
              } else {
                  try { await notifyMarketplaceNewJob(newId, data.Customer_Name || 'ไม่ระบุ') } catch (e) { console.error(e) }
              }
          }

          try {
            const { ensureJobLocations } = await import('@/lib/supabase/locations')
            await ensureJobLocations([data.Origin_Location, data.Dest_Location], data.Branch_ID ?? null)
          } catch { /* ignore */ }

          revalidatePath('/planning')
          revalidatePath('/dashboard')
          revalidatePath('/jobs/history')
          return { success: true, message: `Job created with new ID: ${newId}` }
      }
      return { success: false, message: `Failed to create job (Duplicate ID): ${error2.message}` }
  }

  return { success: false, message: `Failed to create job: ${error1.message}` }
}


const stringifyIfObject = (val: unknown) => {
  if (!val) return null
  if (typeof val === 'string') return val
  try { return JSON.stringify(val) } catch { return String(val) }
}

function buildInsertPayload(data: JobFormData, driverName: string, subId: string | null, unitPrice: number = 0) {
  let custTotal = Number(data.Price_Cust_Total) || 0
  
  // Auto-calculate if total is 0 but we have quantity and unit price
  if (custTotal === 0 && unitPrice > 0) {
      const qty = Number(data.Loaded_Qty || data.Weight_Kg || data.Volume_Cbm || 0)
      if (qty > 0) {
          custTotal = Number((qty * unitPrice).toFixed(2))
      }
  }

  const parsedDests = parseIfString(data.original_destinations_json as string)
  const totalDrop = Array.isArray(parsedDests) && parsedDests.length > 0
    ? parsedDests.length
    : (data.original_destinations_json ? 1 : 1)

  return {
      Job_ID: data.Job_ID,
      Plan_Date: data.Plan_Date,
      Delivery_Date: data.Delivery_Date,
      Customer_ID: data.Customer_ID,
      Customer_Name: data.Customer_Name,
      Route_Name: data.Route_Name,
      Driver_ID: data.Driver_ID,
      Driver_Name: driverName,
      Vehicle_Plate: data.Vehicle_Plate,
      Vehicle_Type: data.Vehicle_Type,
      Job_Status: data.Job_Status || 'New',
      Cargo_Type: data.Cargo_Type,
      Notes: data.Notes,
      Price_Cust_Total: custTotal,
      Cost_Driver_Total: data.Cost_Driver_Total || 0,
      original_origins_json: stringifyIfObject(data.original_origins_json),
      original_destinations_json: stringifyIfObject(data.original_destinations_json),
      extra_costs_json: stringifyIfObject(data.extra_costs_json),
      Sub_ID: subId,
      Show_Price_To_Driver: data.Show_Price_To_Driver ?? true,
      Weight_Kg: data.Weight_Kg || 0,
      Volume_Cbm: data.Volume_Cbm || 0,
      Origin_Location: data.Origin_Location || null,
      Dest_Location: data.Dest_Location || null,
      Est_Distance_KM: data.Est_Distance_KM || 0,
      Pickup_Lat: data.Pickup_Lat || null,
      Pickup_Lon: data.Pickup_Lon || null,
      Delivery_Lat: data.Delivery_Lat || null,
      Delivery_Lon: data.Delivery_Lon || null,
      Branch_ID: data.Branch_ID || null,
      Total_Drop: totalDrop,
      Loaded_Qty: Number(data.Loaded_Qty) || 0,
      Created_At: new Date().toISOString(),
      job_type: data.job_type || 'normal',
      chassis_plate: data.chassis_plate || null
  }
}

/**
 * Fill in a job's coordinates from the location master before distance is
 * resolved (ESG forward-correctness — Phase 1, Fix 1).
 *
 * The problem: jobs were saved with a location NAME but null Pickup/Delivery
 * lat-lon, even though Master_Locations already holds coordinates for that name.
 * Those coord-less jobs drop out of the ESG carbon calculation. Since the master
 * is fully geocoded, a name → coordinate lookup at creation/import time recovers
 * the vast majority of them.
 *
 * Mutates `data` in place: fills Pickup_Lat/Lon and Delivery_Lat/Lon when
 * missing, and back-fills any missing lat/lng inside the multi-drop JSON arrays.
 * Best-effort and non-throwing — a lookup failure must never block job save.
 */
async function hydrateJobCoordinates(data: Partial<JobFormData>): Promise<void> {
  try {
    const hasCoord = (lat: unknown, lon: unknown) =>
      Number(lat) !== 0 && !Number.isNaN(Number(lat)) &&
      Number(lon) !== 0 && !Number.isNaN(Number(lon))

    // Collect every location name that still needs coordinates.
    const wanted = new Set<string>()
    const addName = (n: unknown) => {
      const name = String(n ?? '').trim()
      if (name) wanted.add(name)
    }

    const pickupMissing = !hasCoord(data.Pickup_Lat, data.Pickup_Lon)
    const deliveryMissing = !hasCoord(data.Delivery_Lat, data.Delivery_Lon)
    if (pickupMissing) addName(data.Origin_Location)
    if (deliveryMissing) addName(data.Dest_Location)

    const origins = parseIfString(data.original_origins_json as string)
    const dests = parseIfString(data.original_destinations_json as string)
    const collectJsonNames = (arr: unknown) => {
      if (!Array.isArray(arr)) return
      for (const p of arr) {
        const o = p as { name?: unknown; lat?: unknown; lng?: unknown }
        if (!hasCoord(o?.lat, o?.lng)) addName(o?.name)
      }
    }
    collectJsonNames(origins)
    collectJsonNames(dests)

    if (wanted.size === 0) return

    // One batch lookup, matched case-insensitively.
    const supabase = createAdminClient()
    const { data: locs } = await supabase
      .from('Master_Locations')
      .select('Name, Lat, Lon')
      .in('Name', Array.from(wanted))

    const byName = new Map<string, { lat: number; lon: number }>()
    for (const l of locs || []) {
      const key = String(l.Name || '').trim().toLowerCase()
      if (key && hasCoord(l.Lat, l.Lon)) byName.set(key, { lat: Number(l.Lat), lon: Number(l.Lon) })
    }
    if (byName.size === 0) return

    const lookup = (n: unknown) => byName.get(String(n ?? '').trim().toLowerCase())

    // Single-leg Pickup/Delivery
    if (pickupMissing) {
      const hit = lookup(data.Origin_Location)
      if (hit) { data.Pickup_Lat = hit.lat; data.Pickup_Lon = hit.lon }
    }
    if (deliveryMissing) {
      const hit = lookup(data.Dest_Location)
      if (hit) { data.Delivery_Lat = hit.lat; data.Delivery_Lon = hit.lon }
    }

    // Multi-drop JSON arrays — back-fill missing coords by point name.
    const fillArray = (arr: unknown): boolean => {
      if (!Array.isArray(arr)) return false
      let changed = false
      for (const p of arr) {
        const o = p as { name?: unknown; lat?: unknown; lng?: unknown }
        if (!hasCoord(o?.lat, o?.lng)) {
          const hit = lookup(o?.name)
          if (hit) { o.lat = hit.lat; o.lng = hit.lon; changed = true }
        }
      }
      return changed
    }
    if (fillArray(origins)) data.original_origins_json = origins
    if (fillArray(dests)) data.original_destinations_json = dests
  } catch (err) {
    console.warn('[hydrateJobCoordinates] non-fatal:', err instanceof Error ? err.message : err)
  }
}

/**
 * Server-side distance resolver — single source of truth for BOTH manual
 * job creation and file import.
 *
 * - Keeps any existing positive Est_Distance_KM (manual entry / file column /
 *   Master route) untouched.
 * - Otherwise collects the ordered coordinates (multi-origin + multi-dest from
 *   the JSON fields, falling back to Pickup/Delivery lat-lon) and resolves a
 *   distance via OSRM with a Haversine fallback, so coordinates never yield a
 *   blank distance.
 *
 * Returns the km value to persist (never overrides a good existing value).
 */
async function resolveJobDistance(data: Partial<JobFormData>): Promise<number> {
  const existing = Number(data.Est_Distance_KM) || 0
  if (existing > 0) return existing

  const points: { lat: number; lng: number }[] = []

  const collect = (raw: unknown) => {
    const parsed = parseIfString(raw as string)
    if (Array.isArray(parsed)) {
      for (const p of parsed) {
        const lat = Number((p as { lat?: unknown })?.lat)
        const lng = Number((p as { lng?: unknown })?.lng)
        if (!Number.isNaN(lat) && !Number.isNaN(lng) && (lat !== 0 || lng !== 0)) {
          points.push({ lat, lng })
        }
      }
    }
  }

  collect(data.original_origins_json)
  collect(data.original_destinations_json)

  // Fallback to the single-leg Pickup/Delivery coordinates
  if (points.length < 2) {
    points.length = 0
    const pLat = Number(data.Pickup_Lat)
    const pLon = Number(data.Pickup_Lon)
    const dLat = Number(data.Delivery_Lat)
    const dLon = Number(data.Delivery_Lon)
    if (![pLat, pLon, dLat, dLon].some(Number.isNaN) && (pLat || pLon) && (dLat || dLon)) {
      points.push({ lat: pLat, lng: pLon }, { lat: dLat, lng: dLon })
    }
  }

  const resolved = await resolveDistanceKm(points)
  return resolved ?? existing
}

async function handleContainerData(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  jobId: string,
  data: JobFormData,
  rollbackOnFail = false
): Promise<{ success: boolean; error?: string }> {
  if (data.job_type !== 'container') return { success: true }

  const containerData = {
    job_id: jobId,
    container_no: data.container_no || null,
    seal_no: data.seal_no || null,
    container_size: data.container_size || null,
    shipping_line: data.shipping_line || null,
    vessel_voyage: data.vessel_voyage || null,
    lfd_demurrage: data.lfd_demurrage || null,
    lfd_detention: data.lfd_detention || null,
    target_temperature: data.target_temperature as string | number | null | undefined ? Number(data.target_temperature) : null,
    booking_no: data.booking_no || null,
    container_subtype: data.container_subtype || 'import',
    pickup_empty_date: data.pickup_empty_date || null,
    port_closing_datetime: data.port_closing_datetime || null,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase
    .from('jobs_container')
    .upsert(containerData, { onConflict: 'job_id' })

  if (error) {
    console.error('[CONTAINER_ERROR] Failed to save container data:', error)
    if (rollbackOnFail) {
      // Remove the main job to keep data consistent
      await supabase.from('Jobs_Main').delete().eq('Job_ID', jobId)
      console.error('[CONTAINER_ROLLBACK] Deleted Jobs_Main row for:', jobId)
    }
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Auto-saves new origins/destinations into Master_Routes for future autocomplete
 * DISABLED: Per user request to prevent unintended route data creation.
 */
async function autoSaveOriginDestinations(branchId: string | null, originsJson?: string, destsJson?: string) {
    // This feature is currently disabled to prevent data clutter in Master_Routes.
    return
}

export async function createBulkJobs(
    jobs: Partial<JobFormData>[], 
    effectiveBranchId: string | null = null,
    options: { shouldGroup?: boolean, isDraft?: boolean } = {}
) {
  const isAdminUser = await isAdmin()
  const supabase = isAdminUser ? await createAdminClient() : await createClient()

  const userBranchId = await getUserBranchId()
  const isSuper = await isSuperAdmin()
  
  // Get Branch_ID for auto-assignment
  // HARD RESTRICTION: Non-Super Admins are locked to their branch.
  let branchId = (userBranchId && userBranchId !== 'All') ? userBranchId : (effectiveBranchId || 'All')
  
  if (branchId === 'All' && !isSuper) {
      branchId = 'HQ'
  }
  
  effectiveBranchId = branchId

  // Fetch Master Data for lookups
  const [{ data: allDrivers }, { data: allVehicles }, { data: allCustomers }, { data: allRoutes }] = await Promise.all([
    supabase.from('Master_Drivers').select('Driver_ID, Driver_Name, Sub_ID'),
    supabase.from('Master_Vehicles').select('Vehicle_Plate, Vehicle_Type, Sub_ID'),
    supabase.from('Master_Customers').select('Customer_ID, Customer_Name'),
    supabase.from('Master_Routes').select('*')
  ])

  const driverMap = new Map<string, { Driver_ID: string; Driver_Name: string; Sub_ID?: string | null }>(allDrivers?.map((d: { Driver_ID: string; Driver_Name: string; Sub_ID?: string | null }) => [d.Driver_ID, d]) || [])
  const vehicleMap = new Map<string, { Vehicle_Plate: string; Vehicle_Type?: string | null; Sub_ID?: string | null }>(allVehicles?.map((v: { Vehicle_Plate: string; Vehicle_Type?: string | null; Sub_ID?: string | null }) => [v.Vehicle_Plate, v]) || [])
  const customerMap = new Map<string, string>(
    (allCustomers || [])
      .map((c: { Customer_ID: string; Customer_Name?: string | null }) => [c.Customer_Name?.toLowerCase().trim(), c.Customer_ID] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0]))
  )
  const routeMap = new Map<string, { Route_Name?: string | null; Origin?: string | null; Destination?: string | null; Origin_Lat?: number | null; Origin_Lon?: number | null; Dest_Lat?: number | null; Dest_Lon?: number | null; Distance_KM?: number | null }>(
    (allRoutes || [])
      .map((r: { Route_Name?: string | null; Origin?: string | null; Destination?: string | null; Origin_Lat?: number | null; Origin_Lon?: number | null; Dest_Lat?: number | null; Dest_Lon?: number | null; Distance_KM?: number | null }) => [r.Route_Name?.trim(), r] as const)
      .filter((entry): entry is readonly [string, { Route_Name?: string | null; Origin?: string | null; Destination?: string | null; Origin_Lat?: number | null; Origin_Lon?: number | null; Dest_Lat?: number | null; Dest_Lon?: number | null; Distance_KM?: number | null }] => Boolean(entry[0]))
  )

  // Helper to normalize keys
  const normalizeData = (row: Partial<JobFormData>) => {
    const normalized: Record<string, unknown> = {}
    const getValue = (keys: string[]) => {
      const rowKeys = Object.keys(row)
      for (const key of keys) {
        const foundKey = rowKeys.find(k => k.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase().replace(/\s+/g, '_'))
        const rowAsRecord = row as Record<string, unknown>
        if (foundKey && rowAsRecord[foundKey] !== undefined && rowAsRecord[foundKey] !== null) {
          return rowAsRecord[foundKey]
        }
      }
      return undefined
    }

    normalized.Job_ID = getValue(['Job_ID', 'id', 'รหัสงาน'])
    normalized.Plan_Date = getValue(['Plan_Date', 'date', 'วันที่แผน', 'วันที่'])
    normalized.Delivery_Date = getValue(['Delivery_Date', 'delivery_date', 'วันจัดส่ง', 'วันที่จัดส่ง', 'วันส่ง'])
    normalized.Customer_ID = getValue(['Customer_ID', 'cust_id', 'รหัสลูกค้า'])
    normalized.Customer_Name = getValue(['Customer_Name', 'customer', 'ลูกค้า', 'ชื่อลูกค้า'])
    normalized.Route_Name = getValue(['Route_Name', 'route', 'เส้นทาง'])
    normalized.Driver_ID = getValue(['Driver_ID', 'driver', 'รหัสคนขับ'])
    normalized.Vehicle_Plate = getValue(['Vehicle_Plate', 'plate', 'ทะเบียนรถ', 'ทะเบียน'])
    normalized.Vehicle_Type = getValue(['Vehicle_Type', 'vehicle_type', 'ประเภทรถ', 'ชนิดรถ'])
    normalized.Weight_Kg = getValue(['Weight_Kg', 'weight', 'น้ำหนัก', 'น้ำหนักสินค้า'])
    normalized.Volume_Cbm = getValue(['Volume_Cbm', 'volume', 'ปริมาตร', 'คิว'])
    normalized.Price_Cust_Total = getValue(['Price_Cust_Total', 'price', 'รายได้', 'ราคาขาย', 'ราคาลูกค้า'])
    normalized.Cost_Driver_Total = getValue(['Cost_Driver_Total', 'cost', 'ต้นทุน', 'ค่ารถ', 'จ่ายคนขับ', 'ค่าเที่ยว'])
    normalized.Cargo_Type = getValue(['Cargo_Type', 'cargo_type', 'ประเภทสินค้า', 'สินค้า', 'ชนิดสินค้า'])
    normalized.Notes = getValue(['Notes', 'remark', 'หมายเหตุ'])
    normalized.Ref_No = getValue(['Ref_No', 'so', 'do', 'เลขที่อ้างอิง'])
    normalized.Branch_ID = getValue(['Branch_ID', 'branch', 'สาขา'])
    normalized.Job_Status = getValue(['Job_Status', 'status', 'สถานะ'])
    
    normalized.Origin_Location = getValue(['Origin_Location', 'origin', 'ต้นทาง', 'รับที่'])
    normalized.Dest_Location = getValue(['Dest_Location', 'destination', 'ปลายทาง', 'ส่งที่'])
    normalized.Est_Distance_KM = getValue(['Est_Distance_KM', 'distance', 'km', 'ระยะทาง', 'กิโลเมตร'])
    normalized.Pickup_Lat = getValue(['pickup_lat', 'origin_lat', 'lat_start', 'ละติจูดต้นทาง', 'lat_ต้นทาง'])
    normalized.Pickup_Lon = getValue(['pickup_lon', 'origin_lon', 'lon_start', 'ลองติจูดต้นทาง', 'lon_ต้นทาง'])
    normalized.Delivery_Lat = getValue(['delivery_lat', 'dest_lat', 'lat_end', 'ละติจูดปลายทาง', 'lat_ปลายทาง'])
    normalized.Delivery_Lon = getValue(['delivery_lon', 'dest_lon', 'lon_end', 'ลองติจูดปลายทาง', 'lon_ปลายทาง'])
    normalized.Show_Price_To_Driver = getValue(['Show_Price_To_Driver', 'show_price', 'การแสดงรายได้'])
    normalized.Round = getValue(['Round', 'trip', 'รอบ', 'เที่ยว', 'รอบวิ่ง', 'ลำดับรอบ'])
    
    // Container Fields
    normalized.job_type = getValue(['job_type', 'ประเภทงาน'])
    normalized.chassis_plate = getValue(['chassis_plate', 'ทะเบียนหาง', 'หางลาก'])
    normalized.container_no = getValue(['container_no', 'หมายเลขตู้', 'เลขตู้'])
    normalized.seal_no = getValue(['seal_no', 'หมายเลขซีล', 'เลขซีล'])
    normalized.container_size = getValue(['container_size', 'ขนาดตู้'])
    normalized.shipping_line = getValue(['shipping_line', 'สายเรือ'])
    normalized.vessel_voyage = getValue(['vessel_voyage', 'เรือ/เที่ยว'])
    normalized.lfd_demurrage = getValue(['lfd_demurrage', 'LFD Demurrage'])
    normalized.lfd_detention = getValue(['lfd_detention', 'LFD Detention'])
    normalized.target_temperature = getValue(['target_temperature', 'อุณหภูมิเป้าหมาย'])
    normalized.booking_no = getValue(['booking_no', 'เลข booking', 'booking', 'เลขบุ๊คกิ้ง', 'บุ๊คกิ้ง', 'เลขใบจอง'])
    normalized.container_subtype = getValue(['container_subtype', 'ประเภทงานตู้', 'ชนิดงานตู้', 'subtype'])
    normalized.pickup_empty_date = getValue(['pickup_empty_date', 'วันเริ่มรับตู้เปล่า', 'วันรับตู้เปล่า', 'วันรับตู้', 'pickup_empty'])
    normalized.port_closing_datetime = getValue(['port_closing_datetime', 'port_closing', 'closing', 'clossing', 'กำหนดปิดรับตู้', 'ปิดรับตู้', 'วันปิดรับตู้'])

    // Multi-Origin & Destination Detection
    const origins: { name: string, lat: number | null, lng: number | null }[] = []
    const destinations: { name: string, lat: number | null, lng: number | null }[] = []
    const rowKeys = Object.keys(row)
    
    // Parse fallback from Route_Name if Origin/Dest Location fields are missing
    const rawRouteName = normalized.Route_Name as string
    if (rawRouteName) {
        const parts = rawRouteName.split(/\s*[-–—→>]\s*/)
        if (parts.length > 1) {
            if (!normalized.Origin_Location) normalized.Origin_Location = parts[0].trim()
            if (!normalized.Dest_Location) normalized.Dest_Location = parts[parts.length - 1].trim()
        }
    }
    
    // 1. Origins Mapping
    const primaryOrigin = normalized.Origin_Location as string
    if (primaryOrigin) {
        if (primaryOrigin.includes(' → ')) {
            const names = primaryOrigin.split(' → ').map(n => n.trim()).filter(Boolean)
            names.forEach((name, i) => {
                origins.push({
                    name,
                    lat: i === 0 ? (normalized.Pickup_Lat ? Number(normalized.Pickup_Lat) : null) : null,
                    lng: i === 0 ? (normalized.Pickup_Lon ? Number(normalized.Pickup_Lon) : null) : null
                })
            })
        } else {
            origins.push({ 
                name: primaryOrigin, 
                lat: normalized.Pickup_Lat ? Number(normalized.Pickup_Lat) : null,
                lng: normalized.Pickup_Lon ? Number(normalized.Pickup_Lon) : null
            })
        }
    }

    const additionalOriginKeys = rowKeys.filter(k => {
        const nk = k.toLowerCase().replace(/\s+/g, '')
        return (nk.startsWith('ต้นทาง') || nk.startsWith('origin')) && 
               /\d+/.test(nk) && 
               !nk.includes('lat') && !nk.includes('lon')
    }).sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)?.[0] || '0')
        const numB = parseInt(b.match(/\d+/)?.[0] || '0')
        return numA - numB
    })

    additionalOriginKeys.forEach(key => {
        const val = (row as Record<string, unknown>)[key]
        if (val && String(val).trim()) {
            origins.push({ name: String(val).trim(), lat: null, lng: null })
        }
    })

    if (row.original_origins_json) {
        normalized.original_origins_json = row.original_origins_json
    } else if (origins.length > 0) {
        normalized.original_origins_json = origins
    }

    // 2. Destinations Mapping
    if (row.original_destinations_json) {
        normalized.original_destinations_json = row.original_destinations_json
    } else {
        const primaryDest = normalized.Dest_Location as string
        if (primaryDest) {
            if (primaryDest.includes(' → ')) {
                const names = primaryDest.split(' → ').map(n => n.trim()).filter(Boolean)
                names.forEach((name, i) => {
                    destinations.push({
                        name,
                        lat: i === names.length - 1 ? (normalized.Delivery_Lat ? Number(normalized.Delivery_Lat) : null) : null,
                        lng: i === names.length - 1 ? (normalized.Delivery_Lon ? Number(normalized.Delivery_Lon) : null) : null
                    })
                })
            } else {
                destinations.push({ 
                    name: primaryDest, 
                    lat: normalized.Delivery_Lat ? Number(normalized.Delivery_Lat) : null,
                    lng: normalized.Delivery_Lon ? Number(normalized.Delivery_Lon) : null
                })
            }
        }

        const additionalDestKeys = rowKeys.filter(k => {
            const nk = k.toLowerCase().replace(/\s+/g, '')
            return (nk.startsWith('ปลายทาง') || nk.startsWith('destination') || nk.startsWith('dest')) && 
                   /\d+/.test(nk) && 
                   !nk.includes('lat') && !nk.includes('lon')
        }).sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)?.[0] || '0')
            const numB = parseInt(b.match(/\d+/)?.[0] || '0')
            return numA - numB
        })

        additionalDestKeys.forEach(key => {
            const val = (row as Record<string, unknown>)[key]
            if (val && String(val).trim()) {
                destinations.push({ name: String(val).trim(), lat: null, lng: null })
            }
        })

        if (destinations.length > 0) {
            normalized.original_destinations_json = destinations
        }
    }

    return normalized
  }

  const cleanId = (val: unknown) => {
    if (val === undefined || val === null) return undefined
    const s = String(val).trim()
    if (s.endsWith('.0')) return s.slice(0, -2)
    return s
  }

  const normalizeDate = (val: unknown) => {
    if (!val) return null
    if (typeof val === 'number') {
      // Excel serial date (days since 1900-01-01)
      const date = new Date(Math.round((val - 25569) * 86400 * 1000))
      return date.toISOString().split('T')[0]
    }
    if (typeof val === 'string') {
      const trimmed = val.trim()
      // Handle DD.MM.YYYY or DD/MM/YYYY
      const separator = trimmed.includes('.') ? '.' : trimmed.includes('/') ? '/' : trimmed.includes('-') ? '-' : null
      if (separator) {
        const parts = trimmed.split(separator)
        if (parts.length === 3) {
          // If first part is 4 digits, assume YYYY-MM-DD
          if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
          // If last part is 4 digits, assume DD-MM-YYYY
          if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
        }
      }
      // Fallback for standard ISO or other string formats
      try {
        const d = new Date(trimmed)
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
      } catch {
        return trimmed
      }
    }
    return String(val)
  }

  // Master-sheet grouping: แถวหลัก (มีรหัสงาน/ลูกค้า) = 1 job, แถวรองที่ใส่แค่ปลายทาง
  // (เว้นว่างคอลัมน์อื่น) = ดรอปถัดไปของ job แถวบน → รวมเป็น multi-drop งานเดียว
  // ทำงานเฉพาะเมื่อเปิด checkbox "จัดกลุ่ม" (shouldGroup) เพื่อไม่กระทบไฟล์แบบ 1 แถว = 1 งาน
  const groupMasterSheetRows = (rows: Partial<JobFormData>[]): Partial<JobFormData>[] => {
    const DEST_KEYS = ['Dest_Location', 'destination', 'ปลายทาง', 'ส่งที่']
    const ORIGIN_KEYS = ['Origin_Location', 'origin', 'ต้นทาง', 'รับที่']
    const IDENTITY_KEYS = ['Job_ID', 'id', 'รหัสงาน', 'Customer_ID', 'cust_id', 'รหัสลูกค้า', 'Customer_Name', 'customer', 'ลูกค้า', 'ชื่อลูกค้า']

    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '_')
    const findKey = (row: Record<string, unknown>, keys: string[]) => {
      const rowKeys = Object.keys(row)
      for (const key of keys) {
        const foundKey = rowKeys.find(k => norm(k) === norm(key))
        if (foundKey) return foundKey
      }
      return undefined
    }
    const rawGet = (row: Record<string, unknown>, keys: string[]) => {
      const foundKey = findKey(row, keys)
      if (foundKey) {
        const v = row[foundKey]
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
      }
      return undefined
    }
    const appendDrop = (target: Record<string, unknown>, keys: string[], value: string) => {
      const existingKey = findKey(target, keys) || keys[keys.length - 1]
      const current = target[existingKey] ? String(target[existingKey]).trim() : ''
      target[existingKey] = current ? `${current} → ${value}` : value
    }

    const result: Partial<JobFormData>[] = []
    let last: Record<string, unknown> | null = null
    for (const row of rows) {
      const rec = row as Record<string, unknown>
      const hasIdentity = IDENTITY_KEYS.some(k => rawGet(rec, [k]) !== undefined)
      const dest = rawGet(rec, DEST_KEYS)
      const origin = rawGet(rec, ORIGIN_KEYS)

      if (!hasIdentity && last && (dest || origin)) {
        // แถวรอง = ดรอปถัดไป: ต่อปลายทาง (และ/หรือ ต้นทาง) เข้ากับ job แถวบน
        if (dest) appendDrop(last, DEST_KEYS, dest)
        if (origin) appendDrop(last, ORIGIN_KEYS, origin)
        continue
      }
      if (!hasIdentity && !dest && !origin) continue // ข้ามแถวว่างล้วน

      const copy = { ...rec }
      result.push(copy as Partial<JobFormData>)
      last = copy
    }
    return result
  }

  const sourceRows = options.shouldGroup ? groupMasterSheetRows(jobs) : jobs

  const cleanData = sourceRows.map(j => {
    const data = normalizeData(j)
    const driverId = data.Driver_ID as string
    const vehiclePlate = data.Vehicle_Plate as string
    
    const driver = driverMap.get(driverId)
    const vehicle = vehicleMap.get(vehiclePlate)

    const routeName = (data.Route_Name as string)?.trim()
    let route = routeMap.get(routeName)
    
    // Smart Fallback: If not found by name, try matching by Origin + Destination
    if (!route && data.Origin_Location && data.Dest_Location) {
        const o = String(data.Origin_Location).trim().toLowerCase()
        const d = String(data.Dest_Location).trim().toLowerCase()
        route = allRoutes?.find((r: { Origin?: string | null; Destination?: string | null }) => 
            r.Origin?.trim().toLowerCase() === o && 
            r.Destination?.trim().toLowerCase() === d
        )
    }

    const sanitized = sanitizeJobData({
      Job_ID: cleanId(data.Job_ID) || `JOB-${Date.now().toString().slice(-6)}-${Math.floor(Math.random()*1000)}`,
      Branch_ID: (data.Branch_ID as string) || effectiveBranchId,
      Plan_Date: normalizeDate(data.Plan_Date) || todayTH(),
      // เดิม Delivery_Date ตกหล่น (ไม่ถูกบันทึก) → งานที่สร้างจากหน้าวางแผนวันจัดส่งหาย
      // ถ้าไม่ได้ระบุ ให้ default = วันวางแผน (ไม่ปล่อย null จนโชว์เป็นวันนี้ตอนเปิดแก้)
      Delivery_Date: normalizeDate(data.Delivery_Date) || normalizeDate(data.Plan_Date) || todayTH(),
      Customer_ID: (data.Customer_ID as string) || customerMap.get((data.Customer_Name as string)?.toLowerCase().trim()) || null,
      Customer_Name: data.Customer_Name as string,
      // Match the dialog's behaviour: when no master route resolves, name the
      // route "Origin - Destination" (not the generic 'Direct') so imported
      // drafts with origins/destinations show the real path. Only fall back to
      // null when there's nothing to derive from.
      Route_Name: route?.Route_Name
        || (data.Route_Name as string)
        || (data.Origin_Location && data.Dest_Location
              ? `${String(data.Origin_Location).trim()} - ${String(data.Dest_Location).trim()}`
              : null),
      Driver_ID: driverId || null,
      Driver_Name: driver?.Driver_Name || null,
      Vehicle_Plate: vehiclePlate || null,
      Vehicle_Type: vehicle?.Vehicle_Type || (data.Vehicle_Type as string) || '4-Wheel',
      Job_Status: (data.Job_Status as string) || 'New',
      Cargo_Type: (data.Cargo_Type as string) || (j.Cargo_Type as string) || null,
      Notes: data.Notes as string || null,
      Price_Cust_Total: Number(data.Price_Cust_Total) || 0,
      Cost_Driver_Total: Number(data.Cost_Driver_Total) || 0,
      Sub_ID: driver?.Sub_ID || (vehicle as { Sub_ID?: string | null })?.Sub_ID || null,
      Weight_Kg: Number(data.Weight_Kg) || 0,
      Volume_Cbm: Number(data.Volume_Cbm) || 0,
      Created_At: new Date().toISOString(),
      // Pass coordinates through or fallback to Route Master
      Pickup_Lat: data.Pickup_Lat ? Number(data.Pickup_Lat) : (route?.Origin_Lat || null),
      Pickup_Lon: data.Pickup_Lon ? Number(data.Pickup_Lon) : (route?.Origin_Lon || null),
      Delivery_Lat: data.Delivery_Lat ? Number(data.Delivery_Lat) : (route?.Dest_Lat || null),
      Delivery_Lon: data.Delivery_Lon ? Number(data.Delivery_Lon) : (route?.Dest_Lon || null),
      Origin_Location: (data.Origin_Location as string) || route?.Origin || null,
      original_origins_json: data.original_origins_json || (route?.Origin ? [{ name: route.Origin, lat: route.Origin_Lat || null, lng: route.Origin_Lon || null }] : []),
      Dest_Location: (data.Dest_Location as string) || route?.Destination || null,
      original_destinations_json: data.original_destinations_json || (route?.Destination ? [{ name: route.Destination, lat: route.Dest_Lat || null, lng: route.Dest_Lon || null }] : []),
      Total_Drop: Array.isArray(data.original_destinations_json) 
        ? data.original_destinations_json.length 
        : (route?.Destination ? 1 : 1),
      Est_Distance_KM: Number(data.Est_Distance_KM) || route?.Distance_KM || 0,
      Show_Price_To_Driver: data.Show_Price_To_Driver !== undefined ? (data.Show_Price_To_Driver === true || data.Show_Price_To_Driver === 'true') : (j.Show_Price_To_Driver ?? true),
      Round: data.Round || null,
      job_type: data.job_type || 'normal',
      chassis_plate: data.chassis_plate || null
    })
    
    // Add raw container fields back to the object so handleContainerData can find them
    const fullJobData: Partial<JobFormData> = {
        ...sanitized,
        container_no: (data.container_no ?? j.container_no) as string | null | undefined,
        seal_no: (data.seal_no ?? j.seal_no) as string | null | undefined,
        container_size: (data.container_size ?? j.container_size) as string | null | undefined,
        shipping_line: (data.shipping_line ?? j.shipping_line) as string | null | undefined,
        vessel_voyage: (data.vessel_voyage ?? j.vessel_voyage) as string | null | undefined,
        lfd_demurrage: (data.lfd_demurrage ?? j.lfd_demurrage) as string | null | undefined,
        lfd_detention: (data.lfd_detention ?? j.lfd_detention) as string | null | undefined,
        target_temperature: (data.target_temperature ?? j.target_temperature) as string | number | null | undefined,
        booking_no: (data.booking_no ?? j.booking_no) as string | null | undefined,
        container_subtype: (data.container_subtype ?? j.container_subtype) as string | null | undefined,
        pickup_empty_date: (normalizeDate(data.pickup_empty_date) || (data.pickup_empty_date as string) || (j.pickup_empty_date as string)) as string | null | undefined,
        port_closing_datetime: (data.port_closing_datetime ?? j.port_closing_datetime) as string | null | undefined,
    }
    
    if (typeof sanitized.Price_Cust_Total === 'string') fullJobData.Price_Cust_Total = parseFloat(sanitized.Price_Cust_Total) || 0
    if (typeof sanitized.Cost_Driver_Total === 'string') fullJobData.Cost_Driver_Total = parseFloat(sanitized.Cost_Driver_Total) || 0
    
    return fullJobData
  }).filter((j: Partial<JobFormData>) => j.Customer_Name)

  // Apply Draft status if requested via options
  const finalCleanData: Partial<JobFormData>[] = options.isDraft 
    ? cleanData.map(j => ({ ...j, Job_Status: 'Draft' }))
    : cleanData

  // Apply Auto-calculation asynchronously to support fuel lookups
  const finalizedData = await Promise.all(finalCleanData.map(async (j) => {
    let total = Number(j.Price_Cust_Total) || 0
    // PCG: price from the rate card (farthest drop × diesel band) takes priority.
    if (total === 0 && String(j.Customer_ID || '') === PCG_CUSTOMER_ID) {
        try {
            const pcg = await resolvePcgPrice(jobDrops(j as JobFormData), j.Plan_Date as string | undefined)
            if (pcg) total = pcg.price
        } catch (e) { console.warn('[import] PCG auto-price failed:', e instanceof Error ? e.message : e) }
    }
    if (total === 0 && j.Customer_ID) {
        const pricing = await calculateJobPrice({
            ...j,
            Job_ID: j.Job_ID || ''
        })
        if (pricing.totalPrice > 0) {
            total = pricing.totalPrice
        }
    }
    const roundInfo = j.Round ? `[รอบ: ${j.Round}] ` : ''
    // Fill coords from the location master, then ensure distance is populated on
    // import too (file column / Master route may be missing) using the same
    // OSRM + Haversine resolver as manual entry.
    await hydrateJobCoordinates(j)
    const estDistance = await resolveJobDistance(j)
    return {
      ...j,
      Price_Cust_Total: total,
      Pickup_Lat: j.Pickup_Lat ?? null,
      Pickup_Lon: j.Pickup_Lon ?? null,
      Delivery_Lat: j.Delivery_Lat ?? null,
      Delivery_Lon: j.Delivery_Lon ?? null,
      original_origins_json: j.original_origins_json,
      original_destinations_json: j.original_destinations_json,
      Est_Distance_KM: estDistance,
      Notes: j.Notes ? (j.Notes.startsWith('[รอบ:') ? j.Notes : `${roundInfo}${j.Notes}`) : (j.Round ? `[รอบ: ${j.Round}]` : j.Notes)
    }
  }))

  if (finalizedData.length === 0) {
     return { success: false, message: 'ไม่พบข้อมูลที่ถูกต้อง (ต้องระบุชื่อลูกค้า)' }
  }

  // Strip container-only fields before saving to Jobs_Main to prevent DB schema errors
  const containerFields = [
    'container_no', 'seal_no', 'container_size', 'shipping_line', 
    'vessel_voyage', 'lfd_demurrage', 'lfd_detention', 'target_temperature'
  ]
  const jobsMainData = finalizedData.map(j => {
      const cleanJob = { ...j }
      containerFields.forEach(f => delete (cleanJob as Record<string, unknown>)[f])
      return cleanJob
  })

  // Check for duplicate Job_IDs before inserting to avoid silent overwrites
  const incomingIds = jobsMainData.map(j => j.Job_ID).filter(Boolean)
  const { data: existingJobs } = await supabase
    .from('Jobs_Main')
    .select('Job_ID')
    .in('Job_ID', incomingIds)

  const existingIds = new Set((existingJobs || []).map((j: { Job_ID: string }) => j.Job_ID))
  const duplicateIds = incomingIds.filter((id): id is string => !!id && existingIds.has(id))

  const newJobs = jobsMainData.filter(j => !existingIds.has(j.Job_ID as string))
  const updateJobs = jobsMainData.filter(j => existingIds.has(j.Job_ID as string))

  // Insert new jobs only (no silent overwrite)
  if (newJobs.length > 0) {
    const { error: insertErr } = await supabase.from('Jobs_Main').insert(newJobs)
    if (insertErr) return { success: false, message: `Failed to import: ${insertErr.message}` }
  }

  // Update existing jobs explicitly (auditable)
  if (updateJobs.length > 0) {
    for (const job of updateJobs) {
      const { error: updateErr } = await supabase
        .from('Jobs_Main')
        .update(job)
        .eq('Job_ID', job.Job_ID)
      if (updateErr) console.warn(`[BULK_IMPORT] Failed to update existing job ${job.Job_ID}:`, updateErr.message)
    }
  }

  // Save Container Data for each job (if applicable)
  await Promise.allSettled(finalizedData.map(j => handleContainerData(supabase, j.Job_ID!, j as JobFormData)))

  // Auto-save locations from the batch
  const locationsToSave: { name: string, lat: number, lng: number }[] = []
  finalizedData.forEach(j => {
      if (j.Origin_Location && j.Pickup_Lat && j.Pickup_Lon) {
          locationsToSave.push({ name: j.Origin_Location, lat: j.Pickup_Lat, lng: j.Pickup_Lon })
      }
      if (j.Dest_Location && j.Delivery_Lat && j.Delivery_Lon) {
          locationsToSave.push({ name: j.Dest_Location, lat: j.Delivery_Lat, lng: j.Delivery_Lon })
      }
  })
  
  if (locationsToSave.length > 0) {
     const originsJson = JSON.stringify(locationsToSave)
     autoSaveOriginDestinations(effectiveBranchId, originsJson).catch(() => {})
  }

  // non-blocking: เส้นทางใหม่จากการนำเข้าที่ยังไม่มีในระบบ → บันทึกเป็น "สถานที่ค้างเติมพิกัด"
  // (ชื่อที่มีอยู่แล้วถูกข้าม; ที่ใหม่ถูก flag Is_Incomplete ให้แอดมินตามเติมผ่าน getAdminAlerts)
  try {
    const importNames: string[] = []
    finalizedData.forEach(j => {
      if (j.Origin_Location) importNames.push(j.Origin_Location as string)
      if (j.Dest_Location) importNames.push(j.Dest_Location as string)
    })
    const { ensureJobLocations } = await import('@/lib/supabase/locations')
    await ensureJobLocations(importNames, effectiveBranchId)
  } catch { /* ignore */ }

  // Audit: Log any backdated job entries
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const backdatedJobs = finalizedData.filter(j => {
    if (!j.Plan_Date) return false
    const planDate = new Date(j.Plan_Date)
    planDate.setHours(0, 0, 0, 0)
    return planDate < today
  })
  if (backdatedJobs.length > 0) {
    const daysDiff = (d: string) => {
      const diff = today.getTime() - new Date(d).getTime()
      return Math.floor(diff / (1000 * 60 * 60 * 24))
    }
    for (const j of backdatedJobs) {
      logActivity({
        module: 'Jobs',
        action_type: 'CREATE',
        target_id: j.Job_ID,
        details: {
          type: 'BACKDATED_ENTRY',
          customer: j.Customer_Name,
          plan_date: j.Plan_Date || undefined,
          days_backdated: daysDiff(j.Plan_Date!),
          created_at_actual: new Date().toISOString(),
          note: `Admin created job for past date (${j.Plan_Date}) on ${new Date().toLocaleDateString('th-TH')}`
        }
      }).catch(() => {})
    }
  }

  // Handle Notifications for the batch
  try {
      const assignedDrivers = new Set<string>()
      let hasMarketplaceJob = false
      let sampleJobId = ""
      let sampleCustomer = ""

      const notiPromises: Promise<unknown>[] = []
      
      finalizedData.forEach(j => {
          if (j.Driver_ID) {
              assignedDrivers.add(j.Driver_ID)
              // Only notify about the first job for this driver in this batch to avoid spam
              if (j.Job_Status !== 'Draft') {
                  notiPromises.push(notifyDriverNewJob(j.Driver_ID, j.Job_ID!, j.Customer_Name || 'ไม่ระบุ'))
              }
          } else {
              hasMarketplaceJob = true
              sampleJobId = j.Job_ID!
              sampleCustomer = j.Customer_Name || 'ไม่ระบุ'
          }
      })

      if (hasMarketplaceJob && finalizedData.some(j => j.Job_Status !== 'Draft')) {
          // Broadcast once for the whole batch
          const batchCount = finalizedData.filter(j => !j.Driver_ID).length
          const broadcastMsg = batchCount > 1 
            ? `${batchCount} งานใหม่!` 
            : sampleJobId
          
          notiPromises.push(notifyMarketplaceNewJob(broadcastMsg, sampleCustomer))
      }
      
      await Promise.allSettled(notiPromises)
  } catch (notiErr) {
      console.error('[PUSH] Bulk notification error:', notiErr)
  }

  revalidatePath('/planning')
  revalidatePath('/dashboard')
  revalidatePath('/jobs/history')
  revalidatePath('/mobile/jobs')

  const uniqueDates = Array.from(new Set((finalizedData as Partial<JobFormData>[]).map((j: Partial<JobFormData>) => j.Plan_Date))).filter(Boolean)
  const dateStr = uniqueDates.length === 1 ? ` for ${uniqueDates[0]}` : ""
  
  const dupNote = duplicateIds.length > 0
    ? ` (อัปเดต ${duplicateIds.length} รายการที่มีอยู่แล้ว: ${duplicateIds.slice(0, 3).join(', ')}${duplicateIds.length > 3 ? '...' : ''})`
    : ''

  return {
    success: true,
    message: `นำเข้าสำเร็จ ${finalizedData.length} งาน${dateStr}${dupNote}`,
    duplicateIds: duplicateIds.length > 0 ? duplicateIds : undefined
  }
}

export async function updateJob(jobId: string, data: Partial<JobFormData>) {
  const isAdminUser = await isAdmin()
  const supabase = isAdminUser ? createAdminClient() : await createClient()

  const updateData = sanitizeJobData({ ...data })
  
  // Ensure JSON fields are stringified properly for Postgres text columns
  if (data.extra_costs_json !== undefined) updateData.extra_costs_json = stringifyIfObject(data.extra_costs_json)
  if (data.original_origins_json !== undefined) updateData.original_origins_json = stringifyIfObject(data.original_origins_json)
  if (data.original_destinations_json !== undefined) {
    const destStr = stringifyIfObject(data.original_destinations_json)
    updateData.original_destinations_json = destStr
    const dests = parseIfString(destStr)
    if (Array.isArray(dests)) {
      updateData.Total_Drop = dests.length
    }
  }

  
  // Update Driver Name and Sub_ID if Driver_ID specifically changes
  if (data.Driver_ID) {
    const { data: driver, error: driverErr } = await supabase
      .from('Master_Drivers')
      .select('Driver_Name, Sub_ID')
      .eq('Driver_ID', data.Driver_ID)
      .single()
    if (!driverErr && driver) {
       updateData.Driver_Name = driver.Driver_Name
       if (!updateData.Sub_ID) updateData.Sub_ID = driver.Sub_ID || null
    } else if (driverErr) {
      console.warn('[updateJob] Driver lookup failed:', driverErr.message)
    }
  }

  // Also check Vehicle_Plate for Sub_ID if still not present
  if (!updateData.Sub_ID && data.Vehicle_Plate) {
    const { data: vehicle, error: vehicleErr } = await supabase
      .from('Master_Vehicles')
      .select('Sub_ID')
      .eq('Vehicle_Plate', data.Vehicle_Plate)
      .single()
    if (!vehicleErr && vehicle) updateData.Sub_ID = vehicle.Sub_ID || null
    else if (vehicleErr) console.warn('[updateJob] Vehicle lookup failed:', vehicleErr.message)
  }
  
  // 1. Fetch current job once — used for the status baseline, pricing AND as optimistic-lock baseline
  const { data: currentJob, error: fetchErr } = await supabase
    .from('Jobs_Main')
    .select('*')
    .eq('Job_ID', jobId)
    .single()

  if (fetchErr || !currentJob) {
    return { success: false, message: `Job not found: ${fetchErr?.message || jobId}` }
  }

  // 2. Handle Status Transition ONLY when the status genuinely changed vs the DB.
  // The edit dialog sends Job_Status on every save, and that field can be stale
  // (e.g. defaulted to 'New' before the form finished syncing to the loaded job).
  // Blindly transitioning would fail an unrelated field edit (like adding a price
  // to a Completed job) with "Illegal transition: Completed -> New". So: skip when
  // unchanged, and if the requested change is illegal, keep the current status and
  // still save the other fields instead of aborting the whole update.
  let verifiedViaStatus = false
  if (data.Job_Status && data.Job_Status !== currentJob.Job_Status) {
    const transition = await transitionJobStatus(jobId, data.Job_Status as import("@/services/job-status-machine").JobStatus, {
      reason: 'Manual update from planning',
      force: true
    })
    if (!transition.success) {
      // Do NOT block the rest of the edit on an unintended/illegal status change.
      console.warn(`[updateJob] Skipping status change for ${jobId}: ${transition.message}`)
    } else if (
      currentJob.Job_Status === 'Verified' &&
      !['Verified', 'Billed', 'Paid'].includes(data.Job_Status as string)
    ) {
      // Reverting OUT of Verified back to an operational/rejected status (e.g. an
      // admin who wrongly verified a job and is undoing it). Clear the verification
      // stamps so the ledger doesn't keep a job marked "verified" once it's been
      // sent back into the workflow. (Forward moves Verified -> Billed/Paid keep them.)
      updateData.Verification_Status = null
      updateData.Verified_By = null
      updateData.Verified_At = null
    } else if (data.Job_Status === 'Verified') {
      // Changing status to 'Verified' here must mirror the verification dialog:
      // stamp the verification fields and write the MASTER Sheet row, otherwise
      // this edit-dialog path silently leaves the ledger (and Verification_Status)
      // out of sync with the other verify entry points.
      verifiedViaStatus = true
      const session = await getSession()
      updateData.Verification_Status = 'Verified'
      updateData.Verified_By = session?.username || session?.userId || 'admin'
      updateData.Verified_At = new Date().toISOString()
    }
  }
  // Never let the status field flow into the plain field update below; transitions
  // are the only sanctioned way to change Job_Status.
  delete updateData.Job_Status

  // 3. Pricing Engine Integration (uses fetched job as base, avoids second fetch)
  if ((!updateData.Price_Cust_Total || Number(updateData.Price_Cust_Total) === 0) || (data.Loaded_Qty !== undefined)) {
     const pricing = await calculateJobPrice({
         ...currentJob,
         ...updateData
     })

     if (pricing.totalPrice > 0) {
         updateData.Price_Cust_Total = pricing.totalPrice
         updateData.Price_Per_Unit = pricing.unitPrice
     }
  }

  const { error } = await supabase
    .from('Jobs_Main')
    .update(updateData)
    .eq('Job_ID', jobId)

  if (error) {
    return { success: false, message: `Failed to update job: ${error.message}` }
  }

  // Save Container Data if applicable
  await handleContainerData(supabase, jobId, { ...data, Job_ID: jobId } as JobFormData)

  // Auto-save locations for future use
  const branchId = await getUserBranchId()
  autoSaveOriginDestinations(branchId || null, data.original_origins_json, data.original_destinations_json).catch(() => {})

  revalidatePath('/planning')
  revalidatePath('/dashboard')
  revalidatePath('/jobs/history')
  revalidatePath('/mobile/jobs')

  // Log the update
  await logActivity({
    module: 'Jobs',
    action_type: 'UPDATE',
    target_id: jobId,
    details: {
      updated_fields: Object.keys(updateData),
      customer: updateData.Customer_Name
    }
  })

  // Mirror into the MASTER Google Sheet when this edit set the job to 'Verified'.
  // Dedup lives in appendJobToMaster (ledger check), so it's safe to call every
  // time — matching verifyJob() and adminUpdateJobStatus().
  let sheetSync: { success: boolean; error?: string; skipped?: boolean } | undefined
  if (verifiedViaStatus) {
    sheetSync = await appendJobToMaster(jobId)
  }

  return { success: true, message: 'Job updated successfully', sheetSync }
}

export async function deleteJob(jobId: string) {
  const isAdminUser = await isAdmin()
  const supabase = isAdminUser ? createAdminClient() : await createClient()

  const { error } = await supabase
    .from('Jobs_Main')
    .delete()
    .eq('Job_ID', jobId)

  if (error) {
    return { success: false, message: 'Failed to delete job' }
  }

  revalidatePath('/planning')
  revalidatePath('/dashboard')
  revalidatePath('/jobs/history')

  // Log the deletion
  await logActivity({
    module: 'Jobs',
    action_type: 'DELETE',
    target_id: jobId,
    details: {
      description: `Deleted job ${jobId}`
    }
  })

  return { success: true, message: 'Job deleted successfully' }
}

export async function getJobCreationData(selectedBranchId?: string) {
  const isSuper = await isSuperAdmin()
  const isAdminUser = await isAdmin()
  const userBranchId = await getUserBranchId()
  // Resolve branchId to use for queries and filters
  const branchId = (isSuper || isAdminUser) ? (selectedBranchId || userBranchId) : userBranchId
  const supabase = (isSuper || isAdminUser) ? createAdminClient() : await createClient()

  const [driversResult, vehiclesResult, customersResult, routesResult, subcontractorsResult] = await Promise.all([
    getAllDriversFromTable(branchId),
    getAllVehiclesFromTable(branchId),
    supabase.from('Master_Customers').select('*').order('Customer_Name', { ascending: true }),
    supabase.from('Master_Routes').select('*').order('Route_Name', { ascending: true }),
    supabase.from('Master_Subcontractors').select('*').order('Sub_Name', { ascending: true })
  ])

  // Filter regular select results by branch
  let customers = customersResult.data || []
  let routes = routesResult.data || []
  let subcontractors = subcontractorsResult.data || []

  if (branchId && branchId !== 'All') {
      customers = customers.filter((c: { Branch_ID?: string | null }) => !c.Branch_ID || c.Branch_ID === 'All' || c.Branch_ID === branchId)
      routes = routes.filter((r: { Branch_ID?: string | null }) => !r.Branch_ID || r.Branch_ID === 'All' || r.Branch_ID === branchId)
      subcontractors = subcontractors.filter((s: { Branch_ID?: string | null }) => !s.Branch_ID || s.Branch_ID === 'All' || s.Branch_ID === branchId)
  }

  return {
    drivers: driversResult,
    vehicles: vehiclesResult,
    customers,
    routes,
    subcontractors
  }
}

export async function requestShipment(data: {
  Plan_Date: string
  Origin_Location: string
  Dest_Location: string
  Cargo_Type: string
  Notes?: string
}) {
  const supabase = createAdminClient()
  const customerId_Session = await getCustomerId()
  const userId = await getUserId()
  const isCust = await isCustomer()
  
  let customerId = customerId_Session

  // Fallback: If customerId is missing from session, fetch it from Master_Users
  if (!customerId && userId) {
      const { data: userData } = await supabase
          .from('Master_Users')
          .select('Customer_ID, Role')
          .eq('Username', userId)
          .single()
      
      if (userData?.Customer_ID) {
          customerId = userData.Customer_ID
      }
  }

  if (!customerId && !isCust) {
    return { success: false, message: 'Unauthorized: Access restricted to customers only' }
  }

  if (!customerId) {
    return { success: false, message: 'Unauthorized: Customer ID not found' }
  }

  // Get Customer Name and Branch for easier display and filtering
  const { data: customer } = await supabase
    .from('Master_Customers')
    .select('Customer_Name, Branch_ID')
    .eq('Customer_ID', customerId)
    .single()



  const userBranchId = await getUserBranchId()
  const jobId = `REQ-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`

  // Build a complete payload to satisfy DB constraints
  const payload = {
    Job_ID: jobId,
    Customer_ID: customerId,
    Customer_Name: customer?.Customer_Name || userId || 'Unknown Customer',
    Branch_ID: customer?.Branch_ID || userBranchId || 'HQ',
    Plan_Date: data.Plan_Date,
    Delivery_Date: data.Plan_Date, // Default delivery to plan date for requests
    Origin_Location: data.Origin_Location,
    Dest_Location: data.Dest_Location,
    Cargo_Type: data.Cargo_Type,
    Notes: data.Notes,
    Job_Status: 'Requested',
    Weight_Kg: 0,
    Volume_Cbm: 0,
    Price_Cust_Total: 0,
    Cost_Driver_Total: 0,
    Est_Distance_KM: 0,
    Created_At: new Date().toISOString()
  }



  const { error } = await supabase.from('Jobs_Main').insert(payload)

  if (error) {
    return { success: false, message: 'Failed to submit request: ' + error.message }
  }

  revalidatePath('/dashboard')
  revalidatePath('/planning')

  // Log activity
  await logActivity({
    module: 'Jobs',
    action_type: 'CREATE',
    target_id: jobId,
    details: {
      type: 'CUSTOMER_REQUEST',
      customer: customer?.Customer_Name
    }
  })

  return { success: true, message: 'Shipment request submitted successfully' }
}

/**
 * Batch version of requestShipment: one shared header (date/origin/cargo) plus
 * many destination "stops", each of which can request several vehicles/trips.
 * Creates one Jobs_Main row per vehicle/trip so a customer can file a whole
 * multi-drop plan in a single submit instead of one dialog per job.
 */
export async function requestShipmentBatch(data: {
  Plan_Date: string
  Origin_Location: string
  Cargo_Type?: string
  Notes?: string
  stops: { Dest_Location: string; Cargo_Type?: string; Vehicles?: number; Notes?: string }[]
}) {
  const supabase = createAdminClient()
  const customerId_Session = await getCustomerId()
  const userId = await getUserId()
  const isCust = await isCustomer()

  let customerId = customerId_Session
  if (!customerId && userId) {
    const { data: userData } = await supabase
      .from('Master_Users')
      .select('Customer_ID')
      .eq('Username', userId)
      .single()
    if (userData?.Customer_ID) customerId = userData.Customer_ID
  }

  if (!customerId && !isCust) {
    return { success: false, message: 'Unauthorized: Access restricted to customers only' }
  }
  if (!customerId) {
    return { success: false, message: 'Unauthorized: Customer ID not found' }
  }

  const validStops = (data.stops || []).filter(s => s.Dest_Location && s.Dest_Location.trim())
  if (validStops.length === 0) {
    return { success: false, message: 'กรุณาระบุปลายทางอย่างน้อย 1 แห่ง' }
  }

  const { data: customer } = await supabase
    .from('Master_Customers')
    .select('Customer_Name, Branch_ID')
    .eq('Customer_ID', customerId)
    .single()

  const userBranchId = await getUserBranchId()
  const branch = customer?.Branch_ID || userBranchId || 'HQ'
  const custName = customer?.Customer_Name || userId || 'Unknown Customer'

  const nowIso = new Date().toISOString()
  const rows: Record<string, unknown>[] = []
  let seq = 0
  for (const stop of validStops) {
    const vehicles = Math.min(Math.max(Number(stop.Vehicles) || 1, 1), 50) // guard 1..50
    for (let v = 0; v < vehicles; v++) {
      seq++
      const jobId = `REQ-${Date.now().toString().slice(-6)}-${seq}-${Math.floor(Math.random() * 1000)}`
      rows.push({
        Job_ID: jobId,
        Customer_ID: customerId,
        Customer_Name: custName,
        Branch_ID: branch,
        Plan_Date: data.Plan_Date,
        Delivery_Date: data.Plan_Date,
        Origin_Location: data.Origin_Location,
        Dest_Location: stop.Dest_Location.trim(),
        Cargo_Type: stop.Cargo_Type || data.Cargo_Type || '',
        Notes: stop.Notes || data.Notes || '',
        Job_Status: 'Requested',
        Weight_Kg: 0,
        Volume_Cbm: 0,
        Price_Cust_Total: 0,
        Cost_Driver_Total: 0,
        Est_Distance_KM: 0,
        Created_At: nowIso,
      })
    }
  }

  const { error } = await supabase.from('Jobs_Main').insert(rows)
  if (error) {
    return { success: false, message: 'Failed to submit request: ' + error.message }
  }

  revalidatePath('/dashboard')
  revalidatePath('/planning')

  await logActivity({
    module: 'Jobs',
    action_type: 'CREATE',
    target_id: `BATCH-${rows.length}`,
    details: {
      type: 'CUSTOMER_REQUEST_BATCH',
      customer: custName,
      jobs: rows.length,
      stops: validStops.length,
    },
  })

  return { success: true, message: `ส่งคำขอ ${rows.length} งานเรียบร้อย`, count: rows.length }
}

import { transitionJobStatus } from "@/services/job-status-machine"

export async function cancelJobRequest(jobId: string) {
  const customerId = await getCustomerId()

  if (!customerId) {
    return { success: false, message: 'Unauthorized' }
  }

  // Perform transition using machine (validates ownership inside or we can trust the current logic)
  const result = await transitionJobStatus(jobId, 'Cancelled', {
    reason: 'Customer cancellation'
  })

  if (!result.success) {
    return { success: false, message: result.message }
  }

  revalidatePath('/dashboard')
  revalidatePath('/planning')
  revalidatePath('/jobs/history')

  return { success: true, message: 'Job request cancelled successfully' }
}

export async function fixMissingBranches(targetBranchId: string) {
    const isSuper = await isSuperAdmin()
    if (!isSuper) return { success: false, message: 'Unauthorized' }
    
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('Jobs_Main')
        .update({ Branch_ID: targetBranchId })
        .is('Branch_ID', null)
        .select()
        
    if (error) return { success: false, message: error.message }
    
    revalidatePath('/planning')
    revalidatePath('/dashboard')
    
    return { success: true, message: `Successfully updated ${data?.length || 0} jobs to branch ${targetBranchId}` }
}

import { publishDraftJobs } from '@/lib/supabase/jobs'

export async function publishAllDrafts(date: string, branchId?: string) {
    try {
        const { success, jobs, error } = await publishDraftJobs(date, branchId)
        
        if (!success) {
            return { success: false, error: error || { message: "Failed to update jobs in database" } }
        }
        const publishedJobs = jobs ?? []

        if (publishedJobs.length > 0) {
            // Group jobs by driver to consolidate notifications
            const driverJobs = new Map<string, number>()
            
            publishedJobs.forEach((job: Partial<JobFormData>) => {
                if (job.Driver_ID) {
                    driverJobs.set(job.Driver_ID, (driverJobs.get(job.Driver_ID) || 0) + 1)
                }
            })

            // Fire notifications in parallel (one per driver)
            const notificationPromises = Array.from(driverJobs.entries()).map(([driverId, count]) => {
                if (count === 1) {
                    const job = publishedJobs.find((j: Partial<JobFormData>) => j.Driver_ID === driverId)
                    return notifyDriverNewJob(driverId, job?.Job_ID || '', job?.Customer_Name || 'N/A')
                } else {
                    return notifyDriverNewBatch(driverId, count)
                }
            })

            // Marketplace jobs (those without assigned drivers)
            const marketplaceJobs = publishedJobs.filter((j: Partial<JobFormData>) => !j.Driver_ID)
            const marketplacePromises = marketplaceJobs.map((job: Partial<JobFormData>) => 
                notifyMarketplaceNewJob(job.Job_ID || '', job.Customer_Name || 'N/A')
            )

            // Wait for all notifications
            await Promise.allSettled([...notificationPromises, ...marketplacePromises])
            
            revalidatePath('/planning')
            revalidatePath('/dashboard')
            revalidatePath('/mobile/jobs')
        }

        return { success: true, jobsCount: publishedJobs.length }
    } catch (e) {
        console.error('[Actions] publishAllDrafts error:', e)
        return { success: false, error: { message: e instanceof Error ? e.message : "Internal Server Error" } }
    }
}

export async function getFreshJob(jobId: string) {
    return await getJobById(jobId)
}
