"use client"


import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/components/providers/language-provider"
import { Button } from "@/components/ui/button"
import { Image as ImageIcon, ExternalLink } from "lucide-react"
import Image from "next/image"
import type { Job } from "@/types/database"

type PODJob = Job & {
  Delivery_Date?: string | null
  photo_proof_url?: string | null
  signature_url?: string | null
}

type PODDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: PODJob
}

export function PODDialog({ open, onOpenChange, job }: PODDialogProps) {
  const { t } = useLanguage()


  const photos = (job.Photo_Proof_Url || job.photo_proof_url || "").split(',').filter(Boolean)
  const signature = job.Signature_Url || job.signature_url

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" />
            {t('reports.title_pod')} - {job.Job_ID}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Photos Grid */}
          <div>
            <h3 className="text-xl font-medium text-muted-foreground mb-3">{t('reports.pod_info')} ({photos.length})</h3>
            {photos.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {photos.map((url: string, index: number) => (
                  <div 
                    key={index} 
                    className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted cursor-pointer hover:border-primary transition-all"
                    onClick={() => window.open(url, '_blank')}
                  >
                    <Image 
                      src={url} 
                      alt={`POD ${index + 1}`} 
                      fill 
                      className="object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <ExternalLink className="w-6 h-6 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-muted rounded-lg border border-dashed border-border text-muted-foreground">
                {t('reports.no_photos')}
              </div>
            )}
          </div>

          {/* Signature */}
          <div>
             <h3 className="text-xl font-medium text-muted-foreground mb-3">{t('reports.dropoff_signature')}</h3>
             {signature ? (
               <div className="relative h-40 w-full md:w-80 border border-border rounded-lg bg-muted mx-auto md:mx-0">
                  <Image 
                      src={signature} 
                      alt="Signature" 
                      fill 
                      className="object-contain p-4 invert dark:invert-0" 
                  />
               </div>
             ) : (
                <div className="text-center py-8 bg-muted rounded-lg border border-dashed border-border text-muted-foreground w-full md:w-80">
                  {t('reports.no_signature')}
                </div>
             )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg text-xl">
             <div>
                <p className="text-muted-foreground">{t('jobs.dialog.driver')}</p>
                <p className="text-foreground font-medium">{job.Driver_Name || '-'}</p>
             </div>
             <div>
                <p className="text-muted-foreground">{t('jobs.dialog.vehicle')}</p>
                <p className="text-foreground font-medium">{job.Vehicle_Plate || '-'}</p>
             </div>
             <div>
                <p className="text-muted-foreground">{t('reports.delivery_date')}</p>
                <p className="text-foreground font-medium">
                    {job.Delivery_Date ? new Date(job.Delivery_Date).toLocaleString('th-TH') : '-'}
                </p>
             </div>
             <div>
                <p className="text-muted-foreground">{t('common.status')}</p>
                <span className={`inline-block px-2 py-0.5 rounded text-lg font-bold font-medium ${
                    job.Job_Status === 'Completed' || job.Job_Status === 'Delivered' 
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                    {job.Job_Status}
                </span>
             </div>
          </div>
          
          <div className="flex justify-end pt-4 border-t border-border">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {t('reports.close_btn')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
