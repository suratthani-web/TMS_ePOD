import { HealthClient } from "./health-client"
import { getAdminHealthData } from "./actions"

// The MASTER backfill action can touch many rows + fuel lookups.
export const maxDuration = 60

export default async function OperationsHealthPage() {
  const initialData = await getAdminHealthData()
  return <HealthClient initialData={initialData} />
}
