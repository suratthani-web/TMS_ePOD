// Amount → Thai words for printed documents, e.g. 9009 → "เก้าพันเก้าบาทถ้วน"

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const UNITS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

/** Reads an integer below one million (no "ล้าน"). `hasHigher`: digits exist above this group. */
function readBelowMillion(n: number, hasHigher: boolean): string {
    const s = String(n)
    let out = ''
    for (let i = 0; i < s.length; i++) {
        const d = Number(s[i])
        const pos = s.length - 1 - i
        if (d === 0) continue
        if (pos === 1 && d === 1) out += 'สิบ'
        else if (pos === 1 && d === 2) out += 'ยี่สิบ'
        else if (pos === 0 && d === 1 && (s.length > 1 || hasHigher)) out += 'เอ็ด'
        else out += DIGITS[d] + UNITS[pos]
    }
    return out
}

function readInteger(n: number): string {
    if (n === 0) return DIGITS[0]
    const parts: string[] = []
    let rest = n
    let level = 0
    // Split into groups of 6 digits; each higher group is followed by "ล้าน".
    while (rest > 0) {
        const group = rest % 1_000_000
        rest = Math.floor(rest / 1_000_000)
        if (group > 0) {
            parts.unshift(readBelowMillion(group, rest > 0) + 'ล้าน'.repeat(level))
        }
        level++
    }
    return parts.join('')
}

export function bahtText(amount: number): string {
    if (!Number.isFinite(amount)) return ''
    const negative = amount < 0
    const satangTotal = Math.round(Math.abs(amount) * 100)
    const baht = Math.floor(satangTotal / 100)
    const satang = satangTotal % 100
    let text = ''
    if (baht > 0) text += readInteger(baht) + 'บาท'
    if (satang > 0) text += readInteger(satang) + 'สตางค์'
    else text += (baht > 0 ? '' : 'ศูนย์บาท') + 'ถ้วน'
    return (negative ? 'ลบ' : '') + text
}
