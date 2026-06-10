"use client"

import { Job, JobContainer } from "@/types/database"
import { forwardRef } from "react"

type ContainerJob = Job & {
  container?: Partial<JobContainer> | null
}

type Props = {
  job: ContainerJob
  photos: string[]
  conditionPhotos: Record<string, string> // key e.g. "front", "back", "left", "right", "top", "floor", "seal"
}

export const ContainerPickupReport = forwardRef<HTMLDivElement, Props>(({ job, photos, conditionPhotos }, ref) => {
  const container = job.container
  
  return (
    <div ref={ref} className="bg-white text-black p-8 font-sans w-[800px] mx-auto absolute top-[-9999px] left-[-9999px]">
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-gray-200 pb-4 mb-6">
        <div>
           <h1 className="text-2xl font-bold uppercase tracking-wide text-blue-700">ใบรับตู้คอนเทนเนอร์ / Container Pickup Note</h1>
           <p className="text-xl text-gray-500 mt-1">หลักฐานการตรวจสอบสภาพตู้ (EIR & Inspection)</p>
        </div>
        <div className="text-right">
            <h2 className="text-xl font-bold text-gray-800">{job.Job_ID}</h2>
            <p className="text-lg text-gray-500">{new Date().toLocaleDateString('th-TH', { 
                year: 'numeric', month: 'long', day: 'numeric', 
                hour: '2-digit', minute: '2-digit' 
            })}</p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div className="space-y-4">
            <h3 className="font-bold border-b border-blue-200 pb-1 mb-2 text-blue-800">ข้อมูลตู้ (Container Info)</h3>
            <div className="grid grid-cols-[120px_1fr] text-lg gap-y-2">
                <span className="text-gray-400">หมายเลขตู้:</span>
                <span className="font-black text-xl">{container?.container_no || "-"}</span>
                
                <span className="text-gray-400">หมายเลขซีล:</span>
                <span className="font-bold">{container?.seal_no || "-"}</span>

                <span className="text-gray-400">ขนาดตู้:</span>
                <span>{container?.container_size || "-"}</span>

                <span className="text-gray-400">สายเรือ:</span>
                <span>{container?.shipping_line || "-"}</span>
            </div>
        </div>

        <div className="space-y-4">
            <h3 className="font-bold border-b border-blue-200 pb-1 mb-2 text-blue-800">ข้อมูลรถ (Fleet Info)</h3>
            <div className="grid grid-cols-[120px_1fr] text-lg gap-y-2">
                <span className="text-gray-400">ทะเบียนหัว:</span>
                <span className="font-bold">{job.Vehicle_Plate || "-"}</span>
                
                <span className="text-gray-400">ทะเบียนหาง:</span>
                <span className="font-bold text-blue-600">{job.chassis_plate || "-"}</span>
                
                <span className="text-gray-400">พนักงานขับรถ:</span>
                <span>{job.Driver_Name || "-"}</span>
            </div>
        </div>
      </div>

      {/* EIR Photos */}
      <div className="mb-8">
        <h3 className="font-bold border-b border-gray-300 pb-1 mb-4 text-gray-800">รูปถ่ายใบ EIR (Equipment Interchange Receipt)</h3>
        <div className="grid grid-cols-2 gap-4">
            {photos.slice(0, 2).map((src, i) => (
                <div key={i} className="aspect-video bg-gray-50 rounded border border-gray-200 overflow-hidden">
                    <img src={src} alt="EIR" className="w-full h-full object-cover" />
                </div>
            ))}
        </div>
      </div>

      {/* Condition Check (7-Point) */}
      <div className="mb-8">
        <h3 className="font-bold border-b border-gray-300 pb-1 mb-4 text-gray-800">ผลการตรวจสอบสภาพตู้ (7-Point Check)</h3>
        <div className="grid grid-cols-4 gap-3">
            {Object.entries(conditionPhotos).map(([key, src]) => (
                <div key={key} className="space-y-1 text-center">
                    <div className="aspect-square bg-gray-50 rounded border border-gray-200 overflow-hidden">
                        <img src={src} alt={key} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-[10px] font-bold uppercase text-gray-500">{key}</p>
                </div>
            ))}
        </div>
      </div>

      {/* Footer Disclaimer */}
      <div className="mt-auto pt-10 border-t border-gray-200 text-[10px] text-gray-400 italic">
        <p>เอกสารฉบับนี้สร้างขึ้นโดยระบบอัตโนมัติ เพื่อเป็นหลักฐานการรับมอบตู้และตรวจสอบสภาพเบื้องต้น</p>
      </div>
    </div>
  )
})

ContainerPickupReport.displayName = "ContainerPickupReport"
