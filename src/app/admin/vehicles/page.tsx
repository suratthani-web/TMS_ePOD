export const dynamic = 'force-dynamic'

import Link from "next/link"
import {
  Activity,
  ArrowLeft,
  Fuel,
  Target,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react"
import {
  getDriverLeaderboard,
  getOperationalStats,
  getSubcontractorPerformance,
} from "@/lib/supabase/analytics"
import { DriverLeaderboard } from "@/components/analytics/driver-leaderboard"
import { MonthFilter } from "@/components/analytics/month-filter"
import { SubcontractorPerformance } from "@/components/analytics/subcontractor-performance"
import { PremiumCard } from "@/components/ui/premium-card"
import { cn } from "@/lib/utils"
import { isSuperAdmin } from "@/lib/permissions"

export default async function FleetDashboardPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
  const searchParams = await props.searchParams
  const startDate = searchParams.startDate
  const endDate = searchParams.endDate
  const branchId = searchParams.branch
  await isSuperAdmin()

  const [opStats, subPerf, driverRank] = await Promise.all([
    getOperationalStats(branchId, startDate, endDate),
    getSubcontractorPerformance(startDate, endDate, branchId),
    getDriverLeaderboard(startDate, endDate, branchId)
  ])

  const utilization = opStats.fleet.utilization
  const fuelEfficiency = opStats.fleet.fuelEfficiency

  return (
    <div className="space-y-6 pb-10 p-4 lg:p-6 bg-background text-foreground">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-card p-6 lg:p-8 rounded-2xl border border-border shadow-sm">
        <div className="space-y-4">
          <Link href="/admin/analytics" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors text-sm font-medium group/back">
            <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" />
            กลับไปแดชบอร์ดสถิติ
          </Link>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
              <Truck size={28} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-foreground tracking-tight">
                Trip performance
              </h1>
              <p className="text-sm font-medium text-muted-foreground mt-1">
                วิเคราะห์การใช้รถ ผู้รับเหมาขนส่ง พนักงานขับรถ และต้นทุนพลังงาน
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start lg:items-end gap-4">
          <div className="bg-muted/40 border border-border px-4 py-2 rounded-xl flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-muted-foreground">ข้อมูลพร้อมใช้งาน</span>
          </div>
          <div className="flex items-center gap-4 bg-muted/30 p-2 rounded-2xl border border-border">
            <MonthFilter />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PremiumCard className="lg:col-span-2 bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Activity size={22} className="text-primary" />
              <h2 className="text-xl font-semibold text-foreground">ประสิทธิภาพการใช้รถ</h2>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <TrendingUp size={14} className="text-emerald-600" />
              <span className="text-sm font-medium text-emerald-600">เป้าหมายการใช้รถ 85%</span>
            </div>
          </div>

          <div className="p-6 lg:p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <MetricPanel
                label="อัตราการออกงานรถ"
                value={`${utilization.toFixed(1)}%`}
                helper="เทียบกับรถทั้งหมดในช่วงที่เลือก"
                accent="primary"
              />
              <MetricPanel
                label="ส่งงานตรงเวลา"
                value={`${opStats.fleet.onTimeDelivery.toFixed(1)}%`}
                helper="คำนวณจากงานที่มีเวลาส่งมอบ"
                accent="success"
              />
              <MetricPanel
                label="รถที่กำลังเดินทาง"
                value={`${opStats.fleet.active}`}
                helper="งานที่ยังอยู่ในสถานะ active"
                accent="neutral"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm font-medium">
                <span className="text-muted-foreground">Utilization</span>
                <span className="text-foreground">{utilization.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-1000"
                  style={{ width: `${Math.min(utilization, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </PremiumCard>

        <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/20 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-3">
              <Truck size={18} className="text-primary" />
              ประเภทงานขนส่ง
            </h3>
            <div className="w-2 h-2 rounded-full bg-primary" />
          </div>
          <div className="p-6">
            <SubcontractorPerformance data={subPerf} />
          </div>
        </PremiumCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <PremiumCard className="lg:col-span-3 bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/20 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Users className="text-primary" size={22} strokeWidth={2.5} />
              <h2 className="text-xl font-semibold text-foreground">อันดับผลงานพนักงานขับรถ</h2>
            </div>
            <span className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1.5 rounded-xl border border-border">
              เรียงตามผลงานในช่วงที่เลือก
            </span>
          </div>
          <div className="p-6">
            <DriverLeaderboard data={driverRank} />
          </div>
        </PremiumCard>

        <PremiumCard className="lg:col-span-2 bg-card border border-border shadow-sm rounded-2xl overflow-hidden self-start">
          <div className="p-6 border-b border-border bg-muted/20 flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-600 border border-amber-500/20">
              <Fuel size={22} strokeWidth={2.5} />
            </div>
            <h3 className="text-lg font-semibold text-foreground">อัตราสิ้นเปลืองพลังงาน</h3>
          </div>
          <div className="flex flex-col items-center justify-center py-12 px-8">
            <div className="text-6xl font-semibold text-foreground leading-none">
              {fuelEfficiency.toFixed(1)}
            </div>
            <div className="text-sm font-medium text-amber-600 mt-2">กิโลเมตร / ลิตร</div>

            <div className="mt-10 flex gap-2 w-full max-w-[300px] h-3">
              {[1,2,3,4,5,6,7,8,9,10].map(i => (
                <div
                  key={i}
                  className={cn(
                    "flex-1 rounded-full transition-all duration-1000",
                    i <= (fuelEfficiency / 1.5) ? 'bg-amber-500' : 'bg-muted'
                  )}
                />
              ))}
            </div>

            <div className="mt-8 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 w-full">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400 text-center">
                ระดับประสิทธิภาพ: {fuelEfficiency > 10 ? 'ดีเยี่ยม' : 'ปกติ'}
              </p>
            </div>
          </div>
        </PremiumCard>
      </div>

      <div className="mt-8 p-6 rounded-2xl bg-muted/30 border border-border flex flex-col md:flex-row gap-6 items-center">
        <div className="p-4 rounded-2xl bg-primary/10 text-primary border border-primary/20">
          <Target size={28} />
        </div>
        <div className="space-y-2 text-center md:text-left flex-1">
          <p className="text-lg font-semibold text-foreground">ข้อสังเกตจากข้อมูลการเดินรถ</p>
          <p className="text-sm font-medium text-muted-foreground leading-relaxed">
            ใช้หน้านี้เพื่อตรวจอัตราการใช้รถ ความตรงเวลา ผลงานพนักงานขับรถ และแนวโน้มการใช้พลังงานก่อนวางแผนงานรอบถัดไป
          </p>
        </div>
      </div>
    </div>
  )
}

function MetricPanel({
  label,
  value,
  helper,
  accent,
}: {
  label: string
  value: string
  helper: string
  accent: "primary" | "success" | "neutral"
}) {
  const valueClass = {
    primary: "text-primary",
    success: "text-emerald-600",
    neutral: "text-foreground",
  }[accent]

  return (
    <div className="rounded-2xl border border-border bg-background/60 p-5 space-y-3">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn("text-4xl font-semibold leading-none", valueClass)}>{value}</p>
      <p className="text-xs font-medium text-muted-foreground leading-relaxed">{helper}</p>
    </div>
  )
}
