
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkContainerData() {
    const jobId = 'JOB-20260603-385222';
    console.log(`--- Checking Container Data for ${jobId} ---`);
    const { data: job } = await supabase.from('Jobs_Main').select('Job_ID, job_type').eq('Job_ID', jobId).single();
    console.log("Job Main:", job);

    const { data: container } = await supabase.from('jobs_container').select('*').eq('job_id', jobId).single();
    console.log("Job Container:", container);
}

checkContainerData();
