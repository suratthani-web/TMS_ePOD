// Thai national ID (เลขประจำตัวประชาชน 13 หลัก) — shared by client form and server actions.

/** Keep digits only: "1-2345-67890-12-3" → "1234567890123" */
export function normalizeThaiId(raw: unknown): string {
    return String(raw ?? '').replace(/\D/g, '')
}

/** 13 digits with a valid mod-11 check digit. */
export function isValidThaiId(raw: unknown): boolean {
    const id = normalizeThaiId(raw)
    if (!/^\d{13}$/.test(id)) return false
    let sum = 0
    for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i)
    return (11 - (sum % 11)) % 10 === Number(id[12])
}

/** "1234567890123" → "1-2345-67890-12-3" (anything else is returned as-is) */
export function formatThaiId(raw: unknown): string {
    const id = normalizeThaiId(raw)
    if (id.length !== 13) return String(raw ?? '')
    return `${id[0]}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id[12]}`
}
