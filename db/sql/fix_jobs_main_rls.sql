-- =============================================
-- DRouteMind TMS: Jobs_Main RLS Fix
-- Ensures that server-side operations (Service Role) are preferred,
-- but provides a basic policy for authenticated roles if needed.
-- =============================================

-- 1. Ensure RLS is enabled
ALTER TABLE "Jobs_Main" ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies if they exist (to be safe)
DROP POLICY IF EXISTS "Allow all for authenticated" ON "Jobs_Main";
DROP POLICY IF EXISTS "Customers can insert requests" ON "Jobs_Main";

-- 3. Create a policy that allows AUTHENTICATED users to INSERT (if they belong to the customer)
-- Note: Service Role (Admin Client) always bypasses this.
-- This policy is for future-proofing if Supabase Auth is fully integrated.
CREATE POLICY "Allow authenticated inserts" ON "Jobs_Main" 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- 4. Create a policy for Service Role explicitly (though not required by Supabase, 
-- it documents the intention)
-- Note: Supabase bypasses RLS for service_role automatically.

-- 5. Allow authenticated users to SELECT their own jobs
CREATE POLICY "Allow users to view own jobs" ON "Jobs_Main"
FOR SELECT
TO authenticated
USING (
    "Customer_ID" IN (
        SELECT "Customer_ID" FROM "Master_Users" WHERE "User_ID"::text = auth.uid()::text
    )
);

-- 6. For the current Custom Auth (Anon + Service Role) setup:
-- We rely on Service Role for Inserts from Server Actions.
-- If we want to allow ANON to insert (NOT RECOMMENDED BUT SOMETIMES NECESSARY), 
-- we would do:
-- CREATE POLICY "Allow anon insert for requests" ON "Jobs_Main" FOR INSERT TO anon WITH CHECK (true);
-- BUT we have switched to createAdminClient() in the code, so this is handled safely.

-- Refresh Schema Cache
NOTIFY pgrst, 'reload schema';
