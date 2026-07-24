/**
 * html2canvas clone fixes used ONLY for WappConnect WhatsApp invoice PDFs.
 * Print / on-screen invoice templates stay unchanged — these tweaks apply to the
 * off-screen clone that html2canvas rasterizes.
 *
 * Symptom without careful handling:
 * - Horizontal borders cut through text (tight padding / transforms)
 * - Retail ERP A5: blank SN rows inflate and paint over Note / Sub Total / Bill Total
 *   when every cell is forced to min-height 24px + 6px padding + overflow:visible
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

function isRetailErpCloneRoot(el: HTMLElement): boolean {
  return Boolean(
    el.classList.contains("retail-erp-invoice-template") ||
      el.classList.contains("retail-erp-all-pages") ||
      el.querySelector(".retail-erp-invoice-template"),
  );
}

function isRetailErpLayoutShell(el: HTMLElement): boolean {
  if (
    el.classList.contains("retail-erp-invoice-template") ||
    el.classList.contains("retail-erp-all-pages") ||
    el.classList.contains("retail-erp-items-grow") ||
    el.classList.contains("retail-erp-footer") ||
    el.classList.contains("retail-erp-qr-box")
  ) {
    return true;
  }
  // Flex page chrome (bordered outer / bill-to / note+totals row) must keep overflow clip.
  const cls = el.className || "";
  return typeof cls === "string" && cls.includes("retail-erp");
}

/** True when a body row is a filler SN line (no item description / amounts). */
function isBlankRetailErpItemRow(tr: HTMLElement): boolean {
  if (tr.closest("thead")) return false;
  const tds = Array.from(tr.querySelectorAll(":scope > td"));
  if (tds.length < 3) return false;
  // Description / size / barcode / amount cells are empty or nbsp on fillers.
  const meaningful = tds.slice(1).some((td) => {
    const text = (td.textContent || "").replace(/\u00a0/g, " ").trim();
    return text.length > 0;
  });
  return !meaningful;
}

/**
 * Mutate the html2canvas document clone so borders sit below text and fonts
 * render cleanly in the WhatsApp PDF attachment — without blowing A5 Retail ERP
 * layout so blank SN rows cover the footer.
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

  const retailErp = isRetailErpCloneRoot(clonedElement);

  const styleEl = clonedDoc.createElement("style");
  styleEl.setAttribute("data-wappconnect-pdf-fix", "true");
  styleEl.textContent = retailErp
    ? `
    .retail-erp-invoice-template,
    .retail-erp-all-pages {
      font-family: Arial, Helvetica, sans-serif !important;
      -webkit-font-smoothing: antialiased !important;
      text-rendering: geometricPrecision !important;
      color: #000 !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }
    .retail-erp-items-grow {
      overflow: hidden !important;
      min-height: 0 !important;
    }
    .retail-erp-footer {
      flex-shrink: 0 !important;
      overflow: hidden !important;
      position: relative !important;
      z-index: 2 !important;
      background: #fff !important;
    }
    .retail-erp-invoice-template td,
    .retail-erp-invoice-template th {
      /* Mild bump only — 6px padding + 24px min blew A5 blank rows over the footer. */
      height: auto !important;
      max-height: none !important;
      min-height: 18px !important;
      padding-top: 3px !important;
      padding-bottom: 3px !important;
      line-height: 1.3 !important;
      vertical-align: middle !important;
      overflow: hidden !important;
      font-family: Arial, Helvetica, sans-serif !important;
      box-sizing: border-box !important;
    }
    .retail-erp-invoice-template tr {
      height: auto !important;
      max-height: none !important;
    }
    .retail-erp-invoice-template tbody tr[data-wapp-blank-row="1"] td {
      min-height: 14px !important;
      padding-top: 1px !important;
      padding-bottom: 1px !important;
      font-size: 9px !important;
    }
  `
    : `
    .retail-invoice-template,
    .retail-invoice-all-pages,
    [class*="invoice-template"] {
      font-family: Arial, Helvetica, sans-serif !important;
      -webkit-font-smoothing: antialiased !important;
      text-rendering: geometricPrecision !important;
      color: #000 !important;
    }
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
    .retail-invoice-template tr {
      height: auto !important;
      max-height: none !important;
    }
  `;
  clonedDoc.head?.appendChild(styleEl);

  if (retailErp) {
    clonedElement.querySelectorAll<HTMLElement>(".retail-erp-invoice-template").forEach((page) => {
      page.style.overflow = "hidden";
      page.style.boxSizing = "border-box";
    });
    clonedElement.querySelectorAll<HTMLElement>(".retail-erp-items-grow").forEach((grow) => {
      grow.style.overflow = "hidden";
      grow.style.minHeight = "0";
    });
    clonedElement.querySelectorAll<HTMLElement>(".retail-erp-footer").forEach((footer) => {
      footer.style.overflow = "hidden";
      footer.style.flexShrink = "0";
      footer.style.position = "relative";
      footer.style.zIndex = "2";
      footer.style.backgroundColor = "#ffffff";
    });
    clonedElement.querySelectorAll<HTMLElement>(".retail-erp-invoice-template tbody tr").forEach((tr) => {
      if (isBlankRetailErpItemRow(tr)) {
        tr.setAttribute("data-wapp-blank-row", "1");
      }
    });
  }

  const cellPadMin = retailErp ? 3 : 6;
  const cellMinHeight = retailErp ? "18px" : "24px";

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
        if (!inline.minHeight) inline.minHeight = cellMinHeight;
      }
      // Retail ERP: keep overflow clipped so SN grid cannot paint over footer.
      if (retailErp) {
        inline.overflow = "hidden";
      } else if (inline.overflow === "hidden") {
        inline.overflow = "visible";
      }
      const blankRow =
        retailErp &&
        (el.tagName === "TR"
          ? el.getAttribute("data-wapp-blank-row") === "1"
          : el.parentElement?.getAttribute("data-wapp-blank-row") === "1");
      bumpVerticalPadding(el, blankRow ? 1 : cellPadMin);
      inline.lineHeight = retailErp ? "1.3" : "1.35";
      inline.verticalAlign = "middle";
      inline.boxSizing = "border-box";
      return;
    }

    if (retailErp && isRetailErpLayoutShell(el)) {
      // Never clear overflow on page / items / footer shells.
      if (
        el.classList.contains("retail-erp-items-grow") ||
        el.classList.contains("retail-erp-invoice-template") ||
        el.classList.contains("retail-erp-all-pages") ||
        el.classList.contains("retail-erp-footer")
      ) {
        inline.overflow = "hidden";
      }
      return;
    }

    const cs = clonedDoc.defaultView?.getComputedStyle(el);
    if (!cs) return;

    const borderBottom = parsePx(cs.borderBottomWidth);
    const borderTop = parsePx(cs.borderTopWidth);
    if ((borderBottom > 0 || borderTop > 0) && el.tagName === "DIV") {
      bumpVerticalPadding(el, retailErp ? 3 : 6);
      const lh = cs.lineHeight;
      if (!lh || lh === "normal" || parseFloat(lh) < 1.3) {
        inline.lineHeight = retailErp ? "1.3" : "1.35";
      }
      inline.boxSizing = "border-box";
      if (retailErp) {
        // Keep footer/note bands from expanding the fixed A5 page past the SN grid.
        if (inline.overflow === "hidden") {
          /* keep */
        } else {
          inline.overflow = "hidden";
        }
      } else {
        if (inline.overflow === "hidden") inline.overflow = "visible";
        if (inline.maxHeight && inline.maxHeight !== "none") {
          inline.maxHeight = "none";
        }
      }
    }
  });
}
