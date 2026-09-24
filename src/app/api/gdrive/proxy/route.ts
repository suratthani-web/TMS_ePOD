import { NextRequest, NextResponse } from "next/server"
import { extractGoogleDriveFileId } from "@/lib/gdrive/utils"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const idOrUrl = searchParams.get("id") || searchParams.get("url")

  if (!idOrUrl) {
    return new NextResponse("Missing file ID or URL", { status: 400 })
  }

  const fileId = extractGoogleDriveFileId(idOrUrl)
  if (!fileId) {
    return new NextResponse("Invalid Google Drive identifier", { status: 400 })
  }

  try {
    const targetUrl = `https://lh3.googleusercontent.com/d/${fileId}`
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 86400 },
    })

    if (!response.ok) {
      // Fallback to drive download url
      const fallbackUrl = `https://drive.google.com/uc?export=view&id=${fileId}`
      const fallbackResp = await fetch(fallbackUrl)
      if (!fallbackResp.ok) {
        return new NextResponse("Failed to fetch image from Google Drive", { status: response.status })
      }
      const data = await fallbackResp.arrayBuffer()
      const contentType = fallbackResp.headers.get("content-type") || "image/jpeg"
      return new NextResponse(data, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      })
    }

    const data = await response.arrayBuffer()
    const contentType = response.headers.get("content-type") || "image/jpeg"

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Proxy error"
    return new NextResponse(message, { status: 500 })
  }
}
