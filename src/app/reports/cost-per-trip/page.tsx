export const dynamic = 'force-dynamic'

import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { getCostPerTrip } from "./actions"
import { DollarSign, TrendingUp, TrendingDown, Truck, MapPin, User, ArrowLeft, Calendar } from "lucide-react"
import Link from "next/link"
import React from "react"
import { getAllCustomers } from "@/lib/supabase/customers"
import { ProfitReportFilters } from "./profit-report-filters"
import { ExportCSVButton } from "./export-csv-button"
import { FuelMatchBadge, FuelFlagsPanel } from "@/components/fuel/fuel-match"
import { DEFAULT_WEAR_RATE_PER_KM, type WearRateSource } from "@/lib/supabase/wear-rate"

const WEAR_SOURCE_LABEL: Record<WearRateSource, string> = {
  vehicle: 'จากประวัติรถ',
  fleet: 'เฉลี่ยกองรถ',
  default: 'ค่าตั้งต้น',
  not_company: 'รถร่วม/อิสระ',
}

function formatMoney(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatKm(n: number) {
  return (n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

const FUEL_SOURCE_LABEL = {
  bill: 'บิลจริง',
  estimate: 'ประมาณ (ยังไม่มีบิลจบงาน)',
  subcontract: 'รถร่วม',
} as const

interface PageProps {
  searchParams: Promise<{ 
    start?: string; 
    end?: string;
    customers?: string;
  }>
}

export default async function CostPerTripPage(props: PageProps) {
  const params = await props.searchParams
  const start = params.start
  const end = params.end
  const customers = params.customers ? params.customers.split(',') : []

  const [{ trips, summary }, { data: allCustomers }] = await Promise.all([
    getCostPerTrip(start, end, customers),
    getAllCustomers(1, 1000)
  ])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Report header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 bg-card p-8 rounded-2xl border border-border shadow-sm relative overflow-hidden">
          <div className="relative z-10 space-y-4">
            <Link href="/reports" className="flex items-center gap-2 text-primary hover:text-foreground text-sm font-medium w-fit transition-colors">
              <ArrowLeft className="w-4 h-4" /> Reports
            </Link>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="p-3 bg-primary/10 text-primary rounded-2xl shadow-sm w-fit">
                <DollarSign size={28} />
              </div>
              <div>
                <h1 className="text-3xl lg:text-4xl font-semibold text-foreground tracking-tight leading-none">
                  Trip Performance
                </h1>
                <p className="text-muted-foreground text-sm font-medium mt-2 tracking-normal">
                  Cost Efficiency & Profitability Analysis {start || end ? `(${start} to ${end})` : '(Last 30 Days)'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 relative z-10">
            <ExportCSVButton data={trips} />
            <div className="flex items-center gap-2.5 px-4 py-2 bg-primary/10 rounded-xl border border-primary/20">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-xs font-semibold text-primary">Financial audit</span>
            </div>
          </div>
        </div>

        <ProfitReportFilters 
            allCustomers={allCustomers} 
            initialCustomers={customers} 
            initialStart={start || ""} 
            initialEnd={end || ""} 
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-1">จำนวนเที่ยว</p>
            <p className="text-3xl font-semibold text-foreground">{summary.totalTrips}</p>
            <p className="text-sm font-medium text-muted-foreground mt-1">{summary.totalDrops.toLocaleString()} ดรอป</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-1">ระยะทางรวม (ไมล์จริง)</p>
            <p className="text-2xl font-semibold text-foreground">{formatKm(summary.totalDistance)} KM</p>
            <p className="text-sm font-medium text-muted-foreground mt-1">ตามงาน {formatKm(summary.totalEstKm)} KM · ฿{summary.avgCostPerKm.toFixed(2)}/KM</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-1">รายได้รวม</p>
            <p className="text-2xl font-semibold text-primary">฿{formatMoney(summary.totalRevenue)}</p>
            <p className="text-sm font-medium text-muted-foreground mt-1">฿{formatMoney(summary.totalTrips > 0 ? summary.totalRevenue / summary.totalTrips : 0)} / เที่ยว</p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground mb-1">ต้นทุนรวม</p>
            <p className="text-2xl font-semibold text-red-500">฿{formatMoney(summary.totalCost)}</p>
            <p className="text-xs font-medium text-muted-foreground mt-1 leading-relaxed">
              คนขับ ฿{formatMoney(summary.totalDriverCost)} · น้ำมัน ฿{formatMoney(summary.totalFuelCost)} · สึกหรอ ฿{formatMoney(summary.totalWearCost)}
            </p>
          </div>
          <div className={`rounded-2xl border p-5 shadow-sm ${summary.totalProfit >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <p className="text-sm font-medium text-muted-foreground mb-1">กำไรรวม</p>
            <p className={`text-2xl font-semibold ${summary.totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              ฿{formatMoney(summary.totalProfit)}
            </p>
            <p className="text-sm font-medium text-muted-foreground mt-1">
              {Math.round(summary.avgProfitPct)}% Margin
            </p>
          </div>
        </div>

        <FuelFlagsPanel flags={summary.fuelFlags} />

        {/* Cost Breakdown Table */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/30 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3">
            <h2 className="font-semibold text-foreground">รายละเอียดกำไร-ขาดทุนรายเที่ยว</h2>
            <div className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-xl leading-relaxed">
              * ค่าคนขับ = ค่าเที่ยว + ค่าใช้จ่ายอื่นฝั่งคนขับ (เด็กรถ/ขึ้นชั้น/ทางด่วน ฯลฯ) — ยอดเดียวกับใบทำจ่ายคนขับ (ก่อนหัก ณ ที่จ่าย)<br />
              * น้ำมัน = บิลเติมจริง จับคู่ด้วยกติกา &quot;เติมจบงาน = ตัดน้ำมันงานล่าสุด&quot; (เติมระหว่างทางรวมกับงานที่กำลังวิ่ง) ตรวจกับเลขไมล์ — รอบที่ไมล์เกิน/ขาดสลับกันระบบรวมเป็นกลุ่มเดียว แล้วแบ่งตามระยะงาน; ป้าย = ความมั่นใจ (ชี้ดูบิลที่จับคู่); รถร่วม = 0<br />
              * ระยะทาง = ไมล์จริงจากบิลชนบิลของบิลที่จับคู่กับงาน (รวมขากลับวิ่งเปล่า); งานที่ยังไม่มีบิลจบงานใช้ระยะตามงาน<br />
              * ค่าสึกหรอ = ระยะตามงาน × อัตรา ฿/กม. ของรถคันนั้น (ค่าซ่อมที่ปิดงาน + ค่ายาง ย้อนหลัง 12 เดือน); ข้อมูลไม่พอใช้ค่าเฉลี่ยกองรถ หรือค่าตั้งต้น {DEFAULT_WEAR_RATE_PER_KM} ฿/กม.
              {summary.fuelBills.count > 0 && (
                <>
                  <br />* บิลน้ำมันของรถในรายงาน ฿{formatMoney(summary.fuelBills.cost)} ({summary.fuelBills.count} บิล, {summary.fuelBills.liters.toLocaleString()} ลิตร) · ลงเที่ยวในตารางนี้ ฿{formatMoney(summary.fuelBills.allocatedToTrips)}
                  {summary.fuelBills.noJobCost > 0 && (
                    <> · <span className="font-semibold text-red-600 dark:text-red-400">ไม่มีงานในระบบ ฿{formatMoney(summary.fuelBills.noJobCost)} ({summary.fuelBills.noJobCount} บิล, {formatKm(summary.fuelBills.noJobKm)} กม.; {summary.fuelBills.noJobDates.map(d => d.slice(8, 10) + '/' + d.slice(5, 7)).join(', ')})</span> — รถวิ่งแต่ไม่มีงาน ควรตรวจว่าลืมเปิดงาน (รายได้หาย) หรือใช้นอกงาน</>
                  )}
                  {Math.abs(summary.fuelBills.cost - summary.fuelBills.allocatedToTrips - summary.fuelBills.noJobCost) >= 1 && (
                    <> · ส่วนที่เหลือ ฿{formatMoney(summary.fuelBills.cost - summary.fuelBills.allocatedToTrips - summary.fuelBills.noJobCost)} เป็นของงานที่ยังไม่ปิด / ลูกค้าอื่นบนรถคันเดียวกัน</>
                  )}
                </>
              )}
            </div>
          </div>

          {trips.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <DollarSign size={48} strokeWidth={1.5} className="mx-auto mb-4" />
              <p className="font-medium">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
            </div>
          ) : (
            <div className="max-h-[700px] overflow-auto relative">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-30">
                  <tr className="bg-muted/95 backdrop-blur-md text-xs font-medium text-muted-foreground border-b border-border">
                    <th className="text-left px-4 py-4 font-medium">วันที่ / งาน</th>
                    <th className="text-left px-4 py-4 font-medium">ลูกค้า / เส้นทาง</th>
                    <th className="text-center px-4 py-4 font-medium">ดรอป</th>
                    <th className="text-right px-4 py-4 font-medium">ระยะทาง (ไมล์จริง)</th>
                    <th className="text-right px-4 py-4 font-medium text-primary">รายได้</th>
                    <th className="text-right px-4 py-4 font-medium">ค่าคนขับ</th>
                    <th className="text-right px-4 py-4 font-medium">น้ำมัน (บิลจริง)</th>
                    <th className="text-right px-4 py-4 font-medium">ค่าสึกหรอ</th>
                    <th className="text-right px-4 py-4 font-medium text-red-500">ต้นทุนรวม</th>
                    <th className="text-right px-4 py-4 font-medium">กำไร</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {trips.map((trip, idx) => {
                    const prevTrip = trips[idx - 1]
                    const showDateHeader = !prevTrip || prevTrip.Plan_Date !== trip.Plan_Date

                    return (
                      <React.Fragment key={trip.Job_ID}>
                        {showDateHeader && (
                          <tr className="bg-muted/80 sticky top-[52px] z-20 backdrop-blur-sm">
                            <td colSpan={10} className="px-6 py-2.5">
                              <div className="flex items-center gap-2 text-muted-foreground font-medium text-xs">
                                <Calendar size={14} className="text-muted-foreground" />
                                {trip.Plan_Date ? new Date(trip.Plan_Date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : 'ไม่ระบุวันที่'}
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr className={`hover:bg-muted/40 transition-colors group ${trip.profit < 0 ? 'bg-rose-500/5' : ''}`}>
                          <td className="px-4 py-4">
                            <div className="flex flex-col">
                              <p className="text-xs font-medium text-muted-foreground leading-none mb-2">
                                {trip.Plan_Date ? new Date(trip.Plan_Date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-'}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/20 shadow-sm transition-colors">
                                  #{trip.Job_ID.toUpperCase()}
                                </span>
                                {trip.Vehicle_Plate && (
                                  <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-lg border border-border">
                                    {trip.Vehicle_Plate}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-semibold text-foreground max-w-[260px] truncate">{trip.Customer_Name || '-'}</p>
                            <span
                              className="flex items-start gap-1 text-xs font-medium text-muted-foreground opacity-80 max-w-[260px] line-clamp-2"
                              title={[trip.Origin_Location, ...trip.drops].filter(Boolean).join(' → ')}
                            >
                              <MapPin size={10} className="mt-0.5 shrink-0" />
                              {trip.drops.length > 0
                                ? [trip.Origin_Location, ...trip.drops].filter(Boolean).join(' → ')
                                : (trip.Route_Name || '-')}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="inline-flex min-w-7 justify-center rounded-lg bg-muted px-2 py-0.5 text-xs font-semibold text-foreground border border-border">
                              {trip.drop_count}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right font-medium text-foreground whitespace-nowrap">
                            {formatKm(trip.distance_km)} KM
                            <div className="text-[10px] text-muted-foreground">
                              {trip.real_km_source === 'odometer' ? `ตามงาน ${formatKm(trip.est_km)} กม.` : 'ตามงาน (ไม่มีบิล)'}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-semibold text-primary whitespace-nowrap">
                            ฿{formatMoney(trip.Cost_Customer_Total)}
                          </td>
                          <td
                            className="px-4 py-4 text-right text-foreground whitespace-nowrap font-medium"
                            title={[`ค่าเที่ยว ฿${formatMoney(trip.Cost_Driver_Total)}`, ...trip.extra_items.map(e => `${e.type} ฿${formatMoney(e.amount)}`)].join('\n')}
                          >
                            ฿{formatMoney(trip.Cost_Driver_Total + trip.extra_cost)}
                            {trip.extra_cost !== 0 && (
                              <div className="text-[10px] text-muted-foreground font-normal">
                                เที่ยว ฿{formatMoney(trip.Cost_Driver_Total)} + {trip.extra_items.map(e => `${e.type.replace(/^ค่า/, '')} ฿${formatMoney(e.amount)}`).join(' + ')}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right text-foreground whitespace-nowrap">
                            ฿{formatMoney(trip.fuel_real)}
                            <div className={`text-[10px] ${trip.fuel_source === 'estimate' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                              {trip.fuel_source === 'subcontract'
                                ? FUEL_SOURCE_LABEL.subcontract
                                : `${trip.fuel_liters.toLocaleString('th-TH', { maximumFractionDigits: 1 })} ลิตร · ${FUEL_SOURCE_LABEL[trip.fuel_source]}`}
                            </div>
                            {trip.fuel_source !== 'subcontract' && <FuelMatchBadge match={trip.fuel_match} className="mt-0.5" />}
                          </td>
                          <td className="px-4 py-4 text-right text-foreground whitespace-nowrap">
                            ฿{formatMoney(trip.maint_real)}
                            <div className="text-[10px] text-muted-foreground">
                              {trip.maint_rate_source === 'not_company'
                                ? 'รถร่วม/อิสระ'
                                : `${trip.maint_rate.toFixed(2)} ฿/กม. · ${WEAR_SOURCE_LABEL[trip.maint_rate_source]}`}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-right font-semibold text-red-500 whitespace-nowrap bg-red-500/5">
                            ฿{formatMoney(trip.total_cost)}
                          </td>
                          <td className="px-4 py-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              {trip.profit >= 0 ? (
                                <TrendingUp size={14} className="text-emerald-500" />
                              ) : (
                                <TrendingDown size={14} className="text-red-500" />
                              )}
                              <span className={`font-semibold text-xl ${trip.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                ฿{formatMoney(trip.profit)}
                              </span>
                            </div>
                            <p className={`text-xs font-medium ${trip.profit >= 0 ? 'text-emerald-600/80 dark:text-emerald-400/80' : 'text-red-400'}`}>{trip.profit_pct}% Margin</p>
                          </td>
                        </tr>
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {/* Actionable Insights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Loss Makers */}
          <div className="bg-card rounded-2xl border border-red-500/20 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-red-500/10 border-b border-red-500/20">
              <h3 className="font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                <TrendingDown size={18} /> เที่ยวรถที่ขาดทุนหรือกำไรต่ำ
              </h3>
            </div>
            <div className="p-4 space-y-3">
              {trips.filter(t => t.profit_pct < 10).sort((a, b) => a.profit_pct - b.profit_pct).slice(0, 5).map(trip => (
                <div key={trip.Job_ID} className="flex items-center justify-between p-3 bg-muted/40 rounded-2xl border border-border">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{trip.Job_ID} · {trip.drop_count} ดรอป</p>
                    <p className="text-xs font-medium text-muted-foreground">{trip.Plan_Date} · {trip.Customer_Name}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${trip.profit < 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {trip.profit_pct}% Margin
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">{trip.profit < 0 ? 'ขาดทุน' : 'กำไร'} ฿{formatMoney(Math.abs(trip.profit))}</p>
                  </div>
                </div>
              ))}
              {trips.filter(t => t.profit_pct < 10).length === 0 && (
                <p className="text-center py-6 text-muted-foreground font-medium text-sm">ไม่พบเที่ยวรถที่ขาดทุนในช่วงนี้</p>
              )}
            </div>
          </div>

          {/* Most Profitable Customers */}
          <div className="bg-card rounded-2xl border border-emerald-500/20 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-emerald-500/10 border-b border-emerald-500/20">
              <h3 className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <TrendingUp size={18} /> ลูกค้าที่ทำกำไรสูงสุด
              </h3>
            </div>
            <div className="p-4 space-y-3">
              {(() => {
                const customerStats: Record<string, any> = {}
                trips.forEach(trip => {
                  const name = trip.Customer_Name || 'Unknown'
                  if (!customerStats[name]) customerStats[name] = { name, profit: 0, revenue: 0 }
                  customerStats[name].profit += trip.profit
                  customerStats[name].revenue += trip.Cost_Customer_Total
                })
                return Object.values(customerStats)
                  .sort((a: any, b: any) => b.profit - a.profit)
                  .slice(0, 5)
                  .map((cust: any) => (
                    <div key={cust.name} className="flex items-center justify-between p-3 bg-muted/40 rounded-2xl border border-border">
                      <p className="font-semibold text-foreground text-sm">{cust.name}</p>
                      <div className="text-right">
                        <p className="font-semibold text-emerald-600 dark:text-emerald-400">฿{formatMoney(cust.profit)}</p>
                        <p className="text-xs font-medium text-muted-foreground">{cust.revenue > 0 ? Math.round((cust.profit / cust.revenue) * 100) : 0}% Average Margin</p>
                      </div>
                    </div>
                  ))
              })()}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

