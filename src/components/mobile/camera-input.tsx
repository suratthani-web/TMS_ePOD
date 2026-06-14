"use client"

import { useState, useRef, useEffect } from "react"
import { Camera, X, Plus } from "lucide-react"
import { compressImage } from "@/lib/utils/image-compression"

type Props = {
  onImagesChange: (files: File[]) => void
  maxImages?: number
}

export function CameraInput({ onImagesChange, maxImages = 5 }: Props) {
  const [previews, setPreviews] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  // Revoke preview object URLs on unmount so they don't accumulate in memory.
  const previewsRef = useRef<string[]>([])
  useEffect(() => { previewsRef.current = previews }, [previews])
  useEffect(() => () => { previewsRef.current.forEach(URL.revokeObjectURL) }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || [])
    if (rawFiles.length === 0) return

    // Limit selection
    const allowedCount = maxImages - files.length
    const toProcess = rawFiles.slice(0, allowedCount)

    // Compress one at a time. Compressing in parallel decodes every full-size
    // photo at once, which spikes memory and crashes the page on iOS Safari.
    const compressedFiles: File[] = []
    for (const file of toProcess) {
        try {
            const blob = await compressImage(file, 1280, 1280, 0.7)
            compressedFiles.push(new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
            }))
        } catch {
            compressedFiles.push(file) // Fallback to original
        }
    }

    const updatedFiles = [...files, ...compressedFiles]
    setFiles(updatedFiles)
    
    // Create previews from new files
    const newPreviews = compressedFiles.map(file => URL.createObjectURL(file))
    setPreviews(prev => [...prev, ...newPreviews])
    
    onImagesChange(updatedFiles)
  }

  const removeImage = (index: number) => {
    const removed = previews[index]
    if (removed) URL.revokeObjectURL(removed)

    const newFiles = files.filter((_, i) => i !== index)
    const newPreviews = previews.filter((_, i) => i !== index)

    setFiles(newFiles)
    setPreviews(newPreviews)
    onImagesChange(newFiles)
  }

  const triggerCamera = () => {
    if (files.length >= maxImages) return
    if (cameraInputRef.current) {
        cameraInputRef.current.value = ''
        cameraInputRef.current.click()
    }
  }

  const triggerGallery = () => {
    if (files.length >= maxImages) return
    if (galleryInputRef.current) {
        galleryInputRef.current.value = ''
        galleryInputRef.current.click()
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden" 
        ref={cameraInputRef}
        onChange={handleFileChange}
      />
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden" 
        ref={galleryInputRef}
        onChange={handleFileChange}
      />

      {/* Image Grid */}
      {previews.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
            {previews.map((src, index) => (
                <div key={index} className="relative rounded-xl overflow-hidden border border-gray-200 aspect-video bg-white group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Captured ${index + 1}`} className="w-full h-full object-cover" />
                    <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 bg-red-500/80 text-white p-1 rounded-full backdrop-blur-md active:scale-95 transition-transform"
                    >
                        <X size={16} />
                    </button>
                </div>
            ))}
            
            {/* Add More Buttons */}
            {previews.length < maxImages && (
                <div className="contents">
                    <button
                        type="button"
                        onClick={triggerCamera}
                        className="aspect-video rounded-xl border-2 border-dashed border-gray-200 bg-white/80 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-gray-700 hover:border-slate-500 transition-colors active:bg-gray-100"
                    >
                        <Camera size={20} />
                        <span className="text-sm font-bold">ถ่ายเพิ่ม</span>
                    </button>
                    <button
                        type="button"
                        onClick={triggerGallery}
                        className="aspect-video rounded-xl border-2 border-dashed border-gray-200 bg-white/80 flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-gray-700 hover:border-slate-500 transition-colors active:bg-gray-100"
                    >
                        <Plus size={20} />
                        <span className="text-sm font-bold">แนบรูป</span>
                    </button>
                </div>
            )}
        </div>
      )}

      {/* Initial Empty State */}
      {previews.length === 0 && (
        <div className="grid grid-cols-2 gap-4">
            <button
            type="button"
            onClick={triggerCamera}
            className="aspect-video rounded-2xl border-2 border-dashed border-gray-200 bg-white shadow-sm flex flex-col items-center justify-center gap-3 text-gray-400 hover:text-primary hover:border-primary/50 transition-all active:scale-95"
            >
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Camera size={28} />
                </div>
                <span className="text-lg font-black text-slate-700">ถ่ายรูปสินค้า</span>
            </button>

            <button
            type="button"
            onClick={triggerGallery}
            className="aspect-video rounded-2xl border-2 border-dashed border-gray-200 bg-white shadow-sm flex flex-col items-center justify-center gap-3 text-gray-400 hover:text-indigo-600 hover:border-indigo-600/50 transition-all active:scale-95"
            >
                <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Plus size={28} />
                </div>
                <span className="text-lg font-black text-slate-700">แนบรูปภาพ</span>
            </button>
        </div>
      )}
    </div>
  )
}

