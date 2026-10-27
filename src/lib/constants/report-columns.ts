export const REPORT_COLUMN_LABELS: Record<string, string> = {
  // Common
  Status: 'สถานะ',
  status: 'สถานะ',
  Branch_ID: 'สาขา',
  Created_At: 'วันที่สร้าง',
  created_at: 'วันที่สร้าง',
  Notes: 'หมายเหตุ',
  notes: 'หมายเหตุ',

  // Jobs
  Job_ID: 'รหัสงาน',
  Plan_Date: 'วันที่',
  Customer_Name: 'ลูกค้า',
  Origin_Location: 'ต้นทาง',
  Dest_Location: 'ปลายทาง',
  Route_Name: 'เส้นทาง',
  Driver_Name: 'คนขับ',
  Vehicle_Plate: 'ทะเบียนรถ',
  Job_Status: 'สถานะงาน',
  Price_Cust_Total: 'ค่าเที่ยว (ลูกค้า)',
  Cost_Driver_Total: 'ค่าจ้างคนขับ',
  Cost_Driver_Extra: 'ค่าใช้จ่ายพิเศษคนขับ',
  Price_Cust_Extra: 'ค่าใช้จ่ายพิเศษลูกค้า',
  Extra_Cost_Amount: 'ค่าใช้จ่ายพิเศษรวม',
  Toll_Amount: 'ค่าทางด่วน',
  Distance_Km: 'ระยะทาง (KM)',
  Est_Distance_KM: 'ระยะทาง (KM)',
  Weight_Kg: 'น้ำหนัก (Kg)',
  Volume_Cbm: 'ปริมาตร (CBM)',
  Cargo_Type: 'ประเภทสินค้า',
  Invoice_ID: 'เลขที่ใบแจ้งหนี้',
  Total_Cost: 'ราคา',

  // Drivers
  Driver_ID: 'รหัสคนขับ',
  driver_name: 'คนขับ',
  Mobile_No: 'เบอร์โทร',
  License_No: 'เลขใบขับขี่',
  License_Expiry: 'หมดอายุใบขับขี่',
  Current_Mileage: 'เลขไมล์ล่าสุด',
  Active_Status: 'สถานะ',

  // Vehicles
  vehicle_plate: 'ทะเบียนรถ',
  vehicle_type: 'ประเภทรถ',
  brand: 'ยี่ห้อ',
  model: 'รุ่น',
  engine_no: 'เลขเครื่อง',
  chassis_no: 'เลขตัวถัง',
  max_weight_kg: 'น้ำหนักบรรทุกสูงสุด (Kg)',
  insurance_expiry: 'ประกันหมดอายุ',
  registration_expiry: 'ทะเบียนหมดอายุ',
  owner: 'ประเภทรถ/เจ้าของ',

  // Fuel
  fuel_date: 'วันที่เติม',
  liters: 'ลิตร',
  amount: 'จำนวนเงิน',
  station: 'ปั๊ม',
  fuel_type: 'ชนิดน้ำมัน',
  price_per_liter: 'ราคา/ลิตร',
  odometer: 'เลขไมล์',
  fuel_cost: 'ค่าน้ำมัน',

  // Maintenance
  maintenance_type: 'ประเภทซ่อม',
  description: 'รายละเอียด',
  priority: 'ความเร่งด่วน',
  cost: 'ค่าใช้จ่าย',
  maintenance_cost: 'ค่าซ่อมบำรุง',

  // vehicle_expenses specific
  extra_cost: 'ค่าใช้จ่ายอื่นๆ',
  total_cost: 'รวมค่าใช้จ่าย',
}
