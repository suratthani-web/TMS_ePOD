"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  MapPin,
  Plus,
  Search,
  Edit,
  Trash2,
  Save,
  Loader2,
  Navigation,
  Globe,
  FileSpreadsheet,
  Ruler,
  ShieldCheck,
  Activity,
  Target
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  getAllRoutes, 
  createRoute, 
  updateRoute, 
  deleteRoute, 
  createBulkRoutes,
  getUniqueLocations,
  Route,
} from "@/lib/supabase/routes"
import { extractCoordsFromUrl } from "@/lib/utils"
import { geocodeAddress } from "@/lib/ai/geocoding"
import { ExcelImport } from "@/components/ui/excel-import"
import { ExcelExport } from "@/components/ui/excel-export"
import { LocationAutocomplete } from "@/components/location-autocomplete"
import { useBranch } from "@/components/providers/branch-provider"
import { isAdmin } from "@/lib/permissions"
import { useLanguage } from "@/components/providers/language-provider"
import { toast } from "sonner"

export default function RoutesPage() {
  const { t } = useLanguage()
  const { selectedBranch, branches } = useBranch()
  
  const [routes, setRoutes] = useState<Route[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingRoute, setEditingRoute] = useState<Route | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isAdminUser, setIsAdminUser] = useState(false)
  
  const [formData, setFormData] = useState<Partial<Route>>({
    Route_Name: "",
    Origin: "",
    Origin_Lat: null,
    Origin_Lon: null,
    Map_Link_Origin: "",
    Destination: "",
    Dest_Lat: null,
    Dest_Lon: null,
    Map_Link_Destination: "",
    Distance_KM: null,
    Branch_ID: ""
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [routesData, locationsData, adminStatus] = await Promise.all([
      getAllRoutes(1, 100, searchQuery, selectedBranch),
      getUniqueLocations(),
      isAdmin()
    ])
    
    setRoutes(routesData.data)
    setLocations(locationsData)
    setIsAdminUser(adminStatus)
    setLoading(false)
  }, [searchQuery, selectedBranch]) 

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData()
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery, selectedBranch, fetchData])

  const updateForm = (field: keyof Route, data: string | number | null) => {
    setFormData(prev => {
        const newData = { ...prev, [field]: data };
        
        // AUTO-EXTRACT: If pasting into a Map_Link field, try to extract coords
        if (typeof data === 'string' && (field === 'Map_Link_Origin' || field === 'Map_Link_Destination')) {
            const coords = extractCoordsFromUrl(data);
            if (coords) {
                newData.Origin_Lat = coords.lat;
                newData.Origin_Lon = coords.lng;
                newData.Dest_Lat = coords.lat;
                newData.Dest_Lon = coords.lng;
                toast.success("ดึงพิกัดจากลิงก์แผนที่สำเร็จ");
            }
        }
        return newData;
    });
  }

  const resetForm = () => {
    setFormData({
        Route_Name: "",
        Origin: "",
        Origin_Lat: null,
        Origin_Lon: null,
        Map_Link_Origin: "",
        Destination: "",
        Dest_Lat: null,
        Dest_Lon: null,
        Map_Link_Destination: "",
        Distance_KM: null,
        Branch_ID: (selectedBranch && selectedBranch !== "All") ? selectedBranch : ""
    })
    setEditingRoute(null)
  }

  const handleOpenDialog = (route?: Route) => {
    if (route) {
      setEditingRoute(route)
      setFormData(route)
    } else {
      resetForm()
    }
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.Route_Name) {
      toast.warning(t('routes.toasts.name_required'))
      return
    }

    setSaving(true)
    try {
      const name = formData.Route_Name.trim()
      const payload: Partial<Route> = {
        Route_Name: name,
        Origin: name,
        Destination: name,
        Origin_Lat: formData.Origin_Lat ?? null,
        Dest_Lat: formData.Origin_Lat ?? null,
        Origin_Lon: formData.Origin_Lon ?? null,
        Dest_Lon: formData.Origin_Lon ?? null,
        Origin_Phone: formData.Origin_Phone ?? null,
        Dest_Phone: formData.Origin_Phone ?? null,
        Map_Link_Origin: formData.Map_Link_Origin ?? null,
        Map_Link_Destination: formData.Map_Link_Origin ?? null,
        Distance_KM: 0,
        Branch_ID: formData.Branch_ID || null
      }

      if (editingRoute) {
        const result = await updateRoute(editingRoute.Route_Name, payload)
        if (!result.success) throw result.error
      } else {
        const result = await createRoute(payload)
        if (!result.success) throw result.error
      }
      
      setIsDialogOpen(false)
      resetForm()
      fetchData()
      toast.success(t('routes.toasts.save_success'))
    } catch (e: any) {
      console.error(e)
      toast.error(t('routes.toasts.save_error'))
    } finally {
      setSaving(false)
    }
  }

  const handleImport = async (data: any[]) => {
    const normalizeData = (row: any) => {
        const getValue = (keys: string[]) => {
            const rowKeys = Object.keys(row)
            for (const key of keys) {
                const foundKey = rowKeys.find(k => k.toLowerCase().replace(/\s+/g, '_') === key.toLowerCase().replace(/\s+/g, '_'))
                if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
                    return row[foundKey]
                }
            }
            return undefined
        }

        const name = (getValue(['location_name', 'name', 'ชื่อสถานที่', 'สถานที่', 'route_name', 'origin']) || '') as string
        const phone = getValue(['phone', 'เบอร์ติดต่อ', 'เบอร์โทร', 'origin_phone']) as string
        const mapLink = getValue(['map_link', 'ลิงก์แผนที่', 'แผนที่', 'map_link_origin']) as string
        const lat = getValue(['latitude', 'ละติจูด', 'lat', 'origin_lat'])
        const lon = getValue(['longitude', 'ลองจิจูด', 'lon', 'lng', 'origin_lon'])
        const branchId = getValue(['branch_id', 'branch', 'สาขา']) as string

        return {
            name: name.trim(),
            phone: phone ? String(phone).trim() : null,
            mapLink: mapLink ? String(mapLink).trim() : null,
            lat: lat ? parseFloat(String(lat)) : null,
            lon: lon ? parseFloat(String(lon)) : null,
            branchId: branchId ? String(branchId).trim() : null
        }
    }

    const cleaned = data.map(r => normalizeData(r)).filter(r => r.name)

    if (cleaned.length === 0) {
        return { success: false, message: "ไม่พบข้อมูลที่ถูกต้อง (ต้องมีชื่อสถานที่)" }
    }

    const payloadList = cleaned.map(c => ({
        Route_Name: c.name,
        Origin: c.name,
        Destination: c.name,
        Origin_Lat: c.lat,
        Dest_Lat: c.lat,
        Origin_Lon: c.lon,
        Dest_Lon: c.lon,
        Origin_Phone: c.phone,
        Dest_Phone: c.phone,
        Map_Link_Origin: c.mapLink,
        Map_Link_Destination: c.mapLink,
        Distance_KM: 0,
        Branch_ID: c.branchId
    }))

    return createBulkRoutes(payloadList)
  }

  const handleDelete = async (routeName: string) => {
    if (confirm(t('routes.toasts.confirm_delete').replace('{{name}}', routeName))) {
      await deleteRoute(routeName)
      fetchData()
      toast.success(t('routes.toasts.delete_success'))
    }
  }

  return (
    <DashboardLayout>
      {/* Tactical Route Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10 bg-background/60 backdrop-blur-3xl p-8 rounded-3xl border border-border/5 shadow-xl relative group ring-1 ring-border/5 hover:ring-primary/20 transition-all duration-700">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2">
                <div className="p-1.5 bg-primary/20 rounded-lg shadow-lg">
                    <Navigation className="text-primary" size={16} />
                </div>
                <h2 className="text-xs font-bold font-black text-primary uppercase tracking-tight">{t('routes.geospatial_matrix')}</h2>
            </div>
            <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-tighter flex items-center gap-4 uppercase premium-text-gradient italic leading-none">
                {t('routes.title')}
            </h1>
            <p className="text-muted-foreground font-bold text-sm tracking-normal opacity-80 uppercase leading-relaxed italic">
              {t('routes.subtitle')}
            </p>
        </div>

        <div className="flex flex-wrap gap-3 relative z-10">
            {isAdminUser && (
              <>
                <ExcelExport 
                    data={routes}
                    filename="logispro_locations_export"
                    trigger={
                        <PremiumButton variant="outline" className="h-11 px-5 rounded-xl border-border/5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest" >
                            <FileSpreadsheet size={16} className="mr-2" />
                            Export
                        </PremiumButton>
                    }
                />
                <ExcelImport 
                    trigger={
                        <PremiumButton variant="outline" className="h-11 px-5 rounded-xl border-border/5 bg-muted/50 text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all text-[10px] font-black uppercase tracking-widest">
                            <FileSpreadsheet size={16} className="mr-2 opacity-50" /> 
                            {t('routes.spatial_import')}
                        </PremiumButton>
                    }
                    title={t('routes.spatial_import')}
                    onImport={handleImport}
                    templateData={[{
                        Location_Name: "คลังสินค้าหลัก A",
                        Branch_ID: "HQ",
                        Phone: "081-234-5678",
                        Map_Link: "https://maps.google.com/?q=13.7563,100.5018",
                        Latitude: 13.7563,
                        Longitude: 100.5018
                    }]}
                    templateFilename="logispro_locations_template.xlsx"
                />
                <PremiumButton onClick={() => handleOpenDialog()} className="h-11 px-6 rounded-xl shadow-lg bg-primary text-foreground font-black uppercase tracking-widest text-[10px]">
                  <Plus size={18} className="mr-2" strokeWidth={3} />
                  {t('routes.enlist_route')}
                </PremiumButton>
              </>
            )}
        </div>
      </div>

      {/* Navigation Command Grid */}
      <div className="mb-8 relative group max-w-xl">
        <div className="absolute inset-x-0 bottom-0 h-1 bg-primary blur-3xl opacity-20 pointer-events-none" />
        <div className="relative glass-panel rounded-2xl p-0.5 border-border/5">
            <div className="flex items-center gap-3 px-4">
                <Search className="text-primary opacity-50" size={18} />
                <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('routes.search_placeholder')}
                    className="bg-transparent border-none text-base font-black text-foreground px-2 h-12 placeholder:text-muted-foreground tracking-tight uppercase focus-visible:ring-0"
                />
            </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="bg-background border border-border/5 text-foreground max-w-3xl shadow-[0_50px_100px_rgba(0,0,0,0.5)] rounded-[4rem] p-0 overflow-hidden ring-1 ring-white/10">
            <div className="bg-card p-12 text-foreground relative overflow-hidden border-b border-border/5">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
                <DialogHeader>
                  <DialogTitle className="text-5xl font-black tracking-tighter flex items-center gap-6 uppercase premium-text-gradient">
                    <div className="p-3 bg-primary/20 rounded-2xl shadow-xl ring-1 ring-primary/30">
                        <Target size={32} className="text-primary" strokeWidth={2.5} />
                    </div>
                    {editingRoute ? t('routes.dialog.title_edit') : t('routes.dialog.title_add')}
                  </DialogTitle>
                </DialogHeader>
            </div>

            <div className="p-12 space-y-10 custom-scrollbar max-h-[70vh] overflow-y-auto">
              {/* Route Primary Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-4">
                  <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('routes.dialog.route_name')}</Label>
                  <Input
                    value={formData.Route_Name || ""}
                    onChange={(e) => updateForm("Route_Name", e.target.value)}
                    placeholder={t('routes.dialog.placeholder_name')}
                    className="h-16 bg-muted/50 border-border/5 text-foreground font-black rounded-2xl px-8 text-xl uppercase tracking-normal focus:bg-muted/80 transition-all"
                    disabled={!!editingRoute}
                  />
                </div>
                <div className="space-y-4">
                  <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('routes.dialog.branch')}</Label>
                  <Select 
                      value={formData.Branch_ID || ""} 
                      onValueChange={(value) => updateForm("Branch_ID", value)}
                  >
                      <SelectTrigger className="h-16 bg-muted/50 border-border/5 text-foreground font-black rounded-2xl px-8 text-xl uppercase tracking-normal">
                        <SelectValue placeholder={t('routes.dialog.placeholder_branch')} />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border/10 text-foreground font-black">
                      {branches.map(b => (
                          <SelectItem key={b.Branch_ID} value={b.Branch_ID} className="hover:bg-primary/20 focus:bg-primary/20 uppercase tracking-normal text-base font-bold">
                          {b.Branch_Name} ({b.Branch_ID})
                          </SelectItem>
                      ))}
                      </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Location Detail Block */}
              <div className="space-y-6">
                <h3 className="text-lg font-bold font-black text-primary tracking-tight uppercase flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(255,30,133,1)]" />
                    {t('routes.geospatial_matrix')}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                        <Label className="text-base font-bold font-black text-muted-foreground uppercase tracking-tight ml-2">Phone</Label>
                        <Input
                            value={formData.Origin_Phone || ""}
                            onChange={(e) => updateForm("Origin_Phone", e.target.value)}
                            placeholder="081-XXXX-XXXX"
                            className="h-16 bg-muted/50 border-border/5 rounded-2xl px-8 text-lg font-bold font-black text-foreground focus:bg-muted/80 transition-all"
                        />
                    </div>
                    <div className="space-y-4">
                        <Label className="text-base font-bold font-black text-muted-foreground uppercase tracking-tight ml-2">{t('routes.dialog.geo_link')}</Label>
                        <Input
                            value={formData.Map_Link_Origin || ""}
                            onChange={(e) => updateForm("Map_Link_Origin", e.target.value)}
                            placeholder="HTTPS://MAPS.GOOGLE.COM/..."
                            className="h-16 bg-muted/50 border-border/5 rounded-2xl px-8 text-lg font-bold font-black text-foreground focus:bg-muted/80 transition-all"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 p-8 bg-primary/5 rounded-[2.5rem] border border-primary/10">
                    <div className="space-y-3 col-span-1 md:col-span-1 flex flex-col justify-end">
                        <PremiumButton
                            type="button"
                            onClick={async () => {
                                if (!formData.Route_Name) {
                                    toast.warning("โปรดกรอกชื่อสถานที่ก่อนค้นหาพิกัด");
                                    return;
                                }
                                setLoading(true);
                                try {
                                    const res = await geocodeAddress(formData.Route_Name);
                                    if (res) {
                                        updateForm("Origin_Lat", res.lat);
                                        updateForm("Origin_Lon", res.lng);
                                        toast.success("ค้นหาพิกัดตามชื่อสำเร็จ");
                                    } else {
                                        toast.info("ไม่พบพิกัดสำหรับสถานที่นี้");
                                    }
                                } catch {
                                    toast.error("เกิดข้อผิดพลาดในการค้นหาพิกัด");
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            className="w-full h-12 bg-primary/20 text-primary border border-primary/30 rounded-xl font-bold uppercase text-xs"
                        >
                            <Search className="w-4 h-4 mr-2" /> ค้นหาพิกัด
                        </PremiumButton>
                    </div>
                    <div className="space-y-3">
                        <Label className="text-base font-bold font-black text-primary uppercase tracking-tight ml-2">{t('routes.dialog.lat_matrix')}</Label>
                        <Input
                            type="number"
                            step="any"
                            value={formData.Origin_Lat ?? ""}
                            onChange={(e) => updateForm("Origin_Lat", e.target.value ? parseFloat(e.target.value) : null)}
                            placeholder="13.XXXX"
                            className="bg-transparent border-border/10 text-foreground font-black text-center text-xl tracking-normal h-12"
                        />
                    </div>
                    <div className="space-y-3">
                        <Label className="text-base font-bold font-black text-primary uppercase tracking-tight ml-2">{t('routes.dialog.lon_matrix')}</Label>
                        <Input
                            type="number"
                            step="any"
                            value={formData.Origin_Lon ?? ""}
                            onChange={(e) => updateForm("Origin_Lon", e.target.value ? parseFloat(e.target.value) : null)}
                            placeholder="100.XXXX"
                            className="bg-transparent border-border/10 text-foreground font-black text-center text-xl tracking-normal h-12"
                        />
                    </div>
                </div>
              </div>

              <div className="flex gap-6 pt-10 border-t border-border/5 mt-12 mb-8">
                <PremiumButton onClick={handleSave} disabled={saving} className="flex-[2] bg-primary hover:bg-primary/80 shadow-primary/20 h-20 rounded-3xl text-lg font-black tracking-normal uppercase">
                  {saving ? <Loader2 className="w-6 h-6 mr-4 animate-spin" /> : <Save className="w-6 h-6 mr-4" strokeWidth={3} />}
                  {t('routes.dialog.execute_plot')}
                </PremiumButton>
                <PremiumButton variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1 border-border/5 h-20 rounded-3xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all uppercase font-black tracking-normal">
                  {t('common.abort')}
                </PremiumButton>
              </div>
            </div>
          </DialogContent>
      </Dialog>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 glass-panel rounded-[4rem] border-border/5 group">
                 <div className="relative">
                    <Loader2 className="animate-spin text-primary opacity-40" size={80} strokeWidth={1} />
                    <Navigation className="absolute inset-0 m-auto text-primary animate-pulse" size={32} />
                 </div>
                 <p className="mt-10 text-muted-foreground font-black uppercase tracking-wide text-base font-bold animate-pulse">{t('routes.scanning')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {routes.map((route) => (
                <div key={route.Route_Name} className="p-0 overflow-hidden group border border-border/5 bg-background/40 backdrop-blur-2xl rounded-2xl shadow-lg relative hover:shadow-xl transition-all duration-700 hover:ring-1 hover:ring-primary/30">
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-accent opacity-0 group-hover:opacity-100 transition-all duration-700" />
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-muted/50 border border-border/5 flex items-center justify-center text-foreground font-bold group-hover:bg-primary transition-all duration-700 relative overflow-hidden shadow-lg">
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-transparent" />
                          <MapPin size={20} className="relative z-10" strokeWidth={2.5} />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-foreground tracking-tighter group-hover:text-primary transition-colors line-clamp-1 duration-500 uppercase italic font-display">{route.Route_Name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-muted-foreground font-black text-[9px] uppercase tracking-tight italic">{route.Branch_ID || "HQ-CENTER"}</span>
                              {route.Distance_KM !== null && route.Distance_KM > 0 && (
                                <>
                                    <div className="w-1 h-1 rounded-full bg-primary/40" />
                                    <div className="flex items-center gap-1.5">
                                        <Ruler size={10} className="text-primary/60" />
                                        <span className="text-primary font-black text-[10px] uppercase tracking-tight">{route.Distance_KM} {t('common.baht') === 'บาท' ? 'กม.' : 'KM'}</span>
                                    </div>
                                </>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Location Details */}
                    <div className="space-y-3 relative mb-6 text-sm text-muted-foreground">
                        {route.Origin_Phone && (
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs uppercase tracking-tight">Phone:</span>
                                <span className="font-black text-foreground tracking-tight">{route.Origin_Phone}</span>
                            </div>
                        )}
                        {(route.Origin_Lat !== null && route.Origin_Lon !== null) ? (
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs uppercase tracking-tight">Coordinates:</span>
                                <span className="font-black text-foreground text-xs font-mono">{route.Origin_Lat.toFixed(5)}, {route.Origin_Lon.toFixed(5)}</span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs uppercase tracking-tight">Coordinates:</span>
                                <span className="italic text-xs">No Coordinates</span>
                            </div>
                        )}
                        {route.Map_Link_Origin && (
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs uppercase tracking-tight">Map Link:</span>
                                <a 
                                    href={route.Map_Link_Origin} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="inline-flex items-center gap-1.5 text-xs text-primary font-black hover:underline uppercase"
                                >
                                    <Globe size={12} /> Open Maps
                                </a>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 pt-4 border-t border-border/5">
                      <button 
                        className="flex-1 h-10 bg-muted/50 border border-border/5 rounded-xl text-[10px] font-black uppercase tracking-tight text-muted-foreground hover:bg-primary/20 hover:text-primary transition-all flex items-center justify-center gap-2"
                        onClick={() => handleOpenDialog(route)}
                      >
                        <Edit size={14} /> {t('routes.card.refine')}
                      </button>
                      <button 
                        className="h-10 w-10 bg-muted/50 border border-border/5 rounded-xl flex items-center justify-center text-rose-800 hover:bg-rose-500 hover:text-foreground transition-all shadow-md"
                        onClick={() => handleDelete(route.Route_Name)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Enhanced Empty State */}
              {routes.length === 0 && (
                <div className="col-span-full text-center py-24 glass-panel rounded-3xl border-dashed border-border/5 group">
                  <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20 group-hover:scale-110 transition-transform duration-1000" />
                  <p className="text-muted-foreground font-black uppercase tracking-wide text-xs">{t('routes.empty')}</p>
                </div>
              )}
            </div>
          )}

      <div className="mt-20 text-center mb-24">
        <div className="inline-flex items-center gap-4 px-8 py-3 glass-panel rounded-full text-base font-bold font-black text-muted-foreground uppercase tracking-wide opacity-40 hover:opacity-100 transition-opacity">
            <ShieldCheck size={14} className="text-primary" /> GIS Neural Grid Core v6.0 • Tactical Nodal Routing
        </div>
      </div>
    </DashboardLayout>
  )
}

