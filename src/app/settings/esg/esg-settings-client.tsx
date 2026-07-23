"use client"

import { useState, useTransition } from "react"
import { TGOEmissionFactorItem, upsertEmissionFactor, deleteEmissionFactor } from "@/lib/actions/esg-settings-actions"
import { Leaf, Plus, Edit2, Trash2, Calendar, ShieldCheck, Info, CheckCircle2, AlertCircle } from "lucide-react"

export function ESGSettingsClient({ initialList }: { initialList: TGOEmissionFactorItem[] }) {
    const [list, setList] = useState<TGOEmissionFactorItem[]>(initialList)
    const [isPending, startTransition] = useTransition()
    
    // Modal State
    const [isOpen, setIsOpen] = useState(false)
    const [editingItem, setEditingItem] = useState<Partial<TGOEmissionFactorItem> | null>(null)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

    const handleOpenAdd = () => {
        setEditingItem({
            fuel_code: 'Diesel_B7',
            fuel_name: 'น้ำมันดีเซล B7',
            ef_value: 2.6335,
            unit: 'kgCO2e/L',
            effective_date: new Date().toISOString().substring(0, 10),
            notes: 'คู่มือ อบก. 2024',
            is_active: true
        })
        setIsOpen(true)
    }

    const handleOpenEdit = (item: TGOEmissionFactorItem) => {
        setEditingItem({ ...item })
        setIsOpen(true)
    }

    const handleDelete = async (id: string) => {
        if (!confirm("คุณมั่นใจหรือไม่ที่จะลบรายการ Emission Factor นี้?")) return

        startTransition(async () => {
            const res = await deleteEmissionFactor(id)
            if (res.success) {
                setList(prev => prev.filter(x => x.id !== id))
                setFeedback({ type: 'success', message: 'ลบรายการเรียบร้อยแล้ว' })
            } else {
                setFeedback({ type: 'error', message: res.message || 'เกิดข้อผิดพลาด' })
            }
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingItem || !editingItem.fuel_code || !editingItem.ef_value || !editingItem.effective_date) {
            alert("กรุณากรอกข้อมูลสำคัญให้ครบถ้วน")
            return
        }

        startTransition(async () => {
            const res = await upsertEmissionFactor({
                id: editingItem.id,
                fuel_code: editingItem.fuel_code,
                fuel_name: editingItem.fuel_name || editingItem.fuel_code,
                ef_value: Number(editingItem.ef_value),
                unit: editingItem.unit || 'kgCO2e/L',
                effective_date: editingItem.effective_date,
                notes: editingItem.notes || '',
                is_active: editingItem.is_active ?? true
            })

            if (res.success) {
                setFeedback({ type: 'success', message: res.message || 'บันทึกสำเร็จ' })
                setIsOpen(false)
                // Refresh list locally
                window.location.reload()
            } else {
                setFeedback({ type: 'error', message: res.message || 'เกิดข้อผิดพลาดในการบันทึก' })
            }
        })
    }

    return (
        <div className="max-w-6xl mx-auto space-y-8 p-6">
            {/* Header Banner */}
            <div className="bg-card border border-border p-6 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl border border-emerald-500/20">
                            <Leaf size={20} />
                        </span>
                        <h1 className="text-xl font-black text-foreground tracking-tight">
                            ตั้งค่าพารามิเตอร์สิ่งแวดล้อม (TGO Emission Factors)
                        </h1>
                    </div>
                    <p className="text-xs text-muted-foreground pl-10">
                        จัดการค่าสัมประสิทธิ์การปล่อยก๊าซเรือนกระจก (Emission Factors) และวันเริ่มบังคับใช้ (Effective Date) ตามมาตรฐาน อบก.
                    </p>
                </div>

                <button
                    onClick={handleOpenAdd}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition shadow-sm self-start md:self-auto"
                >
                    <Plus size={16} />
                    เพิ่มค่า EF เชื้อเพลิง
                </button>
            </div>

            {/* Notification Banner */}
            {feedback && (
                <div className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium border ${
                    feedback.type === 'success' 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                    {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    {feedback.message}
                </div>
            )}

            {/* Standards Audit Card Info */}
            <div className="bg-card/50 border border-border/80 p-5 rounded-2xl text-xs space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <ShieldCheck size={16} />
                    <span>ข้อมูลอ้างอิงสำหรับการตรวจรับรอง อบก. (TGO Verifier Compliance)</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                    ระบบจะนำค่า Emission Factor ที่มีวันเริ่มบังคับใช้ (<code className="text-foreground">Effective Date</code>) ตรงตามหรือก่อนหน้าวันวิ่งงานจริงของใบงาน มาใช้คำนวณคาร์บอนฟุตพริ้นท์ย้อนหลังโดยอัตโนมัติ เพื่อรองรับการสืบย้อน Audit ข้ามปีได้อย่างสมบูรณ์
                </p>
            </div>

            {/* Emission Factors Table */}
            <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Calendar size={16} className="text-emerald-500" />
                        ตารางค่าสัมประสิทธิ์ EF ปัจจุบันและประวัติการบังคับใช้
                    </h3>
                    <span className="text-xs text-muted-foreground">ทั้งหมด {list.length} รายการ</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-muted/50 text-muted-foreground font-bold uppercase text-[10px] tracking-wider border-b border-border">
                            <tr>
                                <th className="p-4">รหัสเชื้อเพลิง (Fuel Code)</th>
                                <th className="p-4">ชื่อเชื้อเพลิง</th>
                                <th className="p-4">ค่า EF (kgCO2e)</th>
                                <th className="p-4">วันเริ่มบังคับใช้</th>
                                <th className="p-4">หมายเหตุ อบก.</th>
                                <th className="p-4 text-center">สถานะ</th>
                                <th className="p-4 text-right">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60 font-medium">
                            {list.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                                        ยังไม่มีข้อมูล Emission Factor ในระบบ
                                    </td>
                                </tr>
                            ) : (
                                list.map(item => (
                                    <tr key={item.id} className="hover:bg-muted/30 transition">
                                        <td className="p-4 font-mono font-bold text-foreground">
                                            {item.fuel_code}
                                        </td>
                                        <td className="p-4 text-foreground font-semibold">
                                            {item.fuel_name}
                                        </td>
                                        <td className="p-4 font-mono text-emerald-400 font-bold text-sm">
                                            {item.ef_value} <span className="text-[10px] text-muted-foreground font-normal">{item.unit}</span>
                                        </td>
                                        <td className="p-4 font-mono text-muted-foreground">
                                            {item.effective_date}
                                        </td>
                                        <td className="p-4 text-muted-foreground max-w-[200px] truncate">
                                            {item.notes || '-'}
                                        </td>
                                        <td className="p-4 text-center">
                                            {item.is_active ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    ใช้งาน
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                                                    ปิดใช้งาน
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right space-x-2">
                                            <button
                                                onClick={() => handleOpenEdit(item)}
                                                className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition"
                                                title="แก้ไข"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-400 transition"
                                                title="ลบ"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Form */}
            {isOpen && editingItem && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-6">
                        <div className="flex items-center justify-between border-b border-border pb-4">
                            <h3 className="font-bold text-foreground text-base">
                                {editingItem.id ? 'แก้ไขค่า Emission Factor' : 'เพิ่มค่า Emission Factor ใหม่'}
                            </h3>
                            <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground text-xs">
                                ✕ ปิด
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                            <div className="space-y-1">
                                <label className="font-bold text-foreground">รหัสเชื้อเพลิง (Fuel Code)</label>
                                <input
                                    type="text"
                                    required
                                    value={editingItem.fuel_code || ''}
                                    onChange={e => setEditingItem({ ...editingItem, fuel_code: e.target.value })}
                                    placeholder="เช่น Diesel_B7, Gasoline_E10, EV"
                                    className="w-full bg-muted/50 border border-border rounded-xl p-2.5 font-mono text-foreground focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="font-bold text-foreground">ชื่อเชื้อเพลิง (Display Name)</label>
                                <input
                                    type="text"
                                    required
                                    value={editingItem.fuel_name || ''}
                                    onChange={e => setEditingItem({ ...editingItem, fuel_name: e.target.value })}
                                    placeholder="เช่น น้ำมันดีเซล B7"
                                    className="w-full bg-muted/50 border border-border rounded-xl p-2.5 text-foreground focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="font-bold text-foreground">ค่า EF (kgCO2e/L หรือ kWh)</label>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        required
                                        value={editingItem.ef_value || ''}
                                        onChange={e => setEditingItem({ ...editingItem, ef_value: parseFloat(e.target.value) })}
                                        placeholder="เช่น 2.6335"
                                        className="w-full bg-muted/50 border border-border rounded-xl p-2.5 font-mono text-foreground focus:outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="font-bold text-foreground">วันเริ่มบังคับใช้ (Effective Date)</label>
                                    <input
                                        type="date"
                                        required
                                        value={editingItem.effective_date || ''}
                                        onChange={e => setEditingItem({ ...editingItem, effective_date: e.target.value })}
                                        className="w-full bg-muted/50 border border-border rounded-xl p-2.5 font-mono text-foreground focus:outline-none focus:border-emerald-500"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="font-bold text-foreground">หมายเหตุประกาศ อบก.</label>
                                <input
                                    type="text"
                                    value={editingItem.notes || ''}
                                    onChange={e => setEditingItem({ ...editingItem, notes: e.target.value })}
                                    placeholder="เช่น อ้างอิงตามคู่มือแนวทางการคำนวณ อบก. ปี 2024"
                                    className="w-full bg-muted/50 border border-border rounded-xl p-2.5 text-foreground focus:outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div className="pt-4 flex items-center justify-end gap-3 border-t border-border">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 rounded-xl bg-muted text-muted-foreground hover:text-foreground font-semibold"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-sm disabled:opacity-50"
                                >
                                    {isPending ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
