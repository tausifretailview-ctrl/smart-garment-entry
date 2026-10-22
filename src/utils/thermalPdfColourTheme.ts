/**
 * Colour look for thermal bills turned into a PDF (WhatsApp, Download, Share).
 *
 * Applied ONLY to the html2canvas clone, so the on-screen preview and the paper
 * from the thermal printer stay black & white. Today only the Vastrakala 80mm/58mm
 * layout (`vastrakala-80mm`) has a colour design.
 */

export const THERMAL_PDF_COLOUR_CLASS = "vk-pdf-colour";

const VASTRAKALA_ROOT = ".vastrakala-thermal-receipt-80mm";

/** Brand colours of the PDF design. */
export const THERMAL_PDF_COLOURS = {
  deep: "#3b1a78",
  violet: "#6d28d9",
  pink: "#db2777",
  tint: "#f5f3ff",
  tintBorder: "#ddd6fe",
  ink: "#1f2937",
  muted: "#4b5563",
  green: "#047857",
  greenLight: "#10b981",
} as const;

function vastrakalaColourCss(): string {
  const c = THERMAL_PDF_COLOURS;
  // `R` is long on purpose: it must beat the WappConnect clone rules
  // (`.thermal-receipt-container * { color: #000 !important; line-height: 1.5 !important }`).
  const R = `${VASTRAKALA_ROOT}.${THERMAL_PDF_COLOUR_CLASS}`;
  return `
    ${R} {
      background: #ffffff !important;
      color: ${c.ink} !important;
      padding: 0 2.5mm 0 !important;
      font-family: Arial, Helvetica, sans-serif !important;
      -webkit-font-smoothing: antialiased !important;
      line-height: 1.35 !important;
      overflow: hidden !important;
    }
    ${R}[data-thermal-paper="58mm"] { padding: 0 1.5mm 0 !important; }
    ${R} * {
      color: ${c.ink} !important;
      letter-spacing: 0 !important;
      line-height: 1.35 !important;
      max-height: none !important;
      text-overflow: clip !important;
    }
    ${R} span { overflow: visible !important; padding-top: 0 !important; padding-bottom: 0 !important; }

    /* Header band: shop name, address, contact, Instagram, document title */
    ${R} .vk-header {
      background: linear-gradient(135deg, ${c.deep} 0%, ${c.violet} 55%, ${c.pink} 100%) !important;
      margin: 0 -2.5mm !important;
      padding: 3mm 2.5mm 3mm !important;
    }
    ${R}[data-thermal-paper="58mm"] .vk-header { margin: 0 -1.5mm !important; padding: 2mm 1.5mm !important; }
    ${R} .vk-header * { color: #ffffff !important; }
    ${R} .vk-header-title { font-weight: 800 !important; line-height: 1.1 !important; }
    ${R} .vk-header-tagline { font-weight: 700 !important; opacity: 0.95; }
    ${R} .vk-header-meta { font-weight: 600 !important; font-size: 0.86em !important; line-height: 1.4 !important; }
    ${R} .vk-header-logo {
      background: #ffffff !important;
      border-radius: 2mm !important;
      padding: 0.8mm !important;
      box-sizing: border-box !important;
    }
    ${R} .vk-insta-line {
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      flex-wrap: nowrap !important;
      word-break: break-all !important;
      font-size: 0.92em !important;
    }
    ${R} .vk-insta-icon { margin-right: 1mm !important; flex: 0 0 auto !important; vertical-align: middle !important; }
    ${R} .vk-insta-icon rect, ${R} .vk-insta-icon circle { stroke: #ffffff !important; }
    ${R} .vk-insta-icon circle:last-child { fill: #ffffff !important; }
    ${R} .vk-doc-title {
      display: table !important;
      margin: 2.2mm auto 0 !important;
      padding: 0.7mm 4mm !important;
      background: #ffffff !important;
      color: ${c.violet} !important;
      border-radius: 999px !important;
      font-weight: 800 !important;
      font-size: 0.9em !important;
      letter-spacing: 0.8px !important;
    }

    /* Plain dashed rules become soft lines; the coloured bars do the separating. */
    ${R} .vk-rule {
      border-top: 1px dashed ${c.tintBorder} !important;
      margin: 2mm 0 !important;
    }
    ${R} .vk-header + .vk-rule,
    ${R} .vk-meta + .vk-rule,
    ${R} .vk-items-head + .vk-rule,
    ${R} .vk-items-body + .vk-rule { display: none !important; }

    /* Customer / bill card */
    ${R} .vk-meta {
      background: ${c.tint} !important;
      border-left: 3px solid ${c.violet} !important;
      border-radius: 1.5mm !important;
      padding: 1.6mm 2mm !important;
      margin: 2.5mm 0 0 !important;
      font-weight: 600 !important;
      font-size: 0.88em !important;
      line-height: 1.55 !important;
    }
    ${R} .vk-meta * { line-height: 1.55 !important; }
    ${R} .vk-meta > div:first-child { font-weight: 800 !important; color: ${c.deep} !important; }

    /* Item table */
    ${R} .vk-items-head {
      background: ${c.deep} !important;
      border-radius: 1.2mm !important;
      padding: 1.2mm 1.2mm !important;
      margin: 2.5mm 0 0 !important;
      font-size: 0.78em !important;
      align-items: center !important;
    }
    ${R} .vk-items-head span { color: #ffffff !important; font-weight: 800 !important; white-space: nowrap !important; }
    ${R} .vk-items-body { margin: 0 !important; }
    ${R} .vk-items-row {
      padding: 1.3mm 1.2mm !important;
      margin: 0 !important;
      border-bottom: 1px solid ${c.tintBorder} !important;
      font-weight: 600 !important;
      font-size: 0.88em !important;
    }
    ${R} .vk-items-row:nth-child(even) { background: #faf7ff !important; }
    ${R} .vk-items-row > span:last-child { color: ${c.deep} !important; font-weight: 800 !important; }
    ${R} .vk-particular-line1, ${R} .vk-particular-line2 { font-weight: 700 !important; }
    ${R} .vk-line-disc { color: ${c.pink} !important; font-weight: 600 !important; }

    /* Totals: amounts first as aligned label / value rows, then QTY + payment chips */
    ${R} .vk-totals {
      flex-direction: column-reverse !important;
      gap: 1.8mm !important;
      padding: 0 !important;
      margin: 2.5mm 0 0 !important;
      font-size: 0.9em !important;
    }
    ${R} .vk-totals-right {
      text-align: left !important;
      padding: 0 1.2mm !important;
      font-weight: 600 !important;
    }
    ${R} .vk-totals-right > div { display: flex !important; justify-content: space-between !important; padding: 0.3mm 0 !important; }
    ${R} .vk-kv > span:last-child { font-variant-numeric: tabular-nums; font-weight: 700 !important; }
    ${R} .vk-totals-right > .vk-net-amt {
      margin: 1.5mm -1.2mm 0 !important;
      padding: 1.8mm 2.2mm !important;
      border-radius: 1.5mm !important;
      background: linear-gradient(135deg, ${c.green} 0%, ${c.greenLight} 100%) !important;
      font-weight: 800 !important;
      align-items: center !important;
    }
    ${R} .vk-net-amt * { color: #ffffff !important; font-weight: 800 !important; }
    ${R} .vk-totals-left {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 1.2mm !important;
    }
    ${R} .vk-totals-left > div {
      background: #fdf2f8 !important;
      color: #9d174d !important;
      border: 1px solid #fbcfe8 !important;
      border-radius: 999px !important;
      padding: 0.5mm 2.4mm !important;
      font-size: 0.86em !important;
      font-weight: 700 !important;
    }

    /* Terms */
    ${R} .vk-terms {
      background: #fffbeb !important;
      border: 1px dashed #fcd34d !important;
      border-radius: 1.5mm !important;
      padding: 1.6mm 2mm !important;
      margin: 0 !important;
    }
    ${R} .vk-terms-label { color: #b45309 !important; font-weight: 800 !important; font-size: 0.82em !important; }
    ${R} .vk-terms-body, ${R} .vk-terms-body * {
      color: ${c.muted} !important;
      font-weight: 600 !important;
      font-size: 0.78em !important;
      line-height: 1.45 !important;
    }
    ${R} .vk-terms-body * { font-size: 1em !important; }

    /* Footer band */
    ${R} .vk-footer-thanks {
      background: linear-gradient(135deg, ${c.deep} 0%, ${c.violet} 55%, ${c.pink} 100%) !important;
      margin: 3mm -2.5mm 0 !important;
      padding: 2.2mm 2mm !important;
      font-weight: 800 !important;
      font-size: 0.95em !important;
      letter-spacing: 0.5px !important;
    }
    ${R}[data-thermal-paper="58mm"] .vk-footer-thanks { margin: 2mm -1.5mm 0 !important; }
    ${R} .vk-footer-thanks, ${R} .vk-footer-thanks * { color: #ffffff !important; }
  `;
}

/** True when the clone holds a thermal layout that has a colour PDF design. */
export function hasThermalPdfColourTheme(root: HTMLElement): boolean {
  return root.matches(VASTRAKALA_ROOT) || Boolean(root.querySelector(VASTRAKALA_ROOT));
}

/**
 * Give the html2canvas clone of a thermal bill its colour PDF look. Safe to call on
 * any clone: does nothing when the layout has no colour design.
 */
export function applyThermalPdfColourTheme(clonedDoc: Document, clonedElement: HTMLElement): boolean {
  if (!hasThermalPdfColourTheme(clonedElement)) return false;
  const roots = clonedElement.matches(VASTRAKALA_ROOT)
    ? [clonedElement]
    : Array.from(clonedElement.querySelectorAll<HTMLElement>(VASTRAKALA_ROOT));
  roots.forEach((el) => el.classList.add(THERMAL_PDF_COLOUR_CLASS));

  const style = clonedDoc.createElement("style");
  style.setAttribute("data-thermal-pdf-colour", "true");
  style.textContent = vastrakalaColourCss();
  // Appended last so it follows the WappConnect clone fixes in the cascade.
  (clonedDoc.head ?? clonedDoc.body).appendChild(style);
  return true;
}

/** Exported for the static preview / tests. */
export const __vastrakalaColourCssForTests = vastrakalaColourCss;
