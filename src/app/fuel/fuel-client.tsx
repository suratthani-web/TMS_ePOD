"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { 
  Fuel, 
  Plus, 
  TrendingUp, 
  Droplets, 
  DollarSign, 
  Hash, 
  Activity, 
  Zap, 
  Target, 
  ArrowRight,
  Radio,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Layers,
  Sparkles,
  Download,
  Building2
} from "lucide-react"
import { FuelDialog } from "@/components/fuel/fuel-dialog"
import { FuelActions } from "@/components/fuel/fuel-actions"
import { ExcelExport } from "@/components/ui/excel-export"
import { FuelAnalyticsDashboard } from "@/components/fuel/fuel-analytics-dashboard"
import { FuelJobAnalyticsTable } from "@/components/fuel/fuel-job-analytics-table"
import { DtcGpsImportTab } from "@/components/fuel/dtc-gps-import-tab"
import { SearchInput } from "@/components/ui/search-input"
import { Pagination } from "@/components/ui/pagination"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"
import type { FuelLog, EnrichedFuelLog } from "@/lib/supabase/fuel"
import type { FuelAnalytics } from "@/lib/supabase/fuel-analytics"
import type { Driver } from "@/lib/supabase/drivers"
import type { Branch } from "@/lib/supabase/branches"
import type { FuelIntelligenceSummary } from "@/lib/fuel/fuel-allocation-engine"

type FuelClientProps = {
  logs: EnrichedFuelLog[]
  count: number
  drivers: Driver[]
  vehicles: { Vehicle_Plate?: string | null; Vehicle_Type?: string | null }[]
  analytics: FuelAnalytics
  intelligence?: FuelIntelligenceSummary
  branches?: Branch[]
  activeBranch?: string
  isSuperAdmin?: boolean
  limit: number
  startDate?: string
  endDate?: string
  selectedVehicles?: string[]
}

type MainTab = 'tms_core' | 'dtc_import'

export function FuelClient({ 
  logs, 
  count, 
  drivers, 
  vehicles, 
  analytics, 
  intelligence,
  branches = [],
  activeBranch = 'All',
  isSuperAdmin = false,
  limit,
  startDate,
  endDate,
  selectedVehicles = []
}: FuelClientProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [activeMainTab, setActiveMainTab] = useState<MainTab>('tms_core')
  const [coreSection, setCoreSection] = useState<'analytics' | 'logs'>('analytics')
  const [vehicleFilterOpen, setVehicleFilterOpen] = useState(false)
  const [tempSelectedPlates, setTempSelectedPlates] = useState<string[]>(selectedVehicles)

  const vehicleOptions = vehicles
    .filter((vehicle): vehicle is { Vehicle_Plate: string; Vehicle_Type?: string | null } => Boolean(vehicle.Vehicle_Plate))
    .map((vehicle) => ({
      Vehicle_Plate: vehicle.Vehicle_Plate,
      Vehicle_Type: vehicle.Vehicle_Type ?? null,
    }))

  const allPlates = vehicleOptions.map(v => v.Vehicle_Plate)

  // Apply Branch Filter
  const handleBranchFilter = (branchId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (!branchId || branchId === 'All') {
      params.delete('branch')
    } else {
      params.set('branch', branchId)
    }
    params.delete('page')
    router.push(`/fuel?${params.toString()}`)
  }

  // Apply Vehicle Filter
  const applyVehicleFilter = (plates: string[]) => {
    const params = new URLSearchParams(searchParams.toString())
    if (plates.length === 0 || plates.length === allPlates.length) {
      params.delete('vehicles')
    } else {
      params.set('vehicles', plates.join(','))
    }
    params.delete('page')
    router.push(`/fuel?${params.toString()}`)
  }

  const isAllVehiclesSelected = selectedVehicles.length === 0 || selectedVehicles.length === allPlates.length

  return (
    <div className="space-y-8 pb-20">
      {/* Tactical Energy Header */}
      <div className="bg-background p-8 rounded-3xl border border-border shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          <div>
            <div className="flex items-center gap-4 mb-2">
               <div className="p-3 bg-primary/20 rounded-2xl border-2 border-primary/30 shadow-[0_0_20px_rgba(255,30,133,0.2)] text-primary group-hover:scale-110 transition-all duration-500">
                  <Fuel size={26} strokeWidth={2.5} />
               </div>
               <div>
                  <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-widest uppercase leading-none mb-1 italic premium-text-gradient">
                    ระบบบันทึกและวิเคราะห์น้ำมัน
                  </h1>
                  <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] opacity-80 italic">
                    Fuel & Energy Intelligence Platform
                  </p>
               </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <FuelDialog 
                drivers={drivers}
                vehicles={vehicleOptions}
                trigger={
                    <PremiumButton className="h-11 px-8 rounded-xl shadow-lg gap-2 bg-primary hover:bg-primary/90 text-foreground font-black text-xs uppercase tracking-widest italic">
                        <Plus size={18} strokeWidth={3} />
                        บันทึกเติมน้ำมัน
                    </PremiumButton>
                }
            />
          </div>
        </div>
      </div>

      {/* 2 Main Navigation Tabs */}
      <div className="flex items-center p-1.5 bg-background rounded-2xl border border-border shadow-md max-w-2xl">
        <button
          onClick={() => setActiveMainTab('tms_core')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2.5 py-3 px-6 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
            activeMainTab === 'tms_core'
              ? "bg-primary text-foreground shadow-lg scale-[1.02]"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          )}
        >
          <Fuel size={16} />
          1. ประวัติและวิเคราะห์น้ำมัน (TMS Core)
        </button>
        <button
          onClick={() => setActiveMainTab('dtc_import')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2.5 py-3 px-6 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
            activeMainTab === 'dtc_import'
              ? "bg-primary text-foreground shadow-lg scale-[1.02]"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
          )}
        >
          <Radio size={16} className="text-cyan-400 animate-pulse" />
          2. นำเข้าข้อมูล GPS DTC
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: TMS CORE (Fuel History + Job Allocation Analytics)
      ────────────────────────────────────────────────────────────── */}
      {activeMainTab === 'tms_core' && (
        <div className="space-y-8">
          {/* Signal Filtering Matrix & Vehicle Multi-Selector */}
          <div className="space-y-6 bg-background p-6 rounded-3xl border border-border shadow-xl">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              {/* Left: Search & Branch & Vehicle Multi-select */}
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <SearchInput 
                    placeholder="ค้นหา ทะเบียนรถ, ปั๊มน้ำมัน..."
                    className="h-11 bg-muted/40 border border-border rounded-xl text-foreground placeholder:text-muted-foreground font-black text-xs"
                  />
                </div>

                {/* Branch Filter: Dropdown for SuperAdmin, Badge for Branch Admin */}
                {isSuperAdmin ? (
                  <div className="relative">
                    <select
                      value={activeBranch}
                      onChange={(e) => handleBranchFilter(e.target.value)}
                      className="h-11 px-3.5 bg-muted/60 hover:bg-muted border border-border rounded-xl text-foreground font-black text-xs uppercase tracking-wider transition-colors cursor-pointer outline-none focus:ring-1 focus:ring-primary/40"
                    >
                      <option value="All">📍 ทุกสาขา (All Branches)</option>
                      {branches.map(b => (
                        <option key={b.Branch_ID} value={b.Branch_ID}>
                          📍 {b.Branch_Name || b.Branch_ID} ({b.Branch_ID})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="h-11 px-3.5 bg-primary/10 border border-primary/20 rounded-xl text-primary font-black text-xs uppercase tracking-wider flex items-center gap-2">
                    <Building2 size={14} />
                    <span>สาขา: {branches.find(b => b.Branch_ID === activeBranch)?.Branch_Name || activeBranch}</span>
                  </div>
                )}

                {/* Vehicle Quick Filter Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setVehicleFilterOpen(!vehicleFilterOpen)}
                    className="h-11 px-4 bg-muted/60 hover:bg-muted border border-border rounded-xl text-foreground font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-colors"
                  >
                    <Layers size={14} className="text-primary" />
                    <span>
                      {isAllVehiclesSelected ? 'รถทั้งหมด (All)' : `เลือกรถ (${selectedVehicles.length} คัน)`}
                    </span>
                  </button>

                  {/* Multi-Select Modal Dropdown */}
                  {vehicleFilterOpen && (
                    <div className="absolute left-0 mt-2 w-72 bg-card border border-border rounded-2xl shadow-2xl p-4 z-50 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-border">
                        <span className="text-xs font-black uppercase tracking-wider text-foreground">เลือกทะเบียนรถ</span>
                        <div className="flex gap-2 text-[10px]">
                          <button
                            type="button"
                            onClick={() => setTempSelectedPlates(allPlates)}
                            className="text-primary font-bold hover:underline"
                          >
                            เลือกทั้งหมด
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => setTempSelectedPlates([])}
                            className="text-muted-foreground font-bold hover:underline"
                          >
                            ล้าง
                          </button>
                        </div>
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                        {allPlates.map((plate) => {
                          const isChecked = tempSelectedPlates.includes(plate)
                          return (
                            <button
                              key={plate}
                              type="button"
                              onClick={() => {
                                if (isChecked) {
                                  setTempSelectedPlates(tempSelectedPlates.filter(p => p !== plate))
                                } else {
                                  setTempSelectedPlates([...tempSelectedPlates, plate])
                                }
                              }}
                              className={cn(
                                "w-full flex items-center justify-between p-2 rounded-xl text-xs font-bold transition-all",
                                isChecked ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-muted/50 text-muted-foreground"
                              )}
                            >
                              <span>{plate}</span>
                              {isChecked ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} className="text-muted-foreground" />}
                            </button>
                          )
                        })}
                      </div>

                      <div className="pt-2 border-t border-border flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setVehicleFilterOpen(false)
                            setTempSelectedPlates(selectedVehicles)
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-muted-foreground hover:bg-muted"
                        >
                          ยกเลิก
                        </button>
                        <PremiumButton
                          type="button"
                          onClick={() => {
                            setVehicleFilterOpen(false)
                            applyVehicleFilter(tempSelectedPlates)
                          }}
                          className="px-4 py-1.5 rounded-lg text-xs font-black bg-primary text-foreground"
                        >
                          ยืนยัน
                        </PremiumButton>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Date Range Filter */}
              <form className="flex flex-wrap lg:flex-nowrap gap-2 items-center">
                <div className="flex items-center gap-2 bg-muted/40 border border-border p-1 rounded-xl">
                  <input 
                      type="date" 
                      name="startDate"
                      defaultValue={startDate}
                      className="h-9 bg-transparent border-none text-foreground text-xs font-black outline-none px-2"
                  />
                  <ArrowRight size={12} className="text-muted-foreground" />
                  <input 
                      type="date" 
                      name="endDate"
                      defaultValue={endDate}
                      className="h-9 bg-transparent border-none text-foreground text-xs font-black outline-none px-2"
                  />
                </div>
                {selectedVehicles && selectedVehicles.length > 0 && (
                  <input type="hidden" name="vehicles" value={selectedVehicles.join(',')} />
                )}
                {searchParams.get('q') && (
                  <input type="hidden" name="q" value={searchParams.get('q') || ''} />
                )}
                <PremiumButton type="submit" variant="secondary" className="h-11 px-5 rounded-xl border-border bg-muted/80 text-foreground font-black text-xs uppercase tracking-wider">
                    {t('common.filter')}
                </PremiumButton>
              </form>
            </div>

            {/* Selected Vehicles Pills */}
            {!isAllVehiclesSelected && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mr-1">กรองเฉพาะ:</span>
                {selectedVehicles.map(p => (
                  <Badge key={p} variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold py-0.5 px-2">
                    {p}
                  </Badge>
                ))}
                <button
                  type="button"
                  onClick={() => applyVehicleFilter([])}
                  className="text-[10px] text-muted-foreground hover:text-rose-400 underline font-bold ml-2"
                >
                  ล้างตัวกรองรถ
                </button>
              </div>
            )}
          </div>

          {/* Sub-Section Switcher: Analytics vs Logs */}
          <div className="flex items-center justify-between">
            <div className="flex items-center p-1 bg-background rounded-2xl border border-border shadow-sm">
              <button
                onClick={() => setCoreSection('analytics')}
                className={cn(
                  "flex items-center gap-2 py-2 px-5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                  coreSection === 'analytics'
                    ? "bg-primary text-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TrendingUp size={14} />
                📊 วิเคราะห์การใช้น้ำมัน (4 มุมมอง)
              </button>
              <button
                onClick={() => setCoreSection('logs')}
                className={cn(
                  "flex items-center gap-2 py-2 px-5 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                  coreSection === 'logs'
                    ? "bg-primary text-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Hash size={14} />
                📋 ประวัติการเติมน้ำมันละเอียด ({count})
              </button>
            </div>
          </div>

          {/* Sub-Section 1: 4-Level Job Allocation Analytics */}
          {coreSection === 'analytics' && intelligence && (
            <section className="space-y-6">
              <FuelJobAnalyticsTable data={intelligence} />
            </section>
          )}

          {/* Sub-Section 2: Detailed OCR Fuel Log Ledger */}
          {coreSection === 'logs' && (
            <PremiumCard className="bg-background border border-border p-0 overflow-hidden shadow-xl rounded-2xl">
              <div className="p-6 border-b border-border bg-muted/30 flex items-center justify-between relative overflow-hidden">
                <div className="flex items-center gap-4 relative z-10">
                    <div className="p-3 bg-primary/20 rounded-xl text-primary border border-primary/30">
                        <Hash size={18} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-foreground tracking-widest uppercase italic leading-none mb-1">
                          ประวัติการเติมน้ำมันละเอียด
                        </h2>
                        <p className="text-primary text-[10px] font-black uppercase tracking-[0.4em] opacity-60">
                          Verified OCR & Manual Fuel Entries
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <ExcelExport
                        filename={`Fuel_Logs_Detailed_${new Date().toISOString().slice(0, 10)}`}
                        data={logs.map((l) => ({
                            "วัน-เวลา": l.Date_Time || '',
                            "ทะเบียนรถ": l.Vehicle_Plate || '-',
                            "พนักงานขับรถ": l.Driver_Name || '-',
                            "สถานี/ปั๊มน้ำมัน": l.Station_Name || '-',
                            "ประเภท": l.Trip_Fill_Type === 'enroute' ? 'เติมระหว่างทาง' : 'เติมจบงาน',
                            "เลขไมล์ (กม.)": l.Odometer || '',
                            "ระยะทางช่วงนี้ (กม.)": l.Delta_Km || '',
                            "จำนวนลิตร": l.Liters || 0,
                            "ราคาต่อลิตร (บาท/ลิตร)": l.Price_Per_Liter || 0,
                            "ยอดรวมเงิน (บาท)": l.Price_Total || 0,
                            "อัตราสิ้นเปลือง (km/L)": l.Trip_Fill_Type === 'enroute' ? 'รอจบงาน' : (l.Km_Per_Liter || ''),
                            "สถานะ": l.Status || 'Pending',
                            "ลิงก์รูปภาพ": l.Photo_Url || ''
                        }))}
                    />
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                {logs.length === 0 ? (
                    <div className="p-24 text-center space-y-4">
                        <Droplets className="w-16 h-16 text-foreground/5 mx-auto animate-pulse" />
                        <p className="text-muted-foreground font-black uppercase tracking-[0.4em] text-sm font-bold">{t('common.no_data')}</p>
                    </div>
                ) : (
                    <table className="w-full border-collapse text-xs">
                      <thead className="text-[10px] font-black uppercase bg-muted/60 text-muted-foreground border-b border-border tracking-[0.2em] italic">
                        <tr>
                          <th className="text-left px-5 py-4">วัน-เวลาที่เติม</th>
                          <th className="text-left px-4 py-4">ทะเบียนรถ / คนขับ</th>
                          <th className="text-left px-4 py-4">สถานี/ปั๊มน้ำมัน</th>
                          <th className="text-center px-3 py-4">รูปบิล</th>
                          <th className="text-right px-4 py-4">เลขไมล์ (กม.)</th>
                          <th className="text-right px-4 py-4">จำนวนลิตร</th>
                          <th className="text-right px-4 py-4">ราคา/ลิตร</th>
                          <th className="text-right px-4 py-4">ยอดรวมเงิน (฿)</th>
                          <th className="text-right px-4 py-4">km/L</th>
                          <th className="px-5 py-4 w-12 text-center">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 font-bold">
                        {logs.map((log) => (
                          <tr key={log.Log_ID} className="hover:bg-muted/30 transition-all">
                            <td className="px-5 py-3.5">
                              <span className="text-foreground font-black text-xs uppercase">
                                {log.Date_Time ? new Date(log.Date_Time).toLocaleString('th-TH', { 
                                  timeZone: 'Asia/Bangkok',
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                }) : "-"}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <Badge variant="outline" className="font-black bg-primary/10 text-primary border-primary/20 mb-0.5">
                                {log.Vehicle_Plate || "-"}
                              </Badge>
                              <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{log.Driver_Name}</p>
                              {log.Trip_Fill_Type === 'enroute' && (
                                <span className="text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-wide bg-amber-500/20 text-amber-500 border border-amber-500/20 inline-block mt-0.5">
                                  🛣️ ระหว่างทาง
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 max-w-[180px]">
                              <p className="font-black text-foreground truncate">{log.Station_Name || "ปั๊มน้ำมัน"}</p>
                              <span className={cn(
                                 "text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest inline-block mt-0.5",
                                 log.Status === 'Approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' :
                                 log.Status === 'Rejected' ? 'bg-rose-500/20 text-rose-500 border border-rose-500/20' :
                                 'bg-muted/50 text-muted-foreground border border-border/10'
                              )}>
                                {log.Status || 'Pending'}
                              </span>
                            </td>
                            <td className="px-3 py-3.5 text-center">
                              {log.Photo_Url ? (
                                <a href={log.Photo_Url} target="_blank" rel="noreferrer" className="inline-block">
                                  <div className="w-8 h-8 rounded-lg overflow-hidden border border-border bg-card shadow-sm hover:scale-110 transition-transform">
                                    <img src={log.Photo_Url} alt="Receipt" className="w-full h-full object-cover" />
                                  </div>
                                </a>
                              ) : (
                                <span className="text-muted-foreground text-[10px]">ไม่มี</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-right font-black text-foreground">
                              {log.Odometer ? log.Odometer.toLocaleString() : '-'}
                              {log.Delta_Km && log.Delta_Km > 0 ? (
                                <div className="text-[9px] text-muted-foreground font-normal">
                                  +{log.Delta_Km.toLocaleString()} กม.
                                  {log.Trip_Fill_Type !== 'enroute' && (log.Enroute_Count || 0) > 0 && (
                                    <span className="block text-[8px] text-primary/80 font-medium leading-tight">
                                      (รวม {log.Enroute_Count} บิลระหว่างทาง)
                                    </span>
                                  )}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-cyan-400">
                              {log.Liters?.toFixed(2)} L
                            </td>
                            <td className="px-4 py-3.5 text-right font-black text-foreground">
                              ฿{log.Price_Per_Liter ? log.Price_Per_Liter.toFixed(2) : "0.00"}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <span className="text-xs font-black text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                                ฿{log.Price_Total?.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              {log.Trip_Fill_Type === 'enroute' ? (
                                <span 
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 inline-block"
                                  title="เติมระหว่างทาง ไม่คำนวณเดี่ยว ระบบจะนำระยะทางและลิตรมารวมคำนวณกับการเติมจบงาน"
                                >
                                  รอจบงาน
                                </span>
                              ) : log.Km_Per_Liter && log.Km_Per_Liter > 0 ? (
                                <span 
                                  className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-black inline-block",
                                    log.Km_Per_Liter >= 8 ? "bg-emerald-500/10 text-emerald-400" :
                                    log.Km_Per_Liter >= 5 ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400"
                                  )}
                                  title={(log.Enroute_Count || 0) > 0 ? `รอบนี้รวมระหว่างทาง ${log.Enroute_Count} รายการ (ใช้น้ำมันรวม ${log.Cycle_Liters?.toFixed(1)} L / ${log.Delta_Km} กม.)` : undefined}
                                >
                                  {log.Km_Per_Liter.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-[10px]">-</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <FuelActions 
                                  log={log} 
                                  drivers={drivers}
                                  vehicles={vehicleOptions}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                )}
              </div>

              <div className="p-6 border-t border-border bg-muted/30 flex justify-center">
                 <Pagination totalItems={count || 0} limit={limit} />
              </div>
            </PremiumCard>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: DTC GPS IMPORT (Excel Parser & Analytics)
      ────────────────────────────────────────────────────────────── */}
      {activeMainTab === 'dtc_import' && (
        <DtcGpsImportTab />
      )}
    </div>
  )
}
