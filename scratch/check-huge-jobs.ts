
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
    .select('Job_ID, Customer_Name, Route_Name, Price_Cust_Total, Cost_Driver_Total, Loaded_Qty, Vehicle_Type, Plan_Date')
    .gt('Price_Cust_Total', 100000)
    .limit(10)

  if (error) {
    console.error('Error fetching jobs:', error.message)
  } else {
    console.log('--- Huge Price Jobs ---')
    console.log(JSON.stringify(data, null, 2))
  }
}

checkJob()
