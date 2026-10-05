-- =============================================
-- DRouteMind TMS: Customers Schema
-- Run this in Supabase SQL Editor
-- =============================================
CREATE TABLE IF NOT EXISTS Master_Customers (
    Customer_ID TEXT PRIMARY KEY,
    Customer_Name TEXT NOT NULL,
    Contact_Person TEXT,
    Phone TEXT,
    Email TEXT,
    Address TEXT,
    Tax_ID TEXT,
    Lat TEXT,
    Lon TEXT,
    GoogleMap_Link TEXT,
    Billing_Address TEXT,
    Billing_cycle INT,
    Is_Active BOOLEAN DEFAULT TRUE,
    Created_At TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    Updated_At TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Enable Row Level Security
ALTER TABLE Master_Customers ENABLE ROW LEVEL SECURITY;
-- RLS Policies (Allow all for authenticated users)
CREATE POLICY "Allow all access to Master_Customers" ON Master_Customers FOR ALL USING (true);
-- Update timestamp trigger
CREATE TRIGGER update_customers_updated_at BEFORE
UPDATE ON Master_Customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();