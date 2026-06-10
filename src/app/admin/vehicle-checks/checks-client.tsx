"use client"

import { 
    Truck, FileText, Image as ImageIcon, PenTool, 
    ArrowLeft, Activity, Search, Target, ShieldCheck 
} from "lucide-react"
import Link from "next/link"
import { PremiumCard } from "@/components/ui/premium-card"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"

interface VehicleCheck {
    id: string;
    Check_Date: string;
    Vehicle_Plate: string;
    Driver_Name: string | null;
    Passed_Items: Record<string, boolean> | null;
    Check_Type?: string;
    Photo_Urls?: string | null;
    Signature_Url?: string | null;
}

interface ChecksClientProps {
    checks: VehicleCheck[]
}

export function ChecksClient({ checks }: ChecksClientProps) {
    const { t } = useLanguage()

    const STANDARD_CHECKLIST = [
        { key: "oil", label: t('checks.standard.oil'), dbKey: "น้ำมันเครื่อง" },
        { key: "coolant", label: t('checks.standard.coolant'), dbKey: "น้ำในหม้อน้ำ" },
        { key: "tires", label: t('checks.standard.tires'), dbKey: "ลมยาง" },
        { key: "lights", label: t('checks.standard.lights'), dbKey: "ไฟเบรค/ไฟเลี้ยว" },
        { key: "tire_condition", label: t('checks.standard.tire_condition'), dbKey: "สภาพยางรถยนต์" },
        { key: "emergency", label: t('checks.standard.emergency'), dbKey: "อุปกรณ์ฉุกเฉิน" },
        { key: "documents", label: t('checks.standard.documents'), dbKey: "เอกสารประจำรถ" }
    ]

    return (
        <div className="space-y-8 pb-20 p-4 lg:p-10">
            {/* Tactical Elite Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-card p-8 rounded-3xl border border-border shadow-md relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
                
                <div className="relative z-10 space-y-4">
                    <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.1em] text-xs font-bold group/back italic leading-none">
                        <ArrowLeft className="w-3.5 h-3.5 group-hover/back:-translate-x-1 transition-transform" /> 
                        ศูนย์ควบคุม
                    </Link>
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-primary/10 rounded-xl border border-border text-primary group-hover:scale-110 transition-all duration-500">
                            <Truck size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-widest uppercase leading-none italic premium-text-gradient">
                                {t('navigation.checks')}
                            </h1>
                            <p className="text-[10px] font-black text-primary uppercase tracking-[0.6em] mt-1 opacity-80 italic">{t('dashboard.subtitle')}</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-3 relative z-10">
                    <div className="bg-muted border border-border px-4 py-1.5 rounded-xl flex items-center gap-2 shadow-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{t('dashboard.system_integrity')}</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl">
                        <Activity className="text-primary" size={14} />
                        <span className="text-xs font-black text-primary uppercase tracking-tighter italic">{t('notifications.status')}: ปกติ (NOMINAL)</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: t('common.trips'), value: "24", icon: ShieldCheck, color: "primary" },
                  { label: "อัตราผ่านเกณฑ์", value: "98.2%", icon: Activity, color: "emerald" },
                  { label: "พบปัญหา", value: "02", icon: Target, color: "rose" },
                  { label: t('navigation.fleet'), value: "86", icon: Truck, color: "blue" },
                ].map((stat, i) => (
                   <PremiumCard key={i} className="p-5 group hover:border-primary/40 transition-all duration-500 border-border bg-card rounded-xl">
                       <div className="flex justify-between items-start mb-3">
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none">{stat.label}</span>
                          <stat.icon className="text-primary opacity-20 group-hover:opacity-100 transition-opacity" size={14} />
                       </div>
                       <p className="text-2xl font-black text-foreground italic tracking-tighter mb-1">{stat.value}</p>
                       <div className="h-0.5 w-8 bg-primary rounded-full" />
                   </PremiumCard>
                ))}
            </div>

            {/* Registry Table */}
            <PremiumCard className="bg-card border border-border shadow-md rounded-3xl overflow-hidden group/table">
                <div className="p-6 border-b border-border bg-muted/30 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] pointer-events-none" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="p-2.5 bg-muted rounded-xl text-primary border border-border shadow-inner group-hover/table:rotate-12 transition-transform duration-500">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-foreground tracking-widest uppercase italic">{t('checks.registry')}</h2>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mt-0.5">{t('notifications.registry_subtitle')}</p>
                        </div>
                    </div>
                    
                    <div className="relative z-10 w-full md:w-72 group/search">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within/search:text-primary transition-colors" size={16} />
                        <input 
                            className="w-full h-11 bg-background border border-border rounded-xl pl-11 pr-4 text-xs font-black uppercase tracking-widest focus:border-primary/50 transition-all text-foreground placeholder:text-muted-foreground italic outline-none"
                            placeholder={t('common.search')}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-muted/50 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground border-b border-border italic">
                                <th className="text-left px-8 py-4">{t('common.date')} Node</th>
                                <th className="text-left px-6 py-4">{t('navigation.fleet')} Plate</th>
                                <th className="text-left px-6 py-4">{t('navigation.drivers')} Operator</th>
                                <th className="text-left px-6 py-4">Verification Vector</th>
                                <th className="text-right px-8 py-4">{t('checks.visual')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {checks?.map((check) => {
                                const items = (check.Passed_Items || {}) as Record<string, boolean>
                                const failedItems = STANDARD_CHECKLIST.filter(item => !items[item.dbKey])
                                const isPass = failedItems.length === 0

                                return (
                                    <tr key={check.id} className="group/row hover:bg-muted/40 transition-all duration-300">
                                        <td className="px-8 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-foreground font-black tracking-tight text-sm uppercase italic group-hover/row:text-primary transition-colors">
                                                    {new Date(check.Check_Date).toLocaleDateString(t('common.loading') === 'กำลังประมวลผล...' ? 'th-TH' : 'en-US')}
                                                </span>
                                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-0.5 opacity-60">
                                                    {new Date(check.Check_Date).toLocaleTimeString(t('common.loading') === 'กำลังประมวลผล...' ? 'th-TH' : 'en-US')}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center text-primary group-hover/row:scale-110 group-hover/row:bg-primary/20 transition-all duration-500 border border-border">
                                                    <Truck size={14} />
                                                </div>
                                                <span className="font-black text-foreground text-sm tracking-widest uppercase italic border-b border-primary/20">{check.Vehicle_Plate}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-foreground font-black italic border border-border text-xs overflow-hidden relative">
                                                    <div className="absolute inset-0 bg-primary/10" />
                                                    {(check.Driver_Name || "A").charAt(0)}
                                                </div>
                                                <span className="text-foreground text-[11px] font-black uppercase tracking-widest italic group-hover/row:text-primary transition-colors">{check.Driver_Name || "OP_ALPHA"}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1.5">
                                                <div className={cn(
                                                    "flex items-center gap-2 px-3 py-1 rounded-full border w-fit shadow-lg transition-all duration-500",
                                                    isPass 
                                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-emerald-500/10" 
                                                        : "bg-rose-500/10 border-rose-500/30 text-rose-500 shadow-rose-500/20 animate-pulse"
                                                )}>
                                                    <div className={cn(
                                                        "w-1 h-1 rounded-full",
                                                        isPass ? "bg-emerald-500" : "bg-rose-500"
                                                    )} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest italic">
                                                        {isPass ? t('checks.status.pass') : t('checks.status.fail')}
                                                    </span>
                                                </div>
                                                {!isPass && (
                                                    <div className="flex flex-wrap gap-1.5 ml-3">
                                                        {failedItems.map(item => (
                                                            <span key={item.key} className="text-[9px] font-black text-rose-300 uppercase tracking-widest bg-rose-500/10 px-2 py-0.5 rounded-md italic border border-rose-500/20">
                                                                FAIL: {item.label}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {check.Photo_Urls && check.Photo_Urls.split(',')[0] && (
                                                    <a 
                                                        href={check.Photo_Urls.split(',')[0]}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="h-9 px-4 rounded-xl bg-muted/50 hover:bg-primary hover:text-white text-foreground text-[10px] font-black uppercase tracking-widest flex items-center justify-center transition-all border border-border shadow-md active:scale-95 group/intel"
                                                    >
                                                        <ImageIcon size={12} className="mr-2 group-hover/intel:scale-110 transition-transform" />
                                                        {t('notifications.visual') || 'VISUAL'}
                                                    </a>
                                                )}
                                                {check.Signature_Url && (
                                                    <a 
                                                        href={check.Signature_Url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="w-9 h-9 rounded-xl bg-muted/50 hover:bg-emerald-500 hover:text-white text-foreground flex items-center justify-center transition-all border border-border shadow-md active:scale-95 group/sig"
                                                    >
                                                        <PenTool size={14} className="group-hover/sig:rotate-12 transition-transform" />
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </PremiumCard>
        </div>
    )
}

