
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '../.env.local') })
dotenv.config({ path: path.join(__dirname, '../.env') })

async function checkJob() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('Missing ENV variables')
    return
  }

  const supabase = createClient(url, key)
  
  const { data, error } = await supabase
    .from('Jobs_Main')
    .select('Job_ID, Customer_Name, Route_Name, Price_Cust_Total, Cost_Driver_Total, extra_costs_json, Loaded_Qty, Vehicle_Type, Plan_Date')
    .eq('Job_ID', 'JOB-20260608-870288')
    .single()

  if (error) {
    console.error('Error fetching job:', error.message)
  } else {
    console.log('--- Job Details ---')
    console.log(JSON.stringify(data, null, 2))
  }
}

checkJob()
