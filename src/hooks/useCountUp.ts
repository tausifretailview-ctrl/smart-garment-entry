import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const DEFAULT_DURATION_MS = 1100;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animate a numeric value from 0 → target on mount / when target changes.
 * Respects prefers-reduced-motion (jumps straight to target).
 */
export function useCountUp(
  target: number,
  {
    durationMs = DEFAULT_DURATION_MS,
    enabled = true,
  }: { durationMs?: number; enabled?: boolean } = {},
): number {
  const reduceMotion = usePrefersReducedMotion();
  const animate = enabled && !reduceMotion && Number.isFinite(target);
  const [display, setDisplay] = useState(() => (animate ? 0 : target));

  useEffect(() => {
    if (!enabled || !Number.isFinite(target)) {
      setDisplay(Number.isFinite(target) ? target : 0);
      return;
    }
    if (reduceMotion) {
      setDisplay(target);
      return;
    }

    let startTs: number | null = null;
    let raf = 0;
    const from = 0;
    const to = target;

    const tick = (now: number) => {
      if (startTs === null) startTs = now;
      const t = Math.min(1, (now - startTs) / durationMs);
      setDisplay(from + (to - from) * easeOutCubic(t));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
      }
    };

    setDisplay(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, enabled, reduceMotion]);

  return display;
}
