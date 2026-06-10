import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { DriversContent } from "@/components/drivers/drivers-content"
import { isAdmin } from "@/lib/permissions"
import { getAllBranches, Branch } from "@/lib/supabase/branches"
import { getAllDrivers, createBulkDrivers } from "@/lib/supabase/drivers"
import { getAllVehicles } from "@/lib/supabase/vehicles"
import { getAllSubcontractors } from "@/lib/supabase/subcontractors"

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DriversPage(props: Props) {
  const searchParams = await props.searchParams
  const isUserAdmin = await isAdmin()
  const branchesData = isUserAdmin ? await getAllBranches() : []
  const branches: Branch[] = branchesData || []

  const page = Number(searchParams.page) || 1
  const query = (searchParams.query as string) || ''
  
  // Fetch drivers with pagination and search
  const { data: drivers, count } = await getAllDrivers(page, 12, query, searchParams.branchId as string)
  
  // Fetch vehicles and subcontractors for the dialogs
  const { data: vehicles } = await getAllVehicles()
  const subcontractors = await getAllSubcontractors()

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
