export const dynamic = 'force-dynamic'

import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { getJobsByStatus } from '@/lib/supabase/jobs'
import { getActiveFleetStatus } from '@/lib/supabase/gps'
import { getChatContacts } from '@/lib/supabase/chat'
import { getFleetHealthAlerts } from '@/lib/supabase/fleet-health'
import { getProfitHeatmapData } from '@/lib/supabase/financial-analytics'
import { getDangerZones } from '@/lib/supabase/danger-zones'
import { MonitoringCommandCenter } from '@/components/monitoring/monitoring-command-center'
import type { DriverWithGPS } from '@/components/monitoring/monitoring-command-center'
import { getCustomerId, isCustomer } from '@/lib/permissions'


export default async function MonitoringPage() {
  const [customerMode, customerId] = await Promise.all([
      isCustomer(),
      getCustomerId()
  ])

  const [pendingJobs, assignedJobs, confirmedJobs, acceptedJobs, pickedUpJobs, inProgressJobs, inTransitJobs, arrivedJobs, sosJobs, failedJobs, activeDrivers, chatContacts, healthAlerts, heatmapJobs, zones] = await Promise.all([
    getJobsByStatus('Pending'),
    getJobsByStatus('Assigned'),
    getJobsByStatus('Confirmed'),
    getJobsByStatus('Accepted'),
    getJobsByStatus('Picked Up'),
    getJobsByStatus('In Progress'),
    getJobsByStatus('In Transit'),
    getJobsByStatus('Arrived'),
    getJobsByStatus('SOS'),
    getJobsByStatus('Failed'),
    getActiveFleetStatus(undefined, customerId),
    getChatContacts(),
    getFleetHealthAlerts(),
    getProfitHeatmapData(),
    getDangerZones()
  ])

  // Active zones only, shaped for the map (Coordinates are [lat, lng] polygons).
  const dangerZones = (zones || [])
    .filter((z: { Is_Active?: boolean }) => z.Is_Active)
    .map((z: { Zone_ID?: string; Zone_Name: string; Coordinates: [number, number][] }) => ({
      id: z.Zone_ID,
      name: z.Zone_Name,
      coordinates: z.Coordinates,
    }))

  const activeJobs = [...pendingJobs, ...assignedJobs, ...confirmedJobs, ...acceptedJobs, ...pickedUpJobs, ...inProgressJobs, ...inTransitJobs, ...arrivedJobs, ...sosJobs, ...failedJobs].sort((a, b) => 
    new Date(b.Plan_Date || '').getTime() - new Date(a.Plan_Date || '').getTime()
  )
  const driversWithIds = activeDrivers.filter((driver): driver is typeof driver & { Driver_ID: string } => Boolean(driver.Driver_ID))
  const mapHeatmapJobs = heatmapJobs.map((job, index) => ({
    ...job,
    Job_ID: ('Job_ID' in job && job.Job_ID) ? String(job.Job_ID) : `heatmap-${index}`,
  }))

  return (
    <DashboardLayout>
        <MonitoringCommandCenter 
            initialJobs={activeJobs} 
            initialDrivers={driversWithIds as DriverWithGPS[]} 
            initialContacts={chatContacts}
            allDrivers={driversWithIds}
            initialHealthAlerts={healthAlerts}
            heatmapJobs={mapHeatmapJobs}
            dangerZones={dangerZones}
        />
    </DashboardLayout>
  )
}
