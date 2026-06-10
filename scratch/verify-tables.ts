
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env from root
dotenv.config({ path: path.join(__dirname, '../.env') })

async function check() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('Missing ENV variables')
    return
  }

  const supabase = createClient(url, key)
  
  console.log('--- Checking daily_fuel_prices table ---')
  const { data, error } = await supabase
    .from('daily_fuel_prices')
    .select('*')
    .order('Date', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error accessing daily_fuel_prices:', error.message)
    console.log('Available tables might be different. Checking all tables...')
  } else {
    console.log('Latest 10 entries in daily_fuel_prices:')
    console.table(data)
  }
}

check()
