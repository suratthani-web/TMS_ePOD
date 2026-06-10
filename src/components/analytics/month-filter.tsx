"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition, useState } from "react"
import { ChevronLeft, ChevronRight, CalendarDays, Check } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"
import { useRef, useEffect } from "react"

const MONTH_COLORS = [
  'hover:bg-rose-500/15 data-[active=true]:bg-rose-500/20 data-[active=true]:text-rose-300 data-[active=true]:border-rose-500/30',
  'hover:bg-orange-500/15 data-[active=true]:bg-orange-500/20 data-[active=true]:text-orange-300 data-[active=true]:border-orange-500/30',
  'hover:bg-amber-500/15 data-[active=true]:bg-amber-500/20 data-[active=true]:text-amber-300 data-[active=true]:border-amber-500/30',
  'hover:bg-emerald-500/15 data-[active=true]:bg-emerald-500/20 data-[active=true]:text-emerald-300 data-[active=true]:border-emerald-500/30',
  'hover:bg-cyan-500/15 data-[active=true]:bg-cyan-500/20 data-[active=true]:text-cyan-300 data-[active=true]:border-cyan-500/30',
  'hover:bg-blue-500/15 data-[active=true]:bg-blue-500/20 data-[active=true]:text-blue-300 data-[active=true]:border-blue-500/30',
  'hover:bg-violet-500/15 data-[active=true]:bg-violet-500/20 data-[active=true]:text-violet-300 data-[active=true]:border-violet-500/30',
  'hover:bg-purple-500/15 data-[active=true]:bg-purple-500/20 data-[active=true]:text-purple-300 data-[active=true]:border-purple-500/30',
  'hover:bg-pink-500/15 data-[active=true]:bg-pink-500/20 data-[active=true]:text-pink-300 data-[active=true]:border-pink-500/30',
  'hover:bg-sky-500/15 data-[active=true]:bg-sky-500/20 data-[active=true]:text-sky-300 data-[active=true]:border-sky-500/30',
  'hover:bg-teal-500/15 data-[active=true]:bg-teal-500/20 data-[active=true]:text-teal-300 data-[active=true]:border-teal-500/30',
  'hover:bg-indigo-500/15 data-[active=true]:bg-indigo-500/20 data-[active=true]:text-indigo-300 data-[active=true]:border-indigo-500/30',
]

export function MonthFilter() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { t } = useLanguage()

  // Handle click outside to close dropdown and allow scrolling
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const year  = parseInt(searchParams.get("year")  || currentYear.toString())
  const month = parseInt(searchParams.get("month") || currentMonth.toString())

  const months = [
    t('months.jan'), t('months.feb'), t('months.mar'),
    t('months.apr'), t('months.may'), t('months.jun'),
    t('months.jul'), t('months.aug'), t('months.sep'),
    t('months.oct'), t('months.nov'), t('months.dec'),
  ]

  const shortMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

  const years = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2]

  const updateFilter = (newMonth: number, newYear: number) => {
    if (newMonth === month && newYear === year) { setOpen(false); return }
    const startDate = `${newYear}-${newMonth.toString().padStart(2, '0')}-01`
    const lastDay = new Date(newYear, newMonth, 0).getDate()
    const endDate = `${newYear}-${newMonth.toString().padStart(2, '0')}-${lastDay}`
    const params = new URLSearchParams(searchParams.toString())
    params.set("year", newYear.toString())
    params.set("month", newMonth.toString())
    params.set("startDate", startDate)
    params.set("endDate", endDate)
    startTransition(() => {
      router.push(`?${params.toString()}`, { scroll: false })
      setOpen(false)
    })
  }

  const handlePrev = () => {
    const newMonth = month === 1 ? 12 : month - 1
    const newYear  = month === 1 ? year - 1 : year
    updateFilter(newMonth, newYear)
  }

  const handleNext = () => {
    const newMonth = month === 12 ? 1 : month + 1
    const newYear  = month === 12 ? year + 1 : year
    updateFilter(newMonth, newYear)
  }

  const isCurrentMonth = month === currentMonth && year === currentYear
  const displayMonth = shortMonths[month - 1]

  return (
    <div className="relative" ref={containerRef}>
      {/* ── Main pill row ── */}
      <div className={cn(
        "flex items-center gap-1 rounded-2xl p-1",
        "bg-card border border-border shadow-lg",
        isPending && "opacity-80"
      )}>

        {/* Prev arrow */}
        <button
          onClick={handlePrev}
          disabled={isPending}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-200"
        >
          <ChevronLeft size={14} strokeWidth={2.5} />
        </button>

        {/* Month/Year trigger */}
        <button
          onClick={() => setOpen(v => !v)}
          className={cn(
            "flex flex-col items-center justify-center gap-1 h-9 px-4 rounded-xl transition-all duration-300 min-w-[140px] relative overflow-hidden",
            "text-foreground font-black text-[11px] uppercase tracking-wider",
            open
              ? "bg-white/10 border border-white/10"
              : "hover:bg-white/5 border border-transparent"
          )}
        >
          <div className="flex items-center gap-2">
            <CalendarDays size={12} className={cn("shrink-0", isPending ? "text-primary animate-spin" : "text-primary")} />
            <span>{displayMonth} {year}</span>
            {isCurrentMonth && !isPending && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            )}
          </div>
          {isPending && (
            <div className="absolute bottom-0 left-0 h-[2px] bg-primary animate-pulse w-full" />
          )}
        </button>

        {/* Next arrow */}
        <button
          onClick={handleNext}
          disabled={isPending}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-200"
        >
          <ChevronRight size={14} strokeWidth={2.5} />
        </button>

        {/* Today shortcut */}
        {!isCurrentMonth && (
          <button
            onClick={() => updateFilter(currentMonth, currentYear)}
            disabled={isPending}
            className="h-8 px-3 rounded-xl text-[9px] font-black uppercase tracking-wider text-primary border border-primary/20 bg-primary/10 hover:bg-primary/20 transition-all duration-200 whitespace-nowrap"
          >
            ปัจจุบัน
          </button>
        )}
      </div>

      {/* ── Dropdown Panel ── */}
      {open && (
        <div className={cn(
          "absolute top-full mt-3 right-0 z-50",
          "w-[280px] rounded-3xl overflow-hidden",
          "bg-slate-950/95 border border-white/10 shadow-[0_25px_70px_-15px_rgba(0,0,0,1)] backdrop-blur-2xl",
          "ring-1 ring-white/5",
          "animate-in fade-in zoom-in-95 slide-in-from-top-4 duration-300 ease-out"
        )}>
          {/* Header */}
          <div className="px-5 py-4 border-b border-border bg-white/[0.02] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <CalendarDays size={14} className="text-primary" />
            </div>
            <div>
              <span className="text-[10px] font-black text-white uppercase tracking-widest block mb-0.5">เลือกช่วงเวลา</span>
              <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-tighter">DATA_SYNC: ACTIVE</span>
            </div>
          </div>

            <div className="p-3 space-y-3">
              {/* Year selector */}
              <div>
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-2 px-1 opacity-50">ปี</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {years.map(y => (
                    <button
                      key={y}
                      onClick={() => updateFilter(month, y)}
                      className={cn(
                        "h-8 rounded-xl text-[11px] font-black transition-all duration-200 border",
                        year === y
                          ? "bg-primary/20 text-primary border-primary/30 shadow-[0_0_10px_rgba(255,30,133,0.15)]"
                          : "text-muted-foreground border-border hover:border-white/15 hover:text-foreground hover:bg-white/5"
                      )}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* Month grid */}
              <div>
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-2 px-1 opacity-50">เดือน</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {months.map((m, idx) => {
                    const mNum = idx + 1
                    const isActive = month === mNum
                    const colorClass = MONTH_COLORS[idx]
                    return (
                      <button
                        key={mNum}
                        data-active={isActive}
                        onClick={() => updateFilter(mNum, year)}
                        className={cn(
                          "h-9 rounded-xl text-[10px] font-black transition-all duration-200 border border-transparent relative",
                          "text-muted-foreground",
                          colorClass,
                          isActive && "scale-[1.05] shadow-lg"
                        )}
                      >
                        {shortMonths[idx]}
                        {isActive && (
                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Quick presets */}
              <div className="border-t border-border pt-2">
                <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-2 px-1 opacity-50">ช่วงเร็ว</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: 'เดือนนี้',      m: currentMonth,     y: currentYear },
                    { label: 'เดือนก่อน',    m: currentMonth === 1 ? 12 : currentMonth - 1, y: currentMonth === 1 ? currentYear - 1 : currentYear },
                    { label: 'ไตรมาสนี้',    m: Math.ceil(currentMonth / 3) * 3 - 2, y: currentYear, note: `Q${Math.ceil(currentMonth/3)}` },
                    { label: 'ต้นปีนี้',      m: 1,                y: currentYear },
                  ].map((preset) => {
                    const isSelected = month === preset.m && year === preset.y
                    return (
                      <button
                        key={preset.label}
                        onClick={() => updateFilter(preset.m, preset.y)}
                        className={cn(
                          "h-8 rounded-xl text-[9px] font-black transition-all duration-200 border px-2 flex items-center justify-between gap-1",
                          isSelected
                            ? "bg-primary/15 text-primary border-primary/25"
                            : "text-muted-foreground border-border hover:border-white/15 hover:text-foreground hover:bg-white/5"
                        )}
                      >
                        <span className="truncate">{preset.label}</span>
                        {isSelected && <Check size={8} strokeWidth={3} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-border bg-muted/20 flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground opacity-40 uppercase font-semibold">
                ข้อมูล: {shortMonths[month-1]} {year}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-[9px] font-black text-primary hover:text-primary/80 uppercase tracking-wider"
              >
                ปิด
              </button>
            </div>
          </div>
      )}
    </div>
  )
}
