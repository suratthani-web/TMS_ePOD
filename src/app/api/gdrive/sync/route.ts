import { NextRequest, NextResponse } from "next/server"
import { syncGoogleDriveFolder, parseAndSaveBatchText } from "@/lib/gdrive/sync"
import { getImageMap } from "@/lib/gdrive/entity-images"
import { isAdmin } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const isUserAdmin = await isAdmin()
    if (!isUserAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const map = await getImageMap()
    return NextResponse.json({
      success: true,
      data: map,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const isUserAdmin = await isAdmin()
    if (!isUserAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const body = await req.json()
    const { action, entityType, folderUrl, rawText, apiKey } = body

    if (!entityType || !["vehicle", "driver", "user"].includes(entityType)) {
      return NextResponse.json({ error: "Invalid entityType" }, { status: 400 })
    }

    if (action === "sync_folder") {
      if (!folderUrl) {
        return NextResponse.json({ error: "Missing folderUrl" }, { status: 400 })
      }
      const result = await syncGoogleDriveFolder(entityType, folderUrl, apiKey)
      return NextResponse.json(result)
    }

    if (action === "batch_text") {
      if (!rawText) {
        return NextResponse.json({ error: "Missing rawText" }, { status: 400 })
      }
      const result = await parseAndSaveBatchText(entityType, rawText)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
