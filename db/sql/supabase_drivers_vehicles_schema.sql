-- =============================================
-- DRouteMind TMS: Drivers & Vehicles Schema
-- Run this in Supabase SQL Editor
-- =============================================
-- Drivers Table
CREATE TABLE IF NOT EXISTS Drivers (
    Driver_ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name TEXT NOT NULL,
    Phone TEXT,
    Email TEXT,
    License_Number TEXT,
    Status TEXT DEFAULT 'Active',
    -- Active, Inactive, On Leave
    Created_At TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    Updated_At TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Vehicles Table
CREATE TABLE IF NOT EXISTS Vehicles (
    Vehicle_ID UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Plate_Number TEXT NOT NULL UNIQUE,
    Type TEXT DEFAULT '4-Wheel',
    -- 4-Wheel, 6-Wheel, 10-Wheel, Motorcycle
    Brand TEXT,
    Model TEXT,
    Assigned_Driver_ID UUID REFERENCES Drivers(Driver_ID) ON DELETE
    SET NULL,
        Status TEXT DEFAULT 'Available',
        -- Available, In Use, Maintenance
        Created_At TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        Updated_At TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Enable Row Level Security
ALTER TABLE Drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE Vehicles ENABLE ROW LEVEL SECURITY;
-- RLS Policies (Allow all for authenticated users - adjust as needed)
CREATE POLICY "Allow all access to Drivers" ON Drivers FOR ALL USING (true);
CREATE POLICY "Allow all access to Vehicles" ON Vehicles FOR ALL USING (true);
-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_drivers_status ON Drivers(Status);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON Vehicles(Status);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver ON Vehicles(Assigned_Driver_ID);
-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.Updated_At = NOW();
RETURN NEW;
END;
$$ language 'plpgsql';
CREATE TRIGGER update_drivers_updated_at BEFORE
UPDATE ON Drivers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE
UPDATE ON Vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Sample Data (Optional - uncomment to insert)
/*
 INSERT INTO Drivers (Name, Phone, Status) VALUES
 ('สมชาย ใจดี', '081-234-5678', 'Active'),
 ('สมหญิง รักงาน', '082-345-6789', 'Active'),
 ('เอกชัย เดินทาง', '083-456-7890', 'Active');
 
 INSERT INTO Vehicles (Plate_Number, Type, Status) VALUES
 ('1กก-1234', '4-Wheel', 'Available'),
 ('2ขข-5678', '6-Wheel', 'Available'),
 ('3คค-9012', '4-Wheel', 'In Use');
 */