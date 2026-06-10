
"use client"

import { useState } from "react"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { 
    Zap, 
    ShieldCheck, 
    Activity, 
    AlertTriangle, 
    Fuel, 
    Wrench, 
    CheckCircle2, 
    XCircle,
    ArrowRight,
    TrendingDown,
    Truck,
    Info,
    MoreVertical,
    Clock,
    Search
} from "lucide-react"
import { cn } from "@/lib/utils"
import { resolveAlert } from "@/lib/actions/fleet-intelligence-actions"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import type { LucideIcon } from "lucide-react"

type FleetAlert = {
    Alert_ID: string
    Vehicle_Plate: string
    Message: string
    Details?: string | { target?: number | string | null; actual?: number | string | null } | null
    Created_At?: string | null
    Severity: 'CRITICAL' | 'WARNING' | string
    Alert_Type: 'FUEL_EFFICIENCY' | 'MAINTENANCE_LIFESPAN' | string
    master_vehicles?: {
        brand?: string | null
        model?: string | null
    } | null
}

function getAlertDetails(details: FleetAlert["Details"]) {
    if (!details) return null
    if (typeof details === "string") {
        try {
            return JSON.parse(details) as { target?: number | string | null; actual?: number | string | null }
        } catch {
            return null
        }
    }
    return details
}

export function FleetIntelligenceClient({ initialAlerts }: { initialAlerts: FleetAlert[] }) {
    const [alerts, setAlerts] = useState(initialAlerts)
    const [searchQuery, setSearchQuery] = useState("")
    const [resolvingId, setResolvingId] = useState<string | null>(null)

    const filteredAlerts = alerts.filter(a => 
        a.Vehicle_Plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.Message.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const criticalCount = alerts.filter(a => a.Severity === 'CRITICAL').length
    const warningCount = alerts.filter(a => a.Severity === 'WARNING').length

    const handleResolve = async (id: string, status: 'RESOLVED' | 'IGNORED') => {
        setResolvingId(id)
        const result = await resolveAlert(id, status)
        if (result.success) {
            toast.success(status === 'RESOLVED' ? "จัดการความเสี่ยงเรียบร้อย" : "เพิกเฉยความเสี่ยงเรียบร้อย")
            setAlerts(alerts.filter(a => a.Alert_ID !== id))
        } else {
            toast.error("ล้มเหลว: " + result.error)
        }
        setResolvingId(null)
    }

    return (
        <div className="space-y-12 pb-24">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 bg-card p-8 md:p-10 rounded-2xl border border-border shadow-sm relative group">
                <div className="relative z-10 space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-primary/10 rounded-xl border border-primary/20">
                            <Zap className="text-primary" size={20} />
                        </div>
                        <h2 className="text-base font-bold text-primary">Fleet risk monitoring</h2>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight flex items-center gap-5">
                        วิเคราะห์ความเสี่ยง Fleet
                    </h1>
                    <p className="text-muted-foreground font-medium text-base leading-relaxed max-w-2xl">
                        ระบบตรวจจับความผิดปกติของทรัพยากร (Anomaly Detection) อิงตามเกณฑ์มาตรฐานที่คุณตั้งไว้
                    </p>
                </div>

                <div className="flex items-center gap-6 relative z-10">
                    <div className="flex bg-muted/50 p-2 rounded-2xl border border-border">
                        <div className="px-8 py-4 text-center border-r border-border/10">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Critical</p>
                            <p className="text-3xl font-black text-rose-500">{criticalCount}</p>
                        </div>
                        <div className="px-8 py-4 text-center">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Warning</p>
                            <p className="text-3xl font-black text-amber-500">{warningCount}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <SummaryCard 
                    title="ประสิทธิภาพน้ำมัน" 
                    value={alerts.filter(a => a.Alert_Type === 'FUEL_EFFICIENCY').length > 0 ? "พบจุดเสี่ยง" : "ปกติ"}
                    desc="เทียบ KM/L กับเกณฑ์มาตรฐาน"
                    icon={Fuel}
                    color={alerts.filter(a => a.Alert_Type === 'FUEL_EFFICIENCY').length > 0 ? "rose" : "emerald"}
                />
                <SummaryCard 
                    title="รอบบำรุงรักษา" 
                    value={alerts.filter(a => a.Alert_Type === 'MAINTENANCE_LIFESPAN').length > 0 ? "ตรวจพบความถี่สูง" : "ปกติ"}
                    desc="วิเคราะห์อายุอะไหล่และอุปกรณ์"
                    icon={Wrench}
                    color={alerts.filter(a => a.Alert_Type === 'MAINTENANCE_LIFESPAN').length > 0 ? "amber" : "emerald"}
                />
                <SummaryCard 
                    title="คะแนนสุขภาพ Fleet" 
                    value={alerts.length > 10 ? "D" : alerts.length > 5 ? "C" : "A"}
                    desc="ดัชนีรวมความพร้อมของยานพาหนะ"
                    icon={Activity}
                    color={alerts.length > 10 ? "rose" : "emerald"}
                />
            </div>

            {/* Alert list */}
            <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-6">
                    <div className="flex items-center gap-4">
                        <ShieldCheck className="text-primary" size={24} />
                        <h3 className="text-2xl font-semibold text-foreground">รายการความผิดปกติ</h3>
                    </div>
                    <div className="relative group w-full md:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                        <Input 
                            placeholder="ค้นหาทะเบียน หรือ อาการ..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-muted/30 border-border/40 rounded-xl pl-12 h-12 font-medium text-sm"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {filteredAlerts.length === 0 ? (
                        <div className="py-24 text-center bg-card rounded-2xl border border-dashed border-border opacity-70 flex flex-col items-center gap-6">
                            <CheckCircle2 size={80} className="text-emerald-500" />
                            <div>
                                <p className="text-xl font-semibold">ไม่พบความผิดปกติในขณะนี้</p>
                                <p className="text-sm font-medium text-muted-foreground mt-2">Fleet ทำงานได้ตามเกณฑ์ที่ตั้งไว้</p>
                            </div>
                        </div>
                    ) : (
                        filteredAlerts.map((alert) => (
                            <AlertItem 
                                key={alert.Alert_ID} 
                                alert={alert} 
                                onResolve={(status: 'RESOLVED' | 'IGNORED') => handleResolve(alert.Alert_ID, status)}
                                loading={resolvingId === alert.Alert_ID}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

type SummaryCardProps = {
    title: string
    value: string
    desc: string
    icon: LucideIcon
    color: 'rose' | 'amber' | 'emerald' | string
}

function SummaryCard({ title, value, desc, icon: Icon, color }: SummaryCardProps) {
    return (
        <div className={cn(
            "p-6 rounded-2xl border shadow-sm relative overflow-hidden group transition-all bg-card",
            color === 'rose' ? "border-rose-500/20" : color === 'amber' ? "border-amber-500/20" : "border-emerald-500/20"
        )}>
            <div className="flex items-center justify-between mb-8">
                <div className={cn(
                    "p-3 rounded-2xl shadow-sm transition-all duration-300",
                    color === 'rose' ? "bg-rose-500/20 text-rose-500" : color === 'amber' ? "bg-amber-500/20 text-amber-500" : "bg-emerald-500/20 text-emerald-500"
                )}>
                    <Icon size={24} strokeWidth={2.5} />
                </div>
                <div className="text-xs font-semibold text-muted-foreground opacity-60">Live</div>
            </div>
            <div className="space-y-1">
                <p className="text-muted-foreground font-semibold text-sm">{title}</p>
                <p className="text-4xl font-black text-foreground tracking-tighter">{value}</p>
                <p className="text-xs font-medium text-muted-foreground opacity-70 pt-2">{desc}</p>
            </div>
        </div>
    )
}

type AlertItemProps = {
    alert: FleetAlert
    onResolve: (status: 'RESOLVED' | 'IGNORED') => void
    loading: boolean
}

function AlertItem({ alert, onResolve, loading }: AlertItemProps) {
    const isFuel = alert.Alert_Type === 'FUEL_EFFICIENCY'
    const isCritical = alert.Severity === 'CRITICAL'
    const details = getAlertDetails(alert.Details)
    const createdAt = alert.Created_At ? new Date(alert.Created_At).toLocaleString('th-TH') : '-'
    const actual = Number(details?.actual)

    return (
        <div className={cn(
            "p-6 rounded-2xl border bg-card shadow-sm relative overflow-hidden group transition-all hover:border-primary/20",
            isCritical ? "border-rose-500/30" : "border-border/5"
        )}>
            {isCritical && <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500" />}
            
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-10 relative z-10">
                <div className="flex items-center gap-8 flex-1">
                    <div className={cn(
                        "w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl ring-1",
                        isFuel ? "bg-blue-500/20 text-blue-400 ring-blue-500/30" : "bg-amber-500/20 text-amber-400 ring-amber-500/30"
                    )}>
                        {isFuel ? <Fuel size={36} strokeWidth={2.5} /> : <Wrench size={36} strokeWidth={2.5} />}
                    </div>
                    
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-2xl font-black text-foreground tracking-tight">{alert.Vehicle_Plate}</span>
                            <div className="px-3 py-1 bg-muted/50 rounded-full border border-border/10 text-xs font-semibold text-muted-foreground">
                                {alert.master_vehicles?.brand} {alert.master_vehicles?.model}
                            </div>
                            <span className={cn(
                                "px-3 py-1 rounded-full text-xs font-semibold border",
                                isCritical ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            )}>
                                {alert.Severity}
                            </span>
                        </div>
                        <h4 className="text-lg font-bold text-foreground opacity-90">{alert.Message}</h4>
                        <div className="flex items-center gap-6 text-xs font-medium text-muted-foreground">
                            <span className="flex items-center gap-2"><Clock size={12} className="text-primary" /> {createdAt}</span>
                            {isFuel && (
                                <span className="flex items-center gap-2">
                                    <TrendingDown size={12} className="text-rose-500" /> 
                                    เป้าหมาย: {details?.target ?? '-'} กม./ลิตร | ใช้จริง: {Number.isFinite(actual) ? actual.toFixed(2) : '-'} กม./ลิตร
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => onResolve('IGNORED')}
                        disabled={loading}
                        className="h-12 px-6 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all border border-transparent hover:border-border/10"
                    >
                        เพิกเฉย
                    </button>
                    <PremiumButton 
                        onClick={() => onResolve('RESOLVED')}
                        disabled={loading}
                        className="h-14 px-10 rounded-2xl gap-3 shadow-lg shadow-primary/20"
                    >
                        <CheckCircle2 size={20} />
                        จัดการแล้ว
                    </PremiumButton>
                </div>
            </div>
        </div>
    )
}
