/**
 * Google Drive URL Parser & Image Transformer
 * Converts various Google Drive shareable links into direct high-performance CDN image URLs.
 */

/**
 * Extracts a Google Drive File ID from various link formats.
 */
export function extractGoogleDriveFileId(urlOrId?: string | null): string | null {
  if (!urlOrId || typeof urlOrId !== "string") return null
  const trimmed = urlOrId.trim()
  if (!trimmed) return null

  // If already a clean File ID (standard Drive IDs are 25-50 alphanumeric characters with - and _)
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(trimmed)) {
    return trimmed
  }

  // Format: /file/d/FILE_ID
  const matchFileD = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/i)
  if (matchFileD && matchFileD[1]) return matchFileD[1]

  // Format: id=FILE_ID
  const matchIdParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{20,})/i)
  if (matchIdParam && matchIdParam[1]) return matchIdParam[1]

  // Format: /d/FILE_ID (lh3 or drive.google.com/d/)
  const matchD = trimmed.match(/\/d\/([a-zA-Z0-9_-]{20,})/i)
  if (matchD && matchD[1]) return matchD[1]

  // Format: /open?id=FILE_ID
  const matchOpen = trimmed.match(/\/open\?id=([a-zA-Z0-9_-]{20,})/i)
  if (matchOpen && matchOpen[1]) return matchOpen[1]

  return null
}

/**
 * Extracts a Google Drive Folder ID from a folder shareable URL or raw ID.
 */
export function extractGoogleDriveFolderId(urlOrId?: string | null): string | null {
  if (!urlOrId || typeof urlOrId !== "string") return null
  const trimmed = urlOrId.trim()
  if (!trimmed) return null

  // Raw Folder ID
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(trimmed)) {
    return trimmed
  }

  // Format: /folders/FOLDER_ID
  const matchFolder = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{20,})/i)
  if (matchFolder && matchFolder[1]) return matchFolder[1]

  return null
}

/**
 * Checks if a string is a Google Drive URL or File ID.
 */
export function isGoogleDriveUrl(url?: string | null): boolean {
  if (!url) return false
  return Boolean(
    url.includes("drive.google.com") ||
    url.includes("docs.google.com") ||
    url.includes("lh3.googleusercontent.com") ||
    extractGoogleDriveFileId(url)
  )
}

/**
 * Transforms any Google Drive URL into a direct, embeddable image URL.
 * Uses Google's CDN (lh3.googleusercontent.com/d/FILE_ID) which:
 * - Loads fast with global edge caching
 * - Renders directly in <img> tags without CORS or iframe restrictions
 * - Requires the file to be shared as "Anyone with the link can view"
 */
export function formatGoogleDriveImageUrl(urlOrId?: string | null, size = 1000): string {
  if (!urlOrId || typeof urlOrId !== "string") return ""
  const trimmed = urlOrId.trim()
  if (!trimmed) return ""

  const fileId = extractGoogleDriveFileId(trimmed)
  if (fileId) {
    // lh3.googleusercontent.com/d/{id} provides direct image stream
    return `https://lh3.googleusercontent.com/d/${fileId}`
  }

  // Return original URL if it's already a direct web URL (e.g. Supabase Storage, S3, etc.)
  return trimmed
}

/**
 * Normalizes vehicle plate or driver identifier for filename matching.
 * E.g. "3ฒว 2502" -> "3ฒว2502", "3ฒว-2502" -> "3ฒว2502", "DRV-001" -> "drv001"
 */
export function normalizeIdentifier(val?: string | null): string {
  if (!val) return ""
  return val
    .toLowerCase()
    .replace(/[\s\-_.]/g, "")
    .trim()
}
