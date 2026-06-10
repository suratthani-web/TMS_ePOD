'use client'

import { useState, useEffect } from "react"
import { 
    ShieldCheck, 
    ChevronRight, 
    Save, 
    Loader2, 
    RefreshCw, 
    ArrowLeft 
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { getAllRolePermissions, saveRolePermissions } from "@/lib/actions/permission-actions"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import Link from "next/link"
import { MODULE_GROUPS } from "@/constants/permissions"

const ROLES = ["Admin", "Manager", "Operation", "Finance", "Customer", "Driver"]

export default function PermissionsPage() {
    const [selectedRole, setSelectedRole] = useState("Admin")
    const [permissions, setPermissions] = useState<Record<string, string[]>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        loadPermissions()
    }, [])

    const loadPermissions = async () => {
        setLoading(true)
        try {
            const data = await getAllRolePermissions()
            const mapping: Record<string, string[]> = {}
            data.forEach((item: { role_name: string, allowed_menus: string[] }) => {
                // Database uses lowercase field names: role_name, allowed_menus
                // We normalize the role keys to match the ROLES array casing
                const roleKey = ROLES.find(r => r.toLowerCase() === item.role_name.toLowerCase()) || item.role_name
                mapping[roleKey] = item.allowed_menus
            })
            
            // Set default if empty for Admin
            if (!mapping["Admin"]) {
                mapping["Admin"] = MODULE_GROUPS.flatMap(g => g.items.map(i => i.key))
            }
            
            setPermissions(mapping)
        } catch (error) {
            toast.error("ไม่สามารถโหลดข้อมูลสิทธิ์ได้")
        } finally {
            setLoading(false)
        }
    }

    const handleTogglePermission = (key: string) => {
        setPermissions(prev => {
            const current = prev[selectedRole] || []
            const next = current.includes(key)
                ? current.filter(k => k !== key)
                : [...current, key]
            return { ...prev, [selectedRole]: next }
        })
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const allowedMenus = permissions[selectedRole] || []
            console.log("Saving permissions for:", selectedRole, allowedMenus)
            const result = await saveRolePermissions(selectedRole, allowedMenus)
            
            if (result.success) {
                toast.success(`บันทึกสิทธิ์สำหรับกลุ่ม ${selectedRole} เรียบร้อยแล้ว`)
            } else {
                console.error("Save failed result:", result)
                toast.error(`บันทึกไม่สำเร็จ: ${result.message || 'Unknown Error'}`, {
                    description: "รบกวนตรวจสอบ SUPABASE_SERVICE_ROLE_KEY ใน .env.local หรือติดต่อผู้ดูแลระบบ"
                })
            }
        } catch (error: unknown) {
            console.error("Save catch error:", error)
            toast.error("เกิดข้อผิดพลาดในการบันทึก", {
                description: error instanceof Error ? error.message : "Unknown error"
            })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <DashboardLayout>
                <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 bg-transparent">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <p className="text-slate-500 font-bold animate-pulse uppercase tracking-[0.2em]">กำลังซิงค์ข้อมูลสิทธิ์...</p>
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <div className="space-y-10 pb-20 p-4 lg:p-10">
                <Link href="/settings" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.4em] text-base font-bold group/back italic mb-2">
                    <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                    กลับหน้าตั้งค่า
                </Link>

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-background/60 backdrop-blur-3xl p-10 rounded-br-[6rem] rounded-tl-[3rem] border border-border shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
                    <div className="flex items-center gap-6 relative z-10">
                        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary shadow-inner border border-primary/20">
                            <ShieldCheck size={40} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-foreground tracking-tighter uppercase italic leading-none">ตั้งค่าสิทธิ์ผู้ใช้งาน</h1>
                            <p className="text-primary/80 font-bold mt-2 uppercase tracking-widest text-sm italic">การจัดการโมดูลตามกลุ่มพนักงาน</p>
                        </div>
                    </div>
                    <div className="flex gap-3 relative z-10">
                        <Button 
                            variant="outline"
                            onClick={loadPermissions}
                            className="h-16 px-6 rounded-2xl border-2 font-black uppercase active:scale-95 transition-all"
                        >
                            <RefreshCw size={20} />
                        </Button>
                        <Button 
                            disabled={saving}
                            onClick={handleSave}
                            className="h-16 px-10 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest shadow-xl shadow-primary/30 active:scale-95 transition-all gap-3"
                        >
                            {saving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                            บันทึกสิทธิ์ {selectedRole}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
                    {/* Role Selection Sidebar */}
                    <div className="lg:col-span-1 space-y-4">
                        <h3 className="px-4 text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-4">กลุ่มผู้ใช้งาน</h3>
                        {ROLES.map((role) => (
                            <button
                                key={role}
                                onClick={() => setSelectedRole(role)}
                                className={cn(
                                    "w-full h-16 px-6 rounded-2xl flex items-center justify-between font-black uppercase tracking-widest transition-all active:scale-95",
                                    selectedRole === role 
                                    ? "bg-primary text-white shadow-2xl shadow-primary/20 scale-[1.02]" 
                                    : "bg-background/40 text-slate-500 border border-border hover:bg-muted/50"
                                )}
                            >
                                {role}
                                <ChevronRight size={18} className={cn("transition-transform", selectedRole === role ? "rotate-90" : "")} />
                            </button>
                        ))}
                    </div>

                    {/* Permissions Grid */}
                    <div className="lg:col-span-3 space-y-10">
                        {MODULE_GROUPS.map((group) => (
                            <div key={group.title} className="space-y-6">
                                <div className="flex items-center gap-4 px-2">
                                    <div className="w-1.5 h-6 bg-accent rounded-full" />
                                    <h2 className="text-2xl font-black text-foreground uppercase italic tracking-tighter">{group.title}</h2>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {group.items.map((item) => {
                                        const isAllowed = (permissions[selectedRole] || []).includes(item.key)
                                        return (
                                            <div 
                                                key={item.key}
                                                onClick={() => handleTogglePermission(item.key)}
                                                className={cn(
                                                    "group p-6 rounded-3xl border-2 transition-all cursor-pointer flex items-center justify-between",
                                                    isAllowed 
                                                    ? "bg-card border-primary shadow-lg shadow-primary/5" 
                                                    : "bg-muted/30 border-transparent hover:border-border/20"
                                                )}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={cn(
                                                        "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                                                        isAllowed ? "bg-primary text-white" : "bg-muted text-slate-400 group-hover:bg-muted/80"
                                                    )}>
                                                        <item.icon size={22} />
                                                    </div>
                                                    <div>
                                                        <p className={cn(
                                                            "font-black text-lg leading-none transition-colors",
                                                            isAllowed ? "text-foreground" : "text-slate-400"
                                                        )}>
                                                            {item.label}
                                                        </p>
                                                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{item.key.split('.')[1]}</p>
                                                    </div>
                                                </div>
                                                <Checkbox 
                                                    checked={isAllowed}
                                                    onCheckedChange={() => handleTogglePermission(item.key)}
                                                    className="w-6 h-6 rounded-lg data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                                />
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}
