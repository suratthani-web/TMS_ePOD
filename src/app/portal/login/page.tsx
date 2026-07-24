import { getSession } from "@/lib/session"
import { redirect } from "next/navigation"
import { Lock } from "lucide-react"
import { PortalLoginForm } from "./login-form"

export const dynamic = 'force-dynamic'

export default async function PortalLoginPage() {
  const session = await getSession()
  if (session?.customerId) redirect('/portal/jobs')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/drouteMind-mark.svg" alt="DRouteMind" width={92} height={86} className="mx-auto mb-3" />
          <h1 className="text-2xl font-black text-slate-900">
            <span className="text-[#e12228]">D</span>Route<span className="text-[#e12228]">Mind</span>
          </h1>
          <p className="text-slate-500 mt-1 font-medium">Customer Portal · ติดตามงานและดาวน์โหลด POD</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-black text-slate-800">เข้าสู่ระบบ</h2>
          </div>
          <PortalLoginForm />
          <p className="text-center text-xs text-slate-400 mt-6 font-medium">
            ไม่มีบัญชี? ติดต่อทีมขนส่งเพื่อขอสิทธิ์เข้าใช้งาน
          </p>
        </div>
      </div>
    </div>
  )
}
