"use server";

import { createClient, createAdminClient } from "@/utils/supabase/server";

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
  extraCostsJson?: string | null;
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

export async function getPublicJobDetails(
  jobId: string,
): Promise<PublicJobDetails | null> {
  const supabase = createAdminClient();

  // Query Jobs_Main with all relevant columns
  // Query Jobs_Main: Search by Job_ID OR if Ref_No contains the jobId (SO number)
  const { data: job, error } = await supabase
    .from("Jobs_Main")
    .select("*")
    .or(`Job_ID.eq."${jobId}",Notes.ilike."%${jobId}%"`)
    .order('Created_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !job) {
    return null;
  }

  // Process Photos
  const pickupPhotos = job.Pickup_Photo_Url
    ? job.Pickup_Photo_Url.split(",").filter(Boolean)
    : [];
  const podPhotos = job.Photo_Proof_Url
    ? job.Photo_Proof_Url.split(",").filter(Boolean)
    : [];

  // Fetch latest location for the vehicle/driver associated with this job
  // Use admin client to bypass RLS for public tracking page
  let lastLocation = null;
  if (["Assigned", "Picked Up", "In Transit", "Arrived", "SOS", "En Route", "En-Route"].includes(job.Job_Status)) {
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
    jobId: job.Job_ID,
    trackingCode: job.Job_ID,
    status: job.Job_Status || "Pending",
    customerName: job.Customer_Name || "Unknown",
    origin: job.Location_Origin_Name || job.Origin_Location || "-",
    destination: job.Location_Destination_Name || job.Dest_Location || "-",
    driverName: job.Driver_Name || "-",
    driverPhone: "-",
    vehiclePlate: job.Vehicle_Plate || "-",
    planDate: job.Plan_Date || "-",
    pickupDate: job.Actual_Pickup_Time || null,
    deliveryDate: (job.Delivery_Date && job.Actual_Delivery_Time) 
      ? `${job.Delivery_Date}T${job.Actual_Delivery_Time}`
      : (job.Actual_Delivery_Time || null),
    pickupPhotos,
    podPhotos,
    signature: job.Signature_Proof_Url || job.Signature_Url || (job as Record<string, unknown>).signature_url || null,
    pickupSignature:
      job.Signature_Pickup_Url || job.Pickup_Signature_Url || (job as Record<string, unknown>).pickup_signature_url || null,
    lastLocation,
    notes: job.Notes || null,
    customerPhone: job.Phone || job.Customer_Phone || null,
    cargoType: job.Cargo_Type || null,
    weight: job.Weight_Kg || job.Weight || null,
    volume: job.Volume_Cbm || job.Volume || null,
    vehicleType: job.Vehicle_Type || null,
    pickupLat: job.Pickup_Lat,
    pickupLon: job.Pickup_Lon,
    dropoffLat: job.Delivery_Lat || job.Dropoff_Lat, // Use Delivery_Lat for compatibility
    dropoffLon: job.Delivery_Lon || job.Dropoff_Lon,
    priceCustBase: job.Price_Cust_Base,
    priceCustExtra: job.Price_Cust_Extra,
    priceCustTotal: job.Price_Cust_Total,
    extraCostsJson: job.extra_costs_json || job.extra_costs,
  };
}
