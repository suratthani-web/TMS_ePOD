-- Migration: Add Pickup_Date column to Jobs_Main
-- Run this in Supabase SQL Editor

ALTER TABLE "Jobs_Main"
ADD COLUMN IF NOT EXISTS "Pickup_Date" TEXT;

-- Backfill: set Pickup_Date = Plan_Date for jobs that are already Picked Up / In Transit / Delivered / Completed
UPDATE "Jobs_Main"
SET "Pickup_Date" = "Plan_Date"
WHERE "Job_Status" IN ('Picked Up', 'In Transit', 'In Progress', 'Arrived', 'Delivered', 'Completed', 'Complete')
  AND "Pickup_Date" IS NULL
  AND "Plan_Date" IS NOT NULL;
