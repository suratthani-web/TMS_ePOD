-- =========================================================================
-- DRouteMind TMS: Stair Incentive Verification Schema
-- เพิ่มคอลัมน์เพื่อรองรับระบบเปิด-ปิดฟีเจอร์ตรวจเช็กการเดินขึ้นตึก
-- และเก็บหลักฐานเซนเซอร์สำหรับงานของคนขับ
-- =========================================================================

-- 1. เพิ่มคอลัมน์ที่ตาราง Master_Customers เพื่อตั้งค่ารายลูกค้า
-- เลือกว่าต้องการเปิดระบบจับเซนเซอร์ตรวจสอบความสูง/ก้าวเดินเฉพาะเจาะจงหรือไม่
ALTER TABLE "Master_Customers" 
ADD COLUMN IF NOT EXISTS "Incentive_Sensor_Check" BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN "Master_Customers"."Incentive_Sensor_Check" 
IS 'เปิดใช้งานระบบเก็บข้อมูลเซนเซอร์ในแอปคนขับเมื่อส่งสินค้ารายลูกค้านี้ (ป้องกันการเคลมเท็จ)';


-- 2. เพิ่มคอลัมน์สำหรับเก็บข้อมูลผลลัพธ์ของเซนเซอร์ในงานส่งของ (Jobs_Main)
ALTER TABLE "Jobs_Main"
ADD COLUMN IF NOT EXISTS "Requires_Incentive_Check" BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "Incentive_Claimed" BOOLEAN DEFAULT FALSE, -- คนขับเคลมว่าขึ้นชั้น 2-3 หรือไม่
ADD COLUMN IF NOT EXISTS "Sensor_Verified" TEXT DEFAULT 'Not Checked', -- 'Not Checked', 'Verified', 'Suspect'
ADD COLUMN IF NOT EXISTS "Sensor_Max_Elevation_Diff" NUMERIC DEFAULT 0, -- ผลต่างความสูงสูงสุดที่จับได้ (เมตร)
ADD COLUMN IF NOT EXISTS "Sensor_Total_Steps_Upward" INT DEFAULT 0,     -- ก้าวเดินขึ้นบันไดสะสม
ADD COLUMN IF NOT EXISTS "Sensor_Logs_Json" JSONB DEFAULT '[]';         -- บันทึกข้อมูลค่าดิบระหว่างส่งงาน

COMMENT ON COLUMN "Jobs_Main"."Requires_Incentive_Check" IS 'ออเดอร์นี้ต้องการให้ระบบเปิดตรวจจับเซนเซอร์ (คัดลอกมาจาก Master_Customers อัตโนมัติ)';
COMMENT ON COLUMN "Jobs_Main"."Incentive_Claimed" IS 'คนขับกดระบุในแอปว่ามีการส่งสินค้าขึ้นชั้น 2-3 เพื่อขอรับเงินพิเศษ';
COMMENT ON COLUMN "Jobs_Main"."Sensor_Verified" IS 'ผลลัพธ์การตรวจสอบด้วยระบบเซนเซอร์: Not Checked, Verified (ผ่าน), Suspect (ต้องสงสัย)';
COMMENT ON COLUMN "Jobs_Main"."Sensor_Logs_Json" IS 'ประวัติความกดอากาศ/ความสูงและก้าวเดินที่แอปแอบบันทึกย้อนหลัง';


-- 3. ฟังก์ชันอัตโนมัติ (Trigger)
-- เมื่อสร้าง Job_Main ใหม่ ให้คัดลอกค่าการตั้งค่าเซนเซอร์มาจากตัวแม่ (Master_Customers) โดยอัตโนมัติ
CREATE OR REPLACE FUNCTION sync_customer_incentive_check() 
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."Customer_ID" IS NOT NULL THEN
        SELECT "Incentive_Sensor_Check" INTO NEW."Requires_Incentive_Check"
        FROM "Master_Customers"
        WHERE "Customer_ID" = NEW."Customer_ID";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_customer_incentive_check ON "Jobs_Main";
CREATE TRIGGER trg_sync_customer_incentive_check
BEFORE INSERT ON "Jobs_Main"
FOR EACH ROW
EXECUTE FUNCTION sync_customer_incentive_check();
