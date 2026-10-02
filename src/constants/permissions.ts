import { 
    LayoutDashboard,
    Truck,
    FileText,
    AlertTriangle,
    MessageSquare,
    Wrench,
    Fuel,
    BarChart3,
    Activity,
    Navigation,
    Users,
    Building,
    CalendarDays,
    Receipt,
    Wallet,
    History,
    CheckCircle2,
    Zap,
    Bot,
    Settings,
    User,
    Database,
    Shield,
    ShieldCheck,
    HeartPulse,
    Siren,
    ShieldAlert,
    ClipboardList,
    Leaf
} from "lucide-react"

// Menus shown to a customer who has NO individual permissions configured — the
// base client portal. Once individual permissions are granted, those take over
// entirely (see the sidebar filter), giving admins full menu-by-menu control.
export const CUSTOMER_DEFAULT_KEYS = [
  "navigation.dashboard",
  "navigation.customer_tracking_hub",
  "navigation.customer_report",
  "navigation.monitoring",
  "navigation.routes",
  "navigation.history",
] as const

export const MODULE_GROUPS = [
  {
    title: "Ops Command",
    items: [
      { key: "navigation.dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
      { key: "navigation.exception_center", label: "ศูนย์สั่งการฉุกเฉิน (Exception Center)", icon: Siren },
      { key: "navigation.operations_health", label: "ตรวจสอบคุณภาพข้อมูล (Ops Health)", icon: HeartPulse },
      { key: "navigation.user_monitor", label: "ติดตามผู้ใช้งานสด (User Monitor)", icon: Activity },
    ]
  },
  {
    title: "Operations",
    items: [
      { key: "navigation.planning", label: "วางแผนงาน (หน้าหลัก)", icon: CalendarDays },
      { key: "ops.create_job", label: "→ สร้าง/แก้ไขงาน", icon: FileText },
      { key: "ops.assign_driver", label: "→ จ่ายงาน/เลือกคนขับ", icon: Truck },
      { key: "navigation.calendar", label: "ปฏิทินงาน", icon: CalendarDays },
      { key: "navigation.container", label: "ระบบงานตู้คอนเทนเนอร์", icon: Database },
      { key: "navigation.history", label: "ประวัติงาน", icon: History },
      { key: "navigation.monitoring", label: "ติดตามรถ", icon: Activity },
      { key: "navigation.tracking_hub", label: "ศูนย์ติดตามงานสด (Admin)", icon: Activity },
      { key: "navigation.customer_tracking_hub", label: "ศูนย์ติดตามงานลูกค้า (Customer Tracking)", icon: Activity },
      { key: "navigation.customer_report", label: "รายงานสรุปงาน (ลูกค้า)", icon: BarChart3 },
      { key: "navigation.pod", label: "หลักฐานการส่งสินค้า (POD)", icon: FileText },
      { key: "navigation.damage_reports", label: "รายงานความเสียหาย", icon: AlertTriangle },
      { key: "navigation.chat", label: "แชท", icon: MessageSquare },
    ]
  },
  {
    title: "Asset Control",
    items: [
      { key: "navigation.routes", label: "จัดการเส้นทาง", icon: Navigation },
      { key: "navigation.danger_zones", label: "พื้นที่อันตราย (Danger Zones)", icon: ShieldAlert },
      { key: "navigation.drivers", label: "พนักงานขับรถ", icon: Users },
      { key: "navigation.driver_leaves", label: "จัดการการลา", icon: CalendarDays },
      { key: "navigation.customers", label: "ข้อมูลลูกค้า", icon: Building },
      { key: "navigation.fleet", label: "ยานพาหนะ", icon: Truck },
      { key: "navigation.notifications", label: "สถานะต่อสัญญา (Compliance)", icon: ShieldCheck },
      { key: "navigation.checks", label: "ตรวจสภาพรถ", icon: CheckCircle2 },
      { key: "navigation.maintenance", label: "บันทึกซ่อมบำรุง", icon: Wrench },
      { key: "navigation.fuel", label: "บันทึกน้ำมัน", icon: Fuel },
    ]
  },
  {
    title: "Intelligence",
    items: [
      { key: "navigation.analytics", label: "วิเคราะห์ข้อมูล", icon: BarChart3 },
      { key: "navigation.ai", label: "ผู้ช่วย AI", icon: Bot },
      { key: "navigation.reports", label: "รายงานสรุป", icon: BarChart3 },
      { key: "navigation.customer_reports_admin", label: "รายงานลูกค้า (ส่งเมล)", icon: BarChart3 },
      { key: "navigation.job_quality", label: "คุณภาพการปิดงาน (ภายใน)", icon: BarChart3 },
    ]
  },
  {
    title: "Financial",
    items: [
      { key: "navigation.billing_customer", label: "วางบิลลูกค้า (รายรับ)", icon: Receipt },
      { key: "navigation.billing_automation", label: "ระบบวางบิลอัตโนมัติ", icon: Zap },
      { key: "navigation.invoices", label: "ใบแจ้งหนี้", icon: FileText },
      { key: "navigation.payouts", label: "ค่าเที่ยวคนขับ (รายจ่าย)", icon: Wallet },
      { key: "financial.view_profit", label: "ดูสรุปกำไร/ขาดทุน", icon: BarChart3 },
    ]
  },
  {
    title: "System Settings",
    items: [
      { key: "navigation.settings", label: "ตั้งค่าระบบ", icon: Settings },
      { key: "navigation.logs", label: "บันทึกระบบ (Activity Logs)", icon: ClipboardList },
      { key: "navigation.fleet_standards", label: "เกณฑ์มาตรฐานรถ (Fleet Standards)", icon: ShieldCheck },
      { key: "navigation.esg_settings", label: "ตั้งค่าคาร์บอน อบก. (ESG)", icon: Leaf },
      { key: "settings.items.identity", label: "ตั้งค่าโปรไฟล์ส่วนตัว", icon: User },
      { key: "settings.items.company", label: "ข้อมูลบริษัท (Operation)", icon: Building },
      { key: "settings.items.accounting_profile", label: "ข้อมูลฝ่ายบัญชี (Invoice)", icon: Receipt },
      { key: "settings.items.permissions", label: "สิทธิ์การใช้งาน", icon: ShieldCheck },
      { key: "settings.items.operators", label: "จัดการผู้ใช้งานระบบ", icon: Users },
      { key: "settings.items.branches", label: "จัดการสาขา/โหนด", icon: Navigation },
      { key: "settings.items.partners", label: "จัดการรถร่วม (Vendor)", icon: Truck },
      { key: "settings.items.vehicles", label: "ประเภทรถและข้อกำหนด", icon: Truck },
      { key: "settings.items.accounting", label: "เชื่อมต่อระบบบัญชี", icon: Database },
      { key: "settings.items.expense_types", label: "จัดการประเภทค่าใช้จ่าย", icon: Receipt },
      { key: "settings.items.vault", label: "ระบบสำรองข้อมูล & Security", icon: Shield },
      { key: "settings.items.change_password", label: "เปลี่ยนรหัสผ่าน", icon: Shield },
    ]
  }
]
