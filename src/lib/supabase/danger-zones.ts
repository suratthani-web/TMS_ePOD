"use server"

import { createAdminClient } from "@/utils/supabase/server"
import { getUserBranchId } from "@/lib/permissions"

export type DangerZone = {
    Zone_ID?: string;
    Zone_Name: string;
    Coordinates: [number, number][]; // Polygon points
    Is_Active: boolean;
    Email_Recipient?: string;
    Branch_ID: string;
    Created_At?: string;
}

// The physical table and its columns are all lowercase (master_danger_zones).
// We map to/from the ProperCase DangerZone shape so callers stay unchanged.
type DangerZoneRow = {
    zone_id?: string;
    zone_name?: string;
    coordinates?: [number, number][];
    is_active?: boolean;
    email_recipient?: string | null;
    branch_id?: string;
    created_at?: string;
}

function fromRow(r: DangerZoneRow): DangerZone {
    return {
        Zone_ID: r.zone_id,
        Zone_Name: r.zone_name || '',
        Coordinates: r.coordinates || [],
        Is_Active: !!r.is_active,
        Email_Recipient: r.email_recipient || undefined,
        Branch_ID: r.branch_id || '',
        Created_At: r.created_at,
    }
}

function toRow(z: Partial<DangerZone>): DangerZoneRow {
    const row: DangerZoneRow = {}
    if (z.Zone_ID !== undefined) row.zone_id = z.Zone_ID
    if (z.Zone_Name !== undefined) row.zone_name = z.Zone_Name
    if (z.Coordinates !== undefined) row.coordinates = z.Coordinates
    if (z.Is_Active !== undefined) row.is_active = z.Is_Active
    if (z.Email_Recipient !== undefined) row.email_recipient = z.Email_Recipient
    if (z.Branch_ID !== undefined) row.branch_id = z.Branch_ID
    return row
}

export async function getDangerZones(branchId?: string): Promise<DangerZone[]> {
    const supabase = await createAdminClient()
    const sessionBranchId = await getUserBranchId()
    const targetBranchId = branchId || sessionBranchId

    let query = supabase.from('master_danger_zones').select('*')
    if (targetBranchId && targetBranchId !== 'All') {
        query = query.eq('branch_id', targetBranchId)
    }

    const { data } = await query.order('created_at', { ascending: false })
    return (data || []).map(fromRow)
}

export async function upsertDangerZone(zone: Partial<DangerZone>) {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
        .from('master_danger_zones')
        .upsert(toRow(zone))
        .select()
        .single()

    if (error) throw error
    return data ? fromRow(data) : null
}

export async function deleteDangerZone(zoneId: string) {
    const supabase = await createAdminClient()
    const { error } = await supabase
        .from('master_danger_zones')
        .delete()
        .eq('zone_id', zoneId)

    if (error) throw error
    return true
}
