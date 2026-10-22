"use client"

import Link from "next/link"
import { MessageSquare, Star, ExternalLink, User } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"
import { AnalyticsSubHeader, StatCard, SectionCard, EmptyState } from "@/components/analytics/analytics-subpage"
import { cn } from "@/lib/utils"

export type FeedbackRow = {
  id: string | number
  job_id: string
  rating: number | null
  comment: string | null
  created_at: string
  customer: string | null
  driver: string | null
}

const COPY = {
  th: {
    title: 'ความพึงพอใจลูกค้า',
    subtitle: 'คะแนนและความคิดเห็นจากลูกค้าหลังส่งของ (50 รายการล่าสุด)',
    total: 'จำนวนความคิดเห็น', avg: 'คะแนนเฉลี่ย', satisfied: 'พึงพอใจ (4–5 ดาว)', low: 'ต้องติดตาม (1–2 ดาว)',
    feed: 'ความคิดเห็นล่าสุด', feedSub: 'เรียงจากล่าสุด',
    noComment: 'ไม่มีข้อความ', view: 'ดูงาน', empty: 'ยังไม่มีความคิดเห็นจากลูกค้า', unknown: 'ไม่ระบุลูกค้า',
  },
  en: {
    title: 'Customer Feedback',
    subtitle: 'Ratings and comments from customers after delivery (latest 50)',
    total: 'Responses', avg: 'Average rating', satisfied: 'Satisfied (4–5★)', low: 'Needs follow-up (1–2★)',
    feed: 'Latest feedback', feedSub: 'Newest first',
    noComment: 'No comment', view: 'View job', empty: 'No customer feedback yet', unknown: 'Unknown customer',
  },
}

export function FeedbackView({ feedback }: { feedback: FeedbackRow[] }) {
  const { language } = useLanguage()
  const lang = language === 'en' ? 'en' : 'th'
  const c = COPY[lang]
  const rated = feedback.filter(f => (f.rating || 0) > 0)
  const avg = rated.length ? rated.reduce((s, f) => s + (f.rating || 0), 0) / rated.length : 0
  const satisfied = rated.filter(f => (f.rating || 0) >= 4).length
  const low = rated.filter(f => (f.rating || 0) <= 2).length
  const pct = (n: number) => (rated.length ? Math.round((n / rated.length) * 100) : 0)

  return (
    <div className="space-y-6">
      <AnalyticsSubHeader icon={MessageSquare} title={c.title} subtitle={c.subtitle} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={c.total} value={feedback.length} />
        <StatCard label={c.avg} value={`${avg.toFixed(1)} / 5`} tone={avg >= 4 ? 'positive' : avg >= 3 ? 'warning' : rated.length ? 'negative' : 'default'} icon={Star} />
        <StatCard label={c.satisfied} value={`${pct(satisfied)}%`} sub={`${satisfied} / ${rated.length}`} tone="positive" />
        <StatCard label={c.low} value={`${pct(low)}%`} sub={`${low} / ${rated.length}`} tone={low > 0 ? 'negative' : 'default'} />
      </div>

      <SectionCard title={c.feed} subtitle={c.feedSub} icon={MessageSquare}>
        {feedback.length === 0 ? (
          <EmptyState icon={MessageSquare} text={c.empty} />
        ) : (
          <div className="divide-y divide-border">
            {feedback.map(f => (
              <div key={f.id} className="px-6 py-4 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:bg-muted/30">
                <div className="flex gap-4 min-w-0">
                  <div className={cn(
                    "w-11 h-11 shrink-0 rounded-xl flex flex-col items-center justify-center border text-sm font-semibold",
                    (f.rating || 0) >= 4 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                      : (f.rating || 0) >= 3 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                      : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30"
                  )}>
                    {f.rating ?? '-'}<Star size={10} className="fill-current" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{f.customer || c.unknown}</p>
                    <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3">
                      <span className="inline-flex items-center gap-1"><User size={11} /> {f.driver || '-'}</span>
                      <span>{f.job_id}</span>
                    </p>
                    <p className={cn("text-sm mt-2", f.comment ? "text-foreground" : "text-muted-foreground italic")}>
                      {f.comment || c.noComment}
                    </p>
                  </div>
                </div>
                <div className="flex md:flex-col items-center md:items-end gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {new Date(f.created_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <Link href={`/admin/jobs/${f.job_id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                    {c.view} <ExternalLink size={12} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
