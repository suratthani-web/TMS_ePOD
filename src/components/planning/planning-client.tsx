"use client"

import { useState, useMemo } from "react"
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
    Download
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
import { useRouter } from "next/navigation"
import { useRealtime } from "@/hooks/useRealtime"
import { RealtimeIndicator } from "@/components/ui/realtime-indicator"
import { useLanguage } from "@/components/providers/language-provider"
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
    publishAllDrafts: (date: string, branchId?: string) => Promise<{ success: boolean, error: any, jobsCount?: number }>
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
    const [publishing, setPublishing] = useState(false)
    const [templateCustomerId, setTemplateCustomerId] = useState<string>("")
    const { t } = useLanguage()

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
            "เส้นทาง": "R-001",
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

        // Align drivers and vehicles by mapping
        const matchedPairs: { driver?: Driver; vehicle?: Vehicle }[] = []
        const usedDriverIds = new Set<string>()
        const usedVehiclePlates = new Set<string>()

        // 1. Match by driver.Vehicle_Plate first
        filteredDrivers.forEach(d => {
            if (d.Vehicle_Plate) {
                const matchedVehicle = filteredVehicles.find(v => v.Vehicle_Plate === d.Vehicle_Plate)
                if (matchedVehicle) {
                    matchedPairs.push({ driver: d, vehicle: matchedVehicle })
                    usedDriverIds.add(d.Driver_ID)
                    usedVehiclePlates.add(matchedVehicle.Vehicle_Plate)
                }
            }
        })

        // 2. Match by vehicle.Driver_ID next for remaining
        filteredVehicles.forEach(v => {
            if (v.Driver_ID && !usedVehiclePlates.has(v.Vehicle_Plate)) {
                const matchedDriver = filteredDrivers.find(d => d.Driver_ID === v.Driver_ID && !usedDriverIds.has(d.Driver_ID))
                if (matchedDriver) {
                    matchedPairs.push({ driver: matchedDriver, vehicle: v })
                    usedDriverIds.add(matchedDriver.Driver_ID)
                    usedVehiclePlates.add(v.Vehicle_Plate)
                }
            }
        })

        // 3. Collect remaining unmapped drivers
        const remainingDrivers = filteredDrivers.filter(d => !usedDriverIds.has(d.Driver_ID))
        // 4. Collect remaining unmapped vehicles
        const remainingVehicles = filteredVehicles.filter(v => !usedVehiclePlates.has(v.Vehicle_Plate))

        // 5. Align remaining drivers and vehicles side-by-side
        const maxRemaining = Math.max(remainingDrivers.length, remainingVehicles.length)
        for (let i = 0; i < maxRemaining; i++) {
            matchedPairs.push({
                driver: remainingDrivers[i],
                vehicle: remainingVehicles[i]
            })
        }

        const maxRows = Math.max(filteredRoutes.length, matchedPairs.length)
        const dataSheetContent = []

        for (let i = 0; i < maxRows; i++) {
            const r = filteredRoutes[i]
            const pair = matchedPairs[i]
            const d = pair?.driver
            const v = pair?.vehicle
            
            dataSheetContent.push({
                "ชื่อเส้นทาง (Route Name)": r?.Route_Name || "",
                " ": "", // Spacer
                "รหัสคนขับ (Driver ID)": d?.Driver_ID || "",
                "ชื่อคนขับ (Driver Name)": d?.Driver_Name || "",
                "  ": "", // Spacer
                "ทะเบียนรถ (Plate)": v?.Vehicle_Plate || "",
                "ประเภทรถ (Type)": v?.Vehicle_Type || ""
            })
        }

        const ws2 = utils.json_to_sheet(dataSheetContent)
        
        // Auto-size columns for DATA sheet to make it readable
        const wscols = [
            {wch: 30}, // ชื่อเส้นทาง (Route Name)
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

    const filteredJobs = useMemo(() => {
        if (view === 'requests') {
            return requestedJobs
        }
        return todayJobs.filter(j => j.Job_Status !== 'Requested')
    }, [todayJobs, requestedJobs, view])

    const requestCount = requestedJobs.length

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
                                groupingLabel="จัดกลุ่มใบสั่งซื้อ (Group SO by Car/Driver)"
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
                    value={stats.total} 
                    icon={<Zap size={18} />}
                    color="primary"
                />
                <StatCard 
                    label={t('planning.stats_pending')}
                    value={stats.pending} 
                    icon={<Clock size={18} />}
                    color="yellow"
                />
                <StatCard 
                    label={t('planning.stats_in_progress')}
                    value={stats.inProgress} 
                    icon={<Truck size={18} />}
                    color="blue"
                />
                <StatCard 
                    label={t('planning.stats_delivered')}
                    value={stats.delivered} 
                    icon={<CheckCircle2 size={18} />}
                    color="green"
                />
            </div>

            {/* Main Content Area */}
            <motion.div variants={item} className="relative z-10 min-h-[500px]">
                {view === 'kanban' ? (
                    <KanbanBoard 
                        jobs={todayJobs}
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

