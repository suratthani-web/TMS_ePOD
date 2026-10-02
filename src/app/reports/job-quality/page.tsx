import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { createAdminClient } from "@/utils/supabase/server"
import { getUserBranchId, isAdmin } from "@/lib/permissions"
import { computeJobQuality } from "@/lib/reports/job-quality"
import { isValidYmd, periodOf, todayBkk } from "@/lib/reports/period"
import { JobQualityClient } from "./job-quality-client"

export const dynamic = "force-dynamic"

type Props = { searchParams: Promise<{ type?: string; start?: string }> }

/** Internal only: paperwork quality per driver (never shown to customers). */
export default async function JobQualityPage(props: Props) {
    const sp = await props.searchParams
    const type = sp.type === "weekly" ? "weekly" : "monthly"
    // default = the current month so far (ops follow-up), navigable back
    const period = periodOf(type, isValidYmd(sp.start) ? sp.start : todayBkk())

    if (!(await isAdmin())) {
        return (
            <DashboardLayout>
                <p className="mx-auto max-w-xl rounded-xl border border-red-300 bg-red-50 p-6 text-red-700">หน้านี้สำหรับแอดมินเท่านั้น</p>
            </DashboardLayout>
        )
    }
    const branch = await getUserBranchId()
    const data = await computeJobQuality(createAdminClient(), {
        start: period.start,
        end: period.end,
        branchId: branch && branch !== "All" ? branch : null,
    })

    return (
        <DashboardLayout>
            <JobQualityClient type={type} start={period.start} data={data} />
        </DashboardLayout>
    )
}
