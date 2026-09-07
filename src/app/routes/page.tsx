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
  ShieldCheck,
  Activity,
  Target,
  AlertTriangle,
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
  getAllLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  createBulkLocations,
  getBranches,
  Location,
} from "@/lib/supabase/locations"
import { extractCoordsFromUrl, extractQueryTextFromUrl, buildGoogleMapLink, cn } from "@/lib/utils"
import { geocodeAddress, reverseGeocode } from "@/lib/ai/geocoding"
import dynamic from "next/dynamic"
import type { PickedLocation } from "@/components/maps/location-picker"
const LocationPicker = dynamic(() => import("@/components/maps/location-picker"), { ssr: false })
const LeafletMap = dynamic(() => import("@/components/maps/leaflet-map"), {
  ssr: false,
  loading: () => <div className="h-[600px] w-full bg-muted animate-pulse rounded-2xl" />,
})
import { ExcelImport } from "@/components/ui/excel-import"
import { ExcelExport } from "@/components/ui/excel-export"
import { useBranch } from "@/components/providers/branch-provider"
import { isAdmin } from "@/lib/permissions"
import { useLanguage } from "@/components/providers/language-provider"
import { toast } from "sonner"

type Branch = { Branch_ID: string; Branch_Name: string }

export default function RoutesPage() {
  const { t } = useLanguage()
  const { selectedBranch } = useBranch()

  const [locations, setLocations] = useState<Location[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [branches, setBranches] = useState<Branch[]>([])
  const [searchQuery, setSearchQuery] = useState("")

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isAdminUser, setIsAdminUser] = useState(false)

  const emptyForm: Partial<Location> = {
    Name: "",
    Lat: null,
    Lon: null,
    Phone: "",
    Map_Link: "",
    Branch_ID: "",
  }
  const [formData, setFormData] = useState<Partial<Location>>(emptyForm)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')

  const handlePickerConfirm = (loc: PickedLocation) => {
    setFormData(prev => ({
      ...prev,
      // เติมชื่อให้ก็ต่อเมื่อยังว่าง เพื่อไม่ทับชื่อที่ผู้ใช้พิมพ์ไว้
      Name: prev.Name?.trim() ? prev.Name : (loc.name || prev.Name),
      Lat: Number(loc.lat.toFixed(6)),
      Lon: Number(loc.lng.toFixed(6)),
    }))
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [locData, branchData, adminStatus] = await Promise.all([
      // No page/limit → fetch ALL matching locations (was capped at 100).
      getAllLocations(undefined, undefined, searchQuery, selectedBranch),
      getBranches(),
      isAdmin()
    ])
    setLocations(locData.data)
    setTotalCount(locData.count)
    setBranches(branchData)
    setIsAdminUser(adminStatus)
    setLoading(false)
  }, [searchQuery, selectedBranch])

  useEffect(() => {
    const timer = setTimeout(() => { fetchData() }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery, selectedBranch, fetchData])

  const updateForm = (field: keyof Location, data: string | number | null) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: data }
      // AUTO-EXTRACT: วางลิงก์แผนที่แล้วดึงพิกัดให้อัตโนมัติ
      if (typeof data === 'string' && field === 'Map_Link') {
        const coords = extractCoordsFromUrl(data)
        if (coords) {
          newData.Lat = coords.lat
          newData.Lon = coords.lng
          toast.success("ดึงพิกัดจากลิงก์แผนที่สำเร็จ")
        }
      }
      return newData
    })
  }

  const resetForm = () => {
    setFormData({
      ...emptyForm,
      Branch_ID: (selectedBranch && selectedBranch !== "All") ? selectedBranch : ""
    })
    setEditingLocation(null)
  }

  const handleOpenDialog = (loc?: Location) => {
    if (loc) {
      setEditingLocation(loc)
      setFormData(loc)
    } else {
      resetForm()
    }
    setIsDialogOpen(true)
  }

  // เติมข้อมูลอัตโนมัติแบบ 2 ทาง: ใส่อะไรมาก็เติมที่เหลือให้ครบ (ชื่อ ↔ ลิงก์ ↔ พิกัด)
  const handleSmartFill = async () => {
    const name = (formData.Name || '').trim()
    const link = (formData.Map_Link || '').trim()
    const hasCoord = formData.Lat != null && formData.Lon != null
    if (!name && !link && !hasCoord) {
      toast.warning("กรอกชื่อ หรือวางลิงก์ Google Map ก่อน")
      return
    }
    setLoading(true)
    try {
      let lat: number | null = formData.Lat ?? null
      let lon: number | null = formData.Lon ?? null
      let newName = name
      let newLink = link

      // 1) มีลิงก์ → ดึงพิกัด + ชื่อจากลิงก์
      if (link) {
        const c = extractCoordsFromUrl(link)
        if (c) { lat = c.lat; lon = c.lng }
        if (!newName) {
          const qText = extractQueryTextFromUrl(link)
          if (qText) newName = qText
          else if (c) { const rn = await reverseGeocode(c.lat, c.lng); if (rn) newName = rn }
        }
        // ลิงก์ไม่มีพิกัดฝัง แต่มีข้อความ → geocode ข้อความ
        if (lat == null || lon == null) {
          const q = extractQueryTextFromUrl(link) || newName
          if (q) { const g = await geocodeAddress(q); if (g) { lat = g.lat; lon = g.lng } }
        }
      }
      // 2) ยังไม่มีพิกัด แต่มีชื่อ → geocode ชื่อ
      if ((lat == null || lon == null) && newName) {
        const g = await geocodeAddress(newName)
        if (g) { lat = g.lat; lon = g.lng }
      }
      // 3) มีพิกัดแต่ยังไม่มีชื่อ → reverse geocode
      if (!newName && lat != null && lon != null) {
        const rn = await reverseGeocode(lat, lon); if (rn) newName = rn
      }
      // 4) ยังไม่มีลิงก์ → สร้างจากพิกัด/ชื่อ
      if (!newLink) {
        const bl = buildGoogleMapLink({ name: newName, lat, lng: lon })
        if (bl) newLink = bl
      }

      setFormData(prev => ({
        ...prev,
        Name: newName || prev.Name,
        Lat: lat,
        Lon: lon,
        Map_Link: newLink || prev.Map_Link,
      }))

      const filled: string[] = []
      if (lat != null && !hasCoord) filled.push('พิกัด')
      if (newName && !name) filled.push('ชื่อ')
      if (newLink && !link) filled.push('ลิงก์')
      if (filled.length) toast.success('เติม ' + filled.join(' + ') + ' สำเร็จ')
      else if (lat == null) toast.info('ไม่พบพิกัดอัตโนมัติ — กรอกเองได้')
      else toast.success('ข้อมูลครบแล้ว')
    } catch {
      toast.error('เกิดข้อผิดพลาดในการค้นหา')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!formData.Name || !formData.Name.trim()) {
      toast.warning(t('routes.toasts.name_required'))
      return
    }
    // บังคับให้ครบ: พิกัด + ลิงก์แผนที่ (กดปุ่มค้นหาเพื่อเติมอัตโนมัติได้)
    const missing: string[] = []
    if (formData.Lat == null || formData.Lon == null) missing.push('พิกัด (Lat/Lon)')
    if (!formData.Map_Link || !formData.Map_Link.trim()) missing.push('ลิงก์แผนที่')
    if (missing.length) {
      toast.warning('กรุณากรอกให้ครบ: ' + missing.join(', ') + ' — กดปุ่ม "ค้นหา/เติมอัตโนมัติ" ช่วยได้')
      return
    }
    setSaving(true)
    try {
      const payload: Partial<Location> = {
        Name: formData.Name.trim(),
        Lat: formData.Lat ?? null,
        Lon: formData.Lon ?? null,
        Phone: formData.Phone ?? null,
        Map_Link: formData.Map_Link ?? null,
        Branch_ID: formData.Branch_ID || null,
      }

      if (editingLocation?.Location_ID) {
        const result = await updateLocation(editingLocation.Location_ID, payload)
        if (!result.success) throw result.error
      } else {
        const result = await createLocation(payload)
        if (!result.success) throw result.error
      }

      setIsDialogOpen(false)
      resetForm()
      fetchData()
      toast.success(t('routes.toasts.save_success'))
    } catch (e: unknown) {
      console.error(e)
      toast.error(t('routes.toasts.save_error'))
    } finally {
      setSaving(false)
    }
  }

  const handleImport = async (data: Record<string, unknown>[]) => {
    return createBulkLocations(data)
  }

  const handleDelete = async (loc: Location) => {
    if (!loc.Location_ID) return
    if (confirm(t('routes.toasts.confirm_delete').replace('{{name}}', loc.Name))) {
      await deleteLocation(loc.Location_ID)
      fetchData()
      toast.success(t('routes.toasts.delete_success'))
    }
  }

  return (
    <DashboardLayout>
      {/* Tactical Location Header */}
      {(() => {
        const incomplete = locations.filter(l => l.Is_Incomplete || l.Lat == null)
        if (incomplete.length === 0) return null
        return (
          <div className="mb-6 p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="text-amber-500" size={18} />
              <span className="font-bold text-amber-600">สถานที่ค้างเติมพิกัด — {incomplete.length} แห่ง</span>
            </div>
            <p className="text-sm text-muted-foreground mb-2">สถานที่เหล่านี้ยังไม่มีพิกัด/ลิงก์แผนที่ครบ — คลิกเพื่อค้นหาแล้วเข้าไปเติม</p>
            <div className="flex flex-wrap gap-2">
              {incomplete.slice(0, 30).map((l) => (
                <button
                  key={l.Location_ID}
                  onClick={() => setSearchQuery(l.Name)}
                  className="px-3 py-1 rounded-lg bg-amber-500/15 text-amber-700 text-xs font-medium hover:bg-amber-500/25 transition-colors"
                >
                  {l.Name}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

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
                    data={locations}
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

      {/* Search + view toggle */}
      <div className="mb-8 flex flex-col lg:flex-row lg:items-start gap-4">
        <div className="relative group max-w-xl flex-1">
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
          {!loading && (
            <p className="mt-3 ml-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {searchQuery
                ? `พบ ${locations.length.toLocaleString()} รายการ`
                : `ทั้งหมด ${totalCount.toLocaleString()} รายการ`}
              {` • มีพิกัด ${locations.filter(l => l.Lat != null && l.Lon != null).length.toLocaleString()}`}
            </p>
          )}
        </div>

        {/* List / Map toggle */}
        <div className="flex items-center gap-1 p-1 glass-panel rounded-2xl border-border/5 shrink-0">
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              "h-11 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
              viewMode === 'list' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileSpreadsheet size={14} /> รายการ
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={cn(
              "h-11 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
              viewMode === 'map' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MapPin size={14} /> แผนที่
          </button>
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
                    {editingLocation ? t('routes.dialog.title_edit') : t('routes.dialog.title_add')}
                  </DialogTitle>
                </DialogHeader>
            </div>

            <div className="p-12 space-y-10 custom-scrollbar max-h-[70vh] overflow-y-auto">
              {/* Primary Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-4">
                  <Label className="text-base font-bold font-black uppercase tracking-tight text-muted-foreground ml-2">{t('routes.dialog.route_name')}</Label>
                  <Input
                    value={formData.Name || ""}
                    onChange={(e) => updateForm("Name", e.target.value)}
                    placeholder={t('routes.dialog.placeholder_name')}
                    className="h-16 bg-muted/50 border-border/5 text-foreground font-black rounded-2xl px-8 text-xl uppercase tracking-normal focus:bg-muted/80 transition-all"
                    disabled={!!editingLocation}
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
                            value={formData.Phone || ""}
                            onChange={(e) => updateForm("Phone", e.target.value)}
                            placeholder="081-XXXX-XXXX"
                            className="h-16 bg-muted/50 border-border/5 rounded-2xl px-8 text-lg font-bold font-black text-foreground focus:bg-muted/80 transition-all"
                        />
                    </div>
                    <div className="space-y-4">
                        <Label className="text-base font-bold font-black text-muted-foreground uppercase tracking-tight ml-2">{t('routes.dialog.geo_link')}</Label>
                        <Input
                            value={formData.Map_Link || ""}
                            onChange={(e) => updateForm("Map_Link", e.target.value)}
                            placeholder="HTTPS://MAPS.GOOGLE.COM/..."
                            className="h-16 bg-muted/50 border-border/5 rounded-2xl px-8 text-lg font-bold font-black text-foreground focus:bg-muted/80 transition-all"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 p-8 bg-primary/5 rounded-[2.5rem] border border-primary/10">
                    <div className="space-y-3 col-span-1 md:col-span-1 flex flex-col justify-end gap-2">
                        <PremiumButton
                            type="button"
                            onClick={handleSmartFill}
                            className="w-full h-12 bg-primary/20 text-primary border border-primary/30 rounded-xl font-bold uppercase text-xs"
                        >
                            <Search className="w-4 h-4 mr-2" /> ค้นหา/เติมอัตโนมัติ
                        </PremiumButton>
                        <PremiumButton
                            type="button"
                            onClick={() => setPickerOpen(true)}
                            className="w-full h-12 bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 rounded-xl font-bold uppercase text-xs"
                        >
                            <MapPin className="w-4 h-4 mr-2" /> เลือกบนแผนที่
                        </PremiumButton>
                    </div>
                    <div className="space-y-3">
                        <Label className="text-base font-bold font-black text-primary uppercase tracking-tight ml-2">{t('routes.dialog.lat_matrix')}</Label>
                        <Input
                            type="number"
                            step="any"
                            value={formData.Lat ?? ""}
                            onChange={(e) => updateForm("Lat", e.target.value ? parseFloat(e.target.value) : null)}
                            placeholder="13.XXXX"
                            className="bg-transparent border-border/10 text-foreground font-black text-center text-xl tracking-normal h-12"
                        />
                    </div>
                    <div className="space-y-3">
                        <Label className="text-base font-bold font-black text-primary uppercase tracking-tight ml-2">{t('routes.dialog.lon_matrix')}</Label>
                        <Input
                            type="number"
                            step="any"
                            value={formData.Lon ?? ""}
                            onChange={(e) => updateForm("Lon", e.target.value ? parseFloat(e.target.value) : null)}
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

      {pickerOpen && (
        <LocationPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          initialLat={formData.Lat ?? undefined}
          initialLng={formData.Lon ?? undefined}
          initialName={formData.Name || ""}
          onConfirm={handlePickerConfirm}
          title={editingLocation ? "แก้ไขพิกัดสถานที่บนแผนที่" : "เลือกพิกัดสถานที่บนแผนที่"}
        />
      )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 glass-panel rounded-[4rem] border-border/5 group">
                 <div className="relative">
                    <Loader2 className="animate-spin text-primary opacity-40" size={80} strokeWidth={1} />
                    <Navigation className="absolute inset-0 m-auto text-primary animate-pulse" size={32} />
                 </div>
                 <p className="mt-10 text-muted-foreground font-black uppercase tracking-wide text-base font-bold animate-pulse">{t('routes.scanning')}</p>
            </div>
          ) : viewMode === 'map' ? (
            <div className="glass-panel rounded-[2rem] border-border/5 p-2 overflow-hidden">
              {(() => {
                const mapped = locations
                  .filter(l => l.Lat != null && l.Lon != null)
                  .map(l => ({ id: l.Location_ID || l.Name, name: l.Name, lat: Number(l.Lat), lng: Number(l.Lon), phone: l.Phone, address: l.Address }))
                return (
                  <div className="h-[600px] w-full">
                    {mapped.length > 0 ? (
                      <LeafletMap
                        savedLocations={mapped}
                        fitToSavedLocations
                        zoom={6}
                        center={[13.7563, 100.5018]}
                        height="600px"
                      />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center">
                        <MapPin className="w-12 h-12 text-muted-foreground mb-4 opacity-20" />
                        <p className="text-muted-foreground font-black uppercase tracking-wide text-xs">ยังไม่มีสถานที่ที่มีพิกัดให้แสดงบนแผนที่</p>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {locations.map((loc) => (
                <div key={loc.Location_ID || loc.Name} className="p-0 overflow-hidden group border border-border/5 bg-background/40 backdrop-blur-2xl rounded-2xl shadow-lg relative hover:shadow-xl transition-all duration-700 hover:ring-1 hover:ring-primary/30">
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary to-accent opacity-0 group-hover:opacity-100 transition-all duration-700" />
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-muted/50 border border-border/5 flex items-center justify-center text-foreground font-bold group-hover:bg-primary transition-all duration-700 relative overflow-hidden shadow-lg">
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-transparent" />
                          <MapPin size={20} className="relative z-10" strokeWidth={2.5} />
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-foreground tracking-tighter group-hover:text-primary transition-colors line-clamp-1 duration-500 uppercase italic font-display">{loc.Name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-muted-foreground font-black text-[9px] uppercase tracking-tight italic">{loc.Branch_ID || "HQ-CENTER"}</span>
                              {loc.Is_Incomplete && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-500 border border-amber-500/30 text-[9px] font-black uppercase tracking-tight">ค้างเติมพิกัด</span>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Location Details */}
                    <div className="space-y-3 relative mb-6 text-sm text-muted-foreground">
                        {loc.Phone && (
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs uppercase tracking-tight">Phone:</span>
                                <span className="font-black text-foreground tracking-tight">{loc.Phone}</span>
                            </div>
                        )}
                        {(loc.Lat !== null && loc.Lon !== null) ? (
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs uppercase tracking-tight">Coordinates:</span>
                                <span className="font-black text-foreground text-xs font-mono">{loc.Lat.toFixed(5)}, {loc.Lon.toFixed(5)}</span>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs uppercase tracking-tight">Coordinates:</span>
                                <span className="italic text-xs">No Coordinates</span>
                            </div>
                        )}
                        {loc.Map_Link && (
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-xs uppercase tracking-tight">Map Link:</span>
                                <a
                                    href={loc.Map_Link}
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
                        onClick={() => handleOpenDialog(loc)}
                      >
                        <Edit size={14} /> {t('routes.card.refine')}
                      </button>
                      <button
                        className="h-10 w-10 bg-muted/50 border border-border/5 rounded-xl flex items-center justify-center text-rose-800 hover:bg-rose-500 hover:text-foreground transition-all shadow-md"
                        onClick={() => handleDelete(loc)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Empty State */}
              {locations.length === 0 && (
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
