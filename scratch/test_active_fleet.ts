import { getActiveFleetStatus, getLatestDriverLocations } from '../src/lib/supabase/gps';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  console.log("Calling getLatestDriverLocations()...");
  try {
    const locations = await getLatestDriverLocations();
    console.log("getLatestDriverLocations count:", locations?.length);
    console.log("Sample locations:", locations?.slice(0, 3));
  } catch (err) {
    console.error("Error in getLatestDriverLocations:", err);
  }

  console.log("\nCalling getActiveFleetStatus()...");
  try {
    const fleet = await getActiveFleetStatus();
    console.log("getActiveFleetStatus count:", fleet?.length);
    console.log("Sample fleet:", fleet?.slice(0, 3));
  } catch (err) {
    console.error("Error in getActiveFleetStatus:", err);
  }
}

run();
