-- แยก flag บังคับสแกนเป็น "ตอนรับ" และ "ตอนส่ง" อิสระจากกัน
-- ค่าเริ่มต้นคัดลอกจาก Require_Scan เดิม เพื่อไม่ให้พฤติกรรมลูกค้าเจ้าเดิมเปลี่ยน
-- รันใน Supabase SQL editor

ALTER TABLE "Master_Customers"
  ADD COLUMN IF NOT EXISTS "Require_Scan_Pickup"   boolean,
  ADD COLUMN IF NOT EXISTS "Require_Scan_Delivery" boolean;

-- Backfill จากค่าเดิม (เฉพาะแถวที่ยังไม่มีค่า)
UPDATE "Master_Customers"
   SET "Require_Scan_Pickup"   = COALESCE("Require_Scan_Pickup",   COALESCE("Require_Scan", false)),
       "Require_Scan_Delivery" = COALESCE("Require_Scan_Delivery", COALESCE("Require_Scan", false));

-- default สำหรับแถวที่สร้างใหม่ (โค้ดก็ส่งค่ามาด้วยอยู่แล้ว แต่กันพลาด)
ALTER TABLE "Master_Customers"
  ALTER COLUMN "Require_Scan_Pickup"   SET DEFAULT false,
  ALTER COLUMN "Require_Scan_Delivery" SET DEFAULT false;

-- แจ้ง PostgREST ให้ reload schema cache (กัน PGRST205)
NOTIFY pgrst, 'reload schema';
