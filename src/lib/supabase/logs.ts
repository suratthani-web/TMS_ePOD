"use server"

import { createAdminClient } from "./admin";
import { getSession } from "../session";
import { headers } from "next/headers";

export type LogModule =
  | "Jobs"
  | "Planning"
  | "Billing"
  | "Users"
  | "Settings"
  | "Auth"
  | "Reports"
  | "Fuel"
  | "Maintenance";
export type LogAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "APPROVE"
  | "REJECT"
  | "EXPORT"
  | "LOGOUT";

interface LogOptions {
  module: LogModule;
  action_type: LogAction;
  target_id?: string;
  details?: Record<string, unknown> | null;
  branch_id?: string;
  user_id?: string;
  username?: string;
  role?: string;
}

/**
 * Logs a system activity.
 * Attempts to automatically retrieve session info if not provided.
 */
export async function logActivity(options: LogOptions) {
  try {
    const supabase = createAdminClient();

    let {
      user_id,
      username,
      role,
      branch_id,
    } = options;
    const {
      module,
      action_type,
      target_id,
      details,
    } = options;

    // Try to get session info if missing
    if (!user_id || !username) {
      const session = await getSession();
      if (session) {
        user_id = user_id || session.userId;
        username = username || session.username;
        branch_id = branch_id || session.branchId || undefined;
        // Map roleId to a string if possible, or just use the ID
        role =
          role ||
          (session.roleId === 1
            ? "Super Admin"
            : session.roleId === 2
              ? "Branch Manager"
              : "Staff");
      }
    }

    const headerList = await headers();
    const ip = headerList.get('x-forwarded-for')?.split(',')[0] || headerList.get('x-real-ip') || '127.0.0.1';

    const { error } = await supabase.from("System_Logs").insert({
      user_id,
      username,
      role,
      branch_id,
      module,
      action_type,
      target_id,
      details: {
        ...details,
        ip_address: ip
      }
    });

    if (error) {
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

/**
 * ประวัติการเข้าใช้งานของลูกค้า (Role = Customer) จาก System_Logs (event LOGIN).
 * ใช้บนหน้าติดตามผู้ใช้งานสด เพื่อให้แอดมินเห็น "ใครเข้ามาเมื่อไหร่" แบบย้อนหลังได้
 * (ต่างจาก presence สดที่หายเมื่อปิดแท็บ). Super Admin เห็นทุกสาขา, อื่น ๆ เฉพาะสาขาตัวเอง.
 */
export async function getCustomerLoginHistory(limit = 50) {
  try {
    const { isSuperAdmin, getUserBranchId } = await import("@/lib/permissions")
    const supabase = createAdminClient()
    const isSuper = await isSuperAdmin()
    const branchId = await getUserBranchId()

    let query = supabase
      .from("System_Logs")
      .select("username, role, branch_id, action_type, details, created_at")
      .eq("module", "Auth")
      .eq("action_type", "LOGIN")
      .ilike("role", "customer")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (!isSuper) {
      if (branchId && branchId !== "All") query = query.eq("branch_id", branchId)
      else return []
    }

    const { data, error } = await query
    if (error) return []

    // เติมชื่อจริงของลูกค้าจาก Master_Users (log เก็บแค่ username)
    const usernames = Array.from(new Set((data || []).map(r => r.username).filter(Boolean)))
    const nameMap = new Map<string, string>()
    if (usernames.length > 0) {
      const { data: users } = await supabase
        .from("Master_Users")
        .select("Username, Name")
        .in("Username", usernames as string[])
      ;(users || []).forEach((u: { Username: string; Name: string | null }) => {
        if (u.Username) nameMap.set(u.Username, u.Name || u.Username)
      })
    }

    return (data || []).map(r => ({
      username: r.username as string,
      name: nameMap.get(r.username as string) || (r.username as string),
      branch: (r.branch_id as string) || null,
      loginAt: r.created_at as string,
      ip: (r.details as { ip_address?: string } | null)?.ip_address || null,
    }))
  } catch {
    return []
  }
}

/**
 * Retrieves logs with filtering
 */
export async function getSystemLogs(filters: {
  branchId?: string;
  userId?: string;
  module?: string;
  actionType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const supabase = createAdminClient();

  let query = supabase
    .from("System_Logs")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.userId) query = query.eq("user_id", filters.userId);
  if (filters.module) query = query.eq("module", filters.module);
  if (filters.actionType) query = query.eq("action_type", filters.actionType);
  if (filters.startDate) query = query.gte("created_at", filters.startDate);
  if (filters.endDate) query = query.lte("created_at", filters.endDate);

  if (filters.limit) {
    query = query.limit(filters.limit);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data;
}
