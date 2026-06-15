"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Activity, Clock, MapPin, ArrowRight, Truck, Database, ChevronDown, CheckCircle2, Trash2 } from "lucide-react"
import { Job } from "@/lib/supabase/jobs"
import { getBidsForJob, acceptBid, cancelBiddingJob, JobBid } from "@/lib/actions/marketplace-actions"
import { toast } from "sonner"
import { useLanguage } from "@/components/providers/language-provider"

interface OrderBiddingProps {
    orders?: Job[]
}

export function OrderBidding({ orders = [] }: OrderBiddingProps) {
    const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
    const [bidsByJob, setBidsByJob] = useState<Record<string, JobBid[]>>({})
    const [loadingBids, setLoadingBids] = useState<Record<string, boolean>>({})
    const [processingBid, setProcessingBid] = useState<string | null>(null)
    const [processingJobId, setProcessingJobId] = useState<string | null>(null)
    const [acceptedJobIds, setAcceptedJobIds] = useState<Set<string>>(new Set())
    const [cancellingJobId, setCancellingJobId] = useState<string | null>(null)
    const [refreshTrigger] = useState(0)

    // Derived states
    // In admin view, we want to see unassigned jobs that have potential bids
    const displayOrders = orders.filter(o => !acceptedJobIds.has(o.Job_ID))

    const fetchBids = async (jobId: string) => {
        setLoadingBids(prev => ({ ...prev, [jobId]: true }))
        const bids = await getBidsForJob(jobId)
        setBidsByJob(prev => ({ ...prev, [jobId]: bids }))
        setLoadingBids(prev => ({ ...prev, [jobId]: false }))
    }

    const toggleExpand = async (jobId: string) => {
        if (expandedJobId === jobId) {
            setExpandedJobId(null)
            return
        }

        setExpandedJobId(jobId)
        
        // Fetch bids if not already fetched
        if (!bidsByJob[jobId] || bidsByJob[jobId].length === 0) {
            await fetchBids(jobId)
        }
    }

    // Effect to pre-load bid counts for all orders
    useEffect(() => {
        const fetchAllBids = async () => {
            const results: Record<string, JobBid[]> = {}
            for (const order of orders) {
                const bids = await getBidsForJob(order.Job_ID)
                results[order.Job_ID] = bids
            }
            setBidsByJob(results)
        }
        if (orders.length > 0) fetchAllBids()
    }, [orders, refreshTrigger])

    const handleAcceptBid = async (job: Job, bid: JobBid) => {
        if (!confirm(t('logistics.confirm_accept', { name: bid.driver_name, amount: bid.bid_amount.toLocaleString() }))) return

        setProcessingBid(bid.bid_id)
        setProcessingJobId(job.Job_ID)
        
        try {
            const result = await acceptBid(job.Job_ID, bid.bid_id, bid.driver_id, bid.driver_name, bid.bid_amount)
            
            if (result.success) {
                toast.success(result.message)
                // Optimistic UI: Hide this job immediately
                setAcceptedJobIds(prev => new Set(prev).add(job.Job_ID))
                setExpandedJobId(null)
            } else {
                toast.error(result.message)
            }
        } finally {
            setProcessingBid(null)
            setProcessingJobId(null)
        }
    }

    const handleDelete = async (jobId: string) => {
        if (!confirm(t('logistics.confirm_cancel_market', { id: jobId }))) return
        
        setCancellingJobId(jobId)
        try {
            const result = await cancelBiddingJob(jobId)
            if (result.success) {
                toast.success(result.message)
                setAcceptedJobIds(prev => new Set(prev).add(jobId))
            } else {
                toast.error(result.message)
            }
        } catch {
            toast.error(t('common.error'))
        } finally {
            setCancellingJobId(null)
        }
    }

    const { t } = useLanguage()

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <div className="flex flex-col">
                        <CardTitle className="text-xl font-bold flex items-center gap-3">
                            <Activity className="text-emerald-500" />
                            {t('logistics.marketplace')}
                        </CardTitle>
                        <p className="text-lg font-bold text-muted-foreground font-bold tracking-wide mt-1">
                            {t('logistics.bid_subtitle')}
                        </p>
                    </div>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-bold px-3 py-1">
                    {displayOrders.length} {t('logistics.unassigned_jobs')}
                </Badge>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {displayOrders.length > 0 ? (
                    displayOrders.map((order, idx) => (
                        <motion.div
                            key={order.Job_ID}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                        >
                            <Card className="bg-card border border-border rounded-[2rem] overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                                <CardContent className="p-0">
                                    <div 
                                        className="p-6 cursor-pointer hover:bg-muted/40 transition-colors flex flex-col md:flex-row justify-between gap-6"
                                        onClick={() => toggleExpand(order.Job_ID)}
                                    >
                                        <div className="flex-1 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-lg font-bold font-black text-emerald-500 uppercase tracking-widest">{order.Job_ID}</span>
                                                <div className="flex items-center gap-1 text-orange-500 font-bold text-lg font-bold">
                                                    <Clock size={14} /> {t('logistics.waiting_bid')}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <h4 className="text-lg font-bold text-foreground leading-tight">
                                                    {order.Route_Name || t('logistics.no_route')}
                                                </h4>
                                                <div className="flex items-center gap-2 text-foreground text-xl font-medium bg-muted/50 p-2 rounded-lg inline-flex">
                                                    <MapPin size={14} className="text-emerald-500" />
                                                    {order.Origin_Location}
                                                    <ArrowRight size={12} className="text-muted-foreground" />
                                                    {order.Dest_Location}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className="flex items-center gap-1.5 text-muted-foreground text-lg font-bold font-bold">
                                                    <Truck size={14} /> {order.Vehicle_Type || t('logistics.not_specified')}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between md:flex-col md:justify-center md:items-end md:w-48 gap-4 border-t md:border-t-0 md:border-l border-border pt-4 md:pt-0 pl-0 md:pl-6">
                                            <div className="text-left md:text-right">
                                                {bidsByJob[order.Job_ID]?.length > 0 ? (
                                                    <div className="space-y-1">
                                                        <Badge className="bg-orange-500 hover:bg-orange-600 text-white border-0 font-black px-2 py-0.5 text-xs animate-pulse">
                                                            {bidsByJob[order.Job_ID].length} BIDS
                                                        </Badge>
                                                        <p className="text-base font-bold uppercase tracking-wider text-muted-foreground font-bold">
                                                            {t('logistics.best_offer')}
                                                        </p>
                                                        <p className="text-lg font-black text-orange-600">
                                                            ฿{Math.min(...bidsByJob[order.Job_ID].map(b => b.bid_amount)).toLocaleString()}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <p className="text-base font-bold uppercase tracking-wider text-muted-foreground font-bold mb-1">
                                                            {t('logistics.base_price')}
                                                        </p>
                                                        <p className="text-lg font-black text-foreground">
                                                            ฿{(order.Cost_Driver_Total || 0).toLocaleString()}
                                                        </p>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(order.Job_ID); }}
                                                    disabled={cancellingJobId === order.Job_ID}
                                                    className="w-10 h-10 rounded-xl flex items-center justify-center text-rose-500 hover:bg-rose-500/10 border border-rose-500/20 transition-colors disabled:opacity-50"
                                                    title={t('common.delete')}
                                                >
                                                    {cancellingJobId === order.Job_ID ? (
                                                        <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <Trash2 size={18} />
                                                    )}
                                                </button>
                                                <button
                                                    className={`h-10 px-4 rounded-xl font-bold text-lg gap-2 border border-border text-foreground hover:bg-muted flex items-center transition-all ${expandedJobId === order.Job_ID ? 'bg-muted ring-2 ring-primary/20' : ''}`}
                                                >
                                                    {t('logistics.view_bids')} <ChevronDown size={14} className={`transition-transform duration-300 ${expandedJobId === order.Job_ID ? 'rotate-180' : ''}`} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {expandedJobId === order.Job_ID && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="bg-muted/30 border-t border-border"
                                            >
                                                <div className="p-6">
                                                    <h5 className="font-bold text-foreground mb-4 flex items-center gap-2">
                                                        <Database size={16} className="text-emerald-500" />
                                                        {t('logistics.driver_bids')}
                                                    </h5>
                                                    
                                                    {loadingBids[order.Job_ID] ? (
                                                        <div className="text-center py-8 text-muted-foreground text-xl flex items-center justify-center gap-2">
                                                            <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                                            {t('logistics.loading_bids')}
                                                        </div>
                                                    ) : !bidsByJob[order.Job_ID] || bidsByJob[order.Job_ID].length === 0 ? (
                                                        <div className="bg-card rounded-xl p-8 text-center shadow-sm border border-border">
                                                            <p className="text-muted-foreground font-medium">{t('logistics.no_bids')}</p>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-3">
                                                            {bidsByJob[order.Job_ID].map(bid => (
                                                                <div key={bid.bid_id} className="bg-card rounded-xl p-4 shadow-sm border border-border flex flex-col sm:flex-row items-center justify-between gap-4 transition-all hover:border-emerald-500/40">
                                                                    <div className="flex items-center gap-4 w-full sm:w-auto">
                                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center text-emerald-700 font-bold shrink-0">
                                                                            {bid.driver_name.charAt(0).toUpperCase()}
                                                                        </div>
                                                                        <div>
                                                                            <p className="font-bold text-foreground">{bid.driver_name}</p>
                                                                            <p className="text-lg font-bold text-muted-foreground">{t('logistics.bid_at')} {new Date(bid.created_at).toLocaleString('th-TH')}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center justify-between w-full sm:w-auto gap-6 bg-muted/30 px-4 py-2 rounded-lg">
                                                                        <div className="text-right">
                                                                            <p className="text-base font-bold uppercase font-bold text-muted-foreground">{t('logistics.bid_price')}</p>
                                                                            <p className="text-lg font-black text-emerald-600">฿{bid.bid_amount.toLocaleString()}</p>
                                                                        </div>
                                                                        <Button 
                                                                            onClick={(e) => { e.stopPropagation(); handleAcceptBid(order, bid); }}
                                                                            disabled={processingJobId === order.Job_ID}
                                                                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 px-6"
                                                                        >
                                                                            {processingBid === bid.bid_id ? t('logistics.processing') : (
                                                                                <span className="flex items-center gap-1.5"><CheckCircle2 size={16} /> {t('logistics.accept_bid')}</span>
                                                                            )}
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))
                ) : (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-muted/30 border-2 border-dashed border-border rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center"
                    >
                        <div className="w-16 h-16 bg-card shadow-sm rounded-2xl flex items-center justify-center mb-4">
                            <Activity className="text-muted-foreground w-8 h-8" />
                        </div>
                        <h4 className="text-lg font-bold text-foreground mb-1">{t('logistics.no_auction')}</h4>
                        <p className="text-xl text-muted-foreground">{t('logistics.auction_desc')}</p>
                    </motion.div>
                )}
            </div>
        </div>
    )
}

