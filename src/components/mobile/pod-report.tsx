"use client"

import { Job } from "@/lib/supabase/jobs"
import { forwardRef } from "react"

type Props = {
  job: Job
  photos: string[] // Object URLs
  signature: string | null // Object URL
  extraServiceData?: {
    soNo?: string
    storeName?: string
    movedQty?: number
    floorClimbQty?: number
    shelvedQty?: number
    approverName?: string
    notes?: string
  } | null
}

export const PodReport = forwardRef<HTMLDivElement, Props>(({ job, photos, signature, extraServiceData }, ref) => {
  return (
    <div ref={ref} className="bg-white text-black p-8 font-sans w-[800px] mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-gray-200 pb-4 mb-6">
        <div>
           <h1 className="text-2xl font-bold uppercase tracking-wide">ใบส่งสินค้า / Delivery Note</h1>
           <p className="text-xl text-gray-400 mt-1">หลักฐานการส่งสินค้า (Proof of Delivery)</p>
        </div>
        <div className="text-right">
            <h2 className="text-xl font-bold">{extraServiceData?.soNo || job.Job_ID}</h2>
            <p className="text-xl">{new Date().toLocaleDateString('th-TH', { 
                year: 'numeric', month: 'long', day: 'numeric', 
                hour: '2-digit', minute: '2-digit' 
            })}</p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div className="space-y-2">
            <h3 className="font-bold border-b border-slate-300 pb-1 mb-2">ข้อมูลงาน (Job Info)</h3>
            <div className="grid grid-cols-[100px_1fr] text-xl gap-y-1">
                <span className="text-gray-400">ลูกค้า:</span>
                <span className="font-medium">{job.Customer_Name}</span>
                
                <span className="text-gray-400">เส้นทาง:</span>
                <span>{job.Route_Name || "-"}</span>
                
                <span className="text-gray-400">ทะเบียนรถ:</span>
                <span>{job.Vehicle_Plate || "-"}</span>
                
                <span className="text-gray-400">คนขับ:</span>
                <span>{job.Driver_Name || "-"}</span>
            </div>
        </div>

        <div className="space-y-2">
            <h3 className="font-bold border-b border-slate-300 pb-1 mb-2">สถานที่ (Location)</h3>
            <div className="space-y-3 text-xl">
                <div>
                    <span className="text-gray-400 text-lg font-bold block">ต้นทาง (Origin)</span>
                    <p>{job.Origin_Location || "-"}</p>
                </div>
                <div>
                    <span className="text-gray-400 text-lg font-bold block">ปลายทาง (Destination)</span>
                    <p className="font-medium">{extraServiceData?.storeName || job.Dest_Location || "-"}</p>
                </div>
            </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="mb-8">
        <h3 className="font-bold border-b border-slate-300 pb-1 mb-2">รายการสินค้า & บริการ (Items & Extra Services)</h3>
        <table className="w-full text-xl text-left">
            <thead className="bg-slate-100 text-muted-foreground">
                <tr>
                    <th className="p-2 w-12 text-center">#</th>
                    <th className="p-2">รายการ (Description)</th>
                    <th className="p-2 text-right">จำนวน (Qty)</th>
                    <th className="p-2 text-center">สถานะ</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
                <tr>
                    <td className="p-2 text-center">1</td>
                    <td className="p-2">{job.Route_Name || "สินค้าทั่วไป (General Cargo)"}</td>
                    <td className="p-2 text-right">{job.Total_Drop || 1} Drop</td>
                    <td className="p-2 text-center text-emerald-600 font-bold">ส่งสำเร็จ</td>
                </tr>
                {extraServiceData && (extraServiceData.movedQty || 0) > 0 && (
                    <tr>
                        <td className="p-2 text-center">2</td>
                        <td className="p-2">บริการย้ายสินค้าหน้างาน</td>
                        <td className="p-2 text-right">{extraServiceData.movedQty} กล่อง</td>
                        <td className="p-2 text-center text-blue-600 font-bold">บันทึกแล้ว</td>
                    </tr>
                )}
                {extraServiceData && (extraServiceData.floorClimbQty || 0) > 0 && (
                    <tr>
                        <td className="p-2 text-center">{(extraServiceData.movedQty || 0) > 0 ? 3 : 2}</td>
                        <td className="p-2">บริการยกสินค้าขึ้นชั้น {extraServiceData.floorClimbQty}</td>
                        <td className="p-2 text-right">{extraServiceData.shelvedQty || 0} กล่อง</td>
                        <td className="p-2 text-center text-purple-600 font-bold">บันทึกแล้ว</td>
                    </tr>
                )}
            </tbody>
        </table>
      </div>

      {/* Photos */}
      <div className="mb-8 break-inside-avoid">
        <h3 className="font-bold border-b border-slate-300 pb-1 mb-4">รูปถ่ายสินค้า (Photos)</h3>
        <div className="grid grid-cols-3 gap-4">
            {photos.map((src, i) => (
                <div key={i} className="aspect-video bg-slate-100 rounded border border-slate-200 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="POD" className="w-full h-full object-cover" />
                </div>
            ))}
        </div>
      </div>

      {/* Signatures */}
      <div className="flex justify-end break-inside-avoid">
        <div className="w-64 border border-slate-300 rounded p-4 text-center">
             <p className="text-lg font-bold text-gray-400 mb-2">ลายเซ็นผู้รับสินค้า (Receiver Signature)</p>
             <div className="h-24 flex items-center justify-center mb-2">
                {signature ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signature} alt="Signature" className="max-h-full max-w-full" />
                ) : (
                    <span className="text-gray-800 italic">ไม่มีลายเซ็น</span>
                )}
             </div>
             <div className="border-t border-slate-300 pt-2">
                <p className="font-medium text-xl">{extraServiceData?.approverName || job.Customer_Name}</p>
                <p className="text-lg font-bold text-muted-foreground">{new Date().toLocaleString('th-TH')}</p>
             </div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-slate-200 text-center text-lg font-bold text-muted-foreground">
        สร้างโดยระบบ TMS ePOD
      </div>
    </div>
  )
})

PodReport.displayName = "PodReport"

