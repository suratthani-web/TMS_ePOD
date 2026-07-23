"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useRouter, useParams } from "next/navigation"
import { MobileHeader } from "@/components/mobile/mobile-header"
import { Button } from "@/components/ui/button"
import { CameraInput } from "@/components/mobile/camera-input"
import { SignaturePad } from "@/components/mobile/signature-pad"
import { toast } from "sonner"
import { submitJobPOD } from "@/lib/actions/pod-actions"
import { getJobDetails } from "@/app/mobile/jobs/actions"
import { Loader2, CheckCircle, BrainCircuit, AlertTriangle, ScanLine, Box } from "lucide-react"
import { PodReport } from "@/components/mobile/pod-report"
import { ContainerDeliveryReport } from "@/components/mobile/container-delivery-report"
import { ExtraServiceModal, ExtraServiceData } from "@/components/mobile/extra-service-modal"
import { Job } from "@/lib/supabase/jobs"
import html2canvas from "html2canvas"
import { analyzePODImage, AIAnalysisResult } from "@/lib/utils/ai-verification"
import { saveJobOffline, blobToB64 } from "@/lib/utils/offline-storage"
import { withTimeout } from "@/lib/utils/with-timeout"
import { QuantityStepper } from "@/components/mobile/quantity-stepper"
import { notifyTrackingStateChanged } from "@/lib/tracking-state"

export default function JobCompletePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [photos, setPhotos] = useState<File[]>([])
  const [signature, setSignature] = useState<Blob | null>(null)
  const [loadedQty, setLoadedQty] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [completed, setCompleted] = useState(false)

  // Extra Service / Floor Climb Modal State
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false)
  const [extraServiceData, setExtraServiceData] = useState<ExtraServiceData | null>(null)
  
  // AI Verification State
  const [verifying, setVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<AIAnalysisResult | null>(null)

  // Job Data for Report
  const [job, setJob] = useState<Job | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const isContainer = job?.job_type === 'container'

  useEffect(() => {
    if (params.id) {
        getJobDetails(params.id).then(j => {
            setJob(j)
            // User requested to remove the default suggested number to prevent accidental submission
            // if (j?.Loaded_Qty) {
            //     setLoadedQty(j.Loaded_Qty.toString())
            // }
        })
    }
  }, [params.id])

  // Trigger AI Verification when photo is added
  useEffect(() => {
      if (photos.length > 0) {
          verifyPhoto(photos[0]) // Analyze the first photo as primary
      } else {
          setVerificationResult(null)
      }
  }, [photos])

  // Stable object URLs for the off-screen report — recreating these on every
  // render leaks image memory and helps crash the page on iOS. Revoke on
  // change/unmount.
  const photoUrls = useMemo(() => photos.map(f => URL.createObjectURL(f)), [photos])
  const signatureUrl = useMemo(() => (signature ? URL.createObjectURL(signature) : null), [signature])
  useEffect(() => () => { photoUrls.forEach(URL.revokeObjectURL) }, [photoUrls])
  useEffect(() => () => { if (signatureUrl) URL.revokeObjectURL(signatureUrl) }, [signatureUrl])

  const verifyPhoto = async (file: File) => {
      setVerifying(true)
      try {
          const result = await analyzePODImage(file)
          setVerificationResult(result)
      } catch (err) {
          console.error("AI Analysis failed:", err)
      } finally {
          setVerifying(false)
      }
  }

  const waitForImages = (element: HTMLElement) => {
    const images = Array.from(element.getElementsByTagName('img'))
    return Promise.all(
      images.map(img => {
        if (img.complete) return Promise.resolve()
        return new Promise(resolve => {
          img.onload = resolve
          img.onerror = resolve
        })
      })
    )
  }

    const handleSubmit = async () => {
    // Explicit Validation Feedback
    if (photos.length === 0) {
        toast.error(isContainer ? "กรุณาถ่ายรูปใบ EIR" : "กรุณาถ่ายรูปสินค้า", {
            description: "กรุณาถ่ายรูปหลักฐานอย่างน้อย 1 รูป"
        })
        return
    }
    if (!signature) {
        toast.error("กรุณาลงลายเซ็น", {
            description: isContainer ? "กรุณาลงลายเซ็นเจ้าหน้าที่ลานตู้" : "กรุณาลงลายเซ็นผู้รับสินค้า"
        })
        return
    }

    // Warn if the delivery count differs from what was recorded at pickup.
    // (Blank at delivery is fine — the server keeps the pickup quantity.)
    const pickupQty = Number(job?.Loaded_Qty || 0)
    if (!isContainer && loadedQty && pickupQty > 0 && Number(loadedQty) !== pickupQty) {
        const ok = confirm(
            `จำนวนตอนส่ง (${loadedQty}) ไม่ตรงกับตอนรับ (${pickupQty})\n\n` +
            `ระบบจะใช้จำนวนตอนส่ง (${loadedQty}) เป็นหลัก\nยืนยันหรือไม่?`
        )
        if (!ok) return
    }

    setLoading(true)
    toast.info("กำลังประมวลผลและอัปโหลดหลักฐาน...", { id: "pod-upload" })
    
    try {
        const formData = new FormData()
        
        // 1. Capture Report (Heavy Task)
        if (reportRef.current && job) {
            const captureReport = async (retryCount = 0): Promise<Blob | null> => {
                try {
                    await waitForImages(reportRef.current!)
                    const delay = 500 + (retryCount * 500)
                    await new Promise(resolve => setTimeout(resolve, delay))

                    const canvas = await html2canvas(reportRef.current!, {
                        scale: 1, // Keep memory low — scale>1 on retina iOS crashes the WebView
                        useCORS: true,
                        logging: false,
                        backgroundColor: "#ffffff",
                        windowWidth: 800,
                        allowTaint: true
                    })
                    
                    return new Promise<Blob | null>(resolve => 
                        canvas.toBlob(resolve, 'image/jpeg', 0.7) // Slightly lower quality for speed
                    )
                } catch (err) {
                    if (retryCount < 1) return captureReport(retryCount + 1)
                    return null
                }
            }

            // Best-effort: never let html2canvas hang the submit on iOS — cap it
            // and proceed without the report if it stalls or fails.
            const reportBlob = await withTimeout(captureReport(), 25000, 'report capture').catch(() => null)
            if (reportBlob && reportBlob.size > 5000) {
                formData.append("pod_report", reportBlob, isContainer ? `Container_Delivery_Report_${params.id}.jpg` : `POD_Report_${params.id}.jpg`)
            }
        }

        // 2. Photos & Signature
        photos.forEach((photo, index) => formData.append(`photo_${index}`, photo))
        formData.append("photo_count", photos.length.toString())
        formData.append("signature", signature, "signature.png")
        if (loadedQty) formData.append("loaded_qty", loadedQty)
        if (isContainer) {
            formData.append("job_type", "container")
        }
        
        // Cap the round-trip so a stalled iOS connection can't hang the spinner
        // forever. On timeout we throw → fall to the offline-save path, which is
        // the right behaviour for a genuinely stuck network. If the request did
        // land, the offline replay de-dupes via the server-side proof check.
        const result = await withTimeout(submitJobPOD(params.id, formData), 120000, 'POD upload')

        if (result.success) {
            toast.success("ส่งงานเรียบร้อยแล้ว", { id: "pod-upload" })
            setCompleted(true)
            // Delivery confirmed — stop GPS tracking for this job.
            notifyTrackingStateChanged()
            return
        }

        // The request reached the server and was rejected (status guard,
        // validation, upload failure, etc.). This is NOT a connectivity problem:
        // queuing it offline would replay the same rejection forever and falsely
        // show the driver a green "success" screen while nothing was saved.
        // Surface the real error so they can correct it and retry.
        toast.error(String(result.error) || "ส่งงานไม่สำเร็จ กรุณาลองใหม่", {
            id: "pod-upload",
            description: "ข้อมูลยังไม่ถูกบันทึก กรุณาตรวจสอบและลองอีกครั้ง"
        })
    } catch (error) {
        // Only genuine network failures throw (the server action never completed
        // a round-trip). These are safe to queue offline for auto-retry.
        console.error("POD network failure, saving to IndexedDB:", error)
        try {
            const photoB64s = await Promise.all(photos.map(p => blobToB64(p)))
            const sigB64 = signature ? await blobToB64(signature) : null
            
            let reportB64 = null
            // Try one last time to capture report for offline if needed
            if (reportRef.current && job) {
                try {
                    const canvas = await withTimeout(
                        html2canvas(reportRef.current!, { scale: 1, useCORS: true }),
                        15000,
                        'offline report capture'
                    )
                    reportB64 = canvas.toDataURL('image/jpeg', 0.6)
                } catch { /* Fail silently */ }
            }

            const offlineData = {
                photos: photoB64s,
                signature: sigB64,
                pod_report: reportB64,
                photo_count: photos.length,
                actualCompletionTime: new Date().toISOString()
            }

            await saveJobOffline(params.id, offlineData, 'POD')
            toast.info("บันทึกข้อมูลแบบ Offline สำเร็จ", {
                id: "pod-upload",
                description: "ระบบจะอัปโหลดใหม่อัตโนมัติเมื่อเน็ตเสถียร"
            })
            setCompleted(true)
        } catch (offlineErr) {
            console.error("Critical: Failed to save even to IndexedDB")
            toast.error("เกิดข้อผิดพลาดในการบันทึกข้อมูล", { id: "pod-upload" })
        }
    } finally {
        setLoading(false)
    }
  }

  if (loading) {
      return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-6 animate-in fade-in duration-500">
              <div className="relative">
                  <div className="w-24 h-24 rounded-full border-4 border-blue-500/10 border-t-blue-500 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center text-blue-500">
                      <Loader2 className="animate-spin" size={36} />
                  </div>
              </div>
              <div className="space-y-2">
                  <h1 className="text-2xl font-black text-foreground tracking-tight animate-pulse">กำลังบันทึกข้อมูลส่งงาน</h1>
                  <p className="text-muted-foreground text-sm font-bold leading-relaxed max-w-[280px] mx-auto">
                      ระบบกำลังอัปโหลดรายงาน ลายเซ็น และรูปถ่ายความถูกต้องด้วย AI...
                  </p>
              </div>
          </div>
      )
  }

  if (completed) {
      return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-4 animate-in zoom-in duration-300">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500">
                  <CheckCircle size={48} />
              </div>
              <h1 className="text-2xl font-bold text-foreground">ส่งงานสำเร็จ!</h1>
              <p className="text-muted-foreground">ขอบคุณสำหรับการทำงาน</p>
              <Button 
                onClick={() => router.push(`/mobile/jobs/${params.id}`)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 rounded-xl font-bold"
              >
                  กลับหน้ารายละเอียดงาน
              </Button>
          </div>
      )
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-24 pt-16 px-4">
      <MobileHeader title={isContainer ? "คืนตู้ (Gate-In EIR)" : "ส่งงาน (POD)"} showBack />

      {/* Hidden Report Container */}
      {job && (
          <div className="fixed left-[-9999px] top-0">
             {isContainer ? (
                 <ContainerDeliveryReport
                     ref={reportRef}
                     job={job}
                     photos={photoUrls}
                     signature={signatureUrl}
                 />
             ) : (
                 <PodReport 
                    ref={reportRef} 
                    job={job} 
                    photos={photoUrls}
                    signature={signatureUrl}
                    extraServiceData={extraServiceData} 
                 />
             )}
          </div>
      )}

      <div className="space-y-6">
        <section>
            <h2 className="text-muted-foreground font-bold mb-2">
                {isContainer ? "1. ถ่ายรูปใบ EIR ขาเข้า (คืนตู้)" : "1. ถ่ายรูปสินค้า"}
            </h2>
            <CameraInput onImagesChange={setPhotos} maxImages={isContainer ? 2 : 5} />
            
            {/* AI Verification Feedback - Reserved space to prevent signature jumping */}
            {!isContainer && (
                <div className="mt-3 bg-card border border-slate-800 rounded-lg p-3 min-h-[5rem] flex flex-col justify-center">
                    {photos.length > 0 ? (
                        <>
                        {verifying ? (
                            <div className="flex items-center gap-3 text-purple-400 animate-pulse">
                                <ScanLine className="animate-spin-slow" size={20} />
                                <span className="text-xl">กำลังตรวจสอบคุณภาพรูปภาพ (AI)...</span>
                            </div>
                        ) : verificationResult ? (
                            <div>
                                 <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <BrainCircuit size={16} className={verificationResult.isValid ? "text-emerald-400" : "text-amber-400"} />
                                        <span className={`text-xl font-bold ${verificationResult.isValid ? "text-emerald-400" : "text-amber-400"}`}>
                                            คะแนน AI: {verificationResult.score}/100
                                        </span>
                                    </div>
                                    {verificationResult.isValid && <CheckCircle size={16} className="text-emerald-500" />}
                                 </div>
                                 
                                 {!verificationResult.isValid && (
                                    <div className="space-y-1">
                                        {verificationResult.issues.map((issue, i) => (
                                            <div key={i} className="flex items-center gap-2 text-lg font-bold text-red-400">
                                                <AlertTriangle size={12} />
                                                {issue}
                                            </div>
                                        ))}
                                        <p className="text-lg font-bold text-muted-foreground mt-1 pl-5">แนะนำให้ถ่ายใหม่อีกครั้งเพื่อความชัดเจน</p>
                                    </div>
                                 )}
                            </div>
                        ) : null}
                        </>
                    ) : (
                        <div className="flex items-center gap-3 text-muted-foreground/40 italic">
                            <ScanLine size={20} />
                            <span className="text-lg">ถ่ายรูปเพื่อรับการตรวจสอบด้วย AI</span>
                        </div>
                    )}
                </div>
            )}
        </section>

                {/* Extra Services / Floor Climb Optional Section */}
                {!isContainer && job && (
                <section className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Box className="text-indigo-400" size={18} />
                                บริการย้ายสินค้า / ขึ้นชั้น (Optional)
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {extraServiceData ? "บันทึกข้อมูลบริการเพิ่มเติมเรียบร้อยแล้ว" : "กดเปิดฟอร์มเพื่อบันทึกจำนวนย้ายหรือขึ้นชั้น"}
                            </p>
                        </div>
                        <Button
                            type="button"
                            onClick={() => setIsExtraModalOpen(true)}
                            className={extraServiceData 
                                ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 text-xs font-bold px-3.5 h-9 rounded-xl"
                                : "bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3.5 h-9 rounded-xl shadow-md shadow-indigo-600/20"
                            }
                        >
                            {extraServiceData ? "แก้ไขข้อมูล" : "บันทึกบริการ"}
                        </Button>
                    </div>

                    {/* Summary Badge if filled */}
                    {extraServiceData && (
                        <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/60 text-xs space-y-1 text-slate-300">
                            <p className="font-semibold text-indigo-300">SO: {extraServiceData.soNo}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-300">
                                {extraServiceData.movedQty > 0 && <span>ย้ายสินค้า: <strong>{extraServiceData.movedQty}</strong> กล่อง</span>}
                                {extraServiceData.floorClimbQty > 0 && <span>ขึ้นชั้น: <strong>ชั้น {extraServiceData.floorClimbQty}</strong> ({extraServiceData.shelvedQty} กล่อง)</span>}
                                {extraServiceData.approverName && <span>ผู้รับรอง: <strong>{extraServiceData.approverName}</strong></span>}
                            </div>
                        </div>
                    )}
                </section>
                )}

                {/* Always allow quantity input if piece-rate is configured, even if a total price exists */}
                {!isContainer && job && job.Price_Per_Unit && Number(job.Price_Per_Unit) > 0 && (
                <section>
                    <h2 className="text-muted-foreground font-bold mb-2">2. ยืนยันจำนวนที่ส่งจริง</h2>
                    <QuantityStepper
                        value={loadedQty}
                        onChange={setLoadedQty}
                        label="ระบุจำนวนที่ส่งมอบจริง (ชิ้น)"
                    />
                    {Number(job.Loaded_Qty) > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                            จำนวนตอนรับสินค้า: <span className="font-semibold text-foreground">{Number(job.Loaded_Qty)}</span> ชิ้น
                            {" — "}เว้นว่างไว้ได้หากส่งครบเท่าเดิม
                        </p>
                    )}
                </section>
                )}

                <section>
                <h2 className="text-muted-foreground font-bold mb-2">
                    {isContainer ? "2. ลายเซ็นเจ้าหน้าที่ลานตู้ (ผู้รับตู้)" : 
                     (job && job.Price_Per_Unit && Number(job.Price_Per_Unit) > 0 && (!job.Price_Cust_Total || Number(job.Price_Cust_Total) === 0) ? "3. ลายเซ็นผู้รับ" : "2. ลายเซ็นผู้รับ")}
                </h2>
                <SignaturePad onSave={setSignature} />
                </section>
        <div className="space-y-3">
            <Button 
                onClick={handleSubmit}
                disabled={loading}
                className="w-full h-16 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 shadow-blue-500/30 text-white font-black text-lg shadow-xl transition-all duration-300 rounded-2xl active:scale-95"
            >
                {isContainer ? "ยืนยันการคืนตู้" : "ยืนยันการส่งงาน"}
            </Button>
            
            {/* Validation Feedback */}
            <div className="text-center space-y-1">
                {photos.length === 0 && (
                    <p className="text-lg font-bold text-red-400 animate-pulse">
                        {isContainer ? "* กรุณาถ่ายรูปใบ EIR อย่างน้อย 1 รูป" : "* กรุณาถ่ายรูปสินค้าอย่างน้อย 1 รูป"}
                    </p>
                )}
                {!signature && (
                    <p className="text-lg font-bold text-red-400 animate-pulse">
                        {isContainer ? "* กรุณาลงลายเซ็นเจ้าหน้าที่ลานตู้" : "* กรุณาลงลายเซ็นผู้รับ"}
                    </p>
                )}
            </div>
        </div>
      </div>

      {/* Extra Service / Floor Climb Modal */}
      {job && (
        <ExtraServiceModal
          isOpen={isExtraModalOpen}
          onClose={() => setIsExtraModalOpen(false)}
          onSave={(data) => setExtraServiceData(data)}
          currentJobId={job.Job_ID}
          currentCustomerName={job.Customer_Name || undefined}
          originalDestinations={
            typeof job.original_destinations_json === 'string'
              ? JSON.parse(job.original_destinations_json)
              : job.original_destinations_json
          }
          initialData={extraServiceData}
        />
      )}
    </div>
  )
}
