"use client"

import { submitJobPOD, submitJobPickup } from "@/lib/actions/pod-actions"
import { updateJobStatus, getJobDetails } from "@/app/mobile/jobs/actions"
import { notifyTrackingStateChanged } from "@/lib/tracking-state"

export interface OfflineJob {
    id: string
    jobId: string
    data: Record<string, unknown>
    timestamp: number
    type: 'POD' | 'PICKUP' | 'STATUS'
    retryCount?: number
    lastError?: string
}

const DB_NAME = 'tms_offline_db'
const STORE_NAME = 'offline_jobs'
const DB_VERSION = 1
const MAX_RETRIES = 5

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB not supported'))
            return
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' })
            }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

const notifyQueueChange = () => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tms_offline_queue_change'))
    }
}

export const saveJobOffline = async (jobId: string, data: Record<string, unknown>, type: 'POD' | 'PICKUP' | 'STATUS' = 'POD') => {
    if (typeof window === 'undefined') return

    // De-dupe identical pending status transitions for the same job (e.g. the
    // driver re-taps the same button offline after navigating away). Distinct
    // transitions (Accepted, then Arrived Pickup) are still kept in order.
    if (type === 'STATUS') {
        const existing = await getOfflineJobs()
        if (existing.some(j => j.type === 'STATUS' && j.jobId === jobId && j.data?.status === data.status)) {
            return
        }
    }

    const enrichedData = {
        ...data,
        actualCompletionTime: new Date().toISOString()
    }

    try {
        const db = await openDB()
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        
        await new Promise((resolve, reject) => {
            const request = store.add({
                id: crypto.randomUUID(),
                jobId,
                data: enrichedData,
                timestamp: Date.now(),
                type,
                retryCount: 0
            })
            request.onsuccess = resolve
            request.onerror = reject
        })
        
        notifyQueueChange()
    } catch (err) {
        console.error('Failed to save to IndexedDB, falling back to localStorage', err)
        try {
            const legacy = JSON.parse(localStorage.getItem('tms_offline_jobs') || '[]')
            legacy.push({ jobId, timestamp: Date.now(), type, note: 'fallback' })
            localStorage.setItem('tms_offline_jobs', JSON.stringify(legacy))
            notifyQueueChange()
        } catch (e) { /* give up */ }
    }
}

export const updateOfflineJob = async (job: OfflineJob) => {
    if (typeof window === 'undefined') return
    try {
        const db = await openDB()
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        await new Promise((resolve, reject) => {
            const request = store.put(job)
            request.onsuccess = resolve
            request.onerror = reject
        })
        notifyQueueChange()
    } catch (err) {
        console.error('Failed to update offline job', err)
    }
}

export const getOfflineJobs = async (): Promise<OfflineJob[]> => {
    if (typeof window === 'undefined') return []
    try {
        const db = await openDB()
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        
        return new Promise((resolve, reject) => {
            const request = store.getAll()
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
        })
    } catch {
        return []
    }
}

export const removeOfflineJob = async (id: string) => {
    if (typeof window === 'undefined') return
    try {
        const db = await openDB()
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        
        await new Promise((resolve, reject) => {
            const request = store.delete(id)
            request.onsuccess = resolve
            request.onerror = reject
        })
        notifyQueueChange()
    } catch (err) {
        console.error('Failed to remove from IndexedDB', err)
    }
}

export const syncOfflineJobs = async () => {
    if (typeof window === 'undefined' || !navigator.onLine) return
    
    // Replay in the order the driver performed them — important for stacked
    // status transitions on the same job (e.g. Accepted before Arrived Pickup).
    const jobs = (await getOfflineJobs()).sort((a, b) => a.timestamp - b.timestamp)
    if (jobs.length === 0) return

    for (const job of jobs) {
        // The proof may already be on the server — e.g. the driver re-submitted
        // from the job page after this entry got stuck, or an earlier retry
        // succeeded but we lost the response. Drop the redundant entry so it
        // stops lingering as a "pending" zombie that flickers on every sync.
        // Runs before the retry-cap check so retry-exhausted items clear too.
        if (job.type === 'POD' || job.type === 'PICKUP') {
            try {
                const current = await getJobDetails(job.jobId)
                const podDone = !!(current?.Photo_Proof_Url || current?.Signature_Url)
                const pickupDone = !!(current?.Pickup_Photo_Url || current?.Pickup_Signature_Url)
                if ((job.type === 'POD' && podDone) || (job.type === 'PICKUP' && pickupDone)) {
                    await removeOfflineJob(job.id)
                    continue
                }
            } catch {
                // Lookup failed (offline/transient) — fall through to normal replay.
            }
        }

        if ((job.retryCount || 0) >= MAX_RETRIES) {
            // Status waypoints are low-stakes — give up cleanly so the queue
            // doesn't stay stuck forever. Proof (POD/PICKUP) is kept for review.
            if (job.type === 'STATUS') await removeOfflineJob(job.id)
            continue
        }

        // Simple status transition (เริ่มงาน / ถึงจุดรับ / ถึงจุดส่ง)
        if (job.type === 'STATUS') {
            try {
                const result = await updateJobStatus(
                    job.jobId,
                    String(job.data.status),
                    job.data.driverId ? String(job.data.driverId) : undefined
                )
                if (result.success) {
                    await removeOfflineJob(job.id)
                    notifyTrackingStateChanged()
                } else {
                    await updateOfflineJob({
                        ...job,
                        retryCount: (job.retryCount || 0) + 1,
                        lastError: result.message || 'Server rejected transition'
                    })
                }
            } catch (error) {
                await updateOfflineJob({
                    ...job,
                    retryCount: (job.retryCount || 0) + 1,
                    lastError: error instanceof Error ? error.message : 'Unknown exception'
                })
            }
            continue
        }

        try {
            const formData = new FormData()
            Object.entries(job.data).forEach(([key, value]) => {
                if (key === 'photos' && Array.isArray(value)) {
                    value.forEach((b64: string, i: number) => {
                        const blob = b64ToBlob(b64)
                        formData.append(`photo_${i}`, blob, `offline_photo_${i}.jpg`)
                    })
                    formData.append('photo_count', value.length.toString())
                } else if (key === 'signature' && typeof value === 'string') {
                    formData.append('signature', b64ToBlob(value), 'signature.png')
                } else if (key === 'pod_report' && typeof value === 'string') {
                    formData.append('pod_report', b64ToBlob(value), 'report.jpg')
                } else if (key === 'floor_climb_report' && typeof value === 'string') {
                    formData.append('floor_climb_report', b64ToBlob(value), `Floor_Climb_Report_${job.jobId}.jpg`)
                } else if (key === 'pickup_report' && typeof value === 'string') {
                    formData.append('pickup_report', b64ToBlob(value), 'report.jpg')
                } else if (value !== null && value !== undefined) {
                    formData.append(key, String(value))
                }
            })

            const result = job.type === 'PICKUP' 
                ? await submitJobPickup(job.jobId, formData)
                : await submitJobPOD(job.jobId, formData)

            if (result.success) {
                await removeOfflineJob(job.id)
            } else {
                await updateOfflineJob({
                    ...job,
                    retryCount: (job.retryCount || 0) + 1,
                    lastError: typeof result.error === 'string' ? result.error : 'Server error'
                })
            }
        } catch (error) {
            await updateOfflineJob({
                ...job,
                retryCount: (job.retryCount || 0) + 1,
                lastError: error instanceof Error ? error.message : 'Unknown exception'
            })
        }
    }
}

export function blobToB64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
    })
}

function b64ToBlob(b64Data: string, contentType = 'image/jpeg') {
    if (!b64Data || !b64Data.includes(',')) return new Blob([], { type: contentType })
    
    const parts = b64Data.split(',')
    const byteCharacters = atob(parts[1])
    const byteArrays = []
    
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512)
        const byteNumbers = new Array(slice.length)
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        byteArrays.push(byteArray)
    }
    
    return new Blob(byteArrays, { type: contentType })
}
