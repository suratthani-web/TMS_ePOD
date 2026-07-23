/**
 * Enterprise ESG (Environmental, Social, and Governance) Utilities
 * Hybrid Calculation: Supports both exact fuel volume (Own Fleet) and distance-based estimation (Subcontractors)
 * Certified Alignment: Thailand Greenhouse Gas Management Organization (TGO / อบก.) Standards.
 */

export const TGO_STANDARDS_METADATA = {
    organization: "Thailand Greenhouse Gas Management Organization (Public Organization) - TGO / อบก.",
    efVersion: "TGO Emission Factor Guideline 2024 (Stationary & Mobile Combustion)",
    unit: "kg CO2e per Liter fuel consumed",
    scopes: {
        scope1: "Direct GHG Emissions (Company-owned / Controlled Vehicles - Exact Volume)",
        scope3: "Category 4: Upstream Transportation & Distribution (Subcontractor / Sub-fleet - Distance Estimated)"
    }
}

export type ESGImpact = {
    co2SavedKg: number
    treesEquivalent: number
    fuelSavedLiters: number
    carbonScore: number // 0-100
}

export type JobESGImpact = {
    co2EmissionsKg: number // ปริมาณการปล่อยคาร์บอนจริง (kgCO2e)
    treesEquivalentToOffset: number // จำนวนต้นไม้ที่ต้องปลูกเพื่อชดเชยเที่ยววิ่งนี้
    fuelUsedLiters: number
    calculationMethod: 'Exact Volume' | 'Distance Estimated' // บอกว่าใช้วิธีไหนคำนวณ
    ghgScope: 'Scope 1' | 'Scope 3' // จำแนกตามขอบเขต อบก. (Scope 1 = รถบริษัท, Scope 3 = รถร่วม)
}

export const TGO_EMISSION_FACTORS: Record<string, number> = {
    'Diesel_B7': 2.6335,   // ค่า EF อ้างอิงจาก อบก. สำหรับดีเซล B7 (kgCO2e/ลิตร)
    'Gasoline_E10': 2.1815, // ค่า EF อ้างอิงจาก อบก. สำหรับเบนซิน E10 (kgCO2e/ลิตร)
    'default': 2.6335
}

export const VEHICLE_FUEL_MAP: Record<string, string> = {
    '4-Wheel': 'Diesel_B7',
    '6-Wheel': 'Diesel_B7',
    '10-Wheel': 'Diesel_B7',
    'Motorcycle': 'Gasoline_E10',
    'default': 'Diesel_B7'
}

// อัตราสิ้นเปลืองเฉลี่ย (ไว้ใช้กรณีรถร่วม ที่มีแค่ระยะทาง GPS)
export const FUEL_EFFICIENCY: Record<string, number> = {
    '4-Wheel': 12, // KM/L
    '6-Wheel': 8,
    '10-Wheel': 4,
    'Motorcycle': 40,
    'default': 10
}

// Retain backward compatibility coefficient map (kgCO2e/KM calculated from TGO values)
export const CO2_COEFFICIENTS: Record<string, number> = {
    '4-Wheel': 2.6335 / 12,      // ~0.219 kgCO2/km
    '6-Wheel': 2.6335 / 8,       // ~0.329 kgCO2/km
    '10-Wheel': 2.6335 / 4,      // ~0.658 kgCO2/km
    'Motorcycle': 2.1815 / 40,   // ~0.055 kgCO2/km
    'default': 2.6335 / 10       // ~0.263 kgCO2/km
}

/**
 * คำนวณการปล่อยคาร์บอนต่อ 1 ใบงาน ตามมาตรฐาน อบก.
 * @param distanceKm ระยะทางวิ่งจริง (จาก GPS หรือการจัดรูท)
 * @param actualFuelLiters ลิตรน้ำมันที่เติมจริง (ใส่ null หากเป็นรถร่วมที่ไม่รู้ตัวเลข)
 * @param vehicleType ประเภทรถ
 */
export function calculateJobEmissions(
    distanceKm: number, 
    actualFuelLiters: number | null, 
    vehicleType = 'default'
): JobESGImpact {
    const fuelType = VEHICLE_FUEL_MAP[vehicleType] || VEHICLE_FUEL_MAP['default']
    const efValue = TGO_EMISSION_FACTORS[fuelType] || TGO_EMISSION_FACTORS['default']
    
    let fuelUsedLiters = 0
    let method: 'Exact Volume' | 'Distance Estimated' = 'Distance Estimated'
    let ghgScope: 'Scope 1' | 'Scope 3' = 'Scope 3'

    // Logic แบ่งแยกวิธีคำนวณ และ Scope ของ อบก.
    if (actualFuelLiters !== null && actualFuelLiters > 0) {
        // กรณีรถบริษัท (Scope 1): พนักงานกรอกลิตรที่เติมมาให้ในระบบ
        fuelUsedLiters = actualFuelLiters
        method = 'Exact Volume'
        ghgScope = 'Scope 1'
    } else {
        // กรณีรถร่วม (Scope 3): ไม่รู้ลิตรน้ำมัน ให้เอาระยะทางหารด้วยอัตราสิ้นเปลืองมาตรฐาน
        const fuelRate = FUEL_EFFICIENCY[vehicleType] || FUEL_EFFICIENCY['default']
        fuelUsedLiters = distanceKm / fuelRate
        method = 'Distance Estimated'
        ghgScope = 'Scope 3'
    }

    // คำนวณคาร์บอน
    const co2EmissionsKg = fuelUsedLiters * efValue
    
    // 1 Tree absorbs approx 22kg of CO2 per year (TGO baseline standard)
    const treesEquivalentToOffset = co2EmissionsKg / 22

    return {
        co2EmissionsKg: Math.round(co2EmissionsKg * 100) / 100,
        treesEquivalentToOffset: Math.round(treesEquivalentToOffset * 10) / 10,
        fuelUsedLiters: Math.round(fuelUsedLiters * 10) / 10,
        calculationMethod: method,
        ghgScope: ghgScope
    }
}

export function calculateESGImpact(savedKm: number, vehicleType = 'default'): ESGImpact {
    const res = calculateJobEmissions(savedKm, null, vehicleType)

    return {
        co2SavedKg: res.co2EmissionsKg,
        treesEquivalent: res.treesEquivalentToOffset,
        fuelSavedLiters: res.fuelUsedLiters,
        carbonScore: Math.min(100, Math.round((savedKm / 500) * 100))
    }
}



