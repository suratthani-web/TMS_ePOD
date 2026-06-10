"use client";

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

export interface ProfitPoint {
    lat: number;
    lng: number;
    profit: number; // Positive for profit, lower/negative for low performance
}

interface ProfitabilityHeatmapProps {
    data: ProfitPoint[];
    intensity?: number;
}

/**
 * Profitability Heatmap Layer
 * สีเขียว = กำไรสูง
 * สีแดง = กำไรน้อย/ขาดทุน (ใช้ intensity ช่วยคุม)
 */
export function ProfitabilityHeatmap({ data, intensity = 0.8 }: ProfitabilityHeatmapProps) {
    const map = useMap();

    useEffect(() => {
        if (!map || !data || data.length === 0) return;

        // แปลงข้อมูลเป็นรูปแบบที่ Leaflet Heatmap เข้าใจ [lat, lng, intensity]
        const heatPoints = data.map(p => {
            // คำนวณความเข้มตามกำไร (ปรับให้เข้มขึ้นสำหรับค่าที่น้อยกว่า 5000)
            const normalizedIntensity = Math.min(Math.max(p.profit / 4000, 0.2), 1) * intensity;
            return [p.lat, p.lng, normalizedIntensity] as [number, number, number];
        });

        const heatLayer = L.heatLayer(heatPoints, {
            radius: 45,
            blur: 25,
            maxZoom: 13,
            minOpacity: 0.4,
            gradient: {
                0.2: '#ef4444', // Red (Low Profit)
                0.5: '#f59e0b', // Amber (Medium)
                0.8: '#10b981', // Emerald (High Profit)
                1.0: '#059669'  // Dark Green (Peak)
            }
        }).addTo(map);

        return () => {
            map.removeLayer(heatLayer);
        };
    }, [map, data, intensity]);

    return null;
}
