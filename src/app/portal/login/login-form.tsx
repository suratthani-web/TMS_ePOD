"use client"

import { useActionState } from "react"
import { portalLogin } from "@/app/portal/actions"

const initialState = { error: "" }

export function PortalLoginForm() {
  const [state, action, pending] = useActionState(
    async (_prev: typeof initialState, formData: FormData) => {
      const result = await portalLogin(formData)
      return result ?? initialState
    },
    initialState
  )

  return (
    <form action={action} className="space-y-5">
      {state.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-bold px-4 py-3 rounded-xl">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-bold text-slate-700 mb-1">
          อีเมล (Email)
        </label>
        <input
          name="email"
          type="email"
          placeholder="your@email.com"
          className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="relative flex items-center">
        <div className="flex-1 border-t border-slate-200" />
        <span className="px-3 text-xs font-bold text-slate-400 uppercase">หรือ</span>
        <div className="flex-1 border-t border-slate-200" />
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700 mb-1">
          รหัสลูกค้า (Customer ID / Access Code)
        </label>
        <input
          name="access_code"
          type="text"
          placeholder="เช่น CUST-001"
          className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-black rounded-xl transition-colors shadow-sm"
      >
        {pending ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
      </button>
    </form>
  )
}
