-- ─────────────────────────────────────────────────────────────────
-- Fuel_Logs.Closes_Job_ID — แอดมินผูก "เติมจบงาน" กับงานที่บิลนี้ตัดน้ำมัน
--   ว่าง = ให้ระบบเดาเอง (เติมจบงานตัดงานล่าสุด + ตรวจเลขไมล์)
--   มีค่า = บิลนี้ปิดงานนั้น (และงานก่อนหน้าที่ยังไม่ถูกตัดของรถคันเดียวกัน)
--
-- รันเองใน Supabase SQL editor (project: uotofvfmlimkdmkcfsbr)
-- ─────────────────────────────────────────────────────────────────

alter table "Fuel_Logs"
    add column if not exists "Closes_Job_ID" text;

create index if not exists fuel_logs_closes_job_idx on "Fuel_Logs" ("Closes_Job_ID");

notify pgrst, 'reload schema';
