import * as React from "react";
import { Capacitor } from "@capacitor/core";
import { isForceDesktopViewEnabled, subscribeForceDesktopView } from "@/lib/desktopViewPreference";

const MOBILE_BREAKPOINT = 768;
/** Max width for touch-tablet POS; desktop mice use full desktop POS below this. */
const TABLET_BREAKPOINT = 1180;

function isIPadDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && "ontouchend" in document)
  );
}

/** True when the primary input is a mouse/trackpad (typical PC browser). */
function hasFinePointer(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(pointer: fine)").matches;
}

/** Touch-first device without a fine pointer (many tablets). */
function isTouchTabletDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches && !hasFinePointer();
}

function computeIsMobile(): boolean {
  if (typeof window === "undefined") return false;
  if (isForceDesktopViewEnabled()) return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

/**
 * Tablet POS layout: iPad, or touch-only devices in the medium width band.
 * Desktop browsers (fine pointer) always use desktop POS when width >= 768,
 * even on smaller monitors or non-maximized windows.
 */
function computeIsTablet(): boolean {
  if (typeof window === "undefined") return false;
  const w = window.innerWidth;
  if (w < MOBILE_BREAKPOINT) return false;

  if (isIPadDevice()) return true;

  // PC/laptop with mouse — never switch to tablet POS based on width alone
  if (hasFinePointer()) return false;

  return isTouchTabletDevice() && w < TABLET_BREAKPOINT;
}

/** Viewport width only — ignores force-desktop (for layout damage-control on phones). */
function computeIsNarrowViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isTouchPhoneDevice(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const fine = window.matchMedia("(pointer: fine)").matches;
  return coarse && !fine && navigator.maxTouchPoints > 0;
}

/** Single-column login on native phones, narrow PWA, and mobile browsers. */
function computeCompactLoginLayout(): boolean {
  if (typeof window === "undefined") return false;
  if (isForceDesktopViewEnabled()) return false;

  const wide = window.innerWidth >= MOBILE_BREAKPOINT;

  // Browser / installed PWA on desktop-width viewports — split marketing + login panel
  if (wide && !Capacitor.isNativePlatform()) {
    return false;
  }

  if (Capacitor.isNativePlatform()) return true;
  if (isStandalonePwa()) return true;
  if (isTouchPhoneDevice()) return true;
  return !wide;
}

export function useIsNarrowViewport() {
  const [isNarrow, setIsNarrow] = React.useState(computeIsNarrowViewport);

  React.useEffect(() => {
    const refresh = () => setIsNarrow(computeIsNarrowViewport());
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mql.addEventListener("change", refresh);
    window.addEventListener("resize", refresh);
    refresh();
    return () => {
      mql.removeEventListener("change", refresh);
      window.removeEventListener("resize", refresh);
    };
  }, []);

  return isNarrow;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(computeIsMobile);

  React.useEffect(() => {
    const refresh = () => setIsMobile(computeIsMobile());
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mql.addEventListener("change", refresh);
    window.addEventListener("resize", refresh);
    const unsubPreference = subscribeForceDesktopView(refresh);
    refresh();
    return () => {
      mql.removeEventListener("change", refresh);
      window.removeEventListener("resize", refresh);
      unsubPreference();
    };
  }, []);

  return isMobile;
}

export function useCompactLoginLayout() {
  const [compact, setCompact] = React.useState(computeCompactLoginLayout);

  React.useEffect(() => {
    const refresh = () => setCompact(computeCompactLoginLayout());
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mql.addEventListener("change", refresh);
    window.addEventListener("resize", refresh);
    const unsubPreference = subscribeForceDesktopView(refresh);
    refresh();
    return () => {
      mql.removeEventListener("change", refresh);
      window.removeEventListener("resize", refresh);
      unsubPreference();
    };
  }, []);

  return compact;
}

export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState(computeIsTablet);

  React.useEffect(() => {
    const onChange = () => setIsTablet(computeIsTablet());
    window.addEventListener("resize", onChange);
    const coarseMql = window.matchMedia("(pointer: coarse)");
    const fineMql = window.matchMedia("(pointer: fine)");
    coarseMql.addEventListener("change", onChange);
    fineMql.addEventListener("change", onChange);
    setIsTablet(computeIsTablet());
    return () => {
      window.removeEventListener("resize", onChange);
      coarseMql.removeEventListener("change", onChange);
      fineMql.removeEventListener("change", onChange);
    };
  }, []);

  return isTablet;
}

/** Desktop layout breakpoint aligned with Tailwind `lg:` (window tabs bar visible). */
export function useIsLgUp() {
  const [isLgUp, setIsLgUp] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsLgUp(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isLgUp;
}

export function useIsIPad() {
  const [isIPad, setIsIPad] = React.useState(false);

  React.useEffect(() => {
    setIsIPad(isIPadDevice());
  }, []);

  return isIPad;
}
