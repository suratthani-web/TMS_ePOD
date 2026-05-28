"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Activity, MapPin, Truck, Clock } from "lucide-react"
import { MobileHeader } from "@/components/mobile/mobile-header"
import { BottomNav } from "@/components/mobile/bottom-nav"
import { submitBid, getMyBidsForJobs } from "@/lib/actions/marketplace-actions"
import { toast } from "sonner"
import type { Job } from "@/lib/supabase/jobs"
import { createClient } from "@/utils/supabase/client"
import { useRouter } from "next/navigation"

interface MarketplaceClientProps {
    initialJobs: Job[]
    driverId: string
    driverName: string
}

export type JobBid = {
    bid_id: string
    job_id: string
    driver_id: string
    bid_amount: number
    status: string
}

export function MarketplaceClient({ initialJobs, driverId, driverName }: MarketplaceClientProps) {
    const router = useRouter()
    const supabase = createClient()
    const [jobs] = useState<Job[]>(initialJobs)
    const [biddingJob, setBiddingJob] = useState<string | null>(null)
    const [bidAmount, setBidAmount] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [myBids, setMyBids] = useState<Record<string, number>>({})

    // Effect to check if driver has already bid on these jobs
    useEffect(() => {
        const checkBids = async () => {
            if (!driverId) return
            try {
                const bids = await getMyBidsForJobs(driverId)
                const bidMap: Record<string, number> = {}
                bids.forEach((b: { job_id: string, bid_amount: number }) => {
                    bidMap[b.job_id] = b.bid_amount
                })
                setMyBids(bidMap)
            } catch (err) {
                console.error("Failed to fetch bids:", err)
            }
        }
        checkBids()
    }, [driverId, isSubmitting])

    // Real-time listener for NEW unassigned jobs
    useEffect(() => {
        const channel = supabase.channel('marketplace_realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'Jobs_Main',
            }, (payload) => {
                // Only refresh if it's a potential marketplace job (no driver assigned)
                if (!(payload.new as Record<string, unknown>)?.Driver_ID) {
                    toast.info("มีงานใหม่ในตลาดกลาง! กำลังอัปเดต...")
                    router.refresh()
                }
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [router, supabase])

    // Check if missing driver details
    if (!driverId) {
        return (
            <div className="min-h-screen bg-gray-50 pb-20">
                <MobileHeader title="Marketplace" />
                <div className="pt-20 px-4 text-center">
                    <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Activity size={32} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">ข้อมูลบัญชีไม่สมบูรณ์</h2>
                    <p className="text-muted-foreground">บัญชีนี้ยังไม่ถูกตั้งค่าเป็นพนักงานขับรถ ไม่สามารถเสนอราคางานได้</p>
                </div>
                <BottomNav />
            </div>
        )
    }

    const handleBidClick = (jobId: string) => {
        setBiddingJob(jobId)
        setBidAmount("")
    }

    const handleSubmitBid = async (jobId: string) => {
        if (!bidAmount || isNaN(Number(bidAmount)) || Number(bidAmount) <= 0) {
            toast.error("กรุณาระบุราคาประมูลที่ถูกต้อง")
            return
        }

        setIsSubmitting(true)
        try {
            const result = await submitBid(jobId, driverId, driverName, Number(bidAmount))
            if (result.success) {
                toast.success(result.message)
                setBiddingJob(null)
                setMyBids(prev => ({ ...prev, [jobId]: Number(bidAmount) }))
            } else {
                toast.error(result.message)
            }
        } catch (err) {
            console.error("Bidding error:", err)
            toast.error("เกิดข้อผิดพลาดในการเชื่อมต่อระบบ")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-24">
            <MobileHeader title="หาเที่ยวงาน (Marketplace)" />

            <div className="pt-20 px-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-bold text-gray-900 text-lg">งานที่ยังไม่มีคนรับ</h2>
                        <p className="text-lg font-bold text-muted-foreground">งานที่พร้อมให้คุณกดรับ</p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-none">
                        {jobs.length} งานใหม่
                    </Badge>
                </div>

                {jobs.length === 0 ? (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white border border-gray-100 rounded-[2rem] p-8 mt-6 flex flex-col items-center justify-center text-center shadow-lg"
                    >
                        <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
                            <Activity className="text-gray-300 w-8 h-8" />
                        </div>
                        <h4 className="text-lg font-bold text-gray-900 mb-1">ยังไม่มีงานในช่วงนี้</h4>
                        <p className="text-xl text-muted-foreground">ขณะนี้ไม่มีงานใหม่ที่เปิดรับประมูล เมื่อมีงานเข้ามาจะแสดงที่หน้านี้อัตโนมัติ</p>
                    </motion.div>
                ) : (
                    <div className="space-y-4">
                        {jobs.map((job, idx) => {
                            const currentBid = myBids[job.Job_ID]
                            
                            return (
                                <motion.div
                                    key={job.Job_ID}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                >
                                    <Card className={`border-none shadow-md rounded-2xl overflow-hidden ${currentBid ? 'ring-2 ring-emerald-500/30' : ''}`}>
                                        <CardContent className="p-0">
                                            <div className="p-4 bg-white">
                                                {/* Header */}
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <span className="text-base font-bold font-black text-emerald-500 uppercase tracking-widest">{job.Job_ID}</span>
                                                        <h3 className="font-bold text-gray-900 text-base">{job.Route_Name || 'ไม่ระบุเส้นทาง'}</h3>
                                                    </div>
                                                    {currentBid && (
                                                        <Badge className="bg-emerald-500 text-white border-none text-base font-bold">
                                                            ประมูลแล้ว: ฿{currentBid.toLocaleString()}
                                                        </Badge>
                                                    )}
                                                </div>

                                                {/* Route */}
                                                <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-xl mb-4">
                                                    <MapPin size={14} className="text-emerald-500 shrink-0" />
                                                    <div className="flex-1 flex flex-col min-w-0">
                                                        <span className="text-lg font-bold font-bold text-gray-900 truncate">{job.Origin_Location}</span>
                                                        <div className="h-4 border-l-2 border-dashed border-gray-300 ml-1.5 my-1" />
                                                        <span className="text-lg font-bold font-bold text-gray-900 truncate">{job.Dest_Location}</span>
                                                    </div>
                                                </div>

                                                {/* Details */}
                                                <div className="flex justify-between items-center bg-white rounded-xl mb-4 text-lg font-bold font-medium border border-gray-100 p-2">
                                                    <div className="flex items-center gap-1.5 text-gray-600">
                                                        <Clock size={14} className="text-orange-500"/>
                                                        <span>{job.Plan_Date ? new Date(job.Plan_Date).toLocaleDateString('th-TH') : 'ไม่ระบุวัน'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-emerald-600 font-bold">
                                                        <Activity size={14} />
                                                        <span>เป้าหมาย: ฿{(job.Cost_Driver_Total || 0).toLocaleString()}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-gray-600">
                                                        <Truck size={14} className="text-blue-500"/>
                                                        <span>{job.Vehicle_Type || 'ไม่ระบุประเภทรถ'}</span>
                                                    </div>
                                                </div>

                                                {/* Bidding Area */}
                                                {biddingJob === job.Job_ID ? (
                                                    <motion.div 
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: "auto", opacity: 1 }}
                                                        className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 space-y-3"
                                                    >
                                                        <div>
                                                            <label className="text-base font-bold uppercase font-bold text-muted-foreground tracking-wider">
                                                                {currentBid ? 'แก้ไขราคาเสนอของคุณ (บาท)' : 'เสนอราคาของคุณ (บาท)'}
                                                            </label>
                                                            <div className="relative mt-1">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">฿</span>
                                                                <Input 
                                                                    type="number"
                                                                    value={bidAmount}
                                                                    onChange={(e) => setBidAmount(e.target.value)}
                                                                    placeholder={currentBid ? String(currentBid) : "เช่น 1500"}
                                                                    className="pl-8 bg-white border-emerald-500/30 focus-visible:ring-emerald-500 text-emerald-700 font-bold"
                                                                    autoFocus
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Button 
                                                                variant="outline" 
                                                                className="flex-1 text-gray-600 font-bold h-12 rounded-xl"
                                                                onClick={() => setBiddingJob(null)}
                                                                disabled={isSubmitting}
                                                            >
                                                                ยกเลิก
                                                            </Button>
                                                            <Button 
                                                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 rounded-xl"
                                                                onClick={() => handleSubmitBid(job.Job_ID)}
                                                                disabled={isSubmitting || !bidAmount}
                                                            >
                                                                {isSubmitting ? 'กำลังส่ง...' : currentBid ? 'อัปเดตราคา' : 'ยืนยันราคา'}
                                                            </Button>
                                                        </div>
                                                    </motion.div>
                                                ) : (
                                                    <Button 
                                                        onClick={() => handleBidClick(job.Job_ID)}
                                                        className={`w-full rounded-xl font-bold shadow-md active:scale-95 transition-all text-xl h-12 ${
                                                            currentBid 
                                                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-500/20' 
                                                                : 'bg-black text-white hover:bg-gray-800'
                                                        }`}
                                                    >
                                                        {currentBid ? 'เสนอราคาใหม่เพื่อแข่งขัน' : 'เสนอราคารับงานนี้'}
                                                    </Button>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            )
                        })}
                    </div>
                )}
            </div>

            <BottomNav />
        </div>
    )
}
