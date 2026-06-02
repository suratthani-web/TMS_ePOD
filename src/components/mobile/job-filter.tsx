"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter
} from "@/components/ui/sheet"
import { Filter, Calendar } from "lucide-react"

export function MobileJobFilter({ searchParams }: { searchParams: any }) {
  const router = useRouter()
  const pathname = usePathname()
 
  const [dateFrom, setDateFrom] = useState((searchParams?.dateFrom as string) || "")
  const [dateTo, setDateTo] = useState((searchParams?.dateTo as string) || "")
  const [status, setStatus] = useState((searchParams?.status as string) || "All")
  const [isOpen, setIsOpen] = useState(false)
 
  // Apply filters
  const handleApply = () => {
    const params = new URLSearchParams()
    if (dateFrom) params.set("dateFrom", dateFrom)
    if (dateTo) params.set("dateTo", dateTo)
    if (status && status !== "All") params.set("status", status)
    
    router.replace(`${pathname}?${params.toString()}`)
    setIsOpen(false)
  }
 
  // Clear filters
  const handleClear = () => {
    setDateFrom("")
    setDateTo("")
    setStatus("All")
    router.replace(pathname)
    setIsOpen(false)
  }
 
  const activeFilterCount = ((dateFrom || dateTo) ? 1 : 0) + (status !== "All" ? 1 : 0)
 
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button 
            variant="outline" 
            size="sm" 
            className={`gap-2 border-gray-200 bg-white text-gray-700 hover:text-white ${
                activeFilterCount > 0 ? 'border-blue-500 text-emerald-500' : ''
            }`}
        >
          <Filter size={14} />
          ตัวกรอง
          {activeFilterCount > 0 && (
              <span className="flex items-center justify-center w-5 h-5 ml-1 text-foreground bg-emerald-600 rounded-full">
                  {activeFilterCount}
              </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-auto rounded-t-[2.5rem] border-t border-border bg-card text-foreground px-6 py-8">
        <SheetHeader className="mb-6 text-left">
          <SheetTitle className="text-foreground flex justify-between items-center text-xl font-black italic uppercase tracking-wider">
            <span>ตัวกรองงาน</span>
            {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={handleClear} className="h-8 text-muted-foreground hover:text-foreground">
                    ล้างค่า
                </Button>
            )}
          </SheetTitle>
        </SheetHeader>
        
        <div className="space-y-6 pb-6">
            {/* Date Filter & Presets */}
            <div className="space-y-4">
                <div className="flex justify-between items-end">
                    <Label className="text-muted-foreground font-black text-xs uppercase tracking-widest">ช่วงวันที่</Label>
                    <div className="flex gap-2">
                        <button 
                            type="button" 
                            onClick={() => {
                                const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                                setDateFrom(todayStr)
                                setDateTo(todayStr)
                            }}
                            className="text-[10px] px-2 py-1 bg-muted hover:bg-muted/80 text-foreground rounded-md font-bold uppercase transition-colors"
                        >วันนี้</button>
                        <button 
                            type="button" 
                            onClick={() => {
                                const d = new Date(); d.setDate(d.getDate() + 1);
                                const tomStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
                                setDateFrom(tomStr)
                                setDateTo(tomStr)
                            }}
                            className="text-[10px] px-2 py-1 bg-muted hover:bg-muted/80 text-foreground rounded-md font-bold uppercase transition-colors"
                        >พรุ่งนี้</button>
                        <button 
                            type="button" 
                            onClick={() => {
                                setDateFrom("")
                                setDateTo("")
                            }}
                            className="text-[10px] px-2 py-1 bg-primary/10 text-primary rounded-md font-bold uppercase hover:bg-primary/20 transition-colors"
                        >ทั้งหมด</button>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="dateFrom" className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">เริ่มต้น</Label>
                        <div className="relative">
                            <Input 
                                id="dateFrom" 
                                type="date" 
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="bg-muted/50 border-border text-foreground pl-10 h-12 rounded-xl focus-visible:ring-primary/20 text-xs font-bold"
                            />
                            <Calendar className="absolute left-3 top-3.5 text-muted-foreground" size={14} />
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="dateTo" className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">สิ้นสุด</Label>
                        <div className="relative">
                            <Input 
                                id="dateTo" 
                                type="date" 
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="bg-muted/50 border-border text-foreground pl-10 h-12 rounded-xl focus-visible:ring-primary/20 text-xs font-bold"
                            />
                            <Calendar className="absolute left-3 top-3.5 text-muted-foreground" size={14} />
                        </div>
                    </div>
                </div>
            </div>
 
            {/* Status Filter */}
            <div className="space-y-2">
                <Label className="text-muted-foreground font-black text-xs uppercase tracking-widest">สถานะงาน</Label>
                <div className="flex flex-wrap gap-2">
                    {['All', 'Assigned', 'In Transit', 'Completed', 'Cancelled'].map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatus(s)}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                                status === s 
                                    ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' 
                                    : 'bg-transparent border-border text-muted-foreground hover:border-muted'
                            }`}
                        >
                            {s === 'All' ? 'ทั้งหมด' : 
                             s === 'Assigned' ? 'จัดรถแล้ว' :
                             s === 'In Transit' ? 'กำลังเดินทาง' :
                             s === 'Completed' ? 'สำเร็จ' : 'ยกเลิก'}
                        </button>
                    ))}
                </div>
            </div>
        </div>
 
        <SheetFooter>
             <Button onClick={handleApply} className="w-full h-14 rounded-2xl text-xs font-black uppercase tracking-widest italic bg-primary hover:bg-primary/95 text-white transition-all shadow-xl shadow-primary/20 mb-2">
                ดูผลลัพธ์
             </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
