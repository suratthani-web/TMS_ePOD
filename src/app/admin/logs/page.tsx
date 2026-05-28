import { getSystemLogs } from '@/lib/supabase/logs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { getAllBranches } from '@/lib/supabase/branches'
import { Input } from '@/components/ui/input'
import { Search, ArrowLeft, ShieldCheck, Activity, Cpu, Target, Clock, User, HardDrive, Terminal } from 'lucide-react'
import LinkNext from 'next/link'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { PremiumCard } from '@/components/ui/premium-card'
import { PremiumButton } from '@/components/ui/premium-button'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function LogsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams
  const branchId = typeof searchParams.branchId === 'string' ? searchParams.branchId : undefined
  const moduleFilter = typeof searchParams.module === 'string' ? searchParams.module : undefined
  
  let logs: any[] = []
  let branches: { Branch_ID: string; Branch_Name: string }[] = []

  try {
    logs = await getSystemLogs({
      branchId,
      module: moduleFilter,
      limit: 100
    })
    branches = (await getAllBranches()) ?? []
  } catch {
    // Error fetching logs data
  }

  const getActionStyle = (action: string) => {
    switch (action.toUpperCase()) {
      case 'CREATE':
        return { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/20', label: 'CREATE_ops' }
      case 'UPDATE':
        return { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20', label: 'SYNC_update' }
      case 'DELETE':
        return { bg: 'bg-rose-500/10', text: 'text-rose-500', border: 'border-rose-500/20', label: 'VOID_deletion' }
      case 'APPROVE':
        return { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20', label: 'AUTH_approval' }
      case 'EXPORT':
        return { bg: 'bg-indigo-500/10', text: 'text-indigo-500', border: 'border-indigo-500/20', label: 'EXPORT_stream' }
      case 'LOGIN':
        return { bg: 'bg-slate-500/10', text: 'text-muted-foreground', border: 'border-border/5', label: 'AUTH_uplink' }
      case 'LOGOUT':
        return { bg: 'bg-slate-800/20', text: 'text-muted-foreground', border: 'border-border/5', label: 'AUTH_downlink' }
      default:
        return { bg: 'bg-muted/50', text: 'text-muted-foreground', border: 'border-border/5', label: action }
    }
  }

  const getModuleLabel = (module: string) => {
    switch (module) {
      case 'Jobs': return 'MISSION_VECTOR'
      case 'Auth': return 'ACCESS_security'
      case 'Billing': return 'LEDGER_finance'
      case 'Reports': return 'INTEL_reporting'
      case 'Fuel': return 'ENERGY_telemetry'
      case 'Maintenance': return 'ASSET_integrity'
      case 'Settings': return 'CONFIG_terminal'
      case 'Users': return 'PERSONNEL_registry'
      default: return module.toUpperCase()
    }
  }

  return (
    <div className="space-y-12 pb-20 p-4 lg:p-10 bg-background">
      {/* Tactical Audit Header */}
      <div className="bg-background/60 backdrop-blur-3xl p-10 rounded-br-[6rem] rounded-tl-[3rem] border border-border/5 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-80 h-80 bg-slate-500/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-12">
              <div className="space-y-6">
                <LinkNext href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground font-bold group/back italic">
                    <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                    Command Central
                </LinkNext>
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-muted/50 rounded-[2.5rem] border-2 border-border/10 shadow-[0_0_40px_rgba(255,255,255,0.05)] text-foreground group-hover:scale-110 transition-all duration-500">
                      <Terminal size={40} strokeWidth={2.5} />
                    </div>
                    <div>
                      <h1 className="text-5xl font-black text-foreground tracking-widest uppercase leading-none italic premium-text-gradient">Audit Registry</h1>
                      <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.6em] mt-2 opacity-80 italic">Registry of all logistical & administrative transmissions // SECURE_AUDIT</p>
                    </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-3 self-end lg:self-center relative z-10">
                <div className="bg-muted/50 border border-border/5 px-6 py-3 rounded-2xl flex items-center gap-3 backdrop-blur-md">
                    <Activity className="text-muted-foreground" size={16} />
                    <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">Live Audit Feed: ACTIVE</span>
                </div>
              </div>
          </div>
      </div>

      <PremiumCard className="bg-background/40 border-2 border-border/5 shadow-3xl rounded-[4rem] overflow-hidden group/logs">
        <div className="p-10 border-b border-border/5 bg-black/40 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-10">
          <div className="absolute top-0 left-0 w-80 h-80 bg-muted/50 blur-[100px] pointer-events-none" />
          
          <div className="flex items-center gap-5 relative z-10">
              <div className="p-4 bg-muted/50 rounded-2xl text-muted-foreground border border-border/10 shadow-inner group-hover/logs:rotate-12 transition-transform duration-500">
                <HardDrive size={28} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-foreground tracking-[0.2em] uppercase italic">System Transmissions</h2>
                <p className="text-base font-bold font-black text-muted-foreground uppercase tracking-[0.5em] mt-2 italic">100_LATEST_PACKETS_SYNCED</p>
              </div>
          </div>

          <div className="relative z-10 w-full md:w-96 group/search">
            <Search size={22} className="absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within/search:text-white transition-colors" />
            <input 
              placeholder="SCAN_OPERATOR_OR_NODE..." 
              className="w-full h-18 bg-background border-border/5 rounded-3xl pl-16 pr-8 text-lg font-bold font-black uppercase tracking-[0.2em] focus:border-border/20 transition-all text-foreground placeholder:text-muted-foreground italic shadow-inner"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-black/40 border-b border-border/5 hover:bg-black/40">
                <TableHead className="p-10 text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] italic">Temporal Token</TableHead>
                <TableHead className="p-10 text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] italic">Operator Entity</TableHead>
                <TableHead className="p-10 text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] italic">Source Node</TableHead>
                <TableHead className="p-10 text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] italic">Module Logic</TableHead>
                <TableHead className="p-10 text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] italic">Transmission Type</TableHead>
                <TableHead className="p-10 text-base font-bold font-black text-muted-foreground uppercase tracking-[0.4em] italic">Intel Narrative</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-white/[0.02]">
              {logs.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-40 text-center opacity-20">
                    <ShieldCheck size={80} strokeWidth={1} className="mx-auto mb-8 text-muted-foreground animate-pulse" />
                    <p className="text-xl font-black text-white uppercase tracking-[0.8em]">Registry Quiescent // No Packets Detected</p>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const actionStyle = getActionStyle(log.action_type)
                  const date = new Date(log.created_at)

                  return (
                    <TableRow key={log.id} className="group/row hover:bg-muted/30 transition-colors border-0">
                      <TableCell className="p-10">
                        <div className="flex flex-col">
                          <span className="text-white font-black tracking-tight text-xl uppercase italic group-hover/row:text-primary transition-colors">
                            {format(date, 'dd MMM yyyy', { locale: th })}
                          </span>
                          <span className="text-base font-bold text-muted-foreground font-black uppercase tracking-widest mt-1">
                            {format(date, 'HH:mm:ss')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="p-10">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-2xl bg-muted/50 flex items-center justify-center text-primary group-hover/row:scale-110 group-hover/row:bg-primary/20 transition-all duration-500 shadow-inner border border-border/5">
                            <span className="font-black italic text-lg font-bold">{(log.user_name || "A").charAt(0)}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-black text-white text-xl tracking-widest uppercase italic">{log.user_name}</span>
                            <span className="text-base font-bold text-muted-foreground font-black uppercase tracking-widest">{log.role}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="p-10">
                        <div className="px-4 py-1.5 bg-muted/50 rounded-xl border border-border/5 text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic w-fit">
                          {log.branch_id || 'GLOBAL_ROOT'}
                        </div>
                      </TableCell>
                      <TableCell className="p-10 font-black text-emerald-500 text-base font-bold uppercase tracking-widest italic">{getModuleLabel(log.module)}</TableCell>
                      <TableCell className="p-10">
                        <div className={cn("px-5 py-2 rounded-full text-base font-bold font-black border uppercase tracking-widest italic shadow-lg transition-transform group-hover/row:translate-x-2", actionStyle.bg, actionStyle.text, actionStyle.border)}>
                          {actionStyle.label}
                        </div>
                      </TableCell>
                      <TableCell className="p-10 max-w-[300px]">
                        <div className="flex items-center gap-3">
                           {log.target_id && <span className="text-primary font-black text-base font-bold uppercase italic bg-primary/10 px-2 py-0.5 rounded-md">[{log.target_id}]</span>}
                           <span className="truncate text-base font-bold font-bold text-muted-foreground group-hover/row:text-muted-foreground transition-colors italic" title={JSON.stringify(log.details)}>
                              {JSON.stringify(log.details)}
                           </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </PremiumCard>

      {/* Global Tactical Advisory */}
      <div className="mt-20 p-12 rounded-[3.5rem] bg-muted/50 border-2 border-border/5 flex flex-col md:flex-row gap-10 items-center relative overflow-hidden opacity-40 hover:opacity-100 transition-opacity">
          <div className="absolute top-0 right-0 w-80 h-full bg-gradient-to-l from-white/5 to-transparent pointer-events-none" />
          <div className="p-6 rounded-[2rem] bg-muted/80 text-foreground border-2 border-border/20 shadow-2xl">
              <Cpu size={32} />
          </div>
          <div className="space-y-4 text-center md:text-left flex-1">
              <p className="text-xl font-black text-white italic uppercase tracking-widest">REGISTRY_INTEGRITY_ADVISORY</p>
              <p className="text-xl font-bold text-muted-foreground leading-relaxed uppercase tracking-wider italic">
                  Audit streams are persistent and immutable. All field operations are logged with zero-latency synchronization. <br />
                  Strategic deletions or unauthorized access attempts are flagged for immediate counter-intelligence review.
              </p>
          </div>
          <PremiumButton variant="outline" className="h-14 px-10 rounded-2xl border-border/10 text-foreground font-bold tracking-[0.3em] ml-auto italic">
              <Target size={18} /> FULL_SYNC_REGISTRY
          </PremiumButton>
      </div>
    </div>
  )
}

