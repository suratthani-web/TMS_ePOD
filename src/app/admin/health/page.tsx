import { HealthClient } from "./health-client"
import { getAdminHealthData } from "./actions"

export default async function OperationsHealthPage() {
  const initialData = await getAdminHealthData()
  return <HealthClient initialData={initialData} />
}
