export interface Job {
    Job_ID: string;
    Job_Status?: string | null;
    job_type?: 'normal' | 'container' | null;
    chassis_plate?: string | null;
    Plan_Date?: string | null;
    Route_Name?: string | null;
    Price_Cust_Total?: string | number | null;
    Cost_Driver_Total?: string | number | null;
    extra_costs_json?: unknown;
    Customer_ID?: string | null;
    Customer_Name?: string | null;
    Dest_Location?: string | null;
    Origin_Location?: string | null;
    Driver_Name?: string | null;
    Vehicle_Plate?: string | null;
    Billing_Note_ID?: string | null;
    Driver_Payment_ID?: string | null;
    Branch_ID?: string | null;
    Photo_Proof_Url?: string | null;
    Floor_Climb_Url?: string | null;
    Signature_Url?: string | null;
    Pickup_Photo_Url?: string | null;
    Pickup_Signature_Url?: string | null;
    Cargo_Type?: string | null;
    Notes?: string | null;
    Weight_Kg?: number | null;
    Volume_Cbm?: number | null;
    Loaded_Qty?: number | null;
    Price_Per_Unit?: number | null;
    Price_Cust_Extra?: number | null;
    Charge_Labor?: number | null;
    Charge_Wait?: number | null;
    Price_Cust_Other?: number | null;
}

export interface JobContainer {
    container_id: string;
    job_id: string;
    container_no?: string | null;
    seal_no?: string | null;
    container_size?: string | null;
    shipping_line?: string | null;
    vessel_voyage?: string | null;
    lfd_demurrage?: string | null;
    lfd_detention?: string | null;
    target_temperature?: number | null;
    eir_gate_in_url?: string | null;
    eir_gate_out_url?: string | null;
    container_condition_json?: unknown;
    created_at?: string;
    updated_at?: string;
}

export interface ContainerTempLog {
    log_id: string;
    job_id: string;
    temperature: number;
    recorded_at: string;
    recorded_by?: string | null;
    remark?: string | null;
}

export interface ContainerYardLog {
    log_id: string;
    job_id?: string | null;
    container_no?: string | null;
    chassis_plate?: string | null;
    location_name?: string | null;
    action_type: 'DROP' | 'PICKUP';
    action_time?: string;
    driver_id?: string | null;
    notes?: string | null;
}

export interface Vehicle {
    vehicle_plate: string;
    vehicle_type?: string | null;
    brand?: string | null;
    model?: string | null;
    is_chassis?: boolean;
    current_head_plate?: string | null;
    active_status?: string | null;
    branch_id?: string | null;
    driver_id?: string | null;
}

export interface Billing_Note {
    Billing_Note_ID: string;
    Customer_Name?: string | null;
    Billing_Date?: string | null;
    Due_Date?: string | null;
    Total_Amount?: number | null;
    Customer_Address?: string | null;
    Customer_Tax_ID?: string | null;
    Credit_Days?: number | null;
    Remarks?: string | null;
    VAT_Rate?: number | null;
    VAT_Amount?: number | null;
    Discount_Amount?: number | null;
}

export interface Driver_Payment {
    Driver_Payment_ID: string;
    Driver_Name?: string | null;
    Payment_Date?: string | null;
    Total_Amount?: number | null;
}
