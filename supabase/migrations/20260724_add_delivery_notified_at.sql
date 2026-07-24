-- Database Migration: Add Delivery_Notified_At to Jobs_Main
-- Idempotency guard for the customer "delivery complete + survey" LINE push, so
-- the same job is never notified twice (protects the limited LINE push quota)
-- regardless of which completion path fires (mobile POD, LINE bot, LIFF signature).

ALTER TABLE "Jobs_Main"
    ADD COLUMN IF NOT EXISTS "Delivery_Notified_At" TIMESTAMPTZ;

COMMENT ON COLUMN "Jobs_Main"."Delivery_Notified_At" IS
    'เวลาที่ส่งแจ้งเตือน "จัดส่งสำเร็จ + ขอเรตติ้ง" ให้ลูกค้าทาง LINE (กันส่งซ้ำ)';
