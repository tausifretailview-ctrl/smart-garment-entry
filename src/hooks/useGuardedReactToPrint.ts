import { useReactToPrint as useReactToPrintLib } from "react-to-print";
import type { UseReactToPrintOptions } from "react-to-print";
import { toast } from "sonner";
import {
  assertPrintTargetSafe,
  PrintPreflightError,
} from "@/utils/printOutputPreflight";
import { applyThermalPageSize } from "@/utils/thermalPrintPageSize";

const MOBILE_UA = [/Android/i, /webOS/i, /iPhone/i, /iPad/i, /iPod/i, /BlackBerry/i, /Windows Phone/i];

/**
 * react-to-print's own print step (title swap, print, mobile delay), after giving thermal
 * receipts a real page size — see thermalPrintPageSize.ts.
 */
export function makeThermalAwarePrint(pageStyle: string | undefined, documentTitle: string | undefined) {
  return async (iframe: HTMLIFrameElement): Promise<void> => {
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win) throw new Error("Print window did not load");
    if (doc) {
      try {
        applyThermalPageSize(doc, pageStyle);
      } catch {
        /* never block a print over the page size */
      }
    }
    const ownerDoc = iframe.ownerDocument;
    const prevOwnerTitle = ownerDoc.title;
    const prevTitle = doc?.title ?? "";
    if (documentTitle) {
      ownerDoc.title = documentTitle;
      if (doc) doc.title = documentTitle;
    }
    win.print();
    if (documentTitle) {
      ownerDoc.title = prevOwnerTitle;
      if (doc) doc.title = prevTitle;
    }
    const ua = navigator.userAgent ?? "";
    if (MOBILE_UA.some((re) => re.test(ua))) await new Promise((r) => setTimeout(r, 500));
  };
}

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
    print: rest.print ?? makeThermalAwarePrint(
      typeof rest.pageStyle === "string" ? rest.pageStyle : undefined,
      rest.documentTitle,
    ),
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
