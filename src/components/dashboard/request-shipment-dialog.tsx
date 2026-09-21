"use client"

import { useState, useEffect } from "react"
import { useLanguage } from "@/components/providers/language-provider"
import { LocationAutocomplete } from "@/components/location-autocomplete"
import { todayTH } from "@/lib/utils/date-th"
import { Calendar, MapPin, Package, StickyNote, Send, CheckCircle2, Plus, Trash2, Truck } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog"
import { requestShipmentBatch, getCustomerOriginSuggestions } from "@/app/planning/actions"
import { toast } from "sonner"

interface RequestShipmentDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

interface Stop {
    Dest_Location: string
    Cargo_Type: string
    Vehicles: number
    Notes: string
}

const emptyStop = (): Stop => ({ Dest_Location: "", Cargo_Type: "", Vehicles: 1, Notes: "" })

export function RequestShipmentDialog({ open, onOpenChange }: RequestShipmentDialogProps) {
    const { t, language } = useLanguage()
    const [loading, setLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [header, setHeader] = useState({
        Plan_Date: todayTH(),
        Origin_Location: "",
        Cargo_Type: "",
        Notes: "",
    })
    const [stops, setStops] = useState<Stop[]>([emptyStop()])
    // จุดรับ/จุดส่งที่ลูกค้าเคยใช้ (ดรอปดาวน์) — โหลดตอนเปิดฟอร์ม + prefill จุดรับล่าสุด
    const [originOptions, setOriginOptions] = useState<string[]>([])
    const [destOptions, setDestOptions] = useState<string[]>([])

    useEffect(() => {
        if (!open) return
        let active = true
        getCustomerOriginSuggestions().then(({ suggestions, lastUsed, destSuggestions }) => {
            if (!active) return
            setOriginOptions(suggestions)
            setDestOptions(destSuggestions)
            // ถ้ายังไม่ได้เลือกจุดรับ และมีจุดล่าสุด → เติมให้อัตโนมัติ (แก้ได้)
            setHeader(p => p.Origin_Location ? p : (lastUsed ? { ...p, Origin_Location: lastUsed } : p))
        }).catch(() => {})
        return () => { active = false }
    }, [open])

    const th = language === 'th'
    const totalJobs = stops.reduce((sum, s) => sum + (Number(s.Vehicles) || 1), 0)

    const reset = () => {
        setHeader({ Plan_Date: todayTH(), Origin_Location: "", Cargo_Type: "", Notes: "" })
        setStops([emptyStop()])
    }

    const updateStop = (idx: number, patch: Partial<Stop>) => {
        setStops(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s))
    }
    const addStop = () => setStops(prev => [...prev, emptyStop()])
    const removeStop = (idx: number) => setStops(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!header.Origin_Location.trim()) {
            toast.error(th ? "กรุณาระบุต้นทาง" : "Origin is required")
            return
        }
        if (stops.every(s => !s.Dest_Location.trim())) {
            toast.error(th ? "กรุณาระบุปลายทางอย่างน้อย 1 แห่ง" : "At least one destination is required")
            return
        }
        setLoading(true)
        try {
            const res = await requestShipmentBatch({ ...header, stops })
            if (res.success) {
                setSuccess(true)
                toast.success(res.message || t('shipment.toast_success'))
                setTimeout(() => {
                    onOpenChange(false)
                    setSuccess(false)
                    reset()
                }, 1800)
            } else {
                toast.error(res.message)
            }
        } catch {
            toast.error(t('shipment.toast_error'))
        } finally {
            setLoading(false)
        }
    }

    const fieldCls = "h-12 rounded-2xl bg-muted/50 border-border/10 font-bold focus:ring-emerald-500/20 focus:border-emerald-500/50"

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-[640px] max-h-[95vh] flex flex-col p-0 overflow-hidden bg-background/95 backdrop-blur-2xl border border-border/10 shadow-2xl rounded-[2.5rem]">
            <AnimatePresence mode="wait">
                {success ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="p-12 text-center flex flex-col items-center justify-center min-h-[400px]"
                    >
                        <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-emerald-500/20">
                            <CheckCircle2 className="text-white w-10 h-10" />
                        </div>
                        <h3 className="text-2xl font-black text-foreground mb-2 tracking-tighter">{t('shipment.success_title')}</h3>
                        <p className="text-muted-foreground font-bold uppercase tracking-widest text-base">{t('shipment.success_desc')}</p>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex flex-col flex-1 overflow-hidden"
                    >
                        <DialogHeader className="p-8 pb-4 flex-shrink-0">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-emerald-500 rounded-xl text-white">
                                    <Package size={20} />
                                </div>
                                <DialogTitle className="text-2xl font-black tracking-tighter text-foreground">{t('shipment.title_request')}</DialogTitle>
                            </div>
                            <DialogDescription className="text-muted-foreground font-bold uppercase tracking-widest text-sm">
                                {th ? "แจ้งแผนงานได้หลายปลายทาง/หลายคันในครั้งเดียว" : "Request multiple destinations & vehicles in one go"}
                            </DialogDescription>
                        </DialogHeader>

                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 pt-0 space-y-6 custom-scrollbar">
                            {/* Shared header */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <Calendar size={14} className="text-emerald-500" /> {t('shipment.plan_date')}
                                    </Label>
                                    <Input
                                        type="date"
                                        required
                                        value={header.Plan_Date}
                                        onChange={(e) => setHeader(p => ({ ...p, Plan_Date: e.target.value }))}
                                        className={fieldCls}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <MapPin size={14} className="text-emerald-500" /> {t('shipment.origin')}
                                    </Label>
                                    <LocationAutocomplete
                                        value={header.Origin_Location}
                                        onChange={(val) => setHeader(p => ({ ...p, Origin_Location: val }))}
                                        locations={originOptions}
                                        placeholder={t('shipment.placeholder_origin')}
                                        className={fieldCls}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    <Package size={14} className="text-blue-500" /> {th ? "ประเภทสินค้า (ค่าเริ่มต้นทุกปลายทาง)" : "Default cargo (all stops)"}
                                </Label>
                                <Input
                                    placeholder={t('shipment.placeholder_cargo')}
                                    value={header.Cargo_Type}
                                    onChange={(e) => setHeader(p => ({ ...p, Cargo_Type: e.target.value }))}
                                    className={fieldCls}
                                />
                            </div>

                            {/* Destination rows */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-sm font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">
                                        <MapPin size={14} /> {th ? `ปลายทาง (${stops.length})` : `Destinations (${stops.length})`}
                                    </Label>
                                    <span className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">
                                        {th ? `รวม ${totalJobs} งาน` : `${totalJobs} job(s) total`}
                                    </span>
                                </div>

                                {stops.map((stop, idx) => (
                                    <div key={idx} className="rounded-2xl border border-border/10 bg-muted/30 p-4 space-y-3 relative">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-black text-amber-500 uppercase tracking-widest">
                                                {th ? `ปลายทางที่ ${idx + 1}` : `Stop ${idx + 1}`}
                                            </span>
                                            {stops.length > 1 && (
                                                <button type="button" onClick={() => removeStop(idx)}
                                                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                                            <LocationAutocomplete
                                                placeholder={t('shipment.placeholder_destination')}
                                                value={stop.Dest_Location}
                                                onChange={(val) => updateStop(idx, { Dest_Location: val })}
                                                locations={destOptions}
                                                className={fieldCls}
                                            />
                                            <div className="flex items-center gap-2 bg-muted/50 rounded-2xl border border-border/10 px-3 h-12 shrink-0">
                                                <Truck size={14} className="text-emerald-500 shrink-0" />
                                                <span className="text-[10px] font-black text-muted-foreground uppercase whitespace-nowrap">{th ? "คัน" : "Trucks"}</span>
                                                <input
                                                    type="number" min={1} max={50}
                                                    value={stop.Vehicles}
                                                    onChange={(e) => updateStop(idx, { Vehicles: Math.max(1, Number(e.target.value) || 1) })}
                                                    className="w-14 bg-transparent font-black text-center outline-none"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <Input
                                                placeholder={th ? "สินค้า (เฉพาะปลายทางนี้)" : "Cargo (this stop)"}
                                                value={stop.Cargo_Type}
                                                onChange={(e) => updateStop(idx, { Cargo_Type: e.target.value })}
                                                className="h-11 rounded-2xl bg-muted/50 border-border/10 font-bold text-sm"
                                            />
                                            <Input
                                                placeholder={th ? "หมายเหตุปลายทาง" : "Stop note"}
                                                value={stop.Notes}
                                                onChange={(e) => updateStop(idx, { Notes: e.target.value })}
                                                className="h-11 rounded-2xl bg-muted/50 border-border/10 font-bold text-sm"
                                            />
                                        </div>
                                    </div>
                                ))}

                                <button type="button" onClick={addStop}
                                    className="w-full h-12 rounded-2xl border-2 border-dashed border-emerald-500/30 text-emerald-500 font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 hover:bg-emerald-500/5 transition-colors">
                                    <Plus size={16} /> {th ? "เพิ่มปลายทาง" : "Add destination"}
                                </button>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    <StickyNote size={14} className="text-purple-500" /> {t('shipment.notes')}
                                </Label>
                                <Textarea
                                    placeholder={t('shipment.placeholder_notes')}
                                    rows={2}
                                    value={header.Notes}
                                    onChange={(e) => setHeader(p => ({ ...p, Notes: e.target.value }))}
                                    className="rounded-2xl bg-muted/50 border-border/10 font-bold focus:ring-emerald-500/20 focus:border-emerald-500/50 resize-none"
                                />
                            </div>

                            <DialogFooter className="pt-4 border-t border-border/10">
                                <PremiumButton
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-14 rounded-2xl shadow-xl shadow-emerald-500/20 text-lg group"
                                >
                                    {loading ? t('shipment.submitting') : (
                                        <>
                                            <Send size={20} className="mr-2 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                                            {th ? `ส่งคำขอ ${totalJobs} งาน` : `Submit ${totalJobs} job(s)`}
                                        </>
                                    )}
                                </PremiumButton>
                            </DialogFooter>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>
        </DialogContent>
        </Dialog>
    )
}
