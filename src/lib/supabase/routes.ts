"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin, getUserRole, isAdmin } from "@/lib/permissions"

export type Route = {
  Route_Name: string
  Origin: string | null
  Origin_Lat: number | null
  Origin_Lon: number | null
  Origin_Phone: string | null
  Map_Link_Origin: string | null
  Destination: string | null
  Dest_Lat: number | null
  Dest_Lon: number | null
  Dest_Phone: string | null
  Map_Link_Destination: string | null
  Distance_KM: number | null
  Branch_ID: string | null
  Created_At?: string
}

export type Branch = {
  Branch_ID: string
  Branch_Name: string
}

export async function getCurrentUserRole() {
  try {
    const role = await getUserRole()
    return role
  } catch {
    return null
  }
}

// Get all routes
export async function getAllRoutes(page?: number, limit?: number, query?: string, branchId?: string) {
  try {
    const isAdminUser = await isAdmin()
    const supabase = isAdminUser ? createAdminClient() : await createClient()
    let queryBuilder = supabase.from('Master_Routes').select('*', { count: 'exact' })
    
    if (page && limit) {
      const from = (page - 1) * limit
      const to = from + limit - 1
      queryBuilder = queryBuilder.range(from, to)
    }
    
    if (query) {
      queryBuilder = queryBuilder.or(`Route_Name.ilike.%${query}%,Origin.ilike.%${query}%,Destination.ilike.%${query}%`)
    }

    // Unified Branch Filtering
    const userBranchId = await getUserBranchId()
    const isSuper = await isSuperAdmin()

    // STRICT ISOLATION
    if (!isSuper) {
        if (userBranchId && userBranchId !== 'All') {
            queryBuilder = queryBuilder.eq('Branch_ID', userBranchId)
        } else {
            return { data: [], count: 0 }
        }
    } else {
        // Only Super Admins can use the provided branch filter
        const targetBranch = branchId || userBranchId
        if (targetBranch && targetBranch !== 'All') {
            queryBuilder = queryBuilder.eq('Branch_ID', targetBranch)
        }
    }


    
    const { data, error, count } = await queryBuilder.order('Route_Name', { ascending: true })
    
    if (error) {
      return { data: [], count: 0 }
    }
    
    return { data: data || [], count: count || 0 }
  } catch {
    return { data: [], count: 0 }
  }
}

// Get all branches
export async function getBranches() {
  try {
    const isSuper = await isSuperAdmin()
    const userBranchId = await getUserBranchId()
    const isAdminUser = await isAdmin()
    const supabase = isAdminUser ? await createAdminClient() : await createClient()
    
    let query = supabase.from('Master_Branches').select('Branch_ID, Branch_Name')

    // STRICT ISOLATION for dropdowns
    if (!isSuper) {
        if (userBranchId && userBranchId !== 'All') {
            query = query.eq('Branch_ID', userBranchId)
        } else {
            return []
        }
    }



    const { data, error } = await query.order('Branch_Name')
    
    if (error) {
       return []
    }
    return data || []
  } catch {
    return []
  }
}

// Create route
export async function createRoute(routeData: Partial<Route>) {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    
    // Route_Name is PK, must be provided
    if (!routeData.Route_Name) {
        return { success: false, error: "Route Name is required" }
    }

    const { data, error } = await supabase
      .from('Master_Routes')
      .insert({
        Route_Name: routeData.Route_Name,
        Origin: routeData.Origin,
        Origin_Lat: routeData.Origin_Lat,
        Origin_Lon: routeData.Origin_Lon,
        Origin_Phone: routeData.Origin_Phone,
        Map_Link_Origin: routeData.Map_Link_Origin,
        Destination: routeData.Destination,
        Dest_Lat: routeData.Dest_Lat,
        Dest_Lon: routeData.Dest_Lon,
        Dest_Phone: routeData.Dest_Phone,
        Map_Link_Destination: routeData.Map_Link_Destination,
        Distance_KM: routeData.Distance_KM,
        Branch_ID: (isSuper && routeData.Branch_ID && routeData.Branch_ID !== 'All') 
                    ? routeData.Branch_ID 
                    : ((await getUserBranchId()) !== 'All' ? await getUserBranchId() : 'HQ')


      })
      .select()
      .single()
    
    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true, data }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return { success: false, error: message }
  }
}

// Update route
export async function updateRoute(originalRouteName: string, routeData: Partial<Route>) {
  try {
    const isAdminUser = await isAdmin()
    const supabase = isAdminUser ? await createAdminClient() : await createClient()
    const { data, error } = await supabase
      .from('Master_Routes')
      .update({
        Route_Name: routeData.Route_Name,
        Origin: routeData.Origin,
        Origin_Lat: routeData.Origin_Lat,
        Origin_Lon: routeData.Origin_Lon,
        Origin_Phone: routeData.Origin_Phone,
        Map_Link_Origin: routeData.Map_Link_Origin,
        Destination: routeData.Destination,
        Dest_Lat: routeData.Dest_Lat,
        Dest_Lon: routeData.Dest_Lon,
        Dest_Phone: routeData.Dest_Phone,
        Map_Link_Destination: routeData.Map_Link_Destination,
        Distance_KM: routeData.Distance_KM,
        Branch_ID: routeData.Branch_ID
      })
      .eq('Route_Name', originalRouteName)
      .select()
      .single()
    
    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true, data }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return { success: false, error: message }
  }
}

// Delete route
export async function deleteRoute(routeName: string) {
  try {
    const isAdminUser = await isAdmin()
    const supabase = isAdminUser ? await createAdminClient() : await createClient()
    const { error } = await supabase
      .from('Master_Routes')
      .delete()
      .eq('Route_Name', routeName)
    
    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return { success: false, error: message }
  }
}

// Bulk create routes
export async function createBulkRoutes(routes: Record<string, unknown>[]) {
    try {
        const isSuper = await isSuperAdmin()
        const isAdminUser = await isAdmin()
        const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
        const currentUserBranch = await getUserBranchId()
        
        // Fetch All Branches to map Name -> ID
        const { data: branches } = await supabase.from('Master_Branches').select('Branch_ID, Branch_Name')
        const branchMap = new Map<string, string>()
        if (branches) {
            branches.forEach((b: any) => {
                branchMap.set(b.Branch_Name.trim(), b.Branch_ID)
                branchMap.set(b.Branch_ID, b.Branch_ID)
            })
        }

        // Normalize keys
        const normalizeData = (row: Record<string, unknown>) => {
            const normalized: Partial<Route> = {}
            const getValue = (keys: string[]) => {
                const rowKeys = Object.keys(row)
                for (const key of keys) {
                    const foundKey = rowKeys.find(k => k.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase().replace(/\s+/g, '_'))
                    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
                        return row[foundKey]
                    }
                }
                return undefined
            }
    
            normalized.Route_Name = getValue(['route_name', 'name', 'route', 'ชื่อเส้นทาง', 'เส้นทาง']) as string
            normalized.Origin = getValue(['origin', 'source', 'start', 'ต้นทาง', 'จุดเริ่มต้น']) as string
            normalized.Origin_Lat = getValue(['origin_lat', 'start_lat', 'lat_start', 'ละติจูดต้นทาง', 'lat_ต้นทาง']) as number
            normalized.Origin_Lon = getValue(['origin_lon', 'start_lon', 'lon_start', 'ลองติจูดต้นทาง', 'lon_ต้นทาง']) as number
            normalized.Origin_Phone = getValue(['origin_phone', 'start_phone', 'phone_start', 'เบอร์ต้นทาง', 'เบอร์โทรต้นทาง']) as string
            normalized.Destination = getValue(['destination', 'dest', 'end', 'ปลายทาง', 'จุดสิ้นสุด']) as string
            normalized.Dest_Lat = getValue(['dest_lat', 'end_lat', 'lat_end', 'ละติจูดปลายทาง', 'lat_ปลายทาง']) as number
            normalized.Dest_Lon = getValue(['dest_lon', 'end_lon', 'lon_end', 'ลองติจูดปลายทาง', 'lon_ปลายทาง']) as number
            normalized.Dest_Phone = getValue(['dest_phone', 'end_phone', 'phone_end', 'เบอร์ปลายทาง', 'เบอร์โทรปลายทาง']) as string
            normalized.Map_Link_Origin = getValue(['map_link_origin', 'origin_link', 'link_start', 'ลิ้งค์ต้นทาง']) as string
            normalized.Map_Link_Destination = getValue(['map_link_destination', 'destination_link', 'link_end', 'ลิ้งค์ปลายทาง']) as string
            normalized.Distance_KM = getValue(['distance', 'km', 'distance_km', 'ระยะทาง']) as number
            
            normalized.Branch_ID = getValue(['branch_id', 'branch', 'สาขา', 'รหัสสาขา']) as string
            
            return normalized
        }
    
        const cleanData = routes.map(r => normalizeData(r)).filter(r => r.Route_Name)
    
        if (cleanData.length === 0) {
            return { success: false, message: "ไม่พบข้อมูลที่ถูกต้อง (ต้องมีชื่อเส้นทาง)" }
        }

        // Prepare data with Branch ID resolved
        const preparedRoutes: Route[] = cleanData.map(r => {
             // Resolve Branch ID
             let branchId = (currentUserBranch && currentUserBranch !== 'All') ? currentUserBranch : 'HQ'
             if (r.Branch_ID) {
                 const key = String(r.Branch_ID).trim()
                 if (branchMap.has(key)) {
                     branchId = branchMap.get(key) || 'HQ'
                 } else {
                     const found = branches?.find((b: any) => {
                         const bName = String(b.Branch_Name || '')
                         return bName && (bName.includes(key) || key.includes(bName))
                     })
                     if (found) {
                         branchId = found.Branch_ID
                     }
                 }
             }

             return {
                Route_Name: r.Route_Name as string,
                Origin: r.Origin ?? null,
                Origin_Lat: r.Origin_Lat ? parseFloat(String(r.Origin_Lat)) : null,
                Origin_Lon: r.Origin_Lon ? parseFloat(String(r.Origin_Lon)) : null,
                Origin_Phone: r.Origin_Phone ?? null,
                Map_Link_Origin: r.Map_Link_Origin ?? null,
                Destination: r.Destination ?? null,
                Dest_Lat: r.Dest_Lat ? parseFloat(String(r.Dest_Lat)) : null,
                Dest_Lon: r.Dest_Lon ? parseFloat(String(r.Dest_Lon)) : null,
                Dest_Phone: r.Dest_Phone ?? null,
                Map_Link_Destination: r.Map_Link_Destination ?? null,
                Distance_KM: r.Distance_KM ? parseFloat(String(r.Distance_KM)) : null,
                Branch_ID: branchId
             }
        })

        // Check for existing routes
        const namesToCheck = preparedRoutes.map(r => r.Route_Name)
        
        const { data: existingRoutes } = await supabase
            .from('Master_Routes')
            .select('Route_Name')
            .in('Route_Name', namesToCheck)

        const existingNames = new Set(existingRoutes?.map((r: any) => r.Route_Name) || [])
        
        const toInsert: Route[] = []
        const toUpdate: Route[] = []

        preparedRoutes.forEach(r => {
            if (existingNames.has(r.Route_Name)) {
                toUpdate.push(r)
            } else {
                toInsert.push(r)
            }
        })

        // 1. Perform Inserts
        if (toInsert.length > 0) {
            const { error } = await supabase.from('Master_Routes').insert(toInsert)
            if (error) {
                return { success: false, message: `Failed to import new routes: ${error.message}` }
            }
        }

        // 2. Perform Updates
        if (toUpdate.length > 0) {
            await Promise.all(toUpdate.map(async (r) => {
                await supabase.from('Master_Routes')
                    .update({
                        Origin: r.Origin,
                        Origin_Lat: r.Origin_Lat,
                        Origin_Lon: r.Origin_Lon,
                        Origin_Phone: r.Origin_Phone,
                        Map_Link_Origin: r.Map_Link_Origin,
                        Destination: r.Destination,
                        Dest_Lat: r.Dest_Lat,
                        Dest_Lon: r.Dest_Lon,
                        Dest_Phone: r.Dest_Phone,
                        Map_Link_Destination: r.Map_Link_Destination,
                        Distance_KM: r.Distance_KM,
                        Branch_ID: r.Branch_ID
                    })
                    .eq('Route_Name', r.Route_Name)
            }))
        }
    
        return { 
            success: true, 
            message: `นำเข้าสำเร็จ: เพิ่มใหม่ ${toInsert.length} รายการ, อัปเดต ${toUpdate.length} รายการ`
        }

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return { success: false, message: message }
    }
}

// Get all unique locations (Origin + Destination) for autocomplete
export async function getUniqueLocations() {
  try {
    const isSuper = await isSuperAdmin()
    const isAdminUser = await isAdmin()
    const supabase = (isSuper || isAdminUser) ? await createAdminClient() : await createClient()
    
    const branchId = await getUserBranchId()
    
    // Fetch unique Origins
    let originsQuery = supabase
      .from('Master_Routes')
      .select('Origin')
      .not('Origin', 'is', null)
      
    if (branchId && branchId !== 'All' && !isSuper) {
        originsQuery = originsQuery.eq('Branch_ID', branchId)
    }

    const { data: origins } = await originsQuery
      
    // Fetch unique Destinations
    let destsQuery = supabase
      .from('Master_Routes')
      .select('Destination')
      .not('Destination', 'is', null)

    if (branchId && branchId !== 'All' && !isSuper) {
        destsQuery = destsQuery.eq('Branch_ID', branchId)
    }

    const { data: destinations } = await destsQuery

    const locationSet = new Set<string>()
    
    if (origins) {
        origins.forEach((o: any) => {
            if (o.Origin) locationSet.add(o.Origin.trim())
        })
    }
    
    if (destinations) {
        destinations.forEach((d: any) => {
            if (d.Destination) locationSet.add(d.Destination.trim())
        })
    }
    
    return Array.from(locationSet).sort()
  } catch {
    return []
  }
}

// Get all unique locations with their metadata (Lat, Lon, Phone)
export async function getLocationDirectory() {
  try {
    const isAdminUser = await isAdmin()
    const supabase = isAdminUser ? createAdminClient() : await createClient()
    
    const branchId = await getUserBranchId()
    const isSuper = await isSuperAdmin()
    
    let query = supabase.from('Master_Routes').select('Origin, Origin_Lat, Origin_Lon, Origin_Phone, Destination, Dest_Lat, Dest_Lon, Dest_Phone')

    if (branchId && branchId !== 'All' && !isSuper) {
        query = query.eq('Branch_ID', branchId)
    }

    const { data, error } = await query

    if (error) return {}

    const directory: Record<string, { lat: number | null, lon: number | null, phone: string | null }> = {}

    data.forEach((r: any) => {
        if (r.Origin) {
            const name = r.Origin.trim()
            if (!directory[name] || (!directory[name].phone && r.Origin_Phone)) {
                directory[name] = {
                    lat: r.Origin_Lat,
                    lon: r.Origin_Lon,
                    phone: r.Origin_Phone
                }
            }
        }
        if (r.Destination) {
            const name = r.Destination.trim()
            if (!directory[name] || (!directory[name].phone && r.Dest_Phone)) {
                directory[name] = {
                    lat: r.Dest_Lat,
                    lon: r.Dest_Lon,
                    phone: r.Dest_Phone
                }
            }
        }
    })

    return directory
  } catch {
    return {}
  }
}
