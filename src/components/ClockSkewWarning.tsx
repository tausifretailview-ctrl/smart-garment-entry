import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import {
  CLOCK_SKEW_EVENT,
  formatClockSkew,
  getClockSkewSec,
  isClockSkewed,
} from "@/lib/clockSkew";

const DISMISS_KEY = "ezzy_clock_skew_dismissed";

function isDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Tells the shop when this PC's clock / time zone is wrong (seen after a Windows
 * reinstall). Logins keep refreshing and billing slows down until it is fixed.
 */
export function ClockSkewWarning() {
  const [skew, setSkew] = useState<number | null>(getClockSkewSec);
  const [dismissed, setDismissed] = useState(isDismissed);

  useEffect(() => {
    const onSkew = () => setSkew(getClockSkewSec());
    window.addEventListener(CLOCK_SKEW_EVENT, onSkew);
    return () => window.removeEventListener(CLOCK_SKEW_EVENT, onSkew);
  }, []);

  if (dismissed || skew === null || !isClockSkewed(skew)) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-3 left-3 z-[100] flex max-w-[min(calc(100vw-1.5rem),24rem)] items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 shadow-md dark:border-amber-700 dark:bg-amber-950"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
          This computer's clock is wrong by about {formatClockSkew(skew)}
          {skew > 0 ? " (ahead)" : " (behind)"}
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
          The app will be slow until it is fixed. In Windows open Settings → Time &amp; language →
          Date &amp; time, turn on “Set time automatically” and “Set time zone automatically” (India:
          UTC+05:30), then click Sync now.
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900"
        aria-label="Hide clock warning"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // ignore
          }
          setDismissed(true);
        }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
