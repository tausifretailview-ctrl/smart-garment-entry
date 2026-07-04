/** Shared layout flags for payment tabs in dialog vs full-page workspace. */
export function resolvePaymentTabLayout(opts: {
  embedded?: boolean;
  fullPage?: boolean;
}) {
  const shell = Boolean(opts.embedded || opts.fullPage);
  const compact = Boolean(opts.embedded && !opts.fullPage);
  return { shell, compact };
}

/** Sticky footer for submit buttons inside the full-page payments scroll pane. */
export function paymentSubmitFooterClass(fullPage: boolean): string | undefined {
  if (!fullPage) return undefined;
  return "sticky bottom-0 z-10 pt-3 pb-1 -mx-3 sm:-mx-4 px-3 sm:px-4 bg-white border-t border-slate-100 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]";
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
