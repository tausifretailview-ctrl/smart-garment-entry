/**
 * html2canvas clone fixes used ONLY for WappConnect WhatsApp invoice PDFs.
 * Print / on-screen invoice templates stay unchanged — these tweaks apply to the
 * off-screen clone that html2canvas rasterizes.
 *
 * Symptom without this: horizontal borders cut through text (Invoice No, totals,
 * Amount in Words, Terms) and table cells clip headers — common with tight
 * padding, fixed row heights, and CSS transforms (logo translateY).
 */

function parsePx(value: string | null | undefined): number {
  if (!value) return 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function bumpVerticalPadding(el: HTMLElement, minPx: number): void {
  const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (!cs) return;
  const pt = parsePx(cs.paddingTop);
  const pb = parsePx(cs.paddingBottom);
  if (pt < minPx) el.style.paddingTop = `${minPx}px`;
  if (pb < minPx) el.style.paddingBottom = `${minPx}px`;
}

/**
 * Mutate the html2canvas document clone so borders sit below text and fonts
 * render cleanly in the WhatsApp PDF attachment.
 */
export function applyWappConnectInvoicePdfCloneFixes(
  clonedDoc: Document,
  clonedElement: HTMLElement,
): void {
  // Keep capture root in normal flow inside the clone (off-screen parents
  // at left:-100000px can skew border vs text baselines).
  let node: HTMLElement | null = clonedElement;
  while (node && node !== clonedDoc.body) {
    const pos = node.style.position || clonedDoc.defaultView?.getComputedStyle(node).position;
    if (pos === "fixed" || pos === "absolute") {
      node.style.position = "static";
      node.style.left = "auto";
      node.style.top = "auto";
      node.style.transform = "none";
      node.style.opacity = "1";
      node.style.visibility = "visible";
      node.style.pointerEvents = "none";
      node.style.zIndex = "auto";
    }
    node = node.parentElement;
  }

  clonedElement.style.backgroundColor = "#ffffff";
  clonedElement.style.color = "#000000";
  clonedElement.style.fontFamily = "Arial, Helvetica, sans-serif";
  clonedElement.style.setProperty("-webkit-font-smoothing", "antialiased");
  clonedElement.style.setProperty("text-rendering", "geometricPrecision");

  const styleEl = clonedDoc.createElement("style");
  styleEl.setAttribute("data-wappconnect-pdf-fix", "true");
  styleEl.textContent = `
    .retail-erp-invoice-template,
    .retail-invoice-template,
    .retail-erp-all-pages,
    .retail-invoice-all-pages,
    [class*="invoice-template"] {
      font-family: Arial, Helvetica, sans-serif !important;
      -webkit-font-smoothing: antialiased !important;
      text-rendering: geometricPrecision !important;
      color: #000 !important;
    }
    .retail-erp-invoice-template td,
    .retail-erp-invoice-template th,
    .retail-invoice-template td,
    .retail-invoice-template th {
      height: auto !important;
      max-height: none !important;
      min-height: 24px !important;
      padding-top: 6px !important;
      padding-bottom: 6px !important;
      line-height: 1.35 !important;
      vertical-align: middle !important;
      overflow: visible !important;
      font-family: Arial, Helvetica, sans-serif !important;
    }
    .retail-erp-invoice-template tr,
    .retail-invoice-template tr {
      height: auto !important;
      max-height: none !important;
    }
  `;
  clonedDoc.head?.appendChild(styleEl);

  const all = clonedElement.querySelectorAll<HTMLElement>("*");
  all.forEach((el) => {
    const inline = el.style;

    // Logo / absolute layers using translateY(-50%) shift text baselines in canvas.
    if (inline.transform && inline.transform !== "none") {
      const wasCentered = inline.top === "50%" || inline.transform.includes("translateY");
      inline.transform = "none";
      if (wasCentered && inline.position === "absolute") {
        inline.top = "8px";
      }
    }

    if (el.tagName === "TD" || el.tagName === "TH" || el.tagName === "TR") {
      if (inline.maxHeight) inline.maxHeight = "none";
      if (inline.height && inline.height.endsWith("px")) {
        inline.height = "auto";
        if (!inline.minHeight) inline.minHeight = "24px";
      }
      if (inline.overflow === "hidden") inline.overflow = "visible";
      bumpVerticalPadding(el, 6);
      inline.lineHeight = "1.35";
      inline.verticalAlign = "middle";
      inline.boxSizing = "border-box";
    }

    const cs = clonedDoc.defaultView?.getComputedStyle(el);
    if (!cs) return;

    const borderBottom = parsePx(cs.borderBottomWidth);
    const borderTop = parsePx(cs.borderTopWidth);
    if ((borderBottom > 0 || borderTop > 0) && el.tagName === "DIV") {
      bumpVerticalPadding(el, 6);
      const lh = cs.lineHeight;
      if (!lh || lh === "normal" || parseFloat(lh) < 1.3) {
        inline.lineHeight = "1.35";
      }
      inline.boxSizing = "border-box";
      if (inline.overflow === "hidden") inline.overflow = "visible";
      if (inline.maxHeight && inline.maxHeight !== "none") {
        inline.maxHeight = "none";
      }
    }
  });
}
