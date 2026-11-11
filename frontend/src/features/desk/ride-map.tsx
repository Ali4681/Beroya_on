"use client";

import { t } from "@/features/desk/i18n/t";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

import { go, isRecord } from "@/features/desk/go-api";
import { formatScalar } from "@/features/desk/present";
import { Panel, PanelHeader } from "@/features/desk/ui";

import "leaflet/dist/leaflet.css";

const ACTIVE = new Set(["SEARCHING", "DRIVER_ASSIGNED", "DRIVER_EN_ROUTE", "ARRIVED", "IN_PROGRESS"]);

type Spot = { lat: number; lng: number };

type RideView = {
  status: string;
  pickup: Spot | null;
  pickupLabel: string;
  destination: Spot | null;
  destinationLabel: string;
  stops: { spot: Spot; label: string }[];
  driver: Spot | null;
  driverLabel: string;
  bookedLine: Spot[];
  routeSource: string;
  routeSummary: string;
};

function coord(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function spot(record: Record<string, unknown>, latKey: string, lngKey: string): Spot | null {
  const lat = coord(record[latKey]);
  const lng = coord(record[lngKey]);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function readRide(data: Record<string, unknown>): RideView {
  const stops = Array.isArray(data.stops)
    ? data.stops.flatMap((item) => {
        if (!isRecord(item)) return [];
        const point = spot(item, "latitude", "longitude");
        if (!point) return [];
        return [{ spot: point, label: typeof item.address === "string" && item.address ? item.address : t("محطة") }];
      })
    : [];
  const driverRecord = isRecord(data.driver) ? data.driver : null;
  const state = driverRecord && isRecord(driverRecord.state) ? driverRecord.state : null;
  const driverName = driverRecord && isRecord(driverRecord.user) && typeof driverRecord.user.full_name === "string" ? driverRecord.user.full_name : t("السائق");
  const polyline = typeof data.estimated_route_polyline === "string" ? data.estimated_route_polyline : "";
  return {
    status: typeof data.status === "string" ? data.status : "",
    pickup: spot(data, "pickup_lat", "pickup_lng"),
    pickupLabel: typeof data.pickup_address === "string" && data.pickup_address ? data.pickup_address : t("نقطة الالتقاط"),
    destination: spot(data, "original_destination_lat", "original_destination_lng"),
    destinationLabel: typeof data.original_destination_address === "string" && data.original_destination_address ? data.original_destination_address : t("الوجهة"),
    stops,
    driver: state ? spot(state, "last_lat", "last_lng") : null,
    driverLabel: driverName,
    bookedLine: polyline ? decodePolyline(polyline) : [],
    routeSource: typeof data.estimated_route_source === "string" ? data.estimated_route_source : "",
    routeSummary: typeof data.estimated_route_summary === "string" ? data.estimated_route_summary : "",
  };
}

function placeLabel(role: string, place: string) {
  if (!place || place === role) return role;
  return `${role} · ${place}`;
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

export function themeColor(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function mapAlive(map: LeafletMap | null): map is LeafletMap {
  try {
    const node = map?.getContainer();
    return !!map && !!node?.isConnected;
  } catch {
    return false;
  }
}

export function resetHost(node: HTMLElement) {
  const marked = node as HTMLElement & { _leaflet_id?: number };
  if (marked._leaflet_id) {
    delete marked._leaflet_id;
    node.replaceChildren();
  }
}

export function disposeMap(map: LeafletMap | null) {
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

/** Google encoded polyline (precision 5). The desk never calls Google Routes or Directions. */
function decodePolyline(encoded: string): Spot[] {
  const points: Spot[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const dLat = decodeChunk(encoded, index);
    index = dLat.next;
    lat += dLat.value;
    const dLng = decodeChunk(encoded, index);
    index = dLng.next;
    lng += dLng.value;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function decodeChunk(encoded: string, start: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let index = start;
  let b = 0;
  do {
    b = encoded.charCodeAt(index++) - 63;
    result |= (b & 0x1f) << shift;
    shift += 5;
  } while (b >= 0x20);
  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return { value, next: index };
}

function routeSourceLabel(source: string) {
  if (source === "google") return "Google";
  if (source === "osrm") return "OSRM";
  if (source === "fallback") return t("تقريبي");
  return source;
}

export const MAP_OPTIONS = {
  zoomControl: true,
  fadeAnimation: false,
  markerZoomAnimation: false,
  zoomAnimation: false,
} as const;

function pin(kind: "pickup" | "dropoff" | "stop" | "driver", label: string) {
  const color = kind === "pickup" ? themeColor("--brand", "#22e0ee") : kind === "dropoff" ? themeColor("--danger", "#ea5455") : kind === "driver" ? themeColor("--teal", "#389197") : themeColor("--warning", "#ff9f43");
  const surface = themeColor("--surface", "#ffffff");
  const ink = themeColor("--text", "#4b465c");
  const size = kind === "driver" ? 18 : 14;
  const text = escapeHtml(label.length > 42 ? `${label.slice(0, 40)}…` : label);
  return `<div style="position:relative;width:${size}px;height:${size}px">
    <span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid ${surface};box-shadow:0 0 0 3px color-mix(in oklab, ${color} 30%, transparent),0 1px 3px rgba(16,24,40,.3)"></span>
    <span style="position:absolute;top:50%;left:${size + 8}px;transform:translateY(-50%);background:${surface};color:${ink};border:1px solid color-mix(in oklab, ${color} 60%, transparent);border-radius:6px;padding:2px 7px;font-weight:600;font-size:12px;line-height:1.4;font-family:inherit;white-space:nowrap;box-shadow:0 1px 2px rgba(16,24,40,.12)">${text}</span>
  </div>`;
}

export function RideTrackMap({ rideId }: { rideId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const groupRef = useRef<LayerGroup | null>(null);
  const fitted = useRef(false);
  const record = useQuery({
    queryKey: ["go", `/erp/rides/${rideId}`],
    queryFn: () => go<Record<string, unknown>>(`/erp/rides/${rideId}`),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return typeof status === "string" && ACTIVE.has(status) ? 4000 : false;
    },
  });
  const view = record.data ? readRide(record.data) : null;
  const viewKey = JSON.stringify(view);
  const viewRef = useRef(view);
  viewRef.current = view;
  const hasMap = !!(view?.pickup || view?.destination || (view && view.bookedLine.length > 0));
  const paintRef = useRef<() => void>(() => undefined);
  const sourceLabel = view?.routeSource ? routeSourceLabel(view.routeSource) : "";
  const routeSummary = [
    view?.routeSummary,
    formatScalar("estimated_distance_m", record.data?.estimated_distance_m),
    formatScalar("estimated_duration_sec", record.data?.estimated_duration_sec),
    view && view.bookedLine.length === 0 && (view.pickup || view.destination) ? t("لا يوجد مسار محفوظ؛ الدبابيس فقط.") : "",
  ].filter(Boolean).join(" · ");

  useEffect(() => {
    const node = host.current;
    if (!node || !hasMap) return;
    let cancelled = false;
    let created: LeafletMap | null = null;
    void import("leaflet").then((L) => {
      if (cancelled || mapRef.current || !node.isConnected) return;
      resetHost(node);
      const map = L.map(node, MAP_OPTIONS).setView([33.5138, 36.2765], 12);
      created = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      groupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      if (cancelled) {
        disposeMap(map);
        mapRef.current = null;
        groupRef.current = null;
        return;
      }
      requestAnimationFrame(() => {
        if (!mapAlive(map)) return;
        map.invalidateSize();
        paintRef.current();
      });
    });
    return () => {
      cancelled = true;
      disposeMap(created ?? mapRef.current);
      mapRef.current = null;
      groupRef.current = null;
      fitted.current = false;
    };
  }, [hasMap, rideId]);

  paintRef.current = () => {
    const map = mapRef.current;
    const group = groupRef.current;
    const current = viewRef.current;
    if (!mapAlive(map) || !group || !current) return;
    void import("leaflet").then((L) => {
      if (mapRef.current !== map || !mapAlive(map)) return;
      try {
        group.clearLayers();
      } catch {
        return;
      }
      if (!mapAlive(map)) return;
      const line = current.bookedLine;
      if (line.length >= 2) {
        L.polyline(line.map((point) => [point.lat, point.lng]), { color: themeColor("--brand", "#22e0ee"), weight: 5, opacity: 0.9 }).addTo(group);
      }
      const markers: { spot: Spot; kind: "pickup" | "dropoff" | "stop" | "driver"; text: string }[] = [];
      if (current.pickup) markers.push({ spot: current.pickup, kind: "pickup", text: placeLabel(t("نقطة الالتقاط"), current.pickupLabel) });
      current.stops.forEach((stop, index) => {
        const role = current.stops.length > 1 ? `${t("محطة")} ${index + 1}` : t("محطة");
        markers.push({ spot: stop.spot, kind: "stop", text: placeLabel(role, stop.label) });
      });
      if (current.destination) markers.push({ spot: current.destination, kind: "dropoff", text: placeLabel(t("الوجهة"), current.destinationLabel) });
      if (current.driver) markers.push({ spot: current.driver, kind: "driver", text: placeLabel(t("السائق"), current.driverLabel) });
      if (!mapAlive(map)) return;
      for (const marker of markers) {
        const size = marker.kind === "driver" ? 18 : 14;
        L.marker([marker.spot.lat, marker.spot.lng], {
          icon: L.divIcon({
            className: "ride-pin",
            html: pin(marker.kind, marker.text),
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
          zIndexOffset: marker.kind === "driver" ? 500 : 0,
        }).addTo(group);
      }
      const bounds = [
        ...markers.map((marker) => [marker.spot.lat, marker.spot.lng] as [number, number]),
        ...line.map((point) => [point.lat, point.lng] as [number, number]),
      ];
      if (bounds.length && !fitted.current && mapAlive(map)) {
        map.fitBounds(bounds, { padding: [48, 72], maxZoom: 15 });
        fitted.current = true;
      }
    });
  };

  useEffect(() => {
    paintRef.current();
  }, [viewKey]);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#ride-map") return;
    document.getElementById("ride-map")?.scrollIntoView({ block: "start" });
  }, [hasMap]);

  if (record.isLoading && !view) {
    return <Panel><p className="text-sm text-muted">{t("جارٍ تحميل الخريطة…")}</p></Panel>;
  }
  if (!view?.pickup && !view?.destination && !(view && view.bookedLine.length > 0)) {
    return <Panel><p className="text-sm text-muted">{t("لا توجد إحداثيات لرسم مسار هذه الرحلة.")}</p></Panel>;
  }

  return (
    <Panel flush className="overflow-hidden">
      <div id="ride-map" className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-heading">{t("المسار المحجوز")}</h2>
            {sourceLabel ? (
              <span className="rounded-md bg-brand/12 px-2 py-0.5 text-[11px] font-semibold text-accent">{sourceLabel}</span>
            ) : null}
          </div>
          {routeSummary ? <p className="mt-0.5 text-xs text-muted">{routeSummary}</p> : null}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-brand" /> {t("الالتقاط")}</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-warning" /> {t("محطة")}</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-danger" /> {t("الوجهة")}</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-teal" /> {t("السائق")}</span>
        </div>
      </div>
      <div ref={host} dir="ltr" className="h-[420px] w-full [&_.leaflet-container]:z-0 [&_.leaflet-div-icon]:border-0 [&_.leaflet-div-icon]:bg-transparent" />
    </Panel>
  );
}

type FleetPin = { id: string; lat: number; lng: number; label: string; availability: string };

export function FleetMap() {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const groupRef = useRef<LayerGroup | null>(null);
  const fitted = useRef(false);
  const list = useQuery({
    queryKey: ["go", "/erp/fleet"],
    queryFn: () => go<unknown>("/erp/fleet"),
    refetchInterval: 8000,
  });
  const pins: FleetPin[] = (Array.isArray(list.data) ? list.data : []).flatMap((item) => {
    if (!isRecord(item) || !isRecord(item.state)) return [];
    const point = spot(item.state, "last_lat", "last_lng");
    if (!point) return [];
    const name = isRecord(item.user) && typeof item.user.full_name === "string" ? item.user.full_name : t("السائق");
    const availability = typeof item.state.availability === "string" ? item.state.availability : "";
    return [{ id: String(item.id), ...point, label: `${name}${availability ? ` · ${availability}` : ""}`, availability }];
  });
  const pinKey = pins.map((pin) => `${pin.id}:${pin.lat}:${pin.lng}:${pin.availability}`).join("|");
  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const paintFleet = useRef<() => void>(() => undefined);
  paintFleet.current = () => {
    const map = mapRef.current;
    const group = groupRef.current;
    const current = pinsRef.current;
    if (!mapAlive(map) || !group) return;
    void import("leaflet").then((L) => {
      if (mapRef.current !== map || !mapAlive(map)) return;
      try {
        group.clearLayers();
      } catch {
        return;
      }
      for (const pinItem of current) {
        L.marker([pinItem.lat, pinItem.lng], {
          icon: L.divIcon({
            className: "ride-pin",
            html: pin("driver", pinItem.label),
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
        }).addTo(group);
      }
      if (current.length && !fitted.current && mapAlive(map)) {
        map.fitBounds(current.map((pinItem) => [pinItem.lat, pinItem.lng]), { padding: [48, 72], maxZoom: 14 });
        fitted.current = true;
      }
    });
  };

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let cancelled = false;
    let created: LeafletMap | null = null;
    void import("leaflet").then((L) => {
      if (cancelled || mapRef.current || !node.isConnected) return;
      resetHost(node);
      const map = L.map(node, MAP_OPTIONS).setView([33.5138, 36.2765], 11);
      created = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      groupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      if (cancelled) {
        disposeMap(map);
        mapRef.current = null;
        groupRef.current = null;
        return;
      }
      requestAnimationFrame(() => {
        if (!mapAlive(map)) return;
        map.invalidateSize();
        paintFleet.current();
      });
    });
    return () => {
      cancelled = true;
      disposeMap(created ?? mapRef.current);
      mapRef.current = null;
      groupRef.current = null;
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    paintFleet.current();
  }, [pinKey]);

  return (
    <Panel flush className="overflow-hidden">
      <PanelHeader title={t("خريطة الأسطول")} hint={t("آخر موقع معروف لكل سائق لديه إحداثيات.")} />
      <div ref={host} dir="ltr" className="h-[420px] w-full [&_.leaflet-container]:z-0 [&_.leaflet-div-icon]:border-0 [&_.leaflet-div-icon]:bg-transparent" />
    </Panel>
  );
}
