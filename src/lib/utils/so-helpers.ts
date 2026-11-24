export interface DestinationDrop {
  drop: number
  name: string
  so_no: string
  lat?: number | null
  lng?: number | null
}

/**
 * Safely parses raw destination data (JSON string or array) into normalized
 * DestinationDrop objects. Never throws.
 */
export function parseDestinationDrops(raw: unknown): DestinationDrop[] {
  let v = raw
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    const trimmed = v.trim()
    if (!trimmed) return []
    try {
      v = JSON.parse(trimmed)
    } catch {
      return []
    }
  }
  if (!Array.isArray(v)) return []

  return v.map((item, idx) => {
    const d = (item && typeof item === 'object' ? item : {}) as {
      name?: unknown
      destination?: unknown
      so_no?: unknown
      lat?: unknown
      lng?: unknown
    }
    const name = String(d?.name || d?.destination || '').trim()
    const so_no = d?.so_no ? String(d.so_no).trim() : ''
    const latNum = d?.lat !== null && d?.lat !== undefined && d?.lat !== '' ? Number(d.lat) : null
    const lngNum = d?.lng !== null && d?.lng !== undefined && d?.lng !== '' ? Number(d.lng) : null
    return {
      drop: idx + 1,
      name,
      so_no,
      ...(latNum !== null && Number.isFinite(latNum) ? { lat: latNum } : {}),
      ...(lngNum !== null && Number.isFinite(lngNum) ? { lng: lngNum } : {}),
    }
  })
}

/**
 * Extracts all non-empty trimmed so_no values from destination drops,
 * deduplicated in order. Falls back to fallbackRefNo if empty.
 */
export function extractSoNumbers(rawDestinations: unknown, fallbackRefNo?: unknown): string[] {
  const drops = parseDestinationDrops(rawDestinations)
  const seen = new Set<string>()
  const result: string[] = []

  for (const drop of drops) {
    if (drop.so_no && !seen.has(drop.so_no)) {
      seen.add(drop.so_no)
      result.push(drop.so_no)
    }
  }

  if (result.length === 0 && typeof fallbackRefNo === 'string') {
    const ref = fallbackRefNo.trim()
    if (ref) return [ref]
  } else if (result.length === 0 && fallbackRefNo != null && fallbackRefNo !== '') {
    const ref = String(fallbackRefNo).trim()
    if (ref) return [ref]
  }

  return result
}

/**
 * Formats extracted SO numbers as a comma-separated label.
 */
export function formatSoLabel(rawDestinations: unknown, fallbackRefNo?: unknown): string {
  return extractSoNumbers(rawDestinations, fallbackRefNo).join(', ')
}
