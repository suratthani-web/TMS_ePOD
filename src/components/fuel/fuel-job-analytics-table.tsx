"use client"

import { useState, useMemo } from "react"
import { 
  Briefcase, 
  Calendar, 
  BarChart2, 
  CalendarDays, 
  Search, 
  Download, 
  ArrowUpRight, 
  Fuel, 
  Gauge, 
  DollarSign, 
  TrendingUp,
  Truck,
  CheckCircle2,
  AlertCircle
} from "lucide-react"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import * as XLSX from "xlsx"
import type { FuelIntelligenceSummary } from "@/lib/fuel/fuel-allocation-engine"
import { FuelMatchBadge, FuelFlagsPanel } from "@/components/fuel/fuel-match"

type ViewMode = 'job' | 'daily' | 'weekly' | 'monthly'

export function FuelJobAnalyticsTable({ data }: { data: FuelIntelligenceSummary }) {
  const [viewMode, setViewMode] = useState<ViewMode>('job')
  const [search, setSearch] = useState('')
  const recon = data.billReconciliation
  // Bills not landing on any job: no-job vehicles' bills, minus estimates that have no bill behind them
  const billGap = +(recon.billCost - (data.totalFuelCost - recon.noBillEstimateCost)).toFixed(2)

  // Export current view to Excel
  const handleExport = () => {
    let sheetData: Record<string, unknown>[] = []
    let fileName = `Fuel_Analytics_${viewMode}_${new Date().toISOString().slice(0, 10)}.xlsx`

    if (viewMode === 'job') {
      sheetData = data.jobAllocations.map((j, i) => ({
        "ลำดับ": i + 1,
        "Job ID": j.jobId,
        "วันที่": j.planDate,
        "ทะเบียนรถ": j.vehiclePlate,
        "คนขับ": j.driverName,
        "ลูกค้า": j.customerName,
        "เส้นทาง": j.routeName,
        "ระยะทาง (กม.)": j.distanceKm,
        "น้ำมันที่ใช้ (ลิตร)": j.allocatedLiters,
        "ค่าน้ำมันตามระยะ (บาท)": j.directFuelCost,
        "ส่วนต่าง กม.เปล่ากลับฐาน (บาท)": j.gapFuelCost,
        "ค่าน้ำมันลงงาน ตามบิล (บาท)": j.allocatedFuelCost,
        "ความมั่นใจการจับคู่บิล": j.fuelMatch ? { high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ' }[j.fuelMatch.confidence] : 'ประมาณ',
        "ไมล์จริง/ระยะงานไป-กลับ (%)": j.fuelMatch ? Math.round(j.fuelMatch.ratio * 100) : '',
        "บิลที่จับคู่": j.fuelMatch ? j.fuelMatch.fills.join(', ') : '',
        "อัตราสิ้นเปลือง (km/L)": j.kmPerLiter,
        "ต้นทุนน้ำมัน/กม. (บาท/กม.)": j.fuelCostPerKm,
        "รายได้ (บาท)": j.revenue,
        "ค่าจ้างคนขับ (บาท)": j.driverCost,
        "กำไรหลังหักน้ำมัน (บาท)": j.netProfit,
        "Margin (%)": `${j.profitMarginPct}%`,
        "สถานะ": j.jobStatus
      }))
    } else if (viewMode === 'daily') {
      sheetData = data.dailyAggregations.map((d, i) => ({
        "ลำดับ": i + 1,
        "วันที่": d.date,
        "จำนวนงาน": d.totalJobs,
        "ระยะทางรวม (กม.)": d.totalDistanceKm,
        "น้ำมันเติมเข้าถัง (ลิตร)": d.totalRefueledLiters,
        "น้ำมันที่ใช้ (ลิตร)": d.totalConsumedLiters,
        "ค่าน้ำมันลงงานรวม (บาท)": d.totalFuelCost,
        "อัตราเฉลี่ย (km/L)": d.avgKmPerLiter,
        "ต้นทุน/กม. (บาท/กม.)": d.avgCostPerKm,
        "รายได้รวม (บาท)": d.totalRevenue,
        "กำไรหลังหักน้ำมัน (บาท)": d.totalProfit
      }))
    } else if (viewMode === 'weekly') {
      sheetData = data.weeklyAggregations.map((w, i) => ({
        "ลำดับ": i + 1,
        "สัปดาห์": w.week,
        "จำนวนงาน": w.totalJobs,
        "ระยะทางรวม (กม.)": w.totalDistanceKm,
        "น้ำมันที่ใช้ (ลิตร)": w.totalLiters,
        "ค่าน้ำมันลงงานรวม (บาท)": w.totalFuelCost,
        "อัตราเฉลี่ย (km/L)": w.avgKmPerLiter,
        "รายได้รวม (บาท)": w.totalRevenue,
        "กำไรหลังหักน้ำมัน (บาท)": w.totalProfit
      }))
    } else if (viewMode === 'monthly') {
      sheetData = data.monthlyAggregations.map((m, i) => ({
        "ลำดับ": i + 1,
        "เดือน": m.month,
        "จำนวนงาน": m.totalJobs,
        "ระยะทางรวม (กม.)": m.totalDistanceKm,
        "น้ำมันที่ใช้ (ลิตร)": m.totalLiters,
        "ค่าน้ำมันลงงานรวม (บาท)": m.totalFuelCost,
        "อัตราเฉลี่ย (km/L)": m.avgKmPerLiter,
        "รายได้รวม (บาท)": m.totalRevenue,
        "กำไรหลังหักน้ำมัน (บาท)": m.totalProfit
      }))
    }

    const ws = XLSX.utils.json_to_sheet(sheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Analytics")
    XLSX.writeFile(wb, fileName)
  }

  // Filter items based on search query
  const filteredJobs = data.jobAllocations.filter(j => 
    j.jobId.toLowerCase().includes(search.toLowerCase()) ||
    j.vehiclePlate.toLowerCase().includes(search.toLowerCase()) ||
    j.customerName.toLowerCase().includes(search.toLowerCase()) ||
    j.driverName.toLowerCase().includes(search.toLowerCase()) ||
    j.routeName.toLowerCase().includes(search.toLowerCase())
  )

  // Period tables are fleet-wide (keyed by date), so a plate/customer search used
  // to wipe them out (it was matched against the date string). Now: no search →
  // full server aggregations; a date-like search → server rows whose period
  // contains it; otherwise (plate/job/customer/driver) → re-aggregate the
  // already-filtered jobs so the period tables reflect that search too.
  const weekKeyOf = (isoDate: string): string => {
    const d = new Date(isoDate)
    const startOfYear = new Date(d.getFullYear(), 0, 1)
    const pastDays = (d.getTime() - startOfYear.getTime()) / 86400000
    const weekNum = Math.ceil((pastDays + startOfYear.getDay() + 1) / 7)
    return `${d.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`
  }

  type DailyRow = typeof data.dailyAggregations[number]
  type WeeklyRow = typeof data.weeklyAggregations[number]
  type MonthlyRow = typeof data.monthlyAggregations[number]
  const round = (n: number) => +n.toFixed(2)

  const derived = useMemo(() => {
    const dayMap = new Map<string, DailyRow>()
    for (const j of filteredJobs) {
      const date = String(j.planDate || '').slice(0, 10)
      if (!date) continue
      const c: DailyRow = dayMap.get(date) || { date, totalJobs: 0, totalDistanceKm: 0, totalRefueledLiters: 0, totalConsumedLiters: 0, totalFuelCost: 0, avgKmPerLiter: 0, avgCostPerKm: 0, totalRevenue: 0, totalProfit: 0, vehiclesCount: 0 }
      c.totalJobs += 1
      c.totalDistanceKm += j.distanceKm
      c.totalConsumedLiters += j.allocatedLiters
      c.totalFuelCost += j.allocatedFuelCost
      c.totalRevenue += j.revenue
      c.totalProfit += j.netProfit
      dayMap.set(date, c)
    }
    const daily: DailyRow[] = Array.from(dayMap.values()).map(d => ({
      ...d,
      totalDistanceKm: round(d.totalDistanceKm),
      totalConsumedLiters: round(d.totalConsumedLiters),
      totalFuelCost: round(d.totalFuelCost),
      totalRevenue: round(d.totalRevenue),
      totalProfit: round(d.totalProfit),
      avgKmPerLiter: d.totalConsumedLiters > 0 ? round(d.totalDistanceKm / d.totalConsumedLiters) : 0,
      avgCostPerKm: d.totalDistanceKm > 0 ? round(d.totalFuelCost / d.totalDistanceKm) : 0,
    })).sort((a, b) => b.date.localeCompare(a.date))

    const weeklyMap = new Map<string, WeeklyRow>()
    const monthlyMap = new Map<string, MonthlyRow>()
    for (const d of daily) {
      const wk = weekKeyOf(d.date)
      const w: WeeklyRow = weeklyMap.get(wk) || { week: wk, totalJobs: 0, totalDistanceKm: 0, totalFuelCost: 0, totalLiters: 0, avgKmPerLiter: 0, totalRevenue: 0, totalProfit: 0 }
      w.totalJobs += d.totalJobs; w.totalDistanceKm += d.totalDistanceKm; w.totalFuelCost += d.totalFuelCost; w.totalLiters += d.totalConsumedLiters; w.totalRevenue += d.totalRevenue; w.totalProfit += d.totalProfit
      weeklyMap.set(wk, w)

      const mk = d.date.slice(0, 7)
      const m: MonthlyRow = monthlyMap.get(mk) || { month: mk, totalJobs: 0, totalDistanceKm: 0, totalFuelCost: 0, totalLiters: 0, avgKmPerLiter: 0, totalRevenue: 0, totalProfit: 0 }
      m.totalJobs += d.totalJobs; m.totalDistanceKm += d.totalDistanceKm; m.totalFuelCost += d.totalFuelCost; m.totalLiters += d.totalConsumedLiters; m.totalRevenue += d.totalRevenue; m.totalProfit += d.totalProfit
      monthlyMap.set(mk, m)
    }
    const finishWeek = (w: WeeklyRow): WeeklyRow => ({ ...w, totalDistanceKm: round(w.totalDistanceKm), totalFuelCost: round(w.totalFuelCost), totalLiters: round(w.totalLiters), totalRevenue: round(w.totalRevenue), totalProfit: round(w.totalProfit), avgKmPerLiter: w.totalLiters > 0 ? round(w.totalDistanceKm / w.totalLiters) : 0 })
    const finishMonth = (m: MonthlyRow): MonthlyRow => ({ ...m, totalDistanceKm: round(m.totalDistanceKm), totalFuelCost: round(m.totalFuelCost), totalLiters: round(m.totalLiters), totalRevenue: round(m.totalRevenue), totalProfit: round(m.totalProfit), avgKmPerLiter: m.totalLiters > 0 ? round(m.totalDistanceKm / m.totalLiters) : 0 })
    return {
      daily,
      weekly: Array.from(weeklyMap.values()).map(finishWeek).sort((a, b) => b.week.localeCompare(a.week)),
      monthly: Array.from(monthlyMap.values()).map(finishMonth).sort((a, b) => b.month.localeCompare(a.month)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredJobs])

  const q = search.trim()
  const filteredDaily = !q ? data.dailyAggregations : ((): DailyRow[] => { const byDate = data.dailyAggregations.filter(d => d.date.includes(q)); return byDate.length > 0 ? byDate : derived.daily })()
  const filteredWeekly = !q ? data.weeklyAggregations : ((): WeeklyRow[] => { const byP = data.weeklyAggregations.filter(w => w.week.includes(q)); return byP.length > 0 ? byP : derived.weekly })()
  const filteredMonthly = !q ? data.monthlyAggregations : ((): MonthlyRow[] => { const byP = data.monthlyAggregations.filter(m => m.month.includes(q)); return byP.length > 0 ? byP : derived.monthly })()

  return (
    <div className="space-y-6">
      {/* KPI Highlight Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <PremiumCard className="p-5 bg-background border border-border rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">บิลน้ำมันจริง</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Fuel size={16} />
            </div>
          </div>
          <p className="text-2xl font-black italic text-amber-500 tracking-tight">
            ฿{recon.billCost.toLocaleString()}
          </p>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mt-1">
            {recon.billCount.toLocaleString()} บิล · {recon.billLiters.toLocaleString()} ลิตร
          </p>
        </PremiumCard>

        <PremiumCard className="p-5 bg-background border border-border rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">ระยะทางรวมทั้งสิ้น</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Truck size={16} />
            </div>
          </div>
          <p className="text-2xl font-black italic text-foreground tracking-tight">
            {data.totalDistanceKm.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">กม.</span>
          </p>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mt-1">
            {data.totalJobs.toLocaleString()} งานขนส่ง
            {recon.odometerKm > 0 && <> · ไมล์จริง {recon.odometerKm.toLocaleString()} กม.</>}
          </p>
        </PremiumCard>

        <PremiumCard className="p-5 bg-background border border-border rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">ค่าน้ำมันลงงานรวม</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <DollarSign size={16} />
            </div>
          </div>
          <p className="text-2xl font-black italic text-emerald-500 tracking-tight">
            ฿{data.totalFuelCost.toLocaleString()}
          </p>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mt-1">
            ตามบิลจริง · เฉลี่ย ฿{data.fleetAvgCostPerKm}/กม.งาน
          </p>
        </PremiumCard>

        <PremiumCard className="p-5 bg-background border border-border rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">อัตราสิ้นเปลืองเฉลี่ย</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-500">
              <Gauge size={16} />
            </div>
          </div>
          <p className="text-2xl font-black italic text-cyan-400 tracking-tight">
            {data.fleetAvgKmPerLiter} <span className="text-xs font-normal text-muted-foreground">km/L</span>
          </p>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mt-1">
            Fleet Avg Efficiency
          </p>
        </PremiumCard>

        <PremiumCard className="p-5 bg-background border border-border rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">กำไรสุทธิหลังหักน้ำมัน</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
              <TrendingUp size={16} />
            </div>
          </div>
          <p className="text-2xl font-black italic text-purple-400 tracking-tight">
            ฿{data.totalProfit.toLocaleString()}
          </p>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mt-1">
            Margin {data.avgProfitMarginPct}% จากรายได้ ฿{data.totalRevenue.toLocaleString()}
          </p>
        </PremiumCard>
      </div>

      {/* Bill reconciliation: where the real bill total goes */}
      {recon.billCost > 0 && (
        <PremiumCard className="p-4 bg-background border border-border rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            {Math.abs(billGap) < 1 ? <CheckCircle2 size={14} className="text-emerald-500" /> : <AlertCircle size={14} className="text-amber-500" />}
            <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">กระทบยอดบิลจริง</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-[10px] font-black text-muted-foreground">ค่าน้ำมันตามระยะงาน</p>
              <p className="text-base font-black text-foreground">฿{recon.directJobCost.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">{recon.jobKmWithBills.toLocaleString()} กม.ตามงาน</p>
            </div>
            <div className="rounded-xl bg-amber-500/10 p-3">
              <p className="text-[10px] font-black text-muted-foreground">ส่วนต่าง กม.เปล่ากลับฐาน</p>
              <p className="text-base font-black text-amber-600">฿{recon.gapCost.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">
                {recon.odometerKm > 0
                  ? <>ไมล์จริง {recon.odometerKm.toLocaleString()} − งาน {recon.jobKmWithBills.toLocaleString()} = {Math.max(0, +(recon.odometerKm - recon.jobKmWithBills).toFixed(2)).toLocaleString()} กม.</>
                  : 'กระจายลงงานตามสัดส่วนระยะทาง'}
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-[10px] font-black text-muted-foreground">บิลช่วงไม่มีงานในระบบ</p>
              <p className={cn("text-base font-black", recon.noJobVehicleCost > 0 ? "text-rose-500" : "text-foreground")}>฿{recon.noJobVehicleCost.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground truncate" title={recon.noJobVehiclePlates.join(', ')}>
                {recon.noJobVehiclePlates.length > 0 ? recon.noJobVehiclePlates.join(', ') : 'ไม่มี'} · ไม่ได้ลงงาน
              </p>
            </div>
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-[10px] font-black text-muted-foreground">ประมาณการ (งานยังไม่มีบิลจบงาน)</p>
              <p className="text-base font-black text-foreground">฿{recon.noBillEstimateCost.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">ไม่อยู่ในยอดบิล</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            ค่าน้ำมันลงงาน ฿{data.totalFuelCost.toLocaleString()} = ตามระยะงาน + ส่วนต่าง + ประมาณการ ·
            บิลจริง ฿{recon.billCost.toLocaleString()} = ตามระยะงาน + ส่วนต่าง + บิลช่วงไม่มีงาน
            {Math.abs(billGap) >= 1 && <> (ต่างกัน ฿{billGap.toLocaleString()})</>}
          </p>
        </PremiumCard>
      )}

      <FuelFlagsPanel flags={data.fuelFlags} />

      {/* Control Bar: View Mode Switcher + Search + Export */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-background p-4 rounded-2xl border border-border shadow-sm">
        {/* 4 View Modes */}
        <div className="flex items-center p-1 bg-muted/60 rounded-xl border border-border overflow-x-auto">
          {[
            { id: 'job', label: 'ราย Job', icon: Briefcase },
            { id: 'daily', label: 'รายวัน', icon: Calendar },
            { id: 'weekly', label: 'รายสัปดาห์', icon: BarChart2 },
            { id: 'monthly', label: 'รายเดือน', icon: CalendarDays }
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id as ViewMode)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap",
                viewMode === mode.id
                  ? "bg-primary text-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <mode.icon size={14} />
              {mode.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา Job, ทะเบียน, ลูกค้า..."
              className="h-10 pl-9 bg-muted/40 border-border text-xs rounded-xl font-bold"
            />
          </div>
          <PremiumButton
            onClick={handleExport}
            variant="secondary"
            className="h-10 px-4 rounded-xl border-border bg-muted/80 hover:bg-muted text-foreground text-xs font-black uppercase tracking-wider flex items-center gap-2"
          >
            <Download size={14} />
            Export Excel
          </PremiumButton>
        </div>
      </div>

      {/* View 1: Job Level Table */}
      {viewMode === 'job' && (
        <PremiumCard className="p-0 overflow-hidden border border-border rounded-2xl bg-background shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b border-border text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  <th className="p-3.5 pl-6">Job ID / วันที่</th>
                  <th className="p-3.5">ทะเบียนรถ / คนขับ</th>
                  <th className="p-3.5">ลูกค้า / เส้นทาง</th>
                  <th className="p-3.5 text-right">ระยะทาง (กม.)</th>
                  <th className="p-3.5 text-right" title="น้ำมันที่งานนี้ใช้จริง = ระยะทาง ÷ อัตราสิ้นเปลือง (km/L)">น้ำมันที่ใช้ (L)</th>
                  <th className="p-3.5 text-right" title="บิลจริงที่จับคู่กับงานนี้: เติมจบงานตัดน้ำมันงานล่าสุด ตรวจกับเลขไมล์ (รวมขากลับวิ่งเปล่า) — งานที่ยังไม่มีบิลจบงานใช้ค่าประมาณตามระยะ">
                    <div>ค่าน้ำมันลงงาน (฿)</div>
                    <span className="text-[8px] font-normal text-muted-foreground block -mt-0.5 normal-case">(ตามบิลจริง)</span>
                  </th>
                  <th className="p-3.5 text-right">km/L</th>
                  <th className="p-3.5 text-right">รายได้ (฿)</th>
                  <th className="p-3.5 text-right pr-6" title="กำไรขั้นต้นของเที่ยว = รายได้ - ค่าคนขับ - ค่าน้ำมันจัดสรร">
                    <div>กำไรหลังหักน้ำมัน (฿)</div>
                    <span className="text-[8px] font-normal text-muted-foreground block -mt-0.5 normal-case">(หักคนขับ+น้ำมัน)</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-bold">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">ไม่พบข้อมูลงานในช่วงที่เลือก</td>
                  </tr>
                ) : (
                  filteredJobs.map((j) => (
                    <tr key={j.jobId} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3.5 pl-6">
                        <span className="font-black text-foreground">{j.jobId}</span>
                        <p className="text-[10px] text-muted-foreground">{j.planDate || '-'}</p>
                      </td>
                      <td className="p-3.5">
                        <Badge variant="outline" className="font-black bg-primary/10 border-primary/30 text-primary mb-0.5">
                          {j.vehiclePlate}
                        </Badge>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{j.driverName}</p>
                      </td>
                      <td className="p-3.5 max-w-[180px]">
                        <p className="font-black text-foreground truncate">{j.customerName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{j.routeName}</p>
                      </td>
                      <td className="p-3.5 text-right font-black text-foreground">
                        {j.distanceKm.toLocaleString()}
                      </td>
                      <td className="p-3.5 text-right font-bold text-cyan-400">
                        {j.allocatedLiters.toLocaleString()}
                      </td>
                      <td className="p-3.5 text-right font-black text-emerald-500">
                        ฿{j.allocatedFuelCost.toLocaleString()}
                        {j.gapFuelCost !== 0 && (
                          <p className="text-[9px] font-bold text-muted-foreground whitespace-nowrap">
                            ระยะ ฿{j.directFuelCost.toLocaleString()} {j.gapFuelCost >= 0 ? '+' : '−'} เปล่า ฿{Math.abs(j.gapFuelCost).toLocaleString()}
                          </p>
                        )}
                        <FuelMatchBadge match={j.fuelMatch} className="mt-0.5" />
                      </td>
                      <td className="p-3.5 text-right font-black">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px]",
                          j.kmPerLiter >= 8 ? "bg-emerald-500/10 text-emerald-400" :
                          j.kmPerLiter >= 5 ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400"
                        )}>
                          {j.kmPerLiter}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-bold text-foreground">
                        ฿{j.revenue.toLocaleString()}
                      </td>
                      <td className="p-3.5 text-right pr-6 font-black">
                        <span className={cn(
                          j.netProfit >= 0 ? "text-purple-400" : "text-rose-400"
                        )}>
                          ฿{j.netProfit.toLocaleString()}
                        </span>
                        <p className="text-[9px] text-muted-foreground">{j.profitMarginPct}%</p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PremiumCard>
      )}

      {/* View 2: Daily Aggregation Table */}
      {viewMode === 'daily' && (
        <PremiumCard className="p-0 overflow-hidden border border-border rounded-2xl bg-background shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b border-border text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  <th className="p-3.5 pl-6">วันที่</th>
                  <th className="p-3.5 text-center">จำนวนงาน</th>
                  <th className="p-3.5 text-right">ระยะทางรวม (กม.)</th>
                  <th className="p-3.5 text-right" title="ยอดรวมลิตรที่แวะเติมเข้าถังรถจากบิลปั๊ม">น้ำมันเติมเข้าถัง (L)</th>
                  <th className="p-3.5 text-right" title="ยอดรวมลิตรที่วิ่งงานใช้ไปจริงตามระยะทาง">น้ำมันที่ใช้ (L)</th>
                  <th className="p-3.5 text-right" title="ค่าน้ำมันลงงานรวมตามระยะทางวิ่งจริงของงานในวัน">ค่าน้ำมันลงงานรวม (฿)</th>
                  <th className="p-3.5 text-right">อัตราเฉลี่ย (km/L)</th>
                  <th className="p-3.5 text-right">รายได้รวม (฿)</th>
                  <th className="p-3.5 text-right pr-6" title="กำไรขั้นต้นรวมหลังหักคนขับและน้ำมันจัดสรร">กำไรหลังหักน้ำมัน (฿)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-bold">
                {filteredDaily.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">ไม่พบข้อมูลรายวัน</td>
                  </tr>
                ) : (
                  filteredDaily.map((d) => (
                    <tr key={d.date} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3.5 pl-6 font-black text-foreground">{d.date}</td>
                      <td className="p-3.5 text-center">
                        <Badge variant="outline" className="font-bold">{d.totalJobs} งาน</Badge>
                      </td>
                      <td className="p-3.5 text-right font-black text-foreground">{d.totalDistanceKm.toLocaleString()}</td>
                      <td className="p-3.5 text-right text-blue-400">{d.totalRefueledLiters > 0 ? `${d.totalRefueledLiters.toLocaleString()} L` : '-'}</td>
                      <td className="p-3.5 text-right text-cyan-400">{d.totalConsumedLiters.toLocaleString()} L</td>
                      <td className="p-3.5 text-right font-black text-emerald-500">฿{d.totalFuelCost.toLocaleString()}</td>
                      <td className="p-3.5 text-right font-black text-foreground">{d.avgKmPerLiter > 0 ? `${d.avgKmPerLiter} km/L` : '-'}</td>
                      <td className="p-3.5 text-right font-bold text-foreground">฿{d.totalRevenue.toLocaleString()}</td>
                      <td className="p-3.5 text-right pr-6 font-black text-purple-400">฿{d.totalProfit.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PremiumCard>
      )}

      {/* View 3: Weekly Aggregation Table */}
      {viewMode === 'weekly' && (
        <PremiumCard className="p-0 overflow-hidden border border-border rounded-2xl bg-background shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b border-border text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  <th className="p-3.5 pl-6">สัปดาห์</th>
                  <th className="p-3.5 text-center">จำนวนงาน</th>
                  <th className="p-3.5 text-right">ระยะทางรวม (กม.)</th>
                  <th className="p-3.5 text-right">น้ำมันที่ใช้รวม (L)</th>
                  <th className="p-3.5 text-right">ค่าน้ำมันลงงานรวม (฿)</th>
                  <th className="p-3.5 text-right">อัตราเฉลี่ย (km/L)</th>
                  <th className="p-3.5 text-right">รายได้รวม (฿)</th>
                  <th className="p-3.5 text-right pr-6">กำไรหลังหักน้ำมัน (฿)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-bold">
                {filteredWeekly.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">ไม่พบข้อมูลรายสัปดาห์</td>
                  </tr>
                ) : (
                  filteredWeekly.map((w) => (
                    <tr key={w.week} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3.5 pl-6 font-black text-primary">{w.week}</td>
                      <td className="p-3.5 text-center font-bold">{w.totalJobs} งาน</td>
                      <td className="p-3.5 text-right font-black text-foreground">{w.totalDistanceKm.toLocaleString()}</td>
                      <td className="p-3.5 text-right text-cyan-400">{w.totalLiters.toLocaleString()} L</td>
                      <td className="p-3.5 text-right font-black text-emerald-500">฿{w.totalFuelCost.toLocaleString()}</td>
                      <td className="p-3.5 text-right font-black text-foreground">{w.avgKmPerLiter} km/L</td>
                      <td className="p-3.5 text-right font-bold text-foreground">฿{w.totalRevenue.toLocaleString()}</td>
                      <td className="p-3.5 text-right pr-6 font-black text-purple-400">฿{w.totalProfit.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PremiumCard>
      )}

      {/* View 4: Monthly Aggregation Table */}
      {viewMode === 'monthly' && (
        <PremiumCard className="p-0 overflow-hidden border border-border rounded-2xl bg-background shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b border-border text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                  <th className="p-3.5 pl-6">เดือน</th>
                  <th className="p-3.5 text-center">จำนวนงาน</th>
                  <th className="p-3.5 text-right">ระยะทางรวม (กม.)</th>
                  <th className="p-3.5 text-right">น้ำมันที่ใช้รวม (L)</th>
                  <th className="p-3.5 text-right">ค่าน้ำมันลงงานรวม (฿)</th>
                  <th className="p-3.5 text-right">อัตราเฉลี่ย (km/L)</th>
                  <th className="p-3.5 text-right">รายได้รวม (฿)</th>
                  <th className="p-3.5 text-right pr-6">กำไรหลังหักน้ำมัน (฿)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-bold">
                {filteredMonthly.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">ไม่พบข้อมูลรายเดือน</td>
                  </tr>
                ) : (
                  filteredMonthly.map((m) => (
                    <tr key={m.month} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3.5 pl-6 font-black text-primary">{m.month}</td>
                      <td className="p-3.5 text-center font-bold">{m.totalJobs} งาน</td>
                      <td className="p-3.5 text-right font-black text-foreground">{m.totalDistanceKm.toLocaleString()}</td>
                      <td className="p-3.5 text-right text-cyan-400">{m.totalLiters.toLocaleString()} L</td>
                      <td className="p-3.5 text-right font-black text-emerald-500">฿{m.totalFuelCost.toLocaleString()}</td>
                      <td className="p-3.5 text-right font-black text-foreground">{m.avgKmPerLiter} km/L</td>
                      <td className="p-3.5 text-right font-bold text-foreground">฿{m.totalRevenue.toLocaleString()}</td>
                      <td className="p-3.5 text-right pr-6 font-black text-purple-400">฿{m.totalProfit.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </PremiumCard>
      )}
    </div>
  )
}
