export const sanitizeJobData = (data: Record<string, unknown>) => {
    const clean: Record<string, unknown> = {}
    const allowedKeys = [
        'Job_ID', 'Job_Status', 'Plan_Date', 'Pickup_Date', 'Delivery_Date',
        'Customer_ID', 'Customer_Name', 'Route_Name', 'Driver_ID', 'Driver_Name', 
        'Vehicle_Plate', 'Vehicle_Type', 'Origin_Location', 'Dest_Location', 
        'Total_Drop', 'Price_Cust_Total', 'Cost_Driver_Total', 'Price_Cust_Extra', 
        'Cost_Driver_Extra', 'Cargo_Type', 'Notes', 'original_origins_json', 
        'original_destinations_json', 'extra_costs_json', 'Show_Price_To_Driver', 'Sub_ID', 
        'Weight_Kg', 'Volume_Cbm', 'Zone', 'Invoice_ID', 'Billing_Note_ID', 
        'Driver_Payment_ID', 'Pickup_Photo_Url', 'Pickup_Signature_Url', 
        'Pickup_Lat', 'Pickup_Lon', 'Delivery_Lat', 'Delivery_Lon', 'Branch_ID', 'Created_At', 'lat', 'lon', 
        'Expire_Date', 'Failed_Reason', 'Failed_Time', 'Rating', 
        'Payment_Date', 'Billing_Date',
        'Verification_Status', 'Verified_By', 'Verified_At',
        'Loaded_Qty', 'Est_Distance_KM',
        'Requires_Incentive_Check', 'Incentive_Claimed', 'Sensor_Verified',
        'Sensor_Max_Elevation_Diff', 'Sensor_Total_Steps_Upward', 'Sensor_Logs_Json',
        'job_type', 'chassis_plate'
    ]
    
    const numericKeys = [
        'Price_Cust_Total', 'Cost_Driver_Total', 'Price_Cust_Extra', 'Cost_Driver_Extra',
        'Weight_Kg', 'Volume_Cbm', 'Pickup_Lat', 'Pickup_Lon', 'Delivery_Lat', 'Delivery_Lon',
        'lat', 'lon', 'Loaded_Qty', 'Est_Distance_KM', 'Rating'
    ]
    
    Object.keys(data).forEach(key => {
        if (allowedKeys.includes(key)) {
            let val = data[key]
            
            // If it's a numeric key and value is an empty string (or just whitespace), set to null
            if (numericKeys.includes(key) && typeof val === 'string' && val.trim() === "") {
                val = null
            }
            // Also ensure it's a proper number if it's a non-empty string for numeric keys
            else if (numericKeys.includes(key) && typeof val === 'string' && val.trim() !== "") {
                const numVal = Number(val)
                if (!isNaN(numVal)) val = numVal
            }

            clean[key] = val
        }
    })
    return clean
}
