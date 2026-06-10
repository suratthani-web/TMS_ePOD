export const dynamic = 'force-dynamic'

import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { StatsGrid } from "@/components/ui/stats-grid"
import {
  BarChart3,
  Package,
  Fuel,
  Wrench,
  Users,
  Truck,
  ShieldCheck,
  Zap,
  DollarSign,
  ArrowRight
} from "lucide-react"
import Link from "next/link"
import { cookies } from "next/headers"
import { getAllJobs } from "@/lib/supabase/jobs"
import { getDriverStats } from "@/lib/supabase/drivers"
import { getVehicleStats } from "@/lib/supabase/vehicles"
import { getTodayFuelStats } from "@/lib/supabase/fuel"
import { getRepairTicketStats } from "@/lib/supabase/maintenance"
import { ReportBuilder } from "@/components/reports/report-builder"
import { getSOSDriverIds } from "@/lib/supabase/sos"
import { getSystemLogs } from "@/lib/supabase/logs"
import { getExecutiveDashboardUnified } from "@/lib/supabase/financial-analytics"
import { ActivityFeed } from "@/components/dashboard/activity-feed"

export default async function ReportsPage() {
  const cookieStore = await cookies()
  const language = cookieStore.get('app_language')?.value === 'en' ? 'en' : 'th'
  const copy = {
    th: {
      eyebrow: 'รายงานและวิเคราะห์',
      title: 'ศูนย์รายงาน',
      subtitle: 'รวมรายงานการขนส่ง การเงิน ทรัพยากร และข้อมูลสำหรับส่งออก',
      profitAnalysis: 'กำไรต่อเที่ยว',
      dataReady: 'ข้อมูลพร้อมใช้งาน',
      protected: 'สิทธิ์ปลอดภัย',
      stats: {
        jobs: 'งานขนส่งทั้งหมด',
        drivers: 'คนขับทั้งหมด',
        fleet: 'รถทั้งหมด',
        fuel: 'ค่าน้ำมันวันนี้',
        maintenance: 'งานซ่อมค้าง',
      },
      builderTitle: 'สร้างรายงาน',
      builderSubtitle: 'เลือกประเภทข้อมูล กำหนดตัวกรอง แล้วส่งออกไฟล์',
      activityTitle: 'กิจกรรมล่าสุด',
      activitySubtitle: 'สรุปการเปลี่ยนแปลงและเหตุการณ์สำคัญในระบบ',
      footer: 'รายงานอัปเดตจากข้อมูลปฏิบัติงานล่าสุด',
    },
    en: {
      eyebrow: 'Reports and analytics',
      title: 'Reporting Hub',
      subtitle: 'Transport, finance, resource, and export-ready operational reports',
      profitAnalysis: 'Profit per trip',
      dataReady: 'Data ready',
      protected: 'Protected access',
      stats: {
        jobs: 'Transport jobs',
        drivers: 'Drivers',
        fleet: 'Vehicles',
        fuel: 'Fuel today',
        maintenance: 'Open maintenance',
      },
      builderTitle: 'Create Report',
      builderSubtitle: 'Choose a data type, set filters, and export the result',
      activityTitle: 'Recent Activity',
      activitySubtitle: 'Recent changes and important system events',
      footer: 'Reports refresh from the latest operational data',
    }
  }[language]

  const [
    { count: jobCount }, 
    driverStats, 
    vehicleStats, 
    fuelStats, 
    maintenanceStats,
    sosIds,
    logs,
    unified
  ] = await Promise.all([
    getAllJobs(1, 1),
    getDriverStats(),
    getVehicleStats(),
    getTodayFuelStats(),
    getRepairTicketStats(),
    getSOSDriverIds(),
    getSystemLogs({ limit: 10 }),
    getExecutiveDashboardUnified(),
  ])

  const jobStats = {
    total: unified?.kpi?.jobs?.current ?? 0,
    pending: unified?.statusDist?.find((s: { name: string, value: number }) => ['New', 'Requested', 'Assigned', 'Pending'].includes(s.name))
                ? unified.statusDist.filter((s: { name: string, value: number }) => ['New', 'Requested', 'Assigned', 'Pending'].includes(s.name)).reduce((a: number, b: { value: number }) => a + b.value, 0)
                : 0,
    inProgress: unified?.statusDist?.find((s: { name: string, value: number }) => ['In Progress', 'In Transit', 'Active'].includes(s.name))
                 ? unified.statusDist.filter((s: { name: string, value: number }) => ['In Progress', 'In Transit', 'Active'].includes(s.name)).reduce((a: number, b: { value: number }) => a + b.value, 0)
                 : 0,
    delivered: unified?.statusDist?.find((s: { name: string, value: number }) => ['Completed', 'Delivered', 'Finished', 'Closed'].includes(s.name))
                   ? unified.statusDist.filter((s: { name: string, value: number }) => ['Completed', 'Delivered', 'Finished', 'Closed'].includes(s.name)).reduce((a: number, b: { value: number }) => a + b.value, 0)
                   : 0
  }

  return (
    <DashboardLayout>
      {/* Report header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 bg-card p-8 rounded-2xl border border-border shadow-sm relative">
        <div className="relative z-10 space-y-2">
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary/10 rounded-lg border border-primary/20">
                    <BarChart3 className="text-primary" size={16} />
                </div>
                <h2 className="text-sm font-semibold text-primary">{copy.eyebrow}</h2>
            </div>
            <h1 className="text-3xl lg:text-4xl font-semibold text-foreground tracking-tight flex items-center gap-4 leading-tight">
                {copy.title}
            </h1>
            <p className="text-muted-foreground font-medium text-sm leading-relaxed">
              {copy.subtitle}
            </p>
        </div>

        <div className="flex flex-wrap gap-3 relative z-10">
          <Link href="/reports/cost-per-trip">
            <button className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all shadow-sm flex items-center gap-2 group/btn text-sm">
                <DollarSign size={16} />
                {copy.profitAnalysis}
                <ArrowRight size={14} className="ml-1 group-hover/btn:translate-x-1 transition-transform" />
            </button>
          </Link>
          <div className="flex items-center gap-3 bg-muted/50 p-2.5 rounded-xl border border-border">
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-muted-foreground">{copy.dataReady}</span>
            </div>
            <div className="w-px h-4 bg-muted/80" />
            <div className="flex items-center gap-2">
                <ShieldCheck size={12} className="text-primary" />
                <span className="text-xs font-medium text-muted-foreground">{copy.protected}</span>
            </div>
          </div>
        </div>
      </div>

      <StatsGrid columns={5} stats={[
        { label: copy.stats.jobs, value: jobCount || 0, icon: <Package size={16} />, color: "indigo" },
        { label: `${copy.stats.drivers} (${driverStats.active})`, value: driverStats.total, icon: <Users size={16} />, color: "blue" },
        { label: `${copy.stats.fleet} (${vehicleStats.active})`, value: vehicleStats.total, icon: <Truck size={16} />, color: "purple" },
        { label: copy.stats.fuel, value: `฿${fuelStats.totalAmount.toLocaleString()}`, icon: <Fuel size={16} />, color: "emerald" },
        { label: copy.stats.maintenance, value: maintenanceStats.pending, icon: <Wrench size={16} />, color: "amber" },
      ]} />

      <div className="space-y-8 mt-10">
        <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 bg-primary rounded-full" />
            <div>
                <h3 className="text-xl font-semibold text-foreground tracking-tight">{copy.builderTitle}</h3>
                <p className="text-muted-foreground text-sm font-medium mt-0.5">{copy.builderSubtitle}</p>
            </div>
        </div>
        <div className="rounded-2xl border border-border bg-card shadow-sm p-1">
            <ReportBuilder />
        </div>
      </div>

      {/* Activity Log Section */}
      <div className="mt-16 space-y-8">
        <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 bg-accent rounded-full" />
            <div>
                <h3 className="text-xl font-semibold text-foreground tracking-tight">{copy.activityTitle}</h3>
                <p className="text-muted-foreground text-sm font-medium mt-0.5">{copy.activitySubtitle}</p>
            </div>
        </div>
        <div className="p-6 rounded-2xl border border-border bg-card shadow-sm">
            <ActivityFeed jobStats={jobStats} sosCount={sosIds.length} logs={logs} />
        </div>
      </div>

      <div className="mt-16 text-center mb-20">
        <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full text-xs font-medium text-muted-foreground bg-muted/40 border border-border">
            <Zap size={12} className="text-primary" /> {copy.footer}
        </div>
      </div>
    </DashboardLayout>
  )
}

