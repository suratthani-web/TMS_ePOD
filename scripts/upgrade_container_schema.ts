
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function upgradeContainerSchema() {
    console.log("--- Upgrading Container Schema for Export/Booking ---");
    
    // Using RPC to execute DDL if possible, or just print the SQL for the user.
    const sql = `
        ALTER TABLE public.jobs_container 
        ADD COLUMN IF NOT EXISTS booking_no TEXT,
        ADD COLUMN IF NOT EXISTS container_subtype TEXT DEFAULT 'import',
        ADD COLUMN IF NOT EXISTS pickup_empty_date DATE,
        ADD COLUMN IF NOT EXISTS port_closing_datetime TIMESTAMPTZ;
    `;
    
    console.log("Please run this SQL in your Supabase SQL Editor:");
    console.log(sql);
}

upgradeContainerSchema();
