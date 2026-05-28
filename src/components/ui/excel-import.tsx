"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Logger from "@/lib/utils/logger"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

import { Upload, FileSpreadsheet, Loader2, Download, AlertCircle, CheckCircle2 } from "lucide-react"
import { read, utils, writeFile } from "xlsx"
import { motion, AnimatePresence } from "framer-motion"
import { useLanguage } from "@/components/providers/language-provider"

interface ExcelImportProps {
  trigger: React.ReactNode
  title: string
  description?: string
  onImport: (data: Record<string, unknown>[], options?: { shouldGroup?: boolean; isDraft?: boolean }) => Promise<{ success: boolean; message: string; error?: string }>;
  templateData?: Record<string, unknown>[]
  templateFilename?: string
  groupingLabel?: string
  showDraftOption?: boolean
  customTemplateButton?: React.ReactNode
}

export function ExcelImport({
  trigger,
  title,
  description,
  onImport,
  templateData,
  templateFilename = "template.xlsx",
  groupingLabel,
  showDraftOption = false,
  customTemplateButton,
}: ExcelImportProps) {
  const { t } = useLanguage()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<Record<string, unknown>[]>([])
  const [error, setError] = useState<string | null>(null)
  const [shouldGroup, setShouldGroup] = useState(true)
  const [isDraft, setIsDraft] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const effectiveDescription = description || t('common.import.description')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setError(null)
    setLoading(true)

    try {
      const data = await parseExcel(selectedFile)
      setPreviewData(data)
      if (data.length === 0) {
        setError(t('common.import.error_empty'))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(t('common.import.error_read').replace('{{error}}', msg))
    } finally {
      setLoading(false)
    }
  }

  const parseExcel = (file: File): Promise<Record<string, unknown>[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = e.target?.result
          const workbook = read(data, { type: "binary", cellDates: true, dateNF: 'yyyy-mm-dd' })
          const sheetName = workbook.SheetNames[0]
          const sheet = workbook.Sheets[sheetName]
          const jsonData = utils.sheet_to_json(sheet, { raw: false, dateNF: 'yyyy-mm-dd' })
          const plainData = JSON.parse(JSON.stringify(jsonData))
          resolve(plainData)
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = (error) => reject(error)
      reader.readAsBinaryString(file)
    })
  }

  const handleImport = async () => {
    if (!previewData.length) return

    setLoading(true)
    setError(null)

    try {
      const result = await onImport(previewData, { shouldGroup, isDraft })
      if (result.success) {
        setOpen(false)
        setFile(null)
        setPreviewData([])
        toast.success(result.message || t('common.import.success'))
        router.refresh()
      } else {
        Logger.error("Excel import failed:", result.error)
        toast.error(result.message || t('common.import.failed'))
      }
    } catch {
      setError(t('common.import.failed'))
    } finally {
      setLoading(false)
    }
  }

  const downloadTemplate = () => {
    if (!templateData) return
    const ws = utils.json_to_sheet(templateData)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, "Template")
    writeFile(wb, templateFilename)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-[95vw] sm:max-w-xl max-h-[95vh] flex flex-col bg-card border-border/10 text-foreground rounded-[2rem] p-0 overflow-hidden shadow-2xl">
        <div className="flex-1 overflow-y-auto p-8 pb-4 space-y-6 custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-xl font-black tracking-tight flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <FileSpreadsheet size={20} />
              </div>
              {title}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground font-medium">
              {effectiveDescription}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6">
            {customTemplateButton ? (
              <div className="flex justify-end">
                {customTemplateButton}
              </div>
            ) : templateData && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadTemplate}
                  className="h-10 px-4 rounded-xl gap-2 border-border/10 bg-muted/50 hover:bg-muted/80 text-muted-foreground transition-all active:scale-95"
                >
                  <Download size={14} /> {t('common.import.template')}
                </Button>
              </div>
            )}

            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`relative border-2 border-dashed rounded-3xl p-10 text-center transition-all cursor-pointer group ${
                file 
                  ? "border-emerald-500/50 bg-emerald-500/5" 
                  : "border-border/10 bg-muted/50 hover:border-emerald-500/30 hover:bg-emerald-500/5"
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex flex-col items-center gap-4">
                <AnimatePresence mode="wait">
                  {file ? (
                    <motion.div 
                      key="file"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center gap-3"
                    >
                      <div className="p-4 rounded-full bg-emerald-500/20 text-emerald-500">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-foreground tracking-tight">{file.name}</p>
                        <p className="text-lg font-bold text-muted-foreground mt-1">
                          {previewData.length > 0 
                            ? t('common.import.file_ready').replace('{{count}}', String(previewData.length)) 
                            : t('common.import.reading')}
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="no-file"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-3"
                    >
                      <div className="p-4 rounded-full bg-muted/50 text-muted-foreground group-hover:text-emerald-500 group-hover:bg-emerald-500/10 transition-colors">
                        <Upload className="w-8 h-8" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-muted-foreground">{t('common.import.upload_area')}</p>
                        <p className="text-lg font-bold text-muted-foreground mt-1 uppercase tracking-widest font-black">{t('common.import.placeholder')}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl flex items-start gap-3 text-xl"
                >
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-black uppercase tracking-wider text-base font-bold">{t('common.import.error_title')}</p>
                    <p className="font-medium mt-1">{error}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {groupingLabel && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                <Checkbox 
                  id="group-so" 
                  checked={shouldGroup} 
                  onCheckedChange={(checked) => setShouldGroup(!!checked)}
                  className="w-5 h-5 rounded-lg border-primary/20 data-[state=checked]:bg-primary"
                />
                <div className="grid gap-1">
                  <Label htmlFor="group-so" className="text-sm font-black uppercase tracking-wider text-primary cursor-pointer">
                    {groupingLabel}
                  </Label>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">
                    Auto-merges SOs for the same driver & optimizes route
                  </p>
                </div>
              </div>
            )}
            
            {showDraftOption && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
                <Checkbox 
                  id="import-draft" 
                  checked={isDraft} 
                  onCheckedChange={(checked) => setIsDraft(!!checked)}
                  className="w-5 h-5 rounded-lg border-amber-500/20 data-[state=checked]:bg-amber-500"
                />
                <div className="grid gap-1">
                  <Label htmlFor="import-draft" className="text-sm font-black uppercase tracking-wider text-amber-600 cursor-pointer">
                    นำเข้าเป็น "ร่าง (Draft)"
                  </Label>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-70">
                    งานจะถูกสร้างไว้แต่ยังไม่ส่งให้คนขับจนกว่าแอดมินจะกดอนุมัติ
                  </p>
                </div>
              </div>
            )}

            {previewData.length > 0 && !error && (
               <div className="bg-muted/50 rounded-2xl border border-border/5 overflow-hidden">
                  <div className="max-h-[160px] overflow-auto">
                    <table className="w-full text-base font-bold text-left border-collapse">
                        <thead className="bg-muted/80 text-muted-foreground sticky top-0 backdrop-blur-md">
                            <tr>
                                {Object.keys(previewData[0]).slice(0, 6).map(key => (
                                    <th key={key} className="p-3 font-bold uppercase tracking-wider">{key}</th>
                                ))}
                                {Object.keys(previewData[0]).length > 6 && <th className="p-3 font-bold">...</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {previewData.slice(0, 3).map((row, i) => (
                                <tr key={i} className="hover:bg-muted/50 transition-colors">
                                    {Object.values(row).slice(0, 6).map((val: unknown, j) => (
                                        <td key={j} className="p-3 text-muted-foreground font-medium truncate max-w-[100px]">{String(val)}</td>
                                    ))}
                                    {Object.values(row).length > 6 && <td className="p-3 text-muted-foreground">...</td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>
                  {previewData.length > 3 && (
                      <div className="p-2 text-base font-bold text-center text-muted-foreground bg-muted/30 border-t border-border/5 font-bold uppercase tracking-tighter">
                          {t('common.import.more_items').replace('{{count}}', String(previewData.length - 3))}
                      </div>
                  )}
               </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-8 pt-0 flex gap-3 flex-shrink-0">
          <Button 
            variant="ghost" 
            onClick={() => setOpen(false)}
            className="flex-1 h-12 rounded-2xl border border-border/5 text-muted-foreground hover:text-foreground hover:bg-muted/50 font-bold transition-all"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || loading || previewData.length === 0}
            className="flex-1 h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-foreground font-black shadow-lg shadow-emerald-900/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : t('common.import.btn_import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

