
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
    .from('Customer_Route_Rates')
    .select('Route_Name, Fuel_Rate_Matrix')
    .eq('Customer_ID', 'CUST-2604-2178')

  if (data) {
     console.log('--- Rates for this Customer ---')
     console.log(JSON.stringify(data, null, 2))
  }
}

checkJob()
