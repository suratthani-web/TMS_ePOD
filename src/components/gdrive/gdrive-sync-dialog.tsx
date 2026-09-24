"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { 
  CloudDownload, 
  FolderSync, 
  FileText, 
  HelpCircle, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink,
  Car,
  Users,
  UserCheck
} from "lucide-react"
import { SyncResult } from "@/lib/gdrive/sync"

interface Props {
  trigger?: React.ReactNode
  defaultType?: "vehicle" | "driver" | "user"
  onSyncComplete?: () => void
  onSuccess?: () => void
}

export function GDriveSyncDialog({ trigger, defaultType = "driver", onSyncComplete, onSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [entityType, setEntityType] = useState<"vehicle" | "driver" | "user">(defaultType)
  const [folderUrl, setFolderUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [rawText, setRawText] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)

  const handleSyncFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!folderUrl.trim()) {
      toast.error("กรุณาระบุลิงก์หรือ Folder ID ของ Google Drive")
      return
    }

    setLoading(true)
    setResult(null)
    try {
      const res = await fetch("/api/gdrive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_folder",
          entityType,
          folderUrl: folderUrl.trim(),
          apiKey: apiKey.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "เกิดข้อผิดพลาดในการซิงก์")
      }

      setResult(data)
      toast.success(data.message)
      if (onSyncComplete) onSyncComplete()
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "ซิงก์ไม่สำเร็จ"
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleBatchText = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rawText.trim()) {
      toast.error("กรุณาระบุข้อมูลลิงก์รูปภาพ")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/gdrive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "batch_text",
          entityType,
          rawText: rawText.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || "เกิดข้อผิดพลาดในการบันทึก")
      }

      toast.success(data.message)
      setRawText("")
      if (onSyncComplete) onSyncComplete()
      if (onSuccess) onSuccess()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "บันทึกไม่สำเร็จ"
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2 bg-background border-border text-foreground hover:text-primary shadow-xs">
            <CloudDownload size={16} className="text-primary" />
            <span>ซิงก์รูปจาก Google Drive</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 rounded-3xl overflow-hidden bg-card border-border shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-primary" />

        <DialogHeader className="p-6 pb-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-2xl text-primary">
              <CloudDownload size={24} />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                เชื่อมต่อและซิงก์รูปภาพ Google Drive
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                ดึงรูปถ่ายคนขับ, รูปรถ หรือรูปผู้ใช้งานระบบจากโฟลเดอร์ Google Drive มาแสดงผลอัตโนมัติ
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
          {/* Entity Type Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              ประเภทข้อมูลที่ต้องการซิงก์
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setEntityType("driver")}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                  entityType === "driver"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/30 border-border hover:bg-muted/60 text-muted-foreground"
                }`}
              >
                <Users size={16} />
                <span>รูปคนขับ</span>
              </button>

              <button
                type="button"
                onClick={() => setEntityType("vehicle")}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                  entityType === "vehicle"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/30 border-border hover:bg-muted/60 text-muted-foreground"
                }`}
              >
                <Car size={16} />
                <span>รูปรถ / ยานพาหนะ</span>
              </button>

              <button
                type="button"
                onClick={() => setEntityType("user")}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-bold transition-all ${
                  entityType === "user"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/30 border-border hover:bg-muted/60 text-muted-foreground"
                }`}
              >
                <UserCheck size={16} />
                <span>รูปผู้ใช้งานระบบ</span>
              </button>
            </div>
          </div>

          <Tabs defaultValue="folder">
            <TabsList className="grid grid-cols-3 w-full h-11 bg-muted/50 p-1 rounded-xl">
              <TabsTrigger value="folder" className="text-xs font-bold gap-1.5 rounded-lg">
                <FolderSync size={14} /> ซิงก์โฟลเดอร์
              </TabsTrigger>
              <TabsTrigger value="batch" className="text-xs font-bold gap-1.5 rounded-lg">
                <FileText size={14} /> วางข้อความหลายรายการ
              </TabsTrigger>
              <TabsTrigger value="guide" className="text-xs font-bold gap-1.5 rounded-lg">
                <HelpCircle size={14} /> วิธีตั้งชื่อไฟล์
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: FOLDER SYNC */}
            <TabsContent value="folder" className="space-y-4 pt-4">
              <form onSubmit={handleSyncFolder} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="folderUrl" className="text-xs font-semibold text-foreground">
                    ลิงก์โฟลเดอร์ Google Drive หรือ Folder ID
                  </Label>
                  <Input
                    id="folderUrl"
                    placeholder="https://drive.google.com/drive/folders/1ABCXYZ... หรือ 1ABCXYZ..."
                    value={folderUrl}
                    onChange={(e) => setFolderUrl(e.target.value)}
                    required
                    className="h-11 rounded-xl border-border bg-background"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    * โฟลเดอร์ต้องถูกตั้งค่าการแชร์เป็น <strong>&ldquo;ทุกคนที่มีลิงก์มีสิทธิ์ดู&rdquo; (Anyone with link)</strong>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiKey" className="text-xs font-semibold text-muted-foreground">
                    Google Drive API Key (ไม่บังคับ)
                  </Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="ใส่ API Key ถ้ามี (ช่วยให้ดึงได้เร็วขึ้นในโฟลเดอร์ขนาดใหญ่)"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="h-10 rounded-xl border-border bg-background text-xs"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <FolderSync size={16} />}
                  <span>{loading ? "กำลังสแกนและจับคู่รูปภาพ..." : "เริ่มซิงก์และจับคู่รูปภาพอัตโนมัติ"}</span>
                </Button>
              </form>

              {/* Sync Results Preview */}
              {result && (
                <div className="p-4 rounded-2xl border border-border bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-500" />
                      <span className="text-xs font-bold text-foreground">ผลการซิงก์รูปภาพ</span>
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[11px]">
                      จับคู่สำเร็จ {result.matchedCount} จาก {result.totalFound} ไฟล์
                    </Badge>
                  </div>

                  {result.matched.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase">รายการที่จับคู่เรียบร้อย:</p>
                      <div className="grid grid-cols-2 gap-2">
                        {result.matched.map((m) => (
                          <div key={m.id} className="flex items-center gap-2 p-2 bg-background rounded-xl border border-border/80">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={m.imageUrl}
                              alt={m.label}
                              className="w-8 h-8 rounded-lg object-cover border border-border bg-muted"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/placeholder-image.png"
                              }}
                            />
                            <div className="truncate flex-1">
                              <p className="text-xs font-bold text-foreground truncate">{m.label}</p>
                              <p className="text-[10px] text-muted-foreground truncate">ID: {m.id}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.unmatched.length > 0 && (
                    <div className="pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1 text-amber-500 font-semibold mb-1">
                        <AlertCircle size={13} />
                        <span>ไม่พบข้อมูลที่ตรงกับชื่อไฟล์ {result.unmatched.length} รายการ:</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">
                        {result.unmatched.map((u) => u.filename).join(", ")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* TAB 2: BATCH TEXT */}
            <TabsContent value="batch" className="space-y-4 pt-4">
              <form onSubmit={handleBatchText} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rawText" className="text-xs font-semibold text-foreground">
                    วางรายการรหัสและลิงก์รูป (1 บรรทัดต่อ 1 รายการ)
                  </Label>
                  <textarea
                    id="rawText"
                    rows={6}
                    placeholder={`ตัวอย่างสำหรับ${entityType === "vehicle" ? "รถ" : "คนขับ"}:\n${
                      entityType === "vehicle"
                        ? "3ฒว2502: https://drive.google.com/file/d/1ABC...\n70-1234: https://drive.google.com/file/d/1XYZ..."
                        : "DRV-001: https://drive.google.com/file/d/1ABC...\nสมชาย ใจดี: https://drive.google.com/file/d/1XYZ..."
                    }`}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    required
                    className="w-full rounded-xl border border-border bg-background p-3 text-xs font-mono outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    รูปแบบที่รองรับ: <code>รหัส : ลิงก์รูป</code> หรือคัดลอกจาก Excel (ช่องแรกเป็นรหัส ช่องที่สองเป็นลิงก์)
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
                  <span>{loading ? "กำลังบันทึก..." : "บันทึกรายการทั้งหมด"}</span>
                </Button>
              </form>
            </TabsContent>

            {/* TAB 3: GUIDE */}
            <TabsContent value="guide" className="space-y-4 pt-4 text-xs text-slate-700 dark:text-slate-300">
              <div className="p-4 bg-muted/30 rounded-2xl border border-border space-y-3">
                <h4 className="font-bold text-foreground flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-primary" />
                  หลักการตั้งชื่อไฟล์ใน Google Drive เพื่อให้ระบบจับคู่อัตโนมัติ
                </h4>

                <div className="space-y-2 pl-2">
                  <p>
                    <strong>1. สำหรับรูปรถ (Vehicles):</strong><br />
                    ตั้งชื่อไฟล์ด้วย <strong>ทะเบียนรถ</strong> เช่น <code>3ฒว2502.jpg</code>, <code>70-1234.png</code>, หรือ <code>1กก9999.jpeg</code> (ระบบจะตัดช่องว่างและเครื่องหมายขีดให้อัตโนมัติ)
                  </p>

                  <p>
                    <strong>2. สำหรับรูปคนขับ (Drivers):</strong><br />
                    ตั้งชื่อไฟล์ด้วย <strong>รหัสคนขับ</strong> หรือ <strong>ชื่อคนขับ</strong> เช่น <code>DRV-001.jpg</code>, <code>24017.jpg</code>, หรือ <code>สมชาย ใจดี.png</code>
                  </p>

                  <p>
                    <strong>3. สำหรับรูปผู้ใช้งาน (Users):</strong><br />
                    ตั้งชื่อไฟล์ด้วย <strong>Username</strong> หรือ <strong>Email</strong> เช่น <code>admin.jpg</code>, <code>driver01.png</code>
                  </p>
                </div>
              </div>

              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl space-y-2">
                <h5 className="font-bold text-blue-600 dark:text-blue-400">💡 การแชร์โฟลเดอร์ Google Drive:</h5>
                <ol className="list-decimal pl-5 space-y-1 text-muted-foreground text-[11px]">
                  <li>คลิกขวาที่โฟลเดอร์ใน Google Drive &gt; เลือก <strong>แชร์ (Share)</strong></li>
                  <li>เปลี่ยนสิทธิ์การเข้าถึงทั่วไปเป็น <strong>&ldquo;ทุกคนที่มีลิงก์&rdquo; (Anyone with the link)</strong> สิทธิ์เป็น <strong>ผู้มีสิทธิ์อ่าน (Viewer)</strong></li>
                  <li>คลิก <strong>&ldquo;คัดลอกลิงก์&rdquo; (Copy link)</strong> แล้วนำมาวางในช่องด้านบน</li>
                </ol>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
