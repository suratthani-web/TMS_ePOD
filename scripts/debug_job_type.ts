
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkJobs() {
    console.log("--- Checking Jobs_Main Columns ---");
    const { data: cols, error: colError } = await supabase.rpc('get_table_columns', { table_name: 'Jobs_Main' });
    if (colError) {
        console.error("Error fetching columns:", colError);
        // Fallback: select one row and check keys
        const { data: sample } = await supabase.from('Jobs_Main').select('*').limit(1).single();
        if (sample) {
            console.log("Columns from sample row:", Object.keys(sample).sort());
        }
    } else {
        console.log("Columns:", cols.map((c: any) => c.column_name).sort());
    }

    console.log("\n--- Last 5 Jobs ---");
    const { data: jobs, error: jobError } = await supabase
        .from('Jobs_Main')
        .select('Job_ID, Job_Status, job_type, Plan_Date, Created_At')
        .order('Created_At', { ascending: false })
        .limit(5);

    if (jobError) {
        console.error("Error fetching jobs:", jobError);
    } else {
        console.table(jobs);
    }
}

checkJobs();
