
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '../.env.local') })

async function checkJob() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  const supabase = createClient(url!, key!)
  
  const { data, error } = await supabase
    .from('System_Logs')
    .select('*')
    .eq('target_id', 'JOB-20260608-870288')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching logs:', error.message)
  } else {
    console.log('--- Logs for JOB-20260608-870288 ---')
    data.forEach(log => {
       console.log(`[${log.created_at}] ${log.action_type}:`, JSON.stringify(log.details))
    })
  }
}

checkJob()
