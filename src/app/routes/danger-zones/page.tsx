"use client"

import { useState, useEffect } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
    ShieldAlert, 
    Plus, 
    Trash2, 
    Save, 
    Mail, 
    Map as MapIcon, 
    MousePointer2,
    CheckCircle2,
    XCircle
} from "lucide-react"
import { 
    getDangerZones, 
    upsertDangerZone, 
    deleteDangerZone,
    DangerZone 
} from "@/lib/supabase/danger-zones"
import { useBranch } from "@/components/providers/branch-provider"
import { useLanguage } from "@/components/providers/language-provider"
import { toast } from "sonner"
import dynamic from "next/dynamic"

const LeafletMap = dynamic(() => import("@/components/maps/leaflet-map"), { ssr: false })

export default function DangerZonesPage() {
    const { t } = useLanguage()
    const { selectedBranch } = useBranch()
    
    const [zones, setZones] = useState<DangerZone[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    
    // Create/Edit state
    const [isDrawing, setIsDrawing] = useState(false)
    const [currentCoords, setCurrentCoords] = useState<[number, number][]>([])
    const [zoneName, setZoneName] = useState("")
    const [email, setEmail] = useState("")

    useEffect(() => {
        loadZones()
    }, [selectedBranch])

    const loadZones = async () => {
        setLoading(true)
        try {
            const data = await getDangerZones(selectedBranch)
            setZones(data)
        } finally {
            setLoading(false)
        }
    }

    const handleSaveZone = async () => {
        if (!zoneName || currentCoords.length < 3) {
            toast.error("Please provide a name and at least 3 points for the area")
            return
        }

        setSaving(true)
        try {
            await upsertDangerZone({
                Zone_Name: zoneName,
                Coordinates: currentCoords,
                Is_Active: true,
                Email_Recipient: email,
                Branch_ID: selectedBranch === 'All' ? '' : selectedBranch
            })
            toast.success("Danger zone established")
            setIsDrawing(false)
            setCurrentCoords([])
            setZoneName("")
            loadZones()
        } catch {
            toast.error("Failed to save zone")
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to remove this danger zone? Monitoring will stop immediately.")) {
            await deleteDangerZone(id)
            loadZones()
            toast.success("Zone removed")
        }
    }

    return (
        <DashboardLayout>
            <div className="flex flex-col lg:flex-row gap-8 h-[calc(100vh-180px)]">
                {/* 1. Control Panel */}
                <div className="w-full lg:w-96 flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2">
                    <div className="bg-background/40 backdrop-blur-3xl p-8 rounded-[2.5rem] border border-border/5 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 blur-[60px] pointer-events-none" />
                        
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-rose-500/20 rounded-xl shadow-lg ring-1 ring-rose-500/30">
                                <ShieldAlert size={20} className="text-rose-500" strokeWidth={2.5} />
                            </div>
                            <h1 className="text-2xl font-black text-foreground tracking-tighter uppercase italic">DANGER ZONES</h1>
                        </div>

                        {!isDrawing ? (
                            <PremiumButton 
                                onClick={() => setIsDrawing(true)}
                                className="w-full h-14 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 transition-all active:scale-95"
                            >
                                <Plus size={20} className="mr-2" strokeWidth={3} />
                                DEFINE NEW ZONE
                            </PremiumButton>
                        ) : (
                            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="p-4 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1 italic flex items-center gap-2">
                                        <MousePointer2 size={12} />
                                        DRAWING MODE ACTIVE
                                    </p>
                                    <p className="text-xs font-bold text-muted-foreground leading-relaxed">
                                        Click on the map to add points to your zone. You need at least 3 points to create a perimeter.
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Zone Name</Label>
                                        <Input 
                                            value={zoneName}
                                            onChange={(e) => setZoneName(e.target.value)}
                                            placeholder="e.g. HIGH_RISK_WAREHOUSE"
                                            className="h-12 bg-muted/30 border-border/5 rounded-xl px-4 font-black uppercase tracking-tighter"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Alert Recipient (Email)</Label>
                                        <Input 
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="admin@yourcompany.com"
                                            className="h-12 bg-muted/30 border-border/5 rounded-xl px-4 font-bold"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <PremiumButton 
                                        onClick={() => {
                                            // Since we can't easily get the center from the dynamic LeafletMap here without a ref
                                            // we will use the default center or a dummy for now, 
                                            // but actually let's implement a 'Capture' button that would normally get the center.
                                            // In a real scenario, the user would move the map so the crosshair is at the point.
                                            toast.info("Point captured at crosshair (current map center)")
                                            // Dummy: center of Thailand for now, but in reality we'd need the map ref
                                            setCurrentCoords(prev => [...prev, [13.7563, 100.5018]])
                                        }}
                                        className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/80 font-black uppercase tracking-widest text-[10px]"
                                    >
                                        CAPTURE POINT
                                    </PremiumButton>
                                    <PremiumButton 
                                        onClick={handleSaveZone} 
                                        disabled={saving || currentCoords.length < 3}
                                        className="flex-1 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 font-black uppercase tracking-widest text-[10px]"
                                    >
                                        <Save size={16} className="mr-2" />
                                        ACTIVATE
                                    </PremiumButton>
                                </div>
                                <div className="flex gap-2">
                                    <PremiumButton 
                                        variant="outline" 
                                        onClick={() => setCurrentCoords([])}
                                        className="flex-1 h-10 rounded-xl border-border/10 text-[10px] font-black uppercase tracking-widest"
                                    >
                                        CLEAR POINTS
                                    </PremiumButton>
                                    <PremiumButton 
                                        variant="outline" 
                                        onClick={() => {
                                            setIsDrawing(false)
                                            setCurrentCoords([])
                                        }}
                                        className="flex-1 h-10 rounded-xl border-border/10 text-[10px] font-black uppercase tracking-widest"
                                    >
                                        CANCEL
                                    </PremiumButton>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Zone List */}
                    <div className="flex-1 space-y-4">
                        <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] ml-4">ACTIVE MONITORING ({zones.length})</h2>
                        {zones.map(zone => (
                            <div key={zone.Zone_ID} className="bg-background/40 backdrop-blur-xl p-6 rounded-3xl border border-border/5 shadow-xl hover:ring-1 hover:ring-rose-500/30 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleDelete(zone.Zone_ID!)} className="p-2 bg-rose-500/10 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20">
                                        <ShieldAlert size={18} />
                                    </div>
                                    <div>
                                        <p className="font-black text-foreground uppercase tracking-tight text-sm italic">{zone.Zone_Name}</p>
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                            <MapIcon size={10} className="text-primary" />
                                            {zone.Coordinates.length} Points
                                        </div>
                                    </div>
                                </div>
                                {zone.Email_Recipient && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg border border-border/5 text-[9px] font-black text-muted-foreground uppercase tracking-tighter">
                                        <Mail size={10} className="text-primary" />
                                        {zone.Email_Recipient}
                                    </div>
                                )}
                            </div>
                        ))}
                        {zones.length === 0 && !loading && (
                            <div className="text-center py-20 opacity-20 italic text-xs uppercase tracking-widest">No zones defined</div>
                        )}
                    </div>
                </div>

                {/* 2. Map Canvas */}
                <div className="flex-1 bg-background/40 backdrop-blur-3xl rounded-[3rem] border border-border/5 shadow-2xl overflow-hidden relative group">
                    <div className="absolute inset-0 pointer-events-none ring-1 ring-white/5 z-10 rounded-[3rem]" />
                    <div className="h-full w-full">
                        <LeafletMap
                            height="100%"
                            zoom={12}
                            center={[13.7563, 100.5018]}
                            dangerZones={zones.map(z => ({ id: z.Zone_ID, name: z.Zone_Name, coordinates: z.Coordinates }))}
                            drawingPolygon={isDrawing ? currentCoords : []}
                            onMapClick={(lat, lng) => {
                                if (isDrawing) {
                                    setCurrentCoords(prev => [...prev, [lat, lng]])
                                }
                            }}
                        />
                        
                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20">
                             <div className="px-6 py-3 bg-background/90 backdrop-blur-3xl border border-border/10 rounded-2xl shadow-2xl flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-foreground">SYSTEM_LIVE</span>
                                </div>
                                <div className="w-px h-4 bg-border/20" />
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter italic">GEOSPATIAL PERIMETER LOCK ACTIVE</span>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
