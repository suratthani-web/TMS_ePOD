
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log("--- Checking jobs_container table ---");
    const { data, error } = await supabase.from('jobs_container').select('*').limit(1);
    if (error) {
        console.log("jobs_container error/missing:", error.message);
    } else {
        console.log("jobs_container exists.");
    }

    console.log("\n--- Checking container_yard_logs table ---");
    const { data: data2, error: error2 } = await supabase.from('container_yard_logs').select('*').limit(1);
    if (error2) {
        console.log("container_yard_logs error/missing:", error2.message);
    } else {
        console.log("container_yard_logs exists.");
    }
}

checkSchema();
