import { useEffect, useRef, type RefObject } from "react";
import JsBarcode from "jsbarcode";
import type { LabelItem } from "@/types/labelTypes";
import {
  BOX_W,
  LABEL_H,
  PAIR_COL_W,
  PAIR_H,
  PAIR_MID_Y,
  PAIR_TOP,
  PRECISION_PRO_DEBUG_DIVIDERS,
  PRECISION_PRO_TSC_HEIGHT_MM,
  PRECISION_PRO_TSC_WIDTH_MM,
  TRUNC,
  boxBarcodeNarrowBarWidth,
  dotsToMm,
} from "@/utils/labels/precisionProGeometry";
import {
  DEFAULT_FOOTWEAR_FORM_DESIGN,
  FOOTWEAR_FIELD_KEYS,
  type FootwearFieldKey,
  type FootwearFieldLayout,
  type FootwearFormDesign,
  type FootwearPanelDesign,
  resolveBoxSizeLayout,
  resolveFootwearFormDesign,
} from "@/utils/labels/precisionProFootwearDesign";

export interface PrecisionProTSCPreviewProps {
  item: LabelItem;
  businessName: string;
  scaleFactor?: number;
  showBorder?: boolean;
  /** When omitted, uses the built-in default design (legacy layout). */
  design?: FootwearFormDesign | null;
}

const trunc = (s: string, max: number) => (s || "").slice(0, max);

function useBarcode(
  ref: RefObject<SVGSVGElement | null>,
  code: string,
  height: number,
  width: number,
) {
  useEffect(() => {
    if (!ref.current || !code) return;
    try {
      JsBarcode(ref.current, code, {
        format: "CODE128",
        height,
        width,
        displayValue: false,
        margin: 0,
        background: "transparent",
        lineColor: "#000000",
      });
    } catch {
      // invalid barcode
    }
  }, [code, height, width, ref]);
}

interface PanelValues {
  businessName: string;
  barcode: string;
  mrp: number;
  productName: string;
  style: string;
  brand: string;
  category: string;
  color: string;
  size: string;
}

function valueFor(
  key: FootwearFieldKey,
  values: PanelValues,
  layout: FootwearFieldLayout,
): string {
  const raw =
    key === "businessName"
      ? values.businessName
      : key === "barcode" || key === "barcodeText"
        ? values.barcode
        : key === "mrp"
          ? String(values.mrp)
          : key === "productName"
            ? values.productName
            : key === "style"
              ? values.style
              : key === "brand"
                ? values.brand
                : key === "category"
                  ? values.category
                  : key === "color"
                    ? values.color
                    : values.size;
  return `${layout.caption || ""}${raw}${layout.suffix || ""}`;
}

/** Rough TSPL font → preview font-size pt. */
function fontPt(font: string, mul: number): number {
  const base =
    font === "5" ? 14 : font === "4" ? 12 : font === "3" ? 10 : font === "2" ? 8 : 6;
  return base * Math.max(1, mul);
}

function ConfigPanel({
  panel,
  values,
  panelWDots,
  panelHDots,
  isBox,
  u,
  fs,
  barcodeRef,
  barcodeNarrow,
}: {
  panel: FootwearPanelDesign;
  values: PanelValues;
  panelWDots: number;
  panelHDots: number;
  isBox: boolean;
  u: (mm: number) => string;
  fs: (pt: number) => string;
  barcodeRef: RefObject<SVGSVGElement | null>;
  barcodeNarrow: 1 | 2;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden font-sans text-black leading-tight">
      {FOOTWEAR_FIELD_KEYS.map((key) => {
        const layout = panel.fields[key];
        if (!layout?.show) return null;

        if (key === "barcode") {
          const hMm = dotsToMm(layout.barcodeHeight ?? (isBox ? 60 : 26));
          return (
            <div
              key={key}
              className="absolute"
              style={{
                left: u(dotsToMm(layout.x)),
                top: u(dotsToMm(layout.y)),
                width: u(dotsToMm(Math.max(40, panelWDots - layout.x - 8))),
              }}
            >
              <svg ref={barcodeRef} className="block w-full" style={{ height: u(hMm) }} />
            </div>
          );
        }

        let x = layout.x;
        let y = layout.y;
        let text = valueFor(key, values, layout);
        let pt = fontPt(layout.font, layout.mulX);

        if (key === "size" && isBox) {
          const size = resolveBoxSizeLayout(values.size, layout);
          x = size.x;
          y = size.y;
          text = size.text;
          pt = fontPt(size.font, size.mulX);
        }

        return (
          <div
            key={key}
            className="absolute truncate"
            style={{
              left: u(dotsToMm(x)),
              top: u(dotsToMm(y)),
              maxWidth: u(dotsToMm(Math.max(24, panelWDots - x - 4))),
              fontSize: fs(pt),
              fontWeight: layout.mulX >= 2 || layout.font === "4" || layout.font === "5" ? 700 : 500,
              fontFamily: key === "barcodeText" ? "ui-monospace, monospace" : undefined,
            }}
          >
            {text}
          </div>
        );
      })}
      {/* keep panelHDots referenced for layout clarity */}
      <span className="sr-only">{panelHDots}</span>
    </div>
  );
}

export function PrecisionProTSCPreview({
  item,
  businessName,
  scaleFactor = 1.5,
  showBorder = true,
  design = null,
}: PrecisionProTSCPreviewProps) {
  const resolved = resolveFootwearFormDesign(design ?? DEFAULT_FOOTWEAR_FORM_DESIGN);
  const boxBarcodeRef = useRef<SVGSVGElement>(null);
  const pair1BarcodeRef = useRef<SVGSVGElement>(null);
  const pair2BarcodeRef = useRef<SVGSVGElement>(null);

  const barcode = item.barcode || "";
  const mrp = item.mrp ?? item.sale_price ?? 0;
  const boxNarrow = boxBarcodeNarrowBarWidth(barcode);
  const limBox = TRUNC.box;
  const limPair = TRUNC.pair;

  const boxValues: PanelValues = {
    businessName: trunc(businessName, limBox.org),
    barcode,
    mrp,
    productName: trunc(item.product_name, limBox.product),
    style: trunc(item.style, limBox.style),
    brand: trunc(item.brand, limBox.brand),
    category: trunc(item.category, limBox.category),
    color: trunc(item.color, limBox.color),
    size: trunc(item.size, limBox.size),
  };

  const pairValues: PanelValues = {
    businessName: trunc(businessName, limPair.org),
    barcode,
    mrp,
    productName: trunc(item.product_name, limPair.product),
    style: trunc(item.style, limPair.style),
    brand: trunc(item.brand, limPair.brand),
    category: trunc(item.category, limPair.category),
    color: trunc(item.color, limPair.color),
    size: trunc(item.size, limPair.size),
  };

  const boxBarH = resolved.box.fields.barcode.barcodeHeight ?? 60;
  const pairBarH = resolved.pair.fields.barcode.barcodeHeight ?? 26;

  useBarcode(boxBarcodeRef, barcode, (boxBarH / 2) * scaleFactor, boxNarrow === 2 ? 1.4 : 0.9);
  useBarcode(pair1BarcodeRef, barcode, (pairBarH / 2) * scaleFactor, 0.9);
  useBarcode(pair2BarcodeRef, barcode, (pairBarH / 2) * scaleFactor, 0.9);

  const u = (mm: number) => `${mm * scaleFactor}mm`;
  const fs = (pt: number) => `${pt * scaleFactor * 0.35}mm`;

  const boxWidthMm = dotsToMm(BOX_W);
  const pairWidthMm = dotsToMm(PAIR_COL_W);
  const gapMm = Math.max(0, PRECISION_PRO_TSC_WIDTH_MM - boxWidthMm - pairWidthMm);
  const pair1TopMm = dotsToMm(PAIR_TOP);
  const pair1HMm = dotsToMm(PAIR_H);
  const pair2TopMm = dotsToMm(PAIR_MID_Y);
  const pair2HMm = dotsToMm(LABEL_H - PAIR_MID_Y);

  return (
    <div
      className="relative flex bg-white text-black font-sans overflow-hidden box-border"
      style={{
        width: u(PRECISION_PRO_TSC_WIDTH_MM),
        height: u(PRECISION_PRO_TSC_HEIGHT_MM),
        border: showBorder ? "1px dashed hsl(var(--border))" : undefined,
      }}
    >
      <div className="relative shrink-0 h-full overflow-hidden" style={{ width: u(boxWidthMm) }}>
        <ConfigPanel
          panel={resolved.box}
          values={boxValues}
          panelWDots={BOX_W}
          panelHDots={LABEL_H}
          isBox
          u={u}
          fs={fs}
          barcodeRef={boxBarcodeRef}
          barcodeNarrow={boxNarrow}
        />
      </div>

      {gapMm > 0 && (
        <div
          className={PRECISION_PRO_DEBUG_DIVIDERS ? "shrink-0 bg-black" : "shrink-0"}
          style={{ width: u(gapMm), height: "100%" }}
        />
      )}

      <div className="relative shrink-0 h-full overflow-hidden" style={{ width: u(pairWidthMm) }}>
        <div
          className="absolute left-0 right-0 overflow-hidden"
          style={{ top: u(pair1TopMm), height: u(pair1HMm) }}
        >
          <ConfigPanel
            panel={resolved.pair}
            values={pairValues}
            panelWDots={PAIR_COL_W}
            panelHDots={PAIR_H}
            isBox={false}
            u={u}
            fs={fs}
            barcodeRef={pair1BarcodeRef}
            barcodeNarrow={1}
          />
        </div>
        {PRECISION_PRO_DEBUG_DIVIDERS && (
          <div
            className="absolute left-0 right-0 bg-black"
            style={{ top: u(pair2TopMm - 0.25), height: u(0.25) }}
          />
        )}
        <div
          className="absolute left-0 right-0 overflow-hidden"
          style={{ top: u(pair2TopMm), height: u(pair2HMm) }}
        >
          <ConfigPanel
            panel={resolved.pair}
            values={pairValues}
            panelWDots={PAIR_COL_W}
            panelHDots={PAIR_H}
            isBox={false}
            u={u}
            fs={fs}
            barcodeRef={pair2BarcodeRef}
            barcodeNarrow={1}
          />
        </div>
      </div>
    </div>
  );
}
