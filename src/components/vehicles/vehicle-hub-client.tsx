"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, FileText, Pencil, Truck, Fuel, Wrench, CheckCircle2, Paperclip } from "lucide-react"
import type { Vehicle } from "@/lib/supabase/vehicles"
import { VehicleLogDialog } from "./vehicle-log-dialog"
import { VehicleDialog } from "./vehicle-dialog"
import {
    getVehicleRenewals, getTireLogs, getTireSummary, getVehicleCostSummary,
    getFuelLogsFor, getRepairTicketsFor, getVehicleChecksFor,
    type TireSummary, type VehicleCostSummary,
} from "@/app/vehicles/fleet-log-actions"
import { formatGoogleDriveImageUrl } from "@/lib/gdrive/utils"

const DOC_LABELS: Record<string, string> = { tax: 'ภาษีรถ', insurance: 'ประกันภัย', act: 'พ.ร.บ.', cargo: 'ประกันสินค้า', tire: 'ยาง' }
const TIRE_ACTION_LABELS: Record<string, string> = { change: 'เปลี่ยน', patch: 'ปะ', rotate: 'สลับ' }

function daysLeft(date?: string | null): number | null {
    if (!date) return null
    const d = new Date(date)
    if (isNaN(d.getTime())) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return Math.ceil((d.getTime() - today.getTime()) / 86400000)
}

export function VehicleHubClient({ vehicle }: { vehicle: Vehicle }) {
    const plate = vehicle.Vehicle_Plate
    const [showLog, setShowLog] = useState(false)
    const [showEdit, setShowEdit] = useState(false)

    const [renewals, setRenewals] = useState<Record<string, unknown>[]>([])
    const [tires, setTires] = useState<Record<string, unknown>[]>([])
    const [tireSummary, setTireSummary] = useState<TireSummary | null>(null)
    const [cost, setCost] = useState<VehicleCostSummary | null>(null)
    const [fuel, setFuel] = useState<Record<string, unknown>[]>([])
    const [repairs, setRepairs] = useState<Record<string, unknown>[]>([])
    const [checks, setChecks] = useState<Record<string, unknown>[]>([])

    const load = useCallback(async () => {
        const [r, t, ts, c, f, rp, ck] = await Promise.all([
            getVehicleRenewals(plate), getTireLogs(plate), getTireSummary(plate), getVehicleCostSummary(plate),
            getFuelLogsFor(plate), getRepairTicketsFor(plate), getVehicleChecksFor(plate),
        ])
        setRenewals(r as Record<string, unknown>[]); setTires(t as Record<string, unknown>[])
        setTireSummary(ts); setCost(c); setFuel(f); setRepairs(rp); setChecks(ck)
    }, [plate])

    useEffect(() => { load() }, [load])

    const docs: Array<[string, string | null | undefined]> = [
        ['ภาษีรถ', vehicle.Tax_Expiry], ['ประกันภัย', vehicle.Insurance_Expiry],
        ['พ.ร.บ.', vehicle.Act_Expiry], ['ประกันสินค้า', vehicle.Cargo_Insurance_Expiry],
    ]

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/vehicles"><Button variant="outline" size="icon" className="h-10 w-10"><ArrowLeft size={18} /></Button></Link>
                    {vehicle.Image_Url ? (
                        <div className="w-16 h-16 rounded-2xl overflow-hidden border border-border bg-muted/30 shrink-0 shadow-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={formatGoogleDriveImageUrl(vehicle.Image_Url)}
                                alt={plate}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none'
                                }}
                            />
                        </div>
                    ) : null}
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">{vehicle.Vehicle_Type || '-'}</Badge>
                            {(() => {
                                const ot = vehicle.Owner_Type || (vehicle.Sub_ID ? 'sub' : 'company')
                                if (ot === 'sub') return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">รถร่วม (มีสังกัด)</Badge>
                                if (ot === 'independent') return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-xs">รถร่วมอิสระ</Badge>
                                return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">รถบริษัท</Badge>
                            })()}
                        </div>
                        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Truck size={22} className="text-primary" /> {plate}</h1>
                        <p className="text-sm text-muted-foreground">{[vehicle.Brand, vehicle.Model].filter(Boolean).join(' ') || '-'} • {(vehicle.Current_Mileage ?? 0).toLocaleString()} กม.</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <VehicleLogDialog vehicle={vehicle} open={showLog} onOpenChange={(v) => { setShowLog(v); if (!v) load() }} />
                    <Button onClick={() => setShowLog(true)} className="gap-2"><FileText size={16} /> จัดการ เอกสาร/ยาง</Button>
                    <VehicleDialog mode="edit" vehicle={vehicle} open={showEdit} onOpenChange={setShowEdit} />
                    <Button variant="outline" onClick={() => setShowEdit(true)} className="gap-2"><Pencil size={16} /> แก้ไข</Button>
                </div>
            </div>

            <Tabs defaultValue="overview">
                <TabsList className="flex flex-wrap h-auto">
                    <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
                    <TabsTrigger value="docs">เอกสาร ({renewals.length})</TabsTrigger>
                    <TabsTrigger value="tire">ยาง ({tires.length})</TabsTrigger>
                    <TabsTrigger value="fuel">น้ำมัน ({fuel.length})</TabsTrigger>
                    <TabsTrigger value="repair">ซ่อม ({repairs.length})</TabsTrigger>
                    <TabsTrigger value="checks">ตรวจรถ ({checks.length})</TabsTrigger>
                </TabsList>

                {/* Overview: doc status + cost */}
                <TabsContent value="overview" className="space-y-4 pt-4">
                    <div>
                        <h3 className="text-sm font-bold text-muted-foreground uppercase mb-2">สถานะเอกสาร</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {docs.map(([label, date]) => {
                                const d = daysLeft(date)
                                const color = d == null ? 'text-muted-foreground' : d < 0 ? 'text-rose-500' : d <= 30 ? 'text-amber-500' : 'text-emerald-500'
                                return (
                                    <div key={label} className="p-3 rounded-lg border border-border bg-muted/20">
                                        <p className="text-xs text-muted-foreground">{label}</p>
                                        <p className={`text-sm font-bold ${color}`}>{date || 'ไม่มีข้อมูล'}</p>
                                        {d != null && <p className={`text-xs ${color}`}>{d < 0 ? `เกิน ${Math.abs(d)} วัน` : d === 0 ? 'หมดวันนี้' : `เหลือ ${d} วัน`}</p>}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                    {cost && (
                        <div>
                            <h3 className="text-sm font-bold text-muted-foreground uppercase mb-2">ต้นทุนสะสม</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Stat label="น้ำมัน" value={`${cost.fuelCost.toLocaleString()} ฿`} />
                                <Stat label="ซ่อม" value={`${cost.repairCost.toLocaleString()} ฿`} />
                                <Stat label="ยาง" value={`${cost.tireCost.toLocaleString()} ฿`} />
                                <Stat label="รวม" value={`${cost.totalCost.toLocaleString()} ฿`} highlight />
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">อัตราน้ำมัน: {cost.kmPerLiter != null ? `${cost.kmPerLiter.toFixed(2)} กม./ลิตร` : '-'}</p>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="docs" className="pt-4">
                    <List rows={renewals} empty="ยังไม่มีประวัติการต่อเอกสาร"
                        render={(r) => `${DOC_LABELS[String(r.doc_type)] || r.doc_type} • ต่อ ${r.renewed_date} → หมด ${r.new_expiry ?? '-'}${r.cost ? ` • ${Number(r.cost).toLocaleString()}฿` : ''}${r.vendor ? ` • ${r.vendor}` : ''}`} />
                </TabsContent>

                <TabsContent value="tire" className="space-y-3 pt-4">
                    {tireSummary && tireSummary.positions.length > 0 && (
                        <div className="p-3 rounded-lg border border-border bg-muted/20 text-sm space-y-1">
                            {tireSummary.positions.map((p, i) => (
                                <div key={i} className="flex justify-between gap-2">
                                    <span className="font-medium">{p.position}</span>
                                    <span className="text-muted-foreground text-xs text-right">
                                        เปลี่ยน {p.changeCount} ครั้ง{p.avgKmBetweenChanges != null ? ` • เฉลี่ย ${p.avgKmBetweenChanges.toLocaleString()} กม./ครั้ง` : ''}
                                        {p.currentRunKm != null ? ` • เส้นนี้วิ่งแล้ว ${p.currentRunKm.toLocaleString()} กม.` : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    <List rows={tires} empty="ยังไม่มีประวัติยาง"
                        render={(r) => `${TIRE_ACTION_LABELS[String(r.action)] || r.action}${r.position ? ` (${r.position})` : ''} • ${r.service_date}${r.odometer ? ` • ${Number(r.odometer).toLocaleString()} กม.` : ''}${r.cost ? ` • ${Number(r.cost).toLocaleString()}฿` : ''}`} />
                </TabsContent>

                <TabsContent value="fuel" className="pt-4">
                    <List rows={fuel} empty="ยังไม่มีบันทึกน้ำมัน" icon={<Fuel size={14} />}
                        render={(r) => `${String(r.Date_Time ?? '').slice(0, 10)} • ${Number(r.Liters ?? 0).toLocaleString()} ล. • ${Number(r.Price_Total ?? 0).toLocaleString()} ฿${r.Odometer ? ` • ${Number(r.Odometer).toLocaleString()} กม.` : ''}`} />
                </TabsContent>

                <TabsContent value="repair" className="pt-4">
                    <List rows={repairs} empty="ยังไม่มีบันทึกซ่อม" icon={<Wrench size={14} />}
                        render={(r) => `${String(r.Date_Report ?? '').slice(0, 10)} • ${r.Issue_Type ?? 'ซ่อม'} • ${Number(r.Cost_Total ?? 0).toLocaleString()} ฿ • ${r.Status ?? ''}`} />
                </TabsContent>

                <TabsContent value="checks" className="pt-4">
                    <List rows={checks} empty="ยังไม่มีบันทึกตรวจรถ" icon={<CheckCircle2 size={14} />}
                        render={(r) => {
                            const passed = r.Passed_Items && typeof r.Passed_Items === 'object' ? Object.values(r.Passed_Items as Record<string, unknown>).filter(v => v === true).length : 0
                            const total = r.Passed_Items && typeof r.Passed_Items === 'object' ? Object.keys(r.Passed_Items as Record<string, unknown>).length : 0
                            return `${String(r.Check_Date ?? '').slice(0, 10)} • ${r.Driver_Name ?? '-'} • ผ่าน ${passed}/${total}`
                        }} />
                </TabsContent>
            </Tabs>
        </div>
    )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`p-3 rounded-lg border ${highlight ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20'}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-lg font-bold ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
        </div>
    )
}

function List({ rows, render, empty, icon }: {
    rows: Record<string, unknown>[]
    render: (r: Record<string, unknown>) => string
    empty: string
    icon?: React.ReactNode
}) {
    if (rows.length === 0) return <p className="text-sm text-muted-foreground italic py-8 text-center">{empty}</p>
    return (
        <div className="space-y-1.5">
            {rows.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/30 border border-border text-sm text-foreground">
                    <span className="flex items-center gap-2 truncate">{icon}{render(r)}</span>
                    {r.file_url ? <a href={String(r.file_url)} target="_blank" rel="noreferrer" className="text-primary shrink-0"><Paperclip size={14} /></a> : null}
                </div>
            ))}
        </div>
    )
}
