import { ExecutiveDashboardClient } from "@/components/dashboard/executive-dashboard-client"
import { 
    getExecutiveDashboardUnified,
    getFuelAnomalyAlerts
} from "@/lib/supabase/financial-analytics"
import { 
    getFleetComplianceMetrics,
    getFleetHealthScore
} from "@/lib/supabase/fleet-analytics"
import { getSetting } from "@/lib/supabase/settings"
import { cookies } from "next/headers"
import { getUserBranchId } from "@/lib/permissions"
import { Suspense } from "react"

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ 
    branch?: string; 
  }>
}

async function ExecutiveContent({ branch }: { branch: string }) {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const branchId = branch === 'All' ? undefined : branch
    
    // Parallel Fetching - Server Side
    const [
        unifiedData,
        fuelAlerts,
        complianceMetrics,
        healthScore,
        savedRemark
    ] = await Promise.all([
        getExecutiveDashboardUnified(branchId),
        getFuelAnomalyAlerts(branchId),
        getFleetComplianceMetrics(branchId),
        getFleetHealthScore(branchId),
        getSetting(`exec_remark_${currentMonth}_${branch}`, "")
    ])

    // Process compliance for the UI format
    const expiredCount = complianceMetrics.filter((m: { status: string }) => m.status === 'expiredSoon').length
    const expiringCount = complianceMetrics.filter((m: { status: string }) => m.status === 'expiring').length
    
    const compliance = { 
        score: expiredCount > 0 ? 60 : expiringCount > 0 ? 85 : 100, 
        status: expiredCount > 0 ? 'Critical' : expiringCount > 0 ? 'Warning' : 'Excellent', 
        details: complianceMetrics.map((m: { name: string; daysLeft: number }) => ({ label: m.name.split(' ')[0], value: m.daysLeft > 0 ? 100 : 0 }))
    }

    const health = { 
        score: healthScore, 
        status: healthScore >= 90 ? 'Healthy' : healthScore >= 70 ? 'Stable' : 'Critical', 
        metrics: [
            { label: 'Availability', value: healthScore },
            { label: 'Uptime', value: 99 },
            { label: 'Active', value: healthScore }
        ] 
    }

    return (
        <ExecutiveDashboardClient 
            initialData={{ ...unifiedData, fuelAlerts, compliance, health }}
            initialRemark={savedRemark}
            branchId={branch}
            currentMonth={currentMonth}
        />
    )
}

export default async function ExecutiveDashboardPage(props: PageProps) {
    const searchParams = await props.searchParams
    const userBranchId = await getUserBranchId()
    const branch = (userBranchId && userBranchId !== 'All') ? userBranchId : (searchParams.branch || 'All')

    return (
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-primary animate-pulse font-black uppercase tracking-[0.3em] text-lg">
                    LOADING_EXECUTIVE_INTELLIGENCE...
                </p>
            </div>
        }>
            <ExecutiveContent branch={branch} />
        </Suspense>
    )
}
