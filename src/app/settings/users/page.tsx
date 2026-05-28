"use client"

import { useState, useEffect, useCallback } from "react"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Users, Plus, Edit, Trash2, Search, Loader2, Shield, Fingerprint, Activity, FileSpreadsheet, Key, ShieldCheck, ArrowLeft } from "lucide-react"
import { createUser, updateUser, deleteUser, UserData, getCurrentUserRole, createBulkUsers, getUsers } from "@/lib/actions/user-actions"
import { Customer } from "@/lib/supabase/customers"
import { fetchCustomerList } from "@/lib/actions/customer-fetcher"
import { ExcelImport } from "@/components/ui/excel-import"
import { Checkbox } from "@/components/ui/checkbox"
import { MODULE_GROUPS } from "@/constants/permissions"
import { useBranch } from "@/components/providers/branch-provider"
import { STANDARD_ROLES, StandardRole } from "@/types/role"
import { getRolePermissions } from "@/lib/actions/permission-actions"
import { toast } from "sonner"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

export default function UserSettingsPage() {
    const { branches, selectedBranch } = useBranch()
    const { t } = useLanguage()
    const router = useRouter()
    const [userList, setUserList] = useState<(UserData & { Master_Customers?: { Customer_Name: string } | null })[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [currentRoleId, setCurrentRoleId] = useState<number | null>(null)
    
    const [loading, setLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")

    const [allRolePermissions, setAllRolePermissions] = useState<Record<string, Record<string, boolean>>>({})
    
    const [editingUser, setEditingUser] = useState<string | null>(null)
    const [formData, setFormData] = useState<Partial<UserData>>({
        Username: "",
        Password: "",
        Name: "",
        Branch_ID: "",
        Role: "Staff", 
        Active_Status: "Active",
        Customer_ID: null,
        Permissions: []
    })
    const [useIndividualPermissions, setUseIndividualPermissions] = useState(false)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const usersData = await getUsers(selectedBranch === 'All' ? undefined : selectedBranch)
            
            const [customersResult, userInfo, rolesResult] = await Promise.all([
                fetchCustomerList(),
                getCurrentUserRole(),
                getRolePermissions()
            ])

            setUserList(usersData || [])
            setCustomers(customersResult.data || [])
            setCurrentRoleId(userInfo?.roleId || 3)

            if (rolesResult.success && rolesResult.data) {
                const perms: Record<string, Record<string, boolean>> = {}
                rolesResult.data.forEach((r: any) => {
                    perms[r.Role] = r.Permissions
                })
                setAllRolePermissions(perms)
            }
        } finally {
            setLoading(false)
        }
    }, [selectedBranch])

    useEffect(() => {
        loadData()
    }, [loadData])

    const handleOpenDialog = (user?: UserData) => {
        if (user) {
            setEditingUser(user.Username)
            setFormData({
                Username: user.Username,
                Password: "",
                Name: user.Name,
                Branch_ID: user.Branch_ID || "",
                Role: (user.Role as StandardRole) || "Staff",
                Active_Status: user.Active_Status,
                Customer_ID: user.Customer_ID,
                Permissions: Array.isArray(user.Permissions) ? user.Permissions : []
            })
            setUseIndividualPermissions(Array.isArray(user.Permissions) && user.Permissions.length > 0)
        } else {
            setEditingUser(null)
            const defaultRole = "Staff"
            setFormData({
                Username: "",
                Password: "",
                Name: "",
                Branch_ID: selectedBranch && selectedBranch !== 'All' ? selectedBranch : "",
                Role: defaultRole, 
                Active_Status: "Active",
                Customer_ID: null,
                Permissions: []
            })
            setUseIndividualPermissions(false)
        }
        setIsDialogOpen(true)
    }

    const handleRoleChange = (role: string) => {
        const standardRole = role as StandardRole
        setFormData(prev => ({
            ...prev,
            Role: standardRole,
            Branch_ID: standardRole === 'Super Admin' ? 'All' : (prev.Branch_ID === 'All' ? '' : prev.Branch_ID),
            Customer_ID: standardRole === 'Customer' ? prev.Customer_ID : null, // Reset if not customer
            Permissions: useIndividualPermissions ? prev.Permissions : []
        }))
    }

    const handleToggleIndividualPermission = (key: string) => {
        setFormData(prev => {
            const current = Array.isArray(prev.Permissions) ? prev.Permissions : []
            const next = current.includes(key)
                ? current.filter(k => k !== key)
                : [...current, key]
            return { ...prev, Permissions: next }
        })
    }



    const handleSave = async () => {
        const isSuperAdminRole = formData.Role === 'Super Admin'
        if (!formData.Username || !formData.Name || !formData.Role || (!isSuperAdminRole && !formData.Branch_ID)) {
            return toast.warning("กรุณากรอกข้อมูลให้ครบถ้วน")
        }

        // Enforce Customer Link for Customer Role
        if (formData.Role === 'Customer' && !formData.Customer_ID) {
            return toast.warning("กรุณาเลือกชื่อลูกค้าที่ต้องการผูกกับบัญชีนี้ ในหัวข้อด้านล่าง")
        }

        if (!editingUser && !formData.Password) {
            return toast.warning("กรุณากำหนดรหัสผ่าน")
        }
        setSaving(true)
        try {
            let result;
            const payload = { ...formData }
            if (isSuperAdminRole && (!payload.Branch_ID || payload.Branch_ID === "")) {
                payload.Branch_ID = 'All'
            }

            if (editingUser) {
                const updateData = { ...payload }
                if (!updateData.Password) delete updateData.Password
                result = await updateUser(editingUser, updateData)
            } else {
                result = await createUser(payload as UserData)
            }
            if (result.success) {
                toast.success(editingUser ? "แก้ไขข้อมูลเรียบร้อย" : "สร้างผู้ใช้งานเรียบร้อย")
                setIsDialogOpen(false)
                loadData()
            } else {
                toast.error("เกิดข้อผิดพลาด: " + (result.error || "ไม่สามารถบันทึกข้อมูลได้"))
            }
        } catch (e) {
            const error = e as Error
            toast.error("เกิดข้อผิดพลาดทางเทคนิค: " + (error.message || "Unknown error"))
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async (username: string) => {
        if (!confirm(`คุณต้องการลบผู้ใช้ ${username} ใช่หรือไม่?`)) return
        await deleteUser(username)
        loadData()
    }

    const filteredUsers = userList.filter(u => 
        u.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.Username?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <DashboardLayout>
            <div className="space-y-8 pb-20 p-4 lg:p-10">
                {/* Tactical Registry Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-background/60 backdrop-blur-3xl p-8 rounded-3xl border border-border/5 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-primary/10 blur-[120px] rounded-full -mr-40 -mt-40 pointer-events-none" />
                    
                    <div className="relative z-10 space-y-4">
                        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all font-black uppercase tracking-[0.1em] text-[10px] font-bold group/back italic leading-none">
                            <ArrowLeft className="w-3.5 h-3.5 group-hover/back:-translate-x-1 transition-transform" /> 
                            ย้อนกลับ
                        </button>
                        <div className="flex items-center gap-4">
                            <div className="p-2 bg-primary/20 rounded-xl border-2 border-primary/30 shadow-[0_0_20px_rgba(255,30,133,0.2)] text-primary group-hover:scale-110 transition-all duration-500">
                                <Users size={24} strokeWidth={2.5} />
                            </div>
                            <div>
                                <h1 className="text-3xl lg:text-4xl font-black text-foreground uppercase leading-none italic premium-text-gradient">
                                    {t('settings_pages.users.title')}
                                </h1>
                                <p className="text-[10px] font-black text-primary uppercase tracking-wide mt-1 opacity-80 italic">{t('settings_pages.users.subtitle')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3 relative z-10">
                        <ExcelImport 
                            trigger={
                                <PremiumButton variant="outline" className="h-11 px-5 rounded-xl border-border/10 hover:border-primary/50 text-muted-foreground gap-2 text-[10px] font-black uppercase tracking-widest">
                                    <FileSpreadsheet size={16} /> {t('settings_pages.users.bulk_import')}
                                </PremiumButton>
                            }
                            title={t('settings_pages.users.import_title')}
                            onImport={createBulkUsers}
                            templateData={[{ Username: "user01", Name: "นาย สมชาย ใจดี", Branch_ID: "HQ", Role: "Staff", Password: "password123", Active_Status: "Active", Customer_ID: "" }]}
                            templateFilename="template_users.xlsx"
                        />
                        <PremiumButton onClick={() => handleOpenDialog()} className="h-11 px-6 rounded-xl gap-2 shadow-lg bg-primary text-foreground border-0 text-[10px] font-black uppercase tracking-widest">
                            <Plus size={16} strokeWidth={3} /> {t('settings_pages.users.add_user')}
                        </PremiumButton>
                    </div>
                </div>

                {/* Filter Matrix */}
                <div className="bg-background/40 p-4 rounded-2xl border border-border/5 shadow-lg relative overflow-hidden backdrop-blur-xl max-w-xl">
                    <div className="relative group w-full">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={18} />
                        <input 
                            autoComplete="off"
                            placeholder={t('settings_pages.users.search_placeholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-11 bg-transparent border-none pl-12 pr-4 text-sm font-black uppercase tracking-wide transition-all text-foreground placeholder:text-muted-foreground italic outline-none"
                        />
                    </div>
                </div>

                {/* Registry Table */}
                <PremiumCard className="bg-background/40 border border-border/5 shadow-xl rounded-3xl overflow-hidden group/registry">
                    <div className="p-6 border-b border-border/5 bg-black/40 flex items-center justify-between relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] pointer-events-none" />
                        <div className="flex items-center gap-4 relative z-10">
                            <Fingerprint size={20} className="text-primary animate-pulse" />
                            <h2 className="text-lg font-black text-foreground tracking-normal uppercase italic">{t('settings_pages.users.registry_title')}</h2>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1 bg-muted/50 rounded-full border border-border/10 relative z-10">
                            <Activity size={12} className="text-primary" />
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-normal italic">{t('common.tactical.realtime_active')}</span>
                        </div>
                    </div>

                    <div className="relative w-full overflow-auto custom-scrollbar">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead>
                                <tr className="bg-black/20 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/5 italic">
                                    <th className="px-8 py-4">{t('settings_pages.users.table.vector_id')}</th>
                                    <th className="px-6 py-4">{t('settings_pages.users.table.identity')}</th>
                                    <th className="px-6 py-4">{t('settings_pages.users.table.hub')}</th>
                                    <th className="px-6 py-4">{t('settings_pages.users.table.role')}</th>
                                    <th className="px-6 py-4">{t('settings_pages.users.table.status')}</th>
                                    <th className="px-8 py-4 text-right">{t('settings_pages.users.table.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.02]">
                                {loading ? (
                                    <tr><td colSpan={6} className="text-center py-16 opacity-30"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-16 opacity-30 italic font-black uppercase tracking-normal text-foreground">{t('common.tactical.registry_void')}</td></tr>
                                ) : (
                                    filteredUsers.map((user) => (
                                        <tr key={user.Username} className="group/row hover:bg-muted/40 transition-all duration-300">
                                            <td className="px-8 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-primary font-black tracking-normal uppercase italic group-hover/row:scale-105 origin-left transition-transform inline-block">
                                                        {user.Username}
                                                    </span>
                                                    {user.Customer_ID && (
                                                        <div className="text-[9px] font-black text-accent uppercase tracking-tight mt-0.5 opacity-60">
                                                            {t('common.tactical.ext_client')}: {user.Master_Customers?.Customer_Name || user.Customer_ID}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-black text-foreground uppercase tracking-tight italic">{user.Name}</td>
                                            <td className="px-6 py-4 text-muted-foreground font-black uppercase tracking-normal text-xs font-bold">
                                                {user.Branch_ID || t('common.tactical.global_node')}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="px-3 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[10px] font-black uppercase tracking-normal italic shadow-[0_0_10px_rgba(255,30,133,0.1)] w-fit">
                                                    {t(`settings.roles_list.${user.Role}` as any) || user.Role || t('common.tactical.no_roles')}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={cn(
                                                    "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-normal border w-fit italic",
                                                    user.Active_Status === 'Active' 
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse'
                                                )}>
                                                    {user.Active_Status === 'Active' ? t('common.tactical.active') : t('common.tactical.inactive')}
                                                </div>
                                            </td>
                                             <td className="px-8 py-4 text-right">
                                                 <div className="flex items-center justify-end gap-2 opacity-20 group-hover/row:opacity-100 transition-opacity">
                                                     <button 
                                                        onClick={() => handleOpenDialog(user)} 
                                                        className="p-2 rounded-lg bg-muted/50 border border-border/5 hover:bg-primary hover:text-black disabled:opacity-30 transition-all shadow-md"
                                                        disabled={(user.Role === "Super Admin" || user.Role === "Admin") && currentRoleId !== 1}
                                                     >
                                                         <Edit size={14} />
                                                     </button>
                                                     <button 
                                                        onClick={() => handleDelete(user.Username)} 
                                                        className="p-2 rounded-lg bg-muted/50 border border-border/5 hover:bg-rose-600 hover:text-white disabled:opacity-30 transition-all shadow-md"
                                                        disabled={(user.Role === "Super Admin" || user.Role === "Admin") && currentRoleId !== 1}
                                                     >
                                                         <Trash2 size={14} />
                                                     </button>
                                                 </div>
                                             </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </PremiumCard>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="bg-background border-border/10 text-foreground max-w-[95vw] sm:max-w-3xl max-h-[98vh] overflow-hidden flex flex-col p-0 shadow-[0_40px_100px_rgba(0,0,0,1)] rounded-3xl sm:rounded-[2.5rem] backdrop-blur-3xl z-[100]">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-indigo-500/50 to-accent" />
                    
                    <DialogHeader className="p-4 sm:p-6 border-b border-border/5 bg-muted/20">
                        <DialogTitle className="flex items-center gap-4 text-xl sm:text-2xl font-black italic uppercase tracking-normal premium-text-gradient">
                            <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-primary animate-pulse" strokeWidth={2.5} />
                            {editingUser ? t('settings_pages.users.dialog.title_edit') : t('settings_pages.users.dialog.title_add')}
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-8 space-y-6 custom-scrollbar">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10">
                             <div className="space-y-3">
                                <Label className="text-sm sm:text-base font-bold font-black text-muted-foreground uppercase tracking-widest ml-2 sm:ml-4">{t('settings_pages.users.dialog.username')}</Label>
                                <Input 
                                    value={formData.Username} 
                                    onChange={e => setFormData({...formData, Username: e.target.value})} 
                                    disabled={!!editingUser}
                                    className="h-12 sm:h-14 rounded-2xl bg-muted border-border/5 text-foreground disabled:opacity-50 font-black italic tracking-normal pl-6 shadow-inner" 
                                />
                            </div>
                            <div className="space-y-3">
                                <Label className="text-sm sm:text-base font-bold font-black text-muted-foreground uppercase tracking-widest ml-2 sm:ml-4">{t('settings_pages.users.dialog.password')}</Label>
                                <Input 
                                    type="password"
                                    value={formData.Password || ""} 
                                    onChange={e => setFormData({...formData, Password: e.target.value})} 
                                    className="h-12 sm:h-14 rounded-2xl bg-muted border-border/5 text-foreground font-black italic tracking-normal pl-6 shadow-inner" 
                                    placeholder={editingUser ? t('settings_pages.users.dialog.password_placeholder_edit') : t('settings_pages.users.dialog.password_placeholder_add')}
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-sm sm:text-base font-bold font-black text-muted-foreground uppercase tracking-widest ml-2 sm:ml-4">{t('settings_pages.users.dialog.full_name')}</Label>
                            <Input 
                                value={formData.Name} 
                                onChange={e => setFormData({...formData, Name: e.target.value})} 
                                className="h-12 sm:h-14 rounded-2xl bg-muted border-border/5 text-foreground font-black italic tracking-normal pl-6 shadow-inner" 
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10">
                            <div className="space-y-3">
                                <Label className="text-sm sm:text-base font-bold font-black text-muted-foreground uppercase tracking-tight ml-2 sm:ml-4">{t('settings_pages.users.dialog.branch')}</Label>
                                {(currentRoleId === 1 || currentRoleId === 2) ? (
                                    <Select 
                                        value={formData.Branch_ID || ""} 
                                        onValueChange={v => setFormData({...formData, Branch_ID: v})}
                                    >
                                        <SelectTrigger className="h-12 sm:h-14 rounded-2xl bg-muted border-border/5 text-foreground font-black uppercase italic tracking-normal shadow-inner">
                                            <SelectValue placeholder={t('settings_pages.users.dialog.select_hub')} />
                                        </SelectTrigger>
                                        <SelectContent className="bg-popover border-border/10 text-foreground">
                                            {formData.Role === 'Super Admin' && (
                                                <SelectItem value="All" className="font-black italic uppercase tracking-normal text-primary">
                                                    -- ALL BRANCHES (GLOBAL) --
                                                </SelectItem>
                                            )}
                                            {branches.map(b => (
                                                <SelectItem key={b.Branch_ID} value={b.Branch_ID} className="font-black italic uppercase tracking-normal">
                                                    {b.Branch_Name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Input 
                                        value={formData.Branch_ID || ""} 
                                        onChange={e => setFormData({...formData, Branch_ID: e.target.value})}
                                        className="h-14 sm:h-16 rounded-2xl bg-muted border-border/5 text-foreground font-black italic tracking-normal pl-6 shadow-inner" 
                                        disabled={currentRoleId !== 1}
                                    />
                                )}
                            </div>
                            <div className="space-y-3">
                                <Label className="text-sm sm:text-base font-bold font-black text-muted-foreground uppercase tracking-tight ml-2 sm:ml-4">{t('settings_pages.users.dialog.role')}</Label>
                                <Select 
                                    value={formData.Role || ""} 
                                    onValueChange={handleRoleChange}
                                >
                                    <SelectTrigger className="h-12 sm:h-14 rounded-2xl bg-muted border-border/5 text-foreground font-black uppercase italic tracking-normal shadow-inner">
                                        <SelectValue placeholder={t('settings_pages.users.dialog.select_role')} />
                                    </SelectTrigger>
                                    <SelectContent className="bg-popover border-border/10 text-foreground">
                                        {STANDARD_ROLES.map(role => (
                                            <SelectItem key={role} value={role} className="font-black italic uppercase tracking-normal">
                                                {role}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Customer Link (Optional or Required for Customer Role) */}
                        <div className={cn(
                            "space-y-3 p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] border-2 shadow-inner group/client transition-all duration-500",
                            formData.Role === 'Customer' 
                                ? "bg-primary/10 border-primary animate-pulse shadow-[0_0_30px_rgba(255,30,133,0.15)]" 
                                : "bg-primary/5 border-primary/10"
                        )}>
                            <div className="flex items-center justify-between gap-3 mb-2 ml-4">
                                <div className="flex items-center gap-3">
                                    <Key size={14} className={cn("text-primary transition-transform", formData.Role === 'Customer' && "rotate-45")} />
                                    <Label className={cn(
                                        "text-sm sm:text-base font-bold font-black uppercase tracking-widest",
                                        formData.Role === 'Customer' ? "text-primary" : "text-muted-foreground"
                                    )}>
                                        {t('common.tactical.ext_client_link')}
                                        {formData.Role === 'Customer' && <span className="text-rose-500 ml-2 animate-bounce inline-block">*</span>}
                                    </Label>
                                </div>
                                {formData.Role === 'Customer' && (
                                    <span className="text-[10px] font-black uppercase bg-primary text-foreground px-2 py-0.5 rounded-md italic">Mandatory</span>
                                )}
                            </div>
                            <Select 
                                value={formData.Customer_ID || "none"} 
                                onValueChange={v => setFormData({...formData, Customer_ID: v === "none" ? null : v})}
                            >
                                <SelectTrigger className={cn(
                                    "h-14 sm:h-16 rounded-2xl bg-muted border-border/5 text-foreground font-black uppercase italic tracking-normal shadow-inner",
                                    formData.Role === 'Customer' && !formData.Customer_ID && "border-rose-500/50 shake-subtle"
                                )}>
                                    <SelectValue placeholder={customers.length > 0 ? t('common.tactical.synergy_link') : "--- NO CUSTOMERS FOUND ERROR ---"} />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border-border/10 text-foreground">
                                    <SelectItem value="none" className="font-black italic uppercase tracking-normal text-muted-foreground underline">{t('common.tactical.remove_link')}</SelectItem>
                                    {customers.length === 0 ? (
                                        <div className="p-4 text-center text-rose-500 font-black uppercase italic text-sm">
                                            No customers found! Please add customers first.
                                        </div>
                                    ) : (
                                        customers.map(c => (
                                            <SelectItem key={c.Customer_ID} value={c.Customer_ID} className="font-black italic uppercase tracking-normal">
                                                {c.Customer_Name}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                         <div className="space-y-6 pt-6 border-t border-border/5">
                            <div className="flex items-center justify-between px-4">
                                <div className="space-y-1">
                                    <Label className="text-base font-black text-foreground uppercase italic tracking-normal">กำหนดสิทธิ์รายบุคคล (Individual Permissions)</Label>
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest italic">หากเปิดใช้งาน สิทธิ์นี้จะแทนที่สิทธิ์ตามกลุ่ม (Role)</p>
                                </div>
                                <Checkbox 
                                    checked={useIndividualPermissions}
                                    onCheckedChange={(checked) => {
                                        setUseIndividualPermissions(!!checked)
                                        if (!checked) setFormData(prev => ({ ...prev, Permissions: [] }))
                                    }}
                                    className="w-8 h-8 rounded-xl data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                            </div>

                            {useIndividualPermissions && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                                    {MODULE_GROUPS.map((group) => (
                                        <div key={group.title} className="space-y-4">
                                            <div className="flex items-center gap-3 px-4">
                                                <div className="w-1 h-4 bg-primary rounded-full" />
                                                <h3 className="text-sm font-black text-primary uppercase italic tracking-tighter">{group.title}</h3>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {group.items.map((item) => {
                                                    const isAllowed = Array.isArray(formData.Permissions) && formData.Permissions.includes(item.key)
                                                    return (
                                                        <div 
                                                            key={item.key}
                                                            onClick={() => handleToggleIndividualPermission(item.key)}
                                                            className={cn(
                                                                "p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between group/perm",
                                                                isAllowed 
                                                                ? "bg-primary/5 border-primary shadow-sm" 
                                                                : "bg-muted/30 border-transparent hover:border-border/10"
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className={cn(
                                                                    "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                                                                    isAllowed ? "bg-primary text-foreground" : "bg-muted text-muted-foreground group-hover/perm:bg-muted/80"
                                                                )}>
                                                                    <item.icon size={18} />
                                                                </div>
                                                                <div>
                                                                    <p className={cn(
                                                                        "font-black text-xs leading-none transition-colors italic uppercase",
                                                                        isAllowed ? "text-foreground" : "text-muted-foreground"
                                                                    )}>
                                                                        {item.label}
                                                                    </p>
                                                                    <p className="text-[8px] font-bold text-muted-foreground/60 mt-1 uppercase tracking-widest">{item.key.split('.')[1]}</p>
                                                                </div>
                                                            </div>
                                                            <Checkbox 
                                                                checked={isAllowed}
                                                                onCheckedChange={() => handleToggleIndividualPermission(item.key)}
                                                                className="w-5 h-5 rounded-md data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                                            />
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 pb-4 border-t border-border/5 pt-6">
                             <Label className="text-sm sm:text-base font-bold font-black text-muted-foreground uppercase tracking-widest ml-4">{t('common.tactical.deploy_status')}</Label>
                             <Select 
                                value={formData.Active_Status} 
                                onValueChange={v => setFormData({...formData, Active_Status: v})}
                            >
                                <SelectTrigger className="h-12 sm:h-14 rounded-2xl bg-muted border-border/5 text-foreground font-black uppercase italic tracking-normal shadow-inner">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-popover border-border/10 text-foreground">
                                    <SelectItem value="Active" className="text-emerald-500 font-black italic uppercase tracking-normal hover:bg-emerald-500/10">{t('common.tactical.node_active')}</SelectItem>
                                    <SelectItem value="Inactive" className="text-rose-500 font-black italic uppercase tracking-normal hover:bg-rose-500/10">{t('common.tactical.node_deactivated')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
 
                    <DialogFooter className="p-4 sm:p-6 border-t border-border/5 bg-muted/20 gap-4 sm:gap-6 flex-row shrink-0">
                        <PremiumButton variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1 sm:flex-none h-12 sm:h-14 px-6 sm:px-10 rounded-xl sm:rounded-2xl border-border/5 text-muted-foreground hover:text-foreground uppercase tracking-normal text-sm sm:text-base font-bold font-black">{t('settings_pages.users.dialog.abort')}</PremiumButton>
                        <PremiumButton onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none h-12 sm:h-14 px-8 sm:px-12 rounded-xl sm:rounded-2xl gap-3 sm:gap-4 shadow-lg sm:min-w-[200px] text-base sm:text-lg tracking-normal bg-primary text-foreground border-0">
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                            {t('settings_pages.users.dialog.execute')}
                        </PremiumButton>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    )
}

