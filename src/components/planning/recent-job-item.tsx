"use client"

import { useState } from "react"
import { Package, Truck } from "lucide-react"
import { JobDialog } from "./job-dialog"
import { RequestPreviewDialog } from "./request-preview-dialog"
import { cn } from "@/lib/utils"
import { Job } from "@/lib/supabase/jobs"
import { Route } from "@/lib/supabase/routes"
import { Driver } from "@/lib/supabase/drivers"
import { Vehicle } from "@/lib/supabase/vehicles"
import { Customer } from "@/lib/supabase/customers"
import { Subcontractor } from "@/types/subcontractor"
import { useLanguage } from "@/components/providers/language-provider"
import { LineShareButton } from "@/components/admin/line-share-button"

type Props = {
  job: Job
  drivers: Driver[]
  vehicles: Vehicle[]
  customers: Customer[]
  routes: Route[]
  subcontractors: Subcontractor[]
  canViewIncome?: boolean
  canViewExpense?: boolean
  canAssign?: boolean
  canDelete?: boolean
}

export function RecentJobItem({ job, drivers, vehicles, customers, routes, subcontractors, canViewIncome = true, canViewExpense = true, canAssign = true, canDelete = true }: Props) {
  const [open, setOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const { t } = useLanguage()

  const handleOpen = () => {
    if (job.Job_Status === 'Requested') {
        setPreviewOpen(true)
    } else {
        setOpen(true)
    }
  }

  const handleTransitionToPlan = () => {
    setPreviewOpen(false)
    setTimeout(() => setOpen(true), 100) 
  }

  // Display a shortened version of the UUID for better UI
  const displayId = job.Job_ID.length > 15 
    ? `${job.Job_ID.substring(0, 8)}...` 
    : job.Job_ID;

  // Localize Status
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'Requested': return t('jobs.status_requested');
      case 'Pending': return t('jobs.status_pending');
      case 'In Transit': return t('jobs.status_in_transit');
      case 'Picked Up': return t('jobs.status_picked_up');
      case 'Delivered': return t('jobs.status_delivered');
      case 'Complete': return t('jobs.status_completed');
      case 'Cancelled': return t('jobs.status_cancelled');
      default: return status;
    }
  }

  return (
    <>
      <div 
        onClick={handleOpen}
        className="p-5 transition-all cursor-pointer group relative overflow-hidden border border-border rounded-2xl bg-card hover:bg-muted/30 hover:border-primary/30 hover:scale-[1.01] active:scale-[0.99] shadow-sm flex flex-col gap-4"
      >
        {/* Hover Highlight Accent */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Top Header: ID & Status */}
        <div className="flex items-center justify-between gap-3 relative z-10">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 group-hover:bg-primary/20 transition-colors">
                    <Package size={14} className="text-primary" />
                </div>
                <p className="text-primary font-semibold text-sm truncate max-w-[160px]">
                    {displayId}
                </p>
            </div>
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <LineShareButton job={job} variant="icon" />
                <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold transition-all border shadow-sm",
                    (job.Job_Status === 'Complete' || job.Job_Status === 'Delivered') 
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                )}>
                  {getStatusLabel(job.Job_Status)}
                </span>
            </div>
        </div>

        {/* Middle: Route & Vehicle */}
        <div className="grid grid-cols-2 gap-4 relative z-10 border-y border-border py-3 my-1">
            <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{t('jobs.label_route_node')}</p>
                <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">
                        {job.Route_Name || t('common.no_data')}
                    </p>
                </div>
            </div>
            <div className="space-y-1 text-right">
                <p className="text-xs font-medium text-muted-foreground">{t('jobs.label_assigned_unit')}</p>
                <div className="flex items-center justify-end gap-2">
                    <Truck size={12} className="text-muted-foreground" />
                    <p className="text-sm font-semibold text-foreground">
                        {job.Vehicle_Plate || t('common.no_data')}
                    </p>
                </div>
            </div>
        </div>

        {/* Bottom: Customer & Date */}
        <div className="flex items-center justify-between gap-3 relative z-10">
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t('jobs.dialog.customer')}</p>
                <p className="text-sm font-bold text-foreground truncate">
                    {job.Customer_Name || t('jobs.unassigned_client')}
                </p>
            </div>
            <div className="text-right shrink-0">
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t('common.date')}</p>
                <p className="text-xs font-semibold text-primary/80">
                    {job.Plan_Date ? new Date(job.Plan_Date).toLocaleDateString('th-TH') : t('common.no_data')}
                </p>
            </div>
        </div>
      </div>

      <RequestPreviewDialog 
        job={job}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onPlan={handleTransitionToPlan}
      />

      {open && (
        <JobDialog
          mode="edit"
          open={open}
          onOpenChange={setOpen}
          job={job}
          drivers={drivers}
          vehicles={vehicles}
          customers={customers}
          routes={routes}
          subcontractors={subcontractors}
          canViewIncome={canViewIncome}
          canViewExpense={canViewExpense}
          canAssign={canAssign}
          canDelete={canDelete}
        />
      )}
    </>
  )
}
