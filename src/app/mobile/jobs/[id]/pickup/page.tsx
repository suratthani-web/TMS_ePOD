"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { MobileHeader } from "@/components/mobile/mobile-header"
import { Button } from "@/components/ui/button"
import { CameraInput } from "@/components/mobile/camera-input"
import { SignaturePad } from "@/components/mobile/signature-pad"
import { PickupReport } from "@/components/mobile/pickup-report"
import { ContainerPickupReport } from "@/components/mobile/container-pickup-report"
import { toast } from "sonner"
import { submitJobPickup } from "@/lib/actions/pod-actions"
import { getJobDetails } from "@/app/mobile/jobs/actions"
import { Job } from "@/lib/supabase/jobs"
import { Loader2, Box, Info, Camera, ShieldCheck, ChevronRight } from "lucide-react"
import html2canvas from "html2canvas"
import { QuantityStepper } from "@/components/mobile/quantity-stepper"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export default function JobPickupPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [photos, setPhotos] = useState<File[]>([])
  const [conditionPhotos, setConditionPhotos] = useState<Record<string, File>>({})
  const [signature, setSignature] = useState<Blob | null>(null)
  const [loadedQty, setLoadedQty] = useState<string>("")
  const [completed, setCompleted] = useState(false)
  const [loading, setLoading] = useState(false)
  
  // Container Fields overrides (Driver can update if needed)
  const [containerNo, setContainerNo] = useState("")
  const [sealNo, setSealNo] = useState("")

  // Job Data for Report
  const [job, setJob] = useState<Job | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (params.id) {
        getJobDetails(params.id).then(j => {
            setJob(j)
            if (j?.container) {
                setContainerNo(j.container.container_no || "")
                setSealNo(j.container.seal_no || "")
            }
        })
    }
  }, [params.id])

  const isContainer = job?.job_type === 'container'

  // Refined Validation Logic
  const getValidationErrors = () => {
    const errors: string[] = []
    
    if (photos.length === 0) {
        errors.push(isContainer ? "กรุณาถ่ายรูปใบ EIR" : "กรุณาถ่ายรูปสินค้า")
    }

    if (isContainer) {
        if (Object.keys(conditionPhotos).length < 4) {
            errors.push("กรุณาถ่ายรูปสภาพตู้ให้ครบ (อย่างน้อย 4 ด้าน)")
        }
        if (!containerNo || containerNo.trim().length < 5) {
            errors.push("กรุณาระบุหมายเลขตู้คอนเทนเนอร์")
        }
    } else {
        if (!signature) {
            errors.push("กรุณาลงลายเซ็นผู้ส่งของ")
        }
        const needsQty = (job?.Price_Per_Unit && Number(job.Price_Per_Unit) > 0) && 
                         (!job?.Price_Cust_Total || Number(job.Price_Cust_Total) === 0)
        if (needsQty && (!loadedQty || Number(loadedQty) <= 0)) {
            errors.push("กรุณาระบุจำนวนสินค้า")
        }
    }
    
    return errors
  }

  const handleConditionPhoto = (key: string, file: File | null) => {
    if (file) {
        setConditionPhotos(prev => ({ ...prev, [key]: file }))
    }
  }

  const handleSubmit = async () => {
    const errors = getValidationErrors()
    if (errors.length > 0) {
        toast.error(errors[0], { 
            description: "กรุณาตรวจสอบข้อมูลให้ครบถ้วนก่อนดำเนินการต่อ",
            duration: 4000
        })
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
                    canvas.toBlob(resolve, 'image/jpeg', 0.8)
                )
                
                if (reportBlob) {
                    formData.append("pickup_report", reportBlob, `Pickup_Report_${params.id}.jpg`)
                }
            } catch (err) {
                console.error("Report capture failed:", err)
            }
        }

        // 2. Append Photos & Data
        photos.forEach((photo, index) => formData.append(`photo_${index}`, photo))
        formData.append("photo_count", photos.length.toString())
        
        if (isContainer) {
            formData.append("job_type", "container")
            formData.append("container_no", containerNo)
            formData.append("seal_no", sealNo)
            Object.entries(conditionPhotos).forEach(([key, file]) => {
                formData.append(`condition_${key}`, file)
            })
        } else {
            if (signature) formData.append("signature", signature, "signature.png")
            if (loadedQty) formData.append("loaded_qty", loadedQty)
        }
        
        const result = await submitJobPickup(params.id, formData)
        
        if (result.success) {
            toast.success("บันทึกข้อมูลเรียบร้อยแล้ว", { id: "pickup-upload" })
            setCompleted(true)
            setTimeout(() => {
                router.push(`/mobile/jobs/${params.id}?success=pickup`)
            }, 1500)
        } else {
            toast.error(result.error || "เกิดข้อผิดพลาด", { id: "pickup-upload" })
        }
    } catch (err: any) {
        toast.error(err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ", { id: "pickup-upload" })
    } finally {
        setLoading(false)
    }
  }

  if (completed) {
    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
            <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mb-6 animate-bounce">
                <ShieldCheck size={48} className="text-white" />
            </div>
            <h1 className="text-3xl font-black text-foreground mb-2 italic">สำเร็จ!</h1>
            <p className="text-muted-foreground font-bold tracking-tight">บันทึกข้อมูลการรับตู้เรียบร้อยแล้ว</p>
        </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-32">
        <MobileHeader title={isContainer ? "บันทึกข้อมูลตู้ (EIR)" : "บันทึกการรับสินค้า"} showBack />

        <div className="px-5 pt-6 space-y-8">
            {isContainer ? (
                <>
                    <div className="bg-card rounded-3xl p-6 border border-border shadow-sm space-y-6">
                        <h3 className="text-lg font-black flex items-center gap-2 text-primary">
                            <Box size={20} /> ข้อมูลหน้างานจริง
                        </h3>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">หมายเลขตู้ (Container No.)</Label>
                                <input 
                                    value={containerNo}
                                    onChange={(e) => setContainerNo(e.target.value.toUpperCase())}
                                    placeholder="ระบุหมายเลขตู้..."
                                    className="w-full h-14 bg-muted/50 border border-border rounded-2xl px-4 text-xl font-black focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">หมายเลขซีล (Seal No.)</Label>
                                <input 
                                    value={sealNo}
                                    onChange={(e) => setSealNo(e.target.value.toUpperCase())}
                                    placeholder="ระบุหมายเลขซีล..."
                                    className="w-full h-14 bg-muted/50 border border-border rounded-2xl px-4 text-xl font-black focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <Label className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            <Camera size={16} className="text-primary" /> รูปถ่ายใบ EIR
                        </Label>
                        <CameraInput 
                            onImagesChange={setPhotos} 
                            maxImages={2} 
                        />
                    </div>

                    <div className="space-y-4">
                        <Label className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            <ShieldCheck size={16} className="text-indigo-500" /> ตรวจสอบสภาพตู้ (7-Point Check)
                        </Label>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                { key: 'front', label: 'ด้านหน้า' },
                                { key: 'back', label: 'ด้านหลัง' },
                                { key: 'left', label: 'ด้านซ้าย' },
                                { key: 'right', label: 'ด้านขวา' },
                                { key: 'top', label: 'เพดาน' },
                                { key: 'floor', label: 'พื้นตู้' },
                                { key: 'seal', label: 'จุดล็อคซีล' }
                            ].map((item) => (
                                <div key={item.key} className="relative group">
                                    <p className="text-[10px] font-bold text-muted-foreground mb-1 ml-1">{item.label}</p>
                                    <CameraInput 
                                        onImagesChange={(files: File[]) => handleConditionPhoto(item.key, files[0] || null)}
                                        maxImages={1}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className="space-y-4">
                        <Label className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                            <Camera size={16} className="text-primary" /> รูปถ่ายสินค้าขณะรับ
                        </Label>
                        <CameraInput 
                            onImagesChange={setPhotos} 
                            maxImages={5} 
                        />
                    </div>

                    {(job?.Price_Per_Unit && Number(job.Price_Per_Unit) > 0) && (!job?.Price_Cust_Total || Number(job.Price_Cust_Total) === 0) && (
                        <div className="bg-card rounded-3xl p-6 border border-border shadow-sm space-y-4">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                    <Box size={20} />
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">ปริมาณงาน</p>
                                    <h4 className="text-sm font-bold">ระบุจำนวนสินค้าที่รับ</h4>
                                </div>
                            </div>
                            
                            <QuantityStepper 
                                value={loadedQty} 
                                onChange={setLoadedQty} 
                                label="จำนวน (ชิ้น/หน่วย)"
                            />
                        </div>
                    )}

                    <div className="space-y-4">
                        <Label className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-indigo-500">
                            <ShieldCheck size={16} /> ลายเซ็นพนักงาน (ผู้ส่งของ)
                        </Label>
                        <SignaturePad 
                            onSave={setSignature} 
                        />
                    </div>
                </>
            )}

            {job && (
                isContainer ? (
                    <ContainerPickupReport 
                        ref={reportRef} 
                        job={{
                            ...job,
                            container: {
                                ...job.container,
                                container_no: containerNo,
                                seal_no: sealNo
                            }
                        } as any}
                        photos={photos.map(p => URL.createObjectURL(p))}
                        conditionPhotos={Object.fromEntries(
                            Object.entries(conditionPhotos).map(([k, v]) => [k, URL.createObjectURL(v)])
                        )}
                    />
                ) : (
                    <PickupReport 
                        ref={reportRef} 
                        job={job} 
                        photos={photos.map(p => URL.createObjectURL(p))} 
                        signature={signature ? URL.createObjectURL(signature) : null}
                        loadedQty={Number(loadedQty)}
                    />
                )
            )}
        </div>

        <div className="p-5 bg-background mt-8">
            <Button 
                onClick={handleSubmit}
                disabled={loading}
                className="w-full h-16 rounded-2xl text-lg font-black uppercase tracking-widest gap-3 shadow-2xl transition-all active:scale-95"
            >
                {loading ? (
                    <Loader2 className="animate-spin" size={24} />
                ) : (
                    <>
                        บันทึกและดำเนินการต่อ <ChevronRight size={20} />
                    </>
                )}
            </Button>
        </div>
    </div>
  )
}
