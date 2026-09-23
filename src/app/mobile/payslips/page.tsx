import { getDriverSession } from "@/lib/auth-utils"
import { redirect } from "next/navigation"
import Link from "next/link"
import { MobileHeader } from "@/components/mobile/mobile-header"
import { Card, CardContent } from "@/components/ui/card"
import { getMyPayslips } from "@/lib/actions/payslip-actions"
import { FileText, ChevronRight, Banknote } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function PayslipsPage() {
  const session = await getDriverSession()
  if (!session?.driverId && !session?.subId) redirect("/mobile/login")
  const isSubOwner = !!session?.subId

  const slips = await getMyPayslips()

  return (
    <div className="min-h-full bg-background pb-24 pt-16 px-4">
      <MobileHeader title="ใบสรุปจ่ายรถ" showBack />

      <div className="space-y-3">
        {slips.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText size={40} className="mx-auto mb-3 opacity-40" />
            <p>ยังไม่มีใบสรุปจ่ายรถ</p>
            <p className="text-sm mt-1">แอดมินจะอัปโหลดให้เมื่อถึงงวดจ่าย</p>
          </div>
        ) : (
          slips.map((s) => {
            const meta = s as Record<string, unknown>
            const total = meta.total_amount as number | null
            const uploaded = meta.uploaded_at ? new Date(String(meta.uploaded_at)) : null
            return (
              <Link key={String(meta.id)} href={`/mobile/payslips/${meta.id}`}>
                <Card className="bg-white border-gray-200 hover:border-indigo-300 transition-colors">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                        <Banknote className="text-indigo-600" size={22} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">
                          {isSubOwner && meta.driver_name ? String(meta.driver_name) : String(meta.title || "ใบสรุปจ่ายรถ")}
                        </p>
                        <p className="text-sm text-gray-400 truncate">
                          {isSubOwner && meta.driver_name ? String(meta.title || "") + " · " : ""}
                          {meta.period_label ? `งวด ${meta.period_label}` : ""}
                          {uploaded ? ` · ${uploaded.toLocaleDateString("th-TH")}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {typeof total === "number" && (
                        <span className="font-bold text-emerald-600">฿{total.toLocaleString()}</span>
                      )}
                      <ChevronRight className="text-gray-300" size={18} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
