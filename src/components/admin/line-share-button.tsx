"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Share2, Send, Loader2 } from "lucide-react"
import Script from "next/script"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { adminUpdateJobStatus } from "@/app/admin/jobs/actions"
import { useRouter } from "next/navigation"

interface LineShareButtonProps {
  job: any
  variant?: "default" | "icon"
}

export function LineShareButton({ job, variant = "default" }: LineShareButtonProps) {
  const [isLiffInit, setIsLiffInit] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)
  const router = useRouter()

  const initLiff = React.useCallback(() => {
    if (!window.liff) {
        setInitError("LINE SDK not found")
        return
    }

    const liffId = process.env.NEXT_PUBLIC_LIFF_SHARE_ID || process.env.NEXT_PUBLIC_LIFF_SIGNATURE_ID || ""
    
    if (!liffId) {
        setInitError("Missing LIFF ID")
        console.warn("LIFF ID not found. Please set NEXT_PUBLIC_LIFF_SHARE_ID or NEXT_PUBLIC_LIFF_SIGNATURE_ID in Vercel.")
        return
    }

    if (isLiffInit) return

    window.liff.init({ liffId })
      .then(() => {
        setIsLiffInit(true)
        setInitError(null)
      })
      .catch((err: any) => {
        setInitError(`Init failed: ${err.message || 'Unknown error'}`)
        console.error("LIFF Init failed", err)
      })
  }, [isLiffInit])

  React.useEffect(() => {
    // If liff is already on window (from another page/component), init it
    if (window.liff && !isLiffInit && !initError) {
      initLiff()
    }
  }, [initLiff, isLiffInit, initError])

  const shareJob = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    if (initError) {
        toast.error(`LINE LIFF Error: ${initError}. โปรดเช็คการตั้งค่ารหัส LIFF ID ในระบบแอดมิน`)
        return
    }

    if (!window.liff || !isLiffInit) {
      initLiff() // Try to re-init if not ready
      toast.info("ระบบ LINE กำลังเชื่อมต่อ... กรุณาลองใหม่ใน 1-2 วินาที")
      return
    }

    if (!window.liff.isLoggedIn()) {
      window.liff.login()
      return
    }

    setLoading(true)

    try {
      if (window.liff.isApiAvailable("shareTargetPicker")) {
        const result = await window.liff.shareTargetPicker([
          {
            type: "flex",
            altText: `งานใหม่: ${job.Job_ID} - ${job.Customer_Name}`,
            contents: {
              type: "bubble",
              direction: "ltr",
              header: {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "text",
                    text: "MISSION ASSIGNED",
                    weight: "bold",
                    size: "sm",
                    color: "#10b981",
                    contents: []
                  },
                  {
                    type: "text",
                    text: `ID: ${job.Job_ID}`,
                    weight: "bold",
                    size: "xl",
                    margin: "md",
                    contents: []
                  }
                ]
              },
              body: {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "box",
                    layout: "vertical",
                    spacing: "sm",
                    contents: [
                      {
                        type: "box",
                        layout: "baseline",
                        spacing: "sm",
                        contents: [
                          {
                            type: "text",
                            text: "ลูกค้า",
                            color: "#aaaaaa",
                            size: "sm",
                            flex: 1,
                            contents: []
                          },
                          {
                            type: "text",
                            text: job.Customer_Name || "-",
                            wrap: true,
                            color: "#666666",
                            size: "sm",
                            flex: 4,
                            contents: []
                          }
                        ]
                      },
                      {
                        type: "box",
                        layout: "baseline",
                        spacing: "sm",
                        contents: [
                          {
                            type: "text",
                            text: "สถานที่",
                            color: "#aaaaaa",
                            size: "sm",
                            flex: 1,
                            contents: []
                          },
                          {
                            type: "text",
                            text: job.Dest_Location || "-",
                            wrap: true,
                            color: "#666666",
                            size: "sm",
                            flex: 4,
                            contents: []
                          }
                        ]
                      }
                    ]
                  }
                ]
              },
              footer: {
                type: "box",
                layout: "vertical",
                spacing: "sm",
                contents: [
                  {
                    type: "button",
                    style: "primary",
                    height: "sm",
                    color: "#10b981",
                    action: {
                      type: "message",
                      label: "รับงาน",
                      text: "รับงาน"
                    }
                  },
                  {
                    type: "button",
                    style: "link",
                    height: "sm",
                    action: {
                      type: "uri",
                      label: "ดูรายละเอียดงาน",
                      uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_SIGNATURE_ID}/?jobId=${job.Job_ID}`
                    }
                  }
                ],
                flex: 0
              }
            }
          }
        ])

        if (result) {
          toast.success("ส่งข้อมูลเรียบร้อยแล้ว")
          
          // Auto-update status from Draft to New if needed
          if (job.Job_Status === 'Draft' || !job.Job_Status) {
            const updateResult = await adminUpdateJobStatus(job.Job_ID, 'New', 'Published via LINE Share')
            if (updateResult.success) {
                toast.success("อัปเดตสถานะงานเป็น NEW เรียบร้อย")
                router.refresh()
            }
          }
        }
      } else {
        toast.error("ShareTargetPicker ไม่รองรับในเวอร์ชันนี้")
      }
    } catch (error) {
      console.error("TargetPicker error", error)
      toast.error("เกิดข้อผิดพลาดในการแชร์")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Script
        src="https://static.line-scdn.net/liff/edge/2/sdk.js"
        onLoad={handleLiffScriptLoad}
      />
      {variant === "icon" ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={shareJob}
          disabled={loading}
          className="h-8 w-8 hover:bg-primary/10 text-primary border border-primary/20 rounded-lg"
          title="Share to LINE"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={shareJob}
          disabled={loading}
          className="h-14 px-8 rounded-2xl font-black uppercase tracking-widest gap-3 border-2 border-primary/20 hover:bg-primary/5 hover:border-primary/40 transition-all italic text-primary"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
          LINE Share
        </Button>
      )}
    </>
  )
}

