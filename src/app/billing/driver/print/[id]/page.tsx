
import { getDriverPaymentByIdWithJobs } from "@/lib/supabase/billing"
import { AutoPrint } from "@/components/utils/auto-print"
import { PrintNowButton } from "./print-now-button"
import { PaymentVoucher, voucherPrintCss, type PaymentVoucherProps } from "./payment-voucher"
import Link from "next/link"

export const dynamic = 'force-dynamic'

type Props = {
    params: Promise<{ id: string }>
    searchParams?: Promise<{ mode?: string }>
}

export default async function DriverPaymentPrintPage(props: Props) {
    const params = await props.params;
    const { id } = params
    const searchParams = props.searchParams ? await props.searchParams : {}
    const autoPrint = searchParams?.mode === 'print'
    const data = await getDriverPaymentByIdWithJobs(id)

    if (!data) {
        // แทน 404 เปล่าๆ (ที่ดูเหมือน "กดแล้วเงียบ") ด้วยข้อความที่อ่านออก
        return (
            <div className="bg-white min-h-screen flex items-center justify-center p-6 text-center">
                <div className="max-w-md space-y-3">
                    <h1 className="text-2xl font-bold text-slate-800">ไม่พบข้อมูลใบสำคัญจ่าย</h1>
                    <p className="text-slate-500">
                        เลขที่เอกสาร <span className="font-mono font-bold">{id}</span> ไม่พบในระบบ
                        หรือคุณไม่มีสิทธิ์เข้าถึงเอกสารนี้ (สาขา/สิทธิ์การใช้งาน)
                    </p>
                    <Link href="/billing/driver/history" className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-slate-800 text-white font-bold">
                        กลับไปหน้าประวัติการจ่าย
                    </Link>
                </div>
            </div>
        )
    }

    const { payment, jobs, company, bankInfo } = data

    return (
        <div className="bg-slate-100 min-h-screen p-4 text-black print:p-0 print:bg-white">
            {autoPrint && <AutoPrint />}

            {/* แถบเครื่องมือ (ซ่อนตอนพิมพ์) — ปุ่มพิมพ์เอง เผื่อ auto-print ถูกบล็อก */}
            <div className="max-w-[210mm] mx-auto mb-3 flex justify-end gap-2 print:hidden">
                <Link href="/billing/driver/history" className="px-4 py-2 rounded-lg bg-white hover:bg-slate-200 text-slate-700 text-sm font-bold">
                    ← กลับ
                </Link>
                <PrintNowButton />
            </div>

            <PaymentVoucher
                payment={payment as unknown as PaymentVoucherProps['payment']}
                jobs={jobs}
                company={company}
                bankInfo={bankInfo}
            />

            <style type="text/css" media="print">{voucherPrintCss}</style>
        </div>
    )
}
