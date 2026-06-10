"use client"

import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { VehicleDialog } from "@/components/vehicles/vehicle-dialog"
import {
    Plus,
    Truck,
    Search,
    Filter,
    ShieldCheck,
    Wrench,
    AlertTriangle,
    FileSpreadsheet
} from "lucide-react"
import { getAllVehicles, createBulkVehicles } from "@/lib/supabase/vehicles"
import type { Vehicle } from "@/lib/supabase/vehicles"
import { Badge } from "@/components/ui/badge"
import { VehicleActions } from "@/components/vehicles/vehicle-actions"
import { useBranch } from "@/components/providers/branch-provider"
import { useLanguage } from "@/components/providers/language-provider"
import { ExcelImport } from "@/components/ui/excel-import"
import { PremiumButton } from "@/components/ui/premium-button"
import { isAdmin } from "@/lib/permissions"

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [isAdminUser, setIsAdminUser] = useState(false)
  const { selectedBranch } = useBranch()
  const { t } = useLanguage()
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    async function loadVehicles() {
      setLoading(true)
      const [data, adminStatus] = await Promise.all([
        getAllVehicles(1, 100, "", selectedBranch),
        isAdmin()
      ])
      setVehicles((data.data || [])
        .filter((v) => Boolean(v.Vehicle_Plate))
        .map((v) => ({
          Vehicle_Plate: v.Vehicle_Plate || "",
          Vehicle_Type: v.Vehicle_Type ?? null,
          Brand: v.Brand ?? null,
          Model: v.Model ?? null,
          Year: v.Year ?? null,
          Color: v.Color ?? null,
          Engine_No: v.Engine_No ?? null,
          Chassis_No: v.Chassis_No ?? null,
          Max_Weight_kg: v.Max_Weight_kg ?? null,
          Max_Volume_cbm: v.Max_Volume_cbm ?? null,
          Tank_Capacity: v.Tank_Capacity ?? null,
          Insurance_Company: v.Insurance_Company ?? null,
          Insurance_Expiry: v.Insurance_Expiry ?? null,
          Tax_Expiry: v.Tax_Expiry ?? null,
          Act_Expiry: v.Act_Expiry ?? null,
          Current_Mileage: v.Current_Mileage ?? null,
          Last_Service_Date: v.Last_Service_Date ?? null,
          Next_Service_Mileage: v.Next_Service_Mileage ?? null,
          Driver_ID: v.Driver_ID ?? null,
          Branch_ID: v.Branch_ID ?? null,
          Active_Status: v.Active_Status ?? null,
          Notes: v.Notes ?? null,
          Sub_ID: v.Sub_ID ?? null,
          Preferred_Zone: v.Preferred_Zone ?? null,
          Primary_Driver_Name: v.Primary_Driver_Name ?? null,
          is_chassis: v.is_chassis ?? null,
          Customer_ID: v.Customer_ID ?? null,
        } satisfies Vehicle)))
      setIsAdminUser(adminStatus)
      setLoading(false)
    }
    loadVehicles()
  }, [selectedBranch, refreshTrigger])

  const filteredVehicles = vehicles.filter(v => 
    (v.Vehicle_Plate || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (v.Vehicle_Type || "").toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-20">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-card p-6 rounded-2xl border border-border shadow-sm">
            <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 bg-primary/10 rounded-lg border border-primary/20">
                        <Truck className="text-primary" size={16} />
                    </div>
                    <span className="text-primary font-semibold text-xs">{t('navigation.fleet')}</span>
                </div>
                <h1 className="text-3xl font-semibold text-foreground tracking-tight flex items-center gap-3 leading-tight">
                    {t('vehicles.title')}
                </h1>
            </div>

            <div className="relative z-10 flex items-center gap-3">
                {isAdminUser && (
                  <>
                    <ExcelImport 
                        trigger={
                            <PremiumButton variant="outline" className="h-11 px-5 rounded-xl border-border hover:bg-muted/50 text-muted-foreground text-sm font-semibold gap-2">
                                <FileSpreadsheet size={16} />
                                {t('common.tactical.bulk_import') || 'Import'}
                            </PremiumButton>
                        }
                        title={t('vehicles.import_title') || 'Import Vehicles'}
                        onImport={createBulkVehicles}
                        templateData={[{
                            Vehicle_Plate: "80-1234 กทม.",
                            Vehicle_Type: "4-Wheel",
                            Brand: "Toyota",
                            Model: "Hilux Revo",
                            Max_Weight_kg: 1500,
                            Max_Volume_cbm: 10,
                            Driver_ID: "DRV-001",
                            Sub_ID: "SUB-001",
                            Branch_ID: "HQ"
                        }]}
                        templateFilename="logispro_vehicles_template.xlsx"
                    />
                    <VehicleDialog 
                        onSuccess={() => setRefreshTrigger(prev => prev + 1)}
                        trigger={
                        <button className="flex items-center h-11 gap-2 bg-primary text-primary-foreground px-5 rounded-xl font-semibold text-sm hover:brightness-110 transition-all shadow-sm active:scale-95 group/btn">
                            <Plus size={16} strokeWidth={2.5} />
                            {t('vehicles.add_vehicle')}
                        </button>
                    } />
                  </>
                )}
            </div>
        </div>

        {/* Search and filters */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-muted/30 p-3 rounded-2xl border border-border">
            <div className="relative w-full md:w-80 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={16} />
                <input 
                    type="text" 
                    placeholder={t('common.search')}
                    className="w-full h-11 bg-background border border-border rounded-xl pl-11 pr-4 text-sm font-medium focus:outline-none focus:border-primary/50 focus:bg-muted/30 transition-all placeholder:text-muted-foreground outline-none"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            <div className="flex gap-2">
                <button className="flex items-center h-11 gap-2 px-5 bg-background border border-border rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all font-semibold text-sm">
                    <Filter size={14} />
                    {t('common.filter')}
                </button>
            </div>
        </div>

        {/* Vehicle list */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {loading ? (
                Array(6).fill(0).map((_, i) => (
                    <div key={i} className="h-48 bg-muted/50 rounded-2xl animate-pulse border border-border/5" />
                ))
            ) : filteredVehicles.length === 0 ? (
                <div className="col-span-full py-16 text-center">
                    <AlertTriangle className="mx-auto text-muted-foreground mb-4 opacity-20" size={40} />
                    <p className="text-muted-foreground font-medium text-sm">{t('common.no_data')}</p>
                </div>
            ) : (
                filteredVehicles.map((vehicle) => (
                    <div key={vehicle.Vehicle_Plate} className="group relative bg-card border border-border rounded-2xl p-6 hover:border-primary/30 transition-colors shadow-sm overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-[0.04] pointer-events-none">
                            <Truck size={60} className="text-primary" />
                        </div>
                        
                        <div className="flex justify-between items-start relative z-10 mb-4">
                            <div>
                                <Badge className="bg-primary/10 text-primary border-primary/20 mb-2 px-2 py-0.5 rounded-md font-medium text-xs">
                                    {vehicle.Vehicle_Type || "-"}
                                </Badge>
                                <h3 className="text-xl font-semibold text-foreground tracking-tight">{vehicle.Vehicle_Plate}</h3>
                            </div>
                            <VehicleActions vehicle={vehicle} />
                        </div>

                        <div className="space-y-3 relative z-10">
                            <div className="flex items-center justify-between border-b border-border pb-2">
                                <span className="text-muted-foreground font-medium text-xs">{t('vehicles.driver')}</span>
                                <span className="text-foreground font-semibold text-sm">{vehicle.Primary_Driver_Name || "-"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground font-medium text-xs">{t('vehicles.mileage')}</span>
                                <span className="text-primary font-semibold text-base">
                                    {vehicle.Current_Mileage?.toLocaleString() || "0"} KM
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-border flex gap-2">
                            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-muted/50 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all">
                                <Wrench size={12} />
                                {t('navigation.maintenance')}
                            </button>
                            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-muted/50 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600 transition-all">
                                <ShieldCheck size={12} />
                                {t('navigation.checks')}
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>
    </DashboardLayout>
  )
}

