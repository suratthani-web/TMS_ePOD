'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { getUserBranchId, isAdmin, isSuperAdmin } from '@/lib/permissions'
import { cookies } from 'next/headers'

export interface ReportFilters {
  reportType: string
  dateFrom?: string
  dateTo?: string
  status?: string
  branchId?: string
}

export async function getFilteredReportData(filters: ReportFilters): Promise<{ 
  data: Record<string, unknown>[], 
  columns: string[], 
  error?: string,
  debug?: any
}> {
  const admin = await isAdmin()
  const supabase = admin ? await createAdminClient() : await createClient()
  const userBranchId = await getUserBranchId()
  const cookieStore = await cookies()
  const selectedBranch = cookieStore.get('selectedBranch')?.value

  const isSuper = await isSuperAdmin()
  const effectiveBranch = isSuper 
    ? (filters.branchId || selectedBranch || 'All')
    : userBranchId

  console.log('[Report Debug] Filters:', filters)
  console.log('[Report Debug] isAdmin (both roles):', admin)
  console.log('[Report Debug] effectiveBranch:', effectiveBranch)

  try {
    switch (filters.reportType) {
      case 'jobs': {
        let query = supabase
          .from('Jobs_Main')
          .select('*')
          .order('Plan_Date', { ascending: false })
          .limit(2000)

        if (filters.dateFrom) query = query.gte('Plan_Date', filters.dateFrom)
        if (filters.dateTo) query = query.lte('Plan_Date', filters.dateTo)
        if (filters.status && filters.status !== 'all') query = query.eq('Job_Status', filters.status)
        if (effectiveBranch && effectiveBranch !== 'All') query = query.eq('Branch_ID', effectiveBranch)

        const { data, error } = await query
        if (error) {
          console.error('[Report Debug] Jobs Query Error:', error)
          throw error
        }

        console.log('[Report Debug] Jobs found:', data?.length || 0)
        const rawData = data || []

        // Extract all unique extra cost types to create columns
        const extraCostTypes = new Set<string>()
        rawData.forEach((job: any) => {
          if (job.extra_costs_json) {
            try {
              const costs = typeof job.extra_costs_json === 'string' ? JSON.parse(job.extra_costs_json) : job.extra_costs_json
              if (Array.isArray(costs)) {
                costs.forEach((c: any) => {
                  if (c.type) extraCostTypes.add(`Extra_${c.type}`)
                })
              }
            } catch {}
          }
        })

        const sortedExtraTypes = Array.from(extraCostTypes).sort()

        const processedData = rawData.map((job: any) => {
          const row: Record<string, unknown> = { ...job }
          // Initialize all extra columns with 0
          sortedExtraTypes.forEach(type => {
            row[type] = 0
          })

          // Fill in extra costs
          if (job.extra_costs_json) {
            try {
              const costs = typeof job.extra_costs_json === 'string' ? JSON.parse(job.extra_costs_json) : job.extra_costs_json
              if (Array.isArray(costs)) {
                costs.forEach((c: any) => {
                  if (c.type) {
                    const colName = `Extra_${c.type}`
                    row[colName] = (Number(row[colName]) || 0) + (Number(c.charge_base) || Number(c.amount) || 0)
                  }
                })
              }
            } catch {}
          }
          return row
        })

        return { 
          data: processedData, 
          columns: [
            'Job_ID', 'Plan_Date', 'Customer_Name', 
            'Origin_Location', 'Dest_Location', 
            'Driver_Name', 'Vehicle_Plate', 'Job_Status', 
            'Price_Cust_Total', 'Extra_Cost_Amount', 'Toll_Amount', 'Distance_Km',
            ...sortedExtraTypes
          ],
          debug: { admin, effectiveBranch, count: rawData.length }
        }
      }

      case 'drivers': {
        let query = supabase
          .from('Master_Drivers')
          .select('*')
          .order('Driver_Name')
          .limit(500)

        if (filters.status && filters.status !== 'all') query = query.eq('Active_Status', filters.status)
        if (effectiveBranch && effectiveBranch !== 'All') query = query.eq('Branch_ID', effectiveBranch)

        const { data, error } = await query
        if (error) throw error

        return { 
          data: data || [], 
          columns: ['Driver_ID', 'Driver_Name', 'Mobile_No', 'Active_Status', 'Vehicle_Plate'],
          debug: { admin, effectiveBranch, count: data?.length || 0 }
        }
      }

      case 'vehicles': {
        let query = supabase
          .from('Master_Vehicles')
          .select('*')
          .order('Vehicle_Plate')
          .limit(500)

        if (filters.status && filters.status !== 'all') query = query.eq('Active_Status', filters.status)
        if (effectiveBranch && effectiveBranch !== 'All') query = query.eq('Branch_ID', effectiveBranch)

        const { data, error } = await query
        if (error) throw error

        return { 
          data: (data || []).map((v: any) => ({
            ...v,
            vehicle_plate: v.Vehicle_Plate,
            vehicle_type: v.Vehicle_Type,
            status: v.Active_Status,
            brand: v.brand || v.Brand,
            model: v.model || v.Model,
            engine_no: v.engine_no || v.Engine_No,
            chassis_no: v.chassis_no || v.Chassis_No,
            max_weight_kg: v.max_weight_kg || v.Max_Weight_kg,
            owner: v.Sub_ID ? 'รถร่วม' : 'รถบริษัท',
            insurance_expiry: v.Insurance_Expiry || v.insurance_expiry,
            registration_expiry: v.Tax_Expiry || v.tax_expiry
          })), 
          columns: ['vehicle_plate', 'vehicle_type', 'owner', 'brand', 'model', 'engine_no', 'chassis_no', 'max_weight_kg', 'status', 'insurance_expiry', 'registration_expiry'],
          debug: { admin, effectiveBranch, count: data?.length || 0 }
        }
      }

      case 'fuel': {
        let query = supabase
          .from('Fuel_Logs')
          .select('*')
          .order('Date_Time', { ascending: false })
          .limit(2000)

        if (filters.dateFrom) query = query.gte('Date_Time', filters.dateFrom)
        if (filters.dateTo) query = query.lte('Date_Time', filters.dateTo)
        if (effectiveBranch && effectiveBranch !== 'All') query = query.eq('Branch_ID', effectiveBranch)

        const { data, error } = await query
        if (error) throw error

        return { 
          data: (data || []).map((f: any) => ({
            ...f,
            fuel_date: f.Date_Time,
            vehicle_plate: f.Vehicle_Plate,
            amount: f.Price_Total,
            station: f.Station_Name,
            odometer: f.Odometer,
            price_per_liter: Number(f.Liters) > 0 ? (Number(f.Price_Total) / Number(f.Liters)) : 0
          })), 
          columns: ['fuel_date', 'vehicle_plate', 'station', 'Liters', 'price_per_liter', 'amount', 'odometer'],
          debug: { admin, effectiveBranch, count: data?.length || 0 }
        }
      }

      case 'maintenance': {
        let query = supabase
          .from('Repair_Tickets')
          .select('*')
          .order('Date_Report', { ascending: false })
          .limit(1000)

        if (filters.dateFrom) query = query.gte('Date_Report', filters.dateFrom)
        if (filters.dateTo) query = query.lte('Date_Report', filters.dateTo)
        if (filters.status && filters.status !== 'all') query = query.eq('Status', filters.status)

        const { data, error } = await query
        if (error) throw error

        return { 
          data: (data || []).map((m: any) => ({
            ...m,
            created_at: m.Date_Report,
            vehicle_plate: m.Vehicle_Plate,
            maintenance_type: m.Issue_Type,
            cost: m.Cost_Total,
            description: m.Description,
            status: m.Status
          })), 
          columns: ['created_at', 'vehicle_plate', 'maintenance_type', 'status', 'cost', 'description'],
          debug: { admin, effectiveBranch, count: data?.length || 0 }
        }
      }

      case 'vehicle_expenses': {
        // 1. Get all vehicles in the branch
        let vQuery = supabase
          .from('Master_Vehicles')
          .select('Vehicle_Plate, Vehicle_Type, Sub_ID, Branch_ID')
        
        if (effectiveBranch && effectiveBranch !== 'All') {
          vQuery = vQuery.eq('Branch_ID', effectiveBranch)
        }
        const { data: vehicles } = await vQuery

        if (!vehicles || vehicles.length === 0) return { data: [], columns: [] }

        const plates = vehicles.map((v: any) => v.Vehicle_Plate)

        // 2. Aggregate Fuel Costs
        let fuelQuery = supabase
          .from('Fuel_Logs')
          .select('Vehicle_Plate, Price_Total')
          .in('Vehicle_Plate', plates)
        if (filters.dateFrom) fuelQuery = fuelQuery.gte('Date_Time', filters.dateFrom)
        if (filters.dateTo) fuelQuery = fuelQuery.lte('Date_Time', filters.dateTo)
        const { data: fuelLogs } = await fuelQuery

        // 3. Aggregate Maintenance Costs
        let maintQuery = supabase
          .from('Repair_Tickets')
          .select('Vehicle_Plate, Cost_Total')
          .in('Vehicle_Plate', plates)
          .eq('Status', 'completed')
        if (filters.dateFrom) maintQuery = maintQuery.gte('Date_Report', filters.dateFrom)
        if (filters.dateTo) maintQuery = maintQuery.lte('Date_Report', filters.dateTo)
        const { data: maintLogs } = await maintQuery

        // 4. Get Extra Costs from Jobs (Subcontractor job costs if applicable)
        let jobQuery = supabase
          .from('Jobs_Main')
          .select('Vehicle_Plate, extra_costs_json')
          .in('Vehicle_Plate', plates)
        if (filters.dateFrom) jobQuery = jobQuery.gte('Plan_Date', filters.dateFrom)
        if (filters.dateTo) jobQuery = jobQuery.lte('Plan_Date', filters.dateTo)
        const { data: rawJobs } = await jobQuery

        // 5. Get Subcontractor details for labeling
        const subIds = [...new Set(vehicles.map((v: any) => v.Sub_ID).filter(Boolean))]
        const { data: subs } = await supabase
          .from('Master_Subcontractors')
          .select('Sub_ID, Sub_Name')
          .in('Sub_ID', subIds as string[])

        const subMap = (subs || []).reduce((acc: Record<string, string>, s: Record<string, string>) => {
          acc[s.Sub_ID] = s.Sub_Name
          return acc
        }, {})

        // Aggregate by Plate
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const reportData = (vehicles as any[]).map((v: any) => {
          const vPlate = v.Vehicle_Plate
          const fuelTotal = (fuelLogs || [])
            .filter((f: any) => f.Vehicle_Plate === vPlate)
            .reduce((sum: number, f: any) => sum + (Number(f.Price_Total) || 0), 0)
          
          const maintTotal = (maintLogs || [])
            .filter((m: any) => m.Vehicle_Plate === vPlate)
            .reduce((sum: number, m: any) => sum + (Number(m.Cost_Total) || 0), 0)

          const extraCosts = (rawJobs || [])
            .filter((j: any) => j.Vehicle_Plate === vPlate)
            .reduce((sum: number, j: any) => {
              let extra = 0
              if (j.extra_costs_json) {
                try {
                  const costs = typeof j.extra_costs_json === 'string' ? JSON.parse(j.extra_costs_json) : j.extra_costs_json
                  if (Array.isArray(costs)) {
                    extra = costs.reduce((s: number, c: any) => s + (Number(c.charge_base) || Number(c.amount) || 0), 0)
                  }
                } catch {}
              }
              return sum + extra
            }, 0)

          return {
            vehicle_plate: vPlate,
            vehicle_type: v.Vehicle_Type,
            owner: v.Sub_ID ? (subMap[v.Sub_ID] || 'รถร่วม') : 'รถบริษัท',
            fuel_cost: fuelTotal,
            maintenance_cost: maintTotal,
            extra_cost: extraCosts,
            total_cost: fuelTotal + maintTotal + extraCosts
          }
        })

        // Filter by Owner Type if status filter is used (re-using status as owner type filter for this report)
        let finalData = reportData
        if (filters.status === 'Company') finalData = reportData.filter((d: any) => d.owner === 'รถบริษัท')
        if (filters.status === 'Subcontractor') finalData = reportData.filter((d: any) => d.owner !== 'รถบริษัท')
        /* eslint-enable @typescript-eslint/no-explicit-any */

        return {
          data: finalData,
          columns: ['vehicle_plate', 'owner', 'vehicle_type', 'fuel_cost', 'maintenance_cost', 'extra_cost', 'total_cost'],
          debug: { admin, effectiveBranch, count: finalData.length }
        }
      }

      default:
        return { data: [], columns: [], debug: { admin, effectiveBranch } }
    }
  } catch (error: any) {
    console.error('[Report Action Error]', error)
    return { data: [], columns: [], error: error.message || 'Unknown error occurred' }
  }
}

// Get available status options for each report type
export async function getReportStatusOptions(reportType: string): Promise<string[]> {
  switch (reportType) {
    case 'jobs':
      return ['New', 'Assigned', 'In Transit', 'Completed', 'Delivered', 'Failed', 'Cancelled']
    case 'drivers':
      return ['Active', 'OnJob', 'Inactive', 'Suspended']
    case 'vehicles':
      return ['Active', 'Maintenance', 'Inactive']
    case 'maintenance':
      return ['pending', 'in_progress', 'completed', 'cancelled']
    case 'vehicle_expenses':
      return ['All', 'Company', 'Subcontractor']
    default:
      return []
  }
}
