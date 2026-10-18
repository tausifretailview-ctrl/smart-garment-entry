import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { isElectronShell } from "@/lib/electronShell";
import {
  SCREEN_TIME_FLUSH_MS,
  SCREEN_TIME_TICK_MS,
  ScreenTimeTracker,
  screenKeyFromOrgPath,
  type ScreenVisitPayload,
} from "@/lib/screenTime";
import type { Json } from "@/integrations/supabase/types";

/** One tracker per open app (tab); recreated when the shop or user changes. */
let active: { tracker: ScreenTimeTracker; orgId: string; userId: string } | null = null;

function detectDevice(): string {
  if (isElectronShell()) return "desktop-app";
  if (Capacitor.isNativePlatform()) return "android-app";
  if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 768px)").matches) return "mobile-web";
  return "web";
}

function makeSender(orgId: string) {
  return async (rows: ScreenVisitPayload[]) => {
    const { error } = await supabase.rpc("record_user_screen_time", {
      p_org_id: orgId,
      p_rows: rows as unknown as Json,
    });
    // Before the SQL is run the function is missing: drop quietly instead of retrying forever.
    if (error && error.code !== "PGRST202" && error.code !== "42883") throw error;
  };
}

/**
 * Call before signing out so the last screen is saved with "logout".
 * Never blocks logout for more than ~2s.
 */
export async function flushScreenTimeOnLogout(): Promise<void> {
  const current = active;
  if (!current) return;
  current.tracker.end("logout");
  await Promise.race([
    current.tracker.flush(),
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ]);
}

/** Records which screen this user has open and how long they work on it. */
export function useScreenTimeTracking(
  orgId: string | undefined,
  userId: string | undefined,
  orgPathSegment: string,
): void {
  useEffect(() => {
    if (!orgId || !userId) return;
    const tracker = new ScreenTimeTracker({ send: makeSender(orgId), device: detectDevice() });
    active = { tracker, orgId, userId };

    const onInput = () => tracker.noteInput();
    const inputEvents = ["keydown", "pointerdown", "mousemove", "wheel", "touchstart"] as const;
    for (const ev of inputEvents) window.addEventListener(ev, onInput, { passive: true, capture: true });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        tracker.pause();
        void tracker.flush();
      } else {
        tracker.resume();
      }
    };
    const onPageHide = () => {
      tracker.end("closed");
      void tracker.flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    const tickTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") tracker.tick();
    }, SCREEN_TIME_TICK_MS);
    const flushTimer = window.setInterval(() => void tracker.flush(), SCREEN_TIME_FLUSH_MS);

    return () => {
      for (const ev of inputEvents) window.removeEventListener(ev, onInput, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.clearInterval(tickTimer);
      window.clearInterval(flushTimer);
      tracker.end("closed");
      void tracker.flush();
      if (active?.tracker === tracker) active = null;
    };
  }, [orgId, userId]);

  useEffect(() => {
    const current = active;
    if (!current || current.orgId !== orgId || current.userId !== userId) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    current.tracker.setScreen(screenKeyFromOrgPath(orgPathSegment));
  }, [orgId, userId, orgPathSegment]);
}
