import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { isValidYmd, lastCompletedPeriod, periodOf } from "@/lib/reports/period"
import { listCustomerReports } from "./actions"
import { CustomerReportsQueue } from "./queue-client"

export const dynamic = "force-dynamic"

type Props = { searchParams: Promise<{ type?: string; start?: string }> }

export default async function CustomerReportsPage(props: Props) {
    const sp = await props.searchParams
    const type = sp.type === "monthly" ? "monthly" : "weekly"
    // default = the last finished week/month (what Monday's / the 1st's run reports on)
    const period = isValidYmd(sp.start) ? periodOf(type, sp.start) : lastCompletedPeriod(type)
    const { items, error } = await listCustomerReports(type, period.start)

    return (
        <DashboardLayout>
            <CustomerReportsQueue type={type} start={period.start} items={items} error={error} />
        </DashboardLayout>
    )
}
