import { createAdminClient } from '../src/utils/supabase/server'

async function checkPolicies() {
    const supabase = createAdminClient()
    const { data: policies, error } = await supabase
        .rpc('get_policies') // or direct pg_policies query
        
    // Let's query pg_policies using a raw SQL or system table query
    const { data: pgPolicies, error: pgErr } = await supabase
        .from('pg_policies') // pg_policies is a view in PostgreSQL, but we might not have RLS bypass or API exposure
        .select('*')
    
    if (pgErr) {
        // Let's try running a direct query using supabase.rpc or a simple check
        console.log('Cannot query pg_policies directly via API, testing RLS behavior instead:')
    }

    // Let's test with createClient (anon client)
    const { createClient } = await import('../src/utils/supabase/server')
    const anonSupabase = await createClient()
    
    const { data: anonData, error: anonErr } = await anonSupabase
        .from('Jobs_Main')
        .select('Job_ID')
        .limit(1)
    
    console.log('Anon client query result:')
    console.log({ anonData, anonErr })
}

checkPolicies()
