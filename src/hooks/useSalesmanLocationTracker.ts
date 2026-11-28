import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { supabase } from "@/integrations/supabase/client";
import { istCalendarYmd } from "@/lib/localDayBounds";
import {
  enqueuePoint,
  isWithinWindow,
  shouldKeepPoint,
  type LocationPoint,
  type TrackingWindow,
} from "@/lib/salesmanTracking";

/**
 * Field Sales live location on the salesman's phone. Runs only when the shop turned it on,
 * inside its work hours, and after the salesman accepted the notice once. On the Android app it
 * keeps running with the screen off (a "sharing location" notification is shown, as Android
 * requires); in a browser it can only run while the app is open.
 */
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

const SEND_EVERY_MS = 60_000;
const SEND_AT_POINTS = 10;

/**
 * off: tracking is not switched on for this salesman. needs-consent: asked once as soon as the
 * shop switches it on (any time of day). outside-hours: accepted, waits for the work hours.
 * starting: accepted, inside work hours, waiting for the first position.
 */
export type TrackerStatus =
  | "off"
  | "needs-consent"
  | "declined"
  | "outside-hours"
  | "starting"
  | "on"
  | "denied"
  | "unavailable";

const consentKey = (orgId: string, userId: string) => `ezzy_salesman_location_consent:${orgId}:${userId}`;
const queueKey = (orgId: string, userId: string) => `ezzy_salesman_location_queue:${orgId}:${userId}`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / blocked: points stay in memory */
  }
}

/** "accepted" | "declined:<IST date>" | null. A decline is asked again the next day. */
export function readConsent(orgId: string, userId: string): "accepted" | "declined-today" | null {
  try {
    const v = localStorage.getItem(consentKey(orgId, userId));
    if (v === "accepted") return "accepted";
    const today = istCalendarYmd();
    if (v === `declined:${today}`) return "declined-today";
    return null;
  } catch {
    return null;
  }
}

async function sendPoints(organizationId: string, points: LocationPoint[]): Promise<void> {
  if (points.length === 0) return;
  const payload = points.map((p) => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, at: p.at, source: p.source }));
  if (Capacitor.isNativePlatform()) {
    // Android throttles requests made by the web view after ~5 min in the background; the
    // native HTTP client keeps working there.
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Not signed in");
    const res = await CapacitorHttp.post({
      url: `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/record_salesman_locations`,
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      data: { p_organization_id: organizationId, p_points: payload },
    });
    if (res.status >= 300) throw new Error(`Location send failed (${res.status})`);
    return;
  }
  const { error } = await (supabase as any).rpc("record_salesman_locations", {
    p_organization_id: organizationId,
    p_points: payload,
  });
  if (error) throw error;
}

export function useSalesmanLocationTracker(opts: {
  organizationId: string | null | undefined;
  userId: string | null | undefined;
  /** A field sales user of this shop. */
  isSalesman: boolean;
  window: TrackingWindow | null;
}) {
  const { organizationId, userId, isSalesman, window: trackingWindow } = opts;
  const [inHours, setInHours] = useState(() => isWithinWindow(trackingWindow, new Date()));
  const [consent, setConsent] = useState<ReturnType<typeof readConsent>>(null);
  const [status, setStatus] = useState<TrackerStatus>("off");

  useEffect(() => {
    setConsent(organizationId && userId ? readConsent(organizationId, userId) : null);
  }, [organizationId, userId]);

  // Re-check the work hours every minute (start / stop on time).
  useEffect(() => {
    setInHours(isWithinWindow(trackingWindow, new Date()));
    if (!trackingWindow) return;
    const id = window.setInterval(() => setInHours(isWithinWindow(trackingWindow, new Date())), 60_000);
    return () => window.clearInterval(id);
  }, [trackingWindow]);

  // The shop switched tracking on for this salesman: the notice is asked at once (any time of
  // day); positions are only taken inside the work hours.
  const enabled = !!organizationId && !!userId && isSalesman && !!trackingWindow;
  const wanted = enabled && inHours;

  const accept = useCallback(() => {
    if (!organizationId || !userId) return;
    try {
      localStorage.setItem(consentKey(organizationId, userId), "accepted");
    } catch {
      /* ignore */
    }
    setConsent("accepted");
  }, [organizationId, userId]);

  const decline = useCallback(() => {
    if (!organizationId || !userId) return;
    const today = istCalendarYmd();
    try {
      localStorage.setItem(consentKey(organizationId, userId), `declined:${today}`);
    } catch {
      /* ignore */
    }
    setConsent("declined-today");
  }, [organizationId, userId]);

  const lastKeptRef = useRef<LocationPoint | null>(null);
  const queueRef = useRef<LocationPoint[]>([]);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setStatus("off");
      return;
    }
    if (consent === "declined-today") {
      setStatus("declined");
      return;
    }
    if (consent !== "accepted") {
      setStatus("needs-consent");
      return;
    }
    if (!wanted) {
      setStatus("outside-hours");
      return;
    }
    // The notice closes at once; "on" follows with the first position.
    setStatus("starting");
    const orgId = organizationId as string;
    const qKey = queueKey(orgId, userId as string);
    queueRef.current = readJson<LocationPoint[]>(qKey, []);
    let stopped = false;

    const flush = async () => {
      if (sendingRef.current || queueRef.current.length === 0) return;
      sendingRef.current = true;
      const batch = queueRef.current.slice(0, 200);
      try {
        await sendPoints(orgId, batch);
        queueRef.current = queueRef.current.slice(batch.length);
        writeJson(qKey, queueRef.current);
      } catch {
        /* offline or signed out: kept for the next try */
      } finally {
        sendingRef.current = false;
      }
    };

    const onReading = (lat: number, lng: number, accuracy: number | null, time: number | null, source: LocationPoint["source"]) => {
      if (stopped) return;
      const point: LocationPoint = { lat, lng, accuracy, at: new Date(time ?? Date.now()).toISOString(), source };
      if (!shouldKeepPoint(lastKeptRef.current, point)) return;
      lastKeptRef.current = point;
      queueRef.current = enqueuePoint(queueRef.current, point);
      writeJson(qKey, queueRef.current);
      if (queueRef.current.length >= SEND_AT_POINTS) void flush();
    };

    let removeWatcher: (() => void) | null = null;
    const startBrowserWatch = () => {
      if (!("geolocation" in navigator)) {
        setStatus("unavailable");
        return;
      }
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          setStatus("on");
          onReading(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null, pos.timestamp, "foreground");
        },
        (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "on"),
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 60_000 },
      );
      removeWatcher = () => navigator.geolocation.clearWatch(id);
    };

    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("BackgroundGeolocation")) {
      BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: "Field Sales: sharing location",
          backgroundMessage: "Your shop sees your area during work hours. Stops after work hours.",
          requestPermissions: true,
          stale: false,
          distanceFilter: 50,
        },
        (location, error) => {
          if (error) {
            setStatus(error.code === "NOT_AUTHORIZED" ? "denied" : "on");
            return;
          }
          if (!location) return;
          setStatus("on");
          onReading(location.latitude, location.longitude, location.accuracy ?? null, location.time ?? null, "background");
        },
      )
        .then((watcherId) => {
          if (stopped) {
            void BackgroundGeolocation.removeWatcher({ id: watcherId });
            return;
          }
          removeWatcher = () => void BackgroundGeolocation.removeWatcher({ id: watcherId });
        })
        .catch(() => startBrowserWatch());
    } else {
      // Browser, or an older Android app built before the plugin was added: while open only.
      startBrowserWatch();
    }

    const sendTimer = window.setInterval(() => void flush(), SEND_EVERY_MS);
    return () => {
      stopped = true;
      window.clearInterval(sendTimer);
      removeWatcher?.();
      void flush();
    };
  }, [enabled, wanted, consent, organizationId, userId]);

  return { status, wanted, accept, decline };
}
