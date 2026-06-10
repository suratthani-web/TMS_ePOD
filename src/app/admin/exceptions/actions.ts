"use server"

import { requireAdmin } from "@/services/permission-guards"
import { getActiveExceptions, OperationalException } from "@/services/exception-center"

export async function fetchExceptionsAction(branchId?: string): Promise<OperationalException[]> {
    await requireAdmin()
    return await getActiveExceptions(branchId)
}
