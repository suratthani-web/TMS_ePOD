-- Database Migration: Add dedicated Floor_Climb_Url column to Jobs_Main
-- Previously the floor-climb slip was stored inline in Photo_Proof_Url (identified
-- only by a "_FLOOR_CLIMB" filename). This column stores it explicitly so the admin
-- UI can render a dedicated "view / download" card without guessing from filenames.

ALTER TABLE "Jobs_Main"
    ADD COLUMN IF NOT EXISTS "Floor_Climb_Url" TEXT;

COMMENT ON COLUMN "Jobs_Main"."Floor_Climb_Url" IS
    'URL ของใบบันทึกการย้ายสินค้าและขึ้นชั้น (Floor Climb slip) ที่คนขับเจนตอนปิดงาน';
