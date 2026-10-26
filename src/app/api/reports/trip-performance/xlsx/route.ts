import { NextRequest, NextResponse } from "next/server"
import { verifyTripPerformanceDownloadToken } from "@/lib/reports/trip-performance-token"
import { getCostPerTrip } from "@/app/reports/cost-per-trip/actions"
import { buildTripPerformanceWorkbook } from "@/lib/reports/trip-performance-xlsx"
import { createAdminClient } from "@/utils/supabase/server"

export const dynamic = "force-dynamic"

/**
 * Route สำหรับดาวน์โหลดรายงาน Trip Performance เป็นไฟล์ Excel (.xlsx)
 * ตรวจสอบความปลอดภัยผ่าน Signed JWT Token ที่สร้างจากระบบ
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")
    if (!token) {
      return NextResponse.json({ error: "ไม่พบ Token สำหรับดาวน์โหลด" }, { status: 400 })
    }

    const payload = await verifyTripPerformanceDownloadToken(token)
    if (!payload) {
      return NextResponse.json({ error: "ลิงก์ดาวน์โหลดหมดอายุหรือไม่ถูกต้อง กรุณาขอใหม่อีกครั้ง" }, { status: 401 })
    }

    const { start, end, customerNames, branchId } = payload

    // ดึงข้อมูลต้นทุนรายเที่ยวโดยระบุสิทธิ์แอดมิน
    const { trips, summary } = await getCostPerTrip(start, end, customerNames, {
      isUserAdmin: true,
      branchId: branchId || null
    })

    if (!trips.length) {
      return NextResponse.json({ error: "ไม่พบข้อมูลงานในช่วงเวลาที่เลือก" }, { status: 404 })
    }

    // แปลงชื่อสาขา
    let branchLabel = "ทุกสาขา"
    if (branchId && branchId !== "All") {
      try {
        const supabase = createAdminClient()
        const { data } = await supabase
          .from("Master_Branches")
          .select("Branch_Name")
          .eq("Branch_ID", branchId)
          .maybeSingle()
        branchLabel = `${data?.Branch_Name || branchId} (${branchId})`
      } catch {
        branchLabel = branchId
      }
    }

    // สร้างไฟล์ Excel 3 แท็บ
    const buffer = await buildTripPerformanceWorkbook(trips, summary, {
      start,
      end,
      branchLabel,
      scopeLabel: customerNames?.length ? `ลูกค้า: ${customerNames.join(", ")}` : "ทุกลูกค้า",
      generatedAt: new Date(),
    })

    const safeFileName = `Trip_Performance_${start}_${end}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(safeFileName)}"`,
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    })
  } catch (err: unknown) {
    console.error("[Trip Performance Download Error]:", err)
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการสร้างไฟล์ Excel" }, { status: 500 })
  }
}
