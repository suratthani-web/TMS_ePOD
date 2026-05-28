"use server";

import { createClient, createAdminClient } from "@/utils/supabase/server";
import { getUserBranchId, getCustomerId } from "@/lib/permissions";

export interface PublicJobDetails {
  jobId: string;
  trackingCode: string;
  status: string;
  customerName: string;
  origin: string;
  destination: string;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  planDate: string;
  pickupDate: string | null;
  deliveryDate: string | null;
  pickupPhotos: string[];
  podPhotos: string[];
  signature: string | null;
  pickupSignature: string | null;
  lastLocation?: {
    lat: number;
    lng: number;
    timestamp: string;
  } | null;
  notes?: string | null;
  customerPhone?: string | null;
  cargoType?: string | null;
  weight?: number | null;
  volume?: number | null;
  vehicleType?: string | null;
  pickupLat?: number | null;
  pickupLon?: number | null;
  dropoffLat?: number | null;
  dropoffLon?: number | null;
  priceCustBase?: number | null;
  priceCustExtra?: number | null;
  priceCustTotal?: number | null;
  costDriverBase?: number | null;
  costDriverExtra?: number | null;
  costDriverTotal?: number | null;
  extraCostsJson?: string | null;
  branchId?: string | null;
  incentiveClaimed?: boolean;
  requiresIncentiveCheck?: boolean;
  sensorVerified?: string;
  sensorMaxElevationDiff?: number;
  sensorTotalStepsUpward?: number;
}

export async function submitJobFeedback(
  jobId: string,
  rating: number,
  comment: string,
) {
  const supabase = await createClient();

  // 1. Update Jobs_Main with simple rating for analytics compatibility
  const { error: jobError } = await supabase
    .from("Jobs_Main")
    .update({ Rating: rating })
    .eq("Job_ID", jobId);

  if (jobError) {
    return { success: false, message: "Failed to update job rating" };
  }

  // 2. Insert detailed feedback into job_feedback table
  const { error: feedbackError } = await supabase.from("job_feedback").insert({
    job_id: jobId,
    rating: rating,
    comment: comment,
  });

  if (feedbackError) {
    return { 
      success: false, 
      message: `Failed to insert detailed feedback: ${feedbackError.message}` 
    };
  }

  return { success: true };
}

export async function getActiveJobs(
  customerMode = false
): Promise<PublicJobDetails[]> {
  const supabase = createAdminClient();
  
  // Use Asia/Bangkok date for Plan_Date comparison
  const now = new Date();
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(now);
  
  // Define active statuses for the Radar
  const activeStatuses = ["Assigned", "Picked Up", "In Transit", "Arrived", "SOS", "En Route", "En-Route", "In Progress", "Pending", "Completed", "Delivered", "New"];

  let dbQuery = supabase
    .from("Jobs_Main")
    .select("*")
    .in("Job_Status", activeStatuses)
    .eq("Plan_Date", today); 

  // Apply Branch Filtering for Admin (Non-Customer Mode)
  if (!customerMode) {
    const branchId = await getUserBranchId();
    if (branchId && branchId !== 'All') {
      dbQuery = dbQuery.eq("Branch_ID", branchId);
    }
  }

  // Apply Customer Filtering
  if (customerMode) {
    const customerId = await getCustomerId();
    if (customerId) {
      dbQuery = dbQuery.eq("Customer_ID", customerId);
    }
  }

  const { data, error } = await dbQuery.order('Created_At', { ascending: false }).limit(100);

  if (error || !data) {
    return [];
  }

  return data.map(job => mapJobToPublicDetails(job));
}

export async function getPublicJobDetails(
  jobId: string,
): Promise<PublicJobDetails | null> {
  const supabase = createAdminClient();

  // Split jobId by comma in case user provides multiple IDs (like SO numbers)
  const tokens = jobId.split(',').map(t => t.trim()).filter(Boolean);
  
  if (tokens.length === 0) return null;

  // Build a comprehensive OR filter for all tokens
  const orConditions = tokens.flatMap(token => [
    `Job_ID.eq."${token}"`,
    `Notes.ilike."%${token}%"`
  ]).join(',');

  const { data: jobs, error } = await supabase
    .from("Jobs_Main")
    .select("*")
    .or(orConditions)
    .order('Created_At', { ascending: false });

  if (error || !jobs || jobs.length === 0) {
    return null;
  }

  const job = jobs[0];

  let lastLocation = null;
  if (job.Driver_ID) {
    const adminSupabase = createAdminClient();
    const { data: gpsData } = await adminSupabase
      .from("gps_logs")
      .select("*")
      .eq("driver_id", job.Driver_ID) 
      .order("timestamp", { ascending: false })
      .limit(1);

    const log = gpsData?.[0];
    if (log) {
      lastLocation = {
        lat: log.latitude || log.Latitude,
        lng: log.longitude || log.Longitude,
        timestamp: log.timestamp || log.Timestamp,
      };
    }
  }

  return {
    ...mapJobToPublicDetails(job),
    lastLocation
  };
}

function mapJobToPublicDetails(job: any): PublicJobDetails {
    return {
        jobId: job.Job_ID,
        trackingCode: job.Job_ID,
        status: job.Job_Status || "Pending",
        customerName: job.Customer_Name || "Unknown",
        origin: job.Location_Origin_Name || job.Origin_Location || "-",
        destination: job.Location_Destination_Name || job.Dest_Location || "-",
        driverName: job.Driver_Name || "-",
        driverPhone: job.Phone || "-",
        vehiclePlate: job.Vehicle_Plate || "N/A",
        planDate: job.Plan_Date || "-",
        pickupDate: job.Actual_Pickup_Time || null,
        deliveryDate: (job.Delivery_Date && job.Actual_Delivery_Time) 
          ? `${job.Delivery_Date}T${job.Actual_Delivery_Time}`
          : (job.Actual_Delivery_Time || null),
        pickupPhotos: job.Pickup_Photo_Url ? job.Pickup_Photo_Url.split(",").filter(Boolean) : [],
        podPhotos: job.Photo_Proof_Url ? job.Photo_Proof_Url.split(",").filter(Boolean) : [],
        signature: job.Signature_Proof_Url || job.Signature_Url || null,
        pickupSignature: job.Signature_Pickup_Url || job.Pickup_Signature_Url || null,
        notes: job.Notes || null,
        customerPhone: job.Phone || job.Customer_Phone || null,
        cargoType: job.Cargo_Type || null,
        weight: job.Weight_Kg || job.Weight || null,
        volume: job.Volume_Cbm || job.Volume || null,
        vehicleType: job.Vehicle_Type || null,
        pickupLat: job.Pickup_Lat,
        pickupLon: job.Pickup_Lon,
        dropoffLat: job.Delivery_Lat || job.Dropoff_Lat,
        dropoffLon: job.Delivery_Lon || job.Dropoff_Lon,
        priceCustBase: job.Price_Cust_Base,
        priceCustExtra: job.Price_Cust_Extra,
        priceCustTotal: job.Price_Cust_Total,
        costDriverBase: job.Cost_Driver_Base,
        costDriverExtra: job.Cost_Driver_Extra,
        costDriverTotal: job.Cost_Driver_Total,
        extraCostsJson: job.extra_costs_json || job.extra_costs,
        branchId: job.Branch_ID,
        incentiveClaimed: job.Incentive_Claimed,
        requiresIncentiveCheck: job.Requires_Incentive_Check,
        sensorVerified: job.Sensor_Verified,
        sensorMaxElevationDiff: job.Sensor_Max_Elevation_Diff,
        sensorTotalStepsUpward: job.Sensor_Total_Steps_Upward,
    };
}
