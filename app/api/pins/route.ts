import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("slugway");
    const pins = await db.collection("pins").find({}).sort({ createdAt: -1 }).limit(500).toArray();
    return NextResponse.json({ pins });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lat, lng, type, label, source } = body;
    if (typeof lat !== "number" || typeof lng !== "number" || !type) {
      return NextResponse.json({ error: "lat, lng, and type are required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("slugway");
    const doc = {
      lat,
      lng,
      type,
      label: label || type,
      source: source || "manual", // "manual" or "photo-ai"
      createdAt: new Date(),
    };
    const result = await db.collection("pins").insertOne(doc);
    return NextResponse.json({ pin: { ...doc, _id: result.insertedId } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
