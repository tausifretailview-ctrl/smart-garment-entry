import { useReactToPrint as useReactToPrintLib } from "react-to-print";
import type { UseReactToPrintOptions } from "react-to-print";
import { toast } from "sonner";
import {
  assertPrintTargetSafe,
  PrintPreflightError,
} from "@/utils/printOutputPreflight";

export type GuardedReactToPrintOptions = UseReactToPrintOptions & {
  /** When set (e.g. 1 for a credit note), a 4-sheet estimate is treated as a leak-class anomaly. */
  expectedMaxPages?: number;
  pageHeightPx?: number;
};

/**
 * Drop-in `useReactToPrint` that refuses to open the system dialog when the
 * cloned target paints CSS source as text, or a single-page doc looks like 4 sheets.
 */
export function useGuardedReactToPrint(options: GuardedReactToPrintOptions) {
  const { expectedMaxPages, pageHeightPx, onBeforePrint, onPrintError, contentRef, ...rest } =
    options;

  return useReactToPrintLib({
    ...rest,
    contentRef,
    onBeforePrint: async () => {
      if (onBeforePrint) await onBeforePrint();
      const node = contentRef?.current;
      const el = node instanceof HTMLElement ? node : null;
      assertPrintTargetSafe(el, { expectedMaxPages, pageHeightPx });
    },
    onPrintError: (location, error) => {
      if (error instanceof PrintPreflightError) {
        toast.error("Print blocked", { description: error.message });
      }
      onPrintError?.(location, error);
    },
  });
}

/** Prefer this name at call sites; same hook. */
export { useGuardedReactToPrint as useReactToPrint };
