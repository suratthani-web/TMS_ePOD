"use client";

import React, { useState } from "react";
import { Camera, FileText, Loader2, CheckCircle2, AlertCircle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { parseManifestWithAI, ParsedManifest } from "@/lib/ai/manifest-ocr";

export function SmartManifestUpload() {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ParsedManifest | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setIsScanning(true);
    try {
      // ในระบบจริงต้องเปลี่ยน file เป็น base64
      const base64 = await toBase64(file);
      const data = await parseManifestWithAI(base64, file.type);
      setResult(data);
      toast.success("Manifest Analyzed Successfully");
    } catch (error) {
      console.error(error);
      toast.error("Failed to analyze manifest. Please check your API key.");
    } finally {
      setIsScanning(false);
    }
  };

  const toBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });

  return (
    <div className="w-full max-w-md mx-auto space-y-4 p-4">
      <Card className="p-6 border-dashed border-2 border-emerald-500/30 bg-card rounded-2xl relative overflow-hidden group">
        {!preview ? (
          <label className="flex flex-col items-center justify-center gap-4 cursor-pointer py-10">
            <div className="w-14 h-14 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-sm">
              <Camera size={32} />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground tracking-tight">อ่านเอกสาร Manifest</p>
              <p className="text-sm font-medium text-muted-foreground mt-1">ถ่ายรูปหรืออัปโหลดเอกสารเพื่อดึงข้อมูลงาน</p>
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} disabled={isScanning} />
          </label>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden aspect-video bg-black">
              <img src={preview} alt="Preview" className="w-full h-full object-contain opacity-70" />
              {isScanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-950/40 backdrop-blur-sm text-white">
                  <Loader2 className="animate-spin mb-2" size={32} />
                  <span className="text-sm font-semibold animate-pulse">กำลังอ่านเอกสาร...</span>
                </div>
              )}
            </div>
            {!isScanning && (
              <Button 
                variant="outline" 
                className="w-full rounded-xl border-border font-semibold"
                onClick={() => { setPreview(null); setResult(null); }}
              >
                เลือกเอกสารใหม่
              </Button>
            )}
          </div>
        )}
      </Card>

      {result && (
        <Card className="p-6 border-emerald-500/20 bg-card rounded-2xl shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground tracking-tight">ผลการอ่านเอกสาร</h3>
              <p className="text-sm font-medium text-muted-foreground">ตรวจสอบข้อมูลก่อนนำไปใช้กับงาน</p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="bg-muted/30 p-4 rounded-2xl border border-border">
              <p className="text-sm font-medium text-muted-foreground mb-1">Job ID / Reference</p>
              <p className="text-xl font-semibold text-foreground">{result.jobId || "Not detected"}</p>
            </div>

            <div className="bg-muted/30 p-4 rounded-2xl border border-border">
              <p className="text-sm font-medium text-muted-foreground mb-1">Customer Name</p>
              <p className="text-xl font-semibold text-foreground">{result.customerName || "Not detected"}</p>
            </div>

            <div className="bg-muted/30 p-4 rounded-2xl border border-border">
              <p className="text-sm font-medium text-muted-foreground mb-1">Items Detected</p>
              <div className="mt-2 space-y-2">
                {result.items?.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm font-medium py-2 border-b border-border last:border-0">
                    <span className="font-medium text-muted-foreground flex items-center gap-2">
                      <Package size={12} className="text-emerald-500" />
                      {item.name}
                    </span>
                    <span className="text-foreground font-semibold">
                      QTY: {item.quantity}
                    </span>
                  </div>
                )) || <p className="text-sm font-medium text-muted-foreground">No items found</p>}
              </div>
            </div>
          </div>

          <Button className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-sm">
            นำข้อมูลไปใช้กับงาน
          </Button>
        </Card>
      )}
    </div>
  );
}

