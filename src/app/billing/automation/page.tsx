'use client'

import { generateMonthlyBillingNotes, sendScheduledBillingEmails } from "@/lib/supabase/billing-automation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Loader2, Zap, Send, Settings, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react"
import { useState } from "react"
import { useLanguage } from "@/components/providers/language-provider"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import Link from "next/link"

export default function AutomationDashboard() {
    const { t } = useLanguage()
    const [generating, setGenerating] = useState(false)
    const [sending, setSending] = useState(false)
    const [lastGenCount, setLastGenCount] = useState<number | null>(null)
    const [lastSendCount, setLastSendCount] = useState<number | null>(null)

    const handleGenerate = async () => {
        setGenerating(true)
        const toastId = toast.loading(t('automation.toast_gen_loading'))
        try {
            const result = await generateMonthlyBillingNotes()
            if (result.success) {
                setLastGenCount(result.count ?? 0)
                toast.success(t('automation.toast_gen_success', { count: result.count ?? 0 }), { id: toastId })
            } else {
                throw new Error(result.error)
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('common.failed'), { id: toastId })
        } finally {
            setGenerating(false)
        }
    }

    const handleSend = async () => {
        setSending(true)
        const toastId = toast.loading(t('automation.toast_send_loading'))
        try {
            const result = await sendScheduledBillingEmails()
            if (result.success) {
                setLastSendCount(result.count ?? 0)
                toast.success(t('automation.toast_send_success', { count: result.count ?? 0 }), { id: toastId })
            } else {
                throw new Error(result.error)
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('common.failed'), { id: toastId })
        } finally {
            setSending(false)
        }
    }

    return (
        <DashboardLayout>
            <div className="p-4 lg:p-8 space-y-6 max-w-5xl mx-auto min-h-screen animate-in fade-in duration-700">
                <Link href="/billing/customer" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-bold mb-4 group">
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    กลับหน้าวางบิล
                </Link>

                <div className="flex items-center gap-4 mb-10">
                    <div className="p-4 bg-primary/10 rounded-[2rem] border border-primary/20 shadow-xl shadow-primary/5">
                        <Settings className="w-10 h-10 text-primary animate-spin-slow" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-foreground tracking-tighter uppercase italic">{t('automation.title')}</h1>
                        <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm opacity-70">{t('automation.description')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Generation Control */}
                    <Card className="border border-border transition-all group overflow-hidden relative rounded-[2.5rem] bg-card shadow-sm">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Zap className="w-24 h-24 text-yellow-500" />
                        </div>
                        <CardHeader className="p-8">
                            <CardTitle className="flex items-center gap-3 text-2xl font-black italic uppercase">
                                <div className="p-2 bg-yellow-500/10 rounded-xl">
                                    <Zap className="w-6 h-6 text-yellow-600" />
                                </div>
                                {t('automation.gen_title')}
                            </CardTitle>
                            <CardDescription className="pt-2 text-base font-medium">
                                {t('automation.gen_desc')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 pt-0 space-y-4">
                            <Button 
                                className="w-full h-16 text-lg font-black uppercase tracking-widest bg-amber-500 hover:bg-amber-600 text-white rounded-2xl"
                                onClick={handleGenerate}
                                disabled={generating}
                             >
                                {generating ? <Loader2 className="w-6 h-6 mr-3 animate-spin" /> : <Zap className="w-6 h-6 mr-3" />}
                                {t('automation.gen_btn')}
                            </Button>
                            {lastGenCount !== null && (
                                <div className="flex items-center justify-center gap-2 text-sm text-green-600 font-bold uppercase tracking-widest animate-in slide-in-from-top-2">
                                    <CheckCircle2 className="w-4 h-4" />
                                    {t('automation.last_run_gen', { count: lastGenCount })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Dispatch Control */}
                    <Card className="border border-border transition-all group overflow-hidden relative rounded-[2.5rem] bg-card shadow-sm">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <Send className="w-24 h-24 text-blue-500" />
                        </div>
                        <CardHeader className="p-8">
                            <CardTitle className="flex items-center gap-3 text-2xl font-black italic uppercase">
                                <div className="p-2 bg-blue-500/10 rounded-xl">
                                    <Send className="w-6 h-6 text-blue-600" />
                                </div>
                                {t('automation.send_title')}
                            </CardTitle>
                            <CardDescription className="pt-2 text-base font-medium">
                                {t('automation.send_desc')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 pt-0 space-y-4">
                            <Button 
                                className="w-full h-16 text-lg font-black uppercase tracking-widest bg-primary hover:bg-primary/90 text-white rounded-2xl"
                                onClick={handleSend}
                                disabled={sending}
                            >
                                {sending ? <Loader2 className="w-6 h-6 mr-3 animate-spin" /> : <Send className="w-6 h-6 mr-3" />}
                                {t('automation.send_btn')}
                            </Button>
                            {lastSendCount !== null && (
                                <div className="flex items-center justify-center gap-2 text-sm text-green-600 font-bold uppercase tracking-widest animate-in slide-in-from-top-2">
                                    <CheckCircle2 className="w-4 h-4" />
                                    {t('automation.last_run_send', { count: lastSendCount })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
                
                <Card className="bg-muted border border-border shadow-sm rounded-[3rem] mt-12 overflow-hidden">
                    <CardContent className="p-10">
                        <div className="flex items-start gap-6 mb-8">
                            <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                                <AlertCircle className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="font-black text-2xl italic uppercase tracking-tight text-foreground">{t('automation.setup_title')}</h3>
                                <p className="text-muted-foreground font-medium mt-1">
                                    {t('automation.setup_desc')}
                                </p>
                            </div>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="p-6 bg-background rounded-[2rem] border border-border">
                                <p className="text-xs font-black uppercase tracking-[0.3em] text-primary mb-3 italic">{t('automation.cron_example')}</p>
                                <code className="text-sm font-mono text-foreground block bg-muted p-4 rounded-xl border border-border overflow-x-auto">
                                    0 0 1 * * curl -X POST https://your-domain.com/api/cron/billing
                                </code>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    )
}
