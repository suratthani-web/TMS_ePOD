
export type Permission = {
  id: string
  label: string
  desc: string
  category: 'Operations' | 'Fleet' | 'Financial' | 'Executive' | 'System' | 'People'
}

export type Role = {
  Role_ID: number
  Role_Name: string
  Role_Description?: string | null
}

export type RolePermission = {
  Role: string
  Permissions: Record<string, boolean>
}

export type RolePermissions = RolePermission

export const STANDARD_ROLES = ['Super Admin', 'Admin', 'Executive', 'Accountant', 'Dispatcher', 'Driver', 'Customer', 'Staff'] as const
export type StandardRole = (typeof STANDARD_ROLES)[number]

export const PERMISSION_CATEGORIES = [
    { id: 'Executive', label: 'Executive Intelligence', icon: 'Target' },
    { id: 'Operations', label: 'Order & Planning', icon: 'FileText' },
    { id: 'Fleet', label: 'Fleet & Maintenance', icon: 'Truck' },
    { id: 'Financial', label: 'Financial & Billing', icon: 'Wallet' },
    { id: 'People', label: 'Personnel & Drivers', icon: 'Users' },
    { id: 'System', label: 'System Configuration', icon: 'Settings' }
]

export const SYSTEM_PERMISSIONS: Permission[] = [
  // Executive
  { id: 'view_executive_dashboard', label: 'View Executive Dashboard', desc: 'เข้าถึงหน้าจอสรุปกำไร-ขาดทุน และสถิติบริหารระดับสูง', category: 'Executive' },
  { id: 'view_revenue_forecast', label: 'View Revenue Forecast', desc: 'ดูการคาดการณ์รายได้และแนวโน้มธุรกิจ', category: 'Executive' },
  { id: 'manage_executive_remarks', label: 'Manage Executive Remarks', desc: 'บันทึกหมายเหตุและการสั่งการบริหารประจำเดือน', category: 'Executive' },
  
  // Financial
  { id: 'view_financial_reports', label: 'View Financial Reports', desc: 'ดูรายงานรายได้และต้นทุนทั้งหมด', category: 'Financial' },
  { id: 'manage_billing', label: 'Manage Customer Billing', desc: 'จัดการการวางบิลและสถานะการชำระเงินของลูกค้า', category: 'Financial' },
  { id: 'manage_driver_settlement', label: 'Manage Driver Settlement', desc: 'จัดการค่าเที่ยวและเคลียร์เงินพนักงาน/รถร่วม', category: 'Financial' },
  { id: 'view_fuel_fraud_alerts', label: 'View Fuel Fraud Alerts', desc: 'เข้าถึงระบบตรวจสอบความผิดปกติของการเติมน้ำมัน', category: 'Financial' },

  // Operations
  { id: 'create_job', label: 'Create & Edit Jobs', desc: 'สร้างงานใหม่และแก้ไขรายละเอียดงานขนส่ง', category: 'Operations' },
  { id: 'dispatch_job', label: 'Dispatch & Assign Drivers', desc: 'จ่ายงานให้คนขับและเลือกรถขนส่ง', category: 'Operations' },
  { id: 'view_live_tracking', label: 'Live GPS Tracking', desc: 'ติดตามตำแหน่งรถแบบเรียลไทม์บนแผนที่', category: 'Operations' },
  { id: 'navigation.tracking_hub', label: 'Tracking Radar Hub (Admin)', desc: 'เข้าถึงศูนย์กลางติดตามงานและค้นหาด้วย SO Number แบบ Real-time', category: 'Operations' },
  { id: 'navigation.customer_tracking_hub', label: 'Customer Tracking Hub', desc: 'อนุญาตให้ลูกค้าเข้าถึงหน้าติดตามสถานะงานสดใน Dashboard ของตนเอง', category: 'Operations' },
  { id: 'manage_routes', label: 'Manage Routes & Zones', desc: 'จัดการข้อมูลเส้นทางและพื้นที่ให้บริการ', category: 'Operations' },
  { id: 'navigation.danger_zones', label: 'Manage Danger Zones', desc: 'จัดการพื้นที่อันตรายและการแจ้งเตือนความปลอดภัย', category: 'Operations' },


  // Fleet
  { id: 'manage_vehicles', label: 'Manage Vehicles Registry', desc: 'จัดการข้อมูลทะเบียนรถ ประวัติการตรวจสภาพ', category: 'Fleet' },
  { id: 'manage_maintenance', label: 'Manage Maintenance Tickets', desc: 'อนุมัติงานซ่อมและบันทึกประวัติการบำรุงรักษา', category: 'Fleet' },
  { id: 'view_fleet_compliance', label: 'View Compliance Status', desc: 'ติดตามวันหมดอายุภาษี/ประกัน/พรบ.', category: 'Fleet' },

  // People
  { id: 'manage_drivers', label: 'Manage Driver Profiles', desc: 'จัดการข้อมูลพนักงานขับรถและประวัติการทำงาน', category: 'People' },
  { id: 'manage_customers', label: 'Manage Customer Master', desc: 'จัดการข้อมูลบริษัทลูกค้าและเงื่อนไขการให้บริการ', category: 'People' },
  { id: 'manage_users', label: 'Manage System Users', desc: 'จัดการบัญชีผู้ใช้งานระบบและกำหนดบทบาท', category: 'People' },

  // System
  { id: 'manage_system_settings', label: 'Core System Settings', desc: 'กำหนดค่าพื้นฐานของระบบและพารามิเตอร์การทำงาน', category: 'System' },
  { id: 'manage_roles_permissions', label: 'Manage Roles & Security', desc: 'แก้ไขสิทธิ์การเข้าถึงเมนูต่างๆ ของแต่ละบทบาท', category: 'System' },
  { id: 'view_audit_logs', label: 'View System Audit Logs', desc: 'ตรวจสอบประวัติการเข้าใช้งานและการแก้ไขข้อมูลย้อนหลัง', category: 'System' },
]
