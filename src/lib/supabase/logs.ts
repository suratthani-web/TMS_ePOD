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
