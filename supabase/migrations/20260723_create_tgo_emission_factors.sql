-- Database Migration: Create TGO Emission Factors Table
-- Used for dynamic Carbon & ESG Calculation in TMS_ePOD

CREATE TABLE IF NOT EXISTS tgo_emission_factors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fuel_code VARCHAR(50) NOT NULL,            -- e.g., 'Diesel_B7', 'Gasoline_E10', 'EV'
    fuel_name VARCHAR(100) NOT NULL,           -- e.g., 'น้ำมันดีเซล B7', 'น้ำมันเบนซิน E10'
    ef_value NUMERIC(10, 4) NOT NULL,          -- Emission factor value (kgCO2e/L or kgCO2e/kWh)
    unit VARCHAR(20) DEFAULT 'kgCO2e/L',
    effective_date DATE NOT NULL,              -- วันที่เริ่มบังคับใช้ตามประกาศ อบก.
    notes TEXT,                                -- หมายเหตุ/เลขที่ประกาศ อบก.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by fuel code and effective date
CREATE INDEX IF NOT EXISTS idx_tgo_ef_lookup ON tgo_emission_factors (fuel_code, effective_date DESC);

-- Seed Initial TGO 2024 Emission Factors
INSERT INTO tgo_emission_factors (fuel_code, fuel_name, ef_value, unit, effective_date, notes)
VALUES 
    ('Diesel_B7', 'น้ำมันดีเซล B7', 2.6335, 'kgCO2e/L', '2024-01-01', 'คู่มือแนวทางการคำนวณ อบก. ปี 2024'),
    ('Gasoline_E10', 'น้ำมันเบนซิน E10 (แก๊สโซฮอล์ 95/91)', 2.1815, 'kgCO2e/L', '2024-01-01', 'คู่มือแนวทางการคำนวณ อบก. ปี 2024')
ON CONFLICT DO NOTHING;
