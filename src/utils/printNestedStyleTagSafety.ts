/**
 * Class of bug (KS FOOTWEAR credit-note print, 2026-08):
 *
 * Print visibility CSS used `ancestor * { display: block !important }` to beat
 * `body * { visibility: hidden }`. That also forced nested `<style>` tags
 * (display:none by default) to render their CSS source as page content — extra
 * sheets in the print dialog, raw `@media print { ... }` above the header.
 *
 * Structural rules:
 * 1. Never set `display: block` on a universal descendant selector in print CSS.
 * 2. Always hide nested `<style>` at higher specificity than `ancestor *`.
 */

/** Print roots that visibility overrides un-hide (keep in sync with those lists). */
export const PRINT_DOCUMENT_ROOT_SELECTORS = [
  ".credit-note-print",
  ".credit-note-print-source",
  ".sale-return-thermal",
  ".invoice-print",
  ".invoice-print-source",
  ".invoice-print-source-screen",
  ".invoice-print-root",
  ".print-invoice-container",
  ".retail-tax-ezzy-print-root",
  ".wholesale-a5-invoice",
  ".professional-invoice-template",
  ".sale-order-print-container",
  ".sale-order-print",
  ".sale-order-page",
  ".thermal-print-80mm",
  ".thermal-receipt-container",
  ".modern-thermal-receipt",
  ".kids-thermal-receipt-80mm",
  ".tvs-thermal-receipt-80mm",
  ".gift-tally-invoice-root",
  ".print-document",
] as const;

/**
 * `body .root *` is (0,1,1). `body .root style` is (0,1,2) and wins, so a later
 * `display: block` on `*` cannot paint the stylesheet as text.
 */
export function buildNestedStyleTagHideCss(
  roots: readonly string[] = PRINT_DOCUMENT_ROOT_SELECTORS,
): string {
  const selectors = roots.map((root) => `body ${root} style`);
  return `
  @media print {
    ${selectors.join(",\n    ")} {
      display: none !important;
      visibility: hidden !important;
    }
  }
`;
}

export const PRINT_NESTED_STYLE_TAG_HIDE_CSS = buildNestedStyleTagHideCss();

/**
 * True when any rule's selector includes a bare `*` (universal descendant) and
 * the declarations force `display: block`. That is the leak class.
 *
 * Named containers (`display: block` on `.invoice-print-root` itself) are fine.
 */
export function printCssForcesDisplayBlockOnUniversal(css: string): boolean {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = withoutComments.match(/[^{}]+\{[^{}]*\}/g) ?? [];
  return rules.some((rule) => {
    const brace = rule.indexOf("{");
    const selector = rule.slice(0, brace);
    const body = rule.slice(brace);
    if (!/(?:^|[\s,>+~])\*(?:\s|,|\{|$)/.test(selector)) return false;
    if (/:not\(\s*style\s*\)/.test(selector) && !/\*\s*(,|\{|$)/.test(selector.replace(/:not\(\s*style\s*\)/g, ""))) {
      return false;
    }
    return /display\s*:\s*block\b/i.test(body);
  });
}
