"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { getEffectiveBranchId, REVENUE_STATUSES, formatDateSafe, fetchAllRows } from './analytics-helpers'
import { getCustomerId } from "@/lib/permissions"
import { calculateJobEmissions, TGO_STANDARDS_METADATA } from '../utils/esg-utils'
import { getCarbonFactors } from '@/lib/actions/carbon-factors'
import { resolveVehicleKey } from '@/lib/utils/job-carbon'

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
    fuelSavedLiters: number // Alias for UI compatibility
    totalSavedKm: number // Alias for UI compatibility
    efficiencyRate: number // % ใบงานที่มีข้อมูลสมบูรณ์
    scope1EmissionsKg: number // Scope 1: รถบริษัท (Direct Emissions - Exact Volume)
    scope3EmissionsKg: number // Scope 3: รถร่วม (Upstream Transportation - Distance Estimated)
    dataTiering: ESGDataTiering // จำแนกคุณภาพข้อมูล (Data Tiering) สำหรับยื่น อบก./ISO
    tgoMetadata: typeof TGO_STANDARDS_METADATA
    historicalData: { month: string; co2Emissions: number }[]
}

export type ESGTierRow = { count: number; co2Kg: number; pct: number }
export type ESGDataTiering = {
    exactVolume: ESGTierRow       // Primary Data (Scope 1) — ลิตรน้ำมันจริง
    tonneKm: ESGTierRow           // GLEC Tonne-KM — น้ำหนักสินค้าจริง (Scope 3)
    distanceEstimated: ESGTierRow // GLEC Distance Estimated — ประเมินจากพิกัดรถ (Scope 3)
}

const EMPTY_TIERING: ESGDataTiering = {
    exactVolume: { count: 0, co2Kg: 0, pct: 0 },
    tonneKm: { count: 0, co2Kg: 0, pct: 0 },
    distanceEstimated: { count: 0, co2Kg: 0, pct: 0 },
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

        // page ครบทุกแถว (กัน cap 1000 ทำให้ยอดคาร์บอนตกหล่นเมื่องาน > 1000)
        const jobs = await fetchAllRows(() => {
            let query = supabase
                .from('Jobs_Main')
                .select('Job_ID, Plan_Date, Price_Cust_Total, Branch_ID, Customer_ID, Est_Distance_KM, Pickup_Lat, Pickup_Lon, Delivery_Lat, Delivery_Lon, Vehicle_Type, original_origins_json, original_destinations_json, Weight_Kg')
                .in('Job_Status', REVENUE_STATUSES)
            if (sDate) query = query.gte('Plan_Date', sDate)
            if (eDate) query = query.lte('Plan_Date', eDate)
            if (finalCustomerId) query = query.eq('Customer_ID', finalCustomerId)
            if (effectiveBranchId) query = query.eq('Branch_ID', effectiveBranchId)
            return query
        })
        if (!jobs || jobs.length === 0) {
            return {
                validJobsCount: 0,
                incompleteJobsCount: 0,
                co2EmissionsKg: 0,
                co2SavedKg: 0,
                treesSaved: 0,
                fuelConsumedLiters: 0,
                fuelSavedLiters: 0,
                totalSavedKm: 0,
                efficiencyRate: 0,
                scope1EmissionsKg: 0,
                scope3EmissionsKg: 0,
                dataTiering: EMPTY_TIERING,
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

        // Data Tiering (จำแนกวิธีคำนวณตามคุณภาพข้อมูล — ใช้ยื่น อบก./ISO)
        const tier = {
            exactVolume:       { count: 0, co2: 0 }, // Primary Data (Scope 1) — ลิตรจริง
            tonneKm:           { count: 0, co2: 0 }, // GLEC Tonne-KM — น้ำหนักสินค้าจริง
            distanceEstimated: { count: 0, co2: 0 }, // GLEC Distance Estimated — ประเมินจากพิกัดรถ
        }

        const monthlyTrend: Record<string, number> = {}

        // Live carbon factors (editable in /settings/esg), loaded once for the loop.
        const factors = await getCarbonFactors()

        jobs.forEach((j: any) => {
            // Same vehicle→EF mapping as every per-trip document ("4" → 4-Wheel; a
            // custom row in /settings/esg with the exact type name wins).
            const vType = resolveVehicleKey(j.Vehicle_Type, factors)
            const actualFuel: number | null = null // Actual_Fuel_Liters column not yet in DB
            let dist = Number(j.Est_Distance_KM) || 0
            const rawWeight = Number(j.Weight_Kg) || null
            const cargoWeightTonnes = rawWeight ? rawWeight / 1000 : null
            
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
            // ส่งระยะ "เที่ยวเดียว" + emptyReturnRatio ให้ฟังก์ชันคิดเที่ยวกลับรถเปล่าแยกขาเอง
            // (กันการนับซ้ำ: tonne-km ของสินค้าไม่ถูกคูณด้วยเที่ยวกลับ)
            const impact = calculateJobEmissions(dist, actualFuel, vType, factors, cargoWeightTonnes, factors.emptyReturnRatio)

            totalFuelLiters += impact.fuelUsedLiters
            totalCo2Emissions += impact.co2EmissionsKg

            if (impact.ghgScope === 'Scope 1') {
                scope1Co2Total += impact.co2EmissionsKg
            } else {
                scope3Co2Total += impact.co2EmissionsKg
            }

            // Data Tiering: จำแนกตามวิธีคำนวณ (คุณภาพข้อมูล)
            if (impact.calculationMethod === 'Exact Volume (Primary Data)') {
                tier.exactVolume.count++; tier.exactVolume.co2 += impact.co2EmissionsKg
            } else if (impact.calculationMethod === 'GLEC Tonne-KM (Shipment Weight)') {
                tier.tonneKm.count++; tier.tonneKm.co2 += impact.co2EmissionsKg
            } else {
                tier.distanceEstimated.count++; tier.distanceEstimated.co2 += impact.co2EmissionsKg
            }

            // Monthly Trend Aggregation
            const dateStr = j.Plan_Date as string
            if (dateStr) {
                const month = dateStr.substring(0, 7)
                monthlyTrend[month] = (monthlyTrend[month] || 0) + impact.co2EmissionsKg
            }
        })

        // ใช้อัตราดูดซับต้นไม้จาก DB (ตั้งค่าได้ /settings/esg) ให้ตรงกับ LINE/ใบแจ้งหนี้
        const treeKg = factors.treeAbsorbKgPerYear ?? KG_CO2_PER_TREE_YEAR
        const treesSaved = treeKg > 0 ? totalCo2Emissions / treeKg : 0

        const validCount = validJobsCount || 0
        const pct = (n: number) => validCount > 0 ? Math.round((n / validCount) * 1000) / 10 : 0
        const dataTiering = {
            exactVolume:       { count: tier.exactVolume.count,       co2Kg: Math.round(tier.exactVolume.co2 * 10) / 10,       pct: pct(tier.exactVolume.count) },
            tonneKm:           { count: tier.tonneKm.count,           co2Kg: Math.round(tier.tonneKm.co2 * 10) / 10,           pct: pct(tier.tonneKm.count) },
            distanceEstimated: { count: tier.distanceEstimated.count, co2Kg: Math.round(tier.distanceEstimated.co2 * 10) / 10, pct: pct(tier.distanceEstimated.count) },
        }

        const historicalData = Object.entries(monthlyTrend)
            .map(([month, co2Emissions]) => ({ month, co2Emissions: Math.round(co2Emissions) }))
            .sort((a, b) => a.month.localeCompare(b.month))

        const totalSavedKm = Math.round(totalCo2Emissions / 0.263)

        return {
            validJobsCount,
            incompleteJobsCount,
            co2EmissionsKg: Number(totalCo2Emissions.toFixed(1)),
            co2SavedKg: Number(totalCo2Emissions.toFixed(1)),
            treesSaved: Math.round(treesSaved * 10) / 10,
            fuelConsumedLiters: Math.round(totalFuelLiters * 10) / 10,
            fuelSavedLiters: Math.round(totalFuelLiters * 10) / 10,
            totalSavedKm,
            efficiencyRate: totalJobs > 0 ? Math.round((validJobsCount / totalJobs) * 100) : 0,
            scope1EmissionsKg: Math.round(scope1Co2Total * 100) / 100,
            scope3EmissionsKg: Math.round(scope3Co2Total * 100) / 100,
            dataTiering,
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
            fuelSavedLiters: 0,
            totalSavedKm: 0,
            efficiencyRate: 0,
            scope1EmissionsKg: 0,
            scope3EmissionsKg: 0,
            dataTiering: EMPTY_TIERING,
            tgoMetadata: TGO_STANDARDS_METADATA,
            historicalData: []
        }
    }
}


