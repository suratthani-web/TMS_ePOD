export interface ParsedFuelReceipt {
  amount?: number;
  totalAmount?: number;
  liters?: number;
  unitPrice?: number;
  pricePerLiter?: number;
  stationName?: string;
  mileage?: number;
  plateNumber?: string;
  dateTime?: string;
  date?: string;
  time?: string;
}

/**
 * Gemini-powered Fuel Receipt OCR Service
 * Accepts base64 string (with or without data URI prefix) or an HTTP/HTTPS image URL.
 */
export async function parseFuelReceiptWithAI(imageOrUrl: string, mimeType: string = 'image/jpeg'): Promise<ParsedFuelReceipt> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  let cleanBase64 = "";
  let finalMimeType = mimeType;

  if (imageOrUrl.startsWith("http://") || imageOrUrl.startsWith("https://")) {
    const res = await fetch(imageOrUrl);
    if (!res.ok) throw new Error(`Failed to fetch image from URL: ${res.statusText}`);
    const contentType = res.headers.get("content-type");
    if (contentType) finalMimeType = contentType;
    const arrayBuffer = await res.arrayBuffer();
    cleanBase64 = Buffer.from(arrayBuffer).toString("base64");
  } else {
    cleanBase64 = imageOrUrl.split(',')[1] || imageOrUrl;
  }

  const prompt = `
You are a highly accurate Thai OCR and Document Extraction engine.
You are given a photo of a Thai fuel receipt / tax invoice (ใบเสร็จรับเงิน/ใบกำกับภาษี).
Note: The image may be rotated sideways.

Carefully read and extract every character:
1. "amount": Total price/amount paid in THB (รวมเป็นเงิน, number only).
2. "liters": Number of liters pumped (จำนวนลิตร, number only).
3. "unitPrice": Price per liter in THB (ราคาต่อลิตร / ราคา/ลิตร, number only, e.g. 38.70). If not printed, calculate amount / liters.
4. "stationName": EXACT full registered company name of the SELLER / ISSUER (ผู้ขาย/ผู้ออกใบกำกับ) at the TOP header of the receipt (e.g. บริษัท ขวัญเมือง ปิโตรเลียม ดีเซลออยล์ จำกัด). DO NOT confuse with customer info (ข้อมูลลูกค้า). Strictly transcribe verbatim.
5. "mileage": Odometer reading if visible on receipt (เลขไมล์, number only, or null).
6. "plateNumber": Vehicle registration plate (ทะเบียนรถ) printed on receipt (e.g. 3ฒว2502, or null).
7. "dateTime": Date and time in ISO format (YYYY-MM-DDTHH:mm:ss). Convert Buddhist year (e.g. 2569 -> 2026).

Provide JSON ONLY:
{
  "amount": 700.00,
  "liters": 18.088,
  "unitPrice": 38.70,
  "stationName": "บริษัท ขวัญเมือง ปิโตรเลียม ดีเซลออยล์ จำกัด",
  "mileage": 230361,
  "plateNumber": "3ฒว2502",
  "dateTime": "2026-08-25T18:22:13"
}
`.trim();

  const modelsToTry = ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-3.5-flash"];

  for (const modelName of modelsToTry) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType: finalMimeType, data: cleanBase64 } }
            ]
          }],
          generationConfig: {
            temperature: 0.0,
            responseMimeType: 'application/json',
            ...(modelName === "gemini-3-flash-preview" ? { thinkingConfig: { thinkingLevel: "LOW" } } : {})
          }
        }),
        signal: AbortSignal.timeout(12000)
      });

      if (!res.ok) {
        console.warn(`[fuel-ocr] model ${modelName} returned status ${res.status}`);
        continue;
      }

      const json = await res.json();
      const parts = Array.isArray(json?.candidates?.[0]?.content?.parts) ? json.candidates[0].content.parts : [];
      const textPart = parts.find((p: Record<string, unknown>) => !p.thought && typeof p.text === 'string') || parts[0];
      const text = textPart?.text;
      if (text) {
        const jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(jsonStr) as ParsedFuelReceipt;
        
        // Ensure unitPrice / pricePerLiter calculation
        const total = parsed.amount ?? parsed.totalAmount;
        const liters = parsed.liters;
        let unitPrice = parsed.unitPrice ?? parsed.pricePerLiter;
        if (!unitPrice && total && liters && liters > 0) {
          unitPrice = +(total / liters).toFixed(2);
        }
        
        parsed.amount = total;
        parsed.totalAmount = total;
        parsed.unitPrice = unitPrice;
        parsed.pricePerLiter = unitPrice;

        if (parsed.dateTime) {
          const [d, t] = parsed.dateTime.split('T');
          parsed.date = d;
          parsed.time = t?.slice(0, 8);
        }

        return parsed;
      }
    } catch (error) {
      console.warn(`[fuel-ocr] error with model ${modelName}:`, error);
    }
  }

  throw new Error("Failed to parse fuel receipt with AI OCR");
}
