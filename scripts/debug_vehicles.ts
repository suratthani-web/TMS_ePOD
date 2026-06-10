
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkVehicles() {
    console.log("--- Checking Master_Vehicles Columns ---");
    const { data: sample, error } = await supabase.from('Master_Vehicles').select('*').limit(1).single();
    if (error) {
        console.error("Error fetching vehicle sample:", error);
    } else {
        console.log("Columns from sample row:", Object.keys(sample).sort());
    }
}

checkVehicles();
