-- ==========================================================
-- LOGIS-PRO TMS: Add Image / Avatar Support for Masters
-- Adds Image_Url to Master_Drivers and Master_Vehicles,
-- and Avatar_Url to Master_Users.
-- ==========================================================

-- 1. Add Image_Url to Master_Drivers
ALTER TABLE public."Master_Drivers" 
ADD COLUMN IF NOT EXISTS "Image_Url" TEXT;

-- 2. Add Image_Url to Master_Vehicles
ALTER TABLE public."Master_Vehicles" 
ADD COLUMN IF NOT EXISTS "Image_Url" TEXT;

-- 3. Add Avatar_Url to Master_Users
ALTER TABLE public."Master_Users" 
ADD COLUMN IF NOT EXISTS "Avatar_Url" TEXT;

-- Comments
COMMENT ON COLUMN public."Master_Drivers"."Image_Url" IS 'URL or Google Drive link for driver photo';
COMMENT ON COLUMN public."Master_Vehicles"."Image_Url" IS 'URL or Google Drive link for vehicle photo';
COMMENT ON COLUMN public."Master_Users"."Avatar_Url" IS 'URL or Google Drive link for user avatar photo';
