"use client"

import { useState, useEffect } from "react"
import type { ReconcileIssue } from "@/services/billing-reconciliation"
import type { HealthIssue } from "@/services/operations-health"
import { syncHealthJobPrice, getAdminHealthData, bypassHealthIssueAction, runMasterBackfillAction, runVerifyBackfillHistoricalAction } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertCircle, CheckCircle, RefreshCcw, Loader2, ShieldAlert, FileWarning, Wallet, Check, Building, Users, CalendarRange } from "lucide-react"
import { toast } from "sonner"
import { useLanguage } from "@/components/providers/language-provider"
import Link from "next/link"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type HealthData = {
  branchId: string
  customerId?: string
  issues: HealthIssue[]
  unbilled: ReconcileIssue[]
  branches: { Branch_ID: string, Branch_Name: string }[]
  customers: { Customer_ID: string, Customer_Name: string }[]
  isSuper: boolean
}

type BackfillMode = 'verified' | 'verify'
const todayTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())

export function HealthClient({ initialData }: { initialData: HealthData }) {
  const { t } = useLanguage()
  const [issues, setIssues] = useState(initialData.issues)
  const [unbilled, setUnbilled] = useState(initialData.unbilled)
  const [loading, setLoading] = useState(false)
  const [fixing, setFixing] = useState<string | null>(null)
  const [bypassing, setBypassing] = useState<string | null>(null)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMode, setBackfillMode] = useState<BackfillMode | null>(null)
  const [backfillStartDate, setBackfillStartDate] = useState(`${todayTH.slice(0, 7)}-01`)
  const [backfillEndDate, setBackfillEndDate] = useState(todayTH)
  
  const [branchId, setBranchId] = useState(initialData.branchId)
  const [customerId, setCustomerId] = useState(initialData.customerId || 'All')

  const fetchHealth = async (bId?: string, cId?: string) => {
    setLoading(true)
    try {
      const data = await getAdminHealthData(bId || branchId, cId || customerId)
      setIssues(data.issues)
      setUnbilled(data.unbilled)
    } catch {
      toast.error(t('common.toast.error_save'))
    } finally {
      setLoading(false)
    }
  }

  // Effect to trigger fetch on filter change
  useEffect(() => {
    if (branchId !== initialData.branchId || customerId !== (initialData.customerId || 'All')) {
        fetchHealth(branchId, customerId)
    }
  }, [branchId, customerId])

  const handleSyncPrice = async (jobId: string) => {
    setFixing(jobId)
    try {
      const res = await syncHealthJobPrice(jobId)
      if (res.success) {
        toast.success(t('common.toast.success_edit'))
        setIssues((prev) => prev.filter((i) => i.jobId !== jobId))
      } else if (res.result && res.result.totalPrice <= 0) {
        // Pricing engine couldn't find a rate — tell the admin the real cause
        toast.error(`ยิงค์ราคาไม่ได้: ${res.result.reason || 'ไม่พบเรทราคาของลูกค้า/เส้นทางนี้'} — กรุณาตรวจสอบตารางราคา หรือกดปล่อยผ่านหากเป็นงานแถม`)
      } else {
        toast.error(t('common.toast.error_save'))
      }
    } catch {
      toast.error(t('common.toast.error_save'))
    } finally {
      setFixing(null)
    }
  }

  const handleBypass = async (jobId: string) => {
    // Capture WHY the job is being bypassed so the audit log is meaningful
    // (e.g. "งานแถม") instead of a generic "Bypassed" for every case.
    const reason = prompt(
      "ระบุเหตุผลที่ปล่อยผ่านงานนี้ (บันทึกลง audit)\nเช่น: งานแถม / งานทดสอบ / ราคา 0 โดยตั้งใจ",
      "งานแถม"
    )
    if (reason === null) return // cancelled
    setBypassing(jobId)
    try {
      const res = await bypassHealthIssueAction(jobId, reason.trim() || "ปล่อยผ่าน (ไม่ระบุเหตุผล)")
      if (res.success) {
        toast.success(t('common.toast.success_edit'))
        // Surface the MASTER Google Sheet write outcome (was previously silent here)
        const sync = (res as { sheetSync?: { success: boolean; error?: string; skipped?: boolean } }).sheetSync
        if (sync) {
          if (sync.skipped) toast.info('ข้ามการเขียน Google Sheet (งานนี้อยู่ในชีตแล้ว)')
          else if (!sync.success) toast.error('เขียน Google Sheet ไม่สำเร็จ: ' + (sync.error || 'unknown error'), { duration: 9000 })
          else toast.success('บันทึกลง MASTER Sheet แล้ว')
        }
        setIssues((prev) => prev.filter((i) => i.jobId !== jobId))
      } else {
        toast.error(typeof res.error === 'string' ? res.error : t('common.toast.error_save'))
      }
    } catch {
      toast.error(t('common.toast.error_save'))
    } finally {
      setBypassing(null)
    }
  }

  const handleBackfill = async () => {
    if (!backfillMode) return
    if (!backfillStartDate || !backfillEndDate) {
      toast.error('กรุณาเลือกวันที่เริ่มและวันที่สิ้นสุด')
      return
    }
    if (backfillStartDate > backfillEndDate) {
      toast.error('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด')
      return
    }

    setBackfilling(true)
    try {
      if (backfillMode === 'verified') {
        const res = await runMasterBackfillAction(backfillStartDate, backfillEndDate)
        if (!res.success) throw new Error(res.error || 'unknown error')
        toast.success(`เขียนเพิ่ม ${res.count ?? 0} แถว และเติม Job ID ย้อนหลัง ${res.jobIdsFilled ?? 0} แถว`)
      } else {
        const res = await runVerifyBackfillHistoricalAction(backfillStartDate, backfillEndDate)
        if (!res.success) throw new Error(res.error || 'unknown error')
        toast.success(`ตั้ง Verified ${res.verified ?? 0} งาน · เขียนเพิ่ม ${res.appended ?? 0} แถว · เติม Job ID ${res.jobIdsFilled ?? 0} แถว`)
        fetchHealth()
      }
      setBackfillMode(null)
    } catch (e) {
      toast.error('Backfill ไม่สำเร็จ: ' + (e instanceof Error ? e.message : String(e)), { duration: 9000 })
    } finally {
      setBackfilling(false)
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "CRITICAL": return <ShieldAlert className="w-5 h-5 text-destructive" />
      case "WARNING": return <AlertCircle className="w-5 h-5 text-warning" />
      default: return <FileWarning className="w-5 h-5 text-muted-foreground" />
    }
  }

  const getIssueBadge = (type: string) => {
    switch (type) {
      case "MISSING_POD": return <Badge variant="destructive">POD Missing</Badge>
      case "MISSING_PRICE": return <Badge variant="destructive">Price Missing</Badge>
      case "PRICE_MISMATCH": return <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white border-transparent">Price Mismatch</Badge>
      case "MISSING_MASTER_DATA": return <Badge variant="secondary">Master Data</Badge>
      default: return <Badge>{type}</Badge>
    }
  }

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-primary">{t('dashboard.health.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('dashboard.health.subtitle')}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {initialData.isSuper && (
                <>
                    <Select value={branchId} onValueChange={setBranchId}>
                        <SelectTrigger className="w-[160px] h-10 bg-card border-border font-bold text-xs uppercase">
                            <Building className="w-3 h-3 mr-2 text-primary" />
                            <SelectValue placeholder="Branch" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Branches</SelectItem>
                            {initialData.branches.map(b => (
                                <SelectItem key={b.Branch_ID} value={b.Branch_ID}>{b.Branch_Name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={customerId} onValueChange={setCustomerId}>
                        <SelectTrigger className="w-[180px] h-10 bg-card border-border font-bold text-xs uppercase">
                            <Users className="w-3 h-3 mr-2 text-primary" />
                            <SelectValue placeholder="Customer" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Customers</SelectItem>
                            {initialData.customers.map(c => (
                                <SelectItem key={c.Customer_ID} value={c.Customer_ID}>{c.Customer_Name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </>
            )}

            <Button variant="outline" size="sm" onClick={() => fetchHealth()} disabled={loading} className="font-bold uppercase tracking-widest text-[10px] h-10 px-4">
                {loading ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <RefreshCcw className="w-3 h-3 mr-2" />}
                {t('common.sync_active')}
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={() => setBackfillMode('verified')}
                disabled={backfilling}
                className="font-bold uppercase tracking-widest text-[10px] h-10 px-4"
            >
                {backfilling ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <FileWarning className="w-3 h-3 mr-2" />}
                Backfill MASTER
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={() => setBackfillMode('verify')}
                disabled={backfilling}
                className="font-bold uppercase tracking-widest text-[10px] h-10 px-4 border-amber-500/50 text-amber-600 hover:bg-amber-50"
            >
                {backfilling ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <ShieldAlert className="w-3 h-3 mr-2" />}
                Verify + Backfill ย้อนหลัง
            </Button>
        </div>
      </div>

      <Dialog open={backfillMode !== null} onOpenChange={(open) => { if (!open && !backfilling) setBackfillMode(null) }}>
        <DialogContent className="max-w-md bg-card border border-border text-foreground rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-amber-500" />
              {backfillMode === 'verify' ? 'Verify + Backfill ย้อนหลัง' : 'Backfill MASTER'}
            </DialogTitle>
            <DialogDescription>
              {backfillMode === 'verify'
                ? 'ตั้ง Verified ให้งานที่เสร็จแล้ว พร้อมเติมข้อมูลและ Job ID ลงแท็บสยามรุ่งเรือง'
                : 'เติมเฉพาะงานที่ Verified แล้ว และใส่ Job ID ให้แถวเก่าที่จับคู่ได้แน่นอน'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="backfill-start-date">วันที่เริ่ม</Label>
              <Input
                id="backfill-start-date"
                type="date"
                value={backfillStartDate}
                max={backfillEndDate || undefined}
                onChange={(e) => setBackfillStartDate(e.target.value)}
                disabled={backfilling}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="backfill-end-date">วันที่สิ้นสุด</Label>
              <Input
                id="backfill-end-date"
                type="date"
                value={backfillEndDate}
                min={backfillStartDate || undefined}
                onChange={(e) => setBackfillEndDate(e.target.value)}
                disabled={backfilling}
              />
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            ระบบตรวจแถวเดิมก่อนเขียนทุกครั้ง จึงสามารถรันช่วงเดิมซ้ำได้โดยไม่เพิ่มงานซ้ำ
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBackfillMode(null)} disabled={backfilling}>ยกเลิก</Button>
            <Button onClick={handleBackfill} disabled={backfilling || !backfillStartDate || !backfillEndDate}>
              {backfilling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarRange className="mr-2 h-4 w-4" />}
              เริ่ม Backfill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-t-4 border-t-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest opacity-70">{t('dashboard.health.critical')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-destructive">{issues.filter((i) => i.severity === "CRITICAL").length}</div>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-warning">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest opacity-70">{t('dashboard.health.warnings')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-warning">{issues.filter((i) => i.severity === "WARNING").length}</div>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest opacity-70">{t('dashboard.health.score')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-primary">{Math.max(0, 100 - issues.length * 2)}%</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="data-quality" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 h-12">
          <TabsTrigger value="data-quality" className="font-bold uppercase tracking-widest text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <ShieldAlert className="w-3 h-3 mr-2" />
            {t('dashboard.health.feed_title')} ({issues.length})
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="font-bold uppercase tracking-widest text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Wallet className="w-3 h-3 mr-2" />
            {t('dashboard.health.reconciliation_title')} ({unbilled.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="data-quality" className="mt-4">
          <Card className="border-none shadow-sm overflow-hidden">
            <div className="bg-card p-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-primary" />
                {t('dashboard.health.feed_title')}
              </h3>
              <Badge variant="outline" className="text-[10px] opacity-60">{t('dashboard.health.last_500')}</Badge>
            </div>
            <CardContent className="p-0 text-foreground">
              <div className="divide-y">
                {issues.length === 0 && !loading && (
                  <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                    <CheckCircle className="w-12 h-12 text-green-500 opacity-20" />
                    <p className="font-bold">{t('dashboard.health.no_issues')}</p>
                  </div>
                )}

                {loading && issues.length === 0 && (
                  <div className="p-12 text-center flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
                  </div>
                )}

                {issues.map((issue, idx) => (
                  <div key={`${issue.jobId}-${idx}`} className="p-4 flex items-start justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex gap-4 text-foreground">
                      <div className="mt-1">{getSeverityIcon(issue.severity)}</div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm">{issue.jobId}</span>
                          {getIssueBadge(issue.issueType)}
                          <span className="text-xs text-muted-foreground">{issue.customerName}</span>
                        </div>
                        <p className="text-sm opacity-80">{issue.description}</p>
                        {issue.details ? (
                          <pre className="text-[10px] bg-muted p-2 rounded mt-2 font-mono opacity-70">
                            {JSON.stringify(issue.details as any, null, 2)}
                          </pre>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {/* Price issues: offer to sync the rate */}
                      {(issue.issueType === "PRICE_MISMATCH" || issue.issueType === "MISSING_PRICE") && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handleSyncPrice(issue.jobId); }}
                          disabled={fixing === issue.jobId}
                          className="text-[10px] font-black uppercase h-8"
                        >
                          {fixing === issue.jobId ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCcw className="w-3 h-3 mr-1" />}
                          {t('dashboard.health.sync_price')}
                        </Button>
                      )}

                      {/* Bypass is available for everything except a pure price
                          mismatch (which should be reconciled, not dismissed).
                          For MISSING_PRICE this is the "งานแถม" escape hatch. */}
                      {issue.issueType !== "PRICE_MISMATCH" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handleBypass(issue.jobId); }}
                          disabled={bypassing === issue.jobId}
                          className="text-[10px] font-black uppercase h-8 border-green-500/50 text-green-600 hover:bg-green-50"
                        >
                          {bypassing === issue.jobId ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
                          {t('dashboard.health.bypass')}
                        </Button>
                      )}

                      <Button size="sm" variant="ghost" asChild className="text-[10px] font-black uppercase h-8">
                        <Link href={`/planning?date=${issue.planDate || ""}&query=${issue.jobId}`} onClick={(e) => e.stopPropagation()}>
                          {t('dashboard.health.inspect')}
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-4">
          <Card className="border-none shadow-sm overflow-hidden">
            <div className="bg-card p-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" />
                {t('dashboard.health.reconciliation_title')}
              </h3>
              <Badge variant="outline" className="text-[10px] opacity-60">{t('dashboard.health.pending_invoice')}</Badge>
            </div>
            <CardContent className="p-0 text-foreground">
              <div className="divide-y">
                {unbilled.length === 0 && !loading && (
                  <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                    <CheckCircle className="w-12 h-12 text-green-500 opacity-20" />
                    <p className="font-bold">{t('dashboard.health.all_billed')}</p>
                  </div>
                )}

                {unbilled.map((job, idx) => (
                  <div key={`${job.jobId}-${idx}`} className="p-4 flex items-start justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex gap-4">
                      <div className="mt-1">
                        {job.daysPending > 7 ? <ShieldAlert className="w-5 h-5 text-destructive" /> : <AlertCircle className="w-5 h-5 text-warning" />}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm">{job.jobId}</span>
                          <Badge variant={job.daysPending > 7 ? "destructive" : "outline"}>
                            {t('dashboard.health.days_late').replace('{{days}}', String(job.daysPending))}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{job.customerName}</span>
                        </div>
                        <p className="text-sm opacity-80">
                          {t('dashboard.health.completed_on')} {new Date(job.completedAt).toLocaleDateString()}
                        </p>
                        <div className="text-xs font-bold text-primary">
                          {t('dashboard.health.est_revenue')}: ฿{job.price.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" asChild className="text-[10px] font-black uppercase h-8">
                      <Link href={`/billing/invoices?customer=${job.customerName}`}>{t('dashboard.health.create_invoice')}</Link>
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
