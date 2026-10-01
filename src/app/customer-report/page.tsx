import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { CustomerReportDashboard } from "@/components/customer-report/report-dashboard"
import { getCustomerReportDashboard } from "@/app/reports/customer-reports/actions"
import { isAdmin } from "@/lib/permissions"
import { ReportControls } from "./report-controls"

export const dynamic = "force-dynamic"

type Props = { searchParams: Promise<{ type?: string; start?: string; customer?: string }> }

export default async function CustomerReportPage(props: Props) {
    const sp = await props.searchParams
    const [res, admin] = await Promise.all([
        getCustomerReportDashboard({ type: sp.type, start: sp.start, customerId: sp.customer }),
        isAdmin(),
    ])

    return (
        <DashboardLayout>
            <div className="mx-auto max-w-6xl space-y-4 pb-16">
                <ReportControls
                    type={sp.type === "monthly" ? "monthly" : "weekly"}
                    start={res.data?.period.start || sp.start || ""}
                    customers={res.customers}
                    customerId={res.data?.customerId || sp.customer || ""}
                />
                {res.error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{res.error}</p>}
                {!res.error && !res.data && (
                    <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-600">เลือกลูกค้าเพื่อดูรายงาน</p>
                )}
                {res.data && (
                    <div className="rounded-2xl bg-slate-50 p-3 sm:p-5 print:bg-white print:p-0">
                        <CustomerReportDashboard data={res.data} isAdminView={admin && !!res.customers} />
                    </div>
                )}
            </div>
            <style>{`
                @media print {
                    @page { size: A4; margin: 10mm; }
                    body { background: white !important; }
                    aside, header, nav, .report-controls, .report-admin-only, [data-sonner-toaster] { display: none !important; }
                    main { padding: 0 !important; margin: 0 !important; }
                    .customer-report { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .report-panel { break-inside: avoid; }
                    .customer-report details { display: none; }
                }
            `}</style>
        </DashboardLayout>
    )
}
