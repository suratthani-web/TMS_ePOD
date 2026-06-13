"use server";

import { createClient, createAdminClient } from "@/utils/supabase/server";
import { getUserBranchId, isSuperAdmin, isAdmin, getCustomerId } from "@/lib/permissions";
import { getDangerZones } from "./danger-zones";
import { isPointInPolygon } from "@/lib/utils";
import { sendDangerZoneAlert } from "../actions/email-actions";
import { type DangerZone } from "./danger-zones";

// Simple in-memory cache to save CPU/DB calls on Vercel
const globalZoneCache: Record<string, { zones: DangerZone[], timestamp: number }> = {};
const ZONE_CACHE_TTL = 300000; // 5 minutes cache

// Only treat a driver's last position as "live" on the map if it was reported
// within this window. Active drivers report at least every 5 minutes (see
// LocationTracker UPDATE_INTERVAL), so a position older than this means the
// driver has logged out / closed the app — we should not keep pinning them.
const LIVE_LOCATION_WINDOW_MINUTES = 30;
function liveLocationThreshold() {
  return new Date(Date.now() - LIVE_LOCATION_WINDOW_MINUTES * 60 * 1000).toISOString();
}

// Type matching actual Supabase schema (ProperCase columns!)
export type GPSLog = {
  Log_ID: string;
  Driver_ID: string;
  Vehicle_Plate?: string;
  Latitude: number;
  Longitude: number;
  Timestamp: string;
  Job_ID?: string;
  Speed?: number;
};

// บันทึกพิกัด GPS
export async function saveGPSLog(data: {
  driverId: string;
  vehiclePlate?: string;
  lat: number;
  lng: number;
  jobId?: string;
  speed?: number;
}) {
  try {
    const supabase = await createAdminClient();
    let plate = data.vehiclePlate;

    // Auto-fill vehicle plate if missing
    if (!plate) {
        const { data: driver } = await supabase
            .from('Master_Drivers')
            .select('Vehicle_Plate')
            .eq('Driver_ID', data.driverId)
            .single();
        if (driver?.Vehicle_Plate) plate = driver.Vehicle_Plate;
    }

    // Note: GPS_Logs table uses lowercase column names
    const { error } = await supabase
      .from("gps_logs") 
      .insert({
        driver_id: data.driverId,
        vehicle_plate: plate,
        latitude: data.lat,
        longitude: data.lng,
        job_id: data.jobId,
        speed: data.speed,
      });

    if (error) {
      console.error('[DEBUG] saveGPSLog error:', JSON.stringify(error, null, 2))
      return { success: false, error };
    }

    // --- DANGER ZONE CHECK ---
    try {
        const branchId = await getUserBranchId() || 'All';
        const now = Date.now();
        
        let activeZones: DangerZone[] = [];
        
        // Use cache if available and not expired
        if (globalZoneCache[branchId] && (now - globalZoneCache[branchId].timestamp < ZONE_CACHE_TTL)) {
            activeZones = globalZoneCache[branchId].zones;
        } else {
            const zones = await getDangerZones(branchId);
            activeZones = zones.filter((z: { Is_Active: boolean }) => z.Is_Active);
            globalZoneCache[branchId] = { zones: activeZones, timestamp: now };
            console.log(`[GPS] Cache updated for branch: ${branchId} (${activeZones.length} zones)`);
        }
        
        if (activeZones.length > 0) {
            for (const zone of activeZones) {
                if (isPointInPolygon([data.lat, data.lng], zone.Coordinates)) {
                    // Potential Incursion Detected!
                    console.warn(`[DANGER] Driver ${data.driverId} entered zone ${zone.Zone_Name}`);
                    
                    // Fetch driver details for email
                    const { data: driver } = await supabase
                        .from('Master_Drivers')
                        .select('Driver_Name, Vehicle_Plate')
                        .eq('Driver_ID', data.driverId)
                        .single();
                    
                    if (zone.Email_Recipient) {
                        await sendDangerZoneAlert({
                            plate: driver?.Vehicle_Plate || data.vehiclePlate || 'Unknown',
                            driverName: driver?.Driver_Name || 'Unknown',
                            zoneName: zone.Zone_Name,
                            timestamp: new Date().toLocaleString('th-TH'),
                            recipient: zone.Email_Recipient
                        });
                    }
                }
            }
        }
    } catch (dzError) {
        console.error("[GPS] Danger zone check failed:", dzError);
    }
    // -------------------------

    console.log('[DEBUG] saveGPSLog success for:', data.driverId)

    return { success: true };
  } catch (e) {
    return { success: false, error: e };
  }
}

// ดึงตำแหน่งล่าสุดของ Driver ทุกคน (สำหรับแสดงบน Map)
export async function getLatestDriverLocations() {
  try {
    const isSuper = await isSuperAdmin();
    const isRegularAdmin = await isAdmin();
    const customerId = await getCustomerId();
    const supabase = (isSuper || isRegularAdmin || customerId) ? await createAdminClient() : await createClient();

    const branchId = await getUserBranchId();

    // Query from the optimized Latest Locations table.
    // Only return positions reported recently, so drivers who logged out or
    // closed the app stop appearing pinned at their last location forever.
    let query = supabase
      .from("driver_latest_locations")
      .select(`
        *,
        Master_Drivers!inner ( Driver_Name, Branch_ID )
      `)
      .gte("timestamp", liveLocationThreshold());

    // Super Admin bypass: If 'All' or no branch selected, show all
    if (branchId && branchId !== "All" && !isSuper) {
       query = query.eq('Master_Drivers.Branch_ID', branchId);
    }

    const { data, error } = await query;

    if (error || !data) {
      // FALLBACK logic if table doesn't exist yet
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      let fallbackQuery = supabase
        .from("gps_logs")
        .select(`*, Master_Drivers!inner ( Driver_Name, Branch_ID )`)
        .gte("timestamp", oneHourAgo);

      if (branchId && branchId !== "All" && !isSuper) {
         fallbackQuery = fallbackQuery.eq('Master_Drivers.Branch_ID', branchId);
      }

      const { data: fallbackData, error: fallbackError } = await fallbackQuery
        .order("timestamp", { ascending: false })
        .limit(2000);

      if (fallbackError) return [];

      const latestLocations = new Map<string, any>();
      fallbackData?.forEach((log: any) => {
        const driverId = log.driver_id || log.Driver_ID;
        if (!latestLocations.has(driverId)) {
          latestLocations.set(driverId, {
            ...log,
            Driver_ID: driverId,
            Driver_Name: log.Master_Drivers?.Driver_Name || "Unknown Driver",
            Latitude: log.latitude || log.Latitude,
            Longitude: log.longitude || log.Longitude,
            Timestamp: log.timestamp || log.Timestamp,
          });
        }
      });
      
      const logs = Array.from(latestLocations.values());
      if (customerId) {
        const { data: activeJobs } = await supabase.from("Jobs_Main").select("Driver_ID")
          .eq("Customer_ID", customerId)
          .not("Driver_ID", "is", null)
          .not("Job_Status", "in", '("Complete", "Completed", "Cancelled", "Delivered")');
        const activeDriverIds = new Set(activeJobs?.map((j: { Driver_ID: string }) => j.Driver_ID) || []);
        return logs.filter((l) => activeDriverIds.has(l.Driver_ID));
      }
      return logs;
    }

    const logs = (data || []).map((log: any) => ({
      ...log,
      Driver_ID: log.Driver_ID || log.driver_id,
      Driver_Name: log.Master_Drivers?.Driver_Name || "Unknown Driver",
      Latitude: log.Latitude ?? log.latitude ?? null,
      Longitude: log.Longitude ?? log.longitude ?? null,
      Timestamp: log.Timestamp || log.timestamp || null,
    }));

    if (customerId) {
      // For customers, further security filter: only show locations of drivers on their active jobs
      const { data: activeJobs } = await supabase
        .from("Jobs_Main")
        .select("Driver_ID")
        .eq("Customer_ID", customerId)
        .not("Driver_ID", "is", null)
        .not("Job_Status", "in", '("Complete", "Completed", "Cancelled", "Delivered")');

      const activeDriverIds = new Set(activeJobs?.map((j: { Driver_ID: string }) => j.Driver_ID) || []);
      return logs.filter((l) => activeDriverIds.has(l.Driver_ID));
    }

    return logs;
  } catch (err) {
    console.error('[GPS] getLatestDriverLocations exception:', err);
    return [];
  }
}

// ดึงประวัติการเดินทางของ Driver ตามวันที่ (สำหรับแสดงเส้นทาง)
export async function getDriverRouteForDate(driverId: string, date: string) {
  try {
    const isSuper = await isSuperAdmin();
    const isRegularAdmin = await isAdmin();
    const customerId = await getCustomerId();
    const supabase = (isSuper || isRegularAdmin || customerId) ? await createAdminClient() : await createClient();

    // Create Start and End timestamps for the day
    const startDate = `${date}T00:00:00`;
    const endDate = `${date}T23:59:59`;

    const { data, error } = await supabase
      .from("gps_logs")
      .select("*") // select * to be safe with casing
      .eq("driver_id", driverId)
      .gte("timestamp", startDate)
      .lte("timestamp", endDate)
      .order("timestamp", { ascending: true });

    if (error) {
      return [];
    }

    // Normalize data
    return (
      data?.map((d: { id?: string | number, driver_id?: string, Driver_ID?: string, latitude?: number, longitude?: number, timestamp?: string, Latitude?: number, Longitude?: number, Timestamp?: string | number, speed?: number, bearing?: number, battery_level?: number, vehicle_id?: string }) => ({
        Latitude: d.latitude || d.Latitude,
        Longitude: d.longitude || d.Longitude,
        Timestamp: d.timestamp || d.Timestamp,
      })) || []
    );
  } catch {
    return [];
  }
}

// ... (skipping getLatestDriverLocations rework for now as it's less critical than fleet status)

// ... (previous code)

export async function getActiveFleetStatus(branchId?: string | null, customerId?: string | null) {
  try {
    const isSuper = await isSuperAdmin();
    const supabase = await createAdminClient();

    // 1. Fetch latest positions directly from optimized table.
    // Only include drivers that reported recently, so logged-out / closed-app
    // drivers stop showing pinned at a stale location on the live map.
    let query = supabase
      .from("driver_latest_locations")
      .select(`
        *,
        Master_Drivers!inner ( Driver_Name, Mobile_No, Branch_ID )
      `)
      .gte("timestamp", liveLocationThreshold());

    // Context filtering
    const sessionBranchId = await getUserBranchId();
    const effectiveBranchId = isSuper ? (branchId || sessionBranchId) : sessionBranchId;

    if (effectiveBranchId && effectiveBranchId !== "All") {
      query = query.eq('Master_Drivers.Branch_ID', effectiveBranchId);
    }

    if (customerId) {
      // Find Driver_IDs from Jobs_Main for this customer
      const activeJobsQuery = supabase
        .from("Jobs_Main")
        .select("Driver_ID")
        .eq("Customer_ID", customerId)
        .not("Driver_ID", "is", null)
        .not("Job_Status", "in", '("Complete", "Completed", "Cancelled", "Delivered")');

      const { data: activeJobs } = await activeJobsQuery;
      const activeDriverIds = Array.from(new Set(activeJobs?.map((j: { Driver_ID: string }) => j.Driver_ID) || []));
      
      if (activeDriverIds.length === 0) return [];
      query = query.in("Driver_ID", activeDriverIds);
    }

    const { data: latestLogs, error } = await query;

    if (error || !latestLogs) {
      // FALLBACK logic if table doesn't exist yet
      let driversQuery = supabase.from("Master_Drivers").select("*");
      if (customerId) {
        let activeJobsQuery = supabase.from("Jobs_Main").select("Driver_ID")
          .eq("Customer_ID", customerId)
          .not("Driver_ID", "is", null)
          .not("Job_Status", "in", '("Complete", "Completed", "Cancelled", "Delivered")');
        if (effectiveBranchId && effectiveBranchId !== "All") activeJobsQuery = activeJobsQuery.eq("Branch_ID", effectiveBranchId);
        const { data: activeJobs } = await activeJobsQuery;
        const activeDriverIds = Array.from(new Set(activeJobs?.map((j: { Driver_ID: string }) => j.Driver_ID) || []));
        if (activeDriverIds.length === 0) return [];
        driversQuery = driversQuery.in("Driver_ID", activeDriverIds);
      }
      if (effectiveBranchId && effectiveBranchId !== "All") driversQuery = driversQuery.eq("Branch_ID", effectiveBranchId);
      
      const { data: drivers } = await driversQuery;
      if (!drivers) return [];

      const driverIds = drivers.map((d: any) => d.Driver_ID || d.driver_id);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: fallbackLogs } = await supabase.from("gps_logs").select("*").in("driver_id", driverIds).gte("timestamp", yesterday).order("timestamp", { ascending: false }).limit(Math.max(2000, driverIds.length * 2));
      
      const logMap = new Map();
      fallbackLogs?.forEach((log: any) => {
          const dId = log.driver_id || log.Driver_ID;
          if (dId && !logMap.has(dId)) logMap.set(dId, log);
      });

      return drivers.map((driver: any) => {
        const dId = driver.Driver_ID || driver.driver_id;
        const log = logMap.get(dId);
        return {
          Driver_ID: dId,
          Driver_Name: driver.Driver_Name || driver.driver_name || "Unknown",
          Vehicle_Plate: driver.Vehicle_Plate || driver.vehicle_plate || "-",
          Mobile_No: driver.Mobile_No || driver.mobile_no || "",
          Last_Update: log?.timestamp || log?.Timestamp || null,
          Latitude: log?.latitude ?? log?.Latitude ?? null,
          Longitude: log?.longitude ?? log?.Longitude ?? null,
        };
      });
    }

    // 2. Map directly to expected return type
    return latestLogs.map((log: any) => ({
      Driver_ID: log.Driver_ID || log.driver_id,
      Driver_Name: log.Master_Drivers?.Driver_Name || "Unknown",
      Vehicle_Plate: log.Vehicle_Plate || log.vehicle_plate || "-",
      Mobile_No: log.Master_Drivers?.Mobile_No || "",
      Last_Update: log.Timestamp || log.timestamp,
      Latitude: log.Latitude ?? log.latitude ?? null,
      Longitude: log.Longitude ?? log.longitude ?? null,
    }));

  } catch (err) {
    console.error('[GPS] getActiveFleetStatus exception:', err);
    return [];
  }
}

export async function getVehicleRouteHistory(plate: string, startDate: string, endDate: string) {
    try {
        const supabase = await createAdminClient();
        
        // Ensure ISO format with time if only dates provided
        const s = startDate.includes('T') ? startDate : `${startDate}T00:00:00`;
        const e = endDate.includes('T') ? endDate : `${endDate}T23:59:59`;

        const { data, error } = await supabase
            .from("gps_logs")
            .select("latitude, longitude, timestamp, driver_id")
            .eq("vehicle_plate", plate)
            .gte("timestamp", s)
            .lte("timestamp", e)
            .order("timestamp", { ascending: true });

        if (error) throw error;

        let logs = data || [];

        // Fallback: If no logs found by plate, try to find by driver_id associated with this plate
        if (logs.length === 0) {
            const { data: drivers } = await supabase
                .from('Master_Drivers')
                .select('Driver_ID')
                .eq('Vehicle_Plate', plate);
            
            if (drivers && drivers.length > 0) {
                const driverIds = drivers.map((d: { Driver_ID: string }) => d.Driver_ID);
                const { data: driverLogs } = await supabase
                    .from("gps_logs")
                    .select("driver_id, latitude, longitude, timestamp")
                    .in("driver_id", driverIds)
                    .gte("timestamp", s)
                    .lte("timestamp", e)
                    .order("timestamp", { ascending: true });
                
                if (driverLogs) logs = driverLogs;
            }
        }

        return logs.map((d: { id?: string | number, driver_id?: string, latitude?: number, longitude?: number, timestamp?: string, speed?: number, bearing?: number, battery_level?: number, Latitude?: number, Longitude?: number, Timestamp?: string | number }) => ({
            lat: Number(d.latitude || d.Latitude),
            lng: Number(d.longitude || d.Longitude),
            timestamp: d.timestamp || d.Timestamp
        }));
    } catch (err) {
        console.error("[GPS] Fetch route history failed:", err);
        return [];
    }
}
