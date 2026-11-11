"use client";

import { t } from "@/features/desk/i18n/t";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

import { btnGhostSm } from "@/features/desk/ui";

import "leaflet/dist/leaflet.css";

type Spot = { lat: number; lng: number };

const DAMASCUS: [number, number] = [33.5138, 36.2765];

function readPolygon(value: unknown): Spot[] {
  if (!value || typeof value !== "object") return [];
  const geo = value as { type?: string; coordinates?: unknown };
  const ring = geo.type === "Polygon" && Array.isArray(geo.coordinates) ? (geo.coordinates as number[][][])[0] : null;
  if (!ring) return [];
  const points = ring.flatMap((pair) => {
    const lng = pair?.[0];
    const lat = pair?.[1];
    return typeof lng === "number" && typeof lat === "number" ? [{ lat, lng }] : [];
  });
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length > 1 && first && last && first.lat === last.lat && first.lng === last.lng) points.pop();
  return points;
}

function polygonGeo(points: Spot[]) {
  if (points.length < 3) return "";
  const ring = [...points.map((point) => [point.lng, point.lat]), [points[0].lng, points[0].lat]];
  return JSON.stringify({ type: "Polygon", coordinates: [ring] });
}

function mapAlive(map: LeafletMap | null): map is LeafletMap {
  try {
    return !!map && !!map.getContainer()?.isConnected;
  } catch {
    return false;
  }
}

function resetHost(node: HTMLElement) {
  const marked = node as HTMLElement & { _leaflet_id?: number };
  if (marked._leaflet_id) {
    delete marked._leaflet_id;
    node.replaceChildren();
  }
}

function disposeMap(map: LeafletMap | null) {
  if (!map) return;
  try {
    map.stop();
    map.off();
    map.remove();
  } catch {
    const node = map.getContainer?.();
    if (node) resetHost(node);
  }
}

export function ServiceAreaField({ value, name = "service_area" }: { value?: unknown; name?: string }) {
  const initial = readPolygon(value);
  const [points, setPoints] = useState<Spot[]>(initial);
  const [cleared, setCleared] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const groupRef = useRef<LayerGroup | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let cancelled = false;
    let created: LeafletMap | null = null;
    let reveal = 0;
    void import("leaflet").then((L) => {
      if (cancelled || mapRef.current || !node.isConnected) return;
      resetHost(node);
      const map = L.map(node, { zoomControl: true, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false }).setView(DAMASCUS, 12);
      created = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      groupRef.current = L.layerGroup().addTo(map);
      map.on("click", (event) => {
        const next = { lat: event.latlng.lat, lng: event.latlng.lng };
        setPoints((current) => [...current, next]);
        setCleared(false);
      });
      mapRef.current = map;
      if (cancelled) {
        disposeMap(map);
        mapRef.current = null;
        groupRef.current = null;
        return;
      }
      reveal = window.setTimeout(() => {
        if (!mapAlive(map)) return;
        map.invalidateSize();
        paint(L, pointsRef.current, true);
      }, 60);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(reveal);
      disposeMap(created ?? mapRef.current);
      mapRef.current = null;
      groupRef.current = null;
    };
  }, []);

  useEffect(() => {
    void import("leaflet").then((L) => paint(L, points, false));
  }, [points]);

  function paint(L: typeof import("leaflet"), spots: Spot[], fit: boolean) {
    const map = mapRef.current;
    const group = groupRef.current;
    if (!mapAlive(map) || !group) return;
    group.clearLayers();
    spots.forEach((point, index) => {
      L.circleMarker([point.lat, point.lng], {
        radius: 7,
        color: "#389197",
        weight: 2,
        fillColor: "#22e0ee",
        fillOpacity: 1,
      }).bindTooltip(String(index + 1), { permanent: true, direction: "center", className: "service-area-index" }).addTo(group);
    });
    if (spots.length >= 3) {
      L.polygon(spots.map((point) => [point.lat, point.lng]), {
        color: "#389197",
        weight: 2,
        fillColor: "#22e0ee",
        fillOpacity: 0.22,
      }).addTo(group);
    } else if (spots.length === 2) {
      L.polyline(spots.map((point) => [point.lat, point.lng]), { color: "#389197", weight: 2 }).addTo(group);
    }
    if (fit && spots.length) map.fitBounds(L.latLngBounds(spots.map((point) => [point.lat, point.lng])), { padding: [24, 24], maxZoom: 14 });
  }

  const stored = points.length >= 3 ? polygonGeo(points) : points.length > 0 ? "incomplete" : cleared ? "null" : "";

  return (
    <div className="grid gap-2">
      <p className="text-[13px] leading-6 text-muted">{t("اضغط على الخريطة لإضافة زوايا المنطقة. ثلاث نقرات تغلق الشكل، والسحب يحرّك الخريطة.")}</p>
      <div ref={host} dir="ltr" className="h-72 w-full overflow-hidden rounded-xl border border-line [&_.leaflet-container]:z-0 [&_.service-area-index]:border-0 [&_.service-area-index]:bg-transparent [&_.service-area-index]:font-semibold [&_.service-area-index]:text-heading [&_.service-area-index]:shadow-none" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{points.length < 3 ? t("أضف ثلاث نقاط على الأقل.") : t("المنطقة جاهزة للحفظ.")}</p>
        <div className="flex gap-2">
          <button className={btnGhostSm} type="button" disabled={!points.length} onClick={() => setPoints((current) => current.slice(0, -1))}>{t("تراجع عن آخر نقطة")}</button>
          <button className={btnGhostSm} type="button" disabled={!points.length} onClick={() => { setPoints([]); setCleared(true); }}>{t("مسح المنطقة")}</button>
        </div>
      </div>
      <input type="hidden" name={name} value={stored} />
    </div>
  );
}

function insidePolygon(spot: Spot, ring: Spot[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > spot.lat !== b.lat > spot.lat && spot.lng < ((b.lng - a.lng) * (spot.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

type Region = { ring: Spot[]; center: Spot | null };

function searchBox(region: Region) {
  if (region.ring.length >= 3) {
    const lats = region.ring.map((point) => point.lat);
    const lngs = region.ring.map((point) => point.lng);
    return `${Math.min(...lngs)},${Math.max(...lats)},${Math.max(...lngs)},${Math.min(...lats)}`;
  }
  const c = region.center;
  return c ? `${c.lng - 0.3},${c.lat + 0.3},${c.lng + 0.3},${c.lat - 0.3}` : null;
}

/** OpenStreetMap search: inside the branch first, then anywhere in Syria. */
async function geocode(query: string, region: Region, signal: AbortSignal) {
  const base = { format: "jsonv2", limit: "1", "accept-language": "ar", countrycodes: "sy", q: query };
  const box = searchBox(region);
  const attempts = box ? [{ ...base, viewbox: box, bounded: "1" }, base] : [base];
  for (const [index, params] of attempts.entries()) {
    // Nominatim allows one request per second.
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams(params)}`, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    const hit = ((await res.json()) as { lat: string; lon: string; display_name?: string }[])[0];
    const spot = hit ? readSpot(hit.lat, hit.lon) : null;
    if (spot) return { ...spot, label: hit.display_name ?? query };
  }
  return null;
}

type Lookup = { state: "idle" | "searching" | "missing" | "failed" } | { state: "found"; label: string };

/**
 * One point picked on the map (e.g. a store). The branch area is drawn for context only.
 * Typing an address (`search`) moves the map there and places the point; a click adjusts it.
 */
export function LocationPickerField({
  lat,
  lng,
  area,
  center,
  search,
  mapClassName = "h-64",
  latName = "latitude",
  lngName = "longitude",
}: {
  lat?: unknown;
  lng?: unknown;
  area?: unknown;
  center?: { lat?: unknown; lng?: unknown } | null;
  search?: string;
  mapClassName?: string;
  latName?: string;
  lngName?: string;
}) {
  const [spot, setSpot] = useState<Spot | null>(() => readSpot(lat, lng));
  const [mapVersion, setMapVersion] = useState(0);
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const polygon = readPolygon(area);
  const areaKey = JSON.stringify({ ring: polygon, center: center ? readSpot(center.lat, center.lng) : null });
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const groupRef = useRef<LayerGroup | null>(null);
  const fittedArea = useRef<string | null>(null);
  const searched = useRef<string | null>((search ?? "").trim());

  useEffect(() => {
    const query = (search ?? "").trim();
    if (query === searched.current) return;
    const controller = new AbortController();
    let pending = false;
    const timer = window.setTimeout(async () => {
      searched.current = query;
      if (query.length < 3) {
        setLookup({ state: "idle" });
        return;
      }
      pending = true;
      setLookup({ state: "searching" });
      try {
        const hit = await geocode(query, JSON.parse(areaKey) as Region, controller.signal);
        if (controller.signal.aborted) return;
        if (!hit) {
          setLookup({ state: "missing" });
          return;
        }
        setSpot({ lat: hit.lat, lng: hit.lng });
        setLookup({ state: "found", label: hit.label });
        const map = mapRef.current;
        if (mapAlive(map)) map.setView([hit.lat, hit.lng], 16);
      } catch {
        if (!controller.signal.aborted) setLookup({ state: "failed" });
      } finally {
        pending = false;
      }
    }, 800);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      // An interrupted search (e.g. the branch changed) must run again for the same text.
      if (pending) searched.current = null;
    };
  }, [search, areaKey]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let cancelled = false;
    let created: LeafletMap | null = null;
    let reveal = 0;
    fittedArea.current = null;
    void import("leaflet").then((L) => {
      if (cancelled || mapRef.current || !node.isConnected) return;
      resetHost(node);
      const map = L.map(node, { zoomControl: true, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false }).setView(DAMASCUS, 12);
      created = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 19 }).addTo(map);
      groupRef.current = L.layerGroup().addTo(map);
      map.on("click", (event) => setSpot({ lat: event.latlng.lat, lng: event.latlng.lng }));
      mapRef.current = map;
      reveal = window.setTimeout(() => {
        if (!mapAlive(map)) return;
        map.invalidateSize();
        setMapVersion((version) => version + 1);
      }, 60);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(reveal);
      disposeMap(created ?? mapRef.current);
      mapRef.current = null;
      groupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapVersion) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      const map = mapRef.current;
      const group = groupRef.current;
      if (cancelled || !mapAlive(map) || !group) return;
      const { ring, center: middle } = JSON.parse(areaKey) as Region;
      group.clearLayers();
      if (ring.length >= 3) {
        L.polygon(ring.map((point) => [point.lat, point.lng]), { color: "#389197", weight: 1.5, fillColor: "#22e0ee", fillOpacity: 0.12, interactive: false }).addTo(group);
      }
      if (spot) {
        L.circleMarker([spot.lat, spot.lng], { radius: 9, color: "#0f5257", weight: 3, fillColor: "#22e0ee", fillOpacity: 1 }).addTo(group);
      }
      const first = fittedArea.current === null;
      if (!first && fittedArea.current === areaKey) return;
      fittedArea.current = areaKey;
      if (spot && first) map.setView([spot.lat, spot.lng], 15);
      else if (!spot && ring.length >= 3) map.fitBounds(L.latLngBounds(ring.map((point) => [point.lat, point.lng])), { padding: [24, 24], maxZoom: 14 });
      else if (!spot && middle) map.setView([middle.lat, middle.lng], 12);
    });
    return () => {
      cancelled = true;
    };
  }, [mapVersion, spot, areaKey]);

  const outside = spot && polygon.length >= 3 && !insidePolygon(spot, polygon);

  return (
    <div className="grid gap-2">
      <p className="line-clamp-2 text-[13px] leading-6 text-muted" dir="auto" title={lookup.state === "found" ? lookup.label : undefined}>
        {lookup.state === "searching"
          ? t("جارٍ البحث عن العنوان على الخريطة…")
          : lookup.state === "found"
            ? `${t("تم الانتقال إلى")}: ${lookup.label}. ${t("اضغط على الخريطة لتعديل النقطة.")}`
            : lookup.state === "missing"
              ? t("لم يُعثر على العنوان على الخريطة. حدّد الموقع بالنقر.")
              : lookup.state === "failed"
                ? t("تعذّر البحث عن العنوان الآن. حدّد الموقع بالنقر.")
                : t("اكتب العنوان لتنتقل إليه الخريطة، أو اضغط على الخريطة لتحديد موقع المتجر.")}
      </p>
      <div ref={host} dir="ltr" className={`${mapClassName} w-full overflow-hidden rounded-xl border border-line [&_.leaflet-container]:z-0`} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${outside ? "text-warning-ink" : "text-muted"}`} dir="auto">
          {spot
            ? `${t("الموقع المحدد")}: ${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}${outside ? ` — ${t("خارج منطقة خدمة الفرع")}` : ""}`
            : t("لم يُحدد موقع (اختياري).")}
        </p>
        <button className={btnGhostSm} type="button" disabled={!spot} onClick={() => setSpot(null)}>{t("مسح الموقع")}</button>
      </div>
      <input type="hidden" name={latName} value={spot ? spot.lat.toFixed(7) : ""} />
      <input type="hidden" name={lngName} value={spot ? spot.lng.toFixed(7) : ""} />
    </div>
  );
}

function readSpot(lat: unknown, lng: unknown): Spot | null {
  const a = typeof lat === "string" ? Number(lat) : lat;
  const b = typeof lng === "string" ? Number(lng) : lng;
  return typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null;
}

/** Branch centre for the distance bonus: click to set; cleared = the service-area centroid is used. */
export function BranchCenterField({ area, center, fallback }: { area?: unknown; center: { lat: unknown; lng: unknown }; fallback?: unknown }) {
  const [spot, setSpot] = useState<Spot | null>(readSpot(center.lat, center.lng));
  const fallbackSpot = fallback && typeof fallback === "object" ? readSpot((fallback as Spot).lat, (fallback as Spot).lng) : null;
  const polygon = readPolygon(area);
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const groupRef = useRef<LayerGroup | null>(null);
  const stateRef = useRef({ spot, fallbackSpot, polygon });
  stateRef.current = { spot, fallbackSpot, polygon };

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let cancelled = false;
    let created: LeafletMap | null = null;
    let reveal = 0;
    void import("leaflet").then((L) => {
      if (cancelled || mapRef.current || !node.isConnected) return;
      resetHost(node);
      const map = L.map(node, { zoomControl: true, fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false }).setView(DAMASCUS, 11);
      created = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 19 }).addTo(map);
      groupRef.current = L.layerGroup().addTo(map);
      map.on("click", (event) => setSpot({ lat: event.latlng.lat, lng: event.latlng.lng }));
      mapRef.current = map;
      reveal = window.setTimeout(() => {
        if (!mapAlive(map)) return;
        map.invalidateSize();
        paint(L, true);
      }, 60);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(reveal);
      disposeMap(created ?? mapRef.current);
      mapRef.current = null;
      groupRef.current = null;
    };
  }, []);

  useEffect(() => {
    void import("leaflet").then((L) => paint(L, false));
  }, [spot]);

  function paint(L: typeof import("leaflet"), fit: boolean) {
    const map = mapRef.current;
    const group = groupRef.current;
    if (!mapAlive(map) || !group) return;
    const { spot: current, fallbackSpot: computed, polygon: ring } = stateRef.current;
    group.clearLayers();
    if (ring.length >= 3) {
      L.polygon(ring.map((point) => [point.lat, point.lng]), { color: "#389197", weight: 1.5, fillColor: "#22e0ee", fillOpacity: 0.12, interactive: false }).addTo(group);
    }
    const shown = current ?? computed;
    if (shown) {
      L.circleMarker([shown.lat, shown.lng], {
        radius: 9,
        color: current ? "#0f5257" : "#7a8a8c",
        weight: 3,
        fillColor: current ? "#22e0ee" : "#ffffff",
        fillOpacity: 1,
        dashArray: current ? undefined : "3 3",
      }).addTo(group);
    }
    if (fit) {
      if (ring.length >= 3) map.fitBounds(L.latLngBounds(ring.map((point) => [point.lat, point.lng])), { padding: [24, 24], maxZoom: 13 });
      else if (shown) map.setView([shown.lat, shown.lng], 12);
    }
  }

  return (
    <div className="grid gap-2">
      <p className="text-[13px] leading-6 text-muted">{t("اضغط على الخريطة لتحديد مركز المحافظة. يُستخدم لحساب مكافأة البعد عن المركز.")}</p>
      <div ref={host} dir="ltr" className="h-64 w-full overflow-hidden rounded-xl border border-line [&_.leaflet-container]:z-0" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted" dir="auto">
          {spot
            ? `${t("المركز المحدد")}: ${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}`
            : fallbackSpot
              ? `${t("لم يُحدد مركز، يُستخدم منتصف منطقة الخدمة")}: ${fallbackSpot.lat.toFixed(5)}, ${fallbackSpot.lng.toFixed(5)}`
              : t("لم يُحدد مركز ولا توجد منطقة خدمة، لذلك لا تُطبق مكافأة البعد.")}
        </p>
        <button className={btnGhostSm} type="button" disabled={!spot} onClick={() => setSpot(null)}>{t("استخدام منتصف المنطقة")}</button>
      </div>
      <input type="hidden" name="center_lat" value={spot ? spot.lat.toFixed(7) : ""} />
      <input type="hidden" name="center_lng" value={spot ? spot.lng.toFixed(7) : ""} />
    </div>
  );
}
