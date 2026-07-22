"use client"

import { Building2, ArrowRight, Truck, CheckCircle2, Clock } from "lucide-react"
import Link from "next/link"
import { useLanguage } from "@/components/providers/language-provider"

export type CustomerSummaryItem = {
  Customer_ID: string
  Customer_Name: string
  Branch_ID?: string | null
  Customer_Code?: string | number
  totalJobs?: number
  deliveredJobs?: number
  inProgressJobs?: number
}

interface CustomerSummaryWidgetProps {
  customers: CustomerSummaryItem[]
  isAdminUser?: boolean
}

// Preset Customer Codes & Colors for the 7 active customers
const CUSTOMER_PRESETS: Record<string, { code: string; color: string; bg: string; border: string }> = {
  "unicord": { code: "#2", color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  "ยูนิคอร์ด": { code: "#2", color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  "สยามรุ่งเรือง": { code: "#20", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  "siam": { code: "#20", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  "แบมบิโน่": { code: "#77", color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  "bambino": { code: "#77", color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20" },
  "ยังค์มีดี": { code: "#109", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  "youngmede": { code: "#109", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  "อินไลน์": { code: "#60", color: "text-cyan-500", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
  "inline": { code: "#60", color: "text-cyan-500", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
  "คิวพลัส": { code: "#55", color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" },
  "qplus": { code: "#55", color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" },
}

export function CustomerSummaryWidget({ customers = [], isAdminUser = false }: CustomerSummaryWidgetProps) {
  const { language } = useLanguage()

  if (!customers || customers.length === 0) return null

  const getPreset = (name: string) => {
    const s = (name || '').toLowerCase()
    for (const key in CUSTOMER_PRESETS) {
      if (s.includes(key)) return CUSTOMER_PRESETS[key]
    }
    return { code: "", color: "text-primary", bg: "bg-primary/10", border: "border-primary/20" }
  }

  return (
    <div className="bg-card border border-border rounded-3xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Building2 size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground tracking-tight">
              {language === 'th' ? "ภาพรวมงานแยกตามรายลูกค้า (7 รายหลัก)" : "Customer Workload Overview"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAdminUser 
                ? (language === 'th' ? "มุมมอง SuperAdmin: แสดงลูกค้าทุกสาขาทั่วประเทศ" : "SuperAdmin View: Displaying customers across all branches")
                : (language === 'th' ? "มุมมองสาขา: แสดงเฉพาะลูกค้าประจำสาขาที่เลือก" : "Branch View: Displaying active branch customers")}
            </p>
          </div>
        </div>
        <Link 
          href="/jobs/history" 
          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          {language === 'th' ? "ดูประวัติทั้งหมด" : "View All History"} <ArrowRight size={14} />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2">
        {customers.map((c) => {
          const preset = getPreset(c.Customer_Name)
          return (
            <Link
              key={c.Customer_ID}
              href={`/jobs/history?q=${encodeURIComponent(c.Customer_Name)}`}
              className={`p-4 rounded-2xl border ${preset.border} bg-card hover:bg-muted/30 transition-all hover:shadow-md group flex flex-col justify-between space-y-3 relative overflow-hidden`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    {preset.code && (
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${preset.bg} ${preset.color}`}>
                        {preset.code}
                      </span>
                    )}
                    {c.Branch_ID && (
                      <span className="text-[9px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {c.Branch_ID}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                    {c.Customer_Name}
                  </h4>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                <span className="text-muted-foreground font-medium text-[11px]">
                  {language === 'th' ? "เปิดดูตารางงาน" : "View Jobs"}
                </span>
                <div className="flex items-center gap-1 text-primary group-hover:translate-x-1 transition-transform font-bold text-xs">
                  <span>{language === 'th' ? "เข้าดู" : "Open"}</span>
                  <ArrowRight size={12} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
