-- รายงานสรุปงานรายลูกค้า (รายสัปดาห์ / รายเดือน) — ส่งอีเมล + dashboard ในระบบ
-- รันไฟล์นี้ใน Supabase SQL Editor ก่อนใช้งานหน้า /reports/customer-reports

-- 1) ตั้งค่ารายลูกค้า: ผู้รับ, รอบรายงาน, แสดงราคาไหม, ส่งอัตโนมัติไหม
create table if not exists "Customer_Report_Settings" (
  "Customer_ID"     text primary key,
  "Recipients_To"   text[]  not null default '{}',
  "Recipients_Cc"   text[]  not null default '{}',
  "Weekly_Enabled"  boolean not null default true,
  "Monthly_Enabled" boolean not null default true,
  "Show_Cost"       boolean not null default false,  -- ค่าเริ่มต้นไม่แสดงราคา
  "Auto_Send"       boolean not null default false,  -- เปิดเมื่อมั่นใจแล้ว (ส่งเฉพาะรายงานที่ไม่มีธงเตือน)
  "Updated_At"      timestamptz not null default now(),
  "Updated_By"      text
);

-- 2) รายงานแต่ละรอบ (ร่าง → ส่งแล้ว) เก็บ snapshot ตัวเลข ณ ตอนสร้าง
create table if not exists "Customer_Reports" (
  "Report_ID"     uuid primary key default gen_random_uuid(),
  "Customer_ID"   text not null,
  "Customer_Name" text,
  "Branch_ID"     text,
  "Period_Type"   text not null check ("Period_Type" in ('weekly', 'monthly')),
  "Period_Start"  date not null,
  "Period_End"    date not null,
  "Status"        text not null default 'draft' check ("Status" in ('draft', 'sent', 'failed', 'skipped')),
  "Metrics_Json"  jsonb,
  "Flags_Json"    jsonb not null default '[]',
  "Admin_Note"    text,
  "Sent_At"       timestamptz,
  "Sent_To"       text,
  "Sent_By"       text,
  "Error"         text,
  "Created_At"    timestamptz not null default now(),
  "Updated_At"    timestamptz not null default now(),
  unique ("Customer_ID", "Period_Type", "Period_Start")
);

create index if not exists customer_reports_period_idx
  on "Customer_Reports" ("Period_Type", "Period_Start");

-- ปิด RLS access จาก anon/authenticated (ระบบอ่าน/เขียนผ่าน service role ฝั่งเซิร์ฟเวอร์เท่านั้น)
alter table "Customer_Report_Settings" enable row level security;
alter table "Customer_Reports" enable row level security;

notify pgrst, 'reload schema';
