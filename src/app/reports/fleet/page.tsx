import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { 
  Truck, 
  Users, 
  Settings,
  UserCheck,
  CheckCircle2,
  ArrowLeft
} from "lucide-react"
import Link from "next/link"
import { getVehicleStats, getAllVehiclesFromTable } from "@/lib/supabase/vehicles"
import { getDriverStats, getAllDriversFromTable } from "@/lib/supabase/drivers"
import { StatsGrid } from "@/components/ui/stats-grid"
import { PremiumCard } from "@/components/ui/premium-card"
import { cn } from "@/lib/utils"

export default async function FleetStatusPage() {
  const [vehicleStats, driverStats, vehicles, drivers] = await Promise.all([
    getVehicleStats(),
    getDriverStats(),
    getAllVehiclesFromTable(),
    getAllDriversFromTable()
  ])

  return (
    <DashboardLayout>
      <div className="space-y-8 pb-12">
        {/* Header Section */}
        {/* Strategic Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 bg-background p-10 rounded-br-[5rem] rounded-tl-[3rem] border border-slate-800 shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-400 opacity-0 group-hover:opacity-100 transition-all duration-700 blur-[0.5px]" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-3xl rounded-full -mr-20 -mt-20 pointer-events-none" />
          
          <div className="relative z-10">
            <Link href="/reports" className="flex items-center gap-2 text-blue-400 hover:text-foreground font-bold font-black uppercase tracking-[0.2em] mb-4 w-fit group/back">
              <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> Reports Hub
            </Link>
            <h1 className="text-5xl font-black text-foreground mb-2 tracking-tighter flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl shadow-2xl shadow-blue-500/20 text-white transform group-hover:scale-110 transition-transform duration-500">
                <Truck size={36} />
              </div>
              สถานะรถและคนขับ (Fleet Status)
            </h1>
            <p className="text-blue-400 font-black ml-[4.5rem] uppercase tracking-[0.3em] text-base font-bold">Strategic Asset Visibility • Operational Compliance COMMAND</p>
          </div>
        </div>

        {/* Stats Grid */}
        <StatsGrid stats={[
          { label: "รถทั้งหมด", value: vehicleStats.total, icon: <Truck size={20} />, color: "blue" },
          { label: "รถที่พร้อมใช้งาน", value: vehicleStats.active, icon: <CheckCircle2 size={20} />, color: "emerald" },
          { label: "ซ่อมบำรุง", value: vehicleStats.maintenance, icon: <Settings size={20} />, color: "amber" },
          { label: "คนขับทั้งหมด", value: driverStats.total, icon: <Users size={20} />, color: "indigo" },
          { label: "คนขับที่กำลังทำงาน", value: driverStats.onJob, icon: <UserCheck size={20} />, color: "emerald" },
        ]} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Vehicles List */}
          <PremiumCard className="overflow-hidden border-none shadow-2xl">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-lg text-white shadow-lg shadow-blue-500/10">
                  <Truck size={18} />
                </div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight">รายการรถ (Vehicles)</h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-left py-4 px-6 text-base font-bold font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Plate / Type</th>
                    <th className="text-left py-4 px-4 text-base font-bold font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Status</th>
                    <th className="text-right py-4 px-6 text-base font-bold font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Mileage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {vehicles.slice(0, 10).map((v) => (
                    <tr key={v.Vehicle_Plate} className="group hover:bg-blue-50/30 transition-colors">
                      <td className="py-4 px-6">
                        <p className="text-gray-900 font-black text-xl">{v.Vehicle_Plate}</p>
                        <p className="text-base font-bold font-bold text-gray-400 uppercase tracking-tighter">{v.Vehicle_Type || '-'}</p>
                      </td>
                      <td className="py-4 px-4">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-base font-bold font-black uppercase tracking-widest border",
                          v.Active_Status === 'Active' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                          v.Active_Status === 'Maintenance' ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                          "bg-gray-100 text-muted-foreground border-gray-200"
                        )}>
                          {v.Active_Status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right font-black text-lg font-bold text-gray-600">
                        {(v.Current_Mileage || 0).toLocaleString()} km
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PremiumCard>

          {/* Drivers List */}
          <PremiumCard className="overflow-hidden border-none shadow-2xl">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500 rounded-lg text-white shadow-lg shadow-indigo-500/10">
                  <Users size={18} />
                </div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight">รายการคนขับ (Drivers)</h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-left py-4 px-6 text-base font-bold font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Driver Info</th>
                    <th className="text-left py-4 px-4 text-base font-bold font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Status</th>
                    <th className="text-right py-4 px-6 text-base font-bold font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {drivers.slice(0, 10).map((d) => (
                    <tr key={d.Driver_ID} className="group hover:bg-indigo-50/30 transition-colors">
                      <td className="py-4 px-6">
                        <p className="text-gray-900 font-black text-xl">{d.Driver_Name}</p>
                        <p className="text-base font-bold font-bold text-gray-400 uppercase tracking-tighter">{d.Mobile_No || '-'}</p>
                      </td>
                      <td className="py-4 px-4">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-base font-bold font-black uppercase tracking-widest border",
                          d.Active_Status === 'Active' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                          "bg-gray-100 text-muted-foreground border-gray-200"
                        )}>
                          {d.Active_Status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex flex-col items-end">
                           <p className="text-base font-bold font-black text-gray-600">{d.Expire_Date || '-'}</p>
                           <p className="text-base font-bold font-bold text-gray-400 uppercase italic">License Exp</p>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PremiumCard>
        </div>
      </div>
    </DashboardLayout>
  )
}
