"use client"

import { forwardRef } from "react"

type Props = {
  driverName: string
  vehiclePlate: string
  items: Record<string, boolean>
  photos: string[] // Object URLs
  signature: string | null // Object URL
}

export const VehicleCheckReport = forwardRef<HTMLDivElement, Props>(({ driverName, vehiclePlate, items, photos, signature }, ref) => {
  const checklist = [
    "น้ำมันเครื่อง", "น้ำในหม้อน้ำ", "ลมยาง", "ไฟเบรค/ไฟเลี้ยว", 
    "สภาพยางรถยนต์", "อุปกรณ์ฉุกเฉิน", "เอกสารประจำรถ"
  ]

  const passedCount = Object.values(items).filter(Boolean).length
  const totalCount = checklist.length
  const status = passedCount === totalCount ? "Pass (ปกติ)" : "Fail (พบจุดผิดปกติ)"

  return (
    <div ref={ref} id="report-capture-area-inner" style={{ backgroundColor: '#ffffff', color: '#000000', padding: '32px', fontFamily: 'sans-serif', width: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1e293b', paddingBottom: '16px', marginBottom: '24px' }}>
        <div>
           <h1 style={{ fontSize: '24px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.025em' }}>รายงานการตรวจสอบสภาพรถ / Vehicle Inspection Report</h1>
           <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>ใบแจ้งการตรวจสอบรายวัน (Daily Check)</p>
        </div>
        <div style={{ textAlign: 'right' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>{vehiclePlate}</h2>
            <p style={{ fontSize: '14px' }}>{new Date().toLocaleDateString('th-TH', { 
                year: 'numeric', month: 'long', day: 'numeric', 
                hour: '2-digit', minute: '2-digit' 
            })}</p>
        </div>
      </div>

      {/* Info Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ fontWeight: 'bold', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', marginBottom: '8px' }}>ข้อมูลผู้ตรวจสอบ</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', fontSize: '14px', rowGap: '4px' }}>
                <span style={{ color: '#64748b' }}>ผู้ตรวจสอบ:</span>
                <span style={{ fontWeight: 500 }}>{driverName}</span>
                
                <span style={{ color: '#64748b' }}>ทะเบียนรถ:</span>
                <span>{vehiclePlate}</span>
                
                <span style={{ color: '#64748b' }}>สถานะรวม:</span>
                <span style={{ color: passedCount === totalCount ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                    {status}
                </span>
            </div>
        </div>
      </div>

      {/* Checklist Table */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontWeight: 'bold', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', marginBottom: '8px' }}>รายการที่ตรวจสอบ (Checklist Items)</h3>
        <table style={{ width: '100%', fontSize: '14px', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                <tr>
                    <th style={{ padding: '8px', border: '1px solid #cbd5e1', width: '48px', textAlign: 'center' }}>#</th>
                    <th style={{ padding: '8px', border: '1px solid #cbd5e1' }}>รายการตรวจสอบ</th>
                    <th style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center', width: '96px' }}>ผลการตรวจ</th>
                </tr>
            </thead>
            <tbody>
                {checklist.map((item, i) => (
                    <tr key={item}>
                        <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{i + 1}</td>
                        <td style={{ padding: '8px', border: '1px solid #cbd5e1' }}>{item}</td>
                        <td style={{ padding: '8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                            {items[item] ? (
                                <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ ผ่าน</span>
                            ) : (
                                <span style={{ color: '#ef4444', fontWeight: 'bold' }}>✗ ไม่ผ่าน</span>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {/* Photos */}
      {photos.length > 0 && (
          <div style={{ marginBottom: '32px', pageBreakInside: 'avoid' }}>
            <h3 style={{ fontWeight: 'bold', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px', marginBottom: '16px' }}>รูปถ่ายประกอบการตรวจสอบ (Inspection Photos)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                {photos.map((src, i) => (
                    <div key={i} style={{ aspectRatio: '16/9', backgroundColor: '#f1f5f9', borderRadius: '4px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="Check" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                ))}
            </div>
          </div>
      )}

      {/* Signatures */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', pageBreakInside: 'avoid' }}>
        <div style={{ width: '256px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '16px', textAlign: 'center' }}>
             <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>ลายเซ็นผู้ขับขี่ (Driver Signature)</p>
             <div style={{ height: '96px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
                {signature ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signature} alt="Signature" style={{ maxHeight: '100%', maxWidth: '100%' }} />
                ) : (
                    <span style={{ color: '#e2e8f0', fontStyle: 'italic' }}>No Signature</span>
                )}
             </div>
             <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '8px' }}>
                <p style={{ fontWeight: 500, fontSize: '14px' }}>{driverName}</p>
                <p style={{ fontSize: '12px', color: '#94a3b8' }}>{new Date().toLocaleString('th-TH')}</p>
             </div>
        </div>
      </div>
      
      {/* Footer */}
      <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
        Generated by DRouteMind ePOD System
      </div>
    </div>
  )
})

VehicleCheckReport.displayName = "VehicleCheckReport"
