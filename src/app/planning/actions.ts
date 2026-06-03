'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

import { getAllDriversFromTable } from '@/lib/supabase/drivers'
import { getAllVehiclesFromTable } from '@/lib/supabase/vehicles'
import { logActivity } from '@/lib/supabase/logs'
import { getUserBranchId, getFixedUserBranchId } from '@/lib/permissions'
import { notifyDriverNewJob, notifyMarketplaceNewJob, notifyDriverNewBatch } from '@/lib/actions/push-actions'
import { getCustomerId, getUserId, isCustomer, isSuperAdmin, isAdmin } from '@/lib/permissions'
import { sanitizeJobData } from '@/lib/supabase/utils'
import { getFuelPriceNumber, getSuggestedRate } from '@/lib/actions/fuel-actions'
import { optimizeRoute, RoutePoint } from '@/lib/ai/route-optimizer'

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
}

const parseIfString = (val: string | undefined | null) => {
  if (!val) return null
  if (typeof val !== 'string') return val
  try { return JSON.parse(val) } catch { return val }
}

export async function createJob(data: JobFormData) {
  const supabase = createAdminClient()

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
    const { data: driver } = await supabase
      .from('Master_Drivers')
      .select('Driver_Name, Sub_ID, Show_Price_Default')
      .eq('Driver_ID', data.Driver_ID)
      .single()
    if (driver) {
      if (!driverName) driverName = driver.Driver_Name
      if (!subId) subId = driver.Sub_ID || null
      // Default to driver preference if not explicitly set in form
      if (data.Show_Price_To_Driver === undefined) {
         data.Show_Price_To_Driver = driver.Show_Price_Default ?? true
      }
    }
  }

  // If subId still null, try looking up via Vehicle_Plate
  if (!subId && data.Vehicle_Plate) {
    const { data: vehicle } = await supabase
      .from('Master_Vehicles')
      .select('Sub_ID')
      .eq('Vehicle_Plate', data.Vehicle_Plate)
      .single()
    if (vehicle) subId = vehicle.Sub_ID || null
  }

  // Get Smart Unit Price for auto-calculation if total is 0
  let unitPrice = 0
  if ((!data.Price_Cust_Total || Number(data.Price_Cust_Total) === 0) && data.Customer_ID) {
    unitPrice = await getSmartUnitPrice(supabase, data.Customer_ID, data.Plan_Date || undefined, data.Vehicle_Type || '4-Wheel')
  }

  // Attempt 1
  const { error: error1 } = await supabase.from('Jobs_Main').insert(buildInsertPayload(data, driverName, subId, unitPrice))
  
  if (!error1) {
      // Send notifications - ONLY if NOT a draft
      if (data.Job_Status !== 'Draft') {
          if (data.Driver_ID) {
              try { await notifyDriverNewJob(data.Driver_ID, data.Job_ID, data.Customer_Name || 'ไม่ระบุ') } catch (e) { console.error(e) }
          } else {
              try { await notifyMarketplaceNewJob(data.Job_ID, data.Customer_Name || 'ไม่ระบุ') } catch (e) { console.error(e) }
          }
      }

      revalidatePath('/planning')
      
      // Auto-save locations for future use
      // Disable auto-save to Master_Routes as per user request to prevent data clutter
      // autoSaveOriginDestinations(data.Branch_ID || null, data.original_origins_json, data.original_destinations_json).catch(() => {})
      
      // Save Container Data if applicable
      await handleContainerData(supabase, data.Job_ID, data)

      return { success: true, message: 'Job created successfully' }
  }

  // If duplicate key (23505), try regenerating ID once
  if (error1.code === '23505') {
      const newId = `${data.Job_ID}-${Math.floor(Math.random() * 1000)}`
      const { error: error2 } = await supabase.from('Jobs_Main').insert(buildInsertPayload({ ...data, Job_ID: newId }, driverName, subId, unitPrice))
      
      if (!error2) {
          if (data.Job_Status !== 'Draft') {
              if (data.Driver_ID) {
                  try { await notifyDriverNewJob(data.Driver_ID, newId, data.Customer_Name || 'ไม่ระบุ') } catch (e) { console.error(e) }
              } else {
                  try { await notifyMarketplaceNewJob(newId, data.Customer_Name || 'ไม่ระบุ') } catch (e) { console.error(e) }
              }
          }

          // Save Container Data if applicable
          await handleContainerData(supabase, newId, data)

          revalidatePath('/planning')
          revalidatePath('/dashboard')
          revalidatePath('/jobs/history')
          return { success: true, message: `Job created with new ID: ${newId}` }
      }
      return { success: false, message: `Failed to create job (Duplicate ID): ${error2.message}` }
  }

  return { success: false, message: `Failed to create job: ${error1.message}` }
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
      original_origins_json: parseIfString(data.original_origins_json),
      original_destinations_json: parseIfString(data.original_destinations_json),
      extra_costs_json: parseIfString(data.extra_costs_json),
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
      Total_Drop: Array.isArray(parseIfString(data.original_destinations_json)) 
        ? (parseIfString(data.original_destinations_json) as any[]).length 
        : (data.original_destinations_json ? 1 : 1),
      Loaded_Qty: Number(data.Loaded_Qty) || 0,
      Created_At: new Date().toISOString(),
      job_type: data.job_type || 'normal',
      chassis_plate: data.chassis_plate || null
  }
}

async function handleContainerData(supabase: any, jobId: string, data: JobFormData) {
  if (data.job_type !== 'container') return

  const containerData = {
    job_id: jobId,
    container_no: data.container_no || null,
    seal_no: data.seal_no || null,
    container_size: data.container_size || null,
    shipping_line: data.shipping_line || null,
    vessel_voyage: data.vessel_voyage || null,
    lfd_demurrage: data.lfd_demurrage || null,
    lfd_detention: data.lfd_detention || null,
    target_temperature: data.target_temperature ? Number(data.target_temperature) : null,
    booking_no: data.booking_no || null,
    container_subtype: data.container_subtype || 'import',
    pickup_empty_date: data.pickup_empty_date || null,
    port_closing_datetime: data.port_closing_datetime || null,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase
    .from('jobs_container')
    .upsert(containerData, { onConflict: 'job_id' })

  if (error) console.error('[CONTAINER_ERROR] Failed to save container data:', error)
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
    supabase.from('Master_Vehicles').select('Vehicle_Plate, Sub_ID'),
    supabase.from('Master_Customers').select('Customer_ID, Customer_Name'),
    supabase.from('Master_Routes').select('*')
  ])

  const driverMap = new Map<string, any>(allDrivers?.map((d: { Driver_ID: string; Driver_Name: string; Sub_ID?: string | null }) => [d.Driver_ID, d]) || [])
  const vehicleMap = new Map<string, any>(allVehicles?.map((v: { Vehicle_Plate: string; Sub_ID?: string | null }) => [v.Vehicle_Plate, v]) || [])
  const customerMap = new Map<string, any>(allCustomers?.map((c: { Customer_ID: string; Customer_Name?: string | null }) => [c.Customer_Name?.toLowerCase().trim(), c.Customer_ID]) || [])
  const routeMap = new Map<string, any>(allRoutes?.map((r: { Route_Name?: string | null; Origin?: string | null; Destination?: string | null; Origin_Lat?: number | null; Origin_Lon?: number | null; Dest_Lat?: number | null; Dest_Lon?: number | null; Distance_KM?: number | null }) => [r.Route_Name?.trim(), r]) || [])

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
    normalized.Customer_ID = getValue(['Customer_ID', 'cust_id', 'รหัสลูกค้า'])
    normalized.Customer_Name = getValue(['Customer_Name', 'customer', 'ลูกค้า', 'ชื่อลูกค้า'])
    normalized.Route_Name = getValue(['Route_Name', 'route', 'เส้นทาง'])
    normalized.Driver_ID = getValue(['Driver_ID', 'driver', 'รหัสคนขับ'])
    normalized.Vehicle_Plate = getValue(['Vehicle_Plate', 'plate', 'ทะเบียนรถ', 'ทะเบียน'])
    normalized.Weight_Kg = getValue(['Weight_Kg', 'weight', 'น้ำหนัก', 'น้ำหนักสินค้า'])
    normalized.Volume_Cbm = getValue(['Volume_Cbm', 'volume', 'ปริมาตร', 'คิว'])
    normalized.Price_Cust_Total = getValue(['Price_Cust_Total', 'price', 'รายได้', 'ราคาขาย', 'ราคาลูกค้า'])
    normalized.Cost_Driver_Total = getValue(['Cost_Driver_Total', 'cost', 'ต้นทุน', 'ค่ารถ', 'จ่ายคนขับ', 'ค่าเที่ยว'])
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

    // Multi-Origin & Destination Detection
    const origins: { name: string, lat: number | null, lng: number | null }[] = []
    const destinations: { name: string, lat: number | null, lng: number | null }[] = []
    const rowKeys = Object.keys(row)
    
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
        const val = (row as any)[key]
        if (val && String(val).trim()) {
            origins.push({ name: String(val).trim(), lat: null, lng: null })
        }
    })

    if (origins.length > 0) {
        normalized.original_origins_json = origins
    }

    // 2. Destinations Mapping
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
        const val = (row as any)[key]
        if (val && String(val).trim()) {
            destinations.push({ name: String(val).trim(), lat: null, lng: null })
        }
    })

    if (destinations.length > 0) {
        normalized.original_destinations_json = destinations
    }

    return normalized
  }

  const cleanId = (val: any) => {
    if (val === undefined || val === null) return undefined
    const s = String(val).trim()
    if (s.endsWith('.0')) return s.slice(0, -2)
    return s
  }

  const normalizeDate = (val: any) => {
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

  const cleanData = jobs.map(j => {
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
      Plan_Date: normalizeDate(data.Plan_Date) || new Date().toISOString().split('T')[0],
      Customer_ID: (data.Customer_ID as string) || customerMap.get((data.Customer_Name as string)?.toLowerCase().trim()) || null,
      Customer_Name: data.Customer_Name as string,
      Route_Name: route?.Route_Name || (data.Route_Name as string) || 'Direct',
      Driver_ID: driverId || null,
      Driver_Name: driver?.Driver_Name || null,
      Vehicle_Plate: vehiclePlate || null,
      Job_Status: (data.Job_Status as string) || 'New',
      Notes: data.Notes as string || null,
      Price_Cust_Total: Number(data.Price_Cust_Total) || 0,
      Cost_Driver_Total: Number(data.Cost_Driver_Total) || 0,
      Sub_ID: driver?.Sub_ID || (vehicle as any)?.Sub_ID || null,
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
    const fullJobData: any = {
        ...sanitized,
        container_no: data.container_no,
        seal_no: data.seal_no,
        container_size: data.container_size,
        shipping_line: data.shipping_line,
        vessel_voyage: data.vessel_voyage,
        lfd_demurrage: data.lfd_demurrage,
        lfd_detention: data.lfd_detention,
        target_temperature: data.target_temperature
    }
    
    if (typeof sanitized.Price_Cust_Total === 'string') fullJobData.Price_Cust_Total = parseFloat(sanitized.Price_Cust_Total) || 0
    if (typeof sanitized.Cost_Driver_Total === 'string') fullJobData.Cost_Driver_Total = parseFloat(sanitized.Cost_Driver_Total) || 0
    
    return fullJobData
  }).filter((j: any) => j.Customer_Name)

  // Apply Draft status if requested via options
  const finalCleanData: any[] = options.isDraft 
    ? cleanData.map(j => ({ ...j, Job_Status: 'Draft' }))
    : cleanData

  // Apply Auto-calculation asynchronously to support fuel lookups
  const finalizedData = await Promise.all(finalCleanData.map(async (j) => {
    let total = Number(j.Price_Cust_Total) || 0
    if (total === 0 && j.Customer_ID) {
        const unitPrice = await getSmartUnitPrice(supabase, j.Customer_ID, j.Plan_Date, j.Vehicle_Type || '4-Wheel')
        const qty = Number(j.Weight_Kg || j.Volume_Cbm || 0)
        if (unitPrice > 0 && qty > 0) {
            total = Number((qty * unitPrice).toFixed(2))
        }
    }
    const roundInfo = j.Round ? `[รอบ: ${j.Round}] ` : ''
    return { 
      ...j, 
      Price_Cust_Total: total,
      Notes: j.Notes ? (j.Notes.startsWith('[รอบ:') ? j.Notes : `${roundInfo}${j.Notes}`) : (j.Round ? `[รอบ: ${j.Round}]` : j.Notes)
    }
  }))

  if (finalizedData.length === 0) {
     return { success: false, message: 'ไม่พบข้อมูลที่ถูกต้อง (ต้องระบุชื่อลูกค้า)' }
  }

  const { error } = await supabase
    .from('Jobs_Main')
    .upsert(finalizedData, { onConflict: 'Job_ID' })

  if (error) {
    return { success: false, message: `Failed to import: ${error.message}` }
  }

  // Save Container Data for each job (if applicable)
  await Promise.allSettled(finalizedData.map(j => handleContainerData(supabase, j.Job_ID, j as JobFormData)))

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
          plan_date: j.Plan_Date,
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

      const notiPromises: Promise<any>[] = []
      
      finalizedData.forEach(j => {
          if (j.Driver_ID) {
              assignedDrivers.add(j.Driver_ID)
              // Only notify about the first job for this driver in this batch to avoid spam
              if (j.Job_Status !== 'Draft') {
                  notiPromises.push(notifyDriverNewJob(j.Driver_ID, j.Job_ID, j.Customer_Name || 'ไม่ระบุ'))
              }
          } else {
              hasMarketplaceJob = true
              sampleJobId = j.Job_ID
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

  const uniqueDates = Array.from(new Set((finalizedData as any[]).map(j => j.Plan_Date))).filter(Boolean)
  const dateStr = uniqueDates.length === 1 ? ` for ${uniqueDates[0]}` : ""
  
  return { 
    success: true, 
    message: `Successfully imported ${finalizedData.length} jobs${dateStr}` 
  }
}


/**
 * Helper to get the most appropriate unit price based on fuel rates or master data
 */
async function getSmartUnitPrice(supabase: any, customerId: string, planDate?: string, vehicleType: string = '4-Wheel'): Promise<number> {
    if (!customerId) return 0
    
    try {
        // 1. Try to find a dynamic rate based on fuel for 'SYSTEM_PER_PIECE'
        const fuelPrice = await getFuelPriceNumber(planDate || undefined)
        if (fuelPrice) {
            const suggestedRate = await getSuggestedRate(customerId, 'SYSTEM_PER_PIECE', fuelPrice, vehicleType)
            if (suggestedRate && suggestedRate > 0) {
                return suggestedRate
            }
        }

        // 2. Fallback to static price in Master_Customers
        const { data: cust } = await supabase
            .from("Master_Customers")
            .select("Price_Per_Unit")
            .eq("Customer_ID", customerId)
            .single()
        
        return Number(cust?.Price_Per_Unit || 0)
    } catch (err) {
        console.error("[PRICE_ERROR] Failed to fetch smart unit price:", err)
        return 0
    }
}

export async function updateJob(jobId: string, data: Partial<JobFormData>) {
  const isAdminUser = await isAdmin()
  const supabase = isAdminUser ? createAdminClient() : await createClient()

  const updateData = sanitizeJobData({ ...data })
  
  // Ensure JSON fields are parsed if they are strings
  if (data.extra_costs_json) updateData.extra_costs_json = parseIfString(data.extra_costs_json)
  if (data.original_origins_json) updateData.original_origins_json = parseIfString(data.original_origins_json)
  if (data.original_destinations_json) {
    const dests = parseIfString(data.original_destinations_json)
    updateData.original_destinations_json = dests
    if (Array.isArray(dests)) {
      updateData.Total_Drop = dests.length
    }
  }

  
  // Update Driver Name and Sub_ID if Driver_ID specifically changes
  if (data.Driver_ID) {
    const { data: driver } = await supabase
      .from('Master_Drivers')
      .select('Driver_Name, Sub_ID')
      .eq('Driver_ID', data.Driver_ID)
      .single()
    if (driver) {
       updateData.Driver_Name = driver.Driver_Name
       if (!updateData.Sub_ID) updateData.Sub_ID = driver.Sub_ID || null
    }
  }

  // Also check Vehicle_Plate for Sub_ID if still not present
  if (!updateData.Sub_ID && data.Vehicle_Plate) {
    const { data: vehicle } = await supabase
      .from('Master_Vehicles')
      .select('Sub_ID')
      .eq('Vehicle_Plate', data.Vehicle_Plate)
      .single()
    if (vehicle) updateData.Sub_ID = vehicle.Sub_ID || null
  }
  
  // Auto-calculate Price_Cust_Total for updates 
  // Trigger if Price_Cust_Total is missing/0 OR if Loaded_Qty was explicitly updated
  if ((!updateData.Price_Cust_Total || Number(updateData.Price_Cust_Total) === 0) || (data.Loaded_Qty !== undefined)) {
     // 1. Get current job metadata
     const { data: currentJob } = await supabase
        .from('Jobs_Main')
        .select('Customer_ID, Loaded_Qty, Plan_Date, Vehicle_Type')
        .eq('Job_ID', jobId)
        .single()

     const targetCustomerId = updateData.Customer_ID || currentJob?.Customer_ID
     
     if (targetCustomerId) {
         // 2. Fetch Smart Unit Price (considering fuel)
         const unitPrice = await getSmartUnitPrice(
             supabase, 
             targetCustomerId, 
             updateData.Plan_Date || currentJob?.Plan_Date,
             updateData.Vehicle_Type || currentJob?.Vehicle_Type || '4-Wheel'
         )
         
         const qty = Number((updateData.Loaded_Qty ?? currentJob?.Loaded_Qty) || 0)
         
         if (unitPrice > 0 && qty > 0) {
             updateData.Price_Cust_Total = Number((qty * unitPrice).toFixed(2))
         }
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

  return { success: true, message: 'Job updated successfully' }
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
      customers = customers.filter((c: any) => c.Branch_ID === branchId)
      routes = routes.filter((r: any) => r.Branch_ID === branchId)
      subcontractors = subcontractors.filter((s: any) => s.Branch_ID === branchId)
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

export async function cancelJobRequest(jobId: string) {
  const supabase = await createClient()
  const customerId = await getCustomerId()

  if (!customerId) {
    return { success: false, message: 'Unauthorized' }
  }

  // Verify ownership and status
  const { data: job, error: fetchError } = await supabase
    .from('Jobs_Main')
    .select('Job_Status')
    .eq('Job_ID', jobId)
    .eq('Customer_ID', customerId)
    .single()

  if (fetchError || !job) {
    return { success: false, message: 'Job not found or unauthorized' }
  }

  if (job.Job_Status !== 'Requested' && job.Job_Status !== 'New') {
    return { success: false, message: 'Only Requested or New jobs can be cancelled' }
  }

  const { error } = await supabase
    .from('Jobs_Main')
    .update({ Job_Status: 'Cancelled' })
    .eq('Job_ID', jobId)

  if (error) {
    return { success: false, message: 'Failed to cancel job: ' + error.message }
  }

  revalidatePath('/dashboard')
  revalidatePath('/planning')
  revalidatePath('/jobs/history')

  await logActivity({
    module: 'Jobs',
    action_type: 'UPDATE',
    target_id: jobId,
    details: {
      description: `Customer cancelled job request ${jobId}`
    }
  })

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

        if (jobs.length > 0) {
            // Group jobs by driver to consolidate notifications
            const driverJobs = new Map<string, number>()
            
            jobs.forEach((job: any) => {
                if (job.Driver_ID) {
                    driverJobs.set(job.Driver_ID, (driverJobs.get(job.Driver_ID) || 0) + 1)
                }
            })

            // Fire notifications in parallel (one per driver)
            const notificationPromises = Array.from(driverJobs.entries()).map(([driverId, count]) => {
                if (count === 1) {
                    const job = jobs.find((j: any) => j.Driver_ID === driverId)
                    return notifyDriverNewJob(driverId, job!.Job_ID, job!.Customer_Name || 'N/A')
                } else {
                    return notifyDriverNewBatch(driverId, count)
                }
            })

            // Marketplace jobs (those without assigned drivers)
            const marketplaceJobs = jobs.filter((j: any) => !j.Driver_ID)
            const marketplacePromises = marketplaceJobs.map((job: any) => 
                notifyMarketplaceNewJob(job.Job_ID, job.Customer_Name || 'N/A')
            )

            // Wait for all notifications
            await Promise.allSettled([...notificationPromises, ...marketplacePromises])
            
            revalidatePath('/planning')
            revalidatePath('/dashboard')
            revalidatePath('/mobile/jobs')
        }

        return { success: true, jobsCount: jobs.length }
    } catch (e) {
        console.error('[Actions] publishAllDrafts error:', e)
        return { success: false, error: { message: e instanceof Error ? e.message : "Internal Server Error" } }
    }
}
