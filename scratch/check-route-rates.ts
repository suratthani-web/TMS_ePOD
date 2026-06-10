
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
    .select('*')
    .eq('Route_Name', 'สยามรุ่งเรือง-โชคชัย')
    .limit(10)

  if (error) {
    console.error('Error fetching rates:', error.message)
  } else {
    console.log('--- Route Rates ---')
    console.log(JSON.stringify(data, null, 2))
  }
}

checkJob()
