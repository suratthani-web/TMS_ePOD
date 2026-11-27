"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import {
  AlertCircle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  Loader2,
  MapPin,
  Package,
  Search,
  Truck,
  User,
  X,
} from "lucide-react"
import {
  getDriverTimelineData,
  type TimelineDriver,
  type TimelineJob,
} from "@/lib/actions/dashboard-timeline-actions"
import type { Job } from "@/lib/supabase/jobs"
import { EntityAvatar } from "@/components/ui/entity-avatar"
import { extractSoNumbers } from "@/lib/utils/so-helpers"
import { isDeliveredOrSettled, isInTransit } from "@/lib/constants/job-status"
import { TH_TZ, todayTH, timeTH } from "@/lib/utils/date-th"
import { cn } from "@/lib/utils"

interface DriverTimelineSchedulerProps {
  branchId?: string
  customerId?: string
  customerMode?: boolean
  initialJobs?: Job[]
}

type StatusBucket = "all" | "delayed" | "in_progress" | "completed" | "waiting"

type JobWithOptionalTimes = Job & {
  Scheduled_Pickup_Time?: string | null
  Scheduled_Delivery_Time?: string | null
  Actual_Pickup_Time?: string | null
  Actual_Delivery_Time?: string | null
}

interface PositionedJob {
  job: TimelineJob
  bucket: Exclude<StatusBucket, "all">
  startMin: number
  endMin: number
  visualStartMin: number
  visualEndMin: number
  hasExplicitSchedule: boolean
  isCarryOver: boolean
  origStartMin: number | null
  origEndMin: number | null
  plannedStartMin?: number | null
  plannedEndMin?: number | null
  actualStartMin?: number | null
  actualEndMin?: number | null
  lane: number
  soNumbers: string[]
}

interface ActivePopoverState {
  item: PositionedJob
  driver: TimelineDriver
  rect: { top: number; left: number; width: number; height: number }
  pinned: boolean
}

const UNASSIGNED_DRIVER_ID = "__UNASSIGNED__"
const MIN_BAR_MINUTES = 90 // 1.5h minimum width so short/point jobs stay clickable & readable
const LANE_HEIGHT = 34
const ROW_PADDING_Y = 8
const HOUR_TICKS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]

const BUCKET_STYLES: Record<
  Exclude<StatusBucket, "all">,
  {
    label: string
    barBg: string
    barBorder: string
    barText: string
    dotBg: string
    badgeBg: string
    progressPct: number
    progressColor: string
  }
> = {
  delayed: {
    label: "ล่าช้า / ค้างส่ง",
    barBg: "bg-rose-500 hover:bg-rose-600",
    barBorder: "border-rose-400/70",
    barText: "text-white",
    dotBg: "bg-rose-500",
    badgeBg: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
    progressPct: 60,
    progressColor: "bg-rose-500",
  },
  in_progress: {
    label: "กำลังดำเนินการ",
    barBg: "bg-blue-500 hover:bg-blue-600",
    barBorder: "border-blue-400/70",
    barText: "text-white",
    dotBg: "bg-blue-500",
    badgeBg: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
    progressPct: 55,
    progressColor: "bg-blue-500",
  },
  completed: {
    label: "สำเร็จแล้ว",
    barBg: "bg-emerald-500 hover:bg-emerald-600",
    barBorder: "border-emerald-400/70",
    barText: "text-white",
    dotBg: "bg-emerald-500",
    badgeBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    progressPct: 100,
    progressColor: "bg-emerald-500",
  },
  waiting: {
    label: "รอเริ่ม/ยังไม่รับงาน",
    barBg: "bg-slate-400/25 hover:bg-slate-400/35",
    barBorder: "border-slate-400/40",
    barText: "text-foreground",
    dotBg: "bg-slate-400",
    badgeBg: "bg-muted text-muted-foreground border-border",
    progressPct: 15,
    progressColor: "bg-slate-400",
  },
}

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T12:00:00+07:00`)
  if (Number.isNaN(d.getTime())) return todayTH()
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toLocaleDateString("en-CA", { timeZone: TH_TZ })
}

function formatThaiHeaderDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00+07:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TH_TZ,
  })
}

function formatShortThaiDayMonth(isoDate?: string | null): string {
  if (!isoDate) return ""
  const datePart = isoDate.slice(0, 10)
  const d = new Date(`${datePart}T12:00:00+07:00`)
  if (Number.isNaN(d.getTime())) return datePart
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: TH_TZ,
  })
}

function diffIsoDays(fromIso?: string | null, toIso?: string | null): number | null {
  if (!fromIso || !toIso) return null
  const a = new Date(`${fromIso.slice(0, 10)}T12:00:00+07:00`)
  const b = new Date(`${toIso.slice(0, 10)}T12:00:00+07:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

const CARRY_OVER_EXCLUDED_STATUSES = new Set([
  "completed",
  "delivered",
  "complete",
  "verified",
  "billed",
  "paid",
  "cancelled",
])

function isCarryOverJob(
  job: TimelineJob,
  isViewingToday: boolean,
  todayStr: string
): boolean {
  if (job.isCarryOver) return true
  if (!isViewingToday) return false
  const status = (job.Job_Status || "").trim()
  if (CARRY_OVER_EXCLUDED_STATUSES.has(status.toLowerCase()) || isDeliveredOrSettled(status)) {
    return false
  }
  return Boolean(job.Plan_Date && job.Plan_Date < todayStr)
}

function getNowMinutesBKK(): number {
  const hhmmss = timeTH()
  const [hh, mm] = hhmmss.split(":").map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return 0
  return hh * 60 + mm
}

function parseTimeToMinutes(raw?: string | null): number | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Pure HH:mm or HH:mm:ss (also accept HH.mm)
  const timeOnly = trimmed.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)(?::[0-5]\d)?$/)
  if (timeOnly) {
    return Number(timeOnly[1]) * 60 + Number(timeOnly[2])
  }

  // Date-only string YYYY-MM-DD has no time component
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null
  }

  // Timestamp with T or space
  if (trimmed.includes("T") || /\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(trimmed)) {
    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      const bkk = parsed.toLocaleTimeString("en-GB", {
        timeZone: TH_TZ,
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      })
      const [h, m] = bkk.split(":").map(Number)
      if (Number.isFinite(h) && Number.isFinite(m)) {
        return h * 60 + m
      }
    }
  }

  return null
}

function formatMinutesHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(totalMinutes)))
  if (clamped === 24 * 60) return "24:00"
  const hh = Math.floor(clamped / 60)
  const mm = clamped % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

function formatDurationTH(startMin: number, endMin: number): string {
  const diff = Math.max(0, Math.round(endMin - startMin))
  const h = Math.floor(diff / 60)
  const m = diff % 60
  if (h > 0 && m > 0) return `${h} ชม. ${m} นาที`
  if (h > 0) return `${h} ชม.`
  return `${m} นาที`
}

function cleanJobNotes(notes?: string | null): string {
  if (!notes) return ""
  return notes
    .replace(/\[?\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\]?/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function classifyJobBucket(
  job: TimelineJob,
  selectedDate: string,
  todayStr: string,
  nowMin: number
): Exclude<StatusBucket, "all"> {
  if (isCarryOverJob(job, selectedDate === todayStr, todayStr)) {
    return "delayed"
  }

  const status = (job.Job_Status || "").trim()

  if (isDeliveredOrSettled(status)) {
    return "completed"
  }

  if (status === "SOS" || status === "Failed" || status === "Rejected") {
    return "delayed"
  }

  // Past due delivery date (or past scheduled delivery time today) and not completed
  if (job.Delivery_Date && job.Delivery_Date < todayStr) {
    return "delayed"
  }
  if (!job.Delivery_Date && job.Plan_Date && job.Plan_Date < todayStr) {
    return "delayed"
  }
  if (selectedDate === todayStr && job.Delivery_Date === todayStr && job.Scheduled_Delivery_Time) {
    const schedEnd = parseTimeToMinutes(job.Scheduled_Delivery_Time)
    if (schedEnd !== null && nowMin > schedEnd) {
      return "delayed"
    }
  }

  if (isInTransit(status)) {
    return "in_progress"
  }

  return "waiting"
}

function formatTimeRangeCompact(startMin: number | null, endMin: number | null): string {
  const s = startMin !== null ? formatMinutesHHMM(startMin) : "--:--"
  const e = endMin !== null ? formatMinutesHHMM(endMin) : "--:--"
  return `${s} → ${e}`
}

function computeJobPosition(
  job: TimelineJob,
  bucket: Exclude<StatusBucket, "all">,
  selectedDate: string,
  todayStr: string,
  nowMin: number
): Omit<PositionedJob, "lane"> {
  const carryOver = isCarryOverJob(job, selectedDate === todayStr, todayStr)

  const actualStart = parseTimeToMinutes(job.Actual_Pickup_Time)
  const schedStart = parseTimeToMinutes(job.Scheduled_Pickup_Time)
  const pickupDateTime = parseTimeToMinutes(job.Pickup_Date)
  const plannedStartMin = schedStart ?? pickupDateTime

  const actualEnd = parseTimeToMinutes(job.Actual_Delivery_Time)
  const schedEnd = parseTimeToMinutes(job.Scheduled_Delivery_Time)
  const deliveryDateTime = parseTimeToMinutes(job.Delivery_Date)
  const plannedEndMin = schedEnd ?? deliveryDateTime

  const origStartMin = actualStart ?? plannedStartMin
  const origEndMin = actualEnd ?? plannedEndMin
  const hasExplicitSchedule = origStartMin !== null || origEndMin !== null

  if (carryOver) {
    const startMin = 0
    const endMin = Math.min(1440, Math.max(210, nowMin))
    return {
      job,
      bucket,
      startMin,
      endMin,
      visualStartMin: startMin,
      visualEndMin: endMin,
      hasExplicitSchedule,
      isCarryOver: true,
      origStartMin,
      origEndMin,
      plannedStartMin,
      plannedEndMin,
      actualStartMin: actualStart,
      actualEndMin: actualEnd,
      soNumbers: extractSoNumbers(job.original_destinations_json, job.Job_ID),
    }
  }

  const startMin = Math.max(0, Math.min(23 * 60 + 30, actualStart ?? plannedStartMin ?? 8 * 60))

  let endMin: number
  if (actualEnd !== null && actualEnd >= startMin) {
    endMin = Math.min(24 * 60, actualEnd)
  } else if (bucket === "in_progress" && selectedDate === todayStr) {
    endMin = Math.min(24 * 60, Math.max(nowMin, startMin + 90))
  } else if (bucket === "completed") {
    if (plannedEndMin !== null && plannedEndMin > startMin) {
      endMin = Math.min(24 * 60, plannedEndMin)
    } else if (selectedDate === todayStr && nowMin >= startMin) {
      endMin = Math.min(24 * 60, Math.max(startMin + 60, nowMin))
    } else {
      endMin = Math.min(24 * 60, startMin + 120)
    }
  } else if (plannedEndMin !== null && plannedEndMin > startMin) {
    endMin = Math.min(24 * 60, plannedEndMin)
  } else {
    endMin = Math.min(24 * 60, Math.max(17 * 60, startMin + 120))
  }

  const visualStartMin = startMin
  const visualEndMin = Math.min(24 * 60, Math.max(startMin + MIN_BAR_MINUTES, endMin))

  return {
    job,
    bucket,
    startMin,
    endMin,
    visualStartMin,
    visualEndMin,
    hasExplicitSchedule,
    isCarryOver: false,
    origStartMin,
    origEndMin,
    plannedStartMin,
    plannedEndMin,
    actualStartMin: actualStart,
    actualEndMin: actualEnd,
    soNumbers: extractSoNumbers(job.original_destinations_json, job.Job_ID),
  }
}

function mapInitialJobsToTimeline(jobs: JobWithOptionalTimes[] = []): {
  drivers: TimelineDriver[]
  jobs: TimelineJob[]
} {
  const today = todayTH()
  const filtered: TimelineJob[] = []
  const drvMap = new Map<string, TimelineDriver>()
  let hasUnassigned = false

  for (const j of jobs) {
    const plan = j.Plan_Date || ""
    const deliv = j.Delivery_Date || ""
    const pickup = j.Pickup_Date ? j.Pickup_Date.slice(0, 10) : ""
    if (plan !== today && !(!plan && (deliv === today || pickup === today))) {
      continue
    }
    if ((j.Job_Status || "").trim() === "Cancelled") continue

    filtered.push({
      Job_ID: j.Job_ID,
      Job_Status: j.Job_Status ?? null,
      Plan_Date: j.Plan_Date ?? null,
      Pickup_Date: j.Pickup_Date ?? null,
      Delivery_Date: j.Delivery_Date ?? null,
      Scheduled_Pickup_Time: j.Scheduled_Pickup_Time ?? null,
      Scheduled_Delivery_Time: j.Scheduled_Delivery_Time ?? null,
      Customer_ID: j.Customer_ID ?? null,
      Customer_Name: j.Customer_Name ?? null,
      Route_Name: j.Route_Name ?? null,
      Vehicle_Type: j.Vehicle_Type ?? null,
      Origin_Location: j.Origin_Location ?? null,
      Dest_Location: j.Dest_Location ?? null,
      Driver_ID: j.Driver_ID ?? null,
      Driver_Name: j.Driver_Name ?? null,
      Vehicle_Plate: j.Vehicle_Plate ?? null,
      Actual_Pickup_Time: j.Actual_Pickup_Time ?? null,
      Actual_Delivery_Time: j.Actual_Delivery_Time ?? null,
      Branch_ID: j.Branch_ID ?? null,
      Total_Drop: j.Total_Drop ?? null,
      Created_At: j.Created_At ?? null,
      Cargo_Type: j.Cargo_Type ?? null,
      Notes: j.Notes ?? null,
      original_origins_json: j.original_origins_json ?? null,
      original_destinations_json: j.original_destinations_json ?? null,
      Sub_ID: j.Sub_ID ?? null,
      Verification_Status: j.Verification_Status ?? null,
      Est_Distance_KM: j.Est_Distance_KM ?? null,
    })

    const drvId = (j.Driver_ID || "").trim()
    if (!drvId || drvId.toLowerCase() === "unassigned") {
      hasUnassigned = true
    } else if (!drvMap.has(drvId)) {
      drvMap.set(drvId, {
        Driver_ID: drvId,
        Driver_Name: j.Driver_Name || drvId,
        Vehicle_Plate: j.Vehicle_Plate || null,
        Vehicle_Type: j.Vehicle_Type || null,
        Active_Status: "Active",
        Branch_ID: j.Branch_ID || null,
        Image_Url: null,
      })
    }
  }

  const drivers = Array.from(drvMap.values())
  if (hasUnassigned) {
    drivers.unshift({
      Driver_ID: UNASSIGNED_DRIVER_ID,
      Driver_Name: "รอจัดคนขับ (Unassigned)",
      Vehicle_Plate: null,
      Vehicle_Type: null,
      Active_Status: "Unassigned",
      Branch_ID: null,
      Image_Url: null,
      isUnassigned: true,
    })
  }

  return { drivers, jobs: filtered }
}

function getRouteDisplay(job: TimelineJob): string {
  const origin = (job.Origin_Location || "").trim()
  const dest = (job.Dest_Location || "").trim()
  if (origin && dest) return `${origin} → ${dest}`
  if (job.Route_Name) return job.Route_Name
  return origin || dest || "-"
}

export function DriverTimelineScheduler({
  branchId,
  customerId,
  customerMode = false,
  initialJobs,
}: DriverTimelineSchedulerProps) {
  const [todayStr, setTodayStr] = useState<string>(() => todayTH())
  const [selectedDate, setSelectedDate] = useState<string>(() => todayTH())
  const [nowMin, setNowMin] = useState<number>(() => getNowMinutesBKK())

  const seeded = useMemo(() => mapInitialJobsToTimeline(initialJobs), [initialJobs])
  const [drivers, setDrivers] = useState<TimelineDriver[]>(seeded.drivers)
  const [jobs, setJobs] = useState<TimelineJob[]>(seeded.jobs)
  const [cancelledCount, setCancelledCount] = useState<number>(0)
  const requestKey = `${selectedDate}|${branchId || ""}|${customerMode ? "" : customerId || ""}`
  const [loadedKey, setLoadedKey] = useState<string>("")
  const isLoading = loadedKey !== requestKey

  const [searchQuery, setSearchQuery] = useState<string>("")
  const [showOnlyWithJobs, setShowOnlyWithJobs] = useState<boolean>(true)
  const [showCarryOver, setShowCarryOver] = useState<boolean>(true)
  const [statusFilter, setStatusFilter] = useState<StatusBucket>("all")
  const [activePopover, setActivePopover] = useState<ActivePopoverState | null>(null)

  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // Live "Now" indicator ticker (updates every minute in Asia/Bangkok)
  useEffect(() => {
    const tick = () => {
      setTodayStr(todayTH())
      setNowMin(getNowMinutesBKK())
    }
    const timer = setInterval(tick, 60_000)
    return () => clearInterval(timer)
  }, [])

  // Fetch timeline data whenever date / branch / customer changes
  useEffect(() => {
    let cancelled = false

    getDriverTimelineData({
      date: selectedDate,
      branchId: branchId || undefined,
      customerId: customerMode ? undefined : customerId,
    })
      .then((res) => {
        if (cancelled) return
        setDrivers(res.drivers)
        setJobs(res.jobs)
        setCancelledCount(res.cancelledCount)
      })
      .catch(() => {
        if (cancelled) return
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(requestKey)
      })

    return () => {
      cancelled = true
    }
  }, [selectedDate, branchId, customerId, customerMode, requestKey])

  // Close pinned popover on outside click or Escape
  useEffect(() => {
    if (!activePopover) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActivePopover(null)
    }
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest("[data-timeline-bar]")) return
      if (
        activePopover.pinned &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setActivePopover(null)
      }
    }
    window.addEventListener("keydown", handleKey)
    window.addEventListener("mousedown", handleClickOutside)
    return () => {
      window.removeEventListener("keydown", handleKey)
      window.removeEventListener("mousedown", handleClickOutside)
    }
  }, [activePopover])

  const clearHoverTimer = useCallback(() => {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current)
      hoverCloseTimer.current = null
    }
  }, [])

  const scheduleHoverClose = useCallback(() => {
    clearHoverTimer()
    hoverCloseTimer.current = setTimeout(() => {
      setActivePopover((prev) => (prev && !prev.pinned ? null : prev))
    }, 180)
  }, [clearHoverTimer])

  const isViewingToday = selectedDate === todayStr
  const nowPercent = Math.max(0, Math.min(100, (nowMin / 1440) * 100))

  const carryOverCount = useMemo(
    () => jobs.filter((job) => isCarryOverJob(job, isViewingToday, todayStr)).length,
    [jobs, isViewingToday, todayStr]
  )

  const effectiveJobs = useMemo(() => {
    if (showCarryOver) return jobs
    return jobs.filter((job) => !isCarryOverJob(job, isViewingToday, todayStr))
  }, [jobs, showCarryOver, isViewingToday, todayStr])

  // Classify & count all jobs for the selected date
  const classifiedJobs = useMemo(() => {
    const counts: Record<StatusBucket, number> = {
      all: effectiveJobs.length,
      delayed: 0,
      in_progress: 0,
      completed: 0,
      waiting: 0,
    }

    const items = effectiveJobs.map((job) => {
      const bucket = classifyJobBucket(job, selectedDate, todayStr, nowMin)
      counts[bucket] += 1
      return computeJobPosition(job, bucket, selectedDate, todayStr, nowMin)
    })

    return { items, counts }
  }, [effectiveJobs, selectedDate, todayStr, nowMin])

  // Group jobs by Driver_ID, apply search & status filter, and compute non-overlapping lanes
  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    const jobMatchesQuery = (item: Omit<PositionedJob, "lane">) => {
      if (!q) return true
      const j = item.job
      return (
        j.Job_ID.toLowerCase().includes(q) ||
        (j.Customer_Name || "").toLowerCase().includes(q) ||
        (j.Driver_Name || "").toLowerCase().includes(q) ||
        (j.Vehicle_Plate || "").toLowerCase().includes(q) ||
        (j.Route_Name || "").toLowerCase().includes(q) ||
        (j.Origin_Location || "").toLowerCase().includes(q) ||
        (j.Dest_Location || "").toLowerCase().includes(q) ||
        item.soNumbers.some((so) => so.toLowerCase().includes(q))
      )
    }

    const driverMatchesQuery = (drv: TimelineDriver) => {
      if (!q) return true
      return (
        drv.Driver_Name.toLowerCase().includes(q) ||
        drv.Driver_ID.toLowerCase().includes(q) ||
        (drv.Vehicle_Plate || "").toLowerCase().includes(q)
      )
    }

    // Group all day's jobs by normalized driver ID
    const jobsByDriver = new Map<string, Omit<PositionedJob, "lane">[]>()
    for (const item of classifiedJobs.items) {
      const rawId = (item.job.Driver_ID || "").trim()
      const key = !rawId || rawId.toLowerCase() === "unassigned" ? UNASSIGNED_DRIVER_ID : rawId
      const arr = jobsByDriver.get(key) || []
      arr.push(item)
      jobsByDriver.set(key, arr)
    }

    const result: {
      driver: TimelineDriver
      positionedJobs: PositionedJob[]
      laneCount: number
    }[] = []

    for (const driver of drivers) {
      const allDriverJobs = jobsByDriver.get(driver.Driver_ID) || []
      const drvHit = driverMatchesQuery(driver)

      const visibleItems = allDriverJobs.filter((item) => {
        if (statusFilter !== "all" && item.bucket !== statusFilter) return false
        if (q && !drvHit && !jobMatchesQuery(item)) return false
        return true
      })

      if (q && !drvHit && visibleItems.length === 0) {
        continue
      }

      if (showOnlyWithJobs && visibleItems.length === 0) {
        continue
      }

      // If filtering by specific status pill, hide drivers with 0 matching jobs
      if (statusFilter !== "all" && visibleItems.length === 0) {
        continue
      }

      // Greedy interval lane stacking so overlapping bars never collide
      const sorted = [...visibleItems].sort(
        (a, b) => a.visualStartMin - b.visualStartMin || a.visualEndMin - b.visualEndMin
      )
      const laneEnds: number[] = []
      const positionedJobs: PositionedJob[] = sorted.map((item) => {
        let assignedLane = laneEnds.findIndex((end) => end + 5 <= item.visualStartMin)
        if (assignedLane === -1) {
          assignedLane = laneEnds.length
          laneEnds.push(item.visualEndMin)
        } else {
          laneEnds[assignedLane] = item.visualEndMin
        }
        return { ...item, lane: assignedLane }
      })

      result.push({
        driver,
        positionedJobs,
        laneCount: Math.max(1, laneEnds.length),
      })
    }

    return result
  }, [drivers, classifiedJobs.items, searchQuery, showOnlyWithJobs, statusFilter])

  // Compute clamped fixed popover coordinates relative to viewport
  const popoverStyle = useMemo(() => {
    if (!activePopover || typeof window === "undefined") return undefined
    const { rect } = activePopover
    const cardWidth = 340
    const cardHeight = 320
    const vw = window.innerWidth
    const vh = window.innerHeight

    let left = rect.left + rect.width / 2 - cardWidth / 2
    left = Math.max(12, Math.min(vw - cardWidth - 12, left))

    let top = rect.top - cardHeight - 10
    if (top < 12) {
      top = Math.min(vh - cardHeight - 12, rect.top + rect.height + 10)
    }

    return { top, left, width: cardWidth }
  }, [activePopover])

  const openPopover = (
    e: React.MouseEvent<HTMLButtonElement>,
    item: PositionedJob,
    driver: TimelineDriver,
    pinned: boolean
  ) => {
    clearHoverTimer()
    const r = e.currentTarget.getBoundingClientRect()
    setActivePopover({
      item,
      driver,
      rect: { top: r.top, left: r.left, width: r.width, height: r.height },
      pinned,
    })
  }

  return (
    <section
      aria-label="ตารางงานคนขับรายวัน (Dispatch Timeline)"
      className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden flex flex-col"
    >
      {/* Top Toolbar */}
      <div className="p-4 sm:p-5 border-b border-border space-y-3.5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
          {/* Title & Icon */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-primary/10 text-primary border border-primary/20 rounded-xl p-2 flex items-center justify-center shrink-0">
              <CalendarClock size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-foreground tracking-tight">
                  ตารางงานคนขับรายวัน (Dispatch Timeline)
                </h2>
                {isLoading && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                    <Loader2 size={11} className="animate-spin" />
                    กำลังโหลด
                  </span>
                )}
                {cancelledCount > 0 && (
                  <span className="text-[11px] font-semibold text-muted-foreground bg-muted border border-border px-2 py-0.5 rounded-full">
                    ซ่อนงานยกเลิก {cancelledCount} งาน
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-muted-foreground mt-0.5">
                แสดง {rows.length} {customerMode ? "คนขับในงานของคุณ" : "คนขับ"} · {classifiedJobs.counts.all} งานประจำวันที่ {formatThaiHeaderDate(selectedDate)}
              </p>
            </div>
          </div>

          {/* Date Navigator */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-full bg-muted/50 border border-border p-1">
              <button
                type="button"
                onClick={() => {
                  setActivePopover(null)
                  setSelectedDate((d) => shiftIsoDate(d, -1))
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <ChevronLeft size={14} />
                <span className="hidden sm:inline">วันก่อนหน้า</span>
              </button>

              <div className="flex items-center gap-1.5 px-2 border-x border-border">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setActivePopover(null)
                      setSelectedDate(e.target.value)
                    }
                  }}
                  aria-label="เลือกวันที่ตารางงาน"
                  className="bg-transparent! border-0! rounded-none! shadow-none! text-xs font-bold text-foreground focus:outline-none cursor-pointer px-1"
                />
                {!isViewingToday ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActivePopover(null)
                      setSelectedDate(todayStr)
                    }}
                    className="px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    วันนี้
                  </button>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold">
                    วันนี้ ({formatThaiHeaderDate(selectedDate)})
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setActivePopover(null)
                  setSelectedDate((d) => shiftIsoDate(d, 1))
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <span className="hidden sm:inline">วันถัดไป</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Search + Filter Toggle + Interactive Status Legend Pills */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Interactive Status Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer",
                statusFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-muted/60 text-foreground border-border hover:bg-muted"
              )}
            >
              <span>ทั้งหมด ({classifiedJobs.counts.all})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter((prev) => (prev === "delayed" ? "all" : "delayed"))}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer",
                statusFilter === "delayed"
                  ? "bg-rose-500 text-white border-rose-500 shadow-sm"
                  : "bg-muted/60 text-foreground border-border hover:bg-rose-500/10 hover:border-rose-500/30"
              )}
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  statusFilter === "delayed" ? "bg-white" : "bg-rose-500"
                )}
              />
              <span>ล่าช้า / ค้างส่ง ({classifiedJobs.counts.delayed})</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusFilter((prev) => (prev === "in_progress" ? "all" : "in_progress"))
              }
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer",
                statusFilter === "in_progress"
                  ? "bg-blue-500 text-white border-blue-500 shadow-sm"
                  : "bg-muted/60 text-foreground border-border hover:bg-blue-500/10 hover:border-blue-500/30"
              )}
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  statusFilter === "in_progress" ? "bg-white" : "bg-blue-500"
                )}
              />
              <span>กำลังดำเนินการ ({classifiedJobs.counts.in_progress})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter((prev) => (prev === "completed" ? "all" : "completed"))}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer",
                statusFilter === "completed"
                  ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                  : "bg-muted/60 text-foreground border-border hover:bg-emerald-500/10 hover:border-emerald-500/30"
              )}
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  statusFilter === "completed" ? "bg-white" : "bg-emerald-500"
                )}
              />
              <span>สำเร็จแล้ว ({classifiedJobs.counts.completed})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter((prev) => (prev === "waiting" ? "all" : "waiting"))}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer",
                statusFilter === "waiting"
                  ? "bg-slate-600 text-white border-slate-600 shadow-sm"
                  : "bg-muted/60 text-foreground border-border hover:bg-muted"
              )}
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  statusFilter === "waiting" ? "bg-white" : "bg-slate-400"
                )}
              />
              <span>รอเริ่ม/ยังไม่รับงาน ({classifiedJobs.counts.waiting})</span>
            </button>
          </div>

          {/* Search Input & Show-Only-Active-Drivers Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-60 sm:flex-initial">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาคนขับ / ทะเบียน / เลขงาน / ลูกค้า..."
                className="w-full h-8 pl-8 pr-7 rounded-full! bg-muted/50! border! border-border! text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50!"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="ล้างคำค้นหา"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {isViewingToday && (
              <button
                type="button"
                onClick={() => setShowCarryOver((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold border transition-colors cursor-pointer",
                  showCarryOver
                    ? carryOverCount > 0
                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                )}
              >
                <AlertCircle size={12} />
                <span>รวมงานค้าง ({carryOverCount})</span>
              </button>
            )}

            {!customerMode && (
              <button
                type="button"
                onClick={() => setShowOnlyWithJobs((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold border transition-colors cursor-pointer",
                  showOnlyWithJobs
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                )}
              >
                <Filter size={12} />
                <span>เฉพาะคนที่มีงาน</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 24-Hour Gantt Timeline Area */}
      <div className="overflow-x-auto custom-scrollbar max-h-[540px] overflow-y-auto relative flex-1">
        <div className="min-w-[860px]">
          {/* Sticky Timeline Header */}
          <div className="sticky top-0 z-30 flex border-b border-border bg-muted/80 backdrop-blur-md">
            <div className="w-[195px] sm:w-[220px] shrink-0 sticky left-0 z-40 bg-card/95 backdrop-blur-md border-r border-border px-3 py-2.5 flex items-center justify-between">
              <span className="text-[11px] font-black text-foreground uppercase tracking-wider">
                คนขับ / ทะเบียน
              </span>
              <span className="text-[11px] font-bold text-muted-foreground">งาน</span>
            </div>

            <div className="flex-1 relative h-10 flex items-center">
              {HOUR_TICKS.map((hour) => (
                <div
                  key={hour}
                  className="flex-1 border-l border-border/60 first:border-l-0 h-full flex items-center pl-1.5"
                >
                  <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
                    {String(hour).padStart(2, "0")}:00
                  </span>
                </div>
              ))}

              {/* Live "Now" Top Triangle + Time Label */}
              {isViewingToday && (
                <div
                  className="absolute top-0 bottom-0 z-30 pointer-events-none"
                  style={{ left: `${nowPercent}%` }}
                >
                  <div className="-translate-x-1/2 flex flex-col items-center">
                    <span className="px-1.5 py-0.2 rounded bg-rose-500 text-white text-[9px] font-bold tabular-nums shadow-xs">
                      {formatMinutesHHMM(nowMin)}
                    </span>
                    <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-rose-500" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Driver Rows */}
          {rows.length === 0 ? (
            <div className="py-16 px-6 text-center space-y-2.5 bg-card">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-muted text-muted-foreground flex items-center justify-center border border-border">
                <Truck size={22} />
              </div>
              <p className="text-sm font-bold text-foreground">
                {isLoading
                  ? "กำลังโหลดตารางงานคนขับ..."
                  : "ไม่พบรายการงานหรือคนขับที่ตรงกับเงื่อนไข"}
              </p>
              <p className="text-xs font-medium text-muted-foreground">
                {showOnlyWithJobs && !customerMode && classifiedJobs.counts.all === 0
                  ? "ยังไม่มีงานในวันที่เลือก ลองเปลี่ยนวันที่หรือปิดตัวกรอง “เฉพาะคนที่มีงาน” เพื่อดูรายชื่อคนขับที่พร้อมวิ่ง"
                  : "ลองเปลี่ยนตัวกรองสถานะ คำค้นหา หรือเลือกวันที่อื่น"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60 relative">
              {rows.map(({ driver, positionedJobs, laneCount }, idx) => {
                const rowHeight = Math.max(52, laneCount * LANE_HEIGHT + ROW_PADDING_Y * 2)
                const isUnassigned = Boolean(driver.isUnassigned)

                return (
                  <div
                    key={driver.Driver_ID}
                    className={cn(
                      "flex group transition-colors",
                      isUnassigned
                        ? "bg-amber-500/10 hover:bg-amber-500/15"
                        : "hover:bg-primary/5"
                    )}
                    style={{ minHeight: `${rowHeight}px` }}
                  >
                    {/* Sticky Left Driver Column */}
                    <div
                      className={cn(
                        "w-[195px] sm:w-[220px] shrink-0 sticky left-0 z-20 bg-card/95 backdrop-blur-md border-r border-border px-2.5 py-2 flex items-center justify-between gap-2",
                        isUnassigned && "bg-amber-50/95 dark:bg-amber-950/90"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-4 text-center text-[11px] font-bold text-muted-foreground tabular-nums shrink-0">
                          {isUnassigned ? (
                            <AlertCircle size={14} className="text-amber-500 mx-auto" />
                          ) : (
                            idx + (rows[0]?.driver.isUnassigned ? 0 : 1)
                          )}
                        </span>

                        {isUnassigned ? (
                          <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                            <User size={14} />
                          </div>
                        ) : (
                          <EntityAvatar
                            kind="driver"
                            id={driver.Driver_ID}
                            url={driver.Image_Url}
                            name={driver.Driver_Name}
                            className="w-7 h-7 rounded-lg border-border"
                          />
                        )}

                        <div className="min-w-0">
                          <p
                            className={cn(
                              "text-xs font-bold truncate",
                              isUnassigned
                                ? "text-amber-700 dark:text-amber-300"
                                : "text-foreground"
                            )}
                            title={driver.Driver_Name}
                          >
                            {driver.Driver_Name}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {driver.Vehicle_Plate ? (
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded bg-muted text-muted-foreground text-[10px] font-semibold border border-border truncate max-w-[96px]">
                                {driver.Vehicle_Plate}
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground truncate">
                                {isUnassigned ? "รอมอบหมาย" : driver.Driver_ID}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums shrink-0 border",
                          isUnassigned
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                            : positionedJobs.length > 0
                              ? "bg-primary/10 text-primary border-primary/20"
                              : "bg-muted text-muted-foreground border-border"
                        )}
                      >
                        {positionedJobs.length}
                      </span>
                    </div>

                    {/* Timeline Grid Track */}
                    <div className="flex-1 relative">
                      {/* 2-hour vertical background gridlines */}
                      <div className="absolute inset-0 flex pointer-events-none">
                        {HOUR_TICKS.map((hour) => (
                          <div
                            key={hour}
                            className="flex-1 border-l border-border/60 first:border-l-0 h-full relative"
                          >
                            <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-border/35" />
                          </div>
                        ))}
                      </div>

                      {/* Live Red "Now" Vertical Line */}
                      {isViewingToday && (
                        <div
                          className="absolute top-0 bottom-0 w-[1.5px] bg-rose-500/85 z-10 pointer-events-none"
                          style={{ left: `${nowPercent}%` }}
                        />
                      )}

                      {/* Job Bars (stacked automatically into lanes) */}
                      {positionedJobs.map((item) => {
                        const style = BUCKET_STYLES[item.bucket]
                        const leftPct = (item.visualStartMin / 1440) * 100
                        const widthPct = ((item.visualEndMin - item.visualStartMin) / 1440) * 100
                        const topPx = ROW_PADDING_Y + item.lane * LANE_HEIGHT
                        const startLabel = item.isCarryOver
                          ? item.job.Plan_Date
                            ? `◀ ค้าง ${formatShortThaiDayMonth(item.job.Plan_Date)}`
                            : "◀ ค้างส่ง"
                          : formatMinutesHHMM(item.startMin)
                        const barLabel = item.job.Customer_Name || item.job.Job_ID

                        return (
                          <button
                            key={item.job.Job_ID}
                            type="button"
                            data-timeline-bar="true"
                            onMouseEnter={(e) => {
                              if (activePopover?.pinned) return
                              openPopover(e, item, driver, false)
                            }}
                            onMouseLeave={() => {
                              if (activePopover?.pinned) return
                              scheduleHoverClose()
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (
                                activePopover?.pinned &&
                                activePopover.item.job.Job_ID === item.job.Job_ID
                              ) {
                                setActivePopover(null)
                                return
                              }
                              openPopover(e, item, driver, true)
                            }}
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              top: `${topPx}px`,
                              height: "28px",
                            }}
                            className={cn(
                              "absolute z-10 rounded-full border px-2 flex items-center gap-1.5 text-left shadow-xs transition-all cursor-pointer overflow-hidden",
                              "hover:scale-[1.015] hover:shadow-md hover:z-20 focus:outline-none focus:ring-2 focus:ring-primary/40",
                              style.barBg,
                              style.barBorder,
                              style.barText
                            )}
                          >
                            <span
                              className={cn(
                                "text-[10px] font-bold tabular-nums px-1.5 py-0.2 rounded-full shrink-0",
                                item.bucket === "waiting"
                                  ? "bg-background/80 text-foreground"
                                  : "bg-black/20 text-white"
                              )}
                            >
                              {startLabel}
                            </span>
                            <span className="text-[11px] font-bold truncate">
                              {barLabel}
                            </span>
                            <span
                              className={cn(
                                "text-[10px] opacity-85 truncate hidden md:inline",
                                item.bucket === "waiting"
                                  ? "text-muted-foreground"
                                  : "text-white/85"
                              )}
                            >
                              · {item.job.Job_ID}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Rich Floating Popover / Click Detail Card (portaled to document.body so never clipped) */}
      {activePopover && popoverStyle && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          onMouseEnter={clearHoverTimer}
          onMouseLeave={() => {
            if (!activePopover.pinned) scheduleHoverClose()
          }}
          style={{
            position: "fixed",
            top: `${popoverStyle.top}px`,
            left: `${popoverStyle.left}px`,
            width: `${popoverStyle.width}px`,
          }}
          className="z-[9999] bg-card/95 backdrop-blur-xl border border-border text-foreground shadow-2xl rounded-2xl p-4 animate-in fade-in zoom-in-95 duration-150"
        >
          {(() => {
            const { item, driver, pinned } = activePopover
            const { job, bucket, startMin, endMin, soNumbers } = item
            const bucketStyle = BUCKET_STYLES[bucket]
            const cleanedNotes = cleanJobNotes(job.Notes)
            const overdueDays = item.isCarryOver ? diffIsoDays(job.Plan_Date, todayStr) : null
            const plannedStartMin = item.plannedStartMin ?? null
            const plannedEndMin = item.plannedEndMin ?? null
            const actualStartMin = item.actualStartMin ?? null
            const actualEndMin = item.actualEndMin ?? null
            const hasPlannedVsActual =
              (plannedStartMin !== null || plannedEndMin !== null) &&
              (actualStartMin !== null || actualEndMin !== null)
            const endVarianceMin =
              plannedEndMin !== null && actualEndMin !== null
                ? Math.round(actualEndMin - plannedEndMin)
                : null

            return (
              <div className="space-y-3">
                {/* Header: Job ID + Status + Close */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-black text-foreground tracking-tight">
                        {job.Job_ID}
                      </span>
                      {item.isCarryOver && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-rose-500 text-white border-rose-500 shadow-xs">
                          ค้างจาก {job.Plan_Date ? formatThaiHeaderDate(job.Plan_Date) : "วันก่อนหน้า"}
                        </span>
                      )}
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                          bucketStyle.badgeBg
                        )}
                      >
                        {bucketStyle.label} · {job.Job_Status || "New"}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-muted-foreground truncate mt-0.5">
                      {job.Customer_Name || "ไม่ระบุลูกค้า"}
                    </p>
                  </div>

                  {pinned && (
                    <button
                      type="button"
                      onClick={() => setActivePopover(null)}
                      aria-label="ปิดรายละเอียด"
                      className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer shrink-0"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", bucketStyle.progressColor)}
                      style={{ width: `${bucketStyle.progressPct}%` }}
                    />
                  </div>
                </div>

                {/* Time & Duration */}
                <div className="flex flex-col gap-1.5 px-2.5 py-2 rounded-xl bg-muted/50 border border-border text-foreground text-xs">
                  <div className="flex items-center justify-between gap-2">
                    {item.isCarryOver ? (
                      <>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                            <CalendarClock size={13} className="shrink-0" />
                            <span>
                              แผนเดิม: {job.Plan_Date ? formatThaiHeaderDate(job.Plan_Date) : "-"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground tabular-nums pl-[19px]">
                            <span>
                              เวลารับ:{" "}
                              {item.origStartMin !== null
                                ? formatMinutesHHMM(item.origStartMin)
                                : "ไม่ระบุ"}
                              {item.origEndMin !== null
                                ? ` → ${formatMinutesHHMM(item.origEndMin)}`
                                : ""}
                            </span>
                          </div>
                        </div>
                        {overdueDays !== null && overdueDays > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold tabular-nums shrink-0">
                            ค้าง {overdueDays} วัน
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5 font-bold text-foreground tabular-nums">
                          <Clock size={13} className="text-primary shrink-0" />
                          <span>
                            {formatMinutesHHMM(startMin)} → {formatMinutesHHMM(endMin)}
                          </span>
                          {!item.hasExplicitSchedule && (
                            <span className="text-[10px] font-normal text-muted-foreground">(ประมาณการ)</span>
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
                          {formatDurationTH(startMin, endMin)}
                        </span>
                      </>
                    )}
                  </div>

                  {hasPlannedVsActual && (
                    <div className="pt-1.5 border-t border-border/60 flex flex-wrap items-center justify-between gap-1.5 text-[11px] tabular-nums">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-muted-foreground">
                        <span>
                          ตามแผน:{" "}
                          <strong className="font-semibold text-foreground/90">
                            {formatTimeRangeCompact(plannedStartMin, plannedEndMin)}
                          </strong>
                        </span>
                        <span>
                          จริง:{" "}
                          <strong className="font-semibold text-foreground">
                            {formatTimeRangeCompact(actualStartMin, actualEndMin)}
                          </strong>
                        </span>
                      </div>

                      {endVarianceMin !== null && (
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded-full border text-[10px] font-bold shrink-0",
                            endVarianceMin <= 0
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                          )}
                        >
                          {endVarianceMin === 0
                            ? "ตรงตามแผน"
                            : endVarianceMin < 0
                              ? `เร็วกว่าแผน ${Math.abs(endVarianceMin)} น.`
                              : `ช้ากว่าแผน ${endVarianceMin} น.`}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-start gap-2">
                    <MapPin size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-foreground/90 line-clamp-2">{getRouteDisplay(job)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Truck size={13} className="text-primary shrink-0" />
                    <span className="text-foreground/90 truncate font-medium">
                      {driver.Driver_Name}
                      {(job.Vehicle_Plate || driver.Vehicle_Plate) && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {job.Vehicle_Plate || driver.Vehicle_Plate}
                        </span>
                      )}
                    </span>
                  </div>

                  {soNumbers.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Package size={13} className="text-indigo-500 shrink-0 mt-0.5" />
                      <div className="flex flex-wrap gap-1">
                        {soNumbers.slice(0, 4).map((so) => (
                          <span
                            key={so}
                            className="px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 text-[10px] font-mono font-bold"
                          >
                            SO: {so}
                          </span>
                        ))}
                        {soNumbers.length > 4 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{soNumbers.length - 4}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {cleanedNotes && (
                    <div className="flex items-start gap-2">
                      <FileText size={13} className="text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{cleanedNotes}</p>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="pt-2 border-t border-border flex items-center gap-2">
                  <Link
                    href={`/track/${encodeURIComponent(job.Job_ID)}`}
                    className="flex-1 h-8 px-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                  >
                    <span>ดูรายละเอียด / ติดตามงาน</span>
                    <ExternalLink size={12} />
                  </Link>
                  <Link
                    href={`/jobs/history?q=${encodeURIComponent(job.Job_ID)}`}
                    className="h-8 px-3 rounded-xl bg-muted hover:bg-muted/80 border border-border text-foreground text-xs font-bold inline-flex items-center justify-center transition-colors"
                  >
                    ประวัติ
                  </Link>
                </div>
              </div>
            )
          })()}
        </div>,
        document.body
      )}
    </section>
  )
}
