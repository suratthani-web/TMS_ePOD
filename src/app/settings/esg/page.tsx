import { getEmissionFactorsList } from "@/lib/actions/esg-settings-actions"
import { ESGSettingsClient } from "./esg-settings-client"

export const metadata = {
    title: "ตั้งค่าพารามิเตอร์สิ่งแวดล้อม (ESG Settings) | TMS 2026",
    description: "ตั้งค่าและจัดการค่า Emission Factors ตามมาตรฐาน อบก."
}

export default async function ESGSettingsPage() {
    const list = await getEmissionFactorsList()

    return <ESGSettingsClient initialList={list} />
}
