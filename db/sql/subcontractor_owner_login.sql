-- =====================================================================
-- เจ้าของสังกัด (Subcontractor) ล็อกอินเองด้วยรหัสสังกัด + รหัสผ่าน
-- เพื่อดูใบสรุปจ่ายของคนขับทุกคนในสังกัด — โดยไม่ต้องมีบัญชีคนขับ (driver id)
-- รันไฟล์นี้เองใน Supabase
-- =====================================================================

-- 1) เพิ่ม login ให้ตัวสังกัด
alter table public."Master_Subcontractors"
  add column if not exists "Password" text,
  add column if not exists "Line_User_ID" text;

-- 2) ผูก payslip กับสังกัดได้ตรงๆ (สำหรับ voucher รถร่วมที่ไม่มี driver)
alter table public."Driver_Payslips"
  add column if not exists "Sub_ID" text;

create index if not exists idx_driver_payslips_sub
  on public."Driver_Payslips" ("Sub_ID");

-- ตั้งรหัสผ่านให้เจ้าของสังกัด (ตัวอย่าง — ระบบจะ hash ให้ตอนแอดมินตั้งผ่านหน้าจอ
-- หรือจะ set plain-text ไว้ก่อนก็ได้ ระบบรองรับ plain-text fallback):
--   update public."Master_Subcontractors" set "Password" = '123456' where "Sub_ID" = 'วรารัตน์';
