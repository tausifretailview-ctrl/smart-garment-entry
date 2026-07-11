import JsBarcode from "jsbarcode";
import type { LabelFieldConfig } from "@/types/labelTypes";
import {
  computeLabelBarcodeLayout,
  mmToDots,
  type LabelBarcodeLayout,
  type LabelData,
  type TSPLLabelConfig,
  type TSPLTemplateConfig,
} from "@/utils/tsplGenerator";

export const BARCODE_MM_TO_PX = 3.7795275591;

export type BarcodeSlotMm = {
  heightMm: number;
  widthMm: number;
  layout: LabelBarcodeLayout | null;
};

function hasAbsoluteLabelPositions(templateConfig: TSPLTemplateConfig): boolean {
  return (templateConfig.fieldOrder || []).some((fieldKey) => {
    const field = templateConfig[fieldKey as keyof TSPLTemplateConfig] as { x?: number; y?: number } | undefined;
    return field && (field.x !== undefined || field.y !== undefined);
  });
}

function resolveBarcodeWidthMm(
  barcodeConfig: TSPLTemplateConfig["barcode"] | undefined,
  labelWidthMm: number,
): number {
  const slotX = barcodeConfig?.x ?? 0;
  const available = Math.max(1, labelWidthMm - slotX);
  if (!barcodeConfig?.width) return available;
  if (barcodeConfig.width > labelWidthMm) {
    return Math.min(available, (barcodeConfig.width / 100) * labelWidthMm);
  }
  return Math.min(available, barcodeConfig.width);
}

/** Shared barcode band height — matches Precision Pro preview and TSPL direct print. */
export function resolveBarcodeSlotMm(
  labelConfig: Pick<TSPLLabelConfig, "width" | "height">,
  templateConfig: TSPLTemplateConfig,
  data: LabelData,
  dpi = 203,
): BarcodeSlotMm {
  const hasAbsolutePos = hasAbsoluteLabelPositions(templateConfig);
  const isCompactLabel = labelConfig.width <= 40 && labelConfig.height <= 25;
  const applyCompactAdjustments = isCompactLabel && !hasAbsolutePos;
  const compactBottomPaddingDots = applyCompactAdjustments
    ? mmToDots(0.8, dpi)
    : mmToDots(0.5, dpi);

  const layout = computeLabelBarcodeLayout(
    { width: labelConfig.width, height: labelConfig.height, gap: 2 },
    templateConfig,
    data,
    {
      dpi,
      hasAbsolutePos,
      applyCompactAdjustments,
      compactBottomPaddingDots,
    },
  );

  const slider = templateConfig.barcodeHeight ?? 30;
  const fallbackHeightMm = (slider / 100) * labelConfig.height;
  const heightMm = layout?.barcodeHeightMm ?? fallbackHeightMm;
  const widthMm = resolveBarcodeWidthMm(templateConfig.barcode, labelConfig.width);

  return { heightMm, widthMm, layout };
}

/** Render CODE128 at fixed bar height; shrink module width only when the code is too wide. */
export function applyJsBarcodeToElement(
  svg: SVGSVGElement,
  code: string,
  slotWidthMm: number,
  slotHeightMm: number,
  lineWidth = 1.5,
): void {
  const heightPx = Math.max(8, slotHeightMm * BARCODE_MM_TO_PX);
  const maxWidthPx = Math.max(12, slotWidthMm * BARCODE_MM_TO_PX);

  const render = (moduleWidth: number) => {
    JsBarcode(svg, code, {
      format: "CODE128",
      height: heightPx,
      width: moduleWidth,
      displayValue: false,
      margin: 0,
      background: "transparent",
      lineColor: "#000000",
    });
  };

  render(lineWidth);
  const renderedW = parseFloat(svg.getAttribute("width") || "0");
  if (renderedW > maxWidthPx && renderedW > 0) {
    const fitted = Math.max(0.5, lineWidth * (maxWidthPx / renderedW));
    render(fitted);
  }

  svg.setAttribute("height", String(heightPx));
  svg.removeAttribute("width");
  svg.style.height = `${slotHeightMm}mm`;
  svg.style.width = "auto";
  svg.style.maxWidth = `${slotWidthMm}mm`;
  svg.style.display = "block";
  svg.style.flexShrink = "0";
}

export function renderBarcodeSvgString(
  code: string,
  slotWidthMm: number,
  slotHeightMm: number,
  lineWidth = 1.5,
): string {
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    applyJsBarcodeToElement(svg, code, slotWidthMm, slotHeightMm, lineWidth);
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return "";
  }
}

export function barcodeHeightPxFromMm(heightMm: number): number {
  return heightMm * BARCODE_MM_TO_PX;
}

/** Legacy px slider → mm when layout is unavailable (standard print HTML). */
export function legacyBarcodeHeightMm(barcodeHeightSlider: number | undefined, labelHeightMm: number): number {
  const slider = barcodeHeightSlider ?? 30;
  return (slider / 100) * labelHeightMm;
}

/** Tight lineHeight (≤1.15) signals a designed multi-line text slot. */
export function labelFieldAllowsMultiline(field: Pick<LabelFieldConfig, "lineHeight">): boolean {
  return field.lineHeight != null && field.lineHeight <= 1.15;
}
