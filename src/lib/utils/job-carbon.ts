/**
 * Per-trip carbon footprint — the ONE formula every per-job document uses
 * (LINE completion message, POD / container delivery note, /track page + POD PDF,
 * invoice page + invoice Excel, and the [ESG] note written at POD time).
 *
 * Previously each place computed its own number (tonne-km in LINE, per-km in the
 * invoice, raw un-normalized vehicle type in the Notes), so a customer could see
 * different kgCO₂e for the same trip. Keep all per-trip carbon going through here.
 *
 * Policy: "1 ขา รถหนัก" — one-way loaded leg, no empty return (emptyReturnRatio=0),
 * GLEC tonne-km when the job has a real cargo weight, otherwise distance-estimated.
 * Pure function: callers fetch factors via getCarbonFactors() (server) and pass them in.
 */
import { calculateJobEmissions, type CarbonFactors } from '@/lib/utils/esg-utils'

export type TripCarbon = {
  distanceKm: number
  co2Kg: number
  trees: number
  method: string
  scope: string
  /** true when distance was missing and `fallbackKm` was used instead */
  estimatedDistance: boolean
}

type TripCarbonInput = {
  Est_Distance_KM?: number | string | null
  Vehicle_Type?: string | null
  Weight_Kg?: number | string | null
}

/** Maps free-text vehicle types ("4", "6 ล้อคอก", "เทรลเลอร์ 22 ล้อ") to emission-factor keys. */
export function normalizeVehicleType(v: unknown): string {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return 'default'
  if (s.includes('motor') || s.includes('มอเตอร์')) return 'Motorcycle'
  // เลขล้อนำหน้า — เช็กเลขมากก่อน (กันชนกับ 2 หลัก)
  if (s.startsWith('22')) return '22-Wheel'
  if (s.startsWith('18')) return '18-Wheel'
  if (s.startsWith('10')) return '10-Wheel'
  if (s.startsWith('6')) return '6-Wheel'
  if (s.startsWith('4')) return '4-Wheel'
  // เลขล้ออยู่กลางชื่อ เช่น "เทรลเลอร์ 18 ล้อ", "หางพื้นเรียบ 22W"
  const m = s.match(/(22|18|10|6|4)\s*(ล้อ|-?w\b|-?wheel)/)
  if (m) return `${m[1]}-Wheel`
  // รถหัวลาก/พ่วงที่ไม่ระบุล้อ → 22-Wheel (EF สูงกว่า 18 = ไม่ประเมินต่ำเกินจริง)
  if (/เทรลเลอร์|หาง|หัวลาก|trailer|semi/.test(s)) return '22-Wheel'
  return 'default'
}

/**
 * Emission-factor key for a job's vehicle type. An exact (case-insensitive) match
 * to a row the admin configured in /settings/esg wins — e.g. a dedicated "4 WJ"
 * row — otherwise fall back to the wheel-count normalization above.
 */
export function resolveVehicleKey(v: unknown, factors?: CarbonFactors): string {
  const raw = String(v ?? '').trim().toLowerCase()
  if (raw && factors?.freightPerKm) {
    const hit = Object.keys(factors.freightPerKm).find(k => k.trim().toLowerCase() === raw)
    if (hit) return hit
  }
  return normalizeVehicleType(v)
}

/**
 * Returns null when the job has no distance and no `fallbackKm` is given — documents
 * shown to customers should not print a carbon figure built on a made-up distance.
 */
export function computeTripCarbon(
  job: TripCarbonInput,
  factors: CarbonFactors | undefined,
  opts: { fallbackKm?: number } = {}
): TripCarbon | null {
  const km = Number(job.Est_Distance_KM) || 0
  const distanceKm = km > 0 ? km : (opts.fallbackKm ?? 0)
  if (distanceKm <= 0) return null

  const rawWeight = Number(job.Weight_Kg) || 0
  const cargoWeightTonnes = rawWeight > 0 ? rawWeight / 1000 : null
  const esg = calculateJobEmissions(distanceKm, null, resolveVehicleKey(job.Vehicle_Type, factors), factors, cargoWeightTonnes, 0)

  return {
    distanceKm,
    co2Kg: esg.co2EmissionsKg,
    trees: esg.treesEquivalentToOffset,
    method: esg.calculationMethod,
    scope: esg.ghgScope,
    estimatedDistance: km <= 0,
  }
}
