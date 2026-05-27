"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { MobileHeader } from "@/components/mobile/mobile-header"
import { Button } from "@/components/ui/button"
import { CameraInput } from "@/components/mobile/camera-input"
import { SignaturePad } from "@/components/mobile/signature-pad"
import { PickupReport } from "@/components/mobile/pickup-report"
import { toast } from "sonner"
import { submitJobPickup } from "@/lib/actions/pod-actions"
import { getJobDetails } from "@/app/mobile/jobs/actions"
import { Job } from "@/lib/supabase/jobs"
import { Loader2, Box, Info } from "lucide-react"
import html2canvas from "html2canvas"
import { QuantityStepper } from "@/components/mobile/quantity-stepper"
import { Label } from "@/components/ui/label"

export default function JobPickupPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [photos, setPhotos] = useState<File[]>([])
  const [signature, setSignature] = useState<Blob | null>(null)
  const [loadedQty, setLoadedQty] = useState<string>("")
  const [completed, setCompleted] = useState(false)
  const [loading, setLoading] = useState(false)
  
  // Job Data for Report
  const [job, setJob] = useState<Job | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (params.id) {
        getJobDetails(params.id).then(setJob)
    }
  }, [params.id])

  const canSubmit = photos.length > 0 && signature && (
    (loadedQty && Number(loadedQty) > 0) ||
    (!job?.Price_Per_Unit || Number(job.Price_Per_Unit) === 0) ||
    (job?.Price_Cust_Total && Number(job.Price_Cust_Total) > 0) // Fixed price ignores quantity requirement
  )

    const handleSubmit = async () => {
    // Enhanced Validation with feedback
    if (photos.length === 0) {
        toast.error("กรุณาถ่ายรูปสินค้าอย่างน้อย 1 รูป")
        return
    }
    if (!signature) {
        toast.error("กรุณาลงลายเซ็นผู้ส่งของ")
        return
    }
    
    const needsQty = (job?.Price_Per_Unit && Number(job.Price_Per_Unit) > 0) && 
                     (!job?.Price_Cust_Total || Number(job.Price_Cust_Total) === 0)
    
    if (needsQty && (!loadedQty || Number(loadedQty) <= 0)) {
        toast.error("กรุณาระบุจำนวนสินค้าที่รับจริง (มากกว่า 0)")
        return
    }

    setLoading(true)
    toast.info("กำลังประมวลผลและอัปโหลดหลักฐาน...", { id: "pickup-upload" })
    
    try {
        const formData = new FormData()
        
        // 1. Capture Report
        if (reportRef.current && job) {
            try {
                const canvas = await html2canvas(reportRef.current, {
                    scale: 1.5,
                    useCORS: true,
                    logging: false,
                    windowWidth: 800
                })
                
                const reportBlob = await new Promise<Blob | null>(resolve => 
                    canvas.toBlob(resolve, 'image/jpeg', 0.7)
                )
                
                if (reportBlob) {
                    formData.append("pickup_report", reportBlob, `Pickup_Report_${params.id}.jpg`)
                }
            } catch (err) {
                console.error("Report capture failed:", err)
            }
        }

        // 2. Append Photos & Signature
        photos.forEach((photo, index) => formData.append(`photo_${index}`, photo))
        formData.append("photo_count", photos.length.toString())
        formData.append("signature", signature, "signature.png")
        if (loadedQty) formData.append("loaded_qty", loadedQty)
        
        const result = await submitJobPickup(params.id, formData)
        
        if (result.success) {
            toast.success("บันทึกข้อมูลเรียบร้อยแล้ว", { id: "pickup-upload" })
            setCompleted(true)
        } else {
            throw new Error(typeof result.error === 'string' ? result.error : "Upload failed")
        }
    } catch (error) {
        console.error("Submission failed, saving to IndexedDB:", error)
        try {
            const { blobToB64, saveJobOffline } = await import("@/lib/utils/offline-storage")
            const photoB64s = await Promise.all(photos.map(p => blobToB64(p)))
            const sigB64 = signature ? await blobToB64(signature) : null
            
            const offlineData = {
                photos: photoB64s,
                signature: sigB64,
                photo_count: photos.length,
                actualCompletionTime: new Date().toISOString()
            }

            await saveJobOffline(params.id, offlineData, 'PICKUP')
            toast.info("บันทึกข้อมูลแบบ Offline สำเร็จ", {
                id: "pickup-upload",
                description: "ระบบจะอัปโหลดใหม่อัตโนมัติเมื่อเน็ตเสถียร"
            })
            setCompleted(true)
        } catch (offlineErr) {
            console.error("Critical: Failed to save pickup even to IndexedDB")
            toast.error("เกิดข้อผิดพลาดในการบันทึกข้อมูล", { id: "pickup-upload" })
        }
    } finally {
        setLoading(false)
    }
  }

  if (loading) {
      return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-6 animate-in fade-in duration-500">
              <div className="relative">
                  <div className="w-24 h-24 rounded-full border-4 border-amber-500/10 border-t-amber-500 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center text-amber-500">
                      <Loader2 className="animate-spin" size={36} />
                  </div>
              </div>
              <div className="space-y-2">
                  <h1 className="text-2xl font-black text-foreground tracking-tight animate-pulse">กำลังบันทึกข้อมูลรับสินค้า</h1>
                  <p className="text-muted-foreground text-sm font-bold leading-relaxed max-w-[280px] mx-auto">
                      ระบบกำลังอัปโหลดรายงาน ลายเซ็น และรูปภาพหลักฐานความปลอดภัย...
                  </p>
              </div>
          </div>
      )
  }

  if (completed) {
      return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-4 animate-in zoom-in duration-300">
              <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-500">
                  <Box size={48} />
              </div>
              <h1 className="text-2xl font-bold text-foreground">รับของสำเร็จ!</h1>
              <p className="text-muted-foreground italic">ข้อมูลหลักฐานอัปโหลดเรียบร้อยแล้ว</p>
              <Button 
                onClick={() => router.push(`/mobile/jobs/${params.id}`)}
                className="w-full bg-amber-600 hover:bg-amber-700 font-bold h-12 rounded-xl"
              >
                  กลับหน้ารายละเอียดงาน
              </Button>
          </div>
      )
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-24 pt-16 px-4">
      <MobileHeader title="รับสินค้า (Pickup)" showBack />

      {/* Hidden Report Container for html2canvas */}
      {job && (
          <div className="fixed left-[-9999px] top-0">
             <PickupReport 
                ref={reportRef} 
                job={job} 
                photos={photos.map(f => URL.createObjectURL(f))} 
                signature={signature ? URL.createObjectURL(signature) : null} 
                loadedQty={parseFloat(loadedQty) || 0}
             />
          </div>
      )}

      <div className="space-y-6">
        <section className="space-y-4">
             <div className="flex items-center gap-3 text-white">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500">
                    <Box size={20} />
                </div>
                <div>
                    <h2 className="font-bold">ยืนยันการรับสินค้า</h2>
                    <p className="text-xl text-muted-foreground">ถ่ายรูปสินค้าเพื่อยืนยันสภาพก่อนขนส่ง</p>
                </div>
             </div>

            <CameraInput onImagesChange={setPhotos} maxImages={10} />
        </section>

        {/* Quantify Input Section */}
        {job && (
            <section className="space-y-4">
                {job.Price_Cust_Total && Number(job.Price_Cust_Total) > 0 ? (
                    <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-[2.5rem] flex items-start gap-4">
                        <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
                            <Info className="text-white" size={24} />
                        </div>
                        <div>
                            <p className="font-black text-white uppercase tracking-widest text-sm mb-1 italic">ราคาถูกกำหนดโดยแอดมินแล้ว</p>
                            <p className="text-blue-300 text-[11px] font-black uppercase tracking-widest leading-relaxed">
                                หากต้องการแก้ไขราคาหรือจำนวน กรุณาติดต่อแอดมินโดยตรง
                            </p>
                        </div>
                    </div>
                ) : job.Price_Per_Unit && Number(job.Price_Per_Unit) > 0 ? (
                    <QuantityStepper 
                        value={loadedQty}
                        onChange={setLoadedQty}
                        label="ระบุจำนวนที่รับจริง (ชิ้น)"
                    />
                ) : null}
            </section>
        )}

        <section>
            <h2 className="text-muted-foreground font-bold mb-2">2. ลายเซ็นผู้ส่งของ</h2>
            <SignaturePad onSave={setSignature} />
        </section>

        <Button 
            onClick={handleSubmit}
            disabled={false}
            className={`w-full h-14 font-black text-lg shadow-xl transition-all duration-500 rounded-2xl ${
                canSubmit
                    ? "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 shadow-amber-500/30 text-white translate-y-0 active:scale-95" 
                    : "bg-slate-800 text-muted-foreground opacity-70 grayscale translate-y-1"
            }`}
        >
            ยืนยันการรับสินค้า / ออกเดินทาง
        </Button>
      </div>

    </div>
  )
}
