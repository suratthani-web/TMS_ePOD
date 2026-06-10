"use server"

import { createClient, createAdminClient } from "@/utils/supabase/server"
import { isAdmin } from "@/lib/permissions"

export async function getJobGPSData(jobId: string, driverId: string, date: string) {
    const admin = await isAdmin()
    const supabase = admin ? createAdminClient() : await createClient()
    
    try {
        // 1. Fetch Job Route History (Breadcrumbs)
        const startDate = `${date}T00:00:00`
        const endDate = `${date}T23:59:59`

        const { data: routeData } = await supabase
            .from('gps_logs')
            .select('latitude, longitude, timestamp')
            .eq('job_id', jobId) 
            .order('timestamp', { ascending: true })
        
        // If no job-specific logs, try stripping 'JOB-' prefix (mobile app might send it without)
        let finalRoute = routeData
        if ((!finalRoute || finalRoute.length === 0) && jobId.startsWith('JOB-')) {
            const strippedId = jobId.replace('JOB-', '')
            const { data: strippedData } = await supabase
                .from('gps_logs')
                .select('latitude, longitude, timestamp')
                .eq('job_id', strippedId) 
                .order('timestamp', { ascending: true })
            if (strippedData && strippedData.length > 0) finalRoute = strippedData
        }

        if (!finalRoute || finalRoute.length === 0) {
            const { data: driverData } = await supabase
                .from('gps_logs')
                .select('latitude, longitude, timestamp')
                .eq('driver_id', driverId)
                .gte('timestamp', startDate)
                .lte('timestamp', endDate)
                .order('timestamp', { ascending: true })
            finalRoute = driverData
        }

        // 2. Fetch Latest Location
        const { data: latestData } = await supabase
            .from('gps_logs')
            .select('*')
            .eq('driver_id', driverId)
            .order('timestamp', { ascending: false })
            .limit(1)

        const latest = latestData?.[0]
        
        // Final mapping with robustness
        const route = finalRoute?.map((r: unknown) => {
            const rp = r as { latitude?: number | string, Longitude?: number | string, lat?: number | string, longitude?: number | string, Latitude?: number | string, lng?: number | string };
            const lat = rp.latitude ?? rp.Latitude ?? rp.lat ?? 0;
            const lng = rp.longitude ?? rp.Longitude ?? rp.lng ?? 0;
            return [Number(lat), Number(lng)] as [number, number];
        }) || []

        const l = latest as { latitude?: number|string, Latitude?: number|string, lat?: number|string, longitude?: number|string, Longitude?: number|string, lng?: number|string, timestamp?: string, Timestamp?: string, created_at?: string, vehicle_plate?: string, speed?: number } | undefined;

        return {
            route,
            latest: l ? {
                lat: l.latitude ?? l.Latitude ?? l.lat ?? 0,
                lng: l.longitude ?? l.Longitude ?? l.lng ?? 0,
                timestamp: l.timestamp ?? l.Timestamp ?? l.created_at,
                vehicle_plate: l.vehicle_plate,
                speed: l.speed
            } : null
        }
    } catch {
        return { route: [], latest: null }
    }
}
