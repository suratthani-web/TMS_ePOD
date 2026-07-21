"use client"

import { useState } from "react"
import { Driver } from "@/lib/supabase/drivers"
import { 
    Search, Plus, Filter, Edit, Trash2, FileSpreadsheet,
    Users, Truck, Phone, Award
} from "lucide-react"
import { deleteDriver } from "@/app/drivers/actions"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { DriverDialog } from "./driver-dialog"
import { ImportDriversDialog } from "./import-drivers-dialog"
import { Pagination } from "@/components/ui/pagination"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useLanguage } from "@/components/providers/language-provider"

type DriversContentProps = {
  drivers: Driver[]
  count: number
  branches: { Branch_ID: string; Branch_Name: string }[]
  vehicles?: { Vehicle_Plate: string; Brand?: string | null }[]
  subcontractors?: { Sub_ID: string; Sub_Name: string }[]
  userId?: string
  branchId?: string
  createBulkDrivers?: (data: Partial<Driver>[]) => Promise<{ success: boolean; message: string }>
  isAdminUser?: boolean
}

export function DriversContent({ 
    drivers, 
    count, 
    branches, 
    vehicles = [], 
    subcontractors = [], 
    userId, 
    branchId, 
    createBulkDrivers,
    isAdminUser = false 
}: DriversContentProps) {
  const { t } = useLanguage()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredDrivers = (drivers || []).filter(driver => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    const name = (driver.Driver_Name || '').toLowerCase()
    const phone = (driver.Mobile_No || '').toLowerCase()
    const id = (driver.Driver_ID || '').toLowerCase()
    const plate = (driver.Vehicle_Plate || '').toLowerCase()
    return name.includes(q) || phone.includes(q) || id.includes(q) || plate.includes(q)
  })

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${t('common.delete') || 'ต้องการลบ'} ${name}?`)) return
    
    setDeletingId(id)
    try {
      const result = await deleteDriver(id)
      if (result.success) {
        toast.success(t('common.success') || 'ดำเนินการสำเร็จ')
      } else {
        toast.error(result.message)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : (t('common.error') || 'เกิดข้อผิดพลาด'))
    } finally {
      setDeletingId(null)
    }
  }
  
  return (
    <div className="space-y-6 pb-20">
      {/* Brand Header */}
      <div className="p-6 rounded-xl bg-card border border-border flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
              <Users size={18} />
            </div>
            <span className="text-[10px] font-bold tracking-wider text-primary uppercase">
              {isAdminUser ? "COMMAND CENTER" : "BASE OPERATIONS"}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {t('navigation.drivers') || "พนักงานขับรถ"}
          </h1>
          <p className="text-muted-foreground text-xs">
            {t('drivers.subtitle') || "จัดการข้อมูลพนักงานขับรถ การมอบหมายยานพาหนะ และข้อมูลเบอร์โทรศัพท์ติดต่อ"}
          </p>
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border p-5 rounded-xl shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Users size={16} />
            </div>
            <h4 className="text-muted-foreground font-medium text-xs uppercase tracking-wider">
              {t('drivers.total_drivers') || "พนักงานขับรถทั้งหมด"}
            </h4>
          </div>
          <p className="text-2xl font-bold text-foreground">{count || drivers?.length || 0}</p>
        </div>

        <div className="bg-card border border-border p-5 rounded-xl shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Truck size={16} />
            </div>
            <h4 className="text-muted-foreground font-medium text-xs uppercase tracking-wider">
              {t('drivers.assigned_drivers') || "มอบหมายรถแล้ว"}
            </h4>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {drivers?.filter(d => d.Vehicle_Plate).length || 0}
          </p>
        </div>

        <div className="bg-card border border-border p-5 rounded-xl shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Award size={16} />
            </div>
            <h4 className="text-muted-foreground font-medium text-xs uppercase tracking-wider">
              {t('drivers.subcontractors') || "ผู้รับเหมาช่วง (Subcontractor)"}
            </h4>
          </div>
          <p className="text-2xl font-bold text-foreground">{subcontractors?.length || 0}</p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('common.search') || "ค้นหาชื่อคนขับ, เบอร์โทร..."}
                    className="w-full h-10 pl-11 pr-4 rounded-lg bg-muted/30 border border-border text-foreground placeholder:text-muted-foreground focus:ring-primary focus:border-primary transition-all text-sm outline-none"
                />
            </div>
            <button className="p-2.5 rounded-lg bg-muted/30 border border-border text-muted-foreground hover:text-primary transition-colors">
                <Filter size={16} />
            </button>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            {isAdminUser && (
              <>
                <ImportDriversDialog 
                    createBulkDrivers={createBulkDrivers}
                    branches={branches}
                    subcontractors={subcontractors}
                    trigger={
                        <button className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-600/90 text-white font-medium gap-2 text-xs flex items-center justify-center transition-colors shadow-sm">
                            <FileSpreadsheet size={16} />
                            นำเข้า Excel
                        </button>
                    }
                />
                <DriverDialog 
                    mode="create"
                    vehicles={vehicles}
                    branches={branches}
                    subcontractors={subcontractors}
                    driver={{ Branch_ID: branchId }}
                    trigger={
                        <button className="h-10 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-2 text-xs flex items-center justify-center transition-colors shadow-sm">
                            <Plus size={16} />
                            {t('drivers.add_driver') || "เพิ่มพนักงานขับรถ"}
                        </button>
                    }
                />
              </>
            )}
        </div>
      </div>

      {/* Driver Grid */}
      {filteredDrivers.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-xl">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <h3 className="text-sm font-medium text-foreground">ไม่พบข้อมูลพนักงานขับรถ</h3>
          <p className="text-xs text-muted-foreground mt-1">ลองค้นหาด้วยคำอื่น หรือเพิ่มพนักงานขับรถใหม่</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDrivers.map((driver) => (
          <div key={driver.Driver_ID} className="group bg-card border border-border rounded-xl hover:shadow-md transition-all duration-200 overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10 border border-border shadow-sm">
                      <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${driver.Driver_Name}`} />
                      <AvatarFallback className="bg-muted text-foreground font-bold text-xs">{driver.Driver_Name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-card rounded-full" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">{driver.Driver_Name || t('common.loading')}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">ID: {driver.Driver_ID}</span>
                        <div className="w-1 h-1 rounded-full bg-border" />
                        <span className="text-[10px] text-primary font-medium">{driver.Sub_ID ? (subcontractors.find(s => s.Sub_ID === driver.Sub_ID)?.Sub_Name || "Subcontractor") : "Staff"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                    <DriverDialog 
                        mode="edit"
                        driver={driver}
                        vehicles={vehicles}
                        branches={branches}
                        subcontractors={subcontractors}
                        trigger={
                            <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                                <Edit size={14} />
                            </button>
                        }
                    />
                    <button 
                        onClick={() => handleDelete(driver.Driver_ID, driver.Driver_Name || '')}
                        disabled={deletingId === driver.Driver_ID}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-all disabled:opacity-50"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-muted/20 rounded-lg border border-border/5">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">{t('navigation.vehicles') || "ยานพาหนะ"}</p>
                      <div className="flex items-center gap-2">
                        <Truck size={12} className="text-primary" />
                        <span className="text-xs font-semibold text-foreground">{driver.Vehicle_Plate || t('common.pending') || "รอดำเนินการ"}</span>
                      </div>
                  </div>
                  <div className="p-3 bg-muted/20 rounded-lg border border-border/5">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1">{t('drivers.phone') || "เบอร์โทรศัพท์"}</p>
                      <div className="flex items-center gap-2">
                        <Phone size={12} className="text-primary" />
                        <span className="text-xs font-semibold text-foreground">{driver.Mobile_No || "-"}</span>
                      </div>
                  </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3.5">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{t('drivers.expiry') || "บัตรหมดอายุ"}:</span>
                    <span className="text-[10px] font-medium text-foreground">{driver.Expire_Date ? new Date(driver.Expire_Date).toLocaleDateString() : "-"}</span>
                </div>
                {driver.Branch_ID && (
                  <Badge variant="outline" className="text-[9px] font-medium px-2 py-0">
                    {branches.find(b => b.Branch_ID === driver.Branch_ID)?.Branch_Name || driver.Branch_ID}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          ))}
        </div>
      )}
      
      <div className="flex justify-center mt-8">
        <Pagination totalItems={count || 0} limit={12} />
      </div>
    </div>
  )
}
