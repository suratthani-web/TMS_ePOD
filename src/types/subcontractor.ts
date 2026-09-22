export interface Subcontractor {
    Sub_ID: string;
    Sub_Name: string;
    Tax_ID?: string;
    Bank_Name?: string;
    Bank_Account_No?: string;
    Bank_Account_Name?: string;
    Active_Status: string;
    Branch_ID?: string;
    Created_At?: string;
    Password?: string;       // รหัสผ่านให้เจ้าของสังกัดล็อกอินดูใบสรุปจ่าย
    Line_User_ID?: string;
}
