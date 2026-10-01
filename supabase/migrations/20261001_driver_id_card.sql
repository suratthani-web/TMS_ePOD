-- เลขบัตรประชาชนคนขับ (13 หลัก, เก็บเฉพาะตัวเลข) — แสดงในใบสำคัญจ่าย
-- และใช้ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)
-- โค้ดส่งคอลัมน์นี้เฉพาะตอนกรอกค่า จึงรันไฟล์นี้ทีหลัง deploy ได้
alter table "Master_Drivers"
  add column if not exists "ID_Card_No" text;

-- ให้ PostgREST เห็นคอลัมน์ใหม่ทันที (กัน PGRST204 schema cache ค้าง)
notify pgrst, 'reload schema';
