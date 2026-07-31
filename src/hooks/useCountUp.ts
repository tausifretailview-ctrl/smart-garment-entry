import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const DEFAULT_DURATION_MS = 1100;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animate a numeric value toward `target` on mount / when `target` changes.
 * Respects prefers-reduced-motion (jumps straight to target).
 *
 * fromPrevious=false (default): always animates 0 → target.
 * fromPrevious=true: first settle animates 0 → target, later changes animate
 *   from the currently displayed value → target (no drop back through zero).
 */
export function useCountUp(
  target: number,
  {
    durationMs = DEFAULT_DURATION_MS,
    enabled = true,
    fromPrevious = false,
  }: { durationMs?: number; enabled?: boolean; fromPrevious?: boolean } = {},
): number {
  const reduceMotion = usePrefersReducedMotion();
  const animate = enabled && !reduceMotion && Number.isFinite(target);
  const [display, setDisplay] = useState(() => (animate ? 0 : target));

  /** Latest value actually rendered — the origin for a fromPrevious animation. */
  const displayRef = useRef(display);
  /** True once a real (enabled, finite) pass has started. */
  const hasRunRef = useRef(false);

  useEffect(() => {
    const commit = (v: number) => {
      displayRef.current = v;
      setDisplay(v);
    };

    if (!enabled || !Number.isFinite(target)) {
      commit(Number.isFinite(target) ? target : 0);
      return; // deliberately does NOT set hasRunRef
    }

    if (reduceMotion) {
      commit(target);
      hasRunRef.current = true;
      return;
    }

    const from = fromPrevious && hasRunRef.current ? displayRef.current : 0;
    hasRunRef.current = true;

    if (from === target) {
      commit(target);
      return;
    }

    let startTs: number | null = null;
    let raf = 0;

    const tick = (now: number) => {
      if (startTs === null) startTs = now;
      const t = Math.min(1, (now - startTs) / durationMs);
      commit(from + (target - from) * easeOutCubic(t));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        commit(target);
      }
    };

    commit(from);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, enabled, reduceMotion, fromPrevious]);

  return display;
}
