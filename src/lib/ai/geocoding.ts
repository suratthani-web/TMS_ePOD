"use server"

/**
 * Geocoding & AI Location Search Utility — TMS 2026
 * - Direct coordinate parsing (lat, lng)
 * - Google Maps URL resolver (including maps.app.goo.gl short links)
 * - AI-powered location search via Google Gemini (finds companies, factories, POIs in Thailand)
 * - OpenStreetMap / Nominatim fallback
 */
import { GoogleGenerativeAI } from "@google/generative-ai";

const getGoogleMapsApiKey = () => process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const TH_BOUNDS = { minLat: 5.5, maxLat: 20.6, minLng: 97.3, maxLng: 105.7 };
const inThailand = (lat: number, lng: number) =>
  lat >= TH_BOUNDS.minLat && lat <= TH_BOUNDS.maxLat &&
  lng >= TH_BOUNDS.minLng && lng <= TH_BOUNDS.maxLng;

export type GeocodeResult = {
  lat: number
  lng: number
  display_name: string
  source?: 'coordinate' | 'google_maps' | 'google' | 'ai' | 'osm'
}

export type AILocationResult = {
  name: string
  address: string
  lat: number
  lng: number
  source: 'ai' | 'coordinate' | 'google_maps' | 'google'
}

/**
 * Google Places API (New) — Text Search for Thai businesses/factories/POIs.
 * Runs server-side only (key never reaches the browser). Capped at 200/day
 * in the Cloud console, so it can never generate a bill; on failure/over-quota
 * it returns [] and callers fall through to Gemini AI / OSM.
 */
export async function searchPlacesGoogle(query: string): Promise<AILocationResult[]> {
  const clean = query.trim();
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey || clean.length < 2) return [];

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: clean,
        languageCode: "th",
        regionCode: "TH",
        maxResultCount: 5,
        // Force results inside Thailand — the server may run outside TH (Vercel),
        // so IP-based bias would otherwise return foreign matches.
        locationRestriction: {
          rectangle: {
            low: { latitude: TH_BOUNDS.minLat, longitude: TH_BOUNDS.minLng },
            high: { latitude: TH_BOUNDS.maxLat, longitude: TH_BOUNDS.maxLng },
          },
        },
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      places?: {
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
      }[];
    };

    const results: AILocationResult[] = [];
    for (const p of data.places ?? []) {
      const lat = p.location?.latitude;
      const lng = p.location?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number" || !inThailand(lat, lng)) continue;
      results.push({
        name: p.displayName?.text || clean,
        address: p.formattedAddress || "",
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
        source: "google",
      });
    }
    return results;
  } catch (err) {
    console.warn("[searchPlacesGoogle] failed:", err);
    return [];
  }
}

export type PlaceAutocompletePrediction = {
  placeId: string
  primary: string       // main text (e.g. business name)
  secondary: string     // secondary text (e.g. address / district)
  label: string         // combined display text
}

/**
 * Google Places Autocomplete (New) — cheap keystroke predictions.
 *
 * Much cheaper than Text Search: the typeahead calls this per keystroke, and the
 * full coordinates are fetched once (placeDetailsGoogle) only when the user picks
 * a result. Pass a stable `sessionToken` across the keystrokes + the final
 * details call so Google bills the whole thing as ONE Autocomplete session.
 * Returns [] on failure/over-quota so callers fall through to the old sources.
 */
export async function placesAutocompleteGoogle(
  query: string,
  sessionToken?: string,
): Promise<PlaceAutocompletePrediction[]> {
  const clean = query.trim();
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey || clean.length < 2) return [];

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input: clean,
        languageCode: "th",
        regionCode: "TH",
        ...(sessionToken ? { sessionToken } : {}),
        locationRestriction: {
          rectangle: {
            low: { latitude: TH_BOUNDS.minLat, longitude: TH_BOUNDS.minLng },
            high: { latitude: TH_BOUNDS.maxLat, longitude: TH_BOUNDS.maxLng },
          },
        },
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as {
      suggestions?: {
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }[];
    };

    const out: PlaceAutocompletePrediction[] = [];
    for (const s of data.suggestions ?? []) {
      const p = s.placePrediction;
      if (!p?.placeId) continue;
      const primary = p.structuredFormat?.mainText?.text || p.text?.text || "";
      const secondary = p.structuredFormat?.secondaryText?.text || "";
      if (!primary) continue;
      out.push({
        placeId: p.placeId,
        primary,
        secondary,
        label: p.text?.text || [primary, secondary].filter(Boolean).join(", "),
      });
    }
    return out;
  } catch (err) {
    console.warn("[placesAutocompleteGoogle] failed:", err);
    return [];
  }
}

/**
 * Google Place Details (New) — resolve a placeId (from placesAutocompleteGoogle)
 * to coordinates + name + address. Pass the same `sessionToken` used for the
 * autocomplete keystrokes to close the billing session. Returns null on failure.
 */
export async function placeDetailsGoogle(
  placeId: string,
  sessionToken?: string,
): Promise<AILocationResult | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey || !placeId) return null;

  try {
    const url =
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}` +
      (sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "");
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "displayName,formattedAddress,location",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return null;

    const p = (await res.json()) as {
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    };

    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") return null;

    return {
      name: p.displayName?.text || p.formattedAddress || "",
      address: p.formattedAddress || "",
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      source: "google",
    };
  } catch (err) {
    console.warn("[placeDetailsGoogle] failed:", err);
    return null;
  }
}

/**
 * Google Geocoding API — address → coordinates (forward geocode), Thailand only.
 * Server-side, capped 300/day. Returns null on failure so callers fall back.
 */
async function geocodeGoogle(address: string): Promise<GeocodeResult | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}` +
      `&language=th&region=th&components=country:TH&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      results?: { formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }[];
    };
    if (data.status !== "OK" || !data.results?.length) return null;
    const first = data.results[0];
    const lat = first.geometry?.location?.lat;
    const lng = first.geometry?.location?.lng;
    if (typeof lat !== "number" || typeof lng !== "number" || !inThailand(lat, lng)) return null;
    return {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      display_name: first.formatted_address || address,
      source: "google",
    };
  } catch (err) {
    console.warn("[geocodeGoogle] failed:", err);
    return null;
  }
}

/**
 * Google reverse geocode — coordinates → Thai address. Server-side, capped.
 */
async function reverseGeocodeGoogle(lat: number, lng: number): Promise<string | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;
  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}` +
      `&language=th&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      results?: { formatted_address?: string }[];
    };
    if (data.status !== "OK") return null;
    const label = data.results?.[0]?.formatted_address?.trim();
    return label || null;
  } catch (err) {
    console.warn("[reverseGeocodeGoogle] failed:", err);
    return null;
  }
}

/**
 * Resolves a Google Maps URL (including short links like maps.app.goo.gl)
 * into precise Latitude, Longitude, and place name.
 */
export async function resolveGoogleMapsUrl(url: string): Promise<{ lat: number; lng: number; name?: string } | null> {
  if (!url || !url.trim().startsWith('http')) return null;
  const cleanUrl = url.trim();

  // 1. Direct Regex checks on URL string
  const latLngAt = cleanUrl.match(/@(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (latLngAt) {
    return { lat: parseFloat(latLngAt[1]), lng: parseFloat(latLngAt[2]) };
  }

  const m3d = cleanUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m3d) {
    return { lat: parseFloat(m3d[1]), lng: parseFloat(m3d[2]) };
  }

  const queryMatch = cleanUrl.match(/[?&](?:q|ll|query)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (queryMatch) {
    return { lat: parseFloat(queryMatch[1]), lng: parseFloat(queryMatch[2]) };
  }

  // 2. If it's a short URL (maps.app.goo.gl or goo.gl/maps), fetch redirect destination
  if (cleanUrl.includes('maps.app.goo.gl') || cleanUrl.includes('goo.gl/maps') || cleanUrl.includes('maps.google.com') || cleanUrl.includes('google.com/maps')) {
    try {
      const response = await fetch(cleanUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(6000)
      });

      const finalUrl = response.url || '';
      
      // Try regex on final redirected URL
      const finalAt = finalUrl.match(/@(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (finalAt) return { lat: parseFloat(finalAt[1]), lng: parseFloat(finalAt[2]) };

      const final3d = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (final3d) return { lat: parseFloat(final3d[1]), lng: parseFloat(final3d[2]) };

      const finalQuery = finalUrl.match(/[?&](?:q|ll|query)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (finalQuery) return { lat: parseFloat(finalQuery[1]), lng: parseFloat(finalQuery[2]) };

      // Try parsing HTML content for coordinates / meta tags
      const html = await response.text();
      const metaMatch = html.match(/content="https:\/\/maps\.google\.com\/maps\/api\/staticmap\?[^"]*center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/i) 
                     || html.match(/itemprop="latitude"\s+content="(-?\d+\.\d+)"[\s\S]*?itemprop="longitude"\s+content="(-?\d+\.\d+)"/i)
                     || html.match(/\/@(-?\d+\.\d+),(-?\d+\.\d+),/);

      if (metaMatch) {
        return { lat: parseFloat(metaMatch[1]), lng: parseFloat(metaMatch[2]) };
      }
    } catch (err) {
      console.warn('[resolveGoogleMapsUrl] Follow redirect error:', err);
    }
  }

  return null;
}

/**
 * Searches real-world locations in Thailand using Google Gemini AI.
 * Solves the issue where OpenStreetMap lacks Thai company/factory/POI data.
 */
export async function searchLocationWithAI(query: string): Promise<AILocationResult[]> {
  const clean = query.trim();
  if (!clean || clean.length < 2) return [];

  // 1. Check if user typed coordinates directly: "13.528431, 100.672911"
  const coordMatch = clean.match(/^(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[2]);
    if (lat >= 5.5 && lat <= 20.6 && lng >= 97.3 && lng <= 105.7) {
      return [{
        name: `พิกัด: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        address: `ละติจูด ${lat.toFixed(6)}, ลองจิจูด ${lng.toFixed(6)}`,
        lat,
        lng,
        source: 'coordinate'
      }];
    }
  }

  // 2. Check if user pasted a Google Maps URL
  if (clean.startsWith('http') && (clean.includes('maps') || clean.includes('goo.gl'))) {
    const resolved = await resolveGoogleMapsUrl(clean);
    if (resolved) {
      return [{
        name: resolved.name || 'ตำแหน่งจากลิงก์ Google Maps',
        address: `พิกัด ${resolved.lat.toFixed(6)}, ${resolved.lng.toFixed(6)}`,
        lat: resolved.lat,
        lng: resolved.lng,
        source: 'google_maps'
      }];
    }
  }

  // 3. AI POI Search with Gemini
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[searchLocationWithAI] No Gemini API key found');
    return [];
  }

  const modelCandidates = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-flash-latest"
  ];

  const genAI = new GoogleGenerativeAI(apiKey);

  const prompt = `
You are an expert Thailand Logistics and Geolocation Specialist.
The user is searching for a business, company, factory, industrial estate, warehouse, branch, or landmark in Thailand for the query: "${clean}".

Find up to 4 most accurate real-world locations in Thailand matching this query.
For example, if the query is "formica", you should find "บริษัท ฟอร์ไมก้า (ประเทศไทย) จำกัด" (such as Bangpoo Industrial Estate Samut Prakan, Muang Thong Thani office, etc.).

Return ONLY a valid JSON array of objects with this exact structure:
[
  {
    "name": "ชื่อสถานที่/บริษัท พร้อมระบุสาขาหรือนิคมฯ ในไทย เช่น บริษัท ฟอร์ไมก้า (ประเทศไทย) จำกัด (โรงงานบางปู)",
    "address": "ที่อยู่ภาษาไทยแบบเต็ม (ตำบล อำเภอ จังหวัด รหัสไปรษณีย์)",
    "lat": 13.5284,
    "lng": 100.6729
  }
]

CRITICAL RULES:
- Only return places in Thailand (Latitude: 5.5 to 20.6, Longitude: 97.3 to 105.7).
- Make Latitude and Longitude as precise as possible for the actual site/branch.
- Do NOT output any markdown formatting, explanation, or backticks other than the raw JSON array.
`.trim();

  for (const modelName of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });

      const response = await model.generateContent(prompt);
      const text = response.response.text().trim();
      const cleanedJson = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

      const parsed = JSON.parse(cleanedJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const results: AILocationResult[] = [];
        for (const item of parsed) {
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lng);
          // Thailand bounding box verification
          if (!isNaN(lat) && !isNaN(lng) && lat >= 5.5 && lat <= 20.6 && lng >= 97.3 && lng <= 105.7) {
            results.push({
              name: item.name || clean,
              address: item.address || '',
              lat: Number(lat.toFixed(6)),
              lng: Number(lng.toFixed(6)),
              source: 'ai'
            });
          }
        }
        if (results.length > 0) {
          return results;
        }
      }
    } catch (err) {
      console.warn(`[searchLocationWithAI] Error with model ${modelName}:`, err);
      // Try next candidate
    }
  }

  return [];
}

/**
 * Standard geocodeAddress function used across the app (Create Job, Routes, etc.).
 * Combines Direct Coordinates, Google Maps URLs, OpenStreetMap, and Gemini AI.
 */
export async function geocodeAddress(address: string, context?: string): Promise<GeocodeResult | null> {
  const cleanAddress = address.trim().replace(/\s+/g, ' ');
  if (!cleanAddress || cleanAddress.length < 2) return null;

  // 0. Direct Coordinate Detection: 13.949013, 100.860599
  const latLngRegex = /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/;
  const match = cleanAddress.match(latLngRegex);
  if (match) {
    return {
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2]),
      display_name: cleanAddress,
      source: 'coordinate'
    };
  }

  // 0.1 Google Maps URL Detection
  if (cleanAddress.startsWith('http') && (cleanAddress.includes('maps') || cleanAddress.includes('goo.gl'))) {
    const resolved = await resolveGoogleMapsUrl(cleanAddress);
    if (resolved) {
      return {
        lat: resolved.lat,
        lng: resolved.lng,
        display_name: resolved.name || `พิกัด ${resolved.lat.toFixed(6)}, ${resolved.lng.toFixed(6)}`,
        source: 'google_maps'
      };
    }
  }

  // 1. Google first: Places (New) for named POIs, then Geocoding for addresses.
  const places = await searchPlacesGoogle(cleanAddress);
  if (places.length > 0) {
    const top = places[0];
    return {
      lat: top.lat,
      lng: top.lng,
      display_name: top.address ? `${top.name}, ${top.address}` : top.name,
      source: 'google',
    };
  }
  const googleGeo = await geocodeGoogle(cleanAddress);
  if (googleGeo) return googleGeo;

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const performSearch = async (query: string) => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1&countrycodes=th`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'TMS-Logistics-Platform-v2 (contact@logispro-epod.app)' 
        },
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.status === 429) {
        return 'rate-limited';
      }

      if (!response.ok) return null;
      const data = await response.json();
      if (data && data.length > 0) {
        const first = data[0];
        
        // Reject broad administrative matches when looking for a specific address
        if (parseFloat(first.importance) < 0.2 && first.type === 'administrative') {
            return null;
        }

        return {
          lat: parseFloat(first.lat),
          lng: parseFloat(first.lon),
          display_name: first.display_name,
          source: 'osm' as const
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  // 1. Search full query in OSM
  let result = await performSearch(cleanAddress);
  if (result === 'rate-limited') { await sleep(1200); result = await performSearch(cleanAddress); }
  if (result && typeof result !== 'string') return result;

  // 2. Search with Context
  if (context) {
    await sleep(800);
    result = await performSearch(`${cleanAddress} ${context}`);
    if (result && typeof result !== 'string') return result;
  }

  // 3. AI POI Search with Gemini (The game changer for companies/factories like "Formica")
  try {
    const aiResults = await searchLocationWithAI(cleanAddress);
    if (aiResults && aiResults.length > 0) {
      const top = aiResults[0];
      return {
        lat: top.lat,
        lng: top.lng,
        display_name: top.address ? `${top.name}, ${top.address}` : top.name,
        source: 'ai'
      };
    }
  } catch (err) {
    console.warn('[geocodeAddress] AI search fallback error:', err);
  }

  // 4. Smart Cleanup (Strip legal prefixes)
  const thaiPrefixes = ['บริษัท', 'ห้างหุ้นส่วน', 'บมจ.', 'หจก.', 'โรงงาน', 'คลังสินค้า', 'สำนักงาน'];
  const engSuffixes = [', Ltd.', ' Co., Ltd.', ' Co.,Ltd.', ' Ltd.', ' Co. Ltd.', ' PLC', ' Corp.'];
  let strippedAddress = cleanAddress;
  for (const p of thaiPrefixes) if (strippedAddress.startsWith(p)) { strippedAddress = strippedAddress.replace(p, '').trim(); break; }
  for (const s of engSuffixes) { const regex = new RegExp(s.replace('.', '\\.'), 'gi'); strippedAddress = strippedAddress.replace(regex, '').trim(); }
  
  if (strippedAddress !== cleanAddress) {
    await sleep(800);
    result = await performSearch(strippedAddress);
    if (result && typeof result !== 'string') return result;
  }

  return null;
}

/**
 * Reverse geocode: coordinates → Thai place name/address (Nominatim)
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) return null;

  // Google reverse geocode first, then Nominatim fallback.
  const googleLabel = await reverseGeocodeGoogle(lat, lng);
  if (googleLabel) return googleLabel;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=th`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TMS-Logistics-Platform-v2 (contact@logispro-epod.app)' },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const name = (data?.name && String(data.name).trim()) || (data?.display_name && String(data.display_name).trim()) || null;
    return name || null;
  } catch {
    return null;
  }
}
