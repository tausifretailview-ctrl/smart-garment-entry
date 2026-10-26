/**
 * Colour look for thermal bills turned into a PDF (WhatsApp, Download, Share).
 *
 * Applied ONLY to the html2canvas clone, so the on-screen preview and the paper
 * from the thermal printer stay black & white. Layouts with a colour design:
 * Vastrakala 80mm/58mm (`vastrakala-80mm`) and Trendzo 80mm (`trendzo-pos-80mm`).
 */

export const THERMAL_PDF_COLOUR_CLASS = "vk-pdf-colour";

export const TRENDZO_PDF_COLOUR_CLASS = "tz-pdf-colour";

const VASTRAKALA_ROOT = ".vastrakala-thermal-receipt-80mm";
const TRENDZO_ROOT = ".trendzo-pos-thermal-receipt-80mm";

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

/** Trendzo premium palette: deep velvet plum with gold accents. */
export const TRENDZO_PDF_COLOURS = {
  velvet: "#2a0a24",
  plum: "#5b1340",
  gold: "#c9a227",
  goldSoft: "#f6ecd0",
  tint: "#fbf6f9",
  line: "#eadde4",
  ink: "#1f1a1d",
  muted: "#5f5560",
} as const;

function trendzoColourCss(): string {
  const c = TRENDZO_PDF_COLOURS;
  // Long selector so it beats the WappConnect clone rules
  // (`.trendzo-pos-thermal-receipt-80mm * { line-height: 1.3 !important }`, `color: #000 !important`).
  const R = `${TRENDZO_ROOT}.${TRENDZO_PDF_COLOUR_CLASS}`;
  const band = `linear-gradient(135deg, ${c.velvet} 0%, ${c.plum} 100%)`;
  return `
    ${R} {
      background: #ffffff !important;
      color: ${c.ink} !important;
      padding: 0 2.5mm 0 !important;
      font-family: Arial, Helvetica, sans-serif !important;
      -webkit-font-smoothing: antialiased !important;
      overflow: hidden !important;
    }
    ${R} * {
      color: ${c.ink} !important;
      line-height: 1.35 !important;
      letter-spacing: 0 !important;
      max-height: none !important;
    }
    ${R} span { padding-top: 0 !important; padding-bottom: 0 !important; }

    /* Header band with the Settings logo on a white card */
    ${R} .tz-header {
      background: ${band} !important;
      margin: 0 -2.5mm !important;
      padding: 3.5mm 3mm 3mm !important;
      width: auto !important;
      border-bottom: 1.2mm solid ${c.gold} !important;
    }
    ${R} .tz-header * { color: #ffffff !important; }
    ${R} .tz-logo {
      max-height: 18mm !important;
      max-width: 42mm !important;
      background: #ffffff !important;
      border-radius: 2mm !important;
      padding: 1.2mm !important;
      margin: 0 auto 2.2mm !important;
    }
    ${R} .tz-company-name {
      font-size: 21px !important;
      font-weight: 800 !important;
      letter-spacing: 2.5px !important;
      line-height: 1.15 !important;
    }
    ${R} .tz-company-meta {
      font-size: 11px !important;
      margin-top: 1.2mm !important;
      line-height: 1.4 !important;
      color: #f3e7ee !important;
    }
    ${R} .tz-header-ids {
      margin-top: 1.8mm !important;
      gap: 1.2mm !important;
      font-size: 10px !important;
    }
    ${R} .tz-header-ids span {
      color: ${c.gold} !important;
      font-weight: 700 !important;
      border: 1px solid ${c.gold} !important;
      border-radius: 999px !important;
      padding: 0.4mm 2mm !important;
    }

    /* Rules next to the coloured blocks are replaced by spacing. */
    ${R} .tz-sep-dashed,
    ${R} .tz-sep-solid {
      border-top: 1px dashed ${c.line} !important;
      margin: 2.4mm 0 !important;
    }
    ${R} .tz-header + .tz-sep-dashed,
    ${R} .tz-doc-title + .tz-sep-solid,
    ${R} .tz-meta + .tz-sep-solid,
    ${R} .tz-items + .tz-sep-dashed { display: none !important; }

    ${R} .tz-doc-title {
      display: table !important;
      margin: 3mm auto 0 !important;
      padding: 0.8mm 5mm !important;
      background: ${c.goldSoft} !important;
      color: ${c.plum} !important;
      border: 1px solid ${c.gold} !important;
      border-radius: 999px !important;
      font-size: 12px !important;
      font-weight: 800 !important;
      letter-spacing: 1.5px !important;
    }

    /* Bill details card */
    ${R} .tz-meta {
      background: ${c.tint} !important;
      border-left: 3px solid ${c.gold} !important;
      border-radius: 1.5mm !important;
      padding: 1.8mm 2.2mm !important;
      margin: 3mm 0 0 !important;
    }
    ${R} .tz-meta .tz-pair-row { font-size: 11px !important; line-height: 1.6 !important; align-items: flex-start !important; }
    ${R} .tz-meta .tz-pair-row * { line-height: 1.6 !important; }
    ${R} .tz-meta .tz-pair-row:first-child * { font-weight: 700 !important; color: ${c.plum} !important; }

    /* Item table */
    ${R} .tz-items { margin-top: 3mm !important; }
    ${R} .tz-items-head {
      background: ${band} !important;
      border: none !important;
      border-radius: 1.2mm !important;
      padding: 1.4mm 1.6mm !important;
      margin: 0 !important;
      align-items: center !important;
      font-size: 10.5px !important;
    }
    ${R} .tz-items-head span { color: #ffffff !important; font-weight: 800 !important; letter-spacing: 0.6px !important; }
    ${R} .tz-items-row {
      padding: 1.6mm 1.6mm !important;
      border-bottom: 1px solid ${c.line} !important;
    }
    ${R} .tz-items-row:nth-child(odd) { background: ${c.tint} !important; }
    ${R} .tz-item-name { font-size: 11px !important; line-height: 1.35 !important; }
    ${R} .tz-items-num { font-size: 12px !important; line-height: 1.35 !important; }
    ${R} .tz-items-row .tz-items-num-col:last-child { color: ${c.plum} !important; font-weight: 800 !important; }

    /* Totals */
    ${R} .tz-summary {
      margin-top: 2.4mm !important;
      padding: 0 1.6mm !important;
      font-size: 11px !important;
    }
    ${R} .tz-summary > div { padding: 0.4mm 0 !important; }
    ${R} .tz-grand-total {
      background: ${band} !important;
      border: none !important;
      border-left: 1.5mm solid ${c.gold} !important;
      border-radius: 1.8mm !important;
      padding: 2.4mm 3mm !important;
      margin: 2.4mm 0 2mm !important;
      font-size: 17px !important;
      align-items: center !important;
    }
    ${R} .tz-grand-total span { color: #ffffff !important; font-weight: 800 !important; letter-spacing: 0.8px !important; }
    ${R} .tz-grand-total span:last-child { color: ${c.gold} !important; font-size: 19px !important; letter-spacing: 0 !important; }
    ${R} .tz-gst-row {
      background: ${c.goldSoft} !important;
      border-radius: 1.2mm !important;
      padding: 1.2mm 1.8mm !important;
      margin: 0 0 2mm !important;
      font-size: 9.5px !important;
    }
    ${R} .tz-gst-row * { color: #6b4e12 !important; font-weight: 600 !important; }
    ${R} .tz-gst-row-blank { display: none !important; }
    ${R} .tz-payment { padding: 0 1.6mm !important; margin: 0 !important; font-size: 11.5px !important; }
    ${R} .tz-payment > div { padding: 0.4mm 0 !important; }
    ${R} .tz-payment .tz-pair-right, ${R} .tz-payment .tz-row-between span:last-child { font-weight: 700 !important; }

    /* UPI QR + bill barcode */
    ${R} .tz-upi-qr {
      border: 1px solid ${c.line} !important;
      border-radius: 2mm !important;
      padding: 2mm !important;
      margin: 3mm 0 0 !important;
    }
    ${R} .tz-upi-qr-title { color: ${c.plum} !important; letter-spacing: 1.2px !important; font-weight: 800 !important; }
    ${R} .tz-invoice-barcode {
      max-height: none !important;
      overflow: visible !important;
      margin: 3.5mm 0 0 !important;
    }
    ${R} .tz-invoice-barcode-no {
      margin-top: 1.4mm !important;
      font-size: 11px !important;
      letter-spacing: 1px !important;
      color: ${c.muted} !important;
    }

    /* Terms */
    ${R} .tz-terms-title {
      margin: 0 0 1.2mm !important;
      font-size: 10.5px !important;
      font-weight: 800 !important;
      letter-spacing: 1.5px !important;
      color: ${c.plum} !important;
    }
    ${R} .tz-terms-list { padding: 0 1mm !important; }
    ${R} .tz-terms-list, ${R} .tz-terms-list * {
      font-size: 10px !important;
      line-height: 1.5 !important;
      color: ${c.muted} !important;
    }

    /* Footer band */
    ${R} .tz-footer {
      background: ${band} !important;
      margin: 3mm -2.5mm 0 !important;
      padding: 2.6mm 2mm 2.2mm !important;
      border-top: 1.2mm solid ${c.gold} !important;
      font-size: 12px !important;
      letter-spacing: 1px !important;
    }
    ${R} .tz-footer, ${R} .tz-footer * { color: #ffffff !important; }
    ${R} .tz-footer-sub { color: ${c.gold} !important; font-size: 11px !important; margin-top: 0.6mm !important; }
    ${R} .tz-branding {
      background: ${c.velvet} !important;
      margin: 0 -2.5mm !important;
      padding: 0 2mm 2.2mm !important;
      font-size: 8.5px !important;
    }
    ${R} .tz-branding, ${R} .tz-branding * { color: #c8b6c1 !important; }
  `;
}

const THERMAL_PDF_THEMES: { root: string; className: string; css: () => string }[] = [
  { root: VASTRAKALA_ROOT, className: THERMAL_PDF_COLOUR_CLASS, css: vastrakalaColourCss },
  { root: TRENDZO_ROOT, className: TRENDZO_PDF_COLOUR_CLASS, css: trendzoColourCss },
];

function themeRoots(clonedElement: HTMLElement, root: string): HTMLElement[] {
  return clonedElement.matches(root)
    ? [clonedElement]
    : Array.from(clonedElement.querySelectorAll<HTMLElement>(root));
}

/** True when the clone holds a thermal layout that has a colour PDF design. */
export function hasThermalPdfColourTheme(root: HTMLElement): boolean {
  return THERMAL_PDF_THEMES.some((t) => themeRoots(root, t.root).length > 0);
}

/**
 * Give the html2canvas clone of a thermal bill its colour PDF look. Safe to call on
 * any clone: does nothing when the layout has no colour design.
 */
export function applyThermalPdfColourTheme(clonedDoc: Document, clonedElement: HTMLElement): boolean {
  let applied = false;
  for (const theme of THERMAL_PDF_THEMES) {
    const roots = themeRoots(clonedElement, theme.root);
    if (roots.length === 0) continue;
    roots.forEach((el) => el.classList.add(theme.className));
    const style = clonedDoc.createElement("style");
    style.setAttribute("data-thermal-pdf-colour", theme.className);
    style.textContent = theme.css();
    // Appended last so it follows the WappConnect clone fixes in the cascade.
    (clonedDoc.head ?? clonedDoc.body).appendChild(style);
    applied = true;
  }
  return applied;
}

/** Exported for the static preview / tests. */
export const __vastrakalaColourCssForTests = vastrakalaColourCss;
export const __trendzoColourCssForTests = trendzoColourCss;
