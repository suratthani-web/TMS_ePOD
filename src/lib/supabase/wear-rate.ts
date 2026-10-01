// Vehicle wear rate (ค่าสึกหรอ ฿/km) from actual repair + tire spend.
// Note: No "use server" here — consumed by server action files.

import { fetchAllRows, REVENUE_STATUSES } from '@/lib/supabase/analytics-helpers'

/** Used when neither the vehicle nor the fleet has enough history yet. */
export const DEFAULT_WEAR_RATE_PER_KM = 1.25
/** Trailing window the rate is averaged over, so one big repair is spread across a year of driving. */
export const WEAR_WINDOW_DAYS = 365
/** Below this many km a vehicle's own rate is too noisy — use the fleet rate instead. */
export const MIN_KM_FOR_RATE = 2000

const COMPLETED_REPAIR_STATUSES = ['Completed', 'เสร็จสิ้น', 'ซ่อมเสร็จ']

export type WearRateSource = 'vehicle' | 'fleet' | 'default' | 'not_company'

export type WearRate = {
    ratePerKm: number
    source: WearRateSource
    /** This vehicle's repair + tire spend in the window (fleet object: fleet total). */
    cost: number
    /** Job km in the window. */
    km: number
}

export type WearRates = {
    get(plate: string | null | undefined): WearRate
    fleet: WearRate
    windowStart: string
    windowEnd: string
}

export const normalizePlate = (plate?: string | null) => (plate || '').replace(/\s+/g, '').trim()

function ymd(d: Date) {
    return d.toISOString().slice(0, 10)
}

/**
 * Wear rate per vehicle = (completed repair cost + tire cost) / job km over the
 * trailing WEAR_WINDOW_DAYS ending at `asOf`. Only company-owned vehicles carry
 * wear cost — subcontractor/independent trucks are paid via the driver cost.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getWearRates(supabase: any, asOf?: string): Promise<WearRates> {
    const end = asOf ? new Date(`${asOf.slice(0, 10)}T00:00:00Z`) : new Date()
    const start = new Date(end.getTime() - WEAR_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const windowStart = ymd(start)
    const windowEnd = ymd(end)

    const { data: vehicles } = await supabase
        .from('Master_Vehicles')
        .select('Vehicle_Plate, Owner_Type, Sub_ID')
    const companyPlates = new Map<string, string>() // normalized -> raw
    for (const v of (vehicles || []) as { Vehicle_Plate: string | null; Owner_Type?: string | null; Sub_ID?: string | null }[]) {
        if (!v.Vehicle_Plate) continue
        const ownerType = String(v.Owner_Type || (v.Sub_ID ? 'sub' : 'company')).toLowerCase()
        if (ownerType === 'company') companyPlates.set(normalizePlate(v.Vehicle_Plate), v.Vehicle_Plate)
    }
    const rawPlates = [...companyPlates.values()]

    const costByPlate = new Map<string, number>()
    const kmByPlate = new Map<string, number>()
    const add = (m: Map<string, number>, plate: string | null | undefined, v: number) => {
        const k = normalizePlate(plate)
        if (!k || !companyPlates.has(k) || !Number.isFinite(v)) return
        m.set(k, (m.get(k) || 0) + v)
    }

    if (rawPlates.length > 0) {
        const [repairs, tires, jobs] = await Promise.all([
            fetchAllRows<{ Vehicle_Plate: string | null; Cost_Total: number | string | null; Date_Finish: string | null; Date_Report: string | null }>(() =>
                supabase
                    .from('Repair_Tickets')
                    .select('Vehicle_Plate, Cost_Total, Date_Finish, Date_Report')
                    .in('Status', COMPLETED_REPAIR_STATUSES)
                    .in('Vehicle_Plate', rawPlates)
                    .gte('Date_Report', `${ymd(new Date(start.getTime() - 90 * 86400000))}T00:00:00`)),
            fetchAllRows<{ Vehicle_Plate: string | null; cost: number | string | null }>(() =>
                supabase
                    .from('Tire_Logs')
                    .select('Vehicle_Plate, cost')
                    .in('Vehicle_Plate', rawPlates)
                    .gte('service_date', windowStart)
                    .lte('service_date', windowEnd)),
            fetchAllRows<{ Vehicle_Plate: string | null; Est_Distance_KM: number | string | null }>(() =>
                supabase
                    .from('Jobs_Main')
                    .select('Vehicle_Plate, Est_Distance_KM')
                    .in('Job_Status', REVENUE_STATUSES)
                    .in('Vehicle_Plate', rawPlates)
                    .gte('Plan_Date', windowStart)
                    .lte('Plan_Date', windowEnd)),
        ])

        for (const r of repairs) {
            // Repairs are dated by when they were finished (falls back to report date).
            const when = String(r.Date_Finish || r.Date_Report || '').slice(0, 10)
            if (when < windowStart || when > windowEnd) continue
            add(costByPlate, r.Vehicle_Plate, Number(r.Cost_Total) || 0)
        }
        for (const t of tires) add(costByPlate, t.Vehicle_Plate, Number(t.cost) || 0)
        for (const j of jobs) add(kmByPlate, j.Vehicle_Plate, Number(j.Est_Distance_KM) || 0)
    }

    let fleetCost = 0
    let fleetKm = 0
    for (const k of companyPlates.keys()) {
        fleetCost += costByPlate.get(k) || 0
        fleetKm += kmByPlate.get(k) || 0
    }
    const fleet: WearRate = fleetCost > 0 && fleetKm >= MIN_KM_FOR_RATE
        ? { ratePerKm: round2(fleetCost / fleetKm), source: 'fleet', cost: fleetCost, km: fleetKm }
        : { ratePerKm: DEFAULT_WEAR_RATE_PER_KM, source: 'default', cost: fleetCost, km: fleetKm }

    const cache = new Map<string, WearRate>()
    const get = (plate: string | null | undefined): WearRate => {
        const k = normalizePlate(plate)
        if (!k || !companyPlates.has(k)) return { ratePerKm: 0, source: 'not_company', cost: 0, km: 0 }
        const hit = cache.get(k)
        if (hit) return hit
        const cost = costByPlate.get(k) || 0
        const km = kmByPlate.get(k) || 0
        const rate: WearRate = cost > 0 && km >= MIN_KM_FOR_RATE
            ? { ratePerKm: round2(cost / km), source: 'vehicle', cost, km }
            : { ...fleet, cost, km }
        cache.set(k, rate)
        return rate
    }

    return { get, fleet, windowStart, windowEnd }
}

function round2(n: number) {
    return Math.round(n * 100) / 100
}
