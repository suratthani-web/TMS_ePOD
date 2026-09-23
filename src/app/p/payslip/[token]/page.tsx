import { getPayslipByPublicToken } from "@/lib/actions/payslip-actions"
import { PayslipDetailClient } from "@/app/mobile/payslips/payslip-detail-client"

export const dynamic = "force-dynamic"

// หน้าสาธารณะ — เปิดใบสรุปจ่ายรถจากลิงก์ Flex card โดยไม่ต้องล็อกอิน
export default async function PublicPayslipPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const res = await getPayslipByPublicToken(token)

  if (!res.ok || (!res.grid && !res.voucher)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center text-slate-500 py-16">
          <p className="text-lg font-bold">ไม่พบใบสรุปจ่ายรถ</p>
          <p className="text-sm mt-1">{res.error || "ลิงก์อาจไม่ถูกต้องหรือถูกลบไปแล้ว"}</p>
        </div>
      </div>
    )
  }

  const meta = res.meta as Record<string, unknown>
  const total = meta.total_amount as number | null
  const subtitle = String(meta.period_label || "")

  return (
    <div className="min-h-screen bg-slate-50 pb-16 pt-6 px-4 w-full max-w-7xl mx-auto">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 p-5 mb-4 shadow-lg">
        <p className="text-blue-100 text-sm">{String(meta.title || "ใบสรุปจ่ายรถ")}</p>
        {subtitle && <p className="text-blue-100 text-xs mt-0.5">งวด {subtitle}</p>}
        {typeof total === "number" && (
          <h2 className="text-3xl font-bold text-white mt-2">฿{total.toLocaleString()}</h2>
        )}
        {meta.driver_name ? <p className="text-blue-100 text-xs mt-1">{String(meta.driver_name)}</p> : null}
      </div>

      <PayslipDetailClient
        kind={res.kind || "excel"}
        grid={res.grid}
        voucher={res.voucher}
        title={String(meta.title || "payslip")}
        subtitle={subtitle}
      />
    </div>
  )
}
