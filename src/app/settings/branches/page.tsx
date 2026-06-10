"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Building, 
  Save, 
  ArrowLeft,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  CheckCircle2,
  Activity,
  Zap,
  ShieldCheck,
  Target
} from "lucide-react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { getAllBranches, updateBranchSettings, createBranch, deleteBranch } from "@/lib/supabase/branches"
import type { Branch } from "@/lib/supabase/branches"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLanguage } from "@/components/providers/language-provider"

export default function BranchSettingsPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newBranch, setNewBranch] = useState<Partial<Branch>>({
    Branch_ID: "",
    Branch_Name: "",
    Address: "",
    Phone: "",
    Email: "",
    Sender_Name: ""
  })
  const [editState, setEditState] = useState<Record<string, Branch>>({})

  const loadBranches = useCallback(async () => {
    setLoading(true)
    const data = await getAllBranches()
    const branchesData = data || []
    setBranches(branchesData)
    
    const initialEditState: Record<string, Branch> = {}
    branchesData.forEach(b => {
      initialEditState[b.Branch_ID] = { ...b }
    })
    setEditState(initialEditState)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadBranches()
  }, [loadBranches])

  const handleInputChange = (branchId: string, field: keyof Branch, value: string) => {
    setEditState(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId],
        [field]: value
      }
    }))
  }

  const handleSave = async (branchId: string) => {
    setSavingId(branchId)
    const settings = editState[branchId]
    const result = await updateBranchSettings(branchId, settings)
    
    if (result.success) {
      toast.success(t('settings_pages.branches.toasts.save_success'))
      router.refresh()
    } else {
      toast.error(t('settings_pages.branches.toasts.error') + result.error)
    }
    setSavingId(null)
  }

  const handleDelete = async (branchId: string) => {
    if (!confirm(t('settings_pages.branches.toasts.confirm_delete'))) return
    setDeletingId(branchId)
    const result = await deleteBranch(branchId)
    
    if (result.success) {
      toast.success(t('settings_pages.branches.toasts.delete_success'))
      setBranches(prev => prev.filter(b => b.Branch_ID !== branchId))
    } else {
      toast.error(t('settings_pages.branches.toasts.error') + result.error)
    }
    setDeletingId(null)
  }

  const handleCreateBranch = async () => {
    if (!newBranch.Branch_ID || !newBranch.Branch_Name) {
      toast.error(t('settings_pages.branches.toasts.required'))
      return
    }
    setCreating(true)
    try {
      const result = await createBranch(newBranch as Branch)
      if (result.success) {
        toast.success(t('settings_pages.branches.toasts.create_success'))
        setIsCreateDialogOpen(false)
        setNewBranch({ Branch_ID: "", Branch_Name: "", Address: "", Phone: "", Email: "", Sender_Name: "" })
        await loadBranches()
      } else {
        toast.error(t('settings_pages.branches.toasts.error') + result.error)
      }
    } catch (err) {
      console.error("Connection error:", err)
      toast.error(t('settings_pages.branches.toasts.conn_error'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-12 pb-20 p-4 lg:p-10">
        {/* Tactical Elite Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 bg-background/60 backdrop-blur-3xl p-10 rounded-br-[6rem] rounded-tl-[3rem] border border-border shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
            
            <div className="relative z-10 space-y-8">
                <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.1em] text-base font-bold group/back italic">
                    <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                    {t('common.back')}
                </button>
                <div className="flex items-center gap-6">
                    <div className="p-4 bg-primary/20 rounded-[2.5rem] border-2 border-primary/30 shadow-[0_0_40px_rgba(0,39,156,0.2)] text-primary group-hover:scale-110 transition-all duration-500">
                        <Building size={42} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-5xl font-black text-foreground tracking-tight uppercase leading-none italic premium-text-gradient">
                            {t('settings_pages.branches.title')}
                        </h1>
                        <p className="text-base font-bold font-black text-primary uppercase tracking-wide mt-2 opacity-80 italic">{t('settings_pages.branches.subtitle')}</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-end gap-6 relative z-10">
                <div className="bg-muted/50 border border-border px-6 py-3 rounded-2xl flex items-center gap-3 backdrop-blur-md">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(0,39,156,1)]" />
                    <span className="text-base font-bold font-black text-muted-foreground uppercase tracking-widest italic">{t('common.status')}: {t('common.success')}</span>
                </div>
                <PremiumButton 
                    onClick={() => setIsCreateDialogOpen(true)}
                    className="h-16 px-10 rounded-2xl bg-primary text-foreground border-0 shadow-[0_20px_50px_rgba(255,30,133,0.3)] gap-4 text-xl tracking-normal"
                >
                    <Plus size={20} /> {t('settings_pages.branches.add_branch')}
                </PremiumButton>
            </div>
        </div>

        {/* Advisory Matrix */}
        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           transition={{ delay: 1 }}
           className="mt-20 p-10 rounded-[3rem] bg-primary/5 border-2 border-primary/10 flex flex-col md:flex-row gap-10 items-center relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
          <div className="p-6 rounded-[2rem] bg-primary/20 text-primary border-2 border-primary/30 shadow-2xl animate-bounce">
            <CheckCircle2 size={32} />
          </div>
          <div className="space-y-4 text-center md:text-left">
            <p className="text-xl font-black text-primary italic uppercase tracking-widest">{t('settings_pages.branches.ui.tactical_advisory')}</p>
            <p className="text-xl font-bold text-muted-foreground leading-relaxed uppercase tracking-wider italic">
              {t('settings_pages.branches.ui.advisory_desc')}
            </p>
          </div>
          <PremiumButton variant="outline" className="h-14 px-10 rounded-2xl border-border text-foreground gap-3 uppercase font-black text-base font-bold tracking-[0.3em] ml-auto italic">
            <Target size={18} /> {t('settings_pages.branches.ui.sync_all')}
          </PremiumButton>
        </motion.div>

        {loading && branches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 gap-6 opacity-30">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-xl font-black text-foreground uppercase tracking-widest animate-pulse">{t('settings_pages.branches.loading')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-12">
            <AnimatePresence mode="popLayout">
              {branches.map((branch, index) => (
                <motion.div
                  key={branch.Branch_ID}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <PremiumCard className="bg-background/40 border-2 border-border shadow-3xl rounded-[4rem] overflow-hidden group/branch">
                    <div className="bg-muted/25 p-10 border-b border-border flex items-center justify-between relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] pointer-events-none" />
                      <div className="flex items-center gap-6 relative z-10">
                        <div className="p-4 rounded-[2rem] bg-primary/10 text-primary border border-primary/20 shadow-inner group-hover/branch:rotate-6 transition-transform duration-500">
                          <Building size={32} />
                        </div>
                        <div>
                          <h3 className="text-3xl font-black text-foreground tracking-tight uppercase italic group-hover/branch:text-primary transition-colors">{branch.Branch_Name}</h3>
                          <div className="flex items-center gap-3 mt-2">
                             <div className="px-5 py-1.5 rounded-xl bg-muted/50 text-base font-bold font-black text-primary uppercase tracking-[0.1em] border border-primary/20 shadow-lg italic">
                               NODE_ID: {branch.Branch_ID}
                             </div>
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)]" />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 relative z-10">
                        {savingId === branch.Branch_ID ? (
                          <div className="flex items-center gap-3 px-8 text-primary font-black uppercase text-base font-bold tracking-widest italic animate-pulse">
                            <Loader2 size={16} className="animate-spin" />
                            {t('settings_pages.branches.syncing')}
                          </div>
                        ) : (
                          <PremiumButton 
                            variant="outline"
                            className="h-14 px-8 rounded-2xl gap-3 text-emerald-400 border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500 hover:text-foreground transition-all shadow-xl italic"
                            onClick={() => handleSave(branch.Branch_ID)}
                          >
                            <Save size={18} /> {t('settings_pages.branches.save_changes')}
                          </PremiumButton>
                        )}
                        <PremiumButton 
                          variant="outline" 
                          size="icon"
                          disabled={deletingId === branch.Branch_ID}
                          className="h-14 w-14 rounded-2xl bg-rose-500/5 text-rose-500 border-rose-500/20 hover:bg-rose-600 hover:text-foreground transition-all shadow-xl"
                          onClick={() => handleDelete(branch.Branch_ID)}
                        >
                          {deletingId === branch.Branch_ID ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
                        </PremiumButton>
                      </div>
                    </div>

                    <div className="p-12 relative">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                        {/* Basic Info */}
                        <div className="space-y-10">
                          <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary border border-primary/20">
                                <Activity size={14} strokeWidth={2.5} />
                            </div>
                            <span className="text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground italic">{t('settings_pages.branches.hub_telemetry')}</span>
                          </div>
                          
                          <div className="space-y-8">
                             <div className="space-y-4">
                                <Label className="text-base font-bold font-black uppercase text-primary/60 tracking-[0.1em] ml-6">{t('settings_pages.branches.hub_designation')}</Label>
                                <Input 
                                  value={editState[branch.Branch_ID]?.Branch_Name || ""}
                                  onChange={(e) => handleInputChange(branch.Branch_ID, 'Branch_Name', e.target.value)}
                                  className="h-16 bg-muted/25 border-border rounded-[1.5rem] focus:border-primary/50 transition-all text-foreground font-black italic tracking-normal pl-8 shadow-inner"
                                />
                             </div>
                             <div className="space-y-4">
                                <Label className="text-base font-bold font-black uppercase text-primary/60 tracking-[0.1em] ml-6">{t('settings_pages.branches.coordinates')}</Label>
                                <Input 
                                  value={editState[branch.Branch_ID]?.Address || ""}
                                  onChange={(e) => handleInputChange(branch.Branch_ID, 'Address', e.target.value)}
                                  placeholder="Address protocol..."
                                  className="h-16 bg-muted/25 border-border rounded-[1.5rem] focus:border-primary/50 transition-all text-foreground font-black italic tracking-normal pl-8 shadow-inner"
                                />
                             </div>
                             <div className="space-y-4">
                                <Label className="text-base font-bold font-black uppercase text-primary/60 tracking-[0.1em] ml-6">{t('settings_pages.branches.comm_link')}</Label>
                                <Input 
                                  value={editState[branch.Branch_ID]?.Phone || ""}
                                  onChange={(e) => handleInputChange(branch.Branch_ID, 'Phone', e.target.value)}
                                  placeholder="Voice uplink..."
                                  className="h-16 bg-muted/25 border-border rounded-[1.5rem] focus:border-primary/50 transition-all text-foreground font-black italic tracking-normal pl-8 shadow-inner"
                                />
                             </div>
                          </div>
                        </div>

                        {/* Email Settings */}
                        <div className="space-y-10">
                          <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                                <Zap size={14} strokeWidth={2.5} />
                            </div>
                            <span className="text-[12px] font-black uppercase tracking-[0.1em] text-muted-foreground italic">{t('settings_pages.branches.signal_config')}</span>
                          </div>

                          <div className="space-y-8">
                             <div className="space-y-4">
                                <Label className="text-base font-bold font-black uppercase text-emerald-500/60 tracking-[0.1em] ml-6">{t('settings_pages.branches.sender_gateway')}</Label>
                                <Input 
                                  value={editState[branch.Branch_ID]?.Email || ""}
                                  onChange={(e) => handleInputChange(branch.Branch_ID, 'Email', e.target.value)}
                                  placeholder="node@logispro.io"
                                  className="h-16 bg-muted/25 border-border rounded-[1.5rem] focus:border-emerald-500/50 transition-all text-foreground font-black italic tracking-normal pl-8 shadow-inner"
                                />
                             </div>
                             <div className="space-y-4">
                                <Label className="text-base font-bold font-black uppercase text-emerald-500/60 tracking-[0.1em] ml-6">{t('settings_pages.branches.auth_sender')}</Label>
                                <Input 
                                  value={editState[branch.Branch_ID]?.Sender_Name || ""}
                                  onChange={(e) => handleInputChange(branch.Branch_ID, 'Sender_Name', e.target.value)}
                                  placeholder="LOGISPRO_COMMAND_UNIT"
                                  className="h-16 bg-muted/25 border-border rounded-[1.5rem] focus:border-emerald-500/50 transition-all text-foreground font-black italic tracking-normal pl-8 shadow-inner"
                                />
                             </div>
                          </div>
                          
                          <div className="p-10 rounded-[2.5rem] bg-emerald-500/5 border-2 border-emerald-500/10 shadow-inner group/intel relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-20">
                                <ShieldCheck size={40} className="text-emerald-500" />
                            </div>
                            <p className="text-lg font-bold font-black text-emerald-500/60 leading-relaxed uppercase tracking-widest italic relative z-10">
                              * THIS HUB CONFIGURATION OVERRIDES GLOBAL PROTOCOLS FOR AUTOMATED INTELLIGENCE REPORTS AND DIGITAL POD EMISSIONS.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </PremiumCard>
                </motion.div>
              ))}
            </AnimatePresence>

            {branches.length === 0 && !loading && (
              <div className="p-40 text-center opacity-20">
                <AlertCircle size={80} strokeWidth={1} className="mx-auto mb-8 text-primary animate-pulse" />
                <p className="text-xl font-black text-foreground uppercase tracking-widest font-black uppercase tracking-widest">Hub Network Void // No Operational Nodes</p>
              </div>
            )}
          </div>
        )}

        {/* Tactical Advisory */}
        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           transition={{ delay: 1 }}
           className="mt-20 p-10 rounded-[3rem] bg-primary/5 border-2 border-primary/10 flex flex-col md:flex-row gap-10 items-center relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
          <div className="p-6 rounded-[2rem] bg-primary/20 text-primary border-2 border-primary/30 shadow-2xl animate-bounce">
            <CheckCircle2 size={32} />
          </div>
          <div className="space-y-4 text-center md:text-left">
            <p className="text-xl font-black text-primary italic uppercase tracking-widest">{t('settings_pages.branches.ui.tactical_advisory')}</p>
            <p className="text-xl font-bold text-muted-foreground leading-relaxed uppercase tracking-wider italic">
              {t('settings_pages.branches.ui.advisory_desc')}
            </p>
          </div>
          <PremiumButton variant="outline" className="h-14 px-10 rounded-2xl border-border text-foreground gap-3 uppercase font-black text-base font-bold tracking-[0.3em] ml-auto italic">
            <Target size={18} /> {t('settings_pages.branches.ui.sync_all')}
          </PremiumButton>
        </motion.div>
      </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent className="bg-background border-border text-foreground max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 shadow-[0_40px_100px_rgba(0,0,0,1)] rounded-[3rem] sm:rounded-[4rem] backdrop-blur-3xl relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-primary animate-pulse shadow-[0_0_20px_rgba(255,30,133,1)]" />
                    
                    <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-10 space-y-6 custom-scrollbar">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black flex items-center gap-5 italic uppercase tracking-tight premium-text-gradient">
                <div className="p-4 rounded-[1.5rem] bg-primary/20 text-primary border-2 border-primary/30 shadow-2xl">
                  <Plus size={32} />
                </div>
                {t('settings_pages.branches.dialog.title_add')}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground font-black uppercase tracking-wide pt-4 italic">
                {t('settings_pages.branches.dialog.desc')}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-10">
              <div className="grid grid-cols-2 gap-10">
                <div className="space-y-3">
                  <Label className="text-base font-bold font-black uppercase text-muted-foreground tracking-tight ml-4">{t('settings_pages.branches.dialog.hub_id')}</Label>
                  <Input 
                    value={newBranch.Branch_ID || ""}
                    onChange={(e) => setNewBranch(prev => ({ ...prev, Branch_ID: e.target.value }))}
                    placeholder="e.g. ALPHA_01"
                    className="h-16 bg-muted/25 border-border rounded-[1.5rem] text-foreground font-black italic tracking-normal pl-8 shadow-inner"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-base font-bold font-black uppercase text-muted-foreground tracking-tight ml-4">{t('settings_pages.branches.dialog.hub_name')}</Label>
                  <Input 
                    value={newBranch.Branch_Name || ""}
                    onChange={(e) => setNewBranch(prev => ({ ...prev, Branch_Name: e.target.value }))}
                    placeholder="Hub name..."
                    className="h-14 bg-muted/25 border-border rounded-[1.5rem] text-foreground font-black italic tracking-normal pl-8 shadow-inner"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-bold font-black uppercase text-muted-foreground tracking-tight ml-4">{t('settings_pages.branches.coordinates')}</Label>
                <Input 
                  value={newBranch.Address || ""}
                  onChange={(e) => setNewBranch(prev => ({ ...prev, Address: e.target.value }))}
                  placeholder="Physical deployment site..."
                  className="h-14 bg-muted/25 border-border rounded-[1.5rem] text-foreground font-black italic tracking-normal pl-8 shadow-inner"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-base font-bold font-black uppercase text-muted-foreground tracking-tight ml-4">{t('settings_pages.branches.comm_link')}</Label>
                <Input 
                  value={newBranch.Phone || ""}
                  onChange={(e) => setNewBranch(prev => ({ ...prev, Phone: e.target.value }))}
                  placeholder="+T-PH-NODE-XXXX"
                  className="h-14 bg-muted/25 border-border rounded-[1.5rem] text-foreground font-black italic tracking-normal pl-8 shadow-inner"
                />
              </div>
            </div>
          </div>

            <DialogFooter className="p-6 sm:p-10 border-t border-border bg-muted/25 flex gap-4 sm:gap-6 shrink-0">
              <PremiumButton 
                variant="outline" 
                onClick={() => setIsCreateDialogOpen(false)}
                className="flex-1 h-14 sm:h-16 rounded-[1.2rem] sm:rounded-[1.5rem] border-border text-muted-foreground hover:text-foreground font-black uppercase tracking-widest italic"
              >
                {t('common.abort')}
              </PremiumButton>
              <PremiumButton 
                onClick={handleCreateBranch}
                disabled={creating}
                className="flex-1 h-14 sm:h-16 rounded-[1.5rem] sm:rounded-[2rem] bg-primary text-foreground font-black italic tracking-normal shadow-[0_20px_50px_rgba(255,30,133,0.3)] border-0"
              >
                {creating ? <Loader2 size={24} className="animate-spin" /> : t('settings_pages.branches.dialog.execute')}
              </PremiumButton>
            </DialogFooter>

        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}

