"use client"

import { useEffect, useState, useCallback } from "react"
import { getLiveKPIData, LiveKPIData } from "@/lib/actions/kpi-live-actions"
import { Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock, RefreshCw, Minus } from "lucide-react"
import { cn } from "@/lib/utils"

const POLL_INTERVAL = 90_000 // 90 seconds — KPIs for daily logistics don't move
                             // fast enough to justify 30s server-side aggregation.

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('th-TH')
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

interface Props {
  branchId?: string
  initialData?: LiveKPIData
}

export function RealtimeKPIBanner({ branchId, initialData }: Props) {
  const [data, setData] = useState<LiveKPIData | null>(initialData ?? null)
  const [loading, setLoading] = useState(!initialData)
  const [lastPulse, setLastPulse] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await getLiveKPIData(branchId)
      setData(result)
      setLastPulse(p => !p) // toggle to animate dot
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [branchId])

  useEffect(() => {
    if (!initialData) refresh()

    // Only poll while the tab is actually being watched. A dashboard left open
    // in a background tab was aggregating KPIs server-side every 30s around the
    // clock — the single biggest waste of the Fluid Active-CPU quota. Pause when
    // hidden, and refresh immediately when the operator returns to the tab.
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => { if (id === null) id = setInterval(refresh, POLL_INTERVAL) }
    const stop = () => { if (id !== null) { clearInterval(id); id = null } }

    const onVisibility = () => {
      if (document.visibilityState === "visible") { refresh(); start() }
      else stop()
    }

    if (document.visibilityState === "visible") start()
    document.addEventListener("visibilitychange", onVisibility)

    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility) }
  }, [refresh, initialData])

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-4 bg-muted/40 rounded-xl border border-border animate-pulse h-20">
        <Activity className="w-5 h-5 text-muted-foreground" />
        <span className="text-muted-foreground text-sm font-bold">กำลังโหลด KPI...</span>
      </div>
    )
  }

  if (!data) return null

  const profitPositive = data.profit >= 0

  return (
    <div className="w-full rounded-xl border border-border bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "w-2 h-2 rounded-full transition-colors duration-300",
              data.today.sos > 0 ? "bg-red-500 animate-ping" : "bg-emerald-500"
            )}
            key={String(lastPulse)}
          />
          <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">
            KPI วันนี้ — Live
          </span>
        </div>
        <div className="flex items-center gap-2">
          <RefreshCw className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-bold">
            อัปเดต {fmtTime(data.updatedAt)}
          </span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-x divide-border">

        {/* Total */}
        <KPICell
          label="งานทั้งหมด"
          value={data.today.total}
          icon={<Activity className="w-4 h-4" />}
          color="text-foreground"
        />

        {/* Delivered */}
        <KPICell
          label="ส่งสำเร็จ"
          value={data.today.delivered}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color="text-emerald-600"
          sub={data.today.total > 0 ? `${Math.round(data.today.delivered / data.today.total * 100)}%` : '0%'}
        />

        {/* In Progress */}
        <KPICell
          label="กำลังวิ่ง"
          value={data.today.inProgress}
          icon={<Clock className="w-4 h-4 animate-spin" style={{ animationDuration: '3s' }} />}
          color="text-blue-600"
        />

        {/* Pending */}
        <KPICell
          label="รอดำเนินการ"
          value={data.today.pending}
          icon={<Clock className="w-4 h-4" />}
          color="text-amber-600"
        />

        {/* On-time Rate */}
        <KPICell
          label="On-Time Rate"
          value={`${data.onTimeRate}%`}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color={data.onTimeRate >= 90 ? "text-emerald-600" : data.onTimeRate >= 70 ? "text-amber-600" : "text-red-500"}
          badge={data.onTimeRate >= 90 ? "ดีเยี่ยม" : data.onTimeRate >= 70 ? "พอใช้" : "ต้องปรับปรุง"}
          badgeColor={data.onTimeRate >= 90 ? "bg-emerald-100 text-emerald-700" : data.onTimeRate >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}
        />

        {/* Revenue */}
        <KPICell
          label="รายได้วันนี้"
          value={`฿${fmt(data.revenue)}`}
          icon={<TrendingUp className="w-4 h-4" />}
          color="text-blue-600"
        />

        {/* Profit */}
        <KPICell
          label="กำไร"
          value={`${profitPositive ? '' : '-'}฿${fmt(Math.abs(data.profit))}`}
          icon={profitPositive
            ? <TrendingUp className="w-4 h-4" />
            : data.profit === 0
            ? <Minus className="w-4 h-4" />
            : <TrendingDown className="w-4 h-4" />
          }
          color={profitPositive ? "text-emerald-600" : "text-red-500"}
          sub={data.revenue > 0 ? `${Math.round((data.profit / data.revenue) * 100)}% margin` : undefined}
          highlight={!profitPositive}
        />

      </div>

      {/* SOS Alert */}
      {data.today.sos > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-t border-red-500/30 text-red-600">
          <AlertTriangle className="w-4 h-4 animate-bounce" />
          <span className="text-sm font-black">SOS! มี {data.today.sos} งานฉุกเฉิน — ตรวจสอบด่วน</span>
        </div>
      )}
    </div>
  )
}

function KPICell({
  label, value, icon, color, sub, badge, badgeColor, highlight
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
  sub?: string
  badge?: string
  badgeColor?: string
  highlight?: boolean
}) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center gap-1 p-3 text-center",
      highlight && "bg-red-500/5"
    )}>
      <div className={cn("flex items-center gap-1 text-muted-foreground", color)}>
        {icon}
        <span className="text-xs font-bold uppercase tracking-tight">{label}</span>
      </div>
      <span className={cn("text-2xl font-black tabular-nums leading-none", color)}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted-foreground font-bold">{sub}</span>}
      {badge && (
        <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full", badgeColor)}>
          {badge}
        </span>
      )}
    </div>
  )
}
