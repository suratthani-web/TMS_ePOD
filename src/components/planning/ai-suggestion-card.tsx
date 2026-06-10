"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { getSuggestedDrivers, DriverSuggestion } from "@/lib/ai/ai-assign"
import {
  Sparkles,
  MapPin,
  Truck,
  Clock,
  CheckCircle2,
  Loader2,
  Star,
  Navigation,
  Zap,
  AlertCircle
} from "lucide-react"

interface AiSuggestionCardProps {
  jobData: {
    Pickup_Lat?: number | null
    Pickup_Lon?: number | null
    Vehicle_Type?: string | null
    Plan_Date?: string | null
  }
  onSelect: (driver: DriverSuggestion) => void
}

export function AiSuggestionCard({ jobData, onSelect }: AiSuggestionCardProps) {
  const [suggestions, setSuggestions] = useState<DriverSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = async () => {
    setLoading(true)
    setHasSearched(true)
    try {
      const results = await getSuggestedDrivers(jobData, 5)
      setSuggestions(results)
    } catch {
      // Continue without logging
    } finally {
      setLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-700 dark:text-emerald-400"
    if (score >= 60) return "text-amber-700 dark:text-amber-400"
    return "text-red-700 dark:text-red-400"
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-emerald-500/10 border-emerald-500/20"
    if (score >= 60) return "bg-amber-500/10 border-amber-500/20"
    return "bg-rose-500/10 border-rose-500/20"
  }

  const getScoreRing = (score: number) => {
    if (score >= 80) return "ring-emerald-500/20"
    if (score >= 60) return "ring-amber-500/20"
    return "ring-rose-500/20"
  }

  return (
    <div className="space-y-4">
      {/* Trigger Button */}
      {!hasSearched && (
        <Button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 rounded-xl transition-all"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          🤖 AI แนะนำคนขับที่เหมาะสมที่สุด
        </Button>
      )}

      {/* Loading State */}
      {loading && (
        <div className="p-8 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-primary/10 border border-primary/20">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="text-primary dark:text-primary-foreground font-bold">กำลังวิเคราะห์คนขับ...</span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {hasSearched && !loading && suggestions.length === 0 && (
        <div className="p-8 text-center rounded-2xl bg-slate-50 border border-slate-200 dark:bg-slate-800/50 dark:border-slate-700/50">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <p className="text-slate-900 dark:text-white font-black text-xl">ไม่พบคนขับที่พร้อม</p>
          <p className="text-slate-500 dark:text-gray-400 text-lg mt-1">ลองเปลี่ยนวันที่หรือกดค้นหาใหม่</p>
          <Button variant="outline" size="sm" onClick={handleSearch} className="mt-4 border-slate-300">
            ค้นหาอีกครั้ง
          </Button>
        </div>
      )}

      {/* Results */}
      {suggestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="text-lg font-black text-primary dark:text-primary-foreground uppercase tracking-tight">
                AI RECOMMENDATIONS (50)
              </span>
            </div>
            <Button 
              type="button" 
              variant="ghost" 
              size="sm" 
              onClick={handleSearch} 
              className="text-slate-500 hover:text-slate-900 font-bold"
            >
              รีเฟรช
            </Button>
          </div>

          {suggestions.map((driver, index) => (
            <div
              key={driver.Driver_ID}
              className={`${getScoreBg(driver.match_score)} border rounded-2xl cursor-pointer hover:shadow-md transition-all duration-200 group relative overflow-hidden`}
              onClick={() => onSelect(driver)}
            >
              <div className="p-5">
                <div className="flex items-center justify-between">
                  {/* Left: Driver Info */}
                  <div className="flex items-center gap-4 flex-1">
                    {/* Rank Badge */}
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl ${
                      index === 0 ? 'bg-amber-500 text-white' :
                      index === 1 ? 'bg-slate-200 text-slate-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {index === 0 ? <Star className="w-6 h-6 fill-current" /> : `#${index + 1}`}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <p className="text-slate-900 dark:text-white font-black text-2xl truncate tracking-tight">{driver.Driver_Name}</p>
                        {index === 0 && (
                          <span className="px-3 py-1 text-xs font-black rounded-lg bg-primary text-white uppercase tracking-wider shadow-sm">
                            Best Match
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 mt-2 text-base font-bold text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          <Truck className="w-4 h-4 text-slate-400" /> {driver.Vehicle_Plate}
                        </span>
                        {driver.distance_km !== null && (
                          <span className="flex items-center gap-1.5">
                            <Navigation className="w-4 h-4 text-slate-400" /> {driver.distance_km} km
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-slate-400" /> งานวันนี้: <b className="text-slate-900 dark:text-slate-200">{driver.active_jobs_today}</b>
                        </span>
                      </div>

                      {/* Score Breakdown */}
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        <ScorePill label="ระยะทาง" score={driver.distance_score} icon={<MapPin className="w-3 h-3" />} />
                        <ScorePill label="ว่าง" score={driver.availability_score} icon={<CheckCircle2 className="w-3 h-3" />} />
                        <ScorePill label="รถ" score={driver.vehicle_match_score} icon={<Truck className="w-3 h-3" />} />
                        <ScorePill label="ผลงาน" score={driver.performance_score} icon={<Zap className="w-3 h-3" />} />
                      </div>
                    </div>
                  </div>

                  {/* Right: Match Score */}
                  <div className={`text-center ml-4 ring-4 ${getScoreRing(driver.match_score)} rounded-[2rem] p-4 bg-card min-w-[90px] shadow-sm`}>
                    <p className={`text-4xl font-black ${getScoreColor(driver.match_score)} leading-tight`}>
                      {driver.match_score}
                    </p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">MATCH</p>
                  </div>
                </div>

                {/* Progress bar indication of score */}
                <div className="mt-4 w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div 
                        className={`h-full ${driver.match_score >= 80 ? 'bg-emerald-500' : driver.match_score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${driver.match_score}%` }}
                    />
                </div>

                {/* Select Button (visible on hover) */}
                <div className="mt-4 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                  <Button
                    type="button"
                    size="lg"
                    className="w-full bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-black text-xl rounded-xl shadow-xl hover:scale-[1.02] transition-transform"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(driver)
                    }}
                  >
                    <CheckCircle2 className="w-5 h-5 mr-2" /> เลือกคนขับนี้
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Mini score pill component
function ScorePill({ score, icon }: { label: string, score: number, icon: React.ReactNode }) {
  const color = score >= 80 ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/10' :
                score >= 50 ? 'text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-500/10' :
                'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-500/10'
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-black shadow-sm ${color}`}>
      {icon} {score}
    </span>
  )
}

