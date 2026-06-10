"use server"

import { isAdmin, isSuperAdmin, getUserBranchId, getCustomerId } from "@/lib/permissions";
import { getSession } from "@/lib/session";
import { getDriverSession } from "@/lib/auth-utils";

/**
 * PermissionGuards - Centralized helpers to enforce access control.
 * These should be used in server actions to validate user authority.
 */

export async function requireAdmin() {
  const admin = await isAdmin();
  if (!admin) {
    throw new Error("Unauthorized: Admin privileges required.");
  }
  return true;
}

export async function requireSuperAdmin() {
  const superAdmin = await isSuperAdmin();
  if (!superAdmin) {
    throw new Error("Unauthorized: Super Admin privileges required.");
  }
  return true;
}

export async function requireBranchAccess(branchId: string | null | undefined) {
  if (!branchId) return true; // Global/Shared resources
  
  const userBranchId = await getUserBranchId();
  const superAdmin = await isSuperAdmin();
  
  if (superAdmin || userBranchId === 'All') return true;
  
  if (userBranchId !== branchId) {
    throw new Error(`Unauthorized: Access restricted to branch ${branchId}. Your branch is ${userBranchId}.`);
  }
  return true;
}

export async function requireCustomerAccess(customerId: string | null | undefined) {
  if (!customerId) return true;
  
  const userCustomerId = await getCustomerId();
  const admin = await isAdmin();
  
  if (admin) return true; // Admins can see all customers
  
  if (userCustomerId !== customerId) {
    throw new Error(`Unauthorized: Access restricted to your own customer data.`);
  }
  return true;
}

/**
 * Validates that the current user is the owner of a job (if they are a driver).
 */
export async function requireDriverOwnJob(driverIdFromJob: string | null | undefined) {
  const session = await getSession();
  
  // If user is Admin, they can access any job
  const admin = await isAdmin();
  if (admin) return true;

  const driverSession = await getDriverSession();
  const currentDriverId = driverSession?.driverId || driverSession?.Driver_ID || session?.userId || session?.username;
  if (!currentDriverId) throw new Error("Unauthorized: No session found.");
  
  if (currentDriverId !== driverIdFromJob) {
    throw new Error("Unauthorized: You are not assigned to this job.");
  }
  return true;
}
