export const dynamic = 'force-dynamic'
export const revalidate = 0

import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { getAllFuelLogs } from "@/lib/supabase/fuel"
import { getAllDrivers } from "@/lib/supabase/drivers"
import { getAllVehicles } from "@/lib/supabase/vehicles"
import { getFuelAnalytics } from "@/lib/supabase/fuel-analytics"
import { getFuelIntelligenceAnalytics } from "@/lib/fuel/fuel-allocation-engine"
import { getAllBranches } from "@/lib/supabase/branches"
import { isSuperAdmin, getUserBranchId } from "@/lib/permissions"
import { cookies } from "next/headers"
import { FuelClient } from "./fuel-client"
import { getFuelClosingCandidates } from "./actions"
import { getFuelCyclesByIds } from "@/lib/fuel/fuel-cycles"

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function FuelPage(props: Props) {
  const searchParams = await props.searchParams
  const page = Number(searchParams.page) || 1
  const query = (searchParams.q as string) || ''
  const startDate = (searchParams.startDate as string) || ''
  const endDate = (searchParams.endDate as string) || ''
  const branchParam = (searchParams.branch as string) || ''
  const vehiclesParam = searchParams.vehicles
  const selectedVehicles = typeof vehiclesParam === 'string'
    ? vehiclesParam.split(',').filter(Boolean)
    : (Array.isArray(vehiclesParam) ? (vehiclesParam as string[]) : undefined)
  const limit = 20

  const isSuper = await isSuperAdmin()
  const userBranchId = await getUserBranchId()
  const cookieStore = await cookies()
  const selectedBranch = cookieStore.get('selectedBranch')?.value

  // Determine effective branch strictly
  let effectiveBranch: string | undefined = undefined
  if (isSuper) {
    if (branchParam && branchParam !== 'All') {
      effectiveBranch = branchParam
    } else if (selectedBranch && selectedBranch !== 'All' && selectedBranch !== 'ทุกสาขา') {
      effectiveBranch = selectedBranch
    }
  } else {
    if (userBranchId && userBranchId !== 'All') {
      effectiveBranch = userBranchId
    }
  }

  const [{ data: logs, count }, drivers, vehicles, analytics, intelligence, branches] = await Promise.all([
    getAllFuelLogs(page, limit, query, startDate, endDate, selectedVehicles, effectiveBranch),
    getAllDrivers(undefined, undefined, undefined, effectiveBranch),
    getAllVehicles(undefined, undefined, undefined, effectiveBranch),
    getFuelAnalytics(startDate || undefined, endDate || undefined, effectiveBranch),
    getFuelIntelligenceAnalytics(startDate || undefined, endDate || undefined, selectedVehicles, effectiveBranch),
    getAllBranches()
  ])

  // Jobs an end fill on this page could close (admin links fill → job)
  // Fill cycles closed by the bills on this page (abnormal-use check)
  const [closingCandidates, fuelCycles] = await Promise.all([
    getFuelClosingCandidates(logs || []),
    getFuelCyclesByIds((logs || []).map((l: { Log_ID: string }) => l.Log_ID)),
  ])

  // แสดงเฉพาะรถบริษัท (Owner_Type = 'company') — รถร่วม/รถอิสระ (independent/sub)
  // บริษัทไม่ได้เติมน้ำมันให้และไม่รู้ยอดเติม จึงไม่ต้องโชว์ในเมนูบันทึกน้ำมัน
  // NB: เดิมกรองด้วย "Sub_ID ว่าง" ซึ่งพลาด รถ independent 32 คัน (Sub_ID ว่างแต่เป็นรถร่วม)
  // หลุดเข้ามา — Owner_Type คือตัวแยกที่ถูกต้อง (company / independent / sub)
  const companyVehicles = (vehicles.data || []).filter(
    (v: { Owner_Type?: string | null }) => String(v.Owner_Type || '').toLowerCase() === 'company'
  )

  return (
    <DashboardLayout>
      <FuelClient
          logs={logs}
          closingCandidates={closingCandidates}
          fuelCycles={fuelCycles}
          count={count}
          drivers={drivers.data}
          vehicles={companyVehicles}
          analytics={analytics}
          intelligence={intelligence}
          branches={branches || []}
          activeBranch={effectiveBranch || 'All'}
          isSuperAdmin={isSuper}
          limit={limit}
          startDate={startDate}
          endDate={endDate}
          selectedVehicles={selectedVehicles}
      />
    </DashboardLayout>
  )
}
