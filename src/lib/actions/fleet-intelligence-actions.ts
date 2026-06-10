
"use server"

import { createAdminClient } from "@/utils/supabase/server"
import { logActivity } from "@/lib/supabase/logs"
import { requireAdmin, requireBranchAccess, requireCustomerAccess } from "@/services/permission-guards"

import { getVehicleTypes } from "./vehicle-type-actions"

/**
 * FUEL STANDARDS
 */
export async function getFuelStandards() {
    await requireAdmin()
    const supabase = createAdminClient()
    
    // Auto-sync with Vehicle_Types table first
    await syncWithVehicleTypes()

    const { data, error } = await supabase
        .from('Fleet_Fuel_Standards')
        .select('*')
        .order('Vehicle_Type')
    
    if (error) return []
    return data
}

/**
 * Ensure every entry in Vehicle_Types has a record in Fleet_Fuel_Standards
 */
export async function syncWithVehicleTypes() {
    // This is often called from other server actions that already have guards, 
    // but adding a safety check won't hurt.
    const supabase = createAdminClient()
    try {
        const vehicleTypes = await getVehicleTypes()
        if (!vehicleTypes || vehicleTypes.length === 0) return

        const { data: existingStandards } = await supabase
            .from('Fleet_Fuel_Standards')
            .select('Vehicle_Type')
        
        const existingNames = new Set(existingStandards?.map((s: { Vehicle_Type: string }) => s.Vehicle_Type) || [])
        
        const toInsert = vehicleTypes
            .filter(t => !existingNames.has(t.type_name))
            .map(t => ({
                Vehicle_Type: t.type_name,
                Standard_KM_L: 10.0, // Default
                Warning_Threshold_Percent: 15.0
            }))
        
        if (toInsert.length > 0) {
            await supabase.from('Fleet_Fuel_Standards').insert(toInsert)
            console.log(`[FLEET_INTEL] Synced ${toInsert.length} new vehicle types to standards.`)
        }
    } catch (e) {
        console.error("[FLEET_INTEL] Sync with types failed:", e)
    }
}


interface FuelStandardInput {
    Vehicle_Type: string;
    Standard_KM_L: number;
    Warning_Threshold_Percent: number;
}

export async function saveFuelStandard(standard: FuelStandardInput) {
    await requireAdmin()
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('Fleet_Fuel_Standards')
        .upsert({
            ...standard,
            Updated_At: new Date().toISOString()
        })
        .select()
        .single()
    
    if (error) return { success: false, error: error.message }
    return { success: true, data }
}

/**
 * MAINTENANCE STANDARDS
 */
export async function getMaintenanceStandards() {
    await requireAdmin()
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('Fleet_Maintenance_Standards')
        .select('*')
        .order('Component_Name')
    
    if (error) return []
    return data
}

interface MaintenanceStandardInput {
    Component_Name: string;
    Standard_KM?: number | null;
    Standard_Months?: number | null;
}

export async function saveMaintenanceStandard(standard: MaintenanceStandardInput) {
    await requireAdmin()
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('Fleet_Maintenance_Standards')
        .upsert({
            ...standard,
            Updated_At: new Date().toISOString()
        })
        .select()
        .single()
    
    if (error) return { success: false, error: error.message }
    return { success: true, data }
}

export async function deleteMaintenanceStandard(name: string) {
    await requireAdmin()
    const supabase = createAdminClient()
    const { error } = await supabase
        .from('Fleet_Maintenance_Standards')
        .delete()
        .eq('Component_Name', name)
    
    if (error) return { success: false, error: error.message }
    return { success: true }
}

/**
 * ALERTS
 */
export async function getActiveFleetAlerts(vehiclePlate?: string, branchId?: string, customerId?: string | null) {
    // 1. Verify access
    await requireBranchAccess(branchId)
    if (customerId) await requireCustomerAccess(customerId)
    
    const supabase = createAdminClient()
    let query = supabase
        .from('Fleet_Intelligence_Alerts')
        .select('*, master_vehicles!inner(brand, model, branch_id)')
        .eq('Status', 'ACTIVE')
        .order('Created_At', { ascending: false })
    
    if (vehiclePlate) {
        query = query.eq('Vehicle_Plate', vehiclePlate)
    }

    if (branchId && branchId !== 'All') {
        query = query.eq('master_vehicles.branch_id', branchId)
    }

    if (customerId) {
        // Vehicles don't belong to customers directly. 
        // Find active jobs for this customer to get the vehicles currently serving them.
        const { data: activeJobs } = await supabase
            .from('Jobs_Main')
            .select('Vehicle_Plate')
            .eq('Customer_ID', customerId)
            .not('Vehicle_Plate', 'is', null)
            .not('Job_Status', 'in', '("Complete", "Completed", "Cancelled", "Delivered")')
            
        const activePlates = Array.from(new Set(activeJobs?.map((j: any) => j.Vehicle_Plate).filter(Boolean) || []))
        
        if (activePlates.length === 0) {
            return [] // Customer has no active vehicles, so no alerts
        }
        query = query.in('Vehicle_Plate', activePlates)
    }

    const { data, error } = await query
    if (error) {
        console.error('[FLEET_INTEL] getActiveFleetAlerts error:', JSON.stringify(error, null, 2))
        return []
    }
    return data
}

export async function resolveAlert(alertId: string, status: 'RESOLVED' | 'IGNORED' = 'RESOLVED', note?: string) {
    await requireAdmin()
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('Fleet_Intelligence_Alerts')
        .update({
            Status: status,
            Resolved_At: new Date().toISOString(),
            Resolved_Note: note
        } as Record<string, unknown>)
        .eq('Alert_ID', alertId)
        .select()
    
    if (error) return { success: false, error: error.message }
    return { success: true, data }
}

/**
 * INTELLIGENCE ENGINE: ANALYZE FUEL LOG
 */
export async function analyzeFuelLog(logId: string) {
    console.log(`[FLEET_INTEL] Analyzing Fuel Log: ${logId}`)
    const supabase = createAdminClient()

    try {
        // 1. Get current log
        const { data: log, error: logError } = await supabase
            .from('Fuel_Logs')
            .select('*')
            .eq('Log_ID', logId)
            .single()
        
        if (logError || !log) return { success: false, error: "Log not found" }

        // 2. Get vehicle type and standard
        const { data: vehicle } = await supabase
            .from('master_vehicles')
            .select('vehicle_type')
            .eq('vehicle_plate', log.Vehicle_Plate)
            .single()
        
        if (!vehicle) return { success: false, error: "Vehicle not found" }

        const { data: standard } = await supabase
            .from('Fleet_Fuel_Standards')
            .select('*')
            .eq('Vehicle_Type', vehicle.vehicle_type)
            .maybeSingle()
        
        const targetKmL = standard?.Standard_KM_L || 10.0
        const threshold = standard?.Warning_Threshold_Percent || 15.0

        // 3. Get previous log to calculate KM/L
        const { data: prevLog } = await supabase
            .from('Fuel_Logs')
            .select('Odometer')
            .eq('Vehicle_Plate', log.Vehicle_Plate)
            .lt('Date_Time', log.Date_Time)
            .order('Date_Time', { ascending: false })
            .limit(1)
            .maybeSingle()
        
        if (prevLog && prevLog.Odometer && log.Odometer && log.Liters > 0) {
            const distance = log.Odometer - prevLog.Odometer
            const actualKmL = distance / log.Liters
            const diffPercent = ((targetKmL - actualKmL) / targetKmL) * 100

            // 4. Check for Anomaly (Lower than standard)
            if (diffPercent > threshold) {
                const severity = diffPercent > (threshold * 2) ? 'CRITICAL' : 'WARNING'
                
                await supabase.from('Fleet_Intelligence_Alerts').insert({
                    Vehicle_Plate: log.Vehicle_Plate,
                    Alert_Type: 'FUEL_EFFICIENCY',
                    Severity: severity,
                    Message: `ประสิทธิภาพน้ำมันต่ำกว่าเกณฑ์ (${actualKmL.toFixed(2)} กม./ลิตร)`,
                    Details: {
                        actual: actualKmL,
                        target: targetKmL,
                        diff_percent: diffPercent,
                        distance: distance,
                        liters: log.Liters,
                        log_id: logId
                    }
                })
                console.log(`[FLEET_INTEL] Fuel Alert Created for ${log.Vehicle_Plate}`)
            }
        }

        return { success: true }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        console.error("[FLEET_INTEL] Analysis failed:", msg)
        return { success: false, error: msg }
    }
}

/**
 * INTELLIGENCE ENGINE: ANALYZE MAINTENANCE
 */
export async function analyzeMaintenanceLog(ticketId: string) {
    console.log(`[FLEET_INTEL] Analyzing Maintenance: ${ticketId}`)
    const supabase = createAdminClient()

    try {
        // 1. Get ticket details
        const { data: ticket } = await supabase
            .from('Repair_Tickets')
            .select('*')
            .eq('Ticket_ID', ticketId)
            .single()
        
        if (!ticket || ticket.Status !== 'Completed') return { success: true } 

        // 2. Identify component and standard
        const { data: standard } = await supabase
            .from('Fleet_Maintenance_Standards')
            .select('*')
            .ilike('Component_Name', `%${ticket.Issue_Type}%`)
            .maybeSingle()
        
        if (!standard) return { success: true } 

        // 3. Find last time this component was serviced
        const { data: prevRepair } = await supabase
            .from('Repair_Tickets')
            .select('Date_Finish, Date_Report, Odometer')
            .eq('Vehicle_Plate', ticket.Vehicle_Plate)
            .eq('Status', 'Completed')
            .eq('Issue_Type', ticket.Issue_Type)
            .lt('Date_Report', ticket.Date_Report)
            .order('Date_Report', { ascending: false })
            .limit(1)
            .maybeSingle()
        
        if (prevRepair) {
            const lastDate = new Date(prevRepair.Date_Finish || prevRepair.Date_Report)
            const currDate = new Date(ticket.Date_Finish || ticket.Date_Report)
            const monthsDiff = (currDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
            
            const lastOdo = prevRepair.Odometer
            const currOdo = ticket.Odometer
            const kmDiff = (lastOdo && currOdo) ? (currOdo - lastOdo) : null

            let isAnomaly = false
            let reason = ""
            let severity: 'WARNING' | 'CRITICAL' = 'WARNING'

            // Check Months
            if (standard.Standard_Months && monthsDiff < standard.Standard_Months * 0.7) {
                isAnomaly = true
                reason = `เปลี่ยนเร็วกว่ากำหนดตามเวลา (รอบใช้งานเพียง ${monthsDiff.toFixed(1)} / ${standard.Standard_Months} เดือน)`
                if (monthsDiff < standard.Standard_Months * 0.4) severity = 'CRITICAL'
            }

            // Check KM (Priority if available)
            if (standard.Standard_KM && kmDiff !== null && kmDiff < standard.Standard_KM * 0.7) {
                isAnomaly = true
                reason = `เปลี่ยนเร็วกว่ากำหนดตามระยะทาง (วิ่งไปเพียง ${kmDiff.toLocaleString()} / ${standard.Standard_KM.toLocaleString()} กม.)`
                if (kmDiff < standard.Standard_KM * 0.4) severity = 'CRITICAL'
            }

            if (isAnomaly) {
                await supabase.from('Fleet_Intelligence_Alerts').insert({
                    Vehicle_Plate: ticket.Vehicle_Plate,
                    Alert_Type: 'MAINTENANCE_LIFESPAN_ANOMALY',
                    Severity: severity,
                    Message: `${ticket.Issue_Type}: ${reason}`,
                    Details: {
                        actual_months: monthsDiff,
                        target_months: standard.Standard_Months,
                        actual_km: kmDiff,
                        target_km: standard.Standard_KM,
                        ticket_id: ticketId,
                        prev_ticket_date: lastDate.toISOString()
                    }
                })
            }
        }

        return { success: true }
    } catch (e: unknown) {
        return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
}
