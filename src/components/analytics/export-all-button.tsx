"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { exportToCSV } from "@/lib/utils/export"

interface Financials {
    revenue: number;
    cost: {
        total: number;
        driver: number;
        fuel: number;
        maintenance: number;
        secondary: number;
    };
    netProfit: number;
    profitMargin: number;
}

interface StatusDistItem {
    name: string;
    value: number;
}

interface BranchPerformance {
    branchId: string;
    branchName: string;
    revenue: number;
    jobsCount: number;
    profit: number;
}

interface ExportAllButtonProps {
    data: {
        financials: {
            revenue: number;
            cost?: { driver?: number; fuel?: number; maintenance?: number; secondary?: number; };
            netProfit?: number;
            profitMargin?: number;
        };
        revenueTrend: unknown[];
        topCustomers: { name?: string; revenue?: number; jobCount?: number; }[];
        statusDist: { value: number; }[];
        branchPerf: Record<string, unknown>[];
        subPerf: unknown[];
        billing: unknown;
        fuel: { vehicleBreakdown?: { vehicle_plate?: string; totalLiters?: number; totalCost?: number; avgEfficiency?: number; logCount?: number; }[]; };
        maintenance: unknown;
        safety: { sos?: { recentAlerts?: { time?: string; vehicle?: string; driver?: string; reason?: string; id?: string; }[]; }; };
        workforce: unknown;
        routes: unknown;
        driverLeaderboard?: { name?: string; completedJobs?: number; onTimeRate?: number; revenue?: number; avgMargin?: number; }[];
        vehicleProfitability?: { plate?: string; revenue?: number; cost?: number; profit?: number; margin?: number; status?: string; }[];
        esgStats?: { co2SavedKg?: number; };
        opStats?: { fleet?: { onTimeDelivery?: number; utilization?: number; }; };
    }
}

export function ExportAllButton({ data }: ExportAllButtonProps) {
    const handleExportAll = () => {
        const timestamp = new Date().toISOString().split('T')[0];

        // 1. Summary Report (KPIs)
        const summary = [{
            report_date: timestamp,
            total_revenue: data.financials.revenue,
            net_profit: data.financials.netProfit,
            profit_margin: `${data.financials.profitMargin?.toFixed(2)}%`,
            driver_costs: data.financials.cost?.driver || 0,
            fuel_costs: data.financials.cost?.fuel || 0,
            maintenance_costs: data.financials.cost?.maintenance || 0,
            secondary_costs: data.financials.cost?.secondary || 0,
            total_jobs: data.statusDist.reduce((sum: number, item: { value: number; }) => sum + item.value, 0),
            on_time_delivery_rate: `${data.opStats?.fleet?.onTimeDelivery?.toFixed(1) || 0}%`,
            fleet_utilization: `${data.opStats?.fleet?.utilization?.toFixed(1) || 0}%`,
            esg_co2_saved_kg: data.esgStats?.co2SavedKg || 0
        }];
        exportToCSV(summary, "executive_summary_report");

        // 2. Branch Performance
        if (data.branchPerf?.length) {
            exportToCSV(data.branchPerf, "branch_performance_detailed");
        }

        // 3. Customer Performance
        if (data.topCustomers?.length) {
            const customerReport = data.topCustomers.map(c => ({
                customer_name: c.name || 'Unknown',
                total_revenue: c.revenue || 0,
                job_count: c.jobCount || 0,
                avg_revenue_per_job: (c.jobCount && c.jobCount > 0 && c.revenue) ? (c.revenue / c.jobCount).toFixed(2) : 0
            }));
            exportToCSV(customerReport, "customer_revenue_ranking");
        }

        // 4. Fleet & Vehicle Profitability
        if (data.vehicleProfitability?.length) {
            const fleetReport = data.vehicleProfitability.map(v => ({
                vehicle_plate: v.plate,
                total_revenue: v.revenue,
                total_cost: v.cost,
                net_profit: v.profit,
                margin: `${v.margin?.toFixed(2) || 0}%`,
                status: v.status
            }));
            exportToCSV(fleetReport, "fleet_profitability_breakdown");
        }

        // 5. Driver Performance Leaderboard
        if (data.driverLeaderboard?.length) {
            const driverReport = data.driverLeaderboard.map(d => ({
                driver_name: d.name,
                completed_jobs: d.completedJobs,
                on_time_rate: `${d.onTimeRate?.toFixed(1) || 0}%`,
                total_revenue: d.revenue,
                avg_margin: `${d.avgMargin?.toFixed(2) || 0}%`
            }));
            exportToCSV(driverReport, "driver_performance_leaderboard");
        }

        // 6. Fuel Analytics Detailed
        if (data.fuel?.vehicleBreakdown?.length) {
            const fuelReport = data.fuel.vehicleBreakdown.map((f: { vehicle_plate?: string; totalLiters?: number; totalCost?: number; avgEfficiency?: number; logCount?: number; }) => ({
                vehicle_plate: f.vehicle_plate,
                total_liters: f.totalLiters,
                total_cost: f.totalCost,
                efficiency_km_per_l: f.avgEfficiency,
                log_count: f.logCount
            }));
            exportToCSV(fuelReport, "fleet_fuel_efficiency_report");
        }

        // 7. Safety & Incidents
        if (data.safety?.sos?.recentAlerts?.length) {
            const safetyReport = data.safety.sos.recentAlerts.map((s: { time?: string; vehicle?: string; driver?: string; reason?: string; id?: string; }) => ({
                date_time: s.time,
                vehicle: s.vehicle,
                driver: s.driver,
                reason: s.reason,
                job_id: s.id
            }));
            exportToCSV(safetyReport, "safety_incidents_report");
        }
    };

    return (
        <Button 
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            onClick={handleExportAll}
        >
            <Download className="mr-2 h-4 w-4" /> Export Monthly Report
        </Button>
    );
}
