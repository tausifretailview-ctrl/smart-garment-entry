import { useEffect, useState } from "react";
import { format } from "date-fns";

/**
 * POS footer clock. It keeps its own one-second timer so only this small text
 * redraws each second. The timer used to live in POSSales, which redrew the
 * whole 10,000-line POS screen (cart, totals, hidden print copy) every second.
 */
export function PosWallClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{format(now, "HH:mm:ss")}</>;
}
