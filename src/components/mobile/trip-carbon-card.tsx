import type { TripCarbon } from "@/lib/utils/job-carbon"

/**
 * "คาร์บอนฟุตพริ้นต์เที่ยวนี้" block for the printable delivery notes (POD /
 * container). Plain light styling because these are rendered to image via
 * html2canvas — keep it free of theme tokens.
 */
export function TripCarbonCard({ carbon }: { carbon?: TripCarbon | null }) {
  if (!carbon) return null
  return (
    <div className="mb-8 break-inside-avoid rounded border border-emerald-200 bg-emerald-50 p-4">
      <h3 className="font-bold text-emerald-800 mb-2">🌱 คาร์บอนฟุตพริ้นต์เที่ยวนี้ (Carbon Footprint)</h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-lg text-gray-500">ระยะทางขนส่ง</p>
          <p className="text-2xl font-bold">{carbon.distanceKm.toLocaleString()} กม.</p>
        </div>
        <div>
          <p className="text-lg text-gray-500">ปล่อยก๊าซเรือนกระจก</p>
          <p className="text-2xl font-bold text-emerald-700">{carbon.co2Kg.toLocaleString()} kgCO₂e</p>
        </div>
        <div>
          <p className="text-lg text-gray-500">เทียบเท่าต้นไม้ที่ต้องปลูกชดเชย</p>
          <p className="text-2xl font-bold">{carbon.trees.toLocaleString()} ต้น</p>
        </div>
      </div>
      <p className="mt-2 text-base text-gray-500">
        คำนวณตาม ISO 14083 / GLEC / อบก. · เที่ยวเดียว (ไม่รวมเที่ยวรถเปล่ากลับ) · {carbon.method}
      </p>
    </div>
  )
}
