import { DashboardClient } from "@/components/dashboard/dashboard-client"
import { getExecutiveDashboardUnified, getProfitHeatmapData } from "@/lib/supabase/financial-analytics"
import { getSOSDriverIds } from "@/lib/supabase/sos"
import { getCustomerName } from "@/lib/supabase/customers"
import { getMarketplaceJobs, getTodayJobStats, getLiveActiveJobs } from "@/lib/supabase/jobs"
import { getDriverStats } from "@/lib/supabase/drivers"
import { isCustomer, getCustomerId, isAdmin, getUserBranchId } from "@/lib/permissions"
import { getActiveFleetStatus } from "@/lib/supabase/gps"
import { getActiveFleetAlerts } from "@/lib/actions/fleet-intelligence-actions"
import { getESGStats } from "@/lib/supabase/esg-analytics"
import { getAllCustomers } from "@/lib/supabase/customers"
import { cookies } from "next/headers"
import { AlertTriangle } from "lucide-react"

interface DashboardContentProps {
  searchParams: { 
    branch?: string; 
    start?: string; 
    end?: string; 
    customers?: string; // Comma separated names
  }
}

export async function DashboardContent({ searchParams }: DashboardContentProps) {
  // Resolve branch using strict permission logic
  const userBranchId = await getUserBranchId()
  const branch = (userBranchId && userBranchId !== 'All') ? userBranchId : (searchParams.branch || 'All')
  const start = searchParams.start
  const end = searchParams.end
  const customers = searchParams.customers ? searchParams.customers.split(',') : []
  
  const currentBranchId = branch === 'All' ? undefined : branch
  
  const isAdminUser = await isAdmin()
  
  // Parallel Fetching - Server Side (Ultra Fast)
  let unified, sosIds, marketplaceJobs: any[], heatmapJobs, activeJobs, customerMode = false, custId: string | null = null, dailyStats, driverStats, fleetAlerts, esgResult, allCustomers;

  try {
    customerMode = await isCustomer()
    custId = (await getCustomerId()) ?? null

    const results = await Promise.allSettled([
      getExecutiveDashboardUnified(currentBranchId, start || undefined, end || undefined, customers),
      getSOSDriverIds(),
      getMarketplaceJobs(currentBranchId),
      Promise.resolve(customerMode),
      Promise.resolve(custId),
      getTodayJobStats(currentBranchId, start || undefined, end || undefined, customers),
      getDriverStats(currentBranchId),
      getESGStats(start || undefined, end || undefined, currentBranchId),
      getActiveFleetAlerts(undefined, currentBranchId),
      getProfitHeatmapData(start || undefined, end || undefined, currentBranchId),
      getAllCustomers(1, 1000, undefined, isAdminUser ? undefined : currentBranchId),
      getLiveActiveJobs(currentBranchId, customerMode ? custId : null)
    ]);

    // Map results with fallbacks
    unified = results[0].status === 'fulfilled' ? results[0].value : { 
        financial: { revenue: 0, netProfit: 0, cost: { total: 0, driver: 0, fuel: 0, maintenance: 0 } }, 
        trend: [], 
        kpi: { margin: { current: 0 }, revenue: { current: 0 }, profit: { current: 0 }, jobs: { current: 0 } },
        esg: { fuelSaved: 0, co2Saved: 0, treesSaved: 0 }
    };
    sosIds = results[1].status === 'fulfilled' ? results[1].value : [];
    marketplaceJobs = results[2].status === 'fulfilled' ? results[2].value : [];
    customerMode = results[3].status === 'fulfilled' ? results[3].value : false;
    custId = (results[4].status === 'fulfilled' ? results[4].value : null) ?? null;
    dailyStats = results[5].status === 'fulfilled' ? results[5].value : { total: 0, delivered: 0, inProgress: 0, pending: 0, sos: 0 };
    driverStats = results[6].status === 'fulfilled' ? results[6].value : { total: 0, active: 0, onJob: 0 };
    esgResult = results[7].status === 'fulfilled' ? results[7].value : null;
    fleetAlerts = results[8].status === 'fulfilled' ? results[8].value : [];
    heatmapJobs = results[9].status === 'fulfilled' ? results[9].value : [];
    allCustomers = results[10].status === 'fulfilled' ? (results[10].value as any).data : [];
    activeJobs = results[11].status === 'fulfilled' ? (results[11].value as any) : [];

  } catch (error) {
    console.error("[Dashboard] Critical data fetch error:", error);
    customerMode = false;
    custId = null;
    dailyStats = { total: 0, delivered: 0, inProgress: 0, pending: 0, sos: 0 };
    driverStats = { total: 0, active: 0, onJob: 0 };
    sosIds = [];
    marketplaceJobs = [];
    heatmapJobs = [];
    unified = { financial: { revenue: 0, netProfit: 0 }, trend: [], kpi: { margin: { current: 0 } } };
    fleetAlerts = [];
  }

  let custName: string | null = custId;
  if (customerMode && custId) {
      try {
        custName = await getCustomerName(custId) || custId
      } catch {
        custName = custId
      }
  }

  // Fetch Live Fleet GPS Status
  let fleetStatus = [];
  try {
    fleetStatus = await getActiveFleetStatus(currentBranchId, customerMode ? custId : null)
  } catch (e) {
    console.warn("[Dashboard] GPS Status fetch failed", e);
  }

  // Handle Missing Customer Profile Error
  if (customerMode && (!custId || custId === 'FORCED_RESTRICTION')) {
    return (
       <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-10 bg-background/50 backdrop-blur-3xl rounded-[3rem] border border-border/10 shadow-2xl">
          <div className="w-24 h-24 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mb-8 animate-bounce">
              <AlertTriangle size={48} />
          </div>
          <h1 className="text-4xl font-black text-foreground mb-4 uppercase italic">SECURITY RESTRICTION</h1>
          <p className="text-muted-foreground max-w-md text-lg font-bold">
             User account detected as CUSTOMER but no Customer ID is linked. Access denied for data integrity.
          </p>
       </div>
    )
  }

  return (
    <DashboardClient 
      branchId={currentBranchId || ""} 
      customerMode={customerMode}
      userName={custName}
      jobStats={dailyStats}
      driverStats={driverStats}
      sosCount={sosIds.length}
      fleetAlertsCount={fleetAlerts.length}
      weeklyStats={unified.trend || []}
      fleetStatus={fleetStatus}
      marketplaceJobs={marketplaceJobs}
      heatmapJobs={heatmapJobs}
      activeJobs={activeJobs}
      fleetHealth={98}
      allCustomers={allCustomers}
      initialCustomers={customers}
      esg={{
        fuelSaved: esgResult?.fuelSavedLiters || unified.esg?.fuelSaved || 0,
        co2Saved: esgResult?.co2SavedKg || unified.esg?.co2Saved || 0,
        treesSaved: esgResult?.treesSaved || unified.esg?.treesSaved || 0
      }}
      initialStart={start}
      initialEnd={end}
    />
  )
}
