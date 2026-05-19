import { getJobById, getAllJobs } from "@/lib/supabase/jobs"
import { getDriverById, getAllDriversFromTable } from "@/lib/supabase/drivers"
import { getVehicleByPlate, getAllVehiclesFromTable } from "@/lib/supabase/vehicles"
import { getFinancialStats, getJobCountSummary } from "@/lib/supabase/financial-analytics"
import { getAllCustomers } from "@/lib/supabase/customers"
import { getDamageReports } from "@/lib/supabase/damage-reports"
import { getDriverLeaves } from "@/lib/supabase/driver-leaves"
import { getAllRepairTickets, getRepairTicketStats, getPendingRepairTickets } from "@/lib/supabase/maintenance"
import { getFuelAnalytics } from "@/lib/supabase/fuel-analytics"
import { getFleetHealthAlerts } from "@/lib/supabase/fleet-health"
import { getWorkforceAnalytics } from "@/lib/supabase/workforce-analytics"
import { createAdminClient } from '@/utils/supabase/server'

/**
 * Tool Executors - all system data accessible to the AI
 */
export const aiToolExecutors: Record<string, Function> = {
  // ---- JOBS ----
  search_jobs: async (args: { query?: string, status?: string }) => {
    const results = await getAllJobs(1, 20, args.query || '', args.status)
    return results.map(j => ({
        id: j.Job_ID,
        status: j.Job_Status,
        customer: j.Customer_Name,
        driver: j.Driver_Name,
        plate: j.Vehicle_Plate,
        route: j.Route_Name,
        planDate: j.Plan_Date
    }))
  },

  get_job_details: async (args: { jobId: string }) => {
    const job = await getJobById(args.jobId)
    if (!job) return { error: "Job not found" }
    return job
  },

  // Uses admin client directly — no session/cookie dependency
  get_today_summary: async (args: { branchId?: string, customerId?: string }) => {
    const supabase = createAdminClient()
    const targetDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
    
    let finalBranchId = args.branchId     // If branchId is a name (e.g. "SKN"), look up its actual ID in Master_Branches
    if (args.branchId && args.branchId !== 'All' && args.branchId.toUpperCase() !== 'HQ') {
        const { data: branchData } = await supabase
            .from('Master_Branches')
            .select('Branch_ID, Branch_Name')
            .or(`Branch_ID.ilike.%${args.branchId}%,Branch_Name.ilike.%${args.branchId}%`)
            .limit(1)
        
        if (branchData && branchData.length > 0) {
            finalBranchId = branchData[0].Branch_ID
            console.log(`[Today Summary] Mapped "${args.branchId}" to real Branch_ID: ${finalBranchId}`)
        }
    }

    let query = supabase
        .from('Jobs_Main')
        .select('Job_ID, Job_Status, Customer_Name, Driver_Name, Route_Name, Branch_ID, Customer_ID', { count: 'exact' })
        .eq('Plan_Date', targetDate)

    // Filter by Mapped Branch ID OR Literal String (to catch manual Supabase edits)
    if (finalBranchId && finalBranchId !== 'All' && finalBranchId.toUpperCase() !== 'HQ') {
        if (finalBranchId !== args.branchId) {
            // If we found a mapping (e.g. SKN -> 5), search for both 5 and "SKN"
            query = query.or(`Branch_ID.eq.${finalBranchId},Branch_ID.ilike.%${args.branchId}%`)
        } else {
            query = query.ilike('Branch_ID', `%${finalBranchId}%`)
        }
    }
    
    // Filter by Customer
    if (args.customerId) {
        query = query.eq('Customer_ID', args.customerId)
    }

    const { data: jobs, error } = await query.order('Created_At', { ascending: false })
    
    if (error) {
        console.error('[Today Summary] Query error:', error.message)
        return { stats: { active: 0, completed: 0, cancelled: 0, pending: 0 }, todayJobCount: 0, jobs: [] }
    }

    const allJobs = jobs || []
    
    // Exact mapping based on Dashboard screenshots
    const ACTIVE_STATUS = ['In Progress', 'In Transit', 'Picked Up', 'กำลังโหลด', 'ระหว่างขนส่ง', 'กำลังดำเนินการ']
    const COMPLETED_STATUS = ['Completed', 'Delivered', 'Complete', 'เสร็จสิ้น', 'สำเร็จ', 'ส่งงานแล้ว']
    const PENDING_STATUS = ['New', 'Pending', 'Requested', 'รอรับบริการ', 'รอดำเนินการ', 'รอคนขับ', 'ยืนยันงาน']
    const CANCELLED_STATUS = ['Cancelled', 'Cancel', 'ยกเลิก']

    const active = allJobs.filter(j => ACTIVE_STATUS.includes(j.Job_Status || '')).length
    const completed = allJobs.filter(j => COMPLETED_STATUS.includes(j.Job_Status || '')).length
    const pending = allJobs.filter(j => PENDING_STATUS.includes(j.Job_Status || '')).length
    const cancelled = allJobs.filter(j => CANCELLED_STATUS.includes(j.Job_Status || '')).length
    
    // Count "Others" to ensure total matches (14 - known)
    const other = allJobs.length - (active + completed + pending + cancelled)
    
    const statusBreakdown = allJobs.reduce((acc: Record<string,number>, j) => {
        const s = j.Job_Status || 'Unknown'
        acc[s] = (acc[s] || 0) + 1
        return acc
    }, {})
    
    return {
        stats: { active, completed, pending, cancelled, other },
        todayJobCount: allJobs.length,
        statusBreakdown,
        jobs: allJobs.slice(0, 5).map(j => ({ id: j.Job_ID, customer: j.Customer_Name, status: j.Job_Status, driver: j.Driver_Name }))
    }
  },

  // ---- DRIVERS ----
  get_driver_info: async (args: { nameOrId: string }) => {
    let driver = await getDriverById(args.nameOrId)
    if (!driver) {
        const all = await getAllDriversFromTable()
        driver = all.find(d => 
            d.Driver_Name?.toLowerCase().includes(args.nameOrId.toLowerCase()) || 
            d.Driver_ID === args.nameOrId
        ) || null
    }
    return driver || { error: "Driver not found" }
  },

  get_all_drivers: async () => {
    const drivers = await getAllDriversFromTable()
    return drivers.map(d => ({
        id: d.Driver_ID,
        name: d.Driver_Name,
        phone: d.Mobile_No,
        plate: d.Vehicle_Plate,
        status: d.Status,
        branch: d.Branch_ID
    }))
  },

  // ---- VEHICLES ----
  get_vehicle_info: async (args: { plate: string }) => {
    const vehicle = await getVehicleByPlate(args.plate)
    return vehicle || { error: "Vehicle not found" }
  },

  get_all_vehicles: async () => {
    const vehicles = await getAllVehiclesFromTable()
    return vehicles.map(v => ({
        plate: v.Vehicle_Plate,
        brand: v.Brand,
        model: v.Model,
        type: v.Vehicle_Type,
        status: v.Status,
        mileage: v.Current_Mileage
    }))
  },

  // ---- FINANCIAL ----
  get_financial_summary: async (args: { branchId?: string, startDate?: string, endDate?: string }) => {
    const stats = await getFinancialStats(args.startDate, args.endDate, args.branchId)
    return {
        revenue: stats.revenue,
        cost: stats.cost?.total,
        netProfit: stats.netProfit,
        margin: stats.profitMargin
    }
  },
  get_job_count_summary: async (args: { branchId?: string, startDate?: string, endDate?: string }) => {
    return await getJobCountSummary(args.startDate, args.endDate, args.branchId)
  },

  // ---- CUSTOMERS ----
  get_customers: async (args: { query?: string }) => {
    const customers = await getAllCustomers(1, 20, args.query || '')
    return customers.map((c: any) => ({
        id: c.Customer_ID,
        name: c.Customer_Name,
        contact: c.Contact_Person,
        phone: c.Phone_No,
        branch: c.Branch_ID
    }))
  },

  // ---- MAINTENANCE / REPAIR ----
  get_maintenance_stats: async () => {
    const stats = await getRepairTicketStats()
    return stats
  },

  get_pending_repairs: async () => {
    const tickets = await getPendingRepairTickets()
    return tickets.map((t: any) => ({
        id: t.Ticket_ID,
        vehicle: t.Vehicle_Plate,
        problem: t.Problem_Description,
        status: t.Status,
        reportedAt: t.Reported_At
    }))
  },

  get_all_repairs: async (args: { plate?: string, status?: string }) => {
    const tickets = await getAllRepairTickets(1, 30, args.plate, args.status)
    return tickets.map((t: any) => ({
        id: t.Ticket_ID,
        vehicle: t.Vehicle_Plate,
        problem: t.Problem_Description,
        status: t.Status,
        driver: t.Driver_Name,
        reportedAt: t.Reported_At
    }))
  },

  // ---- FUEL ----
  get_fuel_analytics: async () => {
    const fuel = await getFuelAnalytics()
    return {
        totalFuelCost: fuel.totalFuelCost,
        totalLiters: fuel.totalLiters,
        avgPerTrip: fuel.avgFuelPerTrip,
        recentRecords: fuel.records?.slice(0, 5)
    }
  },

  // ---- FLEET HEALTH ----
  get_fleet_health: async () => {
    const alerts = await getFleetHealthAlerts()
    return alerts.map((a: any) => ({
        vehicle: a.Vehicle_Plate,
        alert: a.Alert_Type,
        severity: a.Severity,
        message: a.Message
    }))
  },

  // ---- DRIVER LEAVES ----
  get_driver_leaves: async (args: { month?: number, year?: number }) => {
    const leaves = await getDriverLeaves(args.month, args.year)
    return leaves.map((l: any) => ({
        driver: l.Driver_Name,
        type: l.Leave_Type,
        from: l.Date_From,
        to: l.Date_To,
        status: l.Status,
        reason: l.Reason
    }))
  },

  // ---- DAMAGE REPORTS ----
  get_damage_reports: async () => {
    const reports = await getDamageReports()
    return reports.map((r: any) => ({
        id: r.Report_ID,
        driver: r.Driver_Name,
        jobId: r.Job_ID,
        description: r.Description,
        status: r.Status,
        amount: r.Estimated_Cost
    }))
  },

  // ---- WORKFORCE ----
  get_workforce_analytics: async () => {
    const analytics = await getWorkforceAnalytics()
    return analytics
  },

  create_job: async (args: { 
    customerName: string, 
    planDate?: string, 
    routeName?: string, 
    price?: number, 
    notes?: string, 
    vehicleType?: string,
    status?: 'Draft' | 'New' | 'Assigned'
  }) => {
    const supabase = createAdminClient()
    // Default to 'New' if not specified, which sends it to the app (if driver assigned, usually dashboard uses 'Assigned')
    const finalStatus = args.status || 'New'
    
    const { data, error } = await supabase.from('Jobs_Main').insert({
        Customer_Name: args.customerName,
        Plan_Date: args.planDate || new Date().toISOString().split('T')[0],
        Route_Name: args.routeName,
        Price_Cust_Total: args.price,
        Notes: args.notes,
        Vehicle_Type: args.vehicleType,
        Job_Status: finalStatus
    }).select().single()
    return error ? { success: false, error: error.message } : { success: true, data }
  },

  notify_jobs_by_date: async (args: { day: number, month?: number, year?: number }) => {
    const supabase = createAdminClient()
    const now = new Date()
    const targetMonth = args.month || (now.getMonth() + 1)
    const targetYear = args.year || now.getFullYear()
    const targetDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(args.day).padStart(2, '0')}`
    
    // 1. Find all "Draft" jobs for this date
    const { data: draftJobs, error: jobError } = await supabase
        .from('Jobs_Main')
        .select('Job_ID, Driver_ID')
        .eq('Plan_Date', targetDate)
        .eq('Job_Status', 'Draft')

    if (jobError) return { success: false, error: jobError.message }
    if (!draftJobs?.length) return { success: false, error: `ไม่พบงานที่เป็นสถานะ "Draft" ในวันที่ ${targetDate} ครับ` }

    // 2. Update Draft -> Assigned (if driver exists) or New (if no driver)
    // This makes the jobs appear in the driver's mobile app immediately.
    
    // Batch update for those with drivers -> Assigned
    await supabase
        .from('Jobs_Main')
        .update({ Job_Status: 'Assigned' })
        .eq('Plan_Date', targetDate)
        .eq('Job_Status', 'Draft')
        .not('Driver_ID', 'is', null)

    // Batch update for those without drivers -> New
    await supabase
        .from('Jobs_Main')
        .update({ Job_Status: 'New' })
        .eq('Plan_Date', targetDate)
        .eq('Job_Status', 'Draft')
        .is('Driver_ID', null)

    return { 
        success: true, 
        message: `ปล่อยงาน (Draft -> Live) สำเร็จ ${draftJobs.length} รายการสำหรับวันที่ ${targetDate} เรียบร้อยครับ`,
        targetDate 
    }
  },

  create_fuel_log: async (args: {
    plate: string,
    liters: number,
    price: number,
    odometer?: number,
    station?: string
  }) => {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('Fuel_Logs').insert({
        Vehicle_Plate: args.plate,
        Liters: args.liters,
        Price_Total: args.price,
        Odometer: args.odometer,
        Station_Name: args.station,
        Date_Time: new Date().toISOString()
    }).select().single()
    return error ? { success: false, error: error.message } : { success: true, data }
  },

  create_damage_report: async (args: {
    jobId: string,
    description: string,
    estimatedCost?: number
  }) => {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('Damage_Reports').insert({
        Job_ID: args.jobId,
        Description: args.description,
        Estimated_Cost: args.estimatedCost,
        Status: 'Pending',
        Created_At: new Date().toISOString()
    }).select().single()
    return error ? { success: false, error: error.message } : { success: true, data }
  },
}

/**
 * Gemini Tool Definitions (Function Declarations)
 * These allow Gemini to understand what each function does and what parameters it needs.
 */
export const geminiToolDefinitions = [
    {
        name: "get_today_summary",
        description: "ดึงข้อมูลสรุปงานประจำวัน เช่น จำนวนงานที่กำลังวิ่ง, งานที่เสร็จแล้ว, งานรอดำเนินการ",
        parameters: {
            type: "object",
            properties: {
                branchId: { type: "string", description: "รหัสสาขา หรือชื่อสาขา (เช่น SKN, BKK)" },
                customerId: { type: "string", description: "รหัสลูกค้า" }
            }
        }
    },
    {
        name: "search_jobs",
        description: "ค้นหารายการงานในระบบตามคำค้นหาหรือสถานะ",
        parameters: {
            type: "object",
            properties: {
                query: { type: "string", description: "คำค้นหา เช่น ชื่อลูกค้า หรือเลขงาน" },
                status: { type: "string", description: "สถานะงานที่ต้องการค้นหา" }
            }
        }
    },
    {
        name: "get_job_details",
        description: "ดึงรายละเอียดเชิงลึกของงานหนึ่งรายการด้วยรหัสงาน (Job ID)",
        parameters: {
            type: "object",
            properties: {
                jobId: { type: "string", description: "รหัสงาน เช่น JOB-20240101-001" }
            },
            required: ["jobId"]
        }
    },
    {
        name: "create_job",
        description: "สร้างใบงานใหม่เข้าระบบ (ใช้เมื่อลูกค้าสั่งงาน หรือดึงข้อมูลจากไฟล์สั่งซื้อ)",
        parameters: {
            type: "object",
            properties: {
                customerName: { type: "string", description: "ชื่อลูกค้า" },
                planDate: { type: "string", description: "วันที่วางแผนงาน (YYYY-MM-DD)" },
                routeName: { type: "string", description: "ชื่อเส้นทางหรือจุดส่งของ" },
                price: { type: "number", description: "ราคาค่าขนส่ง" },
                notes: { type: "string", description: "หมายเหตุเพิ่มเติม" },
                vehicleType: { type: "string", description: "ประเภทรถที่ต้องการ (เช่น 4W, 6W, 10W)" }
            },
            required: ["customerName"]
        }
    },
    {
        name: "notify_jobs_by_date",
        description: "แจ้งเตือนงานให้คนขับทุกคนในวันที่ระบุ ผ่านทาง LINE (ใช้เมื่อต้องการส่งงานที่ Draft ไว้ให้คนขับ)",
        parameters: {
            type: "object",
            properties: {
                day: { type: "number", description: "วันที่ต้องการแจ้งงาน (ตัวเลข 1-31)" },
                month: { type: "number", description: "เดือน (ถ้าไม่ระบุจะใช้เดือนปัจจุบัน)" },
                year: { type: "number", description: "ปี (ถ้าไม่ระบุจะใช้ปีปัจจุบัน)" }
            },
            required: ["day"]
        }
    },
    {
        name: "get_financial_summary",
        description: "สรุปรายได้ กำไร และต้นทุน (ใช้ได้เฉพาะแอดมิน)",
        parameters: {
            type: "object",
            properties: {
                branchId: { type: "string", description: "รหัสสาขา" }
            }
        }
    },
    {
        name: "get_all_drivers",
        description: "ดึงรายชื่อคนขับทั้งหมดและสถานะปัจจุบัน",
        parameters: { type: "object", properties: {} }
    },
    {
        name: "get_all_vehicles",
        description: "ดึงข้อมูลรถทั้งหมดในระบบและประเภทรถ",
        parameters: { type: "object", properties: {} }
    },
    {
        name: "get_pending_repairs",
        description: "รายการรถที่รอซ่อมหรือแจ้งซ่อมค้างอยู่",
        parameters: { type: "object", properties: {} }
    },
    {
        name: "get_fuel_analytics",
        description: "วิเคราะห์การใช้น้ำมันและค่าใช้จ่ายน้ำมันรวม",
        parameters: { type: "object", properties: {} }
    }
]
