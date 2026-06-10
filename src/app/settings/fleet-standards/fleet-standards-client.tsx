
"use client"

import { useState, useEffect } from "react"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
    Fuel, 
    Wrench, 
    ShieldCheck, 
    Save, 
    Plus, 
    Trash2,
    Info,
    AlertTriangle,
    Activity,
    ArrowRight,
    Loader2,
    ChevronDown,
    ArrowLeft
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { 
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { saveFuelStandard, saveMaintenanceStandard, deleteMaintenanceStandard } from "@/lib/actions/fleet-intelligence-actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function FleetStandardsClient({ 
    initialFuel, 
    initialMaintenance,
    masterVehicleTypes = [] 
}: { 
    initialFuel: (Record<string, unknown> & { Vehicle_Type?: string, Standard_KM_L?: number, Warning_Threshold_Percent?: number })[], 
    initialMaintenance: (Record<string, unknown> & { Component_Name?: string, Standard_KM?: number | null, Standard_Months?: number | null, Alert_Before_KM?: number, Alert_Before_Days?: number })[],
    masterVehicleTypes?: (Record<string, unknown> & { type_id?: string | number, type_name?: string })[]
}) {
    const [fuelData, setFuelData] = useState<typeof initialFuel>(Array.isArray(initialFuel) ? initialFuel : [])
    const [maintData, setMaintData] = useState<typeof initialMaintenance>(Array.isArray(initialMaintenance) ? initialMaintenance : [])
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (initialFuel) setFuelData(initialFuel)
        if (initialMaintenance) setMaintData(initialMaintenance)
    }, [initialFuel, initialMaintenance])

    // Fuel Actions
    const updateFuel = (index: number, field: string, value: unknown) => {
        const next = [...fuelData]
        next[index] = { ...next[index], [field]: field === 'Vehicle_Type' ? value : (parseFloat(value as string) || 0) }
        setFuelData(next)
    }

    const handleSaveFuel = async (index: number) => {
        const record = fuelData[index]
        if (!record.Vehicle_Type || record.Vehicle_Type === 'none') return toast.warning("โปรดเลือกประเภทรถ")
        
        setSaving(true)
        const result = await saveFuelStandard({
            Vehicle_Type: record.Vehicle_Type,
            Standard_KM_L: Number(record.Standard_KM_L) || 0,
            Warning_Threshold_Percent: Number(record.Warning_Threshold_Percent) || 0,
        })
        if (result.success) {
            toast.success("บันทึกเกณฑ์น้ำมันเรียบร้อย")
            if (result.data) {
                const next = [...fuelData]
                next[index] = result.data
                setFuelData(next)
            }
        }
        else toast.error("ล้มเหลว: " + result.error)
        setSaving(false)
    }

    const addFuelRow = () => {
        setFuelData([{ Vehicle_Type: "none", Standard_KM_L: 10, Warning_Threshold_Percent: 15 }, ...fuelData])
    }

    const removeFuelLocal = (index: number) => {
        setFuelData(fuelData.filter((_, i) => i !== index))
    }

    // Maintenance Actions
    const updateMaint = (index: number, field: string, value: unknown) => {
        const next = [...maintData]
        next[index] = { ...next[index], [field]: field.includes('Name') ? value : (parseFloat(value as string) || null) }
        setMaintData(next)
    }

    const handleSaveMaint = async (index: number) => {
        const record = maintData[index]
        if (!record.Component_Name) return toast.warning("Missing maintenance component name")
        setSaving(true)
        const result = await saveMaintenanceStandard({
            Component_Name: record.Component_Name,
            Standard_KM: record.Standard_KM ?? null,
            Standard_Months: record.Standard_Months ?? null,
        })
        if (result.success) toast.success("บันทึกเกณฑ์การบำรุงรักษาเรียบร้อย")
        else toast.error("ล้มเหลว: " + result.error)
        setSaving(false)
    }

    const addMaintRow = () => {
        setMaintData([...maintData, { Component_Name: "", Standard_KM: 10000, Standard_Months: 12, Alert_Before_KM: 1000, Alert_Before_Days: 15 }])
    }

    return (
        <div className="space-y-8 pb-10 font-sans">
            {/* Tactical Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-background/60 backdrop-blur-xl p-8 rounded-[2rem] border border-border shadow-xl relative group ring-1 ring-border/5">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none" />
                <div className="relative z-10 space-y-4">
                    <button onClick={() => window.history.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.4em] text-base font-bold group/back italic">
                        <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                        ย้อนกลับ
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-primary/20 rounded-xl shadow-lg">
                            <ShieldCheck className="text-primary" size={20} />
                        </div>
                        <h2 className="text-base font-bold font-black text-primary uppercase tracking-[0.4em]">Fleet Intelligence Standard</h2>
                    </div>
                    <h1 className="text-4xl font-black text-foreground tracking-tight flex items-center gap-4 uppercase premium-text-gradient">
                        เกณฑ์มาตรฐานยานพาหนะ
                    </h1>
                    <p className="text-muted-foreground font-bold text-lg tracking-wide opacity-80 uppercase leading-relaxed max-w-2xl">
                        ตั้งค่าเกณฑ์ชี้วัดเพื่อใช้ในระบบวิเคราะห์และการแจ้งเตือนอัจฉริยะ (Anomaly Detection)
                    </p>
                </div>
            </div>

            <Tabs defaultValue="fuel" className="w-full">
                <div className="flex justify-center mb-8">
                    <TabsList className="bg-muted/50 p-2 rounded-[1.5rem] border border-border h-auto flex gap-1">
                        <TabsTrigger value="fuel" className="px-8 py-3 rounded-[1rem] text-base font-black uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-white shadow-lg transition-all flex items-center gap-2">
                            <Fuel size={18} /> เกณฑ์น้ำมัน (Fuel)
                        </TabsTrigger>
                        <TabsTrigger value="maintenance" className="px-8 py-3 rounded-[1rem] text-base font-black uppercase tracking-wider data-[state=active]:bg-primary data-[state=active]:text-white shadow-lg transition-all flex items-center gap-2">
                            <Wrench size={18} /> เกณฑ์บำรุงรักษา (Maint)
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* FUEL TAB */}
                <TabsContent value="fuel" className="animate-in fade-in zoom-in-95 duration-500">
                    <div className="flex justify-between items-center mb-10 px-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400">
                                <Info size={24} />
                            </div>
                            <div>
                                <p className="text-foreground font-black uppercase tracking-tight text-lg">รายการเกณฑ์แยกตามประเภทรถ</p>
                                <p className="text-muted-foreground text-sm font-bold uppercase tracking-widest">เลือกประเภทรถจากฐานข้อมูลหลักเพื่อระบุเป้าหมาย กม./ลิตร</p>
                            </div>
                        </div>
                        <PremiumButton onClick={addFuelRow} className="rounded-xl h-14 px-8 shadow-lg shadow-primary/20 text-base font-black uppercase tracking-wider">
                            <Plus size={20} className="mr-2" strokeWidth={3} />
                            เพิ่มประเภทรถ
                        </PremiumButton>
                    </div>

                    {fuelData.length === 0 ? (
                        <div className="py-40 text-center glass-panel rounded-[4rem] border-dashed border-border opacity-30 flex flex-col items-center gap-6">
                            <Fuel size={80} className="text-muted-foreground" />
                            <p className="text-2xl font-black uppercase tracking-tighter">ยังไม่มีข้อมูลเกณฑ์น้ำมัน</p>
                            <button onClick={addFuelRow} className="text-primary font-black uppercase tracking-widest underline underline-offset-8 decoration-2">กดเพื่อเริ่มเพิ่มรายการ</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
                            {fuelData.map((std, idx) => (
                                <Card key={idx} className="bg-card border border-border rounded-[2.5rem] shadow-xl overflow-hidden hover:scale-[1.01] transition-all duration-500 relative hover:ring-1 hover:ring-primary/20">
                                    <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-[80px] pointer-events-none" />
                                    <CardContent className="p-8 space-y-8">
                                        <div className="flex items-center justify-between">
                                            <div className="p-5 bg-primary/20 rounded-3xl text-primary shadow-inner ring-1 ring-primary/20">
                                                <Activity size={28} strokeWidth={2.5} />
                                            </div>
                                            <button 
                                                onClick={() => removeFuelLocal(idx)}
                                                className="w-12 h-12 rounded-2xl flex items-center justify-center text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-all border border-transparent hover:border-rose-500/20"
                                            >
                                                <Trash2 size={22} />
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-primary ml-1">ขั้นตอนที่ 1: เลือกประเภทรถ (Vehicle Type)</Label>
                                            <Select 
                                                value={std.Vehicle_Type} 
                                                onValueChange={(val) => updateFuel(idx, 'Vehicle_Type', val)}
                                            >
                                                <SelectTrigger className="h-14 bg-muted/20 border-border text-xl font-black rounded-xl px-5 uppercase tracking-tight hover:bg-muted/40 transition-all">
                                                    <SelectValue placeholder="เลือกประเภทรถ..." />
                                                </SelectTrigger>
                                                <SelectContent className="bg-card border-border">
                                                    <SelectItem value="none" disabled className="font-bold opacity-50">-- เลือกประเภทรถ --</SelectItem>
                                                    {masterVehicleTypes.map(vt => (
                                                        <SelectItem key={vt.type_id as string | number} value={(vt.type_name || "") as string} className="py-4 font-black uppercase tracking-tight focus:bg-primary/10">
                                                            {vt.type_name as string}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="grid grid-cols-1 gap-8">
                                            <div className="space-y-4">
                                                <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">ขั้นตอนที่ 2: ตั้งเกณฑ์สิ้นเปลือง (Target KM/L)</Label>
                                                <div className="relative">
                                                    <Input 
                                                        type="number" 
                                                        step="0.1"
                                                        value={std.Standard_KM_L}
                                                        onChange={(e) => updateFuel(idx, 'Standard_KM_L', e.target.value)}
                                                        className="bg-muted/20 border-none h-16 text-4xl font-black rounded-xl text-center focus:ring-primary/20 text-primary"
                                                    />
                                                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground uppercase opacity-40">KM / Liters</div>
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">ขั้นตอนที่ 3: เกณฑ์ความเสี่ยง (Warning Threshold %)</Label>
                                                <div className="relative">
                                                    <Input 
                                                        type="number" 
                                                        value={std.Warning_Threshold_Percent}
                                                        onChange={(e) => updateFuel(idx, 'Warning_Threshold_Percent', e.target.value)}
                                                        className="bg-muted/20 border-none h-14 text-2xl font-black rounded-xl text-center focus:ring-primary/20"
                                                    />
                                                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground uppercase opacity-40">% Variance</div>
                                                </div>
                                            </div>
                                        </div>

                                        <PremiumButton 
                                            onClick={() => handleSaveFuel(idx)} 
                                            disabled={saving}
                                            className="w-full h-14 rounded-xl shadow-lg shadow-primary/20 text-foreground text-base font-black uppercase tracking-wider"
                                        >
                                            {saving ? <Loader2 className="animate-spin mr-3" /> : <Save size={24} className="mr-3" />}
                                            อัปเดตเกณฑ์มาตรฐาน
                                        </PremiumButton>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* MAINTENANCE TAB */}
                <TabsContent value="maintenance" className="animate-in fade-in zoom-in-95 duration-500">
                    <div className="bg-card border border-border rounded-[4rem] shadow-2xl overflow-hidden overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                            <thead>
                                <tr className="bg-muted/30 border-b border-border">
                                    <th className="px-8 py-8 text-xs font-black uppercase tracking-wider text-muted-foreground">รายการอะไหล่ / บริการ</th>
                                    <th className="px-6 py-8 text-xs font-black uppercase tracking-wider text-muted-foreground">ระยะมาตรฐาน (KM)</th>
                                    <th className="px-6 py-8 text-xs font-black uppercase tracking-wider text-muted-foreground">เวลามาตรฐาน (เดือน)</th>
                                    <th className="px-6 py-8 text-xs font-black uppercase tracking-wider text-muted-foreground">เตือนก่อนถึง (KM)</th>
                                    <th className="px-6 py-8 text-xs font-black uppercase tracking-wider text-muted-foreground text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {maintData.map((std, idx) => (
                                    <tr key={idx} className="group hover:bg-primary/[0.02] transition-all duration-500">
                                        <td className="px-10 py-8">
                                            <Input 
                                                value={std.Component_Name}
                                                onChange={(e) => updateMaint(idx, 'Component_Name', e.target.value)}
                                                placeholder="เช่น ยาง, น้ำมันเครื่อง..."
                                                className="bg-transparent border-none text-2xl font-black uppercase tracking-tighter h-14 focus:bg-muted/50 rounded-xl px-4"
                                            />
                                        </td>
                                        <td className="px-8 py-8">
                                            <Input 
                                                type="number"
                                                value={std.Standard_KM || ""}
                                                onChange={(e) => updateMaint(idx, 'Standard_KM', e.target.value)}
                                                placeholder="N/A"
                                                className="bg-muted/30 border-none text-2xl font-black text-center h-14 rounded-2xl focus:ring-primary/30"
                                            />
                                        </td>
                                        <td className="px-8 py-8">
                                            <Input 
                                                type="number"
                                                value={std.Standard_Months || ""}
                                                onChange={(e) => updateMaint(idx, 'Standard_Months', e.target.value)}
                                                placeholder="N/A"
                                                className="bg-muted/30 border-none text-2xl font-black text-center h-14 rounded-2xl focus:ring-primary/30"
                                            />
                                        </td>
                                        <td className="px-8 py-8">
                                            <Input 
                                                type="number"
                                                value={std.Alert_Before_KM}
                                                onChange={(e) => updateMaint(idx, 'Alert_Before_KM', e.target.value)}
                                                className="bg-muted/30 border-none text-2xl font-black text-center h-14 rounded-2xl focus:ring-primary/30 text-primary"
                                            />
                                        </td>
                                        <td className="px-8 py-8 text-center">
                                            <div className="flex items-center justify-center gap-4">
                                                <button type="button" onClick={() => handleSaveMaint(idx)} className="w-14 h-14 bg-emerald-500/10 text-emerald-500 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all shadow-lg flex items-center justify-center border border-emerald-500/20">
                                                    <Save size={24} />
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={async () => {
                                                        if (confirm("ยืนยันการลบรายการนี้?")) {
                                                            const result = await deleteMaintenanceStandard(std.Component_Name || "")
                                                            if (result.success) {
                                                                toast.success("ลบรายการเรียบร้อย")
                                                                setMaintData(maintData.filter((_, i) => i !== idx))
                                                            }
                                                        }
                                                    }}
                                                    className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all shadow-lg flex items-center justify-center border border-rose-500/20"
                                                >
                                                    <Trash2 size={24} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="p-8 bg-muted/20 flex justify-between items-center border-t border-border">
                            <div className="flex items-center gap-3">
                                <ShieldCheck className="text-primary" size={24} />
                                <p className="text-muted-foreground text-sm font-bold uppercase tracking-wider leading-relaxed">
                                    รายการเหล่านี้จะใช้ในการแจ้งเตือน <span className="text-primary">Predictive Maintenance</span><br/>
                                    เพื่อรักษาความพร้อมของยานพาหนะให้สูงสุด
                                </p>
                            </div>
                            <button 
                                type="button"
                                onClick={addMaintRow}
                                className="flex items-center gap-3 px-10 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-wider shadow-lg hover:scale-[1.05] active:scale-95 transition-all text-base"
                            >
                                <Plus size={24} strokeWidth={3} /> เพิ่มรายการบำรุงรักษา
                            </button>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Matrix Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 p-12 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent border border-primary/20 rounded-[4rem] shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-16 opacity-[0.03] group-hover:rotate-12 transition-transform duration-1000 group-hover:scale-110">
                        <Activity size={320} />
                    </div>
                    <div className="relative z-10 space-y-4">
                        <h3 className="text-3xl font-black text-foreground uppercase tracking-tight italic">Intelligence Core Analysis</h3>
                        <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl font-bold uppercase tracking-wide opacity-80">
                            ระบบ Fleet Intel จะนำข้อมูล กม./ลิตร ที่คุณตั้งไว้ ไปวิเคราะห์ประสิทธิภาพเครื่องยนต์อัตโนมัติ 
                            หากพบความเบี่ยงเบน ระบบจะสร้าง Alert แจ้งเตือนคุณที่หน้าแดชบอร์ดทันที
                        </p>
                        <div className="pt-4 flex items-center gap-4 text-primary font-black uppercase tracking-widest text-base group-hover:gap-6 transition-all cursor-pointer">
                            <span>Open Risk Dashboard</span>
                            <ArrowRight size={24} />
                        </div>
                    </div>
                </div>

                <div className="p-12 bg-card border border-border rounded-[4rem] shadow-2xl flex flex-col justify-center gap-8 relative overflow-hidden">
                    <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-amber-500/5 blur-3xl rounded-full" />
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-amber-500/20 rounded-2xl text-amber-500 shadow-inner">
                            <AlertTriangle size={32} />
                        </div>
                        <h4 className="text-2xl font-black text-foreground uppercase tracking-tight leading-none">Global Standards</h4>
                    </div>
                    <div className="space-y-6">
                        <div className="p-6 bg-muted/30 rounded-3xl border border-border space-y-1 group hover:bg-muted/50 transition-colors">
                            <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em]">ยางรถบรรทุก (Truck Tires)</p>
                            <p className="text-xl font-black text-foreground tracking-tight uppercase italic">50,000 - 80,000 KM</p>
                        </div>
                        <div className="p-6 bg-muted/30 rounded-3xl border border-border space-y-1 group hover:bg-muted/50 transition-colors">
                            <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em]">น้ำมันเครื่อง (Synthetic Oil)</p>
                            <p className="text-xl font-black text-foreground tracking-tight uppercase italic">10,000 - 15,000 KM</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
