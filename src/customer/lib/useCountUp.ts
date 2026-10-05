import { useEffect, useRef, useState } from "react";

/** easeOutCubic: fast start, gentle stop. t in [0,1]. */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 3);
}

/** Value shown at progress t when counting from `from` to `to` (rounded to rupees). */
export function countUpValue(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * easeOutCubic(t));
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Animated number for the home card. The first value it sees is shown as is (cached
 * screens appear instantly); later changes count from the old value to the new one.
 */
export function useCountUp(target: number, durationMs = 650): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current && target === 0) {
      // Still loading: wait for the real number, then count up from 0.
      firstRef.current = false;
      fromRef.current = 0;
      setShown(0);
      return;
    }
    firstRef.current = false;
    const from = fromRef.current;
    if (from === target || reducedMotion()) {
      fromRef.current = target;
      setShown(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / durationMs;
      setShown(countUpValue(from, target, t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = target;
    };
  }, [target, durationMs]);

  return shown;
}
