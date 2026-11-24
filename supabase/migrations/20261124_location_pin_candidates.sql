-- Auto-Capture Driver Location Pin Candidates + 4-Layer Anti-Poisoning
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public."Location_Pin_Candidates" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name text NOT NULL,
  normalized_name text NOT NULL,
  branch_id text,
  job_id text NOT NULL,
  drop_index int NOT NULL DEFAULT 0,
  event_type text NOT NULL,
  driver_id text NOT NULL,
  device_id text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  speed double precision,
  status text NOT NULL DEFAULT 'pending',
  flag_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text
);

CREATE INDEX IF NOT EXISTS idx_location_pin_candidates_norm_status
  ON public."Location_Pin_Candidates" (normalized_name, status);

CREATE INDEX IF NOT EXISTS idx_location_pin_candidates_device_created
  ON public."Location_Pin_Candidates" (device_id, created_at);

CREATE INDEX IF NOT EXISTS idx_location_pin_candidates_status_created
  ON public."Location_Pin_Candidates" (status, created_at DESC);

ALTER TABLE public."Location_Pin_Candidates" ENABLE ROW LEVEL SECURITY;
