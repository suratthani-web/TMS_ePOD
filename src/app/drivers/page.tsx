import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { DriversContent } from "@/components/drivers/drivers-content"
import { isAdmin } from "@/lib/permissions"
import { getAllBranches, Branch } from "@/lib/supabase/branches"
import { getAllDrivers } from "@/lib/supabase/drivers"
import { createBulkDrivers } from "./actions"
import { getAllVehicles } from "@/lib/supabase/vehicles"
import { getAllSubcontractors } from "@/lib/supabase/subcontractors"

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DriversPage(props: Props) {
  const [searchParams, isUserAdmin] = await Promise.all([
    props.searchParams,
    isAdmin()
  ])

  const page = Number(searchParams.page) || 1
  const query = (searchParams.query as string) || (searchParams.q as string) || (searchParams.search as string) || (searchParams.driverId as string) || ''

  // Fetch branches, drivers, vehicles, and subcontractors in parallel
  const [branchesData, driversResult, vehiclesResult, subcontractors] = await Promise.all([
    isUserAdmin ? getAllBranches() : Promise.resolve([]),
    getAllDrivers(page, 12, query, searchParams.branchId as string),
    getAllVehicles(),
    getAllSubcontractors()
  ])

  const branches: Branch[] = branchesData || []
  const { data: drivers, count } = driversResult
  const { data: vehicles } = vehiclesResult

  return (
    <DashboardLayout>
      <DriversContent 
        drivers={drivers} 
        count={count} 
        branches={branches} 
        vehicles={(vehicles || []).filter((v): v is typeof v & { Vehicle_Plate: string } => Boolean(v.Vehicle_Plate))}
        subcontractors={subcontractors}
        branchId={searchParams.branchId as string}
        createBulkDrivers={createBulkDrivers}
        isAdminUser={isUserAdmin}
      />
    </DashboardLayout>
  )
}
