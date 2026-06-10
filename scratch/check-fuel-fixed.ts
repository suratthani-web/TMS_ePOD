
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config()

async function check() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  
  const { data, error } = await supabase
    .from('daily_fuel_prices')
    .select('*')
    .order('Date', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Latest 5 Fuel Prices:', data)
  }
}

check()
