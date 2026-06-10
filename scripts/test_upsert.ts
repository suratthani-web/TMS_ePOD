
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testHandleContainer() {
    const jobId = 'JOB-20260603-385222';
    console.log(`--- Testing handleContainerData logic for ${jobId} ---`);
    
    const mockJobFormData = {
        Job_ID: jobId,
        job_type: 'container',
        container_no: 'TCNU-TEST-01',
        seal_no: 'S-999',
        container_size: '40',
        shipping_line: 'MAERSK',
        vessel_voyage: 'V-001',
        lfd_demurrage: '2026-06-10',
        lfd_detention: '2026-06-15',
        target_temperature: 25
    };

    const containerData = {
        job_id: jobId,
        container_no: mockJobFormData.container_no || null,
        seal_no: mockJobFormData.seal_no || null,
        container_size: mockJobFormData.container_size || null,
        shipping_line: mockJobFormData.shipping_line || null,
        vessel_voyage: mockJobFormData.vessel_voyage || null,
        lfd_demurrage: mockJobFormData.lfd_demurrage || null,
        lfd_detention: mockJobFormData.lfd_detention || null,
        target_temperature: mockJobFormData.target_temperature ? Number(mockJobFormData.target_temperature) : null,
        updated_at: new Date().toISOString()
    };

    console.log("Upserting:", containerData);
    const { error } = await supabase.from('jobs_container').upsert(containerData, { onConflict: 'job_id' });
    
    if (error) {
        console.error("UPSERT ERROR:", error);
    } else {
        console.log("UPSERT SUCCESS");
        const { data: verified } = await supabase.from('jobs_container').select('*').eq('job_id', jobId).single();
        console.log("Verified Record:", verified);
    }
}

testHandleContainer();
