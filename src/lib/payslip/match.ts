// ยูทิลิตี้ (ไม่ใช่ server action) สำหรับจับคู่ชื่อ sheet -> คนขับ และแยกชื่อไฟล์

export interface DriverLite {
  id: string
  rawId?: string
  name: string
  branch?: string | null
  type?: "driver" | "sub"
  subId?: string | null
  isSubOwner?: boolean
}

function norm(s?: string): string {
  return (s || "")
    .replace(/^นาย|^นางสาว|^นาง|^บจก\.?|^หจก\.?/g, "")
    .replace(/\s+/g, "")
    .replace(/[().\-_\d]/g, "") // ตัดตัวเลข เช่น พชรพล2 -> พชรพล
    .replace(/ษ์|ศ์|ฆ์|ธ์/g, "ก") // การันต์ออกเสียงคล้ายกัน สุรพงศ์/สุรพงษ์, สมพงศ์/สมพงษ์
    .replace(/ะ/g, "") // ธีระชาติ -> ธีรชาติ
    .trim()
    .toLowerCase()
}

/** เดา id จากชื่อ sheet หรือข้อความในหัวตาราง A1 */
export function suggestDriverId(
  sheetName: string,
  drivers: DriverLite[],
  extraText?: string
): string | null {
  const sName = norm(sheetName)
  const eText = extraText ? norm(extraText) : ""
  if (!sName && !eText) return null

  // 1) ตรงเป๊ะกับ sheetName (ให้ความสำคัญกับ target name หรือ rawId)
  for (const d of drivers) {
    const tn = norm(d.name)
    const tid = norm(d.rawId)
    if (sName === tn || sName === tid) return d.id
  }

  // 2) startsWith / startsWith กับ sheetName
  for (const d of drivers) {
    const tn = norm(d.name)
    if (tn.startsWith(sName) || sName.startsWith(tn)) return d.id
  }

  // 3) extraText (ข้อความจากเซลล์ A1 / หัวชีท เช่น "สง่า" หรือ "สุรศักดิ์")
  if (eText) {
    for (const d of drivers) {
      const tn = norm(d.name)
      const tid = norm(d.rawId)
      if (eText === tn || eText === tid) return d.id
      if (tn.startsWith(eText) || eText.startsWith(tn)) return d.id
    }
  }

  // 4) Inclusions (มีคำค้นเป็นส่วนหนึ่ง)
  for (const d of drivers) {
    const tn = norm(d.name)
    if (sName.length >= 3 && tn.includes(sName)) return d.id
    if (eText && eText.length >= 3 && tn.includes(eText)) return d.id
  }

  return null
}

/** แยกชื่อไฟล์ "รถร่วม_1-15.7.69_มหาชัย.xlsx" -> {prefix, period, branch, title} */
export function parseFileName(fileName: string): {
  prefix: string; period: string; branch: string; title: string
} {
  const base = fileName.replace(/\.(xlsx|xlsm|xls)$/i, "")
  const parts = base.split(/[_\-\s]+/).filter(Boolean)
  let period = ""
  let branch = ""
  const others: string[] = []
  for (const p of parts) {
    if (!period && /\d/.test(p)) period = p
    else others.push(p)
  }
  const prefix = others[0] || base
  branch = others.length > 1 ? others[others.length - 1] : ""
  const title = [prefix, period, branch ? `(${branch})` : ""].filter(Boolean).join(" ")
  return { prefix, period, branch, title: title || base }
}

