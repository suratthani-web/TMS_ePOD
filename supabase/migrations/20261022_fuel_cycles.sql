-- ─────────────────────────────────────────────────────────────────
-- Fuel_Cycles — ประวัติ "รอบเติม" (บิลชนบิล) ต่อรถ ใช้ตรวจการใช้น้ำมันผิดปกติ
--   1 แถว = 1 รอบที่ปิดแล้ว (เติมระหว่างทาง… → เติมจบงาน) ผูกกับงานที่วิ่ง
--   เทียบกับรอบอื่นของรถคันเดียวกันที่ระยะใกล้เคียงกัน → Status ปกติ/เฝ้าระวัง/ผิดปกติมาก
--   แอดมินกดตรวจได้: Review_Status ok (ปกติ มีเหตุผล) / confirmed_issue (ผิดปกติจริง → ไม่ใช้เป็นเกณฑ์)
--   ระบบคำนวณใหม่อัตโนมัติเมื่อมีบิลเข้า/แก้/ผูกงาน + cron /api/cron/fuel-cycles
--
-- รันเองใน Supabase SQL editor (project: uotofvfmlimkdmkcfsbr)
-- ─────────────────────────────────────────────────────────────────

create table if not exists "Fuel_Cycles" (
    "Cycle_ID"              text primary key,          -- = Log_ID ของบิลเติมจบงานที่ปิดรอบ
    "Vehicle_Plate"         text not null,
    "Branch_ID"             text,
    "Start_Time"            text,                      -- เวลาบิลแรกของรอบ
    "End_Time"              text,                      -- เวลาบิลปิดรอบ
    "Bill_Log_IDs"          text[] default '{}',
    "Job_IDs"               text[] default '{}',
    "Drop_Count"            integer default 0,
    "Km"                    numeric(10,2) not null,    -- ไมล์จริงจากบิลชนบิล
    "Liters"                numeric(10,2) not null,
    "Cost"                  numeric(12,2) not null,
    "Km_Per_Liter"          numeric(8,3),
    "Distance_Band"         text,                      -- <=250 / 251-500 / 501-800 / >800
    "Baseline_Km_Per_Liter" numeric(8,3),              -- ค่ากลางของรอบระยะใกล้เคียง
    "Baseline_Source"       text,                      -- peers / band / none
    "Peer_Count"            integer default 0,
    "Peer_Example"          text,                      -- เช่น "29/09 532 กม. 54.9 ล."
    "Expected_Liters"       numeric(10,2),
    "Excess_Liters"         numeric(10,2),
    "Excess_Pct"            numeric(8,4),
    "Excess_Cost"           numeric(12,2),
    "Status"                text not null default 'normal',   -- normal / watch / critical / insufficient
    "Review_Status"         text,                      -- ok / confirmed_issue
    "Review_Note"           text,
    "Reviewed_By"           text,
    "Reviewed_At"           timestamptz,
    "Notified_At"           timestamptz,
    "Computed_At"           timestamptz default now()
);

create index if not exists fuel_cycles_plate_end_idx on "Fuel_Cycles" ("Vehicle_Plate", "End_Time");
create index if not exists fuel_cycles_status_idx on "Fuel_Cycles" ("Status");

alter table "Fuel_Cycles" enable row level security;
-- เข้าถึงผ่าน service role (server) เท่านั้น

notify pgrst, 'reload schema';
