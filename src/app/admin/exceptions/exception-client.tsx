"use client"

import { useState, useEffect } from "react"
import type { OperationalException } from "@/services/exception-center"
import { fetchExceptionsAction } from "./actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ShieldAlert, AlertTriangle, Wrench, Siren, RefreshCcw, Loader2, ArrowRight, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import { getUserBranchId } from "@/lib/permissions"
import Link from "next/link"
import { useLanguage } from "@/components/providers/language-provider"

export function ExceptionClient({ initialData }: { initialData: OperationalException[] }) {
    const { t } = useLanguage()
    const [exceptions, setExceptions] = useState(initialData)
    const [loading, setLoading] = useState(false)
    const [branchId, setBranchId] = useState<string>('All')

    const fetchExceptions = async () => {
        setLoading(true)
        try {
            const data = await fetchExceptionsAction(branchId)
            setExceptions(data)
        } catch {
            toast.error(t('common.toast.error_save'))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        getUserBranchId().then(id => {
            if (id) setBranchId(id)
        })
    }, [])

    useEffect(() => {
        fetchExceptions()
    }, [branchId])

    const getSeverityIcon = (severity: string) => {
        switch (severity) {
            case "CRITICAL": return <Siren className="w-6 h-6 text-destructive animate-pulse" />
            case "HIGH": return <ShieldAlert className="w-6 h-6 text-orange-500" />
            default: return <Wrench className="w-6 h-6 text-warning" />
        }
    }

    const getTypeBadge = (type: string) => {
        switch (type) {
            case "SOS_JOB": return <Badge variant="destructive" className="font-bold">SOS ALERT</Badge>
            case "FAILED_JOB": return <Badge variant="destructive" className="bg-orange-600">FAILED</Badge>
            case "FLEET_ALERT": return <Badge variant="secondary" className="bg-amber-500 hover:bg-amber-600 text-white border-transparent">FLEET ANOMALY</Badge>
            case "REPAIR_TICKET": return <Badge variant="secondary">MAINTENANCE</Badge>
            default: return <Badge>{type}</Badge>
        }
    }

    const getActionLink = (exception: OperationalException) => {
        switch (exception.type) {
            case "SOS_JOB":
            case "FAILED_JOB":
                return `/admin/jobs/${exception.entityId}`
            case "FLEET_ALERT":
                return `/admin/monitoring` // Or specific fleet page
            case "REPAIR_TICKET":
                return `/admin/damage-reports`
            default:
                return "#"
        }
    }

    return (
        <div className="p-6 space-y-6 bg-background min-h-screen">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black uppercase tracking-tighter text-destructive flex items-center gap-2">
                        <AlertTriangle className="w-6 h-6" />
                        {t('dashboard.exceptions.title')}
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium">{t('dashboard.exceptions.subtitle')}</p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchExceptions} disabled={loading} className="font-bold uppercase tracking-widest text-[10px]">
                    {loading ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <RefreshCcw className="w-3 h-3 mr-2" />}
                    {t('common.sync_active')}
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-t-4 border-t-destructive bg-destructive/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-widest opacity-80">{t('dashboard.exceptions.active_sos')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-destructive">
                            {exceptions.filter((e) => e.type === "SOS_JOB").length}
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-t-4 border-t-orange-500 bg-orange-500/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-widest opacity-80">{t('dashboard.exceptions.failed_jobs')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-orange-500">
                            {exceptions.filter((e) => e.type === "FAILED_JOB").length}
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-t-4 border-t-amber-500 bg-amber-500/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-widest opacity-80">{t('dashboard.exceptions.fleet_anomalies')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-amber-500">
                            {exceptions.filter((e) => e.type === "FLEET_ALERT").length}
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-t-4 border-t-blue-500 bg-blue-500/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold uppercase tracking-widest opacity-80">{t('dashboard.exceptions.pending_repairs')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-blue-500">
                            {exceptions.filter((e) => e.type === "REPAIR_TICKET").length}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-none shadow-sm overflow-hidden border border-border">
                <div className="bg-card p-4 border-b flex items-center justify-between">
                    <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                        <Siren className="w-4 h-4 text-destructive" />
                        {t('dashboard.exceptions.live_feed')}
                    </h3>
                    <Badge variant="outline" className="text-[10px] opacity-60">{t('dashboard.exceptions.realtime')}</Badge>
                </div>
                <CardContent className="p-0 text-foreground bg-card/50">
                    <div className="divide-y divide-border/50">
                        {exceptions.length === 0 && !loading && (
                            <div className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                                <CheckCircle className="w-12 h-12 text-green-500 opacity-20" />
                                <p className="font-bold">{t('dashboard.exceptions.no_exceptions')}</p>
                            </div>
                        )}

                        {loading && exceptions.length === 0 && (
                            <div className="p-12 text-center flex justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-primary opacity-50" />
                            </div>
                        )}

                        {exceptions.map((exception, idx) => (
                            <div key={`${exception.id}-${idx}`} className="p-4 flex items-start justify-between hover:bg-muted transition-colors">
                                <div className="flex gap-4">
                                    <div className="mt-1">{getSeverityIcon(exception.severity)}</div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {getTypeBadge(exception.type)}
                                            <span className="font-black text-sm">{exception.title}</span>
                                            <span className="text-xs text-muted-foreground border-l pl-2">{new Date(exception.timestamp).toLocaleString()}</span>
                                        </div>
                                        <p className="text-sm font-medium opacity-90">{exception.description}</p>
                                        <div className="flex gap-4 text-xs text-muted-foreground font-mono bg-background p-2 rounded w-fit border">
                                            <span><strong className="uppercase">{t('dashboard.exceptions.ref')}:</strong> {exception.entityId}</span>
                                            <span><strong className="uppercase">{t('dashboard.exceptions.entity')}:</strong> {exception.entityName}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="pl-4">
                                    <Button size="sm" asChild className="h-9 font-bold uppercase tracking-wider text-[10px]">
                                        <Link href={getActionLink(exception)}>
                                            {t('dashboard.exceptions.respond')}
                                            <ArrowRight className="w-3 h-3 ml-2" />
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
