import { useEffect, useState, type ReactNode } from "react";

type IdleMountProps = {
  children: ReactNode;
  /** Max wait before mounting anyway (ms). */
  timeoutMs?: number;
};

/**
 * Defers mounting children until the browser is idle so chat/PWA chrome
 * does not compete with first paint on cold load.
 */
export function IdleMount({ children, timeoutMs = 3000 }: IdleMountProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = () => setReady(true);
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(mount, { timeout: timeoutMs });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(mount, Math.min(timeoutMs, 1500));
    return () => window.clearTimeout(t);
  }, [timeoutMs]);

  if (!ready) return null;
  return <>{children}</>;
}
