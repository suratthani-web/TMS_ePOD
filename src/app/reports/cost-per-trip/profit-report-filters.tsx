"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Users, Activity, X, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface FilterProps {
    allCustomers: { Customer_ID?: string | null; Customer_Name?: string | null }[]
    initialCustomers: string[]
    initialStart: string
    initialEnd: string
}

export function ProfitReportFilters({ allCustomers, initialCustomers, initialStart, initialEnd }: FilterProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    
    const [startDate, setStartDate] = useState(initialStart)
    const [endDate, setEndDate] = useState(initialEnd)
    const [selectedCustomers, setSelectedCustomers] = useState<string[]>(initialCustomers)
    const [isCustomerMenuOpen, setIsCustomerMenuOpen] = useState(false)
    const [isSyncing, setIsSyncing] = useState(false)

    const handleSync = () => {
        setIsSyncing(true)
        const params = new URLSearchParams(searchParams.toString())
        if (startDate) params.set('start', startDate)
        else params.delete('start')
        
        if (endDate) params.set('end', endDate)
        else params.delete('end')

        if (selectedCustomers.length > 0) params.set('customers', selectedCustomers.join(','))
        else params.delete('customers')
        
        router.push(`/reports/cost-per-trip?${params.toString()}`)
        setTimeout(() => setIsSyncing(false), 1000)
    }

    const toggleCustomer = (name: string) => {
        setSelectedCustomers(prev => 
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        )
    }

    const handleReset = () => {
        setStartDate("")
        setEndDate("")
        setSelectedCustomers([])
        router.push(`/reports/cost-per-trip`)
    }

    return (
        <div className="flex flex-col md:flex-row items-center gap-4 bg-card p-4 rounded-2xl border border-border shadow-sm mb-8 relative z-50">
             <div className="flex flex-wrap items-center gap-3 relative z-10 w-full">
                <div className="relative">
                    <button 
                        onClick={() => setIsCustomerMenuOpen(!isCustomerMenuOpen)}
                        className={cn(
                            "h-11 px-4 bg-background border border-border rounded-xl flex items-center gap-2 hover:border-primary/40 transition-all text-sm font-semibold",
                            selectedCustomers.length > 0 && "border-primary text-primary shadow-sm"
                        )}
                    >
                        <Users size={16} />
                        {selectedCustomers.length > 0 ? `${selectedCustomers.length} เลือกแล้ว` : "เลือกตามลูกค้า"}
                    </button>

                    {isCustomerMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsCustomerMenuOpen(false)} />
                            <div className="absolute left-0 mt-2 w-72 bg-card border border-border rounded-2xl shadow-lg z-50 p-5 animate-in fade-in zoom-in duration-200">
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-xs font-medium text-muted-foreground">เลือกรายชื่อลูกค้า</p>
                                </div>
                                <div className="max-h-64 overflow-y-auto space-y-1 custom-scrollbar pr-2">
                                    {allCustomers.filter((c) => Boolean(c.Customer_Name)).map(c => {
                                        const customerName = c.Customer_Name || ""
                                        return (
                                        <button 
                                            key={c.Customer_ID || customerName}
                                            onClick={() => toggleCustomer(customerName)}
                                            className={cn(
                                                "w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-muted group transition-all text-left",
                                                selectedCustomers.includes(customerName) ? "bg-primary/10" : ""
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className={cn("w-2 h-2 rounded-full", selectedCustomers.includes(customerName) ? "bg-primary" : "bg-muted-foreground/30")} />
                                                <span className={cn(
                                                    "text-xs font-medium truncate max-w-[180px]",
                                                    selectedCustomers.includes(customerName) ? "text-primary" : "text-foreground"
                                                )}>{customerName}</span>
                                            </div>
                                            {selectedCustomers.includes(customerName) && <Check size={14} className="text-primary" />}
                                        </button>
                                    )})}
                                </div>
                                <div className="mt-4 pt-4 border-t border-border">
                                    <button 
                                        onClick={handleSync}
                                        className="w-full h-10 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 transition-all shadow-sm"
                                    >
                                        ตกลง
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-48 bg-background border border-border rounded-xl px-3 h-11 hover:border-primary/40 transition-all">
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">เริ่ม:</span>
                    <input 
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-sm font-medium text-foreground w-full cursor-pointer"
                    />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-48 bg-background border border-border rounded-xl px-3 h-11 hover:border-primary/40 transition-all">
                    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">สิ้นสุด:</span>
                    <input 
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-sm font-medium text-foreground w-full cursor-pointer"
                    />
                </div>
                
                {(startDate || endDate || selectedCustomers.length > 0) && (
                    <button 
                        onClick={handleReset}
                        className="p-2.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                        title="Reset Range"
                    >
                        <X size={18} />
                    </button>
                )}
                
                <button 
                    onClick={handleSync}
                    disabled={isSyncing}
                    className={cn(
                        "px-6 h-11 bg-primary text-primary-foreground font-semibold text-sm rounded-xl hover:bg-primary/90 transition-all flex items-center gap-2 shadow-sm ml-auto",
                        isSyncing && "opacity-50 cursor-not-allowed"
                    )}
                >
                    <Activity size={14} strokeWidth={3} />
                    {isSyncing ? "กำลังประมวลผล..." : "แสดงผล"}
                </button>
            </div>
        </div>
    )
}
