"use client"

import { 
  Dialog, 
  DialogContent, 
  DialogTitle, 
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { 
  MapPin, 
  User, 
  CheckCircle2, 
  Package,
  FileText,
  Eye,
  ClipboardList,
  ExternalLink,
  FileX
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { Job } from "@/lib/supabase/jobs"
import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { getJobGPSData } from "@/lib/actions/gps-actions"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/components/providers/language-provider"
import { OrderTimeline } from "@/components/ui/order-timeline"
import { DriverLocation } from "@/components/maps/leaflet-map"
import { Route } from "@/lib/supabase/routes"

const LeafletMap = dynamic(() => import('@/components/maps/leaflet-map'), { 
    ssr: false,
    loading: () => <div className="h-[200px] w-full bg-muted animate-pulse rounded-xl" />
})

interface GPSPoint {
  lat: number
  lng: number
  timestamp: string
}

interface JobGPSData {
  route: [number, number][]
  latest: GPSPoint | null
}

type JobSummaryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: Job
  routes?: Route[]
}

export function JobSummaryDialog({ open, onOpenChange, job, routes }: JobSummaryDialogProps) {
  const { t } = useLanguage()
  const [gpsData, setGpsData] = useState<JobGPSData | null>(null)

  const jobId = job?.Job_ID
  const driverName = job?.Driver_Name
  const planDate = job?.Plan_Date

  useEffect(() => {
    async function fetchGps() {
      if (open && jobId) {
        try {
          const data = await getJobGPSData(jobId, job.Driver_ID || '', planDate || '')
          setGpsData(data as JobGPSData)
        } catch {}
      }
    }
    fetchGps()
  }, [open, jobId, job?.Driver_ID, planDate])

  if (!job) return null

  const pickupPhotos = job.Pickup_Photo_Url ? job.Pickup_Photo_Url.split(',').filter(Boolean) : []
  const podPhotos = job.Photo_Proof_Url ? job.Photo_Proof_Url.split(',').filter(Boolean) : []
  
  const gpsPoints = gpsData?.route || []
  const latestLocation = gpsData?.latest
  const mapDrivers: DriverLocation[] = latestLocation ? [{
    id: jobId || 'current',
    name: driverName || 'Driver',
    lat: latestLocation.lat,
    lng: latestLocation.lng,
    status: 'Latest Location',
    lastUpdate: latestLocation.timestamp,
    vehiclePlate: (job.Vehicle_Plate && job.Vehicle_Plate !== 'N/A' ? job.Vehicle_Plate : (latestLocation as { vehicle_plate?: string })?.vehicle_plate || job.Vehicle_Plate) || undefined
  }] : []
  const reportUrl = podPhotos.find((url: string) => url.toUpperCase().includes('REPORT'))

  // Web-Safe and Robust JSON Parsing (similar to JobDialog)
  const parseNodes = (val: unknown): Record<string, unknown>[] => {
    if (!val) return []
    if (Array.isArray(val)) return val as Record<string, unknown>[]
    if (typeof val === 'object' && val !== null) return [val as Record<string, unknown>]
    if (typeof val === 'string' && val.trim() !== '') {
        try { 
          const parsed = JSON.parse(val)
          return Array.isArray(parsed) ? parsed : [parsed]
        } catch { return [] }
    }
    return []
  }

  const originsList = parseNodes((job as Record<string, unknown>).origins || (job as Record<string, unknown>).original_origins_json)
  const destsList = parseNodes((job as Record<string, unknown>).destinations || (job as Record<string, unknown>).original_destinations_json)
  
  // Tactical Fallback: Parse from Route_Name (e.g. "A -> B")
  const routeParts = job.Route_Name?.includes('->') 
    ? job.Route_Name.split('->').map((s: string) => s.trim())
    : job.Route_Name?.includes('-')
      ? job.Route_Name.split('-').map((s: string) => s.trim())
      : []

  const routeOrigin = routeParts.length > 0 ? routeParts[0] : null
  const routeDest = routeParts.length > 1 ? routeParts[1] : null

  // Master Route Lookup (Tactical fallback suggested by user)
  const masterRoute = routes?.find(r => r.Route_Name === job.Route_Name)

  // Ultimate Fallback Chain for Origin
  const displayOrigin = (job as Record<string, unknown>).Origin_Location as string || 
                        (originsList.length > 0 ? (originsList[0] as Record<string, unknown>).name as string : null) || 
                        masterRoute?.Origin ||
                        routeOrigin ||
                        (job as Record<string, unknown>).Pickup_Location as string || 
                        (job as Record<string, unknown>).Pickup_Address as string ||
                        '-'

  // Ultimate Fallback Chain for Destination
  const displayDest = (job as Record<string, unknown>).Dest_Location as string || 
                      (destsList.length > 0 ? (destsList[destsList.length - 1] as Record<string, unknown>).name as string : null) || 
                      masterRoute?.Destination ||
                      routeDest ||
                      (job as Record<string, unknown>).Delivery_Location as string || 
                      (job as Record<string, unknown>).Delivery_Address as string ||
                      '-'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 border-border bg-card print:max-h-none print:overflow-visible">
        <DialogTitle className="sr-only">Job Summary - {job.Job_ID}</DialogTitle>
        <DialogDescription className="sr-only">
          Detailed summary for job {job.Job_ID} including timeline, photos, and signatures.
        </DialogDescription>

        <div className="printable-content">
          {/* Print only Header (Simple Text) */}
          <div className="hidden print:block mb-8 border-b-2 border-black pb-4">
             <h1 className="text-2xl font-bold">{t('reports.title_summary')}</h1>
             <p className="text-xl">Job ID: {job.Job_ID} | {t('common.date')}: {job.Plan_Date}</p>
             <p className="text-xl">{t('common.status')}: {job.Job_Status}</p>
          </div>

          {/* Web Header (No Print) */}
          <div className="sticky top-0 z-10 bg-card p-6 border-b border-border flex justify-between items-start no-print">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                  <ClipboardList className="text-emerald-600" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                    {t('reports.title_summary')}
                    <span className="h-1 w-1 rounded-full bg-primary/50"></span>
                  </h2>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-black text-foreground tracking-tight">
                      {job.Job_ID}
                    </h1>
                    <span className={cn(
                      "px-3 py-1 rounded-full text-base font-bold font-black uppercase tracking-wider border",
                      job.Job_Status === 'Completed' 
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" 
                        : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                    )}>
                      {job.Job_Status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-muted-foreground font-medium">{new Date().toLocaleDateString('th-TH')}</p>
            </div>
          </div>

          {/* Content Wrapper */}
          <div className="p-6 space-y-8">
            {/* Timeline + Info Grid — side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Vertical Order Timeline (Dribbble-inspired) */}
              <div className="lg:col-span-1 bg-muted rounded-2xl border border-border p-5 no-print shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-foreground">
                  <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                  <h3 className="font-black text-xl uppercase tracking-wider">Order Timeline</h3>
                </div>
                <OrderTimeline 
                  currentStatus={job.Job_Status || ''} 
                  planDate={job.Plan_Date || undefined}
                  createdAt={(job as Record<string, unknown>).created_at as string | undefined}
                />
              </div>

              {/* Right: Basic Info Grid */}
              <div className="lg:col-span-2">

                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-foreground font-black border-l-4 border-indigo-500 pl-3 uppercase tracking-wider text-xl">
                        <User size={18} className="text-emerald-500" />
                        <span>{t('reports.general_info')}</span>
                    </div>
                    <div className="bg-muted rounded-xl p-4 border border-border grid grid-cols-2 gap-y-4 shadow-sm">
                        <div>
                            <p className="text-base font-black uppercase text-slate-500 mb-1">{t('jobs.dialog.customer')}</p>
                            <p className="text-xl font-black text-slate-900">{job.Customer_Name || '-'}</p>
                        </div>
                        <div>
                            <p className="text-base font-black uppercase text-slate-500 mb-1">{t('jobs.dialog.route')}</p>
                            <p className="text-xl font-black text-slate-900">{job.Route_Name || '-'}</p>
                        </div>
                        <div>
                            <p className="text-base font-black uppercase text-slate-500 mb-1">{t('jobs.dialog.vehicle')}</p>
                            <p className="text-xl font-black text-slate-900">{job.Vehicle_Plate || '-'}</p>
                        </div>
                        <div>
                            <p className="text-base font-black uppercase text-slate-500 mb-1">{t('jobs.dialog.driver')}</p>
                            <p className="text-xl font-black text-slate-900">{job.Driver_Name || job.Driver_ID || '-'}</p>
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <div className="flex items-center gap-2 text-foreground font-black border-l-4 border-emerald-500 pl-3 uppercase tracking-wider text-xl">
                        <MapPin size={18} className="text-emerald-500" />
                        <span>{t('reports.location_time')}</span>
                    </div>
                    <div className="bg-muted rounded-xl p-4 border border-border space-y-4 shadow-sm">
                        <div className="flex gap-3">
                            <div className="mt-1"><div className="w-2 h-2 rounded-full bg-indigo-500 ring-4 ring-indigo-500/20" /></div>
                            <div>
                                <p className="text-base font-bold uppercase text-muted-foreground font-bold">{t('jobs.dialog.origin')}</p>
                                <p className="text-lg font-bold text-muted-foreground font-medium">{displayOrigin}</p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <div className="mt-1"><MapPin size={14} className="text-emerald-500" /></div>
                            <div>
                                <p className="text-base font-bold uppercase text-muted-foreground font-bold">{t('jobs.dialog.destination')}</p>
                                <p className="text-lg font-bold text-muted-foreground font-bold">{displayDest}</p>
                            </div>
                        </div>
                    </div>
                </section>
              </div>
            </div>{/* end Grid */}

            {/* GPS Map Section */}
            <section className="space-y-4 no-print">
              <h3 className="text-xl font-black text-foreground flex items-center gap-2 uppercase tracking-wider">
                <MapPin size={16} className="text-emerald-500" />
                {t('reports.latest_location')}
              </h3>
              <div className="h-[250px] rounded-2xl overflow-hidden border border-border bg-muted shadow-inner relative">
                {((job as Record<string, unknown>).Tracking_LAT && (job as Record<string, unknown>).Tracking_LNG) || gpsPoints.length > 0 || latestLocation || masterRoute?.Origin_Lat ? (
                  <LeafletMap 
                    routeHistory={gpsPoints as [number, number][]}
                    drivers={mapDrivers.length > 0 ? mapDrivers : (masterRoute?.Origin_Lat ? [{
                        id: 'static',
                        name: 'Route Path',
                        lat: masterRoute.Origin_Lat,
                        lng: masterRoute.Origin_Lon || 0,
                        status: 'Planned Route Start'
                    }] : [])}
                    center={latestLocation ? [latestLocation.lat, latestLocation.lng] : (masterRoute?.Origin_Lat ? [masterRoute.Origin_Lat, masterRoute.Origin_Lon || 0] : undefined)}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-card">
                    <MapPin size={32} className="mb-2 opacity-20" />
                    <p className="text-lg font-bold font-medium">{t('reports.no_gps')}</p>
                  </div>
                )}
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Pickup Info */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-foreground flex items-center gap-2 border-l-4 border-indigo-500 pl-3 uppercase tracking-wider">
                    <Package size={16} className="text-emerald-500" />
                    {t('reports.pickup_info')}
                  </h3>
                  <span className="text-base font-bold text-muted-foreground font-bold uppercase no-print">{t('reports.photo_count', { count: pickupPhotos.length })}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  {pickupPhotos.map((url: string, i: number) => (
                    <div key={i} className="relative aspect-[4/3] rounded-xl overflow-hidden border border-border bg-muted group cursor-pointer" onClick={() => window.open(url, '_blank')}>
                      <Image 
                        src={url} 
                        alt={`Pickup proof ${i}`} 
                        fill 
                        className="object-cover transition-transform duration-500 hover:scale-110"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ExternalLink size={20} className="text-white" />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-border bg-muted p-4 shadow-sm">
                  <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest mb-3">{t('reports.pickup_signature')}</p>
                  <div className="h-24 flex items-center justify-center border border-dashed border-border rounded-lg relative overflow-hidden bg-muted">
                    {(job as Record<string, unknown>).Signature_Pickup_Url || (job as Record<string, unknown>).Pickup_Signature_Url ? (
                      <Image 
                        src={((job as Record<string, unknown>).Signature_Pickup_Url as string) || ((job as Record<string, unknown>).Pickup_Signature_Url as string) || ''} 
                        alt="Pickup Signature" 
                        fill 
                        className="object-contain p-2"
                      />
                    ) : (
                      <span className="text-muted-foreground text-lg font-bold italic">{t('reports.no_signature')}</span>
                    )}
                  </div>
                </div>
              </section>

              {/* POD Info */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black text-foreground flex items-center gap-2 border-l-4 border-emerald-500 pl-3 uppercase tracking-wider">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    {t('reports.pod_info')}
                  </h3>
                  <span className="text-base font-bold text-muted-foreground font-bold uppercase no-print">{t('reports.photo_count', { count: podPhotos.length })}</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {podPhotos.map((url: string, i: number) => {
                    const isReport = url.toUpperCase().includes('REPORT');
                    return (
                      <div key={i} className={cn(
                        "relative aspect-[4/3] rounded-xl overflow-hidden border border-border bg-muted group cursor-pointer",
                        isReport && "col-span-2 aspect-video ring-2 ring-indigo-500/30"
                      )} onClick={() => window.open(url, '_blank')}>
                        <Image 
                          src={url} 
                          alt={`POD proof ${i}`} 
                          fill 
                          className="object-cover transition-transform duration-500 hover:scale-110"
                        />
                        {isReport && (
                          <div className="absolute top-3 left-3 bg-indigo-500 text-white font-bold font-black px-2 py-0.5 rounded shadow-lg uppercase tracking-wider flex items-center gap-1">
                            <FileText size={10} />
                            {t('reports.digital_report')}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ExternalLink size={20} className="text-white" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-border bg-muted p-4 shadow-sm">
                   <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest mb-3">{t('reports.dropoff_signature')}</p>
                  <div className="h-24 flex items-center justify-center border border-dashed border-border rounded-lg relative overflow-hidden bg-muted">
                    {(job as Record<string, unknown>).Signature_Proof_Url || (job as Record<string, unknown>).Signature_Url ? (
                      <Image 
                        src={((job as Record<string, unknown>).Signature_Proof_Url as string) || ((job as Record<string, unknown>).Signature_Url as string) || ''} 
                        alt="POD Signature" 
                        fill 
                        className="object-contain p-2"
                      />
                    ) : (
                      <span className="text-muted-foreground text-lg font-bold italic">{t('reports.no_signature')}</span>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="sticky bottom-0 bg-card p-4 border-t border-border flex justify-between items-center gap-3 no-print">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            {t('reports.close_btn')}
          </Button>
          <div className="flex gap-2">
            {/* Action buttons removed as per user request */}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

