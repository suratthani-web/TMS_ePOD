"use client"

import { useEffect, useRef } from "react"
import { createClient } from "@/utils/supabase/client"
import { toast } from "sonner"
import { 
  ShieldAlert, 
  Phone, 
  Fuel, 
  Wrench, 
  ClipboardCheck, 
  PackageX, 
  CalendarDays, 
  Package 
} from "lucide-react"
import { useRouter } from "next/navigation"

interface AdminGlobalNotifierProps {
  branchId?: string | null
  isAdmin?: boolean
}

/**
 * AdminGlobalNotifier
 * Central hub for real-time admin alerts.
 * Subscribes to multiple operational tables and shows high-priority toasts.
 */


export function AdminGlobalNotifier({ branchId, isAdmin }: AdminGlobalNotifierProps) {
  const router = useRouter()
  // Track notified IDs to avoid double-toasting for the same event updates
  const notifiedIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!isAdmin) return

    const supabase = createClient()

    // Helper to play sound
    const playSound = (type: 'emergency' | 'standard') => {
      try {
        const file = type === 'emergency' ? '/sounds/emergency.mp3' : '/sounds/notification.mp3'
        const audio = new Audio(file)
        audio.volume = 0.5
        audio.play().catch(() => {})
      } catch {}
    }

    // Generic handler for operational alerts (Fuel, Repair, Inspect, Damage, Leave, Shipment)
    const handleOperationalAlert = (
      id: string, 
      type: 'fuel' | 'repair' | 'inspect' | 'damage' | 'leave' | 'shipment',
      data: any,
      options: { title: string, message: string, color: string, icon: any, href: string }
    ) => {
      // 1. Uniqueness check
      if (notifiedIds.current.has(`${type}-${id}`)) return
      
      // 2. Branch Filtering
      // Filter by selected branch for everyone (including Super Admin)
      if (branchId && branchId !== 'All') {
          // If the data has a Branch_ID and it doesn't match, skip
          if (data.Branch_ID && String(data.Branch_ID) !== String(branchId)) return
      }

      notifiedIds.current.add(`${type}-${id}`)
      playSound('standard')

      toast.info(
        <div className="flex flex-col gap-2 w-full p-1">
          <div className={`flex items-center gap-3 ${options.color}`}>
             <div className={`w-10 h-10 rounded-full ${options.color.replace('text-', 'bg-')}/10 flex items-center justify-center`}>
                <options.icon size={22} />
             </div>
             <span className="font-black text-lg uppercase tracking-tight italic">{options.title}</span>
          </div>
          <div className="space-y-1">
             <p className="font-bold text-base text-foreground leading-tight">
               {options.message}
             </p>
             <p className="text-[10px] text-muted-foreground font-black uppercase opacity-60">
               {data.Vehicle_Plate || data.Driver_Name || 'System Alert'} • {new Date().toLocaleTimeString()}
             </p>
          </div>
          <button 
            onClick={() => {
              router.push(options.href)
              toast.dismiss(`${type}-${id}`)
            }}
            className={`mt-2 w-full ${options.color.replace('text-', 'bg-')} text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-widest hover:opacity-90 transition-all shadow-lg active:scale-95`}
          >
            ตรวจสอบข้อมูล
          </button>
        </div>,
        {
          duration: 7000,
          id: `${type}-${id}`,
          position: 'top-right'
        }
      )
    }

    // 1. SOS Listener (Jobs_Main Updates)
    const sosChannel = supabase
      .channel('global-sos-listener')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Jobs_Main', filter: "Job_Status=eq.SOS" }, (payload) => {
        const data = payload.new as any
        if (!data || notifiedIds.current.has(`sos-${data.Job_ID}`)) return
        
        // Branch Check (Enforce for all, including Super Admin)
        if (branchId && branchId !== 'All') {
            if (data.Branch_ID && String(data.Branch_ID) !== String(branchId)) return
        }

        notifiedIds.current.add(`sos-${data.Job_ID}`)
        playSound('emergency')
        
        toast.error(
          <div className="flex flex-col gap-2 w-full p-1">
            <div className="flex items-center gap-3 text-rose-600">
               <ShieldAlert className="animate-bounce" size={28} />
               <span className="font-black text-xl uppercase tracking-tighter italic">SOS EMERGENCY!</span>
            </div>
            <div className="space-y-1">
               <p className="font-bold text-lg text-foreground leading-tight">
                 {data.Driver_Name || 'คนขับ'} แจ้งเหตุฉุกเฉินระดับวิกฤต!
               </p>
               <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-black opacity-70">
                 {data.Vehicle_Plate || 'N/A'} • {data.Job_ID}
               </div>
            </div>
            <button 
              onClick={() => { router.push('/sos'); toast.dismiss(`sos-${data.Job_ID}`) }}
              className="mt-3 bg-rose-600 text-white font-black py-3 rounded-2xl text-sm uppercase tracking-[0.2em] shadow-2xl hover:bg-rose-700 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Phone size={18} /> เข้าช่วยเหลือทันที
            </button>
          </div>,
          { duration: 15000, id: `sos-${data.Job_ID}`, position: 'top-right' }
        )
      })
      .subscribe()

    // 2. Operational Channels (Multi-table INSERT listeners)
    const opChannel = supabase
      .channel('admin-ops-listener')
      // Fuel Reports
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Fuel_Logs' }, (payload) => {
        const data = payload.new as any
        handleOperationalAlert(data.Log_ID, 'fuel', data, {
            title: "แจ้งเติมน้ำมัน",
            message: `พนักงานเติมน้ำมัน ${data.Liters} ลิตร (${data.Price_Total} บ.)`,
            color: 'text-emerald-500',
            icon: Fuel,
            href: '/fuel'
        })
      })
      // Repair Tickets
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Repair_Tickets' }, (payload) => {
        const data = payload.new as any
        handleOperationalAlert(data.Ticket_ID, 'repair', data, {
            title: "แจ้งซ่อมใหม่",
            message: `พบปัญหา: ${data.Issue_Type || 'ไม่ระบุ'} - ${data.Priority} Priority`,
            color: 'text-amber-500',
            icon: Wrench,
            href: '/maintenance'
        })
      })
      // Vehicle Screenings (Checks) - Handle only failures if logic resides here
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Vehicle_Checks' }, (payload) => {
        const data = payload.new as any
        // Check for common failure indicators in data structure
        const passedTotal = typeof data.Passed_Items === 'object' ? Object.values(data.Passed_Items).filter(v => v === true).length : 0
        const totalItems = typeof data.Passed_Items === 'object' ? Object.keys(data.Passed_Items).length : 0
        
        if (passedTotal < totalItems && totalItems > 0) {
            handleOperationalAlert(data.id, 'inspect', data, {
                title: "ตรวจรถไม่ผ่าน",
                message: `รถทะเบียน ${data.Vehicle_Plate} ตรวจสภาพไม่ผ่านบางรายการ`,
                color: 'text-rose-500',
                icon: ClipboardCheck,
                href: '/admin/vehicle-checks'
            })
        }
      })
      // Damage Reports
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Damage_Reports' }, (payload) => {
        const data = payload.new as any
        handleOperationalAlert(data.id, 'damage', data, {
            title: "แจ้งสินค้าเสียหาย",
            message: `แจ้งพบความเสียหาย: ${data.Description || 'รอยืนยัน'}`,
            color: 'text-orange-600',
            icon: PackageX,
            href: '/reports'
        })
      })
      // Leave Requests
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Driver_Leaves' }, (payload) => {
        const data = payload.new as any
        handleOperationalAlert(data.id, 'leave', data, {
            title: "แจ้งลางาน",
            message: `พนักงานขอลางาน: ${data.Leave_Type} (${data.Start_Date} ถึง ${data.End_Date})`,
            color: 'text-violet-500',
            icon: CalendarDays,
            href: '/drivers'
        })
      })
      // Shipment Requests (Booking Table)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Shipment_Requests' }, (payload) => {
        const data = payload.new as any
        handleOperationalAlert(data.id, 'shipment', data, {
            title: "จองงานใหม่",
            message: `ลูกค้าแจ้งจองงานใหม่จาก: ${data.Pickup_Location || 'ไม่ระบุ'}`,
            color: 'text-blue-500',
            icon: Package,
            href: '/jobs'
        })
      })
      // Shipment Requests (Direct Jobs_Main Table) - Covers Enterprise API & Manual Customer Portal
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Jobs_Main', filter: "Job_Status=eq.New" }, (payload) => {
        const data = payload.new as any
        handleOperationalAlert(data.Job_ID, 'shipment', data, {
            title: "จองงานใหม่ (System)",
            message: `จองงานใหม่: ${data.Customer_Name || data.Customer_ID || 'ไม่ระบุ'}`,
            color: 'text-blue-500',
            icon: Package,
            href: '/jobs'
        })
      })
      .subscribe()

    // 3. Chat Listener
    const chatChannel = supabase
      .channel('global-chat-listener')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Chat_Messages' }, async (payload) => {
        const data = payload.new as any
        if (!data || data.receiver_id !== 'admin' || notifiedIds.current.has(`chat-${data.id}`)) return

        // Branch Filter for Chat (Messages don't have Branch_ID, need to check sender/driver)
        if (branchId && branchId !== 'All') {
            try {
                const { data: driver } = await supabase.from('Master_Drivers').select('Branch_ID').eq('Driver_ID', data.sender_id).single()
                if (driver && String(driver.Branch_ID) !== String(branchId)) return
            } catch (err) {
                // If lookup fails, default to showing if we can't confirm branch mismatch
            }
        }

        notifiedIds.current.add(`chat-${data.id}`)
        playSound('standard')
        toast.info(
          <div className="flex flex-col gap-2 w-full p-1">
            <div className="flex items-center gap-3 text-sky-500">
               <div className="w-10 h-10 rounded-full bg-sky-500/10 flex items-center justify-center"><Phone size={20} /></div>
               <span className="font-black text-lg uppercase italic tracking-tighter">ข้อความใหม่</span>
            </div>
            <p className="font-bold text-base text-foreground line-clamp-2 leading-tight">{data.message}</p>
            <p className="text-[10px] text-muted-foreground font-black uppercase opacity-60">จาก: {data.sender_id}</p>
            <button 
              onClick={() => { router.push(`/monitoring?driver=${data.sender_id}&openChat=true`); toast.dismiss(`chat-${data.id}`) }}
              className="mt-2 bg-sky-500 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-widest shadow-md hover:bg-sky-600 transition-all"
            >
              ตอบกลับทันที
            </button>
          </div>,
          { duration: 6000, id: `chat-${data.id}`, position: 'top-right' }
        )
      })
      .subscribe()

    return () => {
      supabase.removeChannel(sosChannel)
      supabase.removeChannel(opChannel)
      supabase.removeChannel(chatChannel)
    }
  }, [router, branchId, isAdmin])

  return null
}
