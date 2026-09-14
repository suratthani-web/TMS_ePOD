-- งานที่จุดรับไม่มีเช็คเกอร์ → คนขับสแกนรับเอง (บังคับสแกนตอนรับเฉพาะงานนั้น)
-- แอดมินติ๊กตอนสร้างงานในหน้าวางแผน
-- รันใน Supabase SQL editor ของโปรเจกต์ TMS

ALTER TABLE "Jobs_Main"
  ADD COLUMN IF NOT EXISTS "Driver_Self_Pickup" boolean DEFAULT false;

NOTIFY pgrst, 'reload schema';
