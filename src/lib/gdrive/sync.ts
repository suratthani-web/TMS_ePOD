"use server"

import { createAdminClient } from "@/utils/supabase/server"
import { extractGoogleDriveFileId, extractGoogleDriveFolderId, formatGoogleDriveImageUrl, normalizeIdentifier } from "./utils"
import { batchSaveEntityImages, getImageMap } from "./entity-images"

export type SyncResult = {
  success: boolean
  message: string
  totalFound: number
  matchedCount: number
  matched: Array<{ id: string; label: string; fileId: string; imageUrl: string }>
  unmatched: Array<{ filename: string; fileId: string }>
}

type DriveFile = {
  id: string
  name: string
}

/**
 * Parses files from a Google Drive folder using API Key (if provided) or public folder scraping.
 */
export async function listGoogleDriveFolderFiles(folderUrlOrId: string, apiKey?: string): Promise<DriveFile[]> {
  const folderId = extractGoogleDriveFolderId(folderUrlOrId)
  if (!folderId) {
    throw new Error("ลิงก์หรือ Folder ID ของ Google Drive ไม่ถูกต้อง")
  }

  // 1. Try Google Drive API v3 if API key is provided
  if (apiKey) {
    try {
      const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)&pageSize=1000&key=${apiKey}`
      const resp = await fetch(url)
      if (resp.ok) {
        const json = await resp.json()
        if (Array.isArray(json.files)) {
          return json.files
            .filter((f: { mimeType?: string }) => !f.mimeType?.includes("folder"))
            .map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }))
        }
      }
    } catch {
      // Fall through to public HTML scraper
    }
  }

  // 2. Fallback: Parse public Google Drive folder web page
  try {
    const folderWebUrl = `https://drive.google.com/drive/folders/${folderId}`
    const resp = await fetch(folderWebUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    if (!resp.ok) {
      throw new Error(`ไม่สามารถเข้าถึงโฟลเดอร์ Google Drive ได้ (Status: ${resp.status}) กรุณาตรวจสอบว่าแชร์โฟลเดอร์เป็น 'ทุกคนที่มีลิงก์' (Anyone with link) แล้วหรือยัง`)
    }

    const html = await resp.text()
    const files: DriveFile[] = []
    const seenIds = new Set<string>()

    // Regex to match Google Drive folder JSON payload containing [...,"FILE_ID","FILENAME.EXT",...]
    // Typically: ["0B...","photo.jpg"] or ["1A...","driver.png"]
    const regex = /\["([a-zA-Z0-9_-]{25,60})",\[\],\[\],"(image\/[a-z]+|[a-zA-Z0-9_\-.]+\.(?:jpe?g|png|webp|gif))"/gi
    let match: RegExpExecArray | null
    while ((match = regex.exec(html)) !== null) {
      const id = match[1]
      const name = match[2]
      if (!seenIds.has(id)) {
        seenIds.add(id)
        files.push({ id, name })
      }
    }

    // Additional generic pattern for public folder file listings: ["FILE_ID","TITLE"]
    if (files.length === 0) {
      const altRegex = /"([a-zA-Z0-9_-]{28,50})"[,\s]+\[[^\]]*\][,\s]+"([^"]+\.(?:jpg|jpeg|png|webp|gif))"/gi
      let altMatch: RegExpExecArray | null
      while ((altMatch = altRegex.exec(html)) !== null) {
        const id = altMatch[1]
        const name = altMatch[2]
        if (!seenIds.has(id)) {
          seenIds.add(id)
          files.push({ id, name })
        }
      }
    }

    return files
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error reading Google Drive folder"
    throw new Error(msg)
  }
}

/**
 * Scans a Google Drive folder and matches files against vehicles or drivers.
 */
export async function syncGoogleDriveFolder(
  entityType: "vehicle" | "driver" | "user",
  folderUrlOrId: string,
  apiKey?: string
): Promise<SyncResult> {
  try {
    const files = await listGoogleDriveFolderFiles(folderUrlOrId, apiKey)
    const supabase = createAdminClient()

    const matched: SyncResult["matched"] = []
    const unmatched: SyncResult["unmatched"] = []
    const updateMap: Record<string, string> = {}

    if (entityType === "vehicle") {
      const { data: vehicles } = await supabase
        .from("Master_Vehicles")
        .select("Vehicle_Plate, Brand, Model")

      const vehicleList = vehicles || []

      for (const file of files) {
        // Strip file extension: e.g. "3ฒว2502.jpg" -> "3ฒว2502"
        const baseName = file.name.replace(/\.[^/.]+$/, "")
        const normFile = normalizeIdentifier(baseName)

        // Find match in vehicle plates
        const found = vehicleList.find((v) => {
          const normPlate = normalizeIdentifier(v.Vehicle_Plate)
          return normPlate === normFile || normFile.includes(normPlate) || normPlate.includes(normFile)
        })

        if (found) {
          const imgUrl = formatGoogleDriveImageUrl(file.id)
          updateMap[found.Vehicle_Plate] = imgUrl
          matched.push({
            id: found.Vehicle_Plate,
            label: `${found.Vehicle_Plate} (${[found.Brand, found.Model].filter(Boolean).join(" ") || "รถ"})`,
            fileId: file.id,
            imageUrl: imgUrl,
          })
        } else {
          unmatched.push({ filename: file.name, fileId: file.id })
        }
      }

      if (Object.keys(updateMap).length > 0) {
        await batchSaveEntityImages({
          vehicles: updateMap,
          folders: { vehicles: folderUrlOrId },
        })
      }
    } else if (entityType === "driver") {
      const { data: drivers } = await supabase
        .from("Master_Drivers")
        .select("Driver_ID, Driver_Name, Mobile_No")

      const driverList = drivers || []

      for (const file of files) {
        const baseName = file.name.replace(/\.[^/.]+$/, "")
        const normFile = normalizeIdentifier(baseName)

        const found = driverList.find((d) => {
          const normId = normalizeIdentifier(d.Driver_ID)
          const normName = normalizeIdentifier(d.Driver_Name)
          const normPhone = normalizeIdentifier(d.Mobile_No)
          return (
            (normId && normFile === normId) ||
            (normName && (normFile === normName || normFile.includes(normName) || normName.includes(normFile))) ||
            (normPhone && normPhone.length >= 9 && normFile.includes(normPhone))
          )
        })

        if (found) {
          const imgUrl = formatGoogleDriveImageUrl(file.id)
          updateMap[found.Driver_ID] = imgUrl
          matched.push({
            id: found.Driver_ID,
            label: `${found.Driver_Name || found.Driver_ID} (${found.Driver_ID})`,
            fileId: file.id,
            imageUrl: imgUrl,
          })
        } else {
          unmatched.push({ filename: file.name, fileId: file.id })
        }
      }

      if (Object.keys(updateMap).length > 0) {
        await batchSaveEntityImages({
          drivers: updateMap,
          folders: { drivers: folderUrlOrId },
        })
      }
    } else if (entityType === "user") {
      const { data: users } = await supabase
        .from("Master_Users")
        .select("Username, Name, Email")

      const userList = users || []

      for (const file of files) {
        const baseName = file.name.replace(/\.[^/.]+$/, "")
        const normFile = normalizeIdentifier(baseName)

        const found = userList.find((u) => {
          const normUser = normalizeIdentifier(u.Username)
          const normName = normalizeIdentifier(u.Name)
          const normEmail = normalizeIdentifier(u.Email)
          return (
            (normUser && normFile === normUser) ||
            (normName && normFile === normName) ||
            (normEmail && normFile === normEmail)
          )
        })

        if (found) {
          const imgUrl = formatGoogleDriveImageUrl(file.id)
          updateMap[found.Username] = imgUrl
          matched.push({
            id: found.Username,
            label: `${found.Name || found.Username} (@${found.Username})`,
            fileId: file.id,
            imageUrl: imgUrl,
          })
        } else {
          unmatched.push({ filename: file.name, fileId: file.id })
        }
      }

      if (Object.keys(updateMap).length > 0) {
        await batchSaveEntityImages({
          users: updateMap,
          folders: { users: folderUrlOrId },
        })
      }
    }

    return {
      success: true,
      message: `ซิงก์สำเร็จ! พบรูปภาพ ${files.length} รายการ จับคู่ตรงกับระบบได้ ${matched.length} รายการ`,
      totalFound: files.length,
      matchedCount: matched.length,
      matched,
      unmatched,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการซิงก์"
    return {
      success: false,
      message: msg,
      totalFound: 0,
      matchedCount: 0,
      matched: [],
      unmatched: [],
    }
  }
}

/**
 * Parses batch text (e.g. copied from Google Drive or spreadsheet lines)
 * Formats supported:
 * "3ฒว2502: https://drive.google.com/file/d/..."
 * "3ฒว2502 \t https://drive.google.com/file/d/..."
 * "DRV-001, https://drive.google.com/file/d/..."
 */
export async function parseAndSaveBatchText(
  entityType: "vehicle" | "driver" | "user",
  rawText: string
): Promise<{ success: boolean; updatedCount: number; message: string }> {
  try {
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const mapping: Record<string, string> = {}

    for (const line of lines) {
      // Split by ':', '\t', or ','
      const parts = line.split(/[:\t,]+/)
      if (parts.length >= 2) {
        const id = parts[0].trim()
        const url = parts.slice(1).join(":").trim()
        if (id && url) {
          mapping[id] = formatGoogleDriveImageUrl(url)
        }
      }
    }

    const count = Object.keys(mapping).length
    if (count === 0) {
      return { success: false, updatedCount: 0, message: "ไม่พบข้อมูลที่ตรงตามรูปแบบ (ตัวอย่าง: 3ฒว2502: https://drive.google.com/...)" }
    }

    if (entityType === "vehicle") {
      await batchSaveEntityImages({ vehicles: mapping })
    } else if (entityType === "driver") {
      await batchSaveEntityImages({ drivers: mapping })
    } else if (entityType === "user") {
      await batchSaveEntityImages({ users: mapping })
    }

    return {
      success: true,
      updatedCount: count,
      message: `บันทึกรูปภาพเรียบร้อย ${count} รายการ`,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error parsing batch text"
    return { success: false, updatedCount: 0, message: msg }
  }
}
