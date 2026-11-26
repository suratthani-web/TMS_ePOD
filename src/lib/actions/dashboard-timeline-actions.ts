"use server"

import { createAdminClient } from "@/utils/supabase/server"
import { getCustomerId, getUserBranchId, isAdmin, isSuperAdmin } from "@/lib/permissions"
import { todayTH } from "@/lib/utils/date-th"

export interface TimelineDriver {
  Driver_ID: string
  Driver_Name: string
  Vehicle_Plate: string | null
  Vehicle_Type: string | null
  Active_Status: string | null
  Branch_ID: string | null
  Image_Url: string | null
  isUnassigned?: boolean
}

export interface TimelineJob {
  Job_ID: string
  Job_Status: string | null
  Plan_Date: string | null
  Pickup_Date: string | null
  Delivery_Date: string | null
  Scheduled_Pickup_Time?: string | null
  Scheduled_Delivery_Time?: string | null
  Customer_ID: string | null
  Customer_Name: string | null
  Route_Name: string | null
  Vehicle_Type: string | null
  Origin_Location: string | null
  Dest_Location: string | null
  Driver_ID: string | null
  Driver_Name: string | null
  Vehicle_Plate: string | null
  Actual_Pickup_Time: string | null
  Actual_Delivery_Time: string | null
  Branch_ID: string | null
  Total_Drop: number | null
  Created_At: string | null
  Cargo_Type: string | null
  Notes: string | null
  original_origins_json: string | null
  original_destinations_json: string | null
  Sub_ID: string | null
  Verification_Status: string | null
  Est_Distance_KM: number | null
}

export interface DriverTimelineData {
  date: string
  drivers: TimelineDriver[]
  jobs: TimelineJob[]
  cancelledCount: number
}

// Guaranteed base columns on Jobs_Main in TMS_ePOD
const TIMELINE_JOB_BASE_COLUMNS = [
  "Job_ID",
  "Job_Status",
  "Plan_Date",
  "Pickup_Date",
  "Delivery_Date",
  "Customer_ID",
  "Customer_Name",
  "Route_Name",
  "Vehicle_Type",
  "Origin_Location",
  "Dest_Location",
  "Driver_ID",
  "Driver_Name",
  "Vehicle_Plate",
  "Actual_Pickup_Time",
  "Actual_Delivery_Time",
  "Branch_ID",
  "Total_Drop",
  "Created_At",
  "Cargo_Type",
  "Notes",
  "original_origins_json",
  "original_destinations_json",
  "Sub_ID",
  "Verification_Status",
  "Est_Distance_KM",
].join(", ")

// Extended columns when Scheduled_Pickup_Time / Scheduled_Delivery_Time migration is applied
const TIMELINE_JOB_EXTENDED_COLUMNS = `${TIMELINE_JOB_BASE_COLUMNS}, Scheduled_Pickup_Time, Scheduled_Delivery_Time`

const UNASSIGNED_DRIVER_ID = "__UNASSIGNED__"

function parseCustomerIds(value?: string | null): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "All")
}

function isValidIsoDate(value?: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

export async function getDriverTimelineData(params: {
  date: string
  branchId?: string
  customerId?: string
}): Promise<DriverTimelineData> {
  const targetDate = isValidIsoDate(params?.date) ? params.date.trim() : todayTH()

  try {
    const [isSuper, isAdminUser, userBranchId, sessionCustomerId] = await Promise.all([
      isSuperAdmin(),
      isAdmin(),
      getUserBranchId(),
      getCustomerId(),
    ])

    // Strict tenant/branch authorization guard
    if (!sessionCustomerId && !isSuper && !isAdminUser && (!userBranchId || userBranchId === "All")) {
      return { date: targetDate, drivers: [], jobs: [], cancelledCount: 0 }
    }

    const effectiveCustomerIds = sessionCustomerId
      ? [sessionCustomerId]
      : parseCustomerIds(params.customerId)

    const effectiveBranchId = sessionCustomerId
      ? undefined
      : !isSuper
        ? userBranchId && userBranchId !== "All"
          ? userBranchId
          : undefined
        : params.branchId && params.branchId !== "All"
          ? params.branchId
          : undefined

    const supabase = createAdminClient()

    const runJobsQuery = async (selectColumns: string) => {
      let query = supabase
        .from("Jobs_Main")
        .select(selectColumns)
        .or(
          `Plan_Date.eq.${targetDate},and(Plan_Date.is.null,Delivery_Date.eq.${targetDate}),and(Plan_Date.is.null,Pickup_Date.like.${targetDate}%)`
        )

      if (effectiveCustomerIds.length === 1) {
        query = query.eq("Customer_ID", effectiveCustomerIds[0])
      } else if (effectiveCustomerIds.length > 1) {
        query = query.in("Customer_ID", effectiveCustomerIds)
      }

      if (effectiveBranchId) {
        query = query.eq("Branch_ID", effectiveBranchId)
      }

      return query.order("Created_At", { ascending: true }).limit(500)
    }

    // Try extended columns (includes Scheduled_Pickup_Time / Scheduled_Delivery_Time);
    // fall back to guaranteed base schema columns if absent.
    let jobsResult = await runJobsQuery(TIMELINE_JOB_EXTENDED_COLUMNS)
    if (jobsResult.error) {
      jobsResult = await runJobsQuery(TIMELINE_JOB_BASE_COLUMNS)
    }

    const rawJobs = (jobsResult.data ?? []) as unknown as TimelineJob[]
    let cancelledCount = 0
    const activeJobs: TimelineJob[] = []

    for (const job of rawJobs) {
      const status = (job.Job_Status || "").trim()
      if (status === "Cancelled") {
        cancelledCount += 1
        continue
      }
      activeJobs.push(job)
    }

    // Fetch active drivers for admins/staff (customers only see drivers on their own jobs)
    const driverMap = new Map<string, TimelineDriver>()

    if (!sessionCustomerId) {
      const runDriversQuery = async (selectCols: string) => {
        let driverQuery = supabase
          .from("Master_Drivers")
          .select(selectCols)
          .eq("Active_Status", "Active")

        if (effectiveBranchId) {
          driverQuery = driverQuery.eq("Branch_ID", effectiveBranchId)
        }

        return driverQuery.order("Driver_Name", { ascending: true }).limit(500)
      }

      let driverRes = await runDriversQuery(
        "Driver_ID, Driver_Name, Vehicle_Plate, Vehicle_Type, Active_Status, Branch_ID, Image_Url"
      )
      if (driverRes.error) {
        driverRes = await runDriversQuery(
          "Driver_ID, Driver_Name, Vehicle_Plate, Vehicle_Type, Active_Status, Branch_ID"
        )
      }

      const masterDrivers = (driverRes.data ?? []) as unknown as Array<
        Partial<TimelineDriver> & { Driver_ID?: string | null }
      >

      for (const drv of masterDrivers) {
        if (!drv.Driver_ID) continue
        driverMap.set(drv.Driver_ID, {
          Driver_ID: drv.Driver_ID,
          Driver_Name: drv.Driver_Name || drv.Driver_ID,
          Vehicle_Plate: drv.Vehicle_Plate || null,
          Vehicle_Type: drv.Vehicle_Type || null,
          Active_Status: drv.Active_Status || "Active",
          Branch_ID: drv.Branch_ID || null,
          Image_Url: drv.Image_Url || null,
        })
      }
    }

    // Merge drivers appearing in the day's jobs so no job is ever orphaned,
    // and collect unassigned jobs into a dedicated top row.
    let hasUnassignedJobs = false

    for (const job of activeJobs) {
      const drvId = (job.Driver_ID || "").trim()
      if (!drvId || drvId.toLowerCase() === "unassigned") {
        hasUnassignedJobs = true
        continue
      }
      if (!driverMap.has(drvId)) {
        driverMap.set(drvId, {
          Driver_ID: drvId,
          Driver_Name: job.Driver_Name || drvId,
          Vehicle_Plate: job.Vehicle_Plate || null,
          Vehicle_Type: job.Vehicle_Type || null,
          Active_Status: "Active",
          Branch_ID: job.Branch_ID || null,
          Image_Url: null,
        })
      } else {
        const existing = driverMap.get(drvId)!
        if (!existing.Vehicle_Plate && job.Vehicle_Plate) {
          existing.Vehicle_Plate = job.Vehicle_Plate
        }
      }
    }

    const sortedDrivers = Array.from(driverMap.values()).sort((a, b) =>
      a.Driver_Name.localeCompare(b.Driver_Name, "th")
    )

    if (hasUnassignedJobs) {
      sortedDrivers.unshift({
        Driver_ID: UNASSIGNED_DRIVER_ID,
        Driver_Name: "รอจัดคนขับ (Unassigned)",
        Vehicle_Plate: null,
        Vehicle_Type: null,
        Active_Status: "Unassigned",
        Branch_ID: effectiveBranchId || null,
        Image_Url: null,
        isUnassigned: true,
      })
    }

    return {
      date: targetDate,
      drivers: sortedDrivers,
      jobs: activeJobs,
      cancelledCount,
    }
  } catch (error) {
    console.error("[getDriverTimelineData] Failed to load timeline data:", error)
    return {
      date: targetDate,
      drivers: [],
      jobs: [],
      cancelledCount: 0,
    }
  }
}
