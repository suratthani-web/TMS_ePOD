import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAdminClient()

  // 1. Fetch all jobs where Origin_Location or Dest_Location is NULL
  const { data: jobs, error: fetchError } = await supabase
    .from('Jobs_Main')
    .select('Job_ID, Route_Name, Origin_Location, Dest_Location, original_origins_json, original_destinations_json')
    .or('Origin_Location.is.null,Dest_Location.is.null')

  if (fetchError) {
    return NextResponse.json({ success: false, error: fetchError.message })
  }

  const updatedJobs = []
  const errors = []

  // 2. Loop through and backfill locations from Route_Name
  for (const job of jobs) {
    if (!job.Route_Name) continue

    const parts = job.Route_Name.split(/\s*[-–—→>]\s*/)
    if (parts.length > 1) {
      const origin = parts[0].trim()
      const dest = parts[parts.length - 1].trim()

      const updateData: Record<string, any> = {}
      
      if (!job.Origin_Location) {
        updateData.Origin_Location = origin
        updateData.original_origins_json = [{ name: origin, lat: null, lng: null }]
      }
      
      if (!job.Dest_Location) {
        updateData.Dest_Location = dest
        updateData.original_destinations_json = [{ name: dest, lat: null, lng: null }]
      }

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('Jobs_Main')
          .update(updateData)
          .eq('Job_ID', job.Job_ID)

        if (updateError) {
          errors.push({ jobId: job.Job_ID, error: updateError.message })
        } else {
          updatedJobs.push({ jobId: job.Job_ID, origin, dest })
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    total_found: jobs.length,
    updated_count: updatedJobs.length,
    updated: updatedJobs,
    errors
  })
}
