import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

/** CSS / designer family names offered in the Standard tab dropdown. */
export const LABEL_DESIGNER_FONT_FAMILIES = [
  "Arial",
  "Courier New",
  "Georgia",
  "Times New Roman",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
] as const;

export type LabelDesignerFontFamily = (typeof LABEL_DESIGNER_FONT_FAMILIES)[number];

/** Which pdf-lib StandardFonts family group a designer name maps to. */
export type PdfStandardFontGroup = "helvetica" | "times" | "courier";

/**
 * Map a designer/CSS font-family string to the nearest PDF StandardFonts group.
 * Proprietary web fonts (Arial, Verdana, …) are approximated — Option A.
 */
export function mapLabelFontFamilyToPdfGroup(
  fontFamily?: string | null,
): PdfStandardFontGroup {
  const raw = String(fontFamily || "").trim().toLowerCase();
  if (!raw) return "helvetica";

  // Take first family if a CSS stack was saved.
  const primary = raw.split(",")[0]?.replace(/['"]/g, "").trim() || raw;

  if (
    primary.includes("courier") ||
    primary === "monospace" ||
    primary.includes("consolas") ||
    primary.includes("lucida console")
  ) {
    return "courier";
  }

  if (
    primary.includes("times") ||
    primary.includes("georgia") ||
    primary.includes("garamond") ||
    primary.includes("palatino") ||
    primary === "serif"
  ) {
    return "times";
  }

  // Arial, Verdana, Tahoma, Trebuchet, Helvetica, Comic Sans (legacy), sans-serif → Helvetica
  return "helvetica";
}

/**
 * Designer stores fontSize in CSS px; PDF uses points (96dpi: 1px = 0.75pt).
 * Ceiling matches a generous designer max so preview and print stay in sync
 * (Standard tab UI max is 20px → 15pt; precision can go higher).
 */
export function labelFontSizePxToPt(fontSizePx: number): number {
  const px = Number(fontSizePx);
  const safePx = Number.isFinite(px) ? px : 8;
  return Math.max(4, Math.min(48, safePx * 0.75));
}

export type EmbeddedLabelPdfFonts = {
  helvetica: PDFFont;
  helveticaBold: PDFFont;
  times: PDFFont;
  timesBold: PDFFont;
  courier: PDFFont;
  courierBold: PDFFont;
};

export async function embedLabelPdfStandardFonts(
  pdfDoc: PDFDocument,
): Promise<EmbeddedLabelPdfFonts> {
  const [helvetica, helveticaBold, times, timesBold, courier, courierBold] =
    await Promise.all([
      pdfDoc.embedFont(StandardFonts.Helvetica),
      pdfDoc.embedFont(StandardFonts.HelveticaBold),
      pdfDoc.embedFont(StandardFonts.TimesRoman),
      pdfDoc.embedFont(StandardFonts.TimesRomanBold),
      pdfDoc.embedFont(StandardFonts.Courier),
      pdfDoc.embedFont(StandardFonts.CourierBold),
    ]);
  return { helvetica, helveticaBold, times, timesBold, courier, courierBold };
}

export function pickLabelPdfFont(
  fonts: EmbeddedLabelPdfFonts,
  fontFamily: string | undefined | null,
  bold: boolean | undefined,
): PDFFont {
  const group = mapLabelFontFamilyToPdfGroup(fontFamily);
  const useBold = !!bold;
  switch (group) {
    case "times":
      return useBold ? fonts.timesBold : fonts.times;
    case "courier":
      return useBold ? fonts.courierBold : fonts.courier;
    case "helvetica":
    default:
      return useBold ? fonts.helveticaBold : fonts.helvetica;
  }
}
