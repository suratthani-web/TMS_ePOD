"use client"

import { useState, useEffect, forwardRef, useImperativeHandle } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
    Plus, 
    Trash2, 
    Fuel, 
    Navigation,
    Loader2,
    ChevronRight,
    AlertCircle,
    MapPin,
    ArrowRight
} from "lucide-react"
import { getCustomerMatrices, saveCustomerMatrix, deleteCustomerMatrix } from "@/lib/actions/fuel-actions"
import { getAllRoutes } from "@/lib/supabase/routes"
import { getCustomer } from "@/lib/supabase/customers"
import { getVehicleTypes } from "@/lib/actions/vehicle-type-actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface MatrixRow {
    min: number
    max: number
    price: number
}

interface FuelMatrix {
    ID?: string | number
    Route_Name: string
    Vehicle_Type: string
    Fuel_Rate_Matrix: MatrixRow[]
}

interface RouteOption {
    Route_Name?: string | null
    Origin?: string | null
    Destination?: string | null
}

interface VehicleTypeOption {
    type_name: string
    description?: string | null
}

interface CustomerFuelMatrixProps {
    customerId: string
    customerName: string
}

export const CustomerFuelMatrix = forwardRef(({ customerId, customerName }: CustomerFuelMatrixProps, ref) => {
    const [matrices, setMatrices] = useState<FuelMatrix[]>([])
    const [routes, setRoutes] = useState<RouteOption[]>([])
    const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeOption[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [activeRoute, setActiveRoute] = useState<string>("")
    const [activeVehicleType, setActiveVehicleType] = useState<string>("")
    const [currentMatrix, setCurrentMatrix] = useState<MatrixRow[]>([])
    const [customerBranch, setCustomerBranch] = useState<string | null>(null)
    
    useEffect(() => {
        const loadData = async () => {
            setLoading(true)
            try {
                const customer = await getCustomer(customerId)
                const branchId = customer?.Branch_ID || null
                setCustomerBranch(branchId)

                const [matrixData, routesData, vehicleTypesData] = await Promise.all([
                    getCustomerMatrices(customerId),
                    getAllRoutes(undefined, undefined, undefined, branchId || undefined),
                    getVehicleTypes()
                ])
                
                setMatrices(matrixData)
                setRoutes(routesData.data || [])
                setVehicleTypes(vehicleTypesData || [])
            } catch (error) {
                console.error("Failed to load fuel matrix data:", error)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [customerId])

    useImperativeHandle(ref, () => ({
        async handleSave() {
            if (!activeRoute || activeRoute === "none") return { success: true }; 
            if (!currentMatrix || currentMatrix.length === 0) return { success: true };

            setSaving(true)
            try {
                const result = await saveCustomerMatrix(customerId, activeRoute, activeVehicleType, currentMatrix)
                if (result.success) {
                    const updated = await getCustomerMatrices(customerId)
                    setMatrices(updated)
                    toast.success("บันทึกข้อมูลเรียบร้อยแล้ว")
                    setSaving(false)
                    return { success: true }
                } else {
                    setSaving(false)
                    toast.error("บันทึกล้มเหลว: " + result.error)
                    return { success: false, error: result.error }
                }
            } catch (err: unknown) {
                setSaving(false)
                toast.error("เกิดข้อผิดพลาดในการบันทึก")
                return { success: false, error: err instanceof Error ? err.message : String(err) }
            }
        }
    }));

    const handleSelectRoute = (routeName: string) => {
        if (routeName === "none") {
            setActiveRoute("")
            setActiveVehicleType("")
            setCurrentMatrix([])
            return
        }
        setActiveRoute(routeName)
        // Reset matrix if route changes
        setActiveVehicleType("")
        setCurrentMatrix([])
    }

    const handleSelectVehicleType = (vType: string) => {
        if (vType === "none") {
            setActiveVehicleType("")
            setCurrentMatrix([])
            return
        }
        setActiveVehicleType(vType)
        const existing = matrices.find(m => m.Route_Name === activeRoute && m.Vehicle_Type === vType)
        if (existing) {
            setCurrentMatrix(existing.Fuel_Rate_Matrix)
        } else {
            setCurrentMatrix([{ min: 0, max: 0, price: 0 }])
        }
    }

    const addRow = () => {
        const lastRow = currentMatrix[currentMatrix.length - 1]
        const nextMin = lastRow ? (isNaN(lastRow.max) ? 0 : Number((lastRow.max + 0.01).toFixed(2))) : 0
        setCurrentMatrix([...currentMatrix, { 
            min: nextMin, 
            max: Number((nextMin + 3).toFixed(2)), 
            price: lastRow ? lastRow.price : 0
        }])
    }

    const removeRow = (index: number) => {
        setCurrentMatrix(currentMatrix.filter((_, i) => i !== index))
    }

    const updateRow = (index: number, field: keyof MatrixRow, value: string) => {
        const next = [...currentMatrix]
        const numVal = parseFloat(value)
        const val = isNaN(numVal) ? 0 : numVal
        next[index] = { ...next[index], [field]: val }
        setCurrentMatrix(next)
    }

    const handleDeleteMatrix = async () => {
        const matrix = matrices.find(m => m.Route_Name === activeRoute && m.Vehicle_Type === activeVehicleType)
        if (!matrix) return
        if (!matrix.ID) return toast.error("Missing matrix ID")
        if (!confirm(`ยืนยันการลบเรทราคาทั้งหมดของเส้นทาง ${activeRoute} [${activeVehicleType}]?`)) return
        
        setSaving(true)
        const result = await deleteCustomerMatrix(String(matrix.ID))
        if (result.success) {
            toast.success("ลบข้อมูลเรียบร้อย")
            setMatrices(matrices.filter(m => m.ID !== matrix.ID))
            setCurrentMatrix([{ min: 0, max: 0, price: 0 }])
        } else {
            toast.error("ลบข้อมูลล้มเหลว")
        }
        setSaving(false)
    }

    const selectedRouteData = routes.find(r => r.Route_Name === activeRoute)

    // Main Render with Single Return Path to avoid React Hook mismatch
    return (
        <div className="flex flex-col gap-6 min-h-[650px] w-full p-2">
            {loading ? (
                <div className="p-20 flex-1 flex flex-col items-center justify-center gap-4 min-h-[500px]">
                    <div className="relative">
                        <Loader2 className="animate-spin text-primary" size={48} />
                        <Fuel className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary opacity-50" size={18} />
                    </div>
                    <div className="text-center">
                        <p className="text-foreground font-semibold text-lg">กำลังโหลดข้อมูลเรทราคา...</p>
                        <p className="text-muted-foreground text-xs mt-1">กรุณารอสักครู่ (กรองตามสาขาผู้ใช้)</p>
                    </div>
                </div>
            ) : (
                <>
                    {/* Header: Route Selection Dropdown */}
                    <div className="p-6 bg-card border border-border rounded-xl shadow-sm relative overflow-hidden group">
                        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                            <div className="flex-1 space-y-3">
                                <div className="flex items-center gap-2 ml-1">
                                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                                        <span className="text-[10px] font-bold text-primary">01</span>
                                    </div>
                                    <Label className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">เลือกเส้นทางขนส่งสำหรับลูกค้ารายนี้</Label>
                                </div>
                                
                                <Select value={activeRoute || "none"} onValueChange={handleSelectRoute}>
                                    <SelectTrigger className="w-full h-12 bg-muted/20 border border-border text-sm font-semibold rounded-lg px-4 hover:bg-card transition-colors shadow-sm group/trigger">
                                        <div className="flex items-center gap-3">
                                            <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary group-hover/trigger:scale-105 transition-transform">
                                                <Navigation size={14} />
                                            </div>
                                            <SelectValue placeholder="ค้นหาและเลือกเส้นทาง..." />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent className="bg-card border border-border max-h-[400px] rounded-lg shadow-lg p-1">
                                        <SelectItem value="none" className="text-muted-foreground font-medium py-2 rounded opacity-70">-- เลือกเส้นทาง (สาขา: {customerBranch || 'ทั้งหมด'}) --</SelectItem>
                                        
                                        <SelectItem value="SYSTEM_PER_PIECE" className="py-2 focus:bg-emerald-500/10 rounded mb-1 border border-emerald-500/10 bg-emerald-500/[0.02]">
                                            <div className="flex items-center justify-between w-full pr-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                                                        <span className="font-bold text-sm">ราคาต่อชิ้น (PER PIECE)</span>
                                                        {matrices.some(m => m.Route_Name === 'SYSTEM_PER_PIECE') && (
                                                            <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-[8px] font-bold uppercase rounded shadow-sm">Configured</span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] text-emerald-600/60 dark:text-emerald-400/60">
                                                        ตั้งค่าเรทราคาแปรผันตามน้ำมัน (สำหรับงานนับชิ้น)
                                                    </span>
                                                </div>
                                            </div>
                                        </SelectItem>

                                        <div className="h-px bg-border/10 my-1.5" />

                                        {routes.filter((r) => Boolean(r.Route_Name)).map(r => (
                                            <SelectItem key={r.Route_Name || ''} value={r.Route_Name || ''} className="py-2 focus:bg-primary/10 rounded mb-1">
                                                <div className="flex items-center justify-between w-full pr-4">
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-sm">{r.Route_Name}</span>
                                                            {matrices.some(m => m.Route_Name === r.Route_Name) && (
                                                                <span className="px-1.5 py-0.5 bg-green-500/10 text-green-500 text-[8px] font-bold uppercase rounded border border-green-500/20">Configured</span>
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            {r.Origin || '-'} <ChevronRight size={8} /> {r.Destination || '-'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {activeRoute && (
                                <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-2 ml-1">
                                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                                            <span className="text-[10px] font-bold text-primary">02</span>
                                        </div>
                                        <Label className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">เลือกประเภทรถสำหรับเรทราคานี้</Label>
                                    </div>
                                    
                                    <Select value={activeVehicleType || "none"} onValueChange={handleSelectVehicleType}>
                                        <SelectTrigger className="w-full h-12 bg-muted/20 border border-border text-sm font-semibold rounded-lg px-4 hover:bg-card transition-colors shadow-sm group/trigger">
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary group-hover/trigger:scale-105 transition-transform">
                                                    <Navigation size={14} className="rotate-45" />
                                                </div>
                                                <SelectValue placeholder="เลือกประเภทรถ..." />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border border-border max-h-[400px] rounded-lg shadow-lg p-1">
                                            <SelectItem value="none" className="text-muted-foreground font-medium py-2 rounded opacity-70">-- เลือกประเภทรถ --</SelectItem>
                                            {vehicleTypes.map(v => (
                                                <SelectItem key={v.type_name} value={v.type_name} className="py-2 focus:bg-primary/10 rounded mb-1">
                                                    <div className="flex items-center justify-between w-full pr-4">
                                                        <div className="flex flex-col gap-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-sm">{v.type_name}</span>
                                                                {matrices.some(m => m.Route_Name === activeRoute && m.Vehicle_Type === v.type_name) && (
                                                                    <span className="px-1.5 py-0.5 bg-green-500/10 text-green-500 text-[8px] font-bold uppercase rounded border border-green-500/20">Configured</span>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {v.description || 'ไม่มีคำอธิบาย'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {activeRoute && activeVehicleType && (
                                <button 
                                    type="button"
                                    onClick={handleDeleteMatrix}
                                    disabled={!matrices.some(m => m.Route_Name === activeRoute && m.Vehicle_Type === activeVehicleType) || saving}
                                    className="h-12 px-4 rounded-lg bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-600 hover:text-white transition-all disabled:opacity-30 flex items-center justify-center shadow-sm active:scale-95 self-end"
                                >
                                    <Trash2 size={18} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Matrix Editor Area */}
                    {activeRoute && activeVehicleType ? (
                        <div className="flex-1 p-6 bg-card border border-border rounded-xl shadow-sm relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="flex flex-col gap-6 relative z-10">
                                {/* Route Info Visualizer */}
                                <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-muted/30 p-5 rounded-lg border border-border shadow-inner">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20">
                                            <MapPin size={22} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5 opacity-80">ต้นทาง (ORIGIN)</span>
                                            <span className="text-lg font-bold text-foreground">{selectedRouteData?.Origin || 'N/A'}</span>
                                        </div>
                                    </div>
                                    
                                    <ChevronRight className="text-muted-foreground/30 hidden md:block" size={24} />

                                    <div className="flex items-center gap-4 md:text-right">
                                        <div className="flex flex-col md:items-end">
                                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5 opacity-80">ปลายทาง (DESTINATION)</span>
                                            <span className="text-lg font-bold text-foreground">{selectedRouteData?.Destination || 'N/A'}</span>
                                        </div>
                                        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20">
                                            <MapPin size={22} />
                                        </div>
                                    </div>
                                </div>

                                {/* Matrix Content */}
                                <div className="space-y-4">
                                    <div className="grid grid-cols-12 gap-4 px-4 mb-1">
                                        <div className="col-span-4 text-xs font-semibold text-muted-foreground">เริ่มช่วงราคาน้ำมัน (฿)</div>
                                        <div className="col-span-4 text-xs font-semibold text-muted-foreground">จบช่วงราคาน้ำมัน (฿)</div>
                                        <div className="col-span-4 text-xs font-semibold text-primary">ค่าขนส่งสุทธิ (฿)</div>
                                    </div>

                                    <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar p-1">
                                        {currentMatrix.map((row, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-3 items-center bg-muted/10 p-3 rounded-lg border border-border hover:bg-muted/20 transition-all group/row relative">
                                                <div className="col-span-4">
                                                    <div className="relative">
                                                        <Fuel className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={isNaN(row.min) ? "" : row.min}
                                                            onChange={(e) => updateRow(idx, 'min', e.target.value)}
                                                            className="bg-background border-border h-10 pl-9 text-sm font-semibold rounded-lg focus:ring-primary shadow-sm"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="col-span-4">
                                                    <div className="relative">
                                                        <ArrowRight className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            value={isNaN(row.max) ? "" : row.max}
                                                            onChange={(e) => updateRow(idx, 'max', e.target.value)}
                                                            className="bg-background border-border h-10 pl-9 text-sm font-semibold rounded-lg focus:ring-primary shadow-sm"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="col-span-3">
                                                    <Input
                                                        type="number"
                                                        value={isNaN(row.price) ? "" : row.price}
                                                        onChange={(e) => updateRow(idx, 'price', e.target.value)}
                                                        className="bg-background border border-primary/20 h-10 text-base font-bold text-right text-primary rounded-lg pr-4 focus:ring-primary"
                                                    />
                                                </div>
                                                <div className="col-span-1 flex justify-end">
                                                    <button 
                                                        type="button"
                                                        onClick={() => removeRow(idx)} 
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-all"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        <button 
                                            type="button"
                                            onClick={addRow}
                                            className="w-full py-4 border border-dashed border-primary/20 hover:border-primary/50 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all font-semibold text-sm flex items-center justify-center gap-2 mt-4 group"
                                        >
                                            <Plus size={16} className="group-hover:scale-105 transition-transform" />
                                            เพิ่มช่วงราคาใหม่ (Add Range)
                                        </button>
                                    </div>
                                </div>

                                <div className="p-4 bg-primary/5 rounded-lg border border-primary/10 flex gap-3 items-center">
                                    <AlertCircle className="text-primary shrink-0 opacity-70" size={20} />
                                    <p className="text-xs text-muted-foreground">
                                        * ระบบจะเลือกราคาให้อัตโนมัติตามราคาน้ำมัน ณ วันที่วิ่งงาน โดยตรวจสอบจากช่วงราคาน้ำมันที่คุณกำหนดไว้ด้านบน
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-card border border-dashed border-border rounded-xl opacity-60 hover:opacity-100 transition-opacity duration-200">
                            <div className="relative mb-4">
                                <Navigation size={40} className={cn("transition-transform duration-300 text-muted-foreground/40", activeRoute && "rotate-45")} />
                            </div>
                            <h3 className="text-lg font-bold text-foreground mb-1">
                                {!activeRoute ? "เลือกเส้นทางงาน" : "เลือกประเภทรถยนต์"}
                            </h3>
                            <p className="text-muted-foreground text-xs max-w-xs mx-auto">
                                {!activeRoute 
                                    ? "โปรดเลือกเส้นทางด้านบนเพื่อจัดการราคาตามค่าน้ำมัน" 
                                    : `เส้นทาง ${activeRoute} พร้อมแล้ว โปรดระบุประเภทรถเพื่อกำหนดเรทราคา`}
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    )
});

CustomerFuelMatrix.displayName = "CustomerFuelMatrix";
