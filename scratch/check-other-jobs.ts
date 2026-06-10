
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
    .from('Jobs_Main')
    .select('Job_ID, Notes, Loaded_Qty, Price_Cust_Total')
    .in('Job_ID', ['JOB-829293-62', 'JOB-20260607-606487', 'JOB-799279-505', 'JOB-20260606-980726'])

  console.log(data)
}

checkJob()
