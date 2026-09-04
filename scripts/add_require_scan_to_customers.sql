-- Migration: per-customer "require barcode scan" flag
-- Run in Supabase SQL Editor
-- เปิดใช้ = งานของลูกค้ารายนี้ต้องสแกนลาเบลตอนรับ/ส่ง ก่อนถึงจะบันทึกได้

ALTER TABLE "Master_Customers"
ADD COLUMN IF NOT EXISTS "Require_Scan" BOOLEAN NOT NULL DEFAULT false;
