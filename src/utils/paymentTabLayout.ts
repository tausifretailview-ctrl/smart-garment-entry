/** Shared layout flags for payment tabs in dialog vs full-page workspace. */
export function resolvePaymentTabLayout(opts: {
  embedded?: boolean;
  fullPage?: boolean;
}) {
  const shell = Boolean(opts.embedded || opts.fullPage);
  const compact = Boolean(opts.embedded && !opts.fullPage);
  return { shell, compact };
}

/** Sticky footer for submit buttons inside the full-page payments scroll pane (customer/supplier tabs with long pickers). */
export function paymentSubmitFooterClass(fullPage: boolean): string | undefined {
  if (!fullPage) return undefined;
  return "sticky bottom-0 z-10 pt-3 pb-1 -mx-3 sm:-mx-4 px-3 sm:px-4 bg-white border-t border-slate-100 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]";
}

/** Inline submit row for full-page tabs whose form is followed by more content (expenses, salary).
 *  Do NOT use sticky here — sticky bottom-0 pins the button to the scroll-pane bottom, below
 *  sections like category ledger, so it disappears behind the history bar. */
export function paymentSubmitInlineClass(fullPage: boolean): string | undefined {
  if (!fullPage) return undefined;
  return "pt-3 mt-1 border-t border-slate-100 flex flex-wrap gap-2 shrink-0";
}

/** Pending invoice/bill picker height for dialog vs full-page workspace. */
export function resolvePaymentPickerGridHeight(opts: {
  rowCount: number;
  compact: boolean;
  fullPage: boolean;
}): number | undefined {
  const { rowCount, compact, fullPage } = opts;
  if (rowCount === 0) return undefined;

  const headerPx = 44;
  const rowPx = 36;
  const contentPx = headerPx + rowCount * rowPx;
  const capPx = compact ? 420 : fullPage ? 900 : 480;
  const vhCapPx =
    typeof window !== "undefined"
      ? compact
        ? Math.round(window.innerHeight * 0.48)
        : fullPage
          ? Math.round(window.innerHeight * 0.58)
          : Math.round(window.innerHeight * 0.55)
      : capPx;
  const minGridPx = fullPage ? 320 : 200;

  return Math.min(Math.max(contentPx, minGridPx), capPx, vhCapPx);
}
