"use client"

import type { ComponentProps } from "react"
import Link from "next/link"
import { ArrowLeft, BrainCircuit, Cpu, Target, Gauge } from "lucide-react"
import { PredictiveMaintenance } from "@/components/analytics/predictive-maintenance"
import { RouteRiskAnalysis } from "@/components/analytics/route-risk"
import { BranchFilter } from "@/components/dashboard/branch-filter"

interface IntelligenceClientProps {
  vehicleRisks: ComponentProps<typeof PredictiveMaintenance>["risks"]
  routeRisks: ComponentProps<typeof RouteRiskAnalysis>["risks"]
  branchId: string
  superAdmin: boolean
}

export function IntelligenceClient({ 
  vehicleRisks, 
  routeRisks, 
  branchId, 
  superAdmin 
}: IntelligenceClientProps) {
  return (
    <div className="space-y-8 pb-20">
      {/* Tactical Header */}
      <div className="bg-background/60 backdrop-blur-3xl p-8 rounded-3xl border border-border/5 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative z-10">
          <div className="space-y-4">
            <Link href="/admin/analytics" className="inline-flex items-center gap-2 text-muted-foreground hover:text-purple-400 transition-all font-black uppercase tracking-[0.4em] text-xs font-bold group/back italic">
              <ArrowLeft className="w-3.5 h-3.5 group-hover/back:-translate-x-1 transition-transform" /> 
              STRATEGIC_INTELLIGENCE
            </Link>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/20 rounded-2xl border-2 border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.2)] text-purple-400">
                <BrainCircuit size={28} strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="text-3xl lg:text-4xl font-black text-foreground tracking-widest uppercase leading-none italic premium-text-gradient">Neural Advisory</h1>
                <p className="text-[10px] font-black text-purple-400 uppercase tracking-[0.6em] mt-1 opacity-80 italic">AI Predictive Analytics & Risk Assessment {branchId && branchId !== 'All' ? `// ${branchId}` : ''}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-muted/50 border border-border/10 p-2 rounded-2xl backdrop-blur-xl scale-90 origin-right">
              <BranchFilter isSuperAdmin={superAdmin} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Content Area */}
          <div className="lg:col-span-12 space-y-12">
              {/* Section 1: Predictive Maintenance (Vehicles) */}
              <section className="space-y-6 group/maintenance">
                  <div className="flex items-center gap-4 px-2">
                      <div className="p-2 bg-amber-500/20 rounded-xl text-amber-500 border border-amber-500/30 group-hover/maintenance:rotate-12 transition-transform duration-500">
                          <Gauge size={20} />
                      </div>
                      <div>
                          <h2 className="text-xl font-black text-foreground tracking-widest uppercase italic leading-none">Fleet Health Matrix</h2>
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mt-1 italic">Predictive maintenance & wear analytics</p>
                      </div>
                      <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                  </div>
                  <div className="bg-background/40 p-0.5 rounded-2xl border border-border/5 shadow-xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-80 h-full bg-amber-500/[0.02] blur-3xl pointer-events-none" />
                    <PredictiveMaintenance risks={vehicleRisks} />
                  </div>
              </section>

              {/* Section 2: Route Risk Analysis (Operations) */}
              <section className="space-y-6 group/routes">
                  <div className="flex items-center gap-4 px-2">
                      <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400 border border-blue-500/30 group-hover/routes:rotate-12 transition-transform duration-500">
                          <Target size={20} />
                      </div>
                      <div>
                          <h2 className="text-xl font-black text-foreground tracking-widest uppercase italic leading-none">Route Threat Assessment</h2>
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.4em] mt-1 italic">Operational risk profiling & anomaly detection</p>
                      </div>
                      <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                  </div>
                  <div className="bg-background/40 p-0.5 rounded-2xl border border-border/5 shadow-xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-80 h-full bg-blue-500/[0.02] blur-3xl pointer-events-none" />
                    <RouteRiskAnalysis risks={routeRisks} />
                  </div>
              </section>
          </div>
      </div>

      {/* Strategic Advisory Footnote */}
      <div className="py-16 border-t border-border/5 flex flex-col items-center opacity-30 hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-4 mb-4">
              <Cpu size={20} className="text-purple-500" />
              <div className="h-px w-48 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <BrainCircuit size={20} className="text-primary" />
          </div>
          <p className="text-[9px] font-black text-white uppercase tracking-[0.8em] italic mb-4">Neural Advisory Core // v10.4-TACTICAL</p>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest italic leading-relaxed text-center max-w-2xl px-8">
              All risk vectors are computed via real-time telemetry ingestion. <br />
              Neural processing accuracy is maintained through continuous learning loops and regional node feedback.
          </p>
      </div>
    </div>
  )
}
