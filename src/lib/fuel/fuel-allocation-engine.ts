"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin, isAdmin } from "@/lib/permissions"
import { cookies } from "next/headers"
import type { FuelLog } from "@/lib/supabase/fuel"
import type { Job } from "@/lib/supabase/jobs"
import { parseExtraCosts } from "@/lib/supabase/analytics-helpers"
import { allocateFuelBills, type FuelBillLog, type RunJob, type FuelConfidence, type FuelFlag } from "@/lib/fuel/bill-allocation"

export interface JobFuelAllocation {
  jobId: string;
  planDate: string;
  customerName: string;
  routeName: string;
  originLocation: string;
  destLocation: string;
  driverName: string;
  vehiclePlate: string;
  jobStatus: string;
  distanceKm: number;
  allocatedLiters: number;
  allocatedFuelCost: number;
  /** Fuel cost of the trip's own distance (distance ÷ km/L × price) */
  directFuelCost: number;
  /** Share of the vehicle's real bills not covered by job distance (empty returns / no-job days) */
  gapFuelCost: number;
  /** How the real bills were matched to this job; null = no end fill closed it yet (estimate) */
  fuelMatch: {
    confidence: FuelConfidence;
    ratio: number;
    groupJobs: number;
    fills: string[];
    realKm: number;
    open: boolean;
  } | null;
  kmPerLiter: number;
  fuelCostPerKm: number;
  revenue: number;
  driverCost: number;
  netProfit: number;
  profitMarginPct: number;
}

export interface DailyFuelAggregation {
  date: string;
  totalJobs: number;
  totalDistanceKm: number;
  totalRefueledLiters: number;
  totalConsumedLiters: number;
  totalFuelCost: number;
  avgKmPerLiter: number;
  avgCostPerKm: number;
  totalRevenue: number;
  totalProfit: number;
  vehiclesCount: number;
}

export interface WeeklyFuelAggregation {
  week: string;
  totalJobs: number;
  totalDistanceKm: number;
  totalFuelCost: number;
  totalLiters: number;
  avgKmPerLiter: number;
  totalRevenue: number;
  totalProfit: number;
}

export interface MonthlyFuelAggregation {
  month: string;
  totalJobs: number;
  totalDistanceKm: number;
  totalFuelCost: number;
  totalLiters: number;
  avgKmPerLiter: number;
  totalRevenue: number;
  totalProfit: number;
}

export interface FuelBillReconciliation {
  billCount: number;
  billCost: number;
  billLiters: number;
  /** Odometer span (max − min) of the bills, summed per vehicle */
  odometerKm: number;
  /** Job distance of vehicles that have bills (comparable to odometerKm) */
  jobKmWithBills: number;
  /** Fuel cost by job distance alone */
  directJobCost: number;
  /** Bills − direct cost for vehicles with jobs, spread onto their jobs by distance */
  gapCost: number;
  /** Bills of trucks running with no job in the system (excl. bills of jobs before the period) */
  noJobVehicleCost: number;
  noJobVehiclePlates: string[];
  /** Estimated cost of jobs whose vehicle has no bill (e.g. subcontractors) */
  noBillEstimateCost: number;
  /** Bills dated after the period that closed jobs in it (inside gapCost/allocated) */
  trailingCost: number;
  /** Bills dated in the period that close jobs before it (linked) — counted in that period */
  beforePeriodCost: number;
}

export interface FuelIntelligenceSummary {
  totalJobs: number;
  totalDistanceKm: number;
  totalFuelCost: number;
  totalLiters: number;
  fleetAvgKmPerLiter: number;
  fleetAvgCostPerKm: number;
  totalRevenue: number;
  totalProfit: number;
  avgProfitMarginPct: number;
  /** Reconciliation against the real refuel bills in the period */
  billReconciliation: FuelBillReconciliation;
  /** Fill labels / jobs the admin should review */
  fuelFlags: FuelFlag[];
  jobAllocations: JobFuelAllocation[];
  dailyAggregations: DailyFuelAggregation[];
  weeklyAggregations: WeeklyFuelAggregation[];
  monthlyAggregations: MonthlyFuelAggregation[];
}

/**
 * Core Fuel Intelligence Engine
 * Computes multi-level fuel consumption and profitability based on real Fuel Logs and TMS Jobs
 */
export async function getFuelIntelligenceAnalytics(
  startDate?: string,
  endDate?: string,
  selectedVehicles?: string[],
  providedBranchId?: string
): Promise<FuelIntelligenceSummary> {
  const isSuper = await isSuperAdmin();
  const userBranchId = await getUserBranchId();
  const cookieStore = await cookies();
  const selectedBranch = cookieStore.get('selectedBranch')?.value;
  const effectiveBranch = isSuper ? (providedBranchId || selectedBranch || userBranchId) : (userBranchId || providedBranchId);
  const supabase = createAdminClient();

  // Default to last 30 days
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const start = startDate || defaultStart;
  const end = endDate || now.toISOString().split('T')[0];

  // 1. Fetch Completed / In-Transit Jobs
  let jobsQuery = supabase
    .from('Jobs_Main')
    .select('Job_ID, Plan_Date, Customer_Name, Route_Name, Origin_Location, Dest_Location, Driver_Name, Vehicle_Plate, Job_Status, Price_Cust_Total, Cost_Driver_Total, Price_Cust_Extra, Cost_Driver_Extra, Est_Distance_KM, Loaded_Qty, extra_costs_json')
    .in('Job_Status', ['Completed', 'Delivered', 'Finished', 'Closed', 'Billed', 'Paid', 'Verified', 'In Transit'])
    .gte('Plan_Date', start)
    .lte('Plan_Date', end)
    .order('Plan_Date', { ascending: false });

  if (effectiveBranch && effectiveBranch !== 'All') {
    jobsQuery = jobsQuery.eq('Branch_ID', effectiveBranch);
  }

  if (selectedVehicles && selectedVehicles.length > 0) {
    jobsQuery = jobsQuery.in('Vehicle_Plate', selectedVehicles);
  }

  const { data: jobsData } = await jobsQuery;
  const rawJobs = (jobsData || []) as (Partial<Job> & Record<string, unknown>)[];

  // 2. Fetch Fuel Logs for the period
  let fuelQuery = supabase
    .from('Fuel_Logs')
    .select('*')
    .gte('Date_Time', `${start}T00:00:00`)
    .lte('Date_Time', `${end}T23:59:59`)
    .order('Date_Time', { ascending: false });

  if (effectiveBranch && effectiveBranch !== 'All') {
    fuelQuery = fuelQuery.eq('Branch_ID', effectiveBranch);
  }

  if (selectedVehicles && selectedVehicles.length > 0) {
    fuelQuery = fuelQuery.in('Vehicle_Plate', selectedVehicles);
  }

  const { data: fuelLogsData } = await fuelQuery;
  const rawFuelLogs = (fuelLogsData || []) as FuelLog[];

  // 3. Compute Vehicle-Level Baselines (Actual km/L from Refuels)
  const vehicleRefuels = new Map<string, FuelLog[]>();
  for (const log of rawFuelLogs) {
    if (!log.Vehicle_Plate) continue;
    const list = vehicleRefuels.get(log.Vehicle_Plate) || [];
    list.push(log);
    vehicleRefuels.set(log.Vehicle_Plate, list);
  }

  const vehicleEfficiencyMap = new Map<string, { kmPerLiter: number; avgUnitPrice: number }>();

  vehicleRefuels.forEach((logs, plate) => {
    // Sort chronological
    const sorted = [...logs].sort((a, b) => (a.Date_Time || '').localeCompare(b.Date_Time || ''));
    let totalDist = 0;
    let totalLiters = 0;
    let totalCost = 0;

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.Odometer && curr.Odometer && curr.Odometer > prev.Odometer && curr.Liters > 0) {
        totalDist += (curr.Odometer - prev.Odometer);
        totalLiters += curr.Liters;
      }
    }

    logs.forEach(l => {
      totalCost += (l.Price_Total || 0);
      if (!totalLiters) totalLiters += (l.Liters || 0);
    });

    const kmPerLiter = totalDist > 0 && totalLiters > 0 ? +(totalDist / totalLiters).toFixed(2) : 8.5; // Default 8.5 km/L
    const avgUnitPrice = totalCost > 0 && totalLiters > 0 ? +(totalCost / totalLiters).toFixed(2) : 38.0; // Default 38 THB/L

    vehicleEfficiencyMap.set(plate, { kmPerLiter, avgUnitPrice });
  });

  // 3b. Bucket ACTUAL full-to-full consumption per vehicle-day.
  // Real per-trip fuel: match each refuel bill to the trip(s) that burned it,
  // instead of smearing one flat vehicle-average km/L over every trip (which
  // makes every trip show an identical, unrealistic km/L). Each odometer span
  // (prev fill → this fill) is the fuel actually consumed before this fill, so
  // we attribute its km + litres + cost to the date of the closing fill.
  const MIN_KMPL = 2;
  const MAX_KMPL = 30; // guard odometer typos / partial fills — implausible spans fall back
  type DayFuel = { km: number; liters: number; cost: number };
  const vehicleDayFuel = new Map<string, DayFuel>(); // key `${plate}|${YYYY-MM-DD}`

  vehicleRefuels.forEach((logs, plate) => {
    const eff = vehicleEfficiencyMap.get(plate);
    const sorted = [...logs]
      .filter(l => l.Odometer && (l.Odometer as number) > 0 && l.Liters > 0)
      .sort((a, b) => (a.Odometer as number) - (b.Odometer as number));
    if (sorted.length < 2) return;

    // Full-to-full cycles honoring Trip_Fill_Type:
    //   • "end" (or unset) fills CLOSE a cycle — the tank is back to full after a
    //     finished trip, so liters added ≈ what was consumed since the last close.
    //   • "enroute" fills DO NOT close a cycle — they are mid-trip top-ups, so
    //     their litres accumulate into the ongoing cycle and the cycle only closes
    //     at the next "end" fill. Treating an enroute fill as a boundary would
    //     split one trip into two and skew its km/L.
    const isClosing = (l: FuelLog) => l.Trip_Fill_Type !== 'enroute';

    let startOdo = sorted[0].Odometer as number; // anchor (fill before the first cycle)
    let accumLiters = 0;
    let accumCost = 0;
    let cycleDates: string[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      accumLiters += curr.Liters;
      accumCost += curr.Price_Total || curr.Liters * (eff?.avgUnitPrice || 38);
      const currDate = (curr.Date_Time || '').slice(0, 10);
      if (currDate && !cycleDates.includes(currDate)) {
        cycleDates.push(currDate);
      }

      if (!isClosing(curr)) continue; // enroute → keep accumulating, don't close

      const km = (curr.Odometer as number) - startOdo;
      if (km > 0 && accumLiters > 0) {
        const kmpl = km / accumLiters;
        if (kmpl >= MIN_KMPL && kmpl <= MAX_KMPL) { // guard odometer typos / partial fills
          // Attribute cycle efficiency to all dates spanned by this cycle
          for (const d of cycleDates) {
            const key = `${plate}|${d}`;
            const b = vehicleDayFuel.get(key) || { km: 0, liters: 0, cost: 0 };
            b.km += km;
            b.liters += accumLiters;
            b.cost += accumCost;
            vehicleDayFuel.set(key, b);
          }
        }
      }
      // Start the next cycle from this closing fill.
      startOdo = curr.Odometer as number;
      accumLiters = 0;
      accumCost = 0;
      cycleDates = [];
    }
  });

  // Per (plate|date): total estimated distance and trip count, so a day with
  // several trips splits its actual fuel by each trip's distance share.
  const dayEstDistance = new Map<string, number>();
  const dayTripCount = new Map<string, number>();
  for (const j of rawJobs) {
    const key = `${String(j.Vehicle_Plate || '')}|${String(j.Plan_Date || '').slice(0, 10)}`;
    dayEstDistance.set(key, (dayEstDistance.get(key) || 0) + (Number(j.Est_Distance_KM) || 0));
    dayTripCount.set(key, (dayTripCount.get(key) || 0) + 1);
  }

  // 4. Allocate Fuel to Jobs (actual bill → trip; vehicle-average fallback)
  const jobAllocations: JobFuelAllocation[] = [];

  for (const j of rawJobs) {
    const plate = String(j.Vehicle_Plate || '');
    const date = String(j.Plan_Date || '').slice(0, 10);
    const estDist = Number(j.Est_Distance_KM) || 0;
    const eff = vehicleEfficiencyMap.get(plate) || { kmPerLiter: 8.5, avgUnitPrice: 38.0 };

    const bucketKey = `${plate}|${date}`;
    const bucket = vehicleDayFuel.get(bucketKey);

    // In TMS operations, each job's physical distance is its planned/system route distance (estDist).
    // It must not be overwritten by an odometer slice from partial refuels.
    const dist = estDist;

    let consumedLiters: number;
    let fuelCost: number;
    let kmPerLiter: number;

    // Use vehicle efficiency baseline or day-specific actual consumption rate if plausible
    if (bucket && bucket.km > 0 && bucket.liters > 0) {
      const dayKmPerLiter = +(bucket.km / bucket.liters).toFixed(2);
      const dayUnitPrice = bucket.cost > 0 ? +(bucket.cost / bucket.liters).toFixed(2) : eff.avgUnitPrice;

      // Plausibility guard for day-level km/L (between MIN_KMPL and MAX_KMPL)
      if (dayKmPerLiter >= MIN_KMPL && dayKmPerLiter <= MAX_KMPL) {
        kmPerLiter = dayKmPerLiter;
        consumedLiters = dist > 0 ? +(dist / kmPerLiter).toFixed(2) : 0;
        fuelCost = dist > 0 ? +(consumedLiters * dayUnitPrice).toFixed(2) : 0;
      } else {
        kmPerLiter = eff.kmPerLiter;
        consumedLiters = dist > 0 ? +(dist / eff.kmPerLiter).toFixed(2) : 0;
        fuelCost = dist > 0 ? +(consumedLiters * eff.avgUnitPrice).toFixed(2) : 0;
      }
    } else {
      // Fallback: no matching bill this day → vehicle baseline on estimated distance.
      kmPerLiter = eff.kmPerLiter;
      consumedLiters = dist > 0 ? +(dist / eff.kmPerLiter).toFixed(2) : 0;
      fuelCost = dist > 0 ? +(consumedLiters * eff.avgUnitPrice).toFixed(2) : 0;
    }
    const fuelCostPerKm = dist > 0 ? +(fuelCost / dist).toFixed(2) : 0;

    const extraItems = parseExtraCosts(j.extra_costs_json);
    const extraItemsDriver = extraItems.reduce((s, c) => s + (Number(c?.cost_driver) || 0), 0);
    const extraItemsCharge = extraItems.reduce((s, c) => s + (Number(c?.charge_cust) || 0), 0);

    const revenue = (Number(j.Price_Cust_Total) || 0) + (Number(j.Price_Cust_Extra) || 0) + extraItemsCharge;
    const driverCost = (Number(j.Cost_Driver_Total) || 0) + (Number(j.Cost_Driver_Extra) || 0) + extraItemsDriver;
    const netProfit = +(revenue - driverCost - fuelCost).toFixed(2);
    const profitMarginPct = revenue > 0 ? +((netProfit / revenue) * 100).toFixed(1) : 0;

    jobAllocations.push({
      jobId: String(j.Job_ID || ''),
      planDate: String(j.Plan_Date || ''),
      customerName: String(j.Customer_Name || '-'),
      routeName: String(j.Route_Name || '-'),
      originLocation: String(j.Origin_Location || '-'),
      destLocation: String(j.Dest_Location || '-'),
      driverName: String(j.Driver_Name || '-'),
      vehiclePlate: plate || '-',
      jobStatus: String(j.Job_Status || ''),
      distanceKm: dist,
      allocatedLiters: consumedLiters,
      allocatedFuelCost: fuelCost,
      directFuelCost: fuelCost,
      gapFuelCost: 0,
      fuelMatch: null,
      kmPerLiter,
      fuelCostPerKm,
      revenue,
      driverCost,
      netProfit,
      profitMarginPct
    });
  }

  // 4b. Real bills → jobs (shared with the Trip Performance report): each end
  // fill closes the latest jobs, odometer-checked groups, confidence + flags.
  let priorQuery = supabase
    .from('Fuel_Logs')
    .select('Log_ID, Vehicle_Plate, Date_Time, Price_Total, Liters, Odometer, Trip_Fill_Type')
    .gte('Date_Time', `${new Date(new Date(`${start}T00:00:00`).getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}T00:00:00`)
    .lt('Date_Time', `${start}T00:00:00`);
  if (effectiveBranch && effectiveBranch !== 'All') priorQuery = priorQuery.eq('Branch_ID', effectiveBranch);
  if (selectedVehicles && selectedVehicles.length > 0) priorQuery = priorQuery.in('Vehicle_Plate', selectedVehicles);
  const { data: priorLogs } = await priorQuery;

  // Bills after the period: the end fill that closes the period's last job may
  // come the next morning or after a holiday (only admin-linked ones are used).
  let trailingQuery = supabase
    .from('Fuel_Logs')
    .select('*')
    .gt('Date_Time', `${end}T23:59:59`)
    .lte('Date_Time', `${new Date(new Date(`${end}T00:00:00`).getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}T23:59:59`);
  if (effectiveBranch && effectiveBranch !== 'All') trailingQuery = trailingQuery.eq('Branch_ID', effectiveBranch);
  if (selectedVehicles && selectedVehicles.length > 0) trailingQuery = trailingQuery.in('Vehicle_Plate', selectedVehicles);
  const { data: trailingLogs } = await trailingQuery;

  const { vehicles: vehicleBills, share: billShare, flags: fuelFlags } = allocateFuelBills(
    rawFuelLogs,
    (priorLogs || []) as FuelBillLog[],
    rawJobs as RunJob[],
    (trailingLogs || []) as FuelBillLog[],
  );

  // Jobs no fill has closed yet: company trucks get a round-trip estimate from the
  // truck's own bills; subcontracted trucks (รถร่วม) pay their own fuel → 0.
  const runPlates = Array.from(new Set(jobAllocations.map(j => j.vehiclePlate).filter(p => p && p !== '-')));
  const { data: ownerRows } = runPlates.length
    ? await supabase.from('Master_Vehicles').select('Vehicle_Plate, Owner_Type').in('Vehicle_Plate', runPlates)
    : { data: [] as { Vehicle_Plate: string; Owner_Type?: string | null }[] };
  const companyPlates = new Set((ownerRows || []).filter((v: { Owner_Type?: string | null }) => String(v.Owner_Type || '').toLowerCase() === 'company').map((v: { Vehicle_Plate: string }) => v.Vehicle_Plate));

  for (const a of jobAllocations) {
    const share = billShare(a.jobId);
    if (!share) {
      a.allocatedFuelCost = companyPlates.has(a.vehiclePlate) ? +(a.directFuelCost * 2).toFixed(2) : 0;
      a.allocatedLiters = companyPlates.has(a.vehiclePlate) ? +(a.allocatedLiters * 2).toFixed(2) : 0;
      a.fuelCostPerKm = a.distanceKm > 0 ? +(a.allocatedFuelCost / a.distanceKm).toFixed(2) : 0;
      a.netProfit = +(a.revenue - a.driverCost - a.allocatedFuelCost).toFixed(2);
      a.profitMarginPct = a.revenue > 0 ? +((a.netProfit / a.revenue) * 100).toFixed(1) : 0;
      continue;
    }
    a.allocatedFuelCost = share.fuelCost;
    a.fuelMatch = {
      confidence: share.confidence,
      ratio: share.ratio,
      groupJobs: share.groupJobs,
      fills: share.fills,
      realKm: share.realKm,
      open: share.open,
    };
    a.gapFuelCost = +(a.allocatedFuelCost - a.directFuelCost).toFixed(2);
    a.fuelCostPerKm = a.distanceKm > 0 ? +(a.allocatedFuelCost / a.distanceKm).toFixed(2) : 0;
    a.netProfit = +(a.revenue - a.driverCost - a.allocatedFuelCost).toFixed(2);
    a.profitMarginPct = a.revenue > 0 ? +((a.netProfit / a.revenue) * 100).toFixed(1) : 0;
  }

  // Matched jobs: direct (distance) cost + gap = their bills. Unmatched jobs keep
  // the distance estimate. Bills = direct + gap + no-job groups.
  const matched = jobAllocations.filter(j => j.fuelMatch);
  const unmatched = jobAllocations.filter(j => !j.fuelMatch);
  const billReconciliation: FuelBillReconciliation = {
    billCount: rawFuelLogs.length,
    billCost: 0,
    billLiters: 0,
    odometerKm: +matched.reduce((s, j) => s + (j.fuelMatch?.realKm || 0), 0).toFixed(2),
    jobKmWithBills: +matched.reduce((s, j) => s + j.distanceKm, 0).toFixed(2),
    directJobCost: +matched.reduce((s, j) => s + j.directFuelCost, 0).toFixed(2),
    gapCost: +matched.reduce((s, j) => s + j.gapFuelCost, 0).toFixed(2),
    noJobVehicleCost: 0,
    noJobVehiclePlates: [],
    noBillEstimateCost: +unmatched.reduce((s, j) => s + j.allocatedFuelCost, 0).toFixed(2),
    trailingCost: 0,
    beforePeriodCost: 0,
  };
  vehicleBills.forEach((v, plate) => {
    // bills dated in the period; post-period bills that closed jobs here are reported apart
    billReconciliation.billCost += v.total.cost - v.trailing.cost;
    billReconciliation.billLiters += v.total.liters - v.trailing.liters;
    billReconciliation.trailingCost += v.trailing.cost;
    billReconciliation.beforePeriodCost += v.beforePeriod.cost;
    if (v.uncovered.cost - v.beforePeriod.cost > 0) {
      billReconciliation.noJobVehicleCost += v.uncovered.cost - v.beforePeriod.cost;
      billReconciliation.noJobVehiclePlates.push(`${plate} (${v.uncovered.dates.map(d => d.slice(8, 10) + '/' + d.slice(5, 7)).join(', ')})`);
    }
  });
  billReconciliation.billCost = +billReconciliation.billCost.toFixed(2);
  billReconciliation.billLiters = +billReconciliation.billLiters.toFixed(2);
  billReconciliation.odometerKm = +billReconciliation.odometerKm.toFixed(2);
  billReconciliation.jobKmWithBills = +billReconciliation.jobKmWithBills.toFixed(2);
  billReconciliation.gapCost = +billReconciliation.gapCost.toFixed(2);
  billReconciliation.noJobVehicleCost = +billReconciliation.noJobVehicleCost.toFixed(2);
  billReconciliation.noBillEstimateCost = +billReconciliation.noBillEstimateCost.toFixed(2);
  billReconciliation.trailingCost = +billReconciliation.trailingCost.toFixed(2);
  billReconciliation.beforePeriodCost = +billReconciliation.beforePeriodCost.toFixed(2);

  // 5. Daily Aggregation
  const dailyMap = new Map<string, DailyFuelAggregation>();
  
  // Initialize with jobs
  for (const a of jobAllocations) {
    const d = a.planDate || start;
    const curr = dailyMap.get(d) || {
      date: d,
      totalJobs: 0,
      totalDistanceKm: 0,
      totalRefueledLiters: 0,
      totalConsumedLiters: 0,
      totalFuelCost: 0,
      avgKmPerLiter: 0,
      avgCostPerKm: 0,
      totalRevenue: 0,
      totalProfit: 0,
      vehiclesCount: 0
    };

    curr.totalJobs += 1;
    curr.totalDistanceKm = +(curr.totalDistanceKm + a.distanceKm).toFixed(2);
    curr.totalConsumedLiters = +(curr.totalConsumedLiters + a.allocatedLiters).toFixed(2);
    curr.totalFuelCost = +(curr.totalFuelCost + a.allocatedFuelCost).toFixed(2);
    curr.totalRevenue = +(curr.totalRevenue + a.revenue).toFixed(2);
    curr.totalProfit = +(curr.totalProfit + a.netProfit).toFixed(2);
    dailyMap.set(d, curr);
  }

  // Add refueled liters from Fuel_Logs
  for (const f of rawFuelLogs) {
    const d = (f.Date_Time || '').slice(0, 10);
    if (!d) continue;
    const curr = dailyMap.get(d) || {
      date: d,
      totalJobs: 0,
      totalDistanceKm: 0,
      totalRefueledLiters: 0,
      totalConsumedLiters: 0,
      totalFuelCost: 0,
      avgKmPerLiter: 0,
      avgCostPerKm: 0,
      totalRevenue: 0,
      totalProfit: 0,
      vehiclesCount: 0
    };
    curr.totalRefueledLiters = +(curr.totalRefueledLiters + (f.Liters || 0)).toFixed(2);
    dailyMap.set(d, curr);
  }

  const dailyAggregations = Array.from(dailyMap.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(d => ({
      ...d,
      avgKmPerLiter: d.totalConsumedLiters > 0 ? +(d.totalDistanceKm / d.totalConsumedLiters).toFixed(2) : 0,
      avgCostPerKm: d.totalDistanceKm > 0 ? +(d.totalFuelCost / d.totalDistanceKm).toFixed(2) : 0
    }));

  // 6. Weekly Aggregation
  const weeklyMap = new Map<string, WeeklyFuelAggregation>();
  for (const d of dailyAggregations) {
    const weekKey = getWeekKey(d.date);
    const curr = weeklyMap.get(weekKey) || {
      week: weekKey,
      totalJobs: 0,
      totalDistanceKm: 0,
      totalFuelCost: 0,
      totalLiters: 0,
      avgKmPerLiter: 0,
      totalRevenue: 0,
      totalProfit: 0
    };

    curr.totalJobs += d.totalJobs;
    curr.totalDistanceKm = +(curr.totalDistanceKm + d.totalDistanceKm).toFixed(2);
    curr.totalFuelCost = +(curr.totalFuelCost + d.totalFuelCost).toFixed(2);
    curr.totalLiters = +(curr.totalLiters + d.totalConsumedLiters).toFixed(2);
    curr.totalRevenue = +(curr.totalRevenue + d.totalRevenue).toFixed(2);
    curr.totalProfit = +(curr.totalProfit + d.totalProfit).toFixed(2);
    weeklyMap.set(weekKey, curr);
  }

  const weeklyAggregations = Array.from(weeklyMap.values())
    .sort((a, b) => b.week.localeCompare(a.week))
    .map(w => ({
      ...w,
      avgKmPerLiter: w.totalLiters > 0 ? +(w.totalDistanceKm / w.totalLiters).toFixed(2) : 0
    }));

  // 7. Monthly Aggregation
  const monthlyMap = new Map<string, MonthlyFuelAggregation>();
  for (const d of dailyAggregations) {
    const monthKey = d.date.slice(0, 7);
    const curr = monthlyMap.get(monthKey) || {
      month: monthKey,
      totalJobs: 0,
      totalDistanceKm: 0,
      totalFuelCost: 0,
      totalLiters: 0,
      avgKmPerLiter: 0,
      totalRevenue: 0,
      totalProfit: 0
    };

    curr.totalJobs += d.totalJobs;
    curr.totalDistanceKm = +(curr.totalDistanceKm + d.totalDistanceKm).toFixed(2);
    curr.totalFuelCost = +(curr.totalFuelCost + d.totalFuelCost).toFixed(2);
    curr.totalLiters = +(curr.totalLiters + d.totalConsumedLiters).toFixed(2);
    curr.totalRevenue = +(curr.totalRevenue + d.totalRevenue).toFixed(2);
    curr.totalProfit = +(curr.totalProfit + d.totalProfit).toFixed(2);
    monthlyMap.set(monthKey, curr);
  }

  const monthlyAggregations = Array.from(monthlyMap.values())
    .sort((a, b) => b.month.localeCompare(a.month))
    .map(m => ({
      ...m,
      avgKmPerLiter: m.totalLiters > 0 ? +(m.totalDistanceKm / m.totalLiters).toFixed(2) : 0
    }));

  // Macro Summary
  const totalJobs = jobAllocations.length;
  const totalDistanceKm = +jobAllocations.reduce((s, j) => s + j.distanceKm, 0).toFixed(2);
  const totalFuelCost = +jobAllocations.reduce((s, j) => s + j.allocatedFuelCost, 0).toFixed(2);
  const totalLiters = +jobAllocations.reduce((s, j) => s + j.allocatedLiters, 0).toFixed(2);
  const totalRevenue = +jobAllocations.reduce((s, j) => s + j.revenue, 0).toFixed(2);
  const totalProfit = +jobAllocations.reduce((s, j) => s + j.netProfit, 0).toFixed(2);
  const fleetAvgKmPerLiter = totalLiters > 0 ? +(totalDistanceKm / totalLiters).toFixed(2) : 0;
  const fleetAvgCostPerKm = totalDistanceKm > 0 ? +(totalFuelCost / totalDistanceKm).toFixed(2) : 0;
  const avgProfitMarginPct = totalRevenue > 0 ? +((totalProfit / totalRevenue) * 100).toFixed(1) : 0;

  return {
    totalJobs,
    totalDistanceKm,
    totalFuelCost,
    totalLiters,
    fleetAvgKmPerLiter,
    fleetAvgCostPerKm,
    totalRevenue,
    totalProfit,
    avgProfitMarginPct,
    billReconciliation,
    fuelFlags,
    jobAllocations,
    dailyAggregations,
    weeklyAggregations,
    monthlyAggregations
  };
}

function getWeekKey(isoDate: string): string {
  const d = new Date(isoDate);
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const pastDaysOfYear = (d.getTime() - startOfYear.getTime()) / 86400000;
  const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}
