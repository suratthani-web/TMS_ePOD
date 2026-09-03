-- Migration: Job_Scans — item-level scan log for pickup/delivery
-- Run this in Supabase SQL Editor
--
-- Design: append-only log. "รับกี่ชิ้น / ส่งครบยัง" คำนวณจากผลรวมของ rows
-- (phase='pickup' รวม − phase='delivery' รวม) ต่อ code/ดรอป
-- ไม่บังคับมี master ล่วงหน้า: code ว่างได้ (ของไม่มีลาเบล)

CREATE TABLE IF NOT EXISTS "Job_Scans" (
    "id"          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "Job_ID"      TEXT NOT NULL,
    "drop_index"  INTEGER,                 -- NULL = จุดรับ (รับดรอปเดียว); เลข = index ดรอปส่ง
    "phase"       TEXT NOT NULL CHECK ("phase" IN ('pickup', 'delivery')),
    "code"        TEXT,                    -- raw string ที่สแกน (barcode/QR); NULL = ใส่มือ/ไม่มีลาเบล
    "label"       TEXT,                    -- ชื่อ/คำอธิบายที่คนอ่านได้
    "qty"         NUMERIC NOT NULL DEFAULT 1,
    "driver_id"   TEXT,
    "scanned_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_job_scans_job_id"   ON "Job_Scans" ("Job_ID");
CREATE INDEX IF NOT EXISTS "idx_job_scans_job_phase" ON "Job_Scans" ("Job_ID", "phase");
CREATE INDEX IF NOT EXISTS "idx_job_scans_code"      ON "Job_Scans" ("code");
