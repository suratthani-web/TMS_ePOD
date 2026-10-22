import { getJobById, getAllJobs } from "@/lib/supabase/jobs"
import { todayTH } from "@/lib/utils/date-th"
import { transitionBulkJobStatus } from "@/services/job-status-machine"
import { getDriverById, getAllDriversFromTable } from "@/lib/supabase/drivers"
import { getVehicleByPlate, getAllVehiclesFromTable } from "@/lib/supabase/vehicles"
import { getFinancialStats, getJobCountSummary, getVehicleUtilizationSummary } from "@/lib/supabase/financial-analytics"
import { getAllCustomers } from "@/lib/supabase/customers"
import { getDamageReports } from "@/lib/supabase/damage-reports"
import { getDriverLeaves } from "@/lib/supabase/driver-leaves"
import { getAllRepairTickets, getRepairTicketStats, getPendingRepairTickets } from "@/lib/supabase/maintenance"
import { getFuelAnalytics } from "@/lib/supabase/fuel-analytics"
import { getFleetHealthAlerts } from "@/lib/supabase/fleet-health"
import { getWorkforceAnalytics } from "@/lib/supabase/workforce-analytics"
import { createAdminClient } from '@/utils/supabase/server'
import { fetchAllRows } from '@/lib/supabase/analytics-helpers'
import { scheduleFuelCycleSync } from '@/lib/fuel/fuel-cycles'
import { geocodeAddress } from '@/lib/ai/geocoding'
import { logAction, type ActionRef } from '@/lib/ai/audit-log'

/**
 * Tool Executors - all system data accessible to the AI
 */
interface DBJob { Job_ID?: string; Job_Status?: string; Customer_Name?: string; Driver_Name?: string; Vehicle_Plate?: string; Route_Name?: string; Plan_Date?: string; }
interface DBDriver { Driver_ID?: string; Driver_Name?: string; Mobile_No?: string; Vehicle_Plate?: string; Status?: string; Branch_ID?: string | number; }
interface DBVehicle { Vehicle_Plate?: string; Brand?: string; Model?: string; Vehicle_Type?: string; Status?: string; Current_Mileage?: number; }
interface DBCustomer { Customer_ID?: string; Customer_Name?: string; Contact_Person?: string; Phone_No?: string; Branch_ID?: string | number; }
interface DBRepairTicket { Ticket_ID?: string; Vehicle_Plate?: string; Problem_Description?: string; Status?: string; Driver_Name?: string; Reported_At?: string; }
interface DBHealthAlert { Vehicle_Plate?: string; Alert_Type?: string; Severity?: string; Message?: string; }
interface DBDriverLeave { Driver_Name?: string; Leave_Type?: string; Date_From?: string; Date_To?: string; Status?: string; Reason?: string; }
interface DBDamageReport { Report_ID?: string; Driver_Name?: string; Job_ID?: string; Description?: string; Status?: string; Estimated_Cost?: number; }

type AIToolExecutor = {
  bivarianceHack(args?: Record<string, unknown>): LooseToolResult | Promise<LooseToolResult>
}["bivarianceHack"]
type LooseToolResult = number & {
  [key: string]: LooseToolResult
} & {
  length: number
  forEach(callbackfn: (value: never, index: number, array: never[]) => void): void
  slice(start?: number, end?: number): LooseToolResult[]
  toLocaleString(): string
  toFixed(fractionDigits?: number): string
}

export const aiToolExecutors = {
  // ---- JOBS ----
  search_jobs: async (args: { query?: string, status?: string }) => {
    const results = await getAllJobs(1, 20, args.query || '', args.status)
    return (results.data || []).map((row: unknown) => {
        const j = row as DBJob;
        return {
            id: j.Job_ID,
            status: j.Job_Status,
            customer: j.Customer_Name,
            driver: j.Driver_Name,
            plate: j.Vehicle_Plate,
            route: j.Route_Name,
            planDate: j.Plan_Date
        }
    })
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

    const active = allJobs.filter((row: unknown) => ACTIVE_STATUS.includes((row as DBJob).Job_Status || '')).length
    const completed = allJobs.filter((row: unknown) => COMPLETED_STATUS.includes((row as DBJob).Job_Status || '')).length
    const pending = allJobs.filter((row: unknown) => PENDING_STATUS.includes((row as DBJob).Job_Status || '')).length
    const cancelled = allJobs.filter((row: unknown) => CANCELLED_STATUS.includes((row as DBJob).Job_Status || '')).length
    
    // Count "Others" to ensure total matches (14 - known)
    const other = allJobs.length - (active + completed + pending + cancelled)
    
    const statusBreakdown = allJobs.reduce((acc: Record<string,number>, row: unknown) => {
        const j = row as DBJob;
        const s = j.Job_Status || 'Unknown'
        acc[s] = (acc[s] || 0) + 1
        return acc
    }, {})
    
    return {
        stats: { active, completed, pending, cancelled, other },
        todayJobCount: allJobs.length,
        statusBreakdown,
        jobs: allJobs.slice(0, 5).map((row: unknown) => {
            const j = row as DBJob;
            return { id: j.Job_ID, customer: j.Customer_Name, status: j.Job_Status, driver: j.Driver_Name }
        })
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
    return drivers.map((row: unknown) => {
        const d = row as DBDriver;
        return {
            id: d.Driver_ID,
            name: d.Driver_Name,
            phone: d.Mobile_No,
            plate: d.Vehicle_Plate,
            status: d.Status,
            branch: d.Branch_ID
        }
    })
  },

  // ---- VEHICLES ----
  get_vehicle_info: async (args: { plate: string }) => {
    const vehicle = await getVehicleByPlate(args.plate)
    return vehicle || { error: "Vehicle not found" }
  },

  get_all_vehicles: async () => {
    const vehicles = await getAllVehiclesFromTable()
    return vehicles.map((row: unknown) => {
        const v = row as DBVehicle;
        return {
            plate: v.Vehicle_Plate,
            brand: v.Brand,
            model: v.Model,
            type: v.Vehicle_Type,
            status: v.Status,
            mileage: v.Current_Mileage
        }
    })
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
  get_vehicle_utilization_summary: async (args: { branchId?: string, startDate?: string, endDate?: string }) => {
    return await getVehicleUtilizationSummary(args.startDate, args.endDate, args.branchId)
  },

  // ---- CUSTOMERS ----
  get_customers: async (args: { query?: string }) => {
    const customers = await getAllCustomers(1, 20, args.query || '')
    return (customers.data || []).map((row: unknown) => {
        const c = row as DBCustomer;
        return {
            id: c.Customer_ID,
            name: c.Customer_Name,
            contact: c.Contact_Person,
            phone: c.Phone_No,
            branch: c.Branch_ID
        }
    })
  },

  // ---- MAINTENANCE / REPAIR ----
  get_maintenance_stats: async () => {
    const stats = await getRepairTicketStats()
    return stats
  },

  get_pending_repairs: async () => {
    const tickets = await getPendingRepairTickets()
    return tickets.map((row: unknown) => {
        const t = row as DBRepairTicket;
        return {
            id: t.Ticket_ID,
            vehicle: t.Vehicle_Plate,
            problem: t.Problem_Description,
            status: t.Status,
            reportedAt: t.Reported_At
        }
    })
  },

  get_all_repairs: async (args: { plate?: string, status?: string }) => {
    const tickets = await getAllRepairTickets(1, 30, args.plate, args.status)
    return (tickets.data || []).map((row: unknown) => {
        const t = row as DBRepairTicket;
        return {
            id: t.Ticket_ID,
            vehicle: t.Vehicle_Plate,
            problem: t.Problem_Description,
            status: t.Status,
            driver: t.Driver_Name,
            reportedAt: t.Reported_At
        }
    })
  },

  // ---- FUEL ----
  get_fuel_analytics: async () => {
    // Map to getFuelAnalytics' ACTUAL return shape. The old code read
    // totalFuelCost/avgFuelPerTrip/records — fields that don't exist — so the
    // assistant always saw undefined and reported "no fuel data".
    const fuel = (await getFuelAnalytics()) as {
        totalLiters?: number; totalCost?: number; totalLogs?: number;
        avgCostPerLiter?: number; avgKmPerLiter?: number;
        vehicleBreakdown?: unknown[]; monthlyTrends?: unknown[]; anomalies?: unknown[];
    }
    return {
        totalFuelCost: fuel.totalCost ?? 0,
        totalLiters: fuel.totalLiters ?? 0,
        totalLogs: fuel.totalLogs ?? 0,
        avgCostPerLiter: fuel.avgCostPerLiter ?? 0,
        avgKmPerLiter: fuel.avgKmPerLiter ?? 0,
        topVehicles: fuel.vehicleBreakdown?.slice(0, 10) ?? [],
        monthlyTrends: fuel.monthlyTrends ?? [],
        anomalies: fuel.anomalies?.slice(0, 5) ?? [],
    }
  },

  // ---- FLEET HEALTH ----
  get_fleet_health: async () => {
    const alerts = await getFleetHealthAlerts()
    return alerts.map((row: unknown) => {
        const a = row as DBHealthAlert;
        return {
            vehicle: a.Vehicle_Plate,
            alert: a.Alert_Type,
            severity: a.Severity,
            message: a.Message
        }
    })
  },

  // ---- DRIVER LEAVES ----
  get_driver_leaves: async (args: { month?: number, year?: number }) => {
    const leaves = await getDriverLeaves(args.month, args.year)
    return leaves.map((row: unknown) => {
        const l = row as DBDriverLeave;
        return {
            driver: l.Driver_Name,
            type: l.Leave_Type,
            from: l.Date_From,
            to: l.Date_To,
            status: l.Status,
            reason: l.Reason
        }
    })
  },

  // ---- DAMAGE REPORTS ----
  get_damage_reports: async () => {
    const reports = await getDamageReports()
    return reports.map((row: unknown) => {
        const r = row as DBDamageReport;
        return {
            id: r.Report_ID,
            driver: r.Driver_Name,
            jobId: r.Job_ID,
            description: r.Description,
            status: r.Status,
            amount: r.Estimated_Cost
        }
    })
  },

  // ---- WORKFORCE ----
  get_workforce_analytics: async () => {
    const analytics = await getWorkforceAnalytics()
    return analytics
  },

  // ---- TMS DEEP INTELLIGENCE & DYNAMIC DATABASE QUERY ----
  query_tms_database: async (args: {
    table: string,
    select?: string,
    filters?: Array<{ column: string, operator: string, value: unknown }>,
    orderBy?: { column: string, ascending?: boolean },
    limit?: number
  }) => {
    const allowedTables = [
      'Jobs_Main', 'Fuel_Logs', 'Master_Vehicles', 'Master_Drivers', 
      'Master_Customers', 'Master_Branches', 'Maintenance_Tickets', 
      'Billing_Notes', 'Damage_Reports', 'Driver_Leaves'
    ]
    if (!allowedTables.includes(args.table)) {
      return { error: `Table '${args.table}' is not accessible. Allowed tables: ${allowedTables.join(', ')}` }
    }
    const supabase = createAdminClient()
    const selectCols = args.select || '*'
    let query = supabase.from(args.table).select(selectCols)

    if (Array.isArray(args.filters)) {
      for (const f of args.filters) {
        if (!f.column || f.operator === undefined) continue
        switch (f.operator) {
          case 'eq': query = query.eq(f.column, f.value); break
          case 'neq': query = query.neq(f.column, f.value); break
          case 'gt': query = query.gt(f.column, f.value); break
          case 'gte': query = query.gte(f.column, f.value); break
          case 'lt': query = query.lt(f.column, f.value); break
          case 'lte': query = query.lte(f.column, f.value); break
          case 'like': query = query.like(f.column, `%${f.value}%`); break
          case 'ilike': query = query.ilike(f.column, `%${f.value}%`); break
          case 'in': if (Array.isArray(f.value)) query = query.in(f.column, f.value); break
          case 'is': query = query.is(f.column, f.value); break
        }
      }
    }

    if (args.orderBy && args.orderBy.column) {
      query = query.order(args.orderBy.column, { ascending: args.orderBy.ascending ?? false })
    }

    const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100)
    query = query.limit(limit)

    const { data, error } = await query
    if (error) {
      return { error: error.message }
    }
    return { count: data?.length || 0, data: data || [] }
  },

  get_fuel_efficiency_report: async (args: { vehiclePlate?: string, startDate?: string, endDate?: string, branchId?: string }) => {
    const supabase = createAdminClient()
    // Page past the 1000-row cap so totals reflect the whole filtered range
    // (the old .limit(100) only ever summed the 100 most-recent logs).
    const logs = await fetchAllRows<Record<string, any>>(() => {
      let query = supabase.from('Fuel_Logs').select('*').order('Date_Time', { ascending: false })
      if (args.vehiclePlate) query = query.eq('Vehicle_Plate', args.vehiclePlate)
      if (args.branchId && args.branchId !== 'All') query = query.eq('Branch_ID', args.branchId)
      if (args.startDate) query = query.gte('Date_Time', `${args.startDate}T00:00:00`)
      if (args.endDate) query = query.lte('Date_Time', `${args.endDate}T23:59:59`)
      return query
    })

    const totalLiters = (logs || []).reduce((s, l) => s + (l.Liters || 0), 0)
    const totalCost = (logs || []).reduce((s, l) => s + (l.Price_Total || 0), 0)
    const avgPricePerLiter = totalLiters > 0 ? +(totalCost / totalLiters).toFixed(2) : 0
    
    const byVehicle: Record<string, { count: number, totalLiters: number, totalCost: number, stations: string[] }> = {}
    for (const l of logs || []) {
      const plate = l.Vehicle_Plate || 'ไม่ระบุ'
      if (!byVehicle[plate]) byVehicle[plate] = { count: 0, totalLiters: 0, totalCost: 0, stations: [] }
      byVehicle[plate].count++
      byVehicle[plate].totalLiters = +(byVehicle[plate].totalLiters + (l.Liters || 0)).toFixed(2)
      byVehicle[plate].totalCost = +(byVehicle[plate].totalCost + (l.Price_Total || 0)).toFixed(2)
      if (l.Station_Name && !byVehicle[plate].stations.includes(l.Station_Name)) {
        byVehicle[plate].stations.push(l.Station_Name)
      }
    }
    
    return {
      totalLogs: logs?.length || 0,
      totalLiters: +totalLiters.toFixed(2),
      totalCost: +totalCost.toFixed(2),
      avgPricePerLiter,
      vehicleBreakdown: byVehicle,
      recentLogs: (logs || []).slice(0, 10).map(l => ({
        date: l.Date_Time,
        plate: l.Vehicle_Plate,
        liters: l.Liters,
        total: l.Price_Total,
        odometer: l.Odometer,
        station: l.Station_Name
      }))
    }
  },

  get_customer_insights: async (args: { customerNameOrId: string, startDate?: string, endDate?: string }) => {
    const supabase = createAdminClient()
    let query = supabase.from('Jobs_Main').select('Job_ID, Plan_Date, Customer_Name, Customer_ID, Route_Name, Price_Cust_Total, Cost_Driver_Total, Job_Status, Origin_Location, Dest_Location')
      .or(`Customer_Name.ilike.%${args.customerNameOrId}%,Customer_ID.ilike.%${args.customerNameOrId}%`)
      .order('Plan_Date', { ascending: false })
      
    if (args.startDate) query = query.gte('Plan_Date', args.startDate)
    if (args.endDate) query = query.lte('Plan_Date', args.endDate)
    
    const { data: jobs, error } = await query.limit(200)
    if (error) return { error: error.message }
    
    const totalJobs = jobs?.length || 0
    const totalRevenue = (jobs || []).reduce((s, j) => s + (Number(j.Price_Cust_Total) || 0), 0)
    const totalCost = (jobs || []).reduce((s, j) => s + (Number(j.Cost_Driver_Total) || 0), 0)
    const netProfit = totalRevenue - totalCost
    
    const routeCounts: Record<string, number> = {}
    const statusCounts: Record<string, number> = {}
    for (const j of jobs || []) {
      const r = j.Route_Name || `${j.Origin_Location || '-'} -> ${j.Dest_Location || '-'}`
      routeCounts[r] = (routeCounts[r] || 0) + 1
      const s = j.Job_Status || 'Unknown'
      statusCounts[s] = (statusCounts[s] || 0) + 1
    }
    
    return {
      customer: args.customerNameOrId,
      totalJobs,
      totalRevenue,
      totalCost,
      netProfit,
      margin: totalRevenue > 0 ? +((netProfit / totalRevenue) * 100).toFixed(1) : 0,
      statusBreakdown: statusCounts,
      topRoutes: Object.entries(routeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([route, count]) => ({ route, count })),
      recentJobs: (jobs || []).slice(0, 5)
    }
  },

  get_driver_performance: async (args: { driverNameOrId?: string, startDate?: string, endDate?: string }) => {
    const supabase = createAdminClient()
    let query = supabase.from('Jobs_Main').select('Job_ID, Plan_Date, Driver_Name, Driver_ID, Vehicle_Plate, Route_Name, Cost_Driver_Total, Job_Status')
      .order('Plan_Date', { ascending: false })
      
    if (args.driverNameOrId) {
      query = query.or(`Driver_Name.ilike.%${args.driverNameOrId}%,Driver_ID.ilike.%${args.driverNameOrId}%`)
    }
    if (args.startDate) query = query.gte('Plan_Date', args.startDate)
    if (args.endDate) query = query.lte('Plan_Date', args.endDate)
    
    const { data: jobs, error } = await query.limit(300)
    if (error) return { error: error.message }
    
    const byDriver: Record<string, { totalJobs: number, completed: number, active: number, totalPay: number, plates: string[] }> = {}
    for (const j of jobs || []) {
      const d = j.Driver_Name || 'ไม่ระบุคนขับ'
      if (!byDriver[d]) byDriver[d] = { totalJobs: 0, completed: 0, active: 0, totalPay: 0, plates: [] }
      byDriver[d].totalJobs++
      if (['Completed', 'Delivered', 'Verified', 'Billed', 'Paid'].includes(j.Job_Status || '')) {
        byDriver[d].completed++
      }
      if (['In Progress', 'In Transit', 'Picked Up', 'Assigned'].includes(j.Job_Status || '')) {
        byDriver[d].active++
      }
      byDriver[d].totalPay += (Number(j.Cost_Driver_Total) || 0)
      if (j.Vehicle_Plate && !byDriver[d].plates.includes(j.Vehicle_Plate)) {
        byDriver[d].plates.push(j.Vehicle_Plate)
      }
    }
    
    return {
      period: { from: args.startDate || 'all', to: args.endDate || 'all' },
      totalJobsRecorded: jobs?.length || 0,
      driverRankings: Object.entries(byDriver).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.completed - a.completed)
    }
  },

  get_driver_app_discipline: async (args: { driverNameOrId?: string, daysLookback?: number }) => {
    const supabase = createAdminClient()
    const days = Math.min(Math.max(Number(args.daysLookback) || 30, 1), 90)
    
    if (args.driverNameOrId) {
      const { data: drivers } = await supabase.from('Master_Drivers')
        .select('Driver_ID, Driver_Name')
        .or(`Driver_Name.ilike.%${args.driverNameOrId}%,Driver_ID.ilike.%${args.driverNameOrId}%`)
        .limit(1)
        
      if (!drivers || drivers.length === 0) {
        return { error: `ไม่พบข้อมูลคนขับ "${args.driverNameOrId}" ในระบบ` }
      }
      const d = drivers[0]
      const { calculateDriverAppDiscipline } = await import('@/services/app-discipline')
      const discipline = await calculateDriverAppDiscipline(d.Driver_ID, days)
      return {
        driverId: d.Driver_ID,
        driverName: d.Driver_Name,
        evaluationPeriodDays: days,
        ...discipline
      }
    } else {
      const { data: drivers } = await supabase.from('Master_Drivers')
        .select('Driver_ID, Driver_Name')
        .eq('Active_Status', 'Active')
        .limit(20)
        
      const { calculateDriverAppDiscipline } = await import('@/services/app-discipline')
      const results = []
      for (const d of drivers || []) {
        const discipline = await calculateDriverAppDiscipline(d.Driver_ID, days)
        if (discipline.totalEvaluatedJobs > 0) {
          results.push({
            driverId: d.Driver_ID,
            driverName: d.Driver_Name,
            ...discipline
          })
        }
      }
      return {
        evaluationPeriodDays: days,
        totalDriversEvaluated: results.length,
        rankings: results.sort((a, b) => b.score - a.score)
      }
    }
  },

  create_job: async (args: {
    customerName: string,
    planDate?: string,
    deliveryDate?: string,
    routeName?: string,
    origin?: string,
    destination?: string,
    price?: number,
    notes?: string,
    vehicleType?: string,
    driverName?: string,
    driverId?: string,
    vehiclePlate?: string,
    status?: 'Draft' | 'New' | 'Assigned',
    branchId?: string,
  }) => {
    const supabase = createAdminClient()
    const planDate = args.planDate || todayTH()

    // Guard: delivery date must not be before pickup/plan date.
    if (args.deliveryDate && args.deliveryDate < planDate) {
        return { success: false, error: `วันส่ง (${args.deliveryDate}) อยู่ก่อนวันรับ (${planDate}) ไม่ได้ครับ` }
    }

    // Resolve Customer_ID by name (best-effort) so the job links to the master
    let customerId: string | null = null
    if (args.customerName) {
        const { data: c } = await supabase
            .from('Master_Customers')
            .select('Customer_ID')
            .ilike('Customer_Name', args.customerName)
            .limit(1)
            .maybeSingle()
        customerId = c?.Customer_ID ?? null
    }

    // Resolve driver by id or name → carries their default plate/type/Sub_ID
    let driverId: string | null = null
    let driverName: string | null = null
    let plate: string | null = args.vehiclePlate || null
    let vehicleType: string | null = args.vehicleType || null
    let subId: string | null = null
    if (args.driverId || args.driverName) {
        let q = supabase.from('Master_Drivers')
            .select('Driver_ID, Driver_Name, Vehicle_Plate, Vehicle_Type, Sub_ID').limit(1)
        q = args.driverId ? q.eq('Driver_ID', args.driverId) : q.ilike('Driver_Name', `%${args.driverName}%`)
        const { data: d } = await q.maybeSingle()
        if (d) {
            driverId = d.Driver_ID
            driverName = d.Driver_Name
            plate = plate || d.Vehicle_Plate || null
            vehicleType = vehicleType || d.Vehicle_Type || null
            subId = d.Sub_ID || null
        }
    }

    // If a plate was given explicitly, pull its type/Sub_ID from the master
    if (args.vehiclePlate) {
        const { data: v } = await supabase.from('Master_Vehicles')
            .select('Vehicle_Type, Sub_ID').eq('Vehicle_Plate', args.vehiclePlate).limit(1).maybeSingle()
        if (v) {
            vehicleType = args.vehicleType || v.Vehicle_Type || vehicleType
            subId = subId || v.Sub_ID || null
        }
    }

    // A job with a driver defaults to "Assigned"; otherwise "New"
    const finalStatus = args.status || (driverId ? 'Assigned' : 'New')

    const routeName = args.routeName
        || (args.origin && args.destination ? `${args.origin} - ${args.destination}` : null)

    // Match the canonical Job_ID format used by the planning flow
    const jobId = `JOB-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`

    const { data, error } = await supabase.from('Jobs_Main').insert({
        Job_ID: jobId,
        Branch_ID: args.branchId || null,
        Customer_ID: customerId,
        Customer_Name: args.customerName,
        Plan_Date: planDate,
        Delivery_Date: args.deliveryDate || planDate,
        Route_Name: routeName,
        Origin_Location: args.origin || null,
        Dest_Location: args.destination || null,
        Price_Cust_Total: args.price ?? 0,
        Notes: args.notes || null,
        Driver_ID: driverId,
        Driver_Name: driverName,
        Vehicle_Plate: plate,
        Vehicle_Type: vehicleType || '4-Wheel',
        Sub_ID: subId,
        Job_Status: finalStatus,
        Created_At: new Date().toISOString(),
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

    // 2. Update Draft -> Assigned (if driver exists) or New (if no driver) using machine
    const withDriver = draftJobs.filter(j => j.Driver_ID).map(j => j.Job_ID)
    const withoutDriver = draftJobs.filter(j => !j.Driver_ID).map(j => j.Job_ID)

    if (withDriver.length > 0) {
        await transitionBulkJobStatus(withDriver, 'Assigned', { reason: 'AI Tool: notify_jobs_by_date' })
    }
    if (withoutDriver.length > 0) {
        await transitionBulkJobStatus(withoutDriver, 'New', { reason: 'AI Tool: notify_jobs_by_date' })
    }

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
    unitPrice?: number,
    odometer?: number,
    station?: string,
    dateTime?: string,
    photoUrl?: string,
    driverId?: string,
    branchId?: string,
    tripFillType?: 'end' | 'enroute',
  }) => {
    const supabase = createAdminClient()
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).replace(/-/g, '')
    const logId = `FUEL-${dateStr}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`

    let resolvedBranch = args.branchId || null
    if (!resolvedBranch && args.plate) {
      const { data: veh } = await supabase
        .from('Master_Vehicles')
        .select('Branch_ID')
        .eq('Vehicle_Plate', args.plate)
        .maybeSingle()
      if (veh?.Branch_ID) resolvedBranch = veh.Branch_ID
    }

    const { data, error } = await supabase.from('Fuel_Logs').insert({
        Log_ID: logId,
        Vehicle_Plate: args.plate,
        Liters: args.liters,
        Price_Total: args.price,
        Odometer: args.odometer ?? null,
        Station_Name: args.station || 'ปั๊มน้ำมัน',
        Date_Time: args.dateTime || new Date().toISOString(),
        Photo_Url: args.photoUrl || null,
        Driver_ID: args.driverId || null,
        Branch_ID: resolvedBranch,
        Trip_Fill_Type: args.tripFillType === 'enroute' ? 'enroute' : 'end',
        Status: 'Pending',
    }).select().single()
    if (!error) scheduleFuelCycleSync()

    if (!error && args.plate && args.odometer && args.odometer > 0) {
      try {
        const { data: veh } = await supabase
          .from('Master_Vehicles')
          .select('Current_Mileage')
          .eq('Vehicle_Plate', args.plate)
          .maybeSingle()
        const current = Number(veh?.Current_Mileage) || 0
        if (args.odometer > current) {
          await supabase
            .from('Master_Vehicles')
            .update({ Current_Mileage: Math.round(args.odometer) })
            .eq('Vehicle_Plate', args.plate)
        }
      } catch (e) {
        console.error('[Fuel Tool] Odometer sync failed:', e)
      }
    }

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

  // ---- CREATE DRIVER ----
  create_driver: async (args: {
    name: string,
    phone?: string,
    vehiclePlate?: string,
    vehicleType?: string,
    branchId?: string,
  }) => {
    const supabase = createAdminClient()
    const driverId = `DRV-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`
    const { data, error } = await supabase.from('Master_Drivers').insert({
        Driver_ID: driverId,
        Driver_Name: args.name,
        Mobile_No: args.phone || null,
        Role: 'Driver',
        Vehicle_Plate: args.vehiclePlate || null,
        Vehicle_Type: args.vehicleType || null,
        Active_Status: 'Active',
        Branch_ID: args.branchId || null,
    }).select().single()
    return error ? { success: false, error: error.message } : { success: true, data }
  },

  // ---- CREATE VEHICLE ----
  create_vehicle: async (args: {
    plate: string,
    vehicleType?: string,
    brand?: string,
    model?: string,
    subId?: string,
    branchId?: string,
  }) => {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('Master_Vehicles').insert({
        Vehicle_Plate: args.plate,
        Vehicle_Type: args.vehicleType || '4-Wheel',
        Brand: args.brand || null,
        Model: args.model || null,
        Sub_ID: args.subId || null,
        Active_Status: 'Active',
        Branch_ID: args.branchId || null,
    }).select().single()
    return error ? { success: false, error: error.message } : { success: true, data }
  },

  // ---- CREATE LOCATION (auto-geocode via Google) ----
  create_location: async (args: {
    name: string,
    address?: string,
    phone?: string,
    mapLink?: string,
    branchId?: string,
  }) => {
    const supabase = createAdminClient()

    // Resolve coordinates: prefer an explicit map link, else geocode name/address.
    let lat: number | null = null
    let lon: number | null = null
    const geoQuery = args.mapLink || args.address || args.name
    try {
        const geo = await geocodeAddress(geoQuery, args.address)
        if (geo) { lat = geo.lat; lon = geo.lng }
    } catch { /* leave null → flagged incomplete */ }

    const { data, error } = await supabase.from('Master_Locations').insert({
        Name: args.name,
        Lat: lat,
        Lon: lon,
        Phone: args.phone || null,
        Map_Link: args.mapLink || null,
        Address: args.address || null,
        Branch_ID: args.branchId || 'HQ',
        Is_Incomplete: lat === null,
    }).select().single()
    return error ? { success: false, error: error.message } : { success: true, data, geocoded: lat !== null }
  },

  // ---- CREATE CUSTOMER ----
  create_customer: async (args: {
    name: string,
    contactPerson?: string,
    phone?: string,
    address?: string,
    branchId?: string,
  }) => {
    const supabase = createAdminClient()
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const customerId = `CUST-${dateStr}-${Math.floor(Math.random() * 1000)}`
    const { data, error } = await supabase.from('Master_Customers').insert({
        Customer_ID: customerId,
        Customer_Name: args.name,
        Contact_Person: args.contactPerson || null,
        Phone: args.phone || null,
        Address: args.address || null,
        Branch_ID: args.branchId || 'HQ',
        Credit_Term: 30,
    }).select().single()
    return error ? { success: false, error: error.message } : { success: true, data }
  },

  // ---- ASSIGN DRIVER (มอบหมายงาน↔คนขับ/รถ) ----
  assign_driver: async (args: {
    jobId: string,
    driverName?: string,
    driverId?: string,
    vehiclePlate?: string,
  }) => {
    const supabase = createAdminClient()
    let driverId: string | null = null
    let driverName: string | null = null
    let plate: string | null = args.vehiclePlate || null
    let vehicleType: string | null = null
    let subId: string | null = null

    if (args.driverId || args.driverName) {
        let q = supabase.from('Master_Drivers')
            .select('Driver_ID, Driver_Name, Vehicle_Plate, Vehicle_Type, Sub_ID').limit(1)
        q = args.driverId ? q.eq('Driver_ID', args.driverId) : q.ilike('Driver_Name', `%${args.driverName}%`)
        const { data: d } = await q.maybeSingle()
        if (!d) return { success: false, error: `ไม่พบคนขับ "${args.driverName || args.driverId}"` }
        driverId = d.Driver_ID
        driverName = d.Driver_Name
        plate = plate || d.Vehicle_Plate || null
        vehicleType = d.Vehicle_Type || null
        subId = d.Sub_ID || null
    }

    const { data, error } = await supabase.from('Jobs_Main').update({
        Driver_ID: driverId,
        Driver_Name: driverName,
        Vehicle_Plate: plate,
        ...(vehicleType ? { Vehicle_Type: vehicleType } : {}),
        ...(subId ? { Sub_ID: subId } : {}),
        Job_Status: 'Assigned',
    }).eq('Job_ID', args.jobId).select().single()
    return error ? { success: false, error: error.message } : { success: true, data }
  },

  // ---- UPDATE JOB STATUS ----
  update_job_status: async (args: { jobId: string, status: string }) => {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('Jobs_Main')
        .update({ Job_Status: args.status })
        .eq('Job_ID', args.jobId).select().single()
    return error ? { success: false, error: error.message } : { success: true, data }
  },

  // ---- UPDATE JOB (แก้ราคา/วันที่/สถานที่/หมายเหตุ) ----
  update_job: async (args: {
    jobId: string,
    planDate?: string,
    deliveryDate?: string,
    price?: number,
    origin?: string,
    destination?: string,
    notes?: string,
  }) => {
    const supabase = createAdminClient()
    const patch: Record<string, unknown> = {}
    if (args.planDate != null) patch.Plan_Date = args.planDate
    if (args.deliveryDate != null) patch.Delivery_Date = args.deliveryDate
    if (args.price != null) patch.Price_Cust_Total = args.price
    if (args.origin != null) patch.Origin_Location = args.origin
    if (args.destination != null) patch.Dest_Location = args.destination
    if (args.notes != null) patch.Notes = args.notes
    if (Object.keys(patch).length === 0) return { success: false, error: 'ไม่มีข้อมูลที่จะแก้ไข' }

    // Guard: after applying the patch, delivery date must not precede plan date.
    if (args.planDate != null || args.deliveryDate != null) {
        const { data: cur } = await supabase.from('Jobs_Main')
            .select('Plan_Date, Delivery_Date').eq('Job_ID', args.jobId).maybeSingle()
        const finalPlan = args.planDate ?? cur?.Plan_Date
        const finalDelivery = args.deliveryDate ?? cur?.Delivery_Date
        if (finalPlan && finalDelivery && finalDelivery < finalPlan) {
            return { success: false, error: `วันส่ง (${finalDelivery}) อยู่ก่อนวันรับ (${finalPlan}) ไม่ได้ครับ` }
        }
    }

    const { data, error } = await supabase.from('Jobs_Main')
        .update(patch).eq('Job_ID', args.jobId).select().single()
    return error ? { success: false, error: error.message } : { success: true, data }
  },

  // ---- UPDATE DRIVER ----
  update_driver: async (args: {
    nameOrId: string,
    phone?: string,
    status?: string,
    vehiclePlate?: string,
  }) => {
    const supabase = createAdminClient()
    // Resolve target by Driver_ID or name.
    const { data: d } = await supabase.from('Master_Drivers')
        .select('Driver_ID')
        .or(`Driver_ID.eq.${args.nameOrId},Driver_Name.ilike.%${args.nameOrId}%`)
        .limit(1).maybeSingle()
    if (!d) return { success: false, error: `ไม่พบคนขับ "${args.nameOrId}"` }
    const patch: Record<string, unknown> = {}
    if (args.phone != null) patch.Mobile_No = args.phone
    if (args.status != null) patch.Active_Status = args.status
    if (args.vehiclePlate != null) patch.Vehicle_Plate = args.vehiclePlate
    if (Object.keys(patch).length === 0) return { success: false, error: 'ไม่มีข้อมูลที่จะแก้ไข' }
    const { data, error } = await supabase.from('Master_Drivers')
        .update(patch).eq('Driver_ID', d.Driver_ID).select().single()
    return error ? { success: false, error: error.message } : { success: true, data }
  },

  // ---- UPDATE VEHICLE ----
  update_vehicle: async (args: {
    plate: string,
    status?: string,
    vehicleType?: string,
    subId?: string,
  }) => {
    const supabase = createAdminClient()
    const patch: Record<string, unknown> = {}
    if (args.status != null) patch.Active_Status = args.status
    if (args.vehicleType != null) patch.Vehicle_Type = args.vehicleType
    if (args.subId != null) patch.Sub_ID = args.subId
    if (Object.keys(patch).length === 0) return { success: false, error: 'ไม่มีข้อมูลที่จะแก้ไข' }
    const { data, error } = await supabase.from('Master_Vehicles')
        .update(patch).eq('Vehicle_Plate', args.plate).select().single()
    return error ? { success: false, error: error.message } : { success: true, data }
  },
} as unknown as Record<string, AIToolExecutor>

/**
 * Write-tool registry — single source of truth for confirm UX + result text.
 *
 * Any tool listed here is a "write" action: the assistant must show a confirm
 * card/button before running it, and only roleId <= minRole may execute it.
 * Adding a new write tool = add an executor above + declaration below + an
 * entry here. The chat/LINE routes read this generically — no route edits.
 */
type WriteToolMeta = {
  confirmTitle: string
  minRole: number
  summarize: (a: Record<string, unknown>) => string
  formatSuccess: (data: Record<string, unknown>, result?: Record<string, unknown>) => string
  cancelMessage: string
  /** For create actions: how to locate the created row so it can be undone. */
  undoRef?: (data: Record<string, unknown>) => ActionRef | null
}

const S = (v: unknown) => (v === undefined || v === null || v === '') ? null : String(v)
const bullets = (...lines: (string | null)[]) => lines.filter(Boolean).join('\n')

export const writeToolMeta: Record<string, WriteToolMeta> = {
  create_job: {
    confirmTitle: 'ยืนยันการสร้างงานใหม่?',
    minRole: 5,
    summarize: (a) => bullets(
      `• ลูกค้า: ${S(a.customerName) ?? '-'}`,
      `• วันวางแผน: ${S(a.planDate) ?? 'วันนี้'}`,
      (S(a.origin) || S(a.destination)) ? `• เส้นทาง: ${S(a.origin) ?? '?'} → ${S(a.destination) ?? '?'}` : (S(a.routeName) ? `• เส้นทาง: ${S(a.routeName)}` : null),
      a.price != null ? `• ราคา: ฿${Number(a.price).toLocaleString()}` : null,
      S(a.driverName) ? `• คนขับ: ${S(a.driverName)}` : null,
      S(a.vehiclePlate) ? `• ทะเบียน: ${S(a.vehiclePlate)}` : null,
      S(a.vehicleType) ? `• ประเภทรถ: ${S(a.vehicleType)}` : null,
      S(a.notes) ? `• หมายเหตุ: ${S(a.notes)}` : null,
    ),
    formatSuccess: (d) => bullets(
      `✅ สร้างงานสำเร็จ`,
      `รหัสงาน: ${S(d.Job_ID) ?? '-'}`,
      `ลูกค้า: ${S(d.Customer_Name) ?? '-'}`,
      `วันวางแผน: ${S(d.Plan_Date) ?? '-'}`,
      S(d.Driver_Name) ? `คนขับ: ${S(d.Driver_Name)}` : null,
      S(d.Vehicle_Plate) ? `ทะเบียน: ${S(d.Vehicle_Plate)}` : null,
      S(d.Job_Status) ? `สถานะ: ${S(d.Job_Status)}` : null,
    ),
    cancelMessage: 'ยกเลิกแล้วครับ ไม่ได้สร้างงาน',
    undoRef: (d) => d.Job_ID ? { table: 'Jobs_Main', pk: { Job_ID: d.Job_ID } } : null,
  },
  create_driver: {
    confirmTitle: 'ยืนยันการเพิ่มคนขับใหม่?',
    minRole: 5,
    summarize: (a) => bullets(
      `• ชื่อคนขับ: ${S(a.name) ?? '-'}`,
      S(a.phone) ? `• เบอร์โทร: ${S(a.phone)}` : null,
      S(a.vehiclePlate) ? `• ทะเบียนประจำ: ${S(a.vehiclePlate)}` : null,
      S(a.vehicleType) ? `• ประเภทรถ: ${S(a.vehicleType)}` : null,
    ),
    formatSuccess: (d) => bullets(
      `✅ เพิ่มคนขับสำเร็จ`,
      `รหัส: ${S(d.Driver_ID) ?? '-'}`,
      `ชื่อ: ${S(d.Driver_Name) ?? '-'}`,
      S(d.Mobile_No) ? `เบอร์: ${S(d.Mobile_No)}` : null,
    ),
    cancelMessage: 'ยกเลิกแล้วครับ ไม่ได้เพิ่มคนขับ',
    undoRef: (d) => d.Driver_ID ? { table: 'Master_Drivers', pk: { Driver_ID: d.Driver_ID } } : null,
  },
  create_vehicle: {
    confirmTitle: 'ยืนยันการเพิ่มรถ/ทะเบียนใหม่?',
    minRole: 5,
    summarize: (a) => bullets(
      `• ทะเบียน: ${S(a.plate) ?? '-'}`,
      `• ประเภทรถ: ${S(a.vehicleType) ?? '4-Wheel'}`,
      S(a.brand) ? `• ยี่ห้อ: ${S(a.brand)}` : null,
      S(a.model) ? `• รุ่น: ${S(a.model)}` : null,
      S(a.subId) ? `• รถร่วม (Sub_ID): ${S(a.subId)}` : null,
    ),
    formatSuccess: (d) => bullets(
      `✅ เพิ่มรถสำเร็จ`,
      `ทะเบียน: ${S(d.Vehicle_Plate) ?? '-'}`,
      `ประเภท: ${S(d.Vehicle_Type) ?? '-'}`,
    ),
    cancelMessage: 'ยกเลิกแล้วครับ ไม่ได้เพิ่มรถ',
    undoRef: (d) => d.Vehicle_Plate ? { table: 'Master_Vehicles', pk: { Vehicle_Plate: d.Vehicle_Plate } } : null,
  },
  create_location: {
    confirmTitle: 'ยืนยันการเพิ่มสถานที่ใหม่?',
    minRole: 5,
    summarize: (a) => bullets(
      `• ชื่อสถานที่: ${S(a.name) ?? '-'}`,
      S(a.address) ? `• ที่อยู่: ${S(a.address)}` : null,
      S(a.mapLink) ? `• ลิงก์แผนที่: ${S(a.mapLink)}` : null,
      S(a.phone) ? `• เบอร์โทร: ${S(a.phone)}` : null,
      `\n(ระบบจะหาพิกัดให้อัตโนมัติด้วย Google Maps)`,
    ),
    formatSuccess: (d, r) => bullets(
      `✅ เพิ่มสถานที่สำเร็จ`,
      `ชื่อ: ${S(d.Name) ?? '-'}`,
      r?.geocoded ? `พิกัด: ${S(d.Lat)}, ${S(d.Lon)} ✓` : `⚠️ ยังหาพิกัดไม่ได้ — ระบบทำเครื่องหมายไว้ให้แก้ทีหลัง`,
    ),
    cancelMessage: 'ยกเลิกแล้วครับ ไม่ได้เพิ่มสถานที่',
    undoRef: (d) => d.Name ? { table: 'Master_Locations', pk: { Name: d.Name } } : null,
  },
  create_customer: {
    confirmTitle: 'ยืนยันการเพิ่มลูกค้าใหม่?',
    minRole: 5,
    summarize: (a) => bullets(
      `• ชื่อลูกค้า: ${S(a.name) ?? '-'}`,
      S(a.contactPerson) ? `• ผู้ติดต่อ: ${S(a.contactPerson)}` : null,
      S(a.phone) ? `• เบอร์โทร: ${S(a.phone)}` : null,
      S(a.address) ? `• ที่อยู่: ${S(a.address)}` : null,
    ),
    formatSuccess: (d) => bullets(
      `✅ เพิ่มลูกค้าสำเร็จ`,
      `รหัส: ${S(d.Customer_ID) ?? '-'}`,
      `ชื่อ: ${S(d.Customer_Name) ?? '-'}`,
    ),
    cancelMessage: 'ยกเลิกแล้วครับ ไม่ได้เพิ่มลูกค้า',
    undoRef: (d) => d.Customer_ID ? { table: 'Master_Customers', pk: { Customer_ID: d.Customer_ID } } : null,
  },
  create_fuel_log: {
    confirmTitle: 'ยืนยันการบันทึกเติมน้ำมัน?',
    minRole: 5,
    summarize: (a) => {
      const liters = a.liters != null ? Number(a.liters) : null
      const totalPrice = a.price != null ? Number(a.price) : null
      const unitPrice = a.unitPrice != null
        ? Number(a.unitPrice)
        : (totalPrice != null && liters != null && liters > 0 ? totalPrice / liters : null)

      return bullets(
        `• ทะเบียน: ${S(a.plate) ?? '-'}`,
        `• ปริมาณ: ${liters != null ? liters.toLocaleString() : '-'} ลิตร`,
        unitPrice != null ? `• ราคาต่อลิตร: ฿${unitPrice.toFixed(2)}` : null,
        `• ราคารวม: ฿${totalPrice != null ? totalPrice.toLocaleString() : '-'}`,
        S(a.station) ? `• ปั๊ม: ${S(a.station)}` : null,
        a.odometer != null ? `• เลขไมล์: ${Number(a.odometer).toLocaleString()}` : null,
        // วันที่เติมจากบิล (เผื่อส่งย้อนหลัง) — ถ้าอ่านจากบิลไม่ได้จะใช้วันนี้
        a.dateTime ? `• วันที่เติม: ${String(a.dateTime).slice(0, 10)} (จากบิล)` : `• วันที่เติม: ไม่พบบนบิล — จะใช้วันนี้`,
        a.photoUrl ? `• แนบรูปบิล: ✓ (เก็บในระบบแล้ว)` : null,
      )
    },
    formatSuccess: () => `✅ บันทึกการเติมน้ำมันเรียบร้อยครับ`,
    cancelMessage: 'ยกเลิกแล้วครับ ไม่ได้บันทึกน้ำมัน',
  },
  create_damage_report: {
    confirmTitle: 'ยืนยันการแจ้งเคลม/ความเสียหาย?',
    minRole: 5,
    summarize: (a) => bullets(
      `• งาน: ${S(a.jobId) ?? '-'}`,
      `• รายละเอียด: ${S(a.description) ?? '-'}`,
      a.estimatedCost != null ? `• มูลค่าประเมิน: ฿${Number(a.estimatedCost).toLocaleString()}` : null,
    ),
    formatSuccess: () => `✅ บันทึกรายการเคลมเรียบร้อยครับ`,
    cancelMessage: 'ยกเลิกแล้วครับ ไม่ได้บันทึกเคลม',
  },
  assign_driver: {
    confirmTitle: 'ยืนยันการมอบหมายคนขับ?',
    minRole: 5,
    summarize: (a) => bullets(
      `• งาน: ${S(a.jobId) ?? '-'}`,
      `• คนขับ: ${S(a.driverName) ?? S(a.driverId) ?? '-'}`,
      S(a.vehiclePlate) ? `• ทะเบียน: ${S(a.vehiclePlate)}` : null,
    ),
    formatSuccess: (d) => bullets(
      `✅ มอบหมายงานสำเร็จ`,
      `งาน: ${S(d.Job_ID) ?? '-'}`,
      `คนขับ: ${S(d.Driver_Name) ?? '-'}`,
      S(d.Vehicle_Plate) ? `ทะเบียน: ${S(d.Vehicle_Plate)}` : null,
      `สถานะ: ${S(d.Job_Status) ?? '-'}`,
    ),
    cancelMessage: 'ยกเลิกแล้วครับ ไม่ได้มอบหมายงาน',
  },
  update_job_status: {
    confirmTitle: 'ยืนยันการเปลี่ยนสถานะงาน?',
    minRole: 5,
    summarize: (a) => bullets(
      `• งาน: ${S(a.jobId) ?? '-'}`,
      `• สถานะใหม่: ${S(a.status) ?? '-'}`,
    ),
    formatSuccess: (d) => `✅ เปลี่ยนสถานะงาน ${S(d.Job_ID) ?? ''} เป็น "${S(d.Job_Status) ?? ''}" เรียบร้อยครับ`,
    cancelMessage: 'ยกเลิกแล้วครับ ไม่ได้เปลี่ยนสถานะ',
  },
  update_job: {
    confirmTitle: 'ยืนยันการแก้ไขงาน?',
    minRole: 5,
    summarize: (a) => bullets(
      `• งาน: ${S(a.jobId) ?? '-'}`,
      S(a.planDate) ? `• วันวางแผน: ${S(a.planDate)}` : null,
      S(a.deliveryDate) ? `• วันส่ง: ${S(a.deliveryDate)}` : null,
      a.price != null ? `• ราคา: ฿${Number(a.price).toLocaleString()}` : null,
      S(a.origin) ? `• ต้นทาง: ${S(a.origin)}` : null,
      S(a.destination) ? `• ปลายทาง: ${S(a.destination)}` : null,
      S(a.notes) ? `• หมายเหตุ: ${S(a.notes)}` : null,
    ),
    formatSuccess: (d) => `✅ แก้ไขงาน ${S(d.Job_ID) ?? ''} เรียบร้อยครับ`,
    cancelMessage: 'ยกเลิกแล้วครับ ไม่ได้แก้ไขงาน',
  },
  update_driver: {
    confirmTitle: 'ยืนยันการแก้ไขข้อมูลคนขับ?',
    minRole: 5,
    summarize: (a) => bullets(
      `• คนขับ: ${S(a.nameOrId) ?? '-'}`,
      S(a.phone) ? `• เบอร์ใหม่: ${S(a.phone)}` : null,
      S(a.status) ? `• สถานะ: ${S(a.status)}` : null,
      S(a.vehiclePlate) ? `• ทะเบียน: ${S(a.vehiclePlate)}` : null,
    ),
    formatSuccess: (d) => `✅ แก้ไขข้อมูลคนขับ ${S(d.Driver_Name) ?? ''} เรียบร้อยครับ`,
    cancelMessage: 'ยกเลิกแล้วครับ ไม่ได้แก้ไขคนขับ',
  },
  update_vehicle: {
    confirmTitle: 'ยืนยันการแก้ไขข้อมูลรถ?',
    minRole: 5,
    summarize: (a) => bullets(
      `• ทะเบียน: ${S(a.plate) ?? '-'}`,
      S(a.status) ? `• สถานะ: ${S(a.status)}` : null,
      S(a.vehicleType) ? `• ประเภทรถ: ${S(a.vehicleType)}` : null,
      S(a.subId) ? `• รถร่วม (Sub_ID): ${S(a.subId)}` : null,
    ),
    formatSuccess: (d) => `✅ แก้ไขข้อมูลรถ ${S(d.Vehicle_Plate) ?? ''} เรียบร้อยครับ`,
    cancelMessage: 'ยกเลิกแล้วครับ ไม่ได้แก้ไขรถ',
  },
}

/** Is this tool a write action requiring confirmation? */
export function isWriteTool(name: string): boolean {
  return name in writeToolMeta
}

/** Build the confirm-card payload the UI renders for a pending write action. */
export function buildPendingAction(name: string, args: Record<string, unknown>) {
  const meta = writeToolMeta[name]
  return {
    name,
    args,
    title: meta?.confirmTitle ?? 'ยืนยันการดำเนินการ?',
    summary: meta ? meta.summarize(args) : JSON.stringify(args),
    cancelMessage: meta?.cancelMessage ?? 'ยกเลิกแล้วครับ',
  }
}

/** Execute a confirmed write action and return a Thai result message. */
export async function executeWriteTool(
  name: string,
  args: Record<string, unknown>,
  roleId: number,
  ctx?: { actor?: string; channel?: 'chat' | 'line' },
): Promise<string> {
  const meta = writeToolMeta[name]
  if (!meta) return 'ไม่รู้จักคำสั่งนี้ครับ'
  if (roleId > meta.minRole) return '⛔ บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้ครับ'
  const executor = aiToolExecutors[name]
  if (!executor) return 'ไม่รู้จักคำสั่งนี้ครับ'

  const result = (await executor(args)) as unknown as Record<string, unknown>
  const success = !!result?.success
  const data = (result?.data as Record<string, unknown>) || {}
  const message = success
    ? meta.formatSuccess(data, result)
    : `❌ ทำรายการไม่สำเร็จ: ${result?.error || 'unknown error'}`

  await logAction({
    actor: ctx?.actor,
    channel: ctx?.channel,
    actionName: name,
    args,
    success,
    resultRef: success && meta.undoRef ? meta.undoRef(data) : null,
    message,
  })

  return message
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
                planDate: { type: "string", description: "วันที่วางแผนงาน (YYYY-MM-DD) ถ้าไม่ระบุใช้วันนี้" },
                deliveryDate: { type: "string", description: "วันที่ส่งของ (YYYY-MM-DD)" },
                routeName: { type: "string", description: "ชื่อเส้นทาง" },
                origin: { type: "string", description: "ต้นทาง/จุดรับของ" },
                destination: { type: "string", description: "ปลายทาง/จุดส่งของ" },
                price: { type: "number", description: "ราคาค่าขนส่ง" },
                notes: { type: "string", description: "หมายเหตุเพิ่มเติม" },
                vehicleType: { type: "string", description: "ประเภทรถที่ต้องการ (เช่น 4W, 6W, 10W)" },
                driverName: { type: "string", description: "ชื่อคนขับที่จะมอบหมาย" },
                vehiclePlate: { type: "string", description: "ทะเบียนรถ" }
            },
            required: ["customerName"]
        }
    },
    {
        name: "create_driver",
        description: "เพิ่มคนขับใหม่เข้าระบบ",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "ชื่อคนขับ" },
                phone: { type: "string", description: "เบอร์โทรศัพท์" },
                vehiclePlate: { type: "string", description: "ทะเบียนรถประจำตัว (ถ้ามี)" },
                vehicleType: { type: "string", description: "ประเภทรถ (เช่น 4W, 6W, 10W)" }
            },
            required: ["name"]
        }
    },
    {
        name: "create_vehicle",
        description: "เพิ่มรถ/ทะเบียนใหม่เข้าระบบ",
        parameters: {
            type: "object",
            properties: {
                plate: { type: "string", description: "ทะเบียนรถ" },
                vehicleType: { type: "string", description: "ประเภทรถ (เช่น 4W, 6W, 10W)" },
                brand: { type: "string", description: "ยี่ห้อรถ" },
                model: { type: "string", description: "รุ่นรถ" },
                subId: { type: "string", description: "รหัสรถร่วม (Sub_ID) ถ้าเป็นรถร่วม" }
            },
            required: ["plate"]
        }
    },
    {
        name: "create_location",
        description: "เพิ่มสถานที่/จุดรับส่งใหม่ (ระบบจะหาพิกัดให้อัตโนมัติด้วย Google Maps จากชื่อ/ที่อยู่/ลิงก์แผนที่)",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "ชื่อสถานที่" },
                address: { type: "string", description: "ที่อยู่เต็ม" },
                mapLink: { type: "string", description: "ลิงก์ Google Maps (ถ้ามี จะแม่นที่สุด)" },
                phone: { type: "string", description: "เบอร์โทรติดต่อ" }
            },
            required: ["name"]
        }
    },
    {
        name: "create_customer",
        description: "เพิ่มลูกค้าใหม่เข้าระบบ",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "ชื่อลูกค้า/บริษัท" },
                contactPerson: { type: "string", description: "ชื่อผู้ติดต่อ" },
                phone: { type: "string", description: "เบอร์โทรศัพท์" },
                address: { type: "string", description: "ที่อยู่" }
            },
            required: ["name"]
        }
    },
    {
        name: "assign_driver",
        description: "มอบหมายคนขับ (และรถ) ให้กับงาน แล้วตั้งสถานะเป็น Assigned",
        parameters: {
            type: "object",
            properties: {
                jobId: { type: "string", description: "รหัสงาน" },
                driverName: { type: "string", description: "ชื่อคนขับ" },
                driverId: { type: "string", description: "รหัสคนขับ" },
                vehiclePlate: { type: "string", description: "ทะเบียนรถ (ถ้าต้องการระบุเอง)" }
            },
            required: ["jobId"]
        }
    },
    {
        name: "update_job_status",
        description: "เปลี่ยนสถานะของงาน (เช่น New, Assigned, In Transit, Completed, Cancelled)",
        parameters: {
            type: "object",
            properties: {
                jobId: { type: "string", description: "รหัสงาน" },
                status: { type: "string", description: "สถานะใหม่" }
            },
            required: ["jobId", "status"]
        }
    },
    {
        name: "update_job",
        description: "แก้ไขรายละเอียดงาน (ราคา/วันที่/ต้นทาง/ปลายทาง/หมายเหตุ)",
        parameters: {
            type: "object",
            properties: {
                jobId: { type: "string", description: "รหัสงาน" },
                planDate: { type: "string", description: "วันวางแผน YYYY-MM-DD" },
                deliveryDate: { type: "string", description: "วันส่ง YYYY-MM-DD" },
                price: { type: "number", description: "ราคาลูกค้า (บาท)" },
                origin: { type: "string", description: "ต้นทาง" },
                destination: { type: "string", description: "ปลายทาง" },
                notes: { type: "string", description: "หมายเหตุ" }
            },
            required: ["jobId"]
        }
    },
    {
        name: "update_driver",
        description: "แก้ไขข้อมูลคนขับ (เบอร์โทร/สถานะ/ทะเบียนประจำ)",
        parameters: {
            type: "object",
            properties: {
                nameOrId: { type: "string", description: "ชื่อหรือรหัสคนขับ" },
                phone: { type: "string", description: "เบอร์โทรใหม่" },
                status: { type: "string", description: "สถานะ (Active/Inactive)" },
                vehiclePlate: { type: "string", description: "ทะเบียนรถประจำตัวใหม่" }
            },
            required: ["nameOrId"]
        }
    },
    {
        name: "update_vehicle",
        description: "แก้ไขข้อมูลรถ (สถานะ/ประเภท/รถร่วม)",
        parameters: {
            type: "object",
            properties: {
                plate: { type: "string", description: "ทะเบียนรถ" },
                status: { type: "string", description: "สถานะ (Active/Inactive)" },
                vehicleType: { type: "string", description: "ประเภทรถ" },
                subId: { type: "string", description: "รหัสรถร่วม (Sub_ID)" }
            },
            required: ["plate"]
        }
    },
    {
        name: "create_fuel_log",
        description: "บันทึกการเติมน้ำมันของรถ",
        parameters: {
            type: "object",
            properties: {
                plate: { type: "string", description: "ทะเบียนรถ" },
                liters: { type: "number", description: "จำนวนลิตร" },
                unitPrice: { type: "number", description: "ราคาต่อลิตร (บาท/ลิตร)" },
                price: { type: "number", description: "ราคารวม (บาท)" },
                odometer: { type: "number", description: "เลขไมล์" },
                station: { type: "string", description: "ชื่อปั๊ม" }
            },
            required: ["plate", "liters", "price"]
        }
    },
    {
        name: "create_damage_report",
        description: "บันทึกรายการเคลม/ความเสียหายของงาน",
        parameters: {
            type: "object",
            properties: {
                jobId: { type: "string", description: "รหัสงาน" },
                description: { type: "string", description: "รายละเอียดความเสียหาย" },
                estimatedCost: { type: "number", description: "มูลค่าประเมิน (บาท)" }
            },
            required: ["jobId", "description"]
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
    },
    {
        name: "query_tms_database",
        description: "คิวรี่ข้อมูลเชิงลึกจากตารางในระบบ TMS (Jobs_Main, Fuel_Logs, Master_Vehicles, Master_Drivers, Master_Customers, Maintenance_Tickets, Billing_Notes, Damage_Reports, Driver_Leaves)",
        parameters: {
            type: "object",
            properties: {
                table: { 
                    type: "string", 
                    description: "ชื่อตารางที่ต้องการคิวรี่ เช่น Jobs_Main, Fuel_Logs, Master_Vehicles, Master_Drivers, Master_Customers, Maintenance_Tickets, Billing_Notes, Damage_Reports" 
                },
                select: { type: "string", description: "คอลัมน์ที่ต้องการเลือก (เช่น 'Job_ID, Customer_Name, Price_Cust_Total' หรือ '*')" },
                filters: {
                    type: "array",
                    description: "เงื่อนไขการกรองข้อมูล",
                    items: {
                        type: "object",
                        properties: {
                            column: { type: "string", description: "ชื่อคอลัมน์" },
                            operator: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"], description: "ตัวดำเนินการ" },
                            value: { type: "string", description: "ค่าที่ต้องการกรอง" }
                        },
                        required: ["column", "operator", "value"]
                    }
                },
                orderBy: {
                    type: "object",
                    properties: {
                        column: { type: "string", description: "ชื่อคอลัมน์ที่ต้องการเรียงลำดับ" },
                        ascending: { type: "boolean", description: "true = น้อยไปมาก, false = มากไปน้อย" }
                    },
                    required: ["column"]
                },
                limit: { type: "number", description: "จำนวนแถวสูงสุด (ค่าเริ่มต้น 25, สูงสุด 100)" }
            },
            required: ["table"]
        }
    },
    {
        name: "get_fuel_efficiency_report",
        description: "ดึงรายงานประสิทธิภาพน้ำมัน (Liters, Price_Total, ปั๊มน้ำมัน, รายการเติม) เจาะจงตามทะเบียนรถหรือช่วงเวลา",
        parameters: {
            type: "object",
            properties: {
                vehiclePlate: { type: "string", description: "ทะเบียนรถ เช่น 3ฒว2502" },
                startDate: { type: "string", description: "วันที่เริ่มต้น YYYY-MM-DD" },
                endDate: { type: "string", description: "วันที่สิ้นสุด YYYY-MM-DD" },
                branchId: { type: "string", description: "รหัสสาขา เช่น URT, SKN, PTE" }
            }
        }
    },
    {
        name: "get_customer_insights",
        description: "วิเคราะห์ข้อมูลลูกค้า สถิติงาน รายได้ กำไร เส้นทางที่วิ่งบ่อย และสถานะงานล่าสุด",
        parameters: {
            type: "object",
            properties: {
                customerNameOrId: { type: "string", description: "ชื่อหรือรหัสลูกค้า" },
                startDate: { type: "string", description: "วันที่เริ่มต้น YYYY-MM-DD" },
                endDate: { type: "string", description: "วันที่สิ้นสุด YYYY-MM-DD" }
            },
            required: ["customerNameOrId"]
        }
    },
    {
        name: "get_driver_performance",
        description: "สรุปผลงานคนขับ จำนวนงานที่ส่งสำเร็จ งานที่กำลังวิ่ง ค่าเที่ยวสะสม และทะเบียนรถที่ขับ",
        parameters: {
            type: "object",
            properties: {
                driverNameOrId: { type: "string", description: "ชื่อหรือรหัสคนขับ (ถ้าไม่ใส่จะสรุปและจัดอันดับคนขับทุกคน)" },
                startDate: { type: "string", description: "วันที่เริ่มต้น YYYY-MM-DD" },
                endDate: { type: "string", description: "วันที่สิ้นสุด YYYY-MM-DD" }
            }
        }
    },
    {
        name: "get_driver_app_discipline",
        description: "ประเมินและจัดอันดับวินัยการใช้งานแอปของคนขับ (ตรวจจับการกดงานรวดเดียวตอนเย็น, งานค้างส่งข้ามวัน, ความสมบูรณ์ของรูปถ่ายและลายเซ็น ePOD)",
        parameters: {
            type: "object",
            properties: {
                driverNameOrId: { type: "string", description: "ชื่อหรือรหัสคนขับ (ถ้าไม่ระบุจะจัดอันดับคนขับทุกคน)" },
                daysLookback: { type: "number", description: "จำนวนวันที่ต้องการประเมินย้อนหลัง (เช่น 30 วัน)" }
            }
        }
    }
]

/**
 * Function declarations for the WRITE tools (everything in writeToolMeta),
 * fed to Gemini so it can trigger these actions. The chat route keeps its own
 * richer create_job declaration, so this list excludes create_job.
 */
export const writeToolDeclarations = geminiToolDefinitions.filter(
    (d) => (d.name in writeToolMeta) && d.name !== 'create_job'
)
