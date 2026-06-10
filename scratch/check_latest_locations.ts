import { createAdminClient } from '../src/utils/supabase/server'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

async function check() {
  const supabase = createAdminClient()

  console.log("Checking driver_latest_locations...")
  const { data: latest, error: errLatest } = await supabase
    .from("driver_latest_locations")
    .select("*")
    .limit(10)

  if (errLatest) {
    console.error("Error query driver_latest_locations:", errLatest)
  } else {
    console.log("driver_latest_locations rows count:", latest?.length)
    console.log("Sample:", latest)
  }

  console.log("Checking gps_logs...")
  const { data: gps, error: errGps } = await supabase
    .from("gps_logs")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(5)

  if (errGps) {
    console.error("Error query gps_logs:", errGps)
  } else {
    console.log("gps_logs rows count:", gps?.length)
    console.log("Sample gps_logs:", gps)
  }

  console.log("Checking Master_Drivers...")
  const { data: drivers, error: errDrivers } = await supabase
    .from("Master_Drivers")
    .select("Driver_ID, Driver_Name, Vehicle_Plate")
    .limit(5)

  if (errDrivers) {
    console.error("Error query Master_Drivers:", errDrivers)
  } else {
    console.log("Master_Drivers rows count:", drivers?.length)
    console.log("Sample Master_Drivers:", drivers)
  }
}

check()
