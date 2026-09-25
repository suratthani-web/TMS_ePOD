"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { 
    Calendar, 
    LayoutGrid, 
    List, 
    Plus, 
    Zap, 
    Inbox,
    Clock,
    Truck,
    CheckCircle2,
    FileSpreadsheet,
    Loader2,
    Download,
    Search,
    X
} from "lucide-react"
import { utils, writeFile } from "xlsx"
import { Job } from "@/lib/supabase/jobs"
import { Driver } from "@/lib/supabase/drivers"
import { Vehicle } from "@/lib/supabase/vehicles"
import { Customer } from "@/lib/supabase/customers"
import { Route } from "@/lib/supabase/routes"
import { Subcontractor } from "@/types/subcontractor"
import { JobFormData } from "@/app/planning/actions"
import { toast } from "sonner"
import { JobDialog } from "@/components/planning/job-dialog"
import { JobGrid } from "@/components/planning/job-grid"
import { KanbanBoard } from "@/components/planning/kanban-board"
import { useRouter, useSearchParams } from "next/navigation"
import { useRealtime } from "@/hooks/useRealtime"
import { RealtimeIndicator } from "@/components/ui/realtime-indicator"
import { useLanguage } from "@/components/providers/language-provider"
import { useCustomer } from "@/components/providers/customer-provider"
import { ExcelImport } from "@/components/ui/excel-import"
import { PremiumButton } from "../ui/premium-button"

interface PlanningClientProps {
    stats: {
        total: number
        pending: number
        inProgress: number
        delivered: number
    }
    todayJobs: Job[]
    requestedJobs: Job[]
    jobCreationData: {
        drivers: Driver[]
        vehicles: Vehicle[]
        customers: Customer[]
        routes: Route[]
        subcontractors: Subcontractor[]
    }
    canViewIncome: boolean
    canViewExpense: boolean
    canDelete: boolean
    canCreate: boolean
    canAssign: boolean
    createBulkJobs: (data: Partial<JobFormData>[], effectiveBranchId?: string | null, options?: { shouldGroup?: boolean }) => Promise<{ success: boolean; message: string }>
    publishAllDrafts: (date: string, branchId?: string) => Promise<{ success: boolean, error?: any, jobsCount?: number }>
    branchId: string
    selectedDate: string
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
}

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
}

export function PlanningClient({
    stats,
    todayJobs,
    requestedJobs,
    jobCreationData,
    canViewIncome,
    canViewExpense,
    canDelete,
    canCreate,
    canAssign,
    createBulkJobs,
    publishAllDrafts,
    branchId,
    selectedDate
}: PlanningClientProps) {
    const { drivers, vehicles, customers, routes, subcontractors } = jobCreationData
    const [view, setView] = useState<'list' | 'kanban' | 'requests'>('list')
    const router = useRouter()
    const searchParams = useSearchParams()
    const urlQuery = searchParams.get('query') || ""
    
    const [publishing, setPublishing] = useState(false)
    const [templateCustomerId, setTemplateCustomerId] = useState<string>("")
    const [searchQuery, setSearchQuery] = useState(urlQuery)
    const { t } = useLanguage()
    const { selectedCustomer } = useCustomer()

    // The global customer filter may hold one id, 'All', or a comma-separated
    // multi-select list. Derive a matcher: empty set = no filter (show all).
    const customerFilterSet = useMemo(
        () => new Set(
            selectedCustomer && selectedCustomer !== 'All'
                ? selectedCustomer.split(',').map(s => s.trim()).filter(Boolean)
                : []
        ),
        [selectedCustomer]
    )
    const matchesCustomer = useCallback(
        (id: string | null | undefined) => customerFilterSet.size === 0 || (id != null && customerFilterSet.has(id)),
        [customerFilterSet]
    )

    // Sync external query to internal search state
    useEffect(() => {
        if (urlQuery) {
            setSearchQuery(urlQuery)
        }
    }, [urlQuery])

    // Real-time: Jobs_Main (Throttled to protect Vercel Serverless quota)
    const throttledRefresh = useMemo(() => {
        let inThrottle = false;
        return () => {
            if (!inThrottle) {
                router.refresh()
                inThrottle = true
                setTimeout(() => { inThrottle = false }, 15000) // 15 seconds cooldown
            }
        }
    }, [router])

    useRealtime('Jobs_Main', throttledRefresh)

    const handleDateChange = (newDate: string) => {
        const params = new URLSearchParams(window.location.search)
        params.set('date', newDate)
        router.push(`/planning?${params.toString()}`)
    }

    const handlePublishAll = async () => {
        if (!confirm(t('planning.confirm_publish_all') || "คุณแน่ใจหรือไม่ที่จะส่งงาน Draft ทั้งหมดของวันนี้?")) return

        setPublishing(true)
        const toastId = toast.loading("กำลังส่งงานทั้งหมด...")
        
        try {
            const res = await publishAllDrafts(selectedDate, branchId)
            if (res.success) {
                toast.success(`ส่งงานสำเร็จ ${res.jobsCount || ''} รายการ`, { id: toastId })
                router.refresh()
            } else {
                toast.error(res.error?.message || "เกิดข้อผิดพลาดในการส่งงาน", { id: toastId })
            }
        } catch (err) {
            console.error("Publishing error:", err)
            toast.error("ระบบขัดข้อง: " + (err instanceof Error ? err.message : "Internal Server Error"), { id: toastId })
        } finally {
            setPublishing(false)
        }
    }

    const downloadCustomTemplate = () => {
        if (!templateCustomerId) {
            toast.error("กรุณาเลือกลูกค้าก่อนดาวน์โหลดแทมเพลท (Please select a customer first)")
            return
        }

        const selectedCustomer = customers.find(c => c.Customer_ID === templateCustomerId)
        const customerBranchId = selectedCustomer?.Branch_ID

        const templateData = [{
            "รหัสงาน": "JOB-001",
            "วันที่แผน": selectedDate || "",
            "ลูกค้า": templateCustomerId || "CUST-001",
            "ต้นทาง": "คลังสินค้า สุราษฎร์ธานี",
            "ปลายทาง": "ท่าเรือ กรุงเทพฯ",
            "รหัสคนขับ": "DRV-001",
            "ทะเบียนรถ": "80-1234 กทม.",
            "น้ำหนักสินค้า": 1500,
            "ปริมาตร": 10,
            "ราคาขาย": 5500,
            "จ่ายคนขับ": 3500,
            "เลขที่อ้างอิง": "SO-12345",
            "รอบ": 1,
            "หมายเหตุ": "ด่วนพิเศษ",
            "สาขา": customerBranchId || (branchId !== 'All' ? branchId : "HQ")
        }]

        const ws1 = utils.json_to_sheet(templateData)
        
        // Prepare DATA sheet content
        // Routes are not tied to Customer_ID in DB, so we show all branch routes.
        // Filter lists by selected customer's branch if set to prevent showing data from other branches.
        const filteredRoutes = customerBranchId ? routes.filter(r => r.Branch_ID === customerBranchId) : routes
        const filteredDrivers = customerBranchId ? drivers.filter(d => d.Branch_ID === customerBranchId) : drivers
        const filteredVehicles = customerBranchId ? vehicles.filter(v => v.Branch_ID === customerBranchId) : vehicles

        // 1 แถว = 1 คนขับ พร้อม "ทะเบียนที่ตัวเองลงทะเบียนไว้จริง" เท่านั้น
        // ถ้าไม่ได้ลงทะเบียนทะเบียนไว้ (คนขับหลายคัน สลับไปมา) → เว้นว่าง ตามจริง
        // ห้ามจับคู่รถที่เหลือแบบสุ่ม (เดิมทำให้คนขับได้ทะเบียนของคนอื่น/สังกัดอื่น)
        const driverRows = filteredDrivers.map(d => {
            const v = d.Vehicle_Plate ? filteredVehicles.find(x => x.Vehicle_Plate === d.Vehicle_Plate) : undefined
            return {
                driverId: d.Driver_ID || "",
                driverName: d.Driver_Name || "",
                plate: d.Vehicle_Plate || "",       // ทะเบียนของคนขับเอง (หรือว่าง)
                type: v?.Vehicle_Type || "",
            }
        })

        // Reference list of unique locations (ต้นทาง/ปลายทางใช้ร่วมกันได้ ไม่ต้องแยกคอลัมน์)
        const locationList = Array.from(new Set(
            filteredRoutes.flatMap(r => [r?.Origin?.trim(), r?.Destination?.trim()])
                .filter((v): v is string => Boolean(v))
        ))

        const maxRows = Math.max(locationList.length, driverRows.length)
        const dataSheetContent = []

        for (let i = 0; i < maxRows; i++) {
            const dr = driverRows[i]

            dataSheetContent.push({
                "สถานที่ (Location)": locationList[i] || "",
                " ": "", // Spacer
                "รหัสคนขับ (Driver ID)": dr?.driverId || "",
                "ชื่อคนขับ (Driver Name)": dr?.driverName || "",
                "  ": "", // Spacer
                "ทะเบียนรถ (Plate)": dr?.plate || "",
                "ประเภทรถ (Type)": dr?.type || ""
            })
        }

        const ws2 = utils.json_to_sheet(dataSheetContent)

        // Auto-size columns for DATA sheet to make it readable
        const wscols = [
            {wch: 30}, // สถานที่ (Location)
            {wch: 5},  // Spacer 1
            {wch: 15}, // รหัสคนขับ (Driver ID)
            {wch: 25}, // ชื่อคนขับ (Driver Name)
            {wch: 5},  // Spacer 2
            {wch: 20}, // ทะเบียนรถ (Plate)
            {wch: 15}  // ประเภทรถ (Type)
        ];
        ws2['!cols'] = wscols;

        const wb = utils.book_new()
        utils.book_append_sheet(wb, ws1, "Template")
        utils.book_append_sheet(wb, ws2, "DATA")
        writeFile(wb, "logispro_jobs_template_with_data.xlsx")
    }

    const setYesterday = () => {
        const d = new Date(selectedDate)
        d.setDate(d.getDate() - 1)
        handleDateChange(d.toLocaleDateString('en-CA'))
    }

    const setToday = () => {
        handleDateChange(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }))
    }

    const filteredTodayJobs = useMemo(() => {
        let base = todayJobs
        if (customerFilterSet.size > 0) {
            base = base.filter(j => matchesCustomer(j.Customer_ID))
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase()
            base = base.filter(j => {
                const matchMain = j.Job_ID.toLowerCase().includes(q) || 
                    j.Customer_Name?.toLowerCase().includes(q) ||
                    j.Driver_Name?.toLowerCase().includes(q) ||
                    j.Vehicle_Plate?.toLowerCase().includes(q)
                
                if (matchMain) return true

                // Check deep into original_destinations_json SO numbers
                if (j.original_destinations_json) {
                    try {
                        const dests = typeof j.original_destinations_json === 'string'
                            ? JSON.parse(j.original_destinations_json)
                            : j.original_destinations_json
                        if (Array.isArray(dests)) {
                            return dests.some((d: { so_no?: string; name?: string }) => 
                                (d.so_no && String(d.so_no).toLowerCase().includes(q)) ||
                                (d.name && String(d.name).toLowerCase().includes(q))
                            )
                        }
                    } catch {}
                }
                return false
            })
        }
        return base
    }, [todayJobs, customerFilterSet, matchesCustomer, searchQuery])

    const filteredJobs = useMemo(() => {
        let base = view === 'requests' ? requestedJobs : filteredTodayJobs.filter(j => j.Job_Status !== 'Requested')
        
        if (view === 'requests' && customerFilterSet.size > 0) {
            base = base.filter(j => matchesCustomer(j.Customer_ID))
        }

        if (view === 'requests' && searchQuery) {
            const q = searchQuery.toLowerCase()
            base = base.filter(j => 
                j.Job_ID.toLowerCase().includes(q) || 
                j.Customer_Name?.toLowerCase().includes(q)
            )
        }
        
        return base
    }, [filteredTodayJobs, requestedJobs, view, customerFilterSet, matchesCustomer, searchQuery])

    const calculatedStats = useMemo(() => {
        if (customerFilterSet.size === 0) {
            return stats
        }
        const total = filteredTodayJobs.length
        const delivered = filteredTodayJobs.filter(j => j.Job_Status === 'Delivered' || j.Job_Status === 'Completed').length
        const inProgress = filteredTodayJobs.filter(j => j.Job_Status === 'In Transit' || j.Job_Status === 'In Progress' || j.Job_Status === 'Arrived Pickup' || j.Job_Status === 'Arrived Dropoff').length
        const pending = filteredTodayJobs.filter(j => j.Job_Status === 'New' || j.Job_Status === 'Assigned' || j.Job_Status === 'Requested' || j.Job_Status === 'Pending' || j.Job_Status === 'Draft').length
        return { total, pending, inProgress, delivered }
    }, [stats, filteredTodayJobs, customerFilterSet])

    const requestCount = useMemo(() => {
        if (customerFilterSet.size > 0) {
            return requestedJobs.filter(j => matchesCustomer(j.Customer_ID)).length
        }
        return requestedJobs.length
    }, [requestedJobs, customerFilterSet, matchesCustomer])

    return (
        <motion.div 
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-6 pb-20"
        >
            {/* Planning Command Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-3 italic uppercase premium-text-gradient">
                        <Calendar className="text-primary" size={24} />
                        {t('planning.title')}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <RealtimeIndicator isLive={true} className="bg-muted/50 border-border/10" />
                        <p className="text-muted-foreground font-black uppercase tracking-[0.3em] text-[10px] italic">
                            {t('planning.mission_orchestration')}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex bg-muted/50 p-1 rounded-xl border border-border/10 shadow-inner">
                        <button
                            onClick={() => setView('list')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                view === 'list' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <List size={14} />
                            {t('planning.list_view')}
                        </button>
                        <button
                            onClick={() => setView('kanban')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                view === 'kanban' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <LayoutGrid size={14} />
                            {t('planning.kanban_view')}
                        </button>
                        <button
                            onClick={() => setView('requests')}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all relative",
                                view === 'requests' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Inbox size={14} />
                            {t('planning.requests')}
                            {requestCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-[10px] font-black flex items-center justify-center rounded-full border-2 border-background">
                                    {requestCount}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className="relative flex items-center">
                        <div className="absolute left-3 text-muted-foreground">
                            <Search size={14} />
                        </div>
                        <input 
                            type="text" 
                            placeholder={t('common.search') || "Search Jobs..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-10 pl-9 pr-10 w-[200px] lg:w-[240px] bg-muted/50 border border-border/10 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary outline-none transition-all"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center bg-muted/50 p-1 rounded-xl border border-border/10 shadow-inner ml-2">
                        <button 
                            onClick={setYesterday}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tighter text-muted-foreground hover:text-foreground hover:bg-background/50 transition-all"
                        >
                            เมื่อวาน
                        </button>
                        <input 
                            type="date" 
                            value={selectedDate}
                            onChange={(e) => handleDateChange(e.target.value)}
                            className="bg-transparent border-none text-xs font-bold text-primary px-2 focus:ring-0 cursor-pointer"
                        />
                        <button 
                            onClick={setToday}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tighter text-muted-foreground hover:text-foreground hover:bg-background/50 transition-all"
                        >
                            วันนี้
                        </button>
                    </div>

                    {canCreate && (
                        <div className="flex items-center gap-2 ml-2">
                            {todayJobs.some(j => j.Job_Status === 'Draft') && (
                                <PremiumButton 
                                    onClick={handlePublishAll}
                                    disabled={publishing}
                                    className="h-11 px-6 rounded-xl bg-amber-500 text-white shadow-lg text-xs font-black uppercase tracking-widest gap-2 hover:bg-amber-600 transition-all active:scale-95"
                                >
                                    {publishing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} className="text-white fill-white" />}
                                    ส่งงาน Draft ทั้งหมด
                                </PremiumButton>
                            )}
                            <ExcelImport 
                                trigger={
                                    <PremiumButton variant="outline" className="h-11 px-5 rounded-xl border-border/10 hover:border-primary/50 text-muted-foreground gap-2 text-xs font-black uppercase tracking-widest">
                                        <FileSpreadsheet size={16} /> {t('common.tactical.bulk_import') || 'Import'}
                                    </PremiumButton>
                                }
                                title={t('planning.import_title') || 'Import Jobs'}
                                onImport={(data, options) => createBulkJobs(data, branchId === 'All' ? null : branchId, options)}
                                groupingLabel="รวมหลายดรอปเป็นงานเดียว (แถวรองใส่แค่ปลายทาง)"
                                showDraftOption={true}
                                customTemplateButton={
                                    <div className="flex items-center gap-3 bg-muted/30 p-2 rounded-2xl border border-border/10">
                                        <select 
                                            className="h-10 px-4 rounded-xl border border-border/10 bg-background text-sm font-bold text-foreground focus:ring-2 focus:ring-primary outline-none"
                                            value={templateCustomerId}
                                            onChange={(e) => setTemplateCustomerId(e.target.value)}
                                        >
                                            <option value="">-- เลือกลูกค้าอ้างอิง --</option>
                                            {customers.map(c => (
                                                <option key={c.Customer_ID} value={c.Customer_ID}>{c.Customer_Name}</option>
                                            ))}
                                        </select>
                                        <PremiumButton 
                                            variant="outline"
                                            onClick={downloadCustomTemplate}
                                            className="h-10 px-4 rounded-xl gap-2 border-primary/20 bg-primary/10 hover:bg-primary/20 text-primary transition-all active:scale-95 text-xs font-black uppercase tracking-widest"
                                        >
                                            <Download size={14} /> โหลดแทมเพลท (พร้อม DATA)
                                        </PremiumButton>
                                    </div>
                                }
                            />
                            <JobDialog 
                                drivers={drivers} 
                                vehicles={vehicles} 
                                customers={customers}
                                routes={routes}
                                subcontractors={subcontractors}
                                canViewIncome={canViewIncome}
                                canViewExpense={canViewExpense}
                                canAssign={canAssign}
                                canDelete={canDelete}
                                trigger={
                                    <button className="flex items-center gap-2 bg-primary text-foreground px-6 py-2.5 h-11 rounded-xl font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all shadow-lg active:scale-95 group whitespace-nowrap">
                                        <Plus size={16} className="group-hover:rotate-90 transition-transform duration-300" strokeWidth={3} />
                                        {t('planning.new_job')}
                                    </button>
                                }
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Tactical Statistics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                    label={t('planning.stats_total')}
                    value={calculatedStats.total} 
                    icon={<Zap size={18} />}
                    color="primary"
                />
                <StatCard 
                    label={t('planning.stats_pending')}
                    value={calculatedStats.pending} 
                    icon={<Clock size={18} />}
                    color="yellow"
                />
                <StatCard 
                    label={t('planning.stats_in_progress')}
                    value={calculatedStats.inProgress} 
                    icon={<Truck size={18} />}
                    color="blue"
                />
                <StatCard 
                    label={t('planning.stats_delivered')}
                    value={calculatedStats.delivered} 
                    icon={<CheckCircle2 size={18} />}
                    color="green"
                />
            </div>

            {/* Main Content Area */}
            <motion.div variants={item} className="relative z-10 min-h-[500px]">
                {view === 'kanban' ? (
                    <KanbanBoard 
                        jobs={filteredTodayJobs}
                        drivers={drivers}
                        vehicles={vehicles}
                        customers={customers}
                        routes={routes}
                        subcontractors={subcontractors}
                        canViewIncome={canViewIncome}
                        canViewExpense={canViewExpense}
                        canAssign={canAssign}
                        canDelete={canDelete}
                    />
                ) : (
                    <JobGrid 
                        jobs={filteredJobs} 
                        drivers={drivers}
                        vehicles={vehicles}
                        customers={customers}
                        routes={routes}
                        subcontractors={subcontractors}
                        canViewIncome={canViewIncome}
                        canViewExpense={canViewExpense}
                        canAssign={canAssign}
                        canDelete={canDelete}
                    />
                )}
            </motion.div>
        </motion.div>
    )
}

function StatCard({ label, value, icon, color }: { label: string, value: number, icon: React.ReactNode, color: 'primary' | 'yellow' | 'blue' | 'green' }) {
    const { t } = useLanguage()
    const colorMap = {
        primary: "text-primary bg-primary/10 border-primary/20",
        yellow: "text-amber-500 bg-amber-500/10 border-amber-500/20",
        blue: "text-blue-500 bg-blue-500/10 border-blue-500/20",
        green: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
    }

    return (
        <motion.div 
            variants={item}
            className="bg-muted/40 backdrop-blur-md border border-border/5 p-4 rounded-xl relative overflow-hidden group hover:bg-muted transition-all duration-500"
        >
            <div className={cn("absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity", colorMap[color])}>
                {icon}
            </div>
            <div className="relative z-10">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] mb-1">{label}</p>
                <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-foreground tracking-tighter italic">{value}</span>
                    <span className="text-muted-foreground text-[10px] font-bold font-black uppercase tracking-widest">{t('common.units')}</span>
                </div>
            </div>
            <div className={cn("absolute bottom-0 left-0 h-0.5 w-0 group-hover:w-full transition-all duration-700", 
                color === 'primary' ? 'bg-primary' : 
                color === 'yellow' ? 'bg-amber-500' : 
                color === 'blue' ? 'bg-blue-500' : 'bg-emerald-500'
            )} />
        </motion.div>
    )
}

