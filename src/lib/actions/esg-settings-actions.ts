"use server"

import { createAdminClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export type TGOEmissionFactorItem = {
    id: string
    fuel_code: string
    fuel_name: string
    ef_value: number
    unit: string
    effective_date: string
    notes?: string
    is_active: boolean
    created_at?: string
}

/**
 * Fetch all TGO Emission Factors ordered by fuel code and effective date
 */
export async function getEmissionFactorsList(): Promise<TGOEmissionFactorItem[]> {
    try {
        const supabase = await createAdminClient()
        const { data, error } = await supabase
            .from('tgo_emission_factors')
            .select('*')
            .order('fuel_code', { ascending: true })
            .order('effective_date', { ascending: false })

        if (error) {
            console.error('[ESG Actions] Error fetching emission factors:', error)
            return []
        }

        return (data || []).map((item: any) => ({
            id: item.id,
            fuel_code: item.fuel_code,
            fuel_name: item.fuel_name,
            ef_value: Number(item.ef_value),
            unit: item.unit || 'kgCO2e/L',
            effective_date: item.effective_date,
            notes: item.notes || '',
            is_active: item.is_active ?? true,
            created_at: item.created_at
        }))
    } catch (err) {
        console.error('[ESG Actions] Server Exception:', err)
        return []
    }
}

/**
 * Upsert (Create or Update) Emission Factor Parameter
 */
export async function upsertEmissionFactor(payload: {
    id?: string
    fuel_code: string
    fuel_name: string
    ef_value: number
    unit?: string
    effective_date: string
    notes?: string
    is_active?: boolean
}): Promise<{ success: boolean; message?: string }> {
    try {
        const supabase = await createAdminClient()

        const row = {
            fuel_code: payload.fuel_code.trim(),
            fuel_name: payload.fuel_name.trim(),
            ef_value: payload.ef_value,
            unit: payload.unit || 'kgCO2e/L',
            effective_date: payload.effective_date,
            notes: payload.notes || '',
            is_active: payload.is_active ?? true,
            updated_at: new Date().toISOString()
        }

        if (payload.id) {
            // Update existing
            const { error } = await supabase
                .from('tgo_emission_factors')
                .update(row)
                .eq('id', payload.id)

            if (error) throw error
        } else {
            // Insert new record
            const { error } = await supabase
                .from('tgo_emission_factors')
                .insert([row])

            if (error) throw error
        }

        revalidatePath('/settings/esg')
        return { success: true, message: 'บันทึกค่า Emission Factor สำเร็จ' }
    } catch (err: any) {
        console.error('[ESG Actions] Error upserting emission factor:', err)
        return { success: false, message: err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' }
    }
}

/**
 * Delete an Emission Factor entry
 */
export async function deleteEmissionFactor(id: string): Promise<{ success: boolean; message?: string }> {
    try {
        const supabase = await createAdminClient()
        const { error } = await supabase
            .from('tgo_emission_factors')
            .delete()
            .eq('id', id)

        if (error) throw error

        revalidatePath('/settings/esg')
        return { success: true, message: 'ลบรายการสำเร็จ' }
    } catch (err: any) {
        console.error('[ESG Actions] Error deleting emission factor:', err)
        return { success: false, message: err.message || 'ไม่สามารถลบรายการได้' }
    }
}
