import { NextRequest, NextResponse } from "next/server";

const GEMMA_MODEL = "gemma-4-26b-a4b-it";

type Pin = { lat: number; lng: number; type: string; label: string };
type Landmark = { name: string; lat: number; lng: number };

function getNearbyPins(pins: Pin[], lat: number, lng: number, radiusMeters: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  return pins.filter((p) => {
    const dLat = toRad(p.lat - lat);
    const dLng = toRad(p.lng - lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat)) * Math.cos(toRad(p.lat)) * Math.sin(dLng / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return dist <= radiusMeters;
  });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMMA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server is missing GEMMA_API_KEY." }, { status: 500 });
  }

  const { start, end, pins }: { start: Landmark; end: Landmark; pins: Pin[] } = await req.json();
  const nearStart = getNearbyPins(pins || [], start.lat, start.lng, 200);
  const nearEnd = getNearbyPins(pins || [], end.lat, end.lng, 200);

  const prompt = `Give a short 4-6 sentence accessible route recommendation for a wheelchair user at UC Santa Cruz, a very hilly campus. Start: ${start.name}. End: ${end.name}. Pins near start: ${JSON.stringify(nearStart)}. Pins near end: ${JSON.stringify(nearEnd)}. If no pins, give general hilly-campus guidance. Output ONLY the recommendation text, nothing else, no reasoning.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMMA_MODEL}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemma API error (${res.status}): ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    const explanation =
      data.candidates?.[0]?.content?.parts?.find((p: any) => p.text && !p.thought)?.text ||
      "No response.";
    return NextResponse.json({ explanation });
  } catch (err: any) {
    clearTimeout(timeout);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
