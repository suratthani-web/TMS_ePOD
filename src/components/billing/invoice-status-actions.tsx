'use client'

import { useState } from "react"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { CheckCircle2, Loader2 } from "lucide-react"
import { confirmInvoicePayment } from "@/lib/supabase/invoices"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface InvoiceStatusActionsProps {
  id: string
  type: 'Invoice' | 'BillingNote'
  label: string
}

export function InvoiceStatusActions({ id, type, label }: InvoiceStatusActionsProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const result = await confirmInvoicePayment(id, type)
      if (result.success) {
        toast.success(`Success: Receipt confirmed for ${id}`)
        router.refresh()
      } else {
        toast.error("Failed to confirm receipt")
      }
    } catch {
      toast.error("An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <DropdownMenuItem 
      className="focus:bg-emerald-500/20 focus:text-emerald-500 cursor-pointer rounded-xl px-4 py-3 gap-3 transition-colors"
      onClick={(e) => {
        e.preventDefault()
        handleConfirm()
      }}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      <span className="text-sm font-medium">{label}</span>
    </DropdownMenuItem>
  )
}
