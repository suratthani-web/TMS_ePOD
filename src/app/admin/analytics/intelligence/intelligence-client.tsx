"use client"

import type { ComponentProps } from "react"
import { BrainCircuit } from "lucide-react"
import { useLanguage } from "@/components/providers/language-provider"
import { PredictiveMaintenance } from "@/components/analytics/predictive-maintenance"
import { RouteRiskAnalysis } from "@/components/analytics/route-risk"
import { BranchFilter } from "@/components/dashboard/branch-filter"
import { AnalyticsSubHeader } from "@/components/analytics/analytics-subpage"

interface IntelligenceClientProps {
  vehicleRisks: ComponentProps<typeof PredictiveMaintenance>["risks"]
  routeRisks: ComponentProps<typeof RouteRiskAnalysis>["risks"]
  branchId: string
  superAdmin: boolean
}

const COPY = {
  th: { title: 'วิเคราะห์ความเสี่ยง AI', subtitle: 'คาดการณ์รถที่ควรเข้าซ่อมและเส้นทางที่มีความเสี่ยงจากข้อมูลจริงในระบบ' },
  en: { title: 'Risk Intelligence', subtitle: 'Predicted vehicle service needs and risky routes from system data' },
}

export function IntelligenceClient({ vehicleRisks, routeRisks, branchId, superAdmin }: IntelligenceClientProps) {
  const { language } = useLanguage()
  const c = COPY[language === 'en' ? 'en' : 'th']
  return (
    <div className="space-y-6">
      <AnalyticsSubHeader
        icon={BrainCircuit}
        title={c.title}
        subtitle={`${c.subtitle}${branchId && branchId !== 'All' ? ` · ${branchId}` : ''}`}
        right={<BranchFilter isSuperAdmin={superAdmin} />}
      />
      <PredictiveMaintenance risks={vehicleRisks} />
      <RouteRiskAnalysis risks={routeRisks} />
    </div>
  )
}
