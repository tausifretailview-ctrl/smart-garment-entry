import { describe, expect, it } from "vitest";
import {
  MAX_QUEUED_POINTS,
  distanceMetres,
  enqueuePoint,
  formatHhmm,
  isWithinWindow,
  resolveTrackingWindow,
  shouldKeepPoint,
  type LocationPoint,
} from "./salesmanTracking";

const ist = (hhmm: string) => new Date(`2026-11-24T${hhmm}:00+05:30`);
const pt = (lat: number, lng: number, at: string, accuracy: number | null = 10): LocationPoint => ({
  lat, lng, accuracy, at, source: "background",
});

describe("work-hours window", () => {
  it("off unless enabled with valid hours", () => {
    expect(resolveTrackingWindow(null)).toBeNull();
    expect(resolveTrackingWindow({ salesman_tracking: { enabled: false, start: "10:00", end: "20:00" } })).toBeNull();
    expect(resolveTrackingWindow({ salesman_tracking: { enabled: true, start: "20:00", end: "10:00" } })).toBeNull();
    expect(resolveTrackingWindow({ salesman_tracking: { enabled: true, start: "9:30", end: "25:00" } })).toBeNull();
    expect(resolveTrackingWindow({ salesman_tracking: { enabled: true } })).toEqual({ startMin: 600, endMin: 1200 });
  });

  it("inside 10:00–20:00 India time only (end excluded)", () => {
    const w = resolveTrackingWindow({ salesman_tracking: { enabled: true, start: "10:00", end: "20:00" } });
    expect(isWithinWindow(w, ist("09:59"))).toBe(false);
    expect(isWithinWindow(w, ist("10:00"))).toBe(true);
    expect(isWithinWindow(w, ist("19:59"))).toBe(true);
    expect(isWithinWindow(w, ist("20:00"))).toBe(false);
    expect(isWithinWindow(null, ist("12:00"))).toBe(false);
  });
});

describe("which readings are sent", () => {
  const a = pt(19.0176, 72.8562, "2026-11-24T06:00:00.000Z");
  it("first reading is kept; vague or broken ones are not", () => {
    expect(shouldKeepPoint(null, a)).toBe(true);
    expect(shouldKeepPoint(null, pt(19, 72, a.at, 5000))).toBe(false);
    expect(shouldKeepPoint(null, pt(Number.NaN, 72, a.at))).toBe(false);
  });

  it("standing still: one point per 2 minutes", () => {
    expect(shouldKeepPoint(a, pt(19.0177, 72.8562, "2026-11-24T06:01:00.000Z"))).toBe(false);
    expect(shouldKeepPoint(a, pt(19.0177, 72.8562, "2026-11-24T06:02:00.000Z"))).toBe(true);
  });

  it("moving more than 150 m is kept sooner", () => {
    const moved = pt(19.0196, 72.8562, "2026-11-24T06:00:40.000Z"); // ~220 m north
    expect(distanceMetres(a, moved)).toBeGreaterThan(150);
    expect(shouldKeepPoint(a, moved)).toBe(true);
  });

  it("older or same-time readings are ignored", () => {
    expect(shouldKeepPoint(a, pt(19.1, 72.9, "2026-11-24T05:59:00.000Z"))).toBe(false);
  });
});

describe("offline queue", () => {
  it("keeps the newest points up to the limit", () => {
    let q: LocationPoint[] = [];
    for (let i = 0; i < MAX_QUEUED_POINTS + 5; i++) q = enqueuePoint(q, pt(19, 72, new Date(Date.UTC(2026, 10, 24, 6, i)).toISOString()));
    expect(q).toHaveLength(MAX_QUEUED_POINTS);
    expect(q[0].at).toBe(new Date(Date.UTC(2026, 10, 24, 6, 5)).toISOString());
  });
});

it("formats hours for the notice", () => {
  expect(formatHhmm("10:00")).toBe("10:00 AM");
  expect(formatHhmm("20:30")).toBe("8:30 PM");
  expect(formatHhmm("12:00")).toBe("12:00 PM");
  expect(formatHhmm("0:15")).toBe("12:15 AM");
});

import { googleMapsRouteUrl, groupTrailIntoStops } from "./salesmanTracking";

describe("day's places", () => {
  const at = (m: number) => new Date(Date.UTC(2026, 10, 24, 5, m)).toISOString();
  it("groups nearby points into one place with its time span, in order", () => {
    const stops = groupTrailIntoStops([
      { lat: 19.0176, lng: 72.8562, recorded_at: at(0) },
      { lat: 19.0178, lng: 72.8563, recorded_at: at(5) },   // ~25 m: same place
      { lat: 19.0300, lng: 72.8562, recorded_at: at(20) },  // ~1.4 km: new place
      { lat: 19.0176, lng: 72.8562, recorded_at: at(50) },  // back to the first area: a new visit
    ]);
    expect(stops).toHaveLength(3);
    expect(stops[0]).toMatchObject({ from: at(0), to: at(5), points: 2 });
    expect(stops[2]).toMatchObject({ from: at(50), to: at(50), points: 1 });
  });

  it("route link: start, end and at most 9 places in between", () => {
    expect(googleMapsRouteUrl([{ lat: 1, lng: 2 }])).toBeNull();
    const many = Array.from({ length: 30 }, (_, i) => ({ lat: 19 + i / 100, lng: 72 }));
    const url = new URL(googleMapsRouteUrl(many)!);
    expect(url.searchParams.get("origin")).toBe("19.000000,72.000000");
    expect(url.searchParams.get("destination")).toBe("19.290000,72.000000");
    expect(url.searchParams.get("waypoints")!.split("|").length).toBeLessThanOrEqual(9);
  });
});

import { shiftYmd } from "./salesmanTracking";
it("moves a calendar date by days", () => {
  expect(shiftYmd("2026-11-24", -6)).toBe("2026-11-18");
  expect(shiftYmd("2026-03-02", -6)).toBe("2026-02-24");
  expect(shiftYmd("2026-12-31", 1)).toBe("2027-01-01");
});
