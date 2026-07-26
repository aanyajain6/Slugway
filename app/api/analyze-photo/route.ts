import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

const GEMMA_MODEL = "gemma-4-26b-a4b-it";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMMA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server is missing GEMMA_API_KEY." }, { status: 500 });
  }

  try {
    const { imageBase64, mimeType, lat, lng } = await req.json();
    if (!imageBase64 || typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "imageBase64, lat, and lng are required" }, { status: 400 });
    }

    const prompt = `You are an accessibility inspector for a university campus. Look at this photo of a walkway/path.
Decide if this location is UNSAFE or difficult for a wheelchair user or someone with mobility limitations
(examples: stairs with no ramp, steep incline, broken/uneven pavement, narrow gap, obstruction, no curb cut).
Respond with ONLY a JSON object, no markdown, no extra text, in this exact shape:
{"unsafe": true or false, "pin_type": "stairs" | "steep" | "obstruction" | "ramp" | "elevator" | "none", "reason": "one short sentence"}
Use "ramp" or "elevator" as pin_type only if the photo shows a GOOD accessible feature worth marking positively; otherwise use the hazard type or "none" if the path looks fine.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMMA_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemma API error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || "{}";
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let parsed: { unsafe: boolean; pin_type: string; reason: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Could not parse Gemma's response", raw: rawText }, { status: 500 });
    }

    let savedPin = null;
    if (parsed.unsafe && parsed.pin_type !== "none") {
      const client = await clientPromise;
      const db = client.db("slugway");
      const doc = {
        lat,
        lng,
        type: parsed.pin_type,
        label: parsed.reason,
        source: "photo-ai",
        createdAt: new Date(),
      };
      const result = await db.collection("pins").insertOne(doc);
      savedPin = { ...doc, _id: result.insertedId };
    }

    return NextResponse.json({ analysis: parsed, pin: savedPin });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
