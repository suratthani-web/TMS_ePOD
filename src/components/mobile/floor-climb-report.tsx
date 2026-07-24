"use client"

import { forwardRef } from "react"
import { Job } from "@/lib/supabase/jobs"

export type FloorClimbReportData = {
  soNo?: string
  storeName?: string
  movedQty?: number
  floorClimbQty?: number
  shelvedQty?: number
  approverPhone?: string
  driverName?: string
  driverSignatureUrl?: string | null
  approverSignatureUrl?: string | null
  dateStr?: string
}

type Props = {
  job: Job
  data?: FloorClimbReportData | null
}

export const FloorClimbReport = forwardRef<HTMLDivElement, Props>(({ job, data }, ref) => {
  const dateStr = data?.dateStr || new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const storeName = data?.storeName || job.Customer_Name || ""
  const soNo = data?.soNo || job.Job_ID || ""
  const movedQty = data?.movedQty !== undefined ? data.movedQty : ""
  const floorClimbQty = data?.floorClimbQty !== undefined ? data.floorClimbQty : ""
  const shelvedQty = data?.shelvedQty !== undefined ? data.shelvedQty : ""
  const driverName = data?.driverName || job.Driver_Name || ""
  const approverPhone = data?.approverPhone || ""

  return (
    <div
      ref={ref}
      className="bg-white text-black p-10 font-sans w-[850px] mx-auto min-h-[500px] flex flex-col justify-between border border-gray-300"
      style={{ fontFamily: "'TH Sarabun PSK', 'Angsana New', 'Cordia New', sans-serif" }}
    >
      <div>
        {/* Title */}
        <h1 className="text-3xl font-bold text-center mb-8 tracking-wide">
          แบบฟอร์มบันทึกการย้ายสินค้าและขึ้นชั้น
        </h1>

        {/* Form Body - Matching the exact template layout */}
        <div className="space-y-6 text-xl leading-relaxed">
          {/* Row 1: Store & Date */}
          <div className="flex items-baseline justify-between gap-4">
            <div className="flex items-baseline flex-1">
              <span className="font-bold whitespace-nowrap mr-2">ชื่อร้านค้า</span>
              <span className="border-b border-black flex-1 text-center font-medium pb-2 text-2xl">
                {storeName}
              </span>
            </div>
            <div className="flex items-baseline w-[280px]">
              <span className="font-bold whitespace-nowrap mr-2">วันที่</span>
              <span className="border-b border-black flex-1 text-center font-medium pb-2 text-2xl">
                {dateStr}
              </span>
            </div>
          </div>

          {/* Row 2: Moved Qty & SO */}
          <div className="flex items-baseline justify-between gap-4">
            <div className="flex items-baseline flex-1">
              <span className="font-bold whitespace-nowrap mr-2">จำนวนสินค้าที่ย้าย</span>
              <span className="border-b border-black w-28 text-center font-bold pb-2 text-2xl">
                {movedQty !== "" ? movedQty : "—"}
              </span>
              <span className="ml-2 whitespace-nowrap">กล่อง / กระสอบ / ชิ้น</span>
            </div>
            <div className="flex items-baseline flex-1">
              <span className="font-bold whitespace-nowrap mr-2">SO. / PO. / INV.</span>
              <span className="border-b border-black flex-1 text-center font-bold pb-2 text-2xl">
                {soNo}
              </span>
            </div>
          </div>

          {/* Row 3: Floor Count & Shelved Qty */}
          <div className="flex items-baseline justify-between gap-4">
            <div className="flex items-baseline flex-1">
              <span className="font-bold whitespace-nowrap mr-2">จำนวนการขึ้นชั้น</span>
              <span className="border-b border-black w-24 text-center font-bold pb-2 text-2xl">
                {floorClimbQty !== "" && Number(floorClimbQty) > 0 ? floorClimbQty : "—"}
              </span>
              <span className="ml-2 whitespace-nowrap">ชั้น</span>
            </div>
            <div className="flex items-baseline flex-1">
              <span className="font-bold whitespace-nowrap mr-2">จำนวนสินค้าที่ขึ้นชั้น</span>
              <span className="border-b border-black w-28 text-center font-bold pb-2 text-2xl">
                {shelvedQty !== "" && Number(shelvedQty) > 0 ? shelvedQty : "—"}
              </span>
              <span className="ml-2 whitespace-nowrap">กล่อง / กระสอบ / ชิ้น</span>
            </div>
          </div>

          {/* Row 4: Driver & Approver Signatures */}
          <div className="grid grid-cols-3 gap-4 pt-6 items-end">
            {/* Driver Column */}
            <div className="flex flex-col items-center">
              <span className="font-bold mb-1">พนักงานขนส่ง</span>
              <div className="h-16 w-full border-b border-black flex items-center justify-center">
                {data?.driverSignatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.driverSignatureUrl} alt="Driver Sig" className="max-h-14 max-w-full" />
                ) : (
                  <span className="text-lg font-medium">{driverName}</span>
                )}
              </div>
              <span className="text-sm text-gray-600 mt-1">({driverName})</span>
            </div>

            {/* Approver Signature Column */}
            <div className="flex flex-col items-center">
              <span className="font-bold mb-1">ผู้เซ็นรับรอง</span>
              <div className="h-16 w-full border-b border-black flex items-center justify-center">
                {data?.approverSignatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.approverSignatureUrl} alt="Approver Sig" className="max-h-14 max-w-full" />
                ) : (
                  <span className="text-sm text-gray-400 italic">(ลายเซ็นผู้รับ)</span>
                )}
              </div>
              <span className="text-sm text-gray-600 mt-1">(ลายมือชื่อผู้เซ็นรับรอง)</span>
            </div>

            {/* Approver Phone Column */}
            <div className="flex flex-col items-center">
              <span className="font-bold mb-1">เบอร์โทรศัพท์</span>
              <div className="h-16 w-full border-b border-black flex items-center justify-center font-bold text-2xl">
                {approverPhone || "—"}
              </div>
              <span className="text-sm text-gray-600 mt-1">(เบอร์ติดต่อผู้รับ)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Notes matching exact template text */}
      <div className="mt-10 pt-4 text-center text-sm space-y-1 text-gray-800">
        <p className="font-bold">
          หมายเหตุ ** หากพนักงานไม่ได้ทำการย้ายสินค้าหรือขึ้นชั้นภายในร้าน ไม่ต้องลงชื่อรับรอง **
        </p>
        <p>
          * การเซ็นรับรองไม่มีผลต่อค่าใช้จ่ายของทางร้าน เป็นเพียงการเซ็นรับรองการบริการของ บริษัท ดีดีเซอร์วิสแอนด์ทรานสปอร์ต จำกัด เท่านั้น *
        </p>
      </div>
    </div>
  )
})

FloorClimbReport.displayName = "FloorClimbReport"
