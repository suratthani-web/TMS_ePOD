"use client"

import { useState } from "react"
import { MoreVertical, Pencil, Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import { deleteRepairTicket, updateRepairTicket } from "@/app/maintenance/actions"
import { toast } from "sonner"
import { MaintenanceDialog } from "./maintenance-dialog"
import { RepairTicket } from "@/lib/supabase/maintenance"

interface MaintenanceActionsProps {
  ticket: RepairTicket
  drivers: { Driver_ID: string; Driver_Name: string | null }[]
  vehicles: { Vehicle_Plate: string; Vehicle_Type: string | null }[]
}

export function MaintenanceActions({ ticket, drivers, vehicles }: MaintenanceActionsProps) {
  const [loading, setLoading] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)

  const handleDelete = async () => {
    if (!confirm("คุณแน่ใจหรือไม่ที่จะลบใบแจ้งซ่อมนี้?")) return

    setLoading(true)
    try {
      const result = await deleteRepairTicket(ticket.Ticket_ID)
      if (!result.success) {
        toast.error(result.message)
      }
    } catch {
      toast.error("เกิดข้อผิดพลาดในการลบ")
    } finally {
      setLoading(false)
    }
  }

  const handleStatusUpdate = async (status: string) => {
    setLoading(true)
    try {
      const result = await updateRepairTicket(ticket.Ticket_ID, { ...ticket, Status: status } as any)
      if (result.success) {
        toast.success(`อัปเดตสถานะเป็น ${status} เรียบร้อยแล้ว`)
      } else {
        toast.error(result.message)
      }
    } catch {
      toast.error("เกิดข้อผิดพลาดในการอัปเดตสถานะ")
    } finally {
      setLoading(false)
    }
  }

  const isPending = ticket.Status === 'Pending' || ticket.Status === 'รอดำเนินการ'
  const isInProgress = ticket.Status === 'In Progress' || ticket.Status === 'กำลังซ่อม'

  // Inline Quick Actions for Pending/In Progress Tickets
  if (isPending || isInProgress) {
    return (
        <div className="flex gap-2">
            {isPending ? (
              <>
                <Button 
                    disabled={loading}
                    onClick={() => handleStatusUpdate('In Progress')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest h-10 px-4 rounded-xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
                >
                    {loading ? <Loader2 className="animate-spin h-3 w-3" /> : 'อนุมัติ'}
                </Button>
                <Button 
                    disabled={loading}
                    variant="outline"
                    onClick={() => handleStatusUpdate('Rejected')}
                    className="border-2 border-red-200 text-red-600 hover:bg-red-50 font-black text-xs uppercase tracking-widest h-10 px-4 rounded-xl active:scale-95 transition-all"
                >
                    {loading ? <Loader2 className="animate-spin h-3 w-3" /> : 'ปฏิเสธ'}
                </Button>
              </>
            ) : (
              <Button 
                  disabled={loading}
                  onClick={() => handleStatusUpdate('Completed')}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs uppercase tracking-widest h-10 px-4 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
              >
                  {loading ? <Loader2 className="animate-spin h-3 w-3" /> : (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} />
                      ซ่อมเสร็จแล้ว
                    </div>
                  )}
              </Button>
            )}
            
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-10 w-10 p-0 text-muted-foreground hover:bg-muted rounded-xl">
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white border-gray-200 text-gray-800">
                    <DropdownMenuItem onClick={() => setShowEditDialog(true)} className="cursor-pointer">
                        <Pencil className="mr-2 h-4 w-4" /> แก้ไข
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDelete} className="text-red-500 cursor-pointer">
                        <Trash2 className="mr-2 h-4 w-4" /> ลบ
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <MaintenanceDialog 
                open={showEditDialog} 
                onOpenChange={setShowEditDialog}
                drivers={drivers as any}
                vehicles={vehicles as any}
                initialData={ticket as any}
            />
        </div>
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-white">
            <span className="sr-only">Open menu</span>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-white border-gray-200 text-gray-800">
          <DropdownMenuLabel>การจัดการ</DropdownMenuLabel>
          <DropdownMenuItem 
            className="cursor-pointer hover:bg-gray-100"
            onClick={() => setShowEditDialog(true)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            แก้ไขข้อมูล
          </DropdownMenuItem>
          
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="hover:bg-gray-100 cursor-pointer">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              อัปเดตสถานะ
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="bg-white border-gray-200 text-gray-800">
              <DropdownMenuItem onClick={() => handleStatusUpdate('Pending')} className="cursor-pointer hover:bg-gray-100">
                รอดำเนินการ
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusUpdate('In Progress')} className="cursor-pointer hover:bg-gray-100 text-emerald-500">
                อนุมัติ / กำลังซ่อม
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusUpdate('Rejected')} className="cursor-pointer hover:bg-gray-100 text-red-400">
                ไม่อนุมัติ / ปฏิเสธ
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusUpdate('Completed')} className="cursor-pointer hover:bg-gray-100 text-emerald-400">
                เสร็จสิ้น
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator className="bg-gray-100" />
          
          <DropdownMenuItem 
            onClick={handleDelete}
            className="text-red-400 focus:text-red-400 cursor-pointer hover:bg-red-50"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            ลบรายการ
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MaintenanceDialog 
        open={showEditDialog} 
        onOpenChange={setShowEditDialog}
        drivers={drivers as any}
        vehicles={vehicles as any}
        initialData={ticket as any}
      />
    </>
  )
}

