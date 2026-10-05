-- =============================================
-- DRouteMind TMS: Multi-Branch Data Separation (Fixed Types)
-- Run this in Supabase SQL Editor
-- =============================================
-- 1. Add Branch_ID to Master_Customers
ALTER TABLE public."Master_Customers"
ADD COLUMN IF NOT EXISTS "Branch_ID" TEXT REFERENCES public."Master_Branches"("Branch_ID");
-- 2. Add Branch_ID to Master_Drivers (Corrected Table Name)
ALTER TABLE public."Master_Drivers"
ADD COLUMN IF NOT EXISTS "Branch_ID" TEXT REFERENCES public."Master_Branches"("Branch_ID");
-- 3. Add Branch_ID to master_vehicles (Corrected Table Name)
ALTER TABLE public."master_vehicles"
ADD COLUMN IF NOT EXISTS "Branch_ID" TEXT REFERENCES public."Master_Branches"("Branch_ID");
-- 4. Add Branch_ID to Jobs_Main
ALTER TABLE public."Jobs_Main"
ADD COLUMN IF NOT EXISTS "Branch_ID" TEXT REFERENCES public."Master_Branches"("Branch_ID");
-- 5. Add Branch_ID to Repair_Tickets (Maintenance)
ALTER TABLE public."Repair_Tickets"
ADD COLUMN IF NOT EXISTS "Branch_ID" TEXT REFERENCES public."Master_Branches"("Branch_ID");
-- 6. Add Branch_ID to Billing_Notes
ALTER TABLE public."Billing_Notes"
ADD COLUMN IF NOT EXISTS "Branch_ID" TEXT REFERENCES public."Master_Branches"("Branch_ID");
-- Note: Fuel_Logs already has Branch_ID. 
-- 7. Add Profile Columns to Master_Users
ALTER TABLE public."Master_Users"
ADD COLUMN IF NOT EXISTS "First_Name" TEXT,
    ADD COLUMN IF NOT EXISTS "Last_Name" TEXT,
    ADD COLUMN IF NOT EXISTS "Email" TEXT;
-- =============================================
-- RLS Policy Updates (Examples)
-- =============================================
-- HELPER FUNCTION: Get User's Branch ID (Fixed Return Type)
CREATE OR REPLACE FUNCTION get_user_branch_id() RETURNS TEXT AS $$
DECLARE user_branch_id TEXT;
BEGIN -- Check if user is Super Admin (Role 1) - Access All?
-- For now, just get the Branch_ID
SELECT "Branch_ID" INTO user_branch_id
FROM public."Master_Users"
WHERE "User_ID"::text = auth.uid()::text
LIMIT 1;
RETURN user_branch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Ex: Update Drivers Policy
-- DROP POLICY IF EXISTS "Branch Isolation for Drivers" ON public."Master_Drivers";
-- CREATE POLICY "Branch Isolation for Drivers" ON public."Master_Drivers"
-- FOR ALL
-- USING (
--   "Branch_ID" IS NULL -- Global Drivers
--   OR "Branch_ID" = get_user_branch_id() -- Same Branch
--   OR EXISTS ( -- Or User is HQ/Super Admin (Role 1 or Branch 1)
--      SELECT 1 FROM public."Master_Users" 
--      WHERE "User_ID"::text = auth.uid()::text AND ("Role_ID" = 1 OR "Branch_ID" = 'HQ')
--   )
-- );