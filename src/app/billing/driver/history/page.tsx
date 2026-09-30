"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { EntityAvatar } from "@/components/ui/entity-avatar"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard, PremiumCardHeader, PremiumCardTitle } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Wallet,
  ArrowLeft,
  Printer,
  Search,
  Calendar,
  FileDown,
  CheckCircle2,
  Undo2,
  Loader2,
  CloudSync,
  Eye,
  Smartphone
} from "lucide-react"
import { getDriverPayments, DriverPayment, updateDriverPaymentStatus, recallDriverPayment } from "@/lib/supabase/billing"
import { pushDriverPaymentToApp } from "@/lib/actions/payslip-actions"
import { generateScbPaymentXlsx } from "@/lib/actions/scb-export"
import { isSuperAdmin } from "@/lib/permissions"
import { toast } from "sonner"
import { manualSyncBill } from "@/app/settings/accounting/actions"

export default function DriverPaymentHistory() {
  const router = useRouter()
  const [payments, setPayments] = useState<DriverPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [isAdmin, setIsAdmin] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const loadData = useCallback(async () => {
    try {
        setLoading(true)
        const data = await getDriverPayments({
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            status: statusFilter
        })
        setPayments(data)
    } catch {
        toast.error("โหลดข้อมูลไม่สำเร็จ")
    } finally {
        setLoading(false)
    }
  }, [dateFrom, dateTo, statusFilter])

  useEffect(() => {
    loadData()
    checkAdmin()
  }, [loadData])

  const checkAdmin = async () => {
    const adminStatus = await isSuperAdmin()
    setIsAdmin(adminStatus)
  }

  const handleSyncToAccounting = async (id: string) => {
    setProcessingId(id)
    try {
        const res = await manualSyncBill(id)
        if (res.success) {
            toast.success("ส่งข้อมูลไประบบบัญชีสำเร็จ")
        } else {
            toast.error(res.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ")
        }
    } catch {
        toast.error("เกิดข้อผิดพลาด")
    } finally {
        setProcessingId(null)
    }
  }

  const handlePushToApp = async (id: string) => {
    setProcessingId(id)
    try {
        const res = await pushDriverPaymentToApp(id)
        if (res.ok) {
            toast.success(`ส่งเข้าแอปคนขับ "${res.driverName}" แล้ว`)
        } else {
            toast.error(res.error || "ส่งเข้าแอปไม่สำเร็จ")
        }
    } catch {
        toast.error("เกิดข้อผิดพลาด")
    } finally {
        setProcessingId(null)
    }
  }

  const handleMarkAsPaid = async (id: string) => {
    if (!confirm("ยืนยันการเปลี่ยนสถานะเป็น 'จ่ายเงินรวมแล้ว'?")) return
    setProcessingId(id)
    try {
        const res = await updateDriverPaymentStatus(id, "Paid")
        if (res.success) {
            toast.success("อัปเดตสถานะเรียบร้อย")
            loadData()
        } else {
            toast.error(res.error || "เกิดข้อผิดพลาด")
        }
    } catch {
        toast.error("เกิดข้อผิดพลาด")
    } finally {
        setProcessingId(null)
    }
  }

  const handleRecall = async (id: string) => {
    if (!confirm("⚠️ คำเตือน: คุณกำลังจะดึงรายการจ่ายเงินนี้กลับไปแก้ไข\\n\\nเอกสารสรุปนี้จะถูกลบ และรายการงานจะกลับไปสถานะ 'รอจ่ายเงิน'\\nยืนยันการดำเนินการ?")) return
    setProcessingId(id)
    try {
        const res = await recallDriverPayment(id)
        if (res.success) {
            toast.success("ดึงรายการกลับสำเร็จ")
            loadData()
        } else {
            toast.error(res.error || "เกิดข้อผิดพลาด")
        }
    } catch {
        toast.error("เกิดข้อผิดพลาด")
    } finally {
        setProcessingId(null)
    }
  }

  const handleExportSCB = async (id: string) => {
    setProcessingId(id)
    try {
        // สร้างไฟล์ Excel (paste-ready ตามเทมเพลต SCB Business Anywhere) ฝั่ง server
        const res = await generateScbPaymentXlsx(id)
        if (!res.success) { toast.error(res.message || "Export ไม่สำเร็จ"); return }
        const href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`
        const link = document.createElement("a")
        link.setAttribute("href", href)
        link.setAttribute("download", res.filename)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        toast.success("เตรียมไฟล์ SCB (Excel) เรียบร้อย — นำไปวางในเทมเพลตธนาคาร")
    } catch {
        toast.error("Export ไม่สำเร็จ")
    } finally {
        setProcessingId(null)
    }
  }

  const filteredPayments = payments.filter(p => 
    p.Driver_Payment_ID.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.Driver_Name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusBadge = (status: string) => {
    switch(status) {
        case 'Paid':
            return <span className="px-2 py-1 rounded-full text-lg font-bold font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">จ่ายเงินแล้ว</span>
        case 'Pending':
            return <span className="px-2 py-1 rounded-full text-lg font-bold font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">รอดำเนินการ</span>
        default:
            return <span className="px-2 py-1 rounded-full text-lg font-bold font-medium bg-blue-500/10 text-emerald-500 border border-emerald-500/15">{status}</span>
    }
  }

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <h1 className="text-4xl font-black text-muted-foreground flex items-center gap-4 tracking-tight">
            <span className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                <Wallet className="text-emerald-400 w-8 h-8" />
            </span>
            ประวัติการจ่ายเงินคนขับ
          </h1>
          <div className="text-xl font-bold text-muted-foreground mt-3 uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              รายการใบสรุปจ่ายที่สร้างแล้วทั้งหมด
          </div>
        </div>
        <PremiumButton 
            variant="outline" 
            onClick={() => router.back()}
            className="rounded-2xl border-border/5 hover:bg-muted/50"
        >
            <ArrowLeft className="w-4 h-4 mr-2" /> ย้อนกลับ
        </PremiumButton>
      </div>

      {/* Filters */}
      <PremiumCard dark className="mb-8 border-border/5">
        <div className="p-6">
            <div className="flex flex-col md:flex-row gap-6">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-emerald-400 transition-colors" />
                    <input 
                        type="text" 
                        placeholder="ค้นหาเลขที่เอกสาร หรือ ชื่อคนขับ..." 
                        className="w-full h-14 pl-12 pr-6 rounded-2xl bg-muted/80 border border-border/10 text-muted-foreground font-black placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-inner"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="w-full md:w-48">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-14 bg-muted/80 border-border/10 text-foreground font-black rounded-2xl px-6">
                            <SelectValue placeholder="สถานะ" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border/10 text-foreground font-black">
                            <SelectItem value="all" className="hover:bg-emerald-500/20 focus:bg-emerald-500/20 uppercase tracking-widest text-[10px]">ทั้งหมด</SelectItem>
                            <SelectItem value="Pending" className="hover:bg-emerald-500/20 focus:bg-emerald-500/20 uppercase tracking-widest text-[10px]">รอดำเนินการ</SelectItem>
                            <SelectItem value="Paid" className="hover:bg-emerald-500/20 focus:bg-emerald-500/20 uppercase tracking-widest text-[10px]">ชำระแล้ว</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex gap-4">
                    <div className="space-y-1">
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="h-14 bg-muted/80 border-border/10 text-foreground font-black rounded-2xl px-6 focus:bg-white/20 transition-all"
                        />
                    </div>
                    <div className="space-y-1">
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-14 bg-muted/80 border-border/10 text-foreground font-black rounded-2xl px-6 focus:bg-white/20 transition-all"
                        />
                    </div>
                </div>
            </div>
        </div>
      </PremiumCard>

      {/* Table */}
      <PremiumCard dark className="border-border/5 overflow-hidden">
        <PremiumCardHeader className="bg-muted/50 border-b border-border/5 px-8 py-6">
            <PremiumCardTitle dark className="text-lg font-black uppercase tracking-widest flex items-center gap-3">
                <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                รายการใบสรุปจ่าย ({filteredPayments.length})
            </PremiumCardTitle>
        </PremiumCardHeader>
        <div className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="border-border/5 hover:bg-transparent">
                  <TableHead className="py-6 px-8 text-muted-foreground font-black uppercase tracking-widest text-base font-bold">เลขที่เอกสาร</TableHead>
                  <TableHead className="py-6 px-4 text-muted-foreground font-black uppercase tracking-widest text-base font-bold">วันที่ทำรายการ</TableHead>
                  <TableHead className="py-6 px-4 text-muted-foreground font-black uppercase tracking-widest text-base font-bold">คนขับ</TableHead>
                  <TableHead className="py-6 px-4 text-right text-muted-foreground font-black uppercase tracking-widest text-base font-bold">ยอดเงิน</TableHead>
                  <TableHead className="py-6 px-4 text-center text-muted-foreground font-black uppercase tracking-widest text-base font-bold">สถานะ</TableHead>
                  <TableHead className="py-6 px-8 text-right text-muted-foreground font-black uppercase tracking-widest text-base font-bold">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                    <TableRow className="border-border/5">
                        <TableCell colSpan={6} className="text-center py-12">
                            <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                                <span className="font-bold uppercase tracking-tighter text-lg font-bold">กำลังโหลดข้อมูล...</span>
                            </div>
                        </TableCell>
                    </TableRow>
                ) : filteredPayments.length === 0 ? (
                    <TableRow className="border-border/5">
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground font-bold uppercase tracking-widest text-lg font-bold">ไม่พบข้อมูลใบสรุปจ่าย</TableCell>
                    </TableRow>
                ) : (
                    filteredPayments.map((item) => (
                    <TableRow key={item.Driver_Payment_ID} className="border-border/5 hover:bg-muted/50 transition-colors group">
                        <TableCell className="py-5 px-8 font-black text-emerald-400 font-mono tracking-wider">{item.Driver_Payment_ID}</TableCell>
                        <TableCell className="py-5 px-4">
                             <div className="flex items-center gap-2 text-muted-foreground font-bold">
                                <Calendar className="w-3.5 h-3.5" />
                                {new Date(item.Created_At).toLocaleDateString('th-TH')}
                             </div>
                        </TableCell>
                        <TableCell className="py-5 px-4 text-muted-foreground font-black tracking-tight">
                            <span className="flex items-center gap-2.5">
                                <EntityAvatar kind="driver" id={(item as { Driver_ID?: string | null }).Driver_ID} name={item.Driver_Name} className="h-8 w-8 rounded-lg" />
                                {item.Driver_Name}
                            </span>
                        </TableCell>
                        <TableCell className="py-5 px-4 text-right">
                            <span className="text-muted-foreground font-black text-lg tracking-tighter">
                                <span className="text-muted-foreground text-lg font-bold mr-1">฿</span>
                                {item.Total_Amount.toLocaleString()}
                            </span>
                        </TableCell>
                        <TableCell className="py-5 px-4 text-center">
                            {getStatusBadge(item.Status)}
                        </TableCell>
                        <TableCell className="py-5 px-8 text-right">
                             <div className="flex justify-end gap-2">
                                <Link
                                    href={`/billing/driver/print/${encodeURIComponent(item.Driver_Payment_ID)}`}
                                    target="_blank"
                                    rel="noopener"
                                    title="ดูรายละเอียดงาน"
                                    className="p-2 rounded-xl text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 inline-flex items-center transition"
                                >
                                    <Eye className="w-4 h-4" />
                                </Link>

                                {item.Status !== 'Paid' && (
                                    <PremiumButton 
                                        size="sm" 
                                        variant="ghost" 
                                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-xl"
                                        onClick={() => handleMarkAsPaid(item.Driver_Payment_ID)}
                                        disabled={processingId === item.Driver_Payment_ID}
                                        title="ชำระเงินแล้ว"
                                    >
                                        <CheckCircle2 className="w-4 h-4" />
                                    </PremiumButton>
                                )}

                                <PremiumButton 
                                    size="sm" 
                                    variant="ghost" 
                                    className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-xl"
                                    onClick={() => handleSyncToAccounting(item.Driver_Payment_ID)}
                                    disabled={processingId === item.Driver_Payment_ID}
                                    title="ส่งไประบบบัญชี"
                                >
                                    <CloudSync className="w-4 h-4" />
                                </PremiumButton>

                                <PremiumButton
                                    size="sm"
                                    variant="ghost"
                                    className="text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 rounded-xl"
                                    onClick={() => handlePushToApp(item.Driver_Payment_ID)}
                                    disabled={processingId === item.Driver_Payment_ID}
                                    title="ส่งเข้าแอปคนขับ"
                                >
                                    <Smartphone className="w-4 h-4" />
                                </PremiumButton>

                                <PremiumButton
                                    size="sm"
                                    variant="ghost"
                                    className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl"
                                    title="Export SCB"
                                    onClick={() => handleExportSCB(item.Driver_Payment_ID)}
                                    disabled={processingId === item.Driver_Payment_ID}
                                >
                                    {processingId === item.Driver_Payment_ID ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                                </PremiumButton>
                                <Link
                                    href={`/billing/driver/print/${encodeURIComponent(item.Driver_Payment_ID)}?mode=print`}
                                    target="_blank"
                                    rel="noopener"
                                    title="พิมพ์"
                                    className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 inline-flex items-center transition"
                                >
                                    <Printer className="w-4 h-4" />
                                </Link>

                                {isAdmin && item.Status !== 'Paid' && (
                                    <PremiumButton 
                                        size="sm" 
                                        variant="ghost" 
                                        className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl"
                                        onClick={() => handleRecall(item.Driver_Payment_ID)}
                                        disabled={processingId === item.Driver_Payment_ID}
                                        title="ดึงรายการกลับ (Recall)"
                                    >
                                        <Undo2 className="w-4 h-4" />
                                    </PremiumButton>
                                )}
                            </div>
                        </TableCell>
                    </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </PremiumCard>
    </DashboardLayout>
  )
}

