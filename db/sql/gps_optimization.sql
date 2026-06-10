-- ==========================================
-- GPS PERFORMANCE OPTIMIZATION
-- ==========================================

-- 1. Create a dedicated table for current driver positions
CREATE TABLE IF NOT EXISTS public.driver_latest_locations (
    Driver_ID TEXT PRIMARY KEY REFERENCES public."Master_Drivers"("Driver_ID") ON DELETE CASCADE,
    Vehicle_Plate TEXT,
    Latitude FLOAT8 NOT NULL,
    Longitude FLOAT8 NOT NULL,
    Speed FLOAT8,
    Timestamp TIMESTAMPTZ DEFAULT now(),
    Job_ID TEXT,
    Updated_At TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.driver_latest_locations ENABLE ROW LEVEL SECURITY;

-- 3. Policies
CREATE POLICY "Anyone can view latest locations" 
ON public.driver_latest_locations FOR SELECT 
TO authenticated USING (true);

-- 4. Function to update latest location
CREATE OR REPLACE FUNCTION update_driver_latest_location()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.driver_latest_locations (
        Driver_ID, 
        Vehicle_Plate, 
        Latitude, 
        Longitude, 
        Speed, 
        Timestamp, 
        Job_ID,
        Updated_At
    )
    VALUES (
        NEW.driver_id, 
        NEW.vehicle_plate, 
        NEW.latitude, 
        NEW.longitude, 
        NEW.speed, 
        NEW.timestamp, 
        NEW.job_id,
        now()
    )
    ON CONFLICT (Driver_ID) DO UPDATE SET
        Vehicle_Plate = EXCLUDED.Vehicle_Plate,
        Latitude = EXCLUDED.Latitude,
        Longitude = EXCLUDED.Longitude,
        Speed = EXCLUDED.Speed,
        Timestamp = EXCLUDED.Timestamp,
        Job_ID = EXCLUDED.Job_ID,
        Updated_At = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger on gps_logs
DROP TRIGGER IF EXISTS trg_update_latest_location ON public.gps_logs;
CREATE TRIGGER trg_update_latest_location
AFTER INSERT ON public.gps_logs
FOR EACH ROW EXECUTE FUNCTION update_driver_latest_location();

-- 6. Initial Population (from recent history)
INSERT INTO public.driver_latest_locations (Driver_ID, Vehicle_Plate, Latitude, Longitude, Speed, Timestamp, Job_ID)
SELECT DISTINCT ON (driver_id) 
    driver_id, vehicle_plate, latitude, longitude, speed, timestamp, job_id
FROM public.gps_logs
ORDER BY driver_id, timestamp DESC
ON CONFLICT (Driver_ID) DO NOTHING;
