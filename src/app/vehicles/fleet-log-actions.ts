"use server"

import { createAdminClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { uploadFileToSupabase } from "@/lib/actions/supabase-upload"
import { getUserId } from "@/lib/permissions"

// Maps a renewable document type to the Master_Vehicles column that holds its
// current expiry date, so logging a renewal also moves the live expiry forward.
const DOC_EXPIRY_COLUMN: Record<string, string> = {
    tax: 'Tax_Expiry',
    insurance: 'Insurance_Expiry',
    act: 'Act_Expiry',
    cargo: 'Cargo_Insurance_Expiry',
}

async function uploadOptionalFile(file: File | null, prefix: string): Promise<string | null> {
    if (!file || file.size === 0) return null
    const buffer = Buffer.from(await file.arrayBuffer())
    const name = `${prefix}_${Date.now()}_${file.name}`
    const res = await uploadFileToSupabase(buffer, name, file.type || 'application/octet-stream', 'Vehicle_Docs')
    return res.directLink || null
}

// ── Document renewals (tax / insurance / ACT / cargo) ───────────────────────

export async function renewVehicleDocument(formData: FormData) {
    const plate = formData.get('plate') as string
    const docType = formData.get('doc_type') as string
    const newExpiry = (formData.get('new_expiry') as string) || null
    const renewedDate = (formData.get('renewed_date') as string) || new Date().toISOString().slice(0, 10)
    const oldExpiry = (formData.get('old_expiry') as string) || null
    const cost = formData.get('cost') ? Number(formData.get('cost')) : null
    const vendor = (formData.get('vendor') as string) || null
    const note = (formData.get('note') as string) || null
    const file = formData.get('file') as File | null

    if (!plate || !docType) return { success: false, error: 'ข้อมูลไม่ครบ (ทะเบียน/ประเภทเอกสาร)' }

    const supabase = createAdminClient()
    try {
        const fileUrl = await uploadOptionalFile(file, `${plate}_${docType}`)
        const createdBy = await getUserId().catch(() => null)

        const { error: insErr } = await supabase.from('Vehicle_Document_Renewals').insert({
            Vehicle_Plate: plate,
            doc_type: docType,
            renewed_date: renewedDate,
            old_expiry: oldExpiry,
            new_expiry: newExpiry,
            cost,
            vendor,
            file_url: fileUrl,
            note,
            created_by: createdBy,
        })
        if (insErr) return { success: false, error: insErr.message }

        // Move the vehicle's live expiry date forward.
        const col = DOC_EXPIRY_COLUMN[docType]
        if (col && newExpiry) {
            await supabase.from('Master_Vehicles').update({ [col]: newExpiry }).eq('Vehicle_Plate', plate)
        }

        revalidatePath('/vehicles')
        return { success: true }
    } catch (err) {
        return { success: false, error: (err as Error).message }
    }
}

export async function getVehicleRenewals(plate: string) {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('Vehicle_Document_Renewals')
        .select('*')
        .eq('Vehicle_Plate', plate)
        .order('renewed_date', { ascending: false })
    return data || []
}

// ── Tire logs (change / patch / rotate) ─────────────────────────────────────

export async function addTireLog(formData: FormData) {
    const plate = formData.get('plate') as string
    const action = formData.get('action') as string // change | patch | rotate
    const position = (formData.get('position') as string) || null
    const serviceDate = (formData.get('service_date') as string) || new Date().toISOString().slice(0, 10)
    const odometer = formData.get('odometer') ? Math.round(Number(formData.get('odometer'))) : null
    const brand = (formData.get('brand') as string) || null
    const qty = formData.get('qty') ? Math.round(Number(formData.get('qty'))) : null
    const cost = formData.get('cost') ? Number(formData.get('cost')) : null
    const vendor = (formData.get('vendor') as string) || null
    const nextChange = formData.get('next_change_mileage') ? Math.round(Number(formData.get('next_change_mileage'))) : null
    const note = (formData.get('note') as string) || null
    const file = formData.get('file') as File | null

    if (!plate || !action) return { success: false, error: 'ข้อมูลไม่ครบ (ทะเบียน/การดำเนินการ)' }

    const supabase = createAdminClient()
    try {
        const fileUrl = await uploadOptionalFile(file, `${plate}_tire`)
        const createdBy = await getUserId().catch(() => null)

        const { error: insErr } = await supabase.from('Tire_Logs').insert({
            Vehicle_Plate: plate,
            action,
            position,
            service_date: serviceDate,
            odometer,
            brand,
            qty,
            cost,
            vendor,
            next_change_mileage: nextChange,
            file_url: fileUrl,
            note,
            created_by: createdBy,
        })
        if (insErr) return { success: false, error: insErr.message }

        // A full change updates the vehicle's live tire status used for reminders.
        if (action === 'change') {
            const update: Record<string, unknown> = { Tire_Change_Date: serviceDate }
            if (odometer != null) update.Tire_Change_Odometer = odometer
            if (nextChange != null) update.Tire_Next_Change_Mileage = nextChange
            await supabase.from('Master_Vehicles').update(update).eq('Vehicle_Plate', plate)
        }

        revalidatePath('/vehicles')
        return { success: true }
    } catch (err) {
        return { success: false, error: (err as Error).message }
    }
}

export async function getTireLogs(plate: string) {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('Tire_Logs')
        .select('*')
        .eq('Vehicle_Plate', plate)
        .order('service_date', { ascending: false })
    return data || []
}

// Per-vehicle history from the existing modules, so the Fleet hub can show them
// in one place instead of forcing the admin to open /fuel, /maintenance and
// /admin/vehicle-checks separately and filter by plate.

export async function getFuelLogsFor(plate: string) {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('Fuel_Logs')
        .select('Date_Time, Liters, Price_Total, Odometer')
        .eq('Vehicle_Plate', plate)
        .order('Date_Time', { ascending: false })
        .limit(200)
    return (data || []) as Array<Record<string, unknown>>
}

export async function getRepairTicketsFor(plate: string) {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('Repair_Tickets')
        .select('Date_Report, Issue_Type, Cost_Total, Status')
        .eq('Vehicle_Plate', plate)
        .order('Date_Report', { ascending: false })
        .limit(200)
    return (data || []) as Array<Record<string, unknown>>
}

export async function getVehicleChecksFor(plate: string) {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('Vehicle_Checks')
        .select('Check_Date, Driver_Name, Passed_Items, Photo_Urls, Signature_Url')
        .eq('Vehicle_Plate', plate)
        .order('Check_Date', { ascending: false })
        .limit(100)
    return (data || []) as Array<Record<string, unknown>>
}

/** Vehicle master + its owning subcontractor name, for the Fleet hub header. */
export async function getVehicleForHub(plate: string) {
    const supabase = createAdminClient()
    const { data } = await supabase.from('Master_Vehicles').select('*').eq('Vehicle_Plate', plate).maybeSingle()
    return data as Record<string, unknown> | null
}

export interface TirePositionSummary {
    position: string
    changeCount: number
    avgKmBetweenChanges: number | null
    lastOdometer: number | null
    /** How far the current tire at this position has run since its last change. */
    currentRunKm: number | null
}
export interface TireSummary {
    records: number
    counts: { change: number; patch: number; rotate: number }
    totalCost: number
    kmSpan: number
    costPerKm: number | null
    positions: TirePositionSummary[]
}

export interface VehicleCostSummary {
    fuelCost: number
    fuelLiters: number
    repairCost: number
    tireCost: number
    totalCost: number
    kmPerLiter: number | null
    /** Last 12 months, oldest→newest. */
    monthlyFuel: { month: string; cost: number; liters: number }[]
}

/**
 * Combined running-cost view for one vehicle: fuel (Fuel_Logs) + repairs
 * (Repair_Tickets) + tires (Tire_Logs) in a single place, so tire cost — which
 * lives in its own table — is finally counted alongside the rest.
 */
export async function getVehicleCostSummary(plate: string): Promise<VehicleCostSummary> {
    const supabase = createAdminClient()

    const [fuelRes, repairRes, tireRes] = await Promise.all([
        supabase.from('Fuel_Logs').select('Price_Total, Liters, Odometer, Date_Time').eq('Vehicle_Plate', plate),
        supabase.from('Repair_Tickets').select('Cost_Total, Date_Report, Status').eq('Vehicle_Plate', plate),
        supabase.from('Tire_Logs').select('cost').eq('Vehicle_Plate', plate),
    ])

    const fuelLogs = (fuelRes.data || []) as Array<Record<string, unknown>>
    const repairs = (repairRes.data || []) as Array<Record<string, unknown>>
    const tires = (tireRes.data || []) as Array<Record<string, unknown>>

    const fuelCost = fuelLogs.reduce((s, f) => s + (Number(f.Price_Total) || 0), 0)
    const fuelLiters = fuelLogs.reduce((s, f) => s + (Number(f.Liters) || 0), 0)
    const repairCost = repairs
        .filter(r => ['Completed', 'เสร็จสิ้น', 'ซ่อมเสร็จ'].includes(String(r.Status)))
        .reduce((s, r) => s + (Number(r.Cost_Total) || 0), 0)
    const tireCost = tires.reduce((s, t) => s + (Number(t.cost) || 0), 0)

    // km/L from the odometer span across fuel logs ÷ total litres (approximation).
    const odos = fuelLogs.map(f => Number(f.Odometer)).filter(n => Number.isFinite(n) && n > 0)
    const kmSpan = odos.length >= 2 ? Math.max(...odos) - Math.min(...odos) : 0
    const kmPerLiter = kmSpan > 0 && fuelLiters > 0 ? kmSpan / fuelLiters : null

    // Monthly fuel for the last 12 months.
    const months: string[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const monthMap: Record<string, { cost: number; liters: number }> = {}
    months.forEach(m => (monthMap[m] = { cost: 0, liters: 0 }))
    for (const f of fuelLogs) {
        const dt = f.Date_Time ? String(f.Date_Time).slice(0, 7) : ''
        if (monthMap[dt]) {
            monthMap[dt].cost += Number(f.Price_Total) || 0
            monthMap[dt].liters += Number(f.Liters) || 0
        }
    }
    const monthlyFuel = months.map(m => ({ month: m, cost: monthMap[m].cost, liters: monthMap[m].liters }))

    return {
        fuelCost, fuelLiters, repairCost, tireCost,
        totalCost: fuelCost + repairCost + tireCost,
        kmPerLiter, monthlyFuel,
    }
}

/** Aggregates a vehicle's Tire_Logs into per-vehicle and per-position stats. */
export async function getTireSummary(plate: string): Promise<TireSummary> {
    const logs = (await getTireLogs(plate)) as Array<Record<string, unknown>>

    // Current odometer of the vehicle — used to show how far each position's
    // current tire has run since its last change.
    const supabase = createAdminClient()
    const { data: veh } = await supabase.from('Master_Vehicles').select('Current_Mileage').eq('Vehicle_Plate', plate).maybeSingle()
    const currentMileage = Number(veh?.Current_Mileage) || 0

    const counts = { change: 0, patch: 0, rotate: 0 }
    let totalCost = 0
    const odometers: number[] = []
    const byPosition: Record<string, number[]> = {}

    for (const l of logs) {
        const action = String(l.action)
        if (action in counts) counts[action as keyof typeof counts]++
        totalCost += Number(l.cost) || 0
        const od = Number(l.odometer)
        if (Number.isFinite(od) && od > 0) odometers.push(od)
        // Average km between full CHANGES is only meaningful per position.
        if (action === 'change' && Number.isFinite(od) && od > 0) {
            const pos = (l.position ? String(l.position) : 'ไม่ระบุตำแหน่ง').trim()
            ;(byPosition[pos] ||= []).push(od)
        }
    }

    const positions: TirePositionSummary[] = Object.entries(byPosition).map(([position, ods]) => {
        ods.sort((a, b) => a - b)
        let avgKmBetweenChanges: number | null = null
        if (ods.length >= 2) {
            let sum = 0
            for (let i = 1; i < ods.length; i++) sum += ods[i] - ods[i - 1]
            avgKmBetweenChanges = Math.round(sum / (ods.length - 1))
        }
        const lastOdometer = ods[ods.length - 1]
        const currentRunKm = currentMileage > 0 && lastOdometer > 0 && currentMileage >= lastOdometer
            ? currentMileage - lastOdometer
            : null
        return { position, changeCount: ods.length, avgKmBetweenChanges, lastOdometer, currentRunKm }
    }).sort((a, b) => b.changeCount - a.changeCount)

    const kmSpan = odometers.length >= 2 ? Math.max(...odometers) - Math.min(...odometers) : 0
    const costPerKm = kmSpan > 0 ? totalCost / kmSpan : null

    return { records: logs.length, counts, totalCost, kmSpan, costPerKm, positions }
}
