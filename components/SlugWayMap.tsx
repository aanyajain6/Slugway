"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, CircleMarker, Polyline } from "leaflet";

const UCSC_CENTER: [number, number] = [36.9916, -122.0583];

const LANDMARKS = [
  { name: "Bay Tree Bookstore", lat: 36.9995, lng: -122.0587 },
  { name: "McHenry Library", lat: 36.9963, lng: -122.0592 },
  { name: "Kerr Hall", lat: 36.9967, lng: -122.0619 },
  { name: "Porter College", lat: 36.995, lng: -122.065 },
  { name: "Cowell College", lat: 36.9963, lng: -122.053 },
  { name: "Science Hill (Baskin Engineering)", lat: 37.0006, lng: -122.0632 },
  { name: "East Field House", lat: 36.9948, lng: -122.0546 },
  { name: "Quarry Plaza", lat: 36.9977, lng: -122.0562 },
  { name: "Crown College", lat: 36.9995, lng: -122.0548 },
  { name: "Oakes College", lat: 36.9891, lng: -122.0645 },
];

const PIN_TYPES = [
  { key: "stairs", label: "Stairs / no ramp", color: "#dc2626" },
  { key: "steep", label: "Steep incline", color: "#f97316" },
  { key: "ramp", label: "Ramp / curb cut", color: "#16a34a" },
  { key: "elevator", label: "Elevator", color: "#16a34a" },
  { key: "obstruction", label: "Obstruction / hazard", color: "#dc2626" },
];

type Pin = { lat: number; lng: number; type: string; label: string };

function colorForType(type: string) {
  return PIN_TYPES.find((p) => p.key === type)?.color || "#64748b";
}

export default function SlugWayMap() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLineRef = useRef<Polyline | null>(null);
  const pinsRef = useRef<Pin[]>([]);
  const dropModeRef = useRef(false);
  const photoModeRef = useRef(false);
  const pendingPhotoCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dropMode, setDropMode] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(1);
  const [reportedPoints, setReportedPoints] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [status, setStatus] = useState(
    "Drop accessibility pins on the map, then get an AI-reasoned route. Pins are shared with everyone using SlugWay."
  );
  const [loading, setLoading] = useState(false);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);

  useEffect(() => {
    photoModeRef.current = photoMode;
    if (mapRef.current) {
      mapRef.current.getContainer().style.cursor = photoMode ? "copy" : dropModeRef.current ? "crosshair" : "";
    }
  }, [photoMode]);

  useEffect(() => {
    dropModeRef.current = dropMode;
    if (mapRef.current) {
      mapRef.current.getContainer().style.cursor = dropMode ? "crosshair" : "";
    }
  }, [dropMode]);

  useEffect(() => {
    let map: LeafletMap;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (!mapDivRef.current || mapRef.current) return;

      map = L.map(mapDivRef.current, { zoomControl: true }).setView(UCSC_CENTER, 15);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      LANDMARKS.forEach((l) =>
        L.marker([l.lat, l.lng], { opacity: 0.55 }).addTo(map).bindPopup(l.name)
      );

      function drawPin(pin: Pin) {
        pinsRef.current.push(pin);
        L.circleMarker([pin.lat, pin.lng], {
          radius: 8,
          color: colorForType(pin.type),
          fillColor: colorForType(pin.type),
          fillOpacity: 0.9,
          weight: 2,
        })
          .addTo(map)
          .bindPopup(pin.label);
      }

      // Load shared pins from the database
      try {
        const res = await fetch("/api/pins");
        const data = await res.json();
        (data.pins || []).forEach((p: any) => drawPin({ lat: p.lat, lng: p.lng, type: p.type, label: p.label }));
      } catch {
        // If the DB isn't reachable yet, the map still works with local-only pins.
      }

      map.on("click", async (e: any) => {
        if (photoModeRef.current) {
          pendingPhotoCoordsRef.current = { lat: e.latlng.lat, lng: e.latlng.lng };
          fileInputRef.current?.click();
          return;
        }
        if (!dropModeRef.current) return;
        const choice = prompt(
          "Pin type:\n" + PIN_TYPES.map((p, i) => `${i + 1}. ${p.label}`).join("\n")
        );
        const idx = parseInt(choice || "", 10) - 1;
        const type = PIN_TYPES[idx];
        if (!type) return;
        const pin: Pin = { lat: e.latlng.lat, lng: e.latlng.lng, type: type.key, label: type.label };
        drawPin(pin);
        setReportedPoints((prev) => [
          ...prev,
          { name: `Reported: ${type.label} near ${pin.lat.toFixed(4)},${pin.lng.toFixed(4)}`, lat: pin.lat, lng: pin.lng },
        ]);
        try {
          await fetch("/api/pins", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...pin, source: "manual" }),
          });
        } catch {
          // Pin still shows locally even if the save fails.
        }
      });

      (map as any)._drawPin = drawPin;
    })();

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  async function handlePhotoSelected(file: File) {
    const coords = pendingPhotoCoordsRef.current;
    if (!coords) return;
    setAnalyzingPhoto(true);
    setStatus("Analyzing photo with Gemma 4 vision...");

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/analyze-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: file.type,
          lat: coords.lat,
          lng: coords.lng,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");

      if (data.pin) {
        const map = mapRef.current as any;
        map?._drawPin?.({ lat: data.pin.lat, lng: data.pin.lng, type: data.pin.type, label: data.pin.label });
        setReportedPoints((prev) => [
          ...prev,
          {
            name: `Reported: ${data.pin.label} near ${data.pin.lat.toFixed(4)},${data.pin.lng.toFixed(4)}`,
            lat: data.pin.lat,
            lng: data.pin.lng,
          },
        ]);
        setStatus(`Pin added: ${data.analysis.reason}`);
      } else {
        setStatus(`Gemma checked the photo: ${data.analysis.reason} (no pin needed)`);
      }
    } catch (err: any) {
      setStatus("Error analyzing photo: " + err.message);
    } finally {
      setAnalyzingPhoto(false);
      pendingPhotoCoordsRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function clearPins() {
    pinsRef.current = [];
    const map = mapRef.current;
    if (!map) return;
    map.eachLayer((layer: any) => {
      if (layer.options && "radius" in layer.options) map.removeLayer(layer);
    });
    setStatus("Pins cleared.");
  }

  function getNearbyPins(lat: number, lng: number, radiusMeters: number) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371000;
    return pinsRef.current.filter((p) => {
      const dLat = toRad(p.lat - lat);
      const dLng = toRad(p.lng - lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) * Math.cos(toRad(p.lat)) * Math.sin(dLng / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return dist <= radiusMeters;
    });
  }

  async function getRoute() {
    const s = start < LANDMARKS.length ? LANDMARKS[start] : reportedPoints[start - LANDMARKS.length];
    const e = end < LANDMARKS.length ? LANDMARKS[end] : reportedPoints[end - LANDMARKS.length];
    setLoading(true);
    setStatus("Asking Gemma 4 to plan an accessible route...");
    console.log("[getRoute] resolved start:", s, "resolved end:", e);

    try {
      const res = await fetch("/api/gemma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: s,
          end: e,
          pins: pinsRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setStatus(data.explanation);

      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (map) {
        if (routeLineRef.current) map.removeLayer(routeLineRef.current);

        try {
          const osrmRes = await fetch(
            `https://router.project-osrm.org/route/v1/foot/${s.lng},${s.lat};${e.lng},${e.lat}?overview=full&geometries=geojson`
          );
          const osrmData = await osrmRes.json();
          const coords = osrmData.routes?.[0]?.geometry?.coordinates;

          if (coords && coords.length > 0) {
            const latLngs = coords.map((c: number[]) => [c[1], c[0]]);
            const line = L.polyline(latLngs, { color: "#2563eb", weight: 4 }).addTo(map);
            routeLineRef.current = line;
            map.fitBounds(line.getBounds(), { padding: [70, 70] });
          } else {
            throw new Error("No route geometry returned");
          }
        } catch {
          // Fallback to a straight line if OSRM is unreachable
          const line = L.polyline([[s.lat, s.lng], [e.lat, e.lng]], { color: "#2563eb", weight: 4, dashArray: "8 6" }).addTo(map);
          routeLineRef.current = line;
          map.fitBounds(line.getBounds(), { padding: [70, 70] });
        }
      }
    } catch (err: any) {
      setStatus("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  }

const NAVY = "#003C6C";
const GOLD = "#F1B82D";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          height: 60,
          background: NAVY,
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "rgba(255,255,255,.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
            }}
          >
            ♿
          </div>
          <div style={{ fontFamily: "'Bodoni Moda', serif", fontWeight: 700, fontSize: 21 }}>SlugWay</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => {
              setPhotoMode((p) => !p);
              setDropMode(false);
            }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: photoMode ? GOLD : "rgba(255,255,255,.12)",
              color: photoMode ? NAVY : "white",
              fontSize: 15,
            }}
            title="Report by photo (Gemma 4 analyzes it)"
          >
            📷
          </button>
          <button
            onClick={() => {
              setDropMode((d) => !d);
              setPhotoMode(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: dropMode ? "0 14px" : "0",
              width: dropMode ? "auto" : 36,
              height: 36,
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: dropMode ? "white" : "rgba(255,255,255,.12)",
              color: dropMode ? NAVY : "white",
              fontSize: 14,
              fontWeight: 600,
              justifyContent: "center",
            }}
            title="Toggle manual pin dropping"
          >
            📍 {dropMode && "Drop Pin"}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handlePhotoSelected(file);
          }}
        />
      </header>

      <div style={{ position: "relative", flex: 1 }}>
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            maxWidth: 480,
            margin: "0 auto",
            background: "white",
            borderRadius: "22px 22px 0 0",
            padding: "10px 20px 20px",
            boxShadow: "0 -8px 30px rgba(15,23,42,.15)",
            zIndex: 900,
          }}
        >
          <div style={{ width: 40, height: 4, background: "#e2e8f0", borderRadius: 99, margin: "0 auto 14px" }} />
          <h3 style={{ margin: "0 0 14px", fontFamily: "'Bodoni Moda', serif", fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>
            Find an accessible route
          </h3>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#f1f5f9",
              borderRadius: 12,
              padding: "12px 14px",
              marginBottom: 10,
            }}
          >
            <span style={{ color: NAVY, fontSize: 15 }}>◎</span>
            <select
              value={start}
              onChange={(e) => setStart(Number(e.target.value))}
              style={{ flex: 1, border: "none", background: "transparent", fontSize: 15, fontWeight: 500, outline: "none" }}
            >
              {LANDMARKS.map((l, i) => (
                <option key={l.name} value={i}>
                  {l.name}
                </option>
              ))}
              {reportedPoints.map((p, i) => (
                <option key={`start-rp-${i}`} value={LANDMARKS.length + i}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#f1f5f9",
              borderRadius: 12,
              padding: "12px 14px",
              marginBottom: 14,
            }}
          >
            <span style={{ color: "#dc2626", fontSize: 15 }}>📍</span>
            <select
              value={end}
              onChange={(e) => setEnd(Number(e.target.value))}
              style={{ flex: 1, border: "none", background: "transparent", fontSize: 15, fontWeight: 500, outline: "none" }}
            >
              {LANDMARKS.map((l, i) => (
                <option key={l.name} value={i}>
                  {l.name}
                </option>
              ))}
              {reportedPoints.map((p, i) => (
                <option key={`end-rp-${i}`} value={LANDMARKS.length + i}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={getRoute}
              disabled={loading}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 14,
                border: "none",
                borderRadius: 12,
                background: NAVY,
                color: "white",
                fontWeight: 700,
                fontSize: 14.5,
                cursor: "pointer",
              }}
            >
              ✨ {loading ? "Thinking..." : "Get Route with Gemma 4"}
            </button>
            <button
              onClick={clearPins}
              style={{ padding: "14px 18px", borderRadius: 12, border: "none", background: "#e2e8f0", color: "#475569", fontWeight: 600, fontSize: 14.5, cursor: "pointer" }}
            >
              Clear
            </button>
          </div>

          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              background: "#fffbeb",
              borderLeft: `4px solid ${GOLD}`,
              borderRadius: "0 10px 10px 0",
              padding: "12px 14px",
              maxHeight: 140,
              overflowY: "auto",
            }}
          >
            <span style={{ color: GOLD, fontSize: 15, flexShrink: 0 }}>●</span>
            <span style={{ fontSize: 13.5, color: "#334155", lineHeight: 1.5 }}>{status}</span>
          </div>
        </div>
      </div>

      <nav
        style={{
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
          height: 68,
          background: "white",
          borderTop: "1px solid #eef2f7",
          flexShrink: 0,
        }}
      >
        {[
          { key: "map", icon: "🗺️", label: "Map" },
          { key: "routes", icon: "🚶", label: "Routes" },
          { key: "saved", icon: "🔖", label: "Saved" },
          { key: "profile", icon: "👤", label: "Profile" },
        ].map((tab) => (
          <div
            key={tab.key}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              fontSize: 10.5,
              fontWeight: 600,
              color: tab.key === "map" ? NAVY : "#94a3b8",
              background: tab.key === "map" ? "#fffbeb" : "transparent",
              padding: "6px 16px",
              borderRadius: 12,
            }}
          >
            <span style={{ fontSize: 17 }}>{tab.icon}</span>
            {tab.label}
          </div>
        ))}
      </nav>
    </div>
  );
}
