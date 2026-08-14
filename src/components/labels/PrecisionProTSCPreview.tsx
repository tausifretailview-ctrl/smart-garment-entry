import { useEffect, useRef, type RefObject } from "react";
import JsBarcode from "jsbarcode";
import type { LabelItem } from "@/types/labelTypes";
import {
  PRECISION_PRO_DEBUG_DIVIDERS,
  TRUNC,
  boxBarcodeNarrowBarWidth,
  dotsToMm,
  mmToDots,
} from "@/utils/labels/precisionProGeometry";
import {
  DEFAULT_FOOTWEAR_FORM_DESIGN,
  FOOTWEAR_FIELD_KEYS,
  footwearFormSizeMm,
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
    <div
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        color: "#000",
        lineHeight: 1.1,
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {FOOTWEAR_FIELD_KEYS.map((key) => {
        const layout = panel.fields[key];
        if (!layout?.show) return null;

        if (key === "barcode") {
          const hMm = dotsToMm(layout.barcodeHeight ?? (isBox ? 60 : 26));
          const wDots = layout.widthDots ?? Math.max(40, panelWDots - layout.x - 8);
          return (
            <div
              key={key}
              style={{
                position: "absolute",
                left: u(dotsToMm(layout.x)),
                top: u(dotsToMm(layout.y)),
                width: u(dotsToMm(Math.max(20, wDots))),
              }}
            >
              <svg
                ref={barcodeRef}
                style={{ display: "block", width: "100%", height: u(hMm) }}
              />
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
            style={{
              position: "absolute",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              left: u(dotsToMm(x)),
              top: u(dotsToMm(y)),
              maxWidth: u(
                dotsToMm(
                  Math.max(
                    12,
                    layout.widthDots ?? Math.max(24, panelWDots - x - 4),
                  ),
                ),
              ),
              fontSize: fs(pt),
              fontWeight: layout.mulX >= 2 || layout.font === "4" || layout.font === "5" ? 700 : 500,
              fontFamily: key === "barcodeText" ? "ui-monospace, monospace" : undefined,
            }}
          >
            {text}
          </div>
        );
      })}
      <span style={{ display: "none" }}>{panelHDots}</span>
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
  const boxNarrowCfg = resolved.box.fields.barcode.barcodeNarrow;
  const pairNarrowCfg = resolved.pair.fields.barcode.barcodeNarrow;
  const boxBarWidth = boxNarrowCfg && boxNarrowCfg > 0 ? boxNarrowCfg * 0.7 : boxNarrow === 2 ? 1.4 : 0.9;
  const pairBarWidth = pairNarrowCfg && pairNarrowCfg > 0 ? pairNarrowCfg * 0.7 : 0.9;

  useBarcode(boxBarcodeRef, barcode, (boxBarH / 2) * scaleFactor, boxBarWidth);
  useBarcode(pair1BarcodeRef, barcode, (pairBarH / 2) * scaleFactor, pairBarWidth);
  useBarcode(pair2BarcodeRef, barcode, (pairBarH / 2) * scaleFactor, pairBarWidth);

  const u = (mm: number) => `${mm * scaleFactor}mm`;
  const fs = (pt: number) => `${pt * scaleFactor * 0.35}mm`;

  const layout = resolved.layout;
  const form = footwearFormSizeMm(layout);
  const boxWidthMm = layout.boxWidthMm;
  const pairWidthMm = layout.pairWidthMm;
  const gapMm = 0;
  const spareMm = Math.max(0, form.heightMm - layout.pairHeightMm * 2);
  const pair1TopMm = spareMm / 2;
  const pair1HMm = layout.pairHeightMm;
  const pair2TopMm = pair1TopMm + layout.pairHeightMm;
  const pair2HMm = layout.pairHeightMm;
  const boxWDots = mmToDots(boxWidthMm);
  const boxHDots = mmToDots(layout.boxHeightMm);
  const pairWDots = mmToDots(pairWidthMm);
  const pairHDots = mmToDots(layout.pairHeightMm);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        background: "#fff",
        color: "#000",
        overflow: "hidden",
        boxSizing: "border-box",
        fontFamily: "Arial, Helvetica, sans-serif",
        width: u(form.widthMm),
        height: u(form.heightMm),
        border: showBorder ? "1px dashed hsl(var(--border))" : undefined,
      }}
    >
      <div
        style={{
          position: "relative",
          flex: "0 0 auto",
          height: "100%",
          overflow: "hidden",
          width: u(boxWidthMm),
        }}
      >
        <ConfigPanel
          panel={resolved.box}
          values={boxValues}
          panelWDots={boxWDots}
          panelHDots={boxHDots}
          isBox
          u={u}
          fs={fs}
          barcodeRef={boxBarcodeRef}
          barcodeNarrow={boxNarrow}
        />
      </div>

      {gapMm > 0 && (
        <div
          style={{
            flex: "0 0 auto",
            width: u(gapMm),
            height: "100%",
            background: PRECISION_PRO_DEBUG_DIVIDERS ? "#000" : undefined,
          }}
        />
      )}

      <div
        style={{
          position: "relative",
          flex: "0 0 auto",
          height: "100%",
          overflow: "hidden",
          width: u(pairWidthMm),
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            overflow: "hidden",
            top: u(pair1TopMm),
            height: u(pair1HMm),
          }}
        >
          <ConfigPanel
            panel={resolved.pair}
            values={pairValues}
            panelWDots={pairWDots}
            panelHDots={pairHDots}
            isBox={false}
            u={u}
            fs={fs}
            barcodeRef={pair1BarcodeRef}
            barcodeNarrow={1}
          />
        </div>
        {PRECISION_PRO_DEBUG_DIVIDERS && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              background: "#000",
              top: u(pair2TopMm - 0.25),
              height: u(0.25),
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            overflow: "hidden",
            top: u(pair2TopMm),
            height: u(pair2HMm),
          }}
        >
          <ConfigPanel
            panel={resolved.pair}
            values={pairValues}
            panelWDots={pairWDots}
            panelHDots={pairHDots}
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
