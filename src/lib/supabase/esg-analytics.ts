"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { getEffectiveBranchId, REVENUE_STATUSES, formatDateSafe } from './analytics-helpers'
import { getCustomerId } from "@/lib/permissions"
import { calculateJobEmissions, TGO_STANDARDS_METADATA } from '../utils/esg-utils'

/**
 * ESG Intelligence Engine - TMS 2026 (TGO Standard Certified Edition)
 * Calculates Environmental impact & Carbon Emissions based on TGO Guidelines.
 * Strict Audit Mode: No data fabrication (fallbacks removed for compliance).
 */

export type ESGStats = {
    validJobsCount: number // จำนวนใบงานที่มีข้อมูลสมบูรณ์พร้อมยื่น อบก.
    incompleteJobsCount: number // จำนวนใบงานที่ข้อมูลระยะทางไม่ครบถ้วน (ติด Flag เพื่อ Audit)
    co2EmissionsKg: number // ปริมาณการปล่อยคาร์บอนรวม (kgCO2e)
    co2SavedKg: number // Alias for UI compatibility
    treesSaved: number
    fuelConsumedLiters: number // ปริมาณน้ำมันเชื้อเพลิงรวม (ลิตร)
    efficiencyRate: number // % ใบงานที่มีข้อมูลสมบูรณ์
    scope1EmissionsKg: number // Scope 1: รถบริษัท (Direct Emissions - Exact Volume)
    scope3EmissionsKg: number // Scope 3: รถร่วม (Upstream Transportation - Distance Estimated)
    tgoMetadata: typeof TGO_STANDARDS_METADATA
    historicalData: { month: string; co2Emissions: number }[]
}

const KG_CO2_PER_TREE_YEAR = 22 // 1 tree offsets ~22kg CO2 per year (TGO Baseline)

// Haversine formula to calculate distance between two coordinates in KM
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371 // Earth's radius in KM
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}

export async function getESGStats(startDate?: string, endDate?: string, branchId?: string, customerId?: string | null): Promise<ESGStats> {
    try {
        const supabase = await createAdminClient()
        const effectiveBranchId = await getEffectiveBranchId(branchId)
        const loggedInCustomerId = await getCustomerId()
        const finalCustomerId = customerId || loggedInCustomerId

        const sDate = formatDateSafe(startDate)
        const eDate = formatDateSafe(endDate)

        let query = supabase
            .from('Jobs_Main')
            .select('Job_ID, Plan_Date, Price_Cust_Total, Branch_ID, Customer_ID, Est_Distance_KM, Pickup_Lat, Pickup_Lon, Delivery_Lat, Delivery_Lon, Vehicle_Type, Actual_Fuel_Liters, original_origins_json, original_destinations_json')
            .in('Job_Status', REVENUE_STATUSES)

        if (sDate) query = query.gte('Plan_Date', sDate)
        if (eDate) query = query.lte('Plan_Date', eDate)

        if (finalCustomerId) {
            query = query.eq('Customer_ID', finalCustomerId)
        }
        if (effectiveBranchId) {
            query = query.eq('Branch_ID', effectiveBranchId)
        }
        
        const { data: jobs, error: queryError } = await query
        
        if (queryError) {
            console.error("[ESG] Supabase Query Error:", queryError)
        }

        if (!jobs || jobs.length === 0) {
            return {
                validJobsCount: 0,
                incompleteJobsCount: 0,
                co2EmissionsKg: 0,
                treesSaved: 0,
                fuelConsumedLiters: 0,
                efficiencyRate: 0,
                scope1EmissionsKg: 0,
                scope3EmissionsKg: 0,
                tgoMetadata: TGO_STANDARDS_METADATA,
                historicalData: []
            }
        }

        const totalJobs = jobs.length
        let validJobsCount = 0
        let incompleteJobsCount = 0

        let totalFuelLiters = 0
        let totalCo2Emissions = 0
        let scope1Co2Total = 0
        let scope3Co2Total = 0

        const monthlyTrend: Record<string, number> = {}

        jobs.forEach((j: any) => {
            const vType = j.Vehicle_Type || 'default'
            const actualFuel = j.Actual_Fuel_Liters ? Number(j.Actual_Fuel_Liters) : null
            let dist = Number(j.Est_Distance_KM) || 0
            
            // Try to recover distance from coordinates if Est_Distance_KM is missing
            if (dist <= 0) {
                const lat1 = Number(j.Pickup_Lat) || (j.original_origins_json?.[0]?.lat ? Number(j.original_origins_json[0].lat) : null)
                const lon1 = Number(j.Pickup_Lon) || (j.original_origins_json?.[0]?.lng ? Number(j.original_origins_json[0].lng) : null)
                const lat2 = Number(j.Delivery_Lat) || (j.original_destinations_json?.[0]?.lat ? Number(j.original_destinations_json[0].lat) : null)
                const lon2 = Number(j.Delivery_Lon) || (j.original_destinations_json?.[0]?.lng ? Number(j.original_destinations_json[0].lng) : null)

                if (lat1 && lon1 && lat2 && lon2) {
                    dist = calculateHaversineDistance(lat1, lon1, lat2, lon2) * 1.3
                }
            }

            // STRICT AUDIT COMPLIANCE: If distance is <= 0 AND no actual fuel liters provided, flag as incomplete (No 12.5km fallback to prevent fabrication)
            if (dist <= 0 && (actualFuel === null || actualFuel <= 0)) {
                incompleteJobsCount++
                return // Skip this job from GHG calculation to ensure 100% verifier compliance
            }

            validJobsCount++
            const impact = calculateJobEmissions(dist, actualFuel, vType)

            totalFuelLiters += impact.fuelUsedLiters
            totalCo2Emissions += impact.co2EmissionsKg

            if (impact.ghgScope === 'Scope 1') {
                scope1Co2Total += impact.co2EmissionsKg
            } else {
                scope3Co2Total += impact.co2EmissionsKg
            }

            // Monthly Trend Aggregation
            const dateStr = j.Plan_Date as string
            if (dateStr) {
                const month = dateStr.substring(0, 7)
                monthlyTrend[month] = (monthlyTrend[month] || 0) + impact.co2EmissionsKg
            }
        })

        const treesSaved = totalCo2Emissions / KG_CO2_PER_TREE_YEAR

        const historicalData = Object.entries(monthlyTrend)
            .map(([month, co2Emissions]) => ({ month, co2Emissions: Math.round(co2Emissions) }))
            .sort((a, b) => a.month.localeCompare(b.month))

        return {
            validJobsCount,
            incompleteJobsCount,
            co2EmissionsKg: Number(totalCo2Emissions.toFixed(1)),
            co2SavedKg: Number(totalCo2Emissions.toFixed(1)),
            treesSaved: Math.round(treesSaved * 10) / 10,
            fuelConsumedLiters: Math.round(totalFuelLiters * 10) / 10,
            efficiencyRate: totalJobs > 0 ? Math.round((validJobsCount / totalJobs) * 100) : 0,
            scope1EmissionsKg: Math.round(scope1Co2Total * 100) / 100,
            scope3EmissionsKg: Math.round(scope3Co2Total * 100) / 100,
            tgoMetadata: TGO_STANDARDS_METADATA,
            historicalData
        }

    } catch (err) { const error = err as Error;
        console.error("ESG Calculation Error:", error?.message || error)
        return {
            validJobsCount: 0,
            incompleteJobsCount: 0,
            co2EmissionsKg: 0,
            co2SavedKg: 0,
            treesSaved: 0,
            fuelConsumedLiters: 0,
            efficiencyRate: 0,
            scope1EmissionsKg: 0,
            scope3EmissionsKg: 0,
            tgoMetadata: TGO_STANDARDS_METADATA,
            historicalData: []
        }
    }
}


