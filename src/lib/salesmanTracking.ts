/**
 * Field Sales live location: the rules for when a salesman's position is recorded and which
 * points are sent. Pure, so they are tested on their own (salesmanTracking.test.ts).
 *
 * Setting: settings.sale_settings.salesman_tracking = { enabled, start: "10:00", end: "20:00" }
 * (India time). The server applies the same window again (record_salesman_locations), so
 * nothing outside work hours is stored even if a phone sends it.
 */
export type SalesmanTrackingSetting = { enabled?: boolean; start?: string; end?: string };

export type TrackingWindow = { startMin: number; endMin: number };

export const DEFAULT_TRACKING_START = "10:00";
export const DEFAULT_TRACKING_END = "20:00";

function toMinutes(hhmm: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** The shop's work-hours window, or null when tracking is off or the hours are not valid. */
export function resolveTrackingWindow(saleSettings: unknown): TrackingWindow | null {
  const t = (saleSettings as { salesman_tracking?: SalesmanTrackingSetting } | null | undefined)?.salesman_tracking;
  if (!t || t.enabled !== true) return null;
  const startMin = toMinutes(t.start ?? DEFAULT_TRACKING_START);
  const endMin = toMinutes(t.end ?? DEFAULT_TRACKING_END);
  if (startMin === null || endMin === null || endMin <= startMin) return null;
  return { startMin, endMin };
}

/** Minutes after midnight, India time. */
export function istMinutes(at: Date): number {
  const ist = new Date(at.getTime() + 330 * 60_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

export function isWithinWindow(window: TrackingWindow | null, at: Date): boolean {
  if (!window) return false;
  const m = istMinutes(at);
  return m >= window.startMin && m < window.endMin;
}

export type LocationPoint = {
  lat: number;
  lng: number;
  accuracy: number | null;
  /** ISO time the phone took the reading. */
  at: string;
  source: "background" | "foreground";
};

/** Metres between two points (haversine). */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** At most one point per this many ms unless the salesman moved further than MOVE_METRES. */
export const KEEP_EVERY_MS = 2 * 60_000;
export const MOVE_METRES = 150;
/** Readings vaguer than this are dropped (a phone without a GPS fix reports km-wide circles). */
export const MAX_ACCURACY_METRES = 1_000;

/** Whether a new reading is worth sending, given the last one kept. */
export function shouldKeepPoint(lastKept: LocationPoint | null, next: LocationPoint): boolean {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  if (next.accuracy !== null && next.accuracy > MAX_ACCURACY_METRES) return false;
  if (!lastKept) return true;
  const elapsed = Date.parse(next.at) - Date.parse(lastKept.at);
  if (!(elapsed > 0)) return false;
  if (elapsed >= KEEP_EVERY_MS) return true;
  return distanceMetres(lastKept, next) >= MOVE_METRES;
}

/** Unsent points kept while offline; oldest dropped first. */
export const MAX_QUEUED_POINTS = 300;

export function enqueuePoint(queue: readonly LocationPoint[], point: LocationPoint): LocationPoint[] {
  const next = [...queue, point];
  return next.length > MAX_QUEUED_POINTS ? next.slice(next.length - MAX_QUEUED_POINTS) : next;
}

/** "10:00" → "10:00 AM", for notices. */
export function formatHhmm(hhmm: string): string {
  const m = toMinutes(hhmm);
  if (m === null) return hhmm;
  const h = Math.floor(m / 60);
  const min = m % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

export type TrailPoint = { lat: number; lng: number; recorded_at: string };
export type TrailStop = { lat: number; lng: number; from: string; to: string; points: number };

/** Points within this distance of a stop's first point belong to that stop. */
export const STOP_RADIUS_METRES = 250;

/**
 * A day's points as places, in order: consecutive points within STOP_RADIUS_METRES of the
 * first one form one place, with the time the salesman was there.
 */
export function groupTrailIntoStops(points: readonly TrailPoint[]): TrailStop[] {
  const stops: TrailStop[] = [];
  for (const p of points) {
    const last = stops[stops.length - 1];
    if (last && distanceMetres(last, p) <= STOP_RADIUS_METRES) {
      last.to = p.recorded_at;
      last.points += 1;
    } else {
      stops.push({ lat: p.lat, lng: p.lng, from: p.recorded_at, to: p.recorded_at, points: 1 });
    }
  }
  return stops;
}

/** Google Maps link for one point. */
export const googleMapsPointUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;

/** Google Maps route through the day's places (it takes at most 9 stops in between). */
export function googleMapsRouteUrl(stops: readonly { lat: number; lng: number }[]): string | null {
  if (stops.length < 2) return null;
  const fmt = (s: { lat: number; lng: number }) => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;
  const middle = stops.slice(1, -1);
  const step = Math.max(1, Math.ceil(middle.length / 9));
  const waypoints = middle.filter((_, i) => i % step === 0).slice(0, 9);
  const params = new URLSearchParams({
    api: "1",
    origin: fmt(stops[0]),
    destination: fmt(stops[stops.length - 1]),
    travelmode: "driving",
  });
  if (waypoints.length) params.set("waypoints", waypoints.map(fmt).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
