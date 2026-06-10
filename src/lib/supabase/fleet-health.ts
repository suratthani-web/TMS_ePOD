"use server"

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isSuperAdmin, isAdmin, getCustomerId } from "@/lib/permissions"

export type HealthAlert = {
    vehicle_plate: string
    driver_id: string | null
    driver_name?: string
    issue_type: 'compliance' | 'maintenance' | 'service'
    description: string
    priority: 'high' | 'medium' | 'low'
    expiry_date?: string
    remaining_km?: number
}

export async function getFleetHealthAlerts(): Promise<HealthAlert[]> {
    try {
        const isSuper = await isSuperAdmin()
        const isRegularAdmin = await isAdmin()
        const customerId = await getCustomerId()
        const supabase = (isSuper || isRegularAdmin || customerId) ? await createAdminClient() : await createClient()
        const branchId = await getUserBranchId()

        // 1. Fetch all active vehicles
        let vehicleQuery = supabase
            .from('Master_Vehicles')
            .select(`
                Vehicle_Plate, 
                Driver_ID,
                Insurance_Expiry, 
                Tax_Expiry, 
                Act_Expiry, 
                Current_Mileage, 
                Next_Service_Mileage,
                Active_Status,
                Branch_ID
            `)
            .eq('Active_Status', 'Active')

        if (branchId && branchId !== 'All') {
            vehicleQuery = vehicleQuery.eq('Branch_ID', branchId)
        } else if (!isSuper && !isRegularAdmin && !branchId) {
            return []
        }

        const { data: vehicles, error: vError } = await vehicleQuery
        if (vError || !vehicles) return []

        // 2. Fetch driver names and maintenance standards
        const { data: drivers } = await supabase.from('Master_Drivers').select('Driver_ID, Driver_Name')
        const driverMap = new Map<string, string>(drivers?.map((d: { Driver_ID: string, Driver_Name: string }) => [d.Driver_ID, d.Driver_Name]) || [])

        const { data: standards } = await supabase.from('Fleet_Maintenance_Standards').select('*')
        
        // 3. Fetch all completed repair tickets for these vehicles to calculate component health
        const vehiclePlates = vehicles.map((v: { Vehicle_Plate: string }) => v.Vehicle_Plate)
        const { data: completedRepairs } = await supabase
            .from('Repair_Tickets')
            .select('Vehicle_Plate, Issue_Type, Date_Finish, Date_Report, Odometer')
            .in('Vehicle_Plate', vehiclePlates)
            .eq('Status', 'Completed')
            .order('Date_Report', { ascending: false })

        // 4. Fetch active repair tickets for current issues
        let repairQuery = supabase
            .from('Repair_Tickets')
            .select('Vehicle_Plate, Issue_Type, Priority, Status')
            .in('Status', ['Pending', 'In Progress', 'รอดำเนินการ', 'กำลังซ่อม'])

        if (branchId && branchId !== 'All') {
            repairQuery = repairQuery.eq('Branch_ID', branchId)
        }
        const { data: activeRepairs } = await repairQuery

        const alerts: HealthAlert[] = []
        const now = new Date()
        const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

        vehicles.forEach((v: { Driver_ID?: string | null, Vehicle_Plate: string, Active_Status?: string | null, Next_Service_Mileage?: number | null, Current_Mileage?: number | null, Insurance_Expiry?: string | null, Tax_Expiry?: string | null, Act_Expiry?: string | null }) => {
            const driverName = v.Driver_ID ? driverMap.get(v.Driver_ID) : undefined

            // --- A. Compliance Checks ---
            const complianceFields = [
                { type: 'ประกันภัย', date: v.Insurance_Expiry },
                { type: 'ภาษีรถ', date: v.Tax_Expiry },
                { type: 'พ.ร.บ.', date: v.Act_Expiry }
            ]
            complianceFields.forEach(check => {
                if (check.date) {
                    const expiry = new Date(check.date)
                    if (expiry < now) {
                        alerts.push({
                            vehicle_plate: v.Vehicle_Plate,
                            driver_id: v.Driver_ID || null,
                            driver_name: driverName,
                            issue_type: 'compliance',
                            description: `${check.type} หมดอายุ`,
                            priority: 'high',
                            expiry_date: check.date
                        })
                    } else if (expiry < thirtyDaysAhead) {
                        alerts.push({
                            vehicle_plate: v.Vehicle_Plate,
                            driver_id: v.Driver_ID || null,
                            driver_name: driverName,
                            issue_type: 'compliance',
                            description: `${check.type} ใกล้หมดอายุ`,
                            priority: 'medium',
                            expiry_date: check.date
                        })
                    }
                }
            })

            // --- B. Per-Component Maintenance Tracking ---
            if (standards && completedRepairs) {
                standards.forEach((std: { maintenance_type: string, interval_km: number, interval_months: number, Standard_KM?: number, Alert_Before_KM?: number, Component_Name?: string, Standard_Months?: number }) => {
                    // Find latest repair for this component on this vehicle
                    const latestRepair = completedRepairs.find((r: { Vehicle_Plate?: string, Issue_Type?: string | null, Date_Finish?: string | null, Date_Report?: string | null, Odometer?: number | null }) => 
                        r.Vehicle_Plate === v.Vehicle_Plate && 
                        r.Issue_Type?.toLowerCase().includes((std.Component_Name || '').toLowerCase())
                    )

                    if (latestRepair) {
                        const lastDate = new Date(latestRepair.Date_Finish || latestRepair.Date_Report)
                        const lastOdo = latestRepair.Odometer || 0
                        const currOdo = v.Current_Mileage || 0

                        // Check KM
                        if (std.Standard_KM) {
                            const kmUsed = currOdo - lastOdo
                            const kmRemaining = std.Standard_KM - kmUsed
                            const alertThreshold = std.Alert_Before_KM || 1000

                            if (kmRemaining <= 0) {
                                alerts.push({
                                    vehicle_plate: v.Vehicle_Plate,
                                    driver_id: v.Driver_ID || null,
                                    driver_name: driverName,
                                    issue_type: 'service',
                                    description: `รอบเปลี่ยน${std.Component_Name} (เกินกำหนด ${Math.abs(kmRemaining).toLocaleString()} กม.)`,
                                    priority: 'high',
                                    remaining_km: kmRemaining
                                })
                            } else if (kmRemaining <= alertThreshold) {
                                alerts.push({
                                    vehicle_plate: v.Vehicle_Plate,
                                    driver_id: v.Driver_ID || null,
                                    driver_name: driverName,
                                    issue_type: 'service',
                                    description: `ใกล้ถึงรอบเปลี่ยน${std.Component_Name} (เหลือ ${kmRemaining.toLocaleString()} กม.)`,
                                    priority: 'medium',
                                    remaining_km: kmRemaining
                                })
                            }
                        }

                        // Check Months
                        if (std.Standard_Months) {
                            const monthsPassed = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
                            const monthsRemaining = std.Standard_Months - monthsPassed
                            
                            if (monthsRemaining <= 0) {
                                alerts.push({
                                    vehicle_plate: v.Vehicle_Plate,
                                    driver_id: v.Driver_ID || null,
                                    driver_name: driverName,
                                    issue_type: 'service',
                                    description: `รอบเปลี่ยน${std.Component_Name} (เกินกำหนด ${Math.abs(Math.round(monthsRemaining))} เดือน)`,
                                    priority: 'high'
                                })
                            }
                        }
                    }
                })
            }

            // --- C. Active Repair Tickets ---
            const vehicleRepairs = activeRepairs?.filter((r: { Vehicle_Plate: string, Status: string, Estimated_Cost?: number, Issue_Type?: string, Priority?: string }) => r.Vehicle_Plate === v.Vehicle_Plate) || []
            vehicleRepairs.forEach((r: { Vehicle_Plate: string, Status: string, Estimated_Cost?: number, Issue_Type?: string, Priority?: string }) => {
                alerts.push({
                    vehicle_plate: v.Vehicle_Plate,
                    driver_id: v.Driver_ID || null,
                    driver_name: driverName,
                    issue_type: 'maintenance',
                    description: `แจ้งซ่อม: ${r.Issue_Type || 'ไม่ระบุอาการ'}`,
                    priority: r.Priority?.toLowerCase() === 'high' ? 'high' : 'medium'
                })
            })
        })

        return alerts.sort((a, b) => {
            const priorityMap = { high: 0, medium: 1, low: 2 }
            return priorityMap[a.priority] - priorityMap[b.priority]
        })

    } catch (e) {
        console.error('[FLEET_HEALTH] Alert generation failed:', e)
        return []
    }
}
