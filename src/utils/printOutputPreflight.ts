/**
 * Pre-flight for the proven print-content leak: raw `@media print` / `@page`
 * / selector blocks painted as visible text (KS FOOTWEAR credit note).
 * Does not change print layout CSS — only inspects rendered text / height.
 */

export class PrintPreflightError extends Error {
  readonly reason: "css-leak" | "page-count";
  readonly estimatedPages: number;

  constructor(reason: "css-leak" | "page-count", message: string, estimatedPages = 0) {
    super(message);
    this.name = "PrintPreflightError";
    this.reason = reason;
    this.estimatedPages = estimatedPages;
  }
}

/** Proven leak text: at-rules and print-root selector blocks. */
const LEAKED_AT_RULE = /@media\s+print|@page\s*\{/i;
const LEAKED_SELECTOR_BLOCK =
  /\.(?:credit-note-print|invoice-print|print-invoice-container|sale-return-thermal)[\s\w,.#-]*\{[^}]{0,240}(?:!important|width:\s*\d+mm)/i;

export function printTextLooksLikeLeakedCss(text: string): boolean {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return false;
  return LEAKED_AT_RULE.test(compact) || LEAKED_SELECTOR_BLOCK.test(compact);
}

/** A4 portrait ≈ 297mm at 96dpi. */
export const A4_PORTRAIT_PAGE_HEIGHT_PX = Math.round((297 / 25.4) * 96);

export function estimatePrintPageCount(el: HTMLElement, pageHeightPx = A4_PORTRAIT_PAGE_HEIGHT_PX): number {
  const height = Math.max(el.scrollHeight, el.offsetHeight, 0);
  if (pageHeightPx <= 0) return 1;
  return Math.max(1, Math.ceil(height / pageHeightPx));
}

/**
 * Single-page document reporting 4 sheets is the known anomaly.
 * Multi-page docs only flag when estimate is wildly above the cap.
 */
export function printPageCountLooksAnomalous(estimated: number, expectedMaxPages: number): boolean {
  if (expectedMaxPages <= 0) return false;
  if (expectedMaxPages === 1) return estimated >= 4;
  return estimated > expectedMaxPages * 3;
}

export type PrintPreflightResult = {
  ok: boolean;
  leakedCss: boolean;
  estimatedPages: number;
  pageCountAnomalous: boolean;
  reason?: "css-leak" | "page-count";
};

export function inspectPrintTarget(
  el: HTMLElement | null | undefined,
  opts?: { expectedMaxPages?: number; pageHeightPx?: number },
): PrintPreflightResult {
  if (!el) {
    return { ok: true, leakedCss: false, estimatedPages: 0, pageCountAnomalous: false };
  }
  const leakedCss = printTextLooksLikeLeakedCss(el.innerText ?? el.textContent ?? "");
  const estimatedPages = estimatePrintPageCount(el, opts?.pageHeightPx);
  const expected = opts?.expectedMaxPages;
  const pageCountAnomalous =
    expected != null && printPageCountLooksAnomalous(estimatedPages, expected);
  if (leakedCss) {
    return { ok: false, leakedCss, estimatedPages, pageCountAnomalous, reason: "css-leak" };
  }
  if (pageCountAnomalous) {
    return { ok: false, leakedCss, estimatedPages, pageCountAnomalous, reason: "page-count" };
  }
  return { ok: true, leakedCss: false, estimatedPages, pageCountAnomalous: false };
}

export function assertPrintTargetSafe(
  el: HTMLElement | null | undefined,
  opts?: { expectedMaxPages?: number; pageHeightPx?: number },
): PrintPreflightResult {
  const result = inspectPrintTarget(el, opts);
  if (result.ok) return result;
  if (result.reason === "css-leak") {
    throw new PrintPreflightError(
      "css-leak",
      "Print preview contains raw CSS text. Printing was blocked so a customer document is not sent like this.",
      result.estimatedPages,
    );
  }
  throw new PrintPreflightError(
    "page-count",
    `Print preview looks like ${result.estimatedPages} sheets for a document that should need at most ${opts?.expectedMaxPages}. Printing was blocked.`,
    result.estimatedPages,
  );
}

export function printHtmlLooksLikeLeakedCss(html: string): boolean {
  if (!html?.trim()) return false;
  const withoutStyle = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutStyle.replace(/<[^>]+>/g, " ");
  return printTextLooksLikeLeakedCss(withoutTags);
}
