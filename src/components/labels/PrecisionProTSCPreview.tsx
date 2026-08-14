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
  boxSizeOverflowSafe,
  dotsToMm,
} from "@/utils/labels/precisionProGeometry";

export interface PrecisionProTSCPreviewProps {
  item: LabelItem;
  businessName: string;
  scaleFactor?: number;
  showBorder?: boolean;
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

interface PanelFields {
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

function LabelPanel({
  fields,
  variant,
  u,
  fs,
  barcodeRef,
}: {
  fields: PanelFields;
  variant: "box" | "pair";
  u: (mm: number) => string;
  fs: (pt: number) => string;
  barcodeRef: RefObject<SVGSVGElement | null>;
}) {
  const isBox = variant === "box";
  const lim = isBox ? TRUNC.box : TRUNC.pair;

  const org = trunc(fields.businessName, lim.org);
  const product = trunc(fields.productName, lim.product);
  const style = trunc(fields.style, lim.style);
  const brand = trunc(fields.brand, lim.brand);
  const category = trunc(fields.category, lim.category);
  const color = trunc(fields.color, lim.color);
  const size = trunc(fields.size, lim.size);

  if (isBox) {
    const sizeLayout = boxSizeOverflowSafe(size);
    const sizeFs =
      sizeLayout.mulX >= 2 ? 22 : sizeLayout.font === "5" ? 16 : 12;
    return (
      <div className="relative h-full w-full overflow-hidden font-sans text-black leading-tight">
        <div
          className="absolute left-[1.2%] font-medium truncate"
          style={{ top: u(1.2), fontSize: fs(11), maxWidth: "95%" }}
        >
          {org}
        </div>
        <div className="absolute left-[1.2%] right-[2%]" style={{ top: u(5.5) }}>
          <svg ref={barcodeRef} className="block w-full" style={{ height: u(7) }} />
        </div>
        <div
          className="absolute left-[1.2%] font-mono tabular-nums"
          style={{ top: u(14.5), fontSize: fs(8) }}
        >
          {fields.barcode}
        </div>
        <div className="absolute left-[1.2%]" style={{ top: u(17.5), fontSize: fs(8) }}>
          MRP : Rs.{fields.mrp}/-
        </div>
        <div
          className="absolute left-[1.2%] font-bold truncate"
          style={{ top: u(20.5), fontSize: fs(14), maxWidth: "90%" }}
        >
          {product}
        </div>
        <div
          className="absolute left-[1.2%] truncate"
          style={{ top: u(25.5), fontSize: fs(10), maxWidth: "85%" }}
        >
          ART NO : {style}
        </div>
        <div
          className="absolute left-[1.2%] truncate"
          style={{ top: u(29.5), fontSize: fs(8), maxWidth: "45%" }}
        >
          {brand}
        </div>
        <div
          className="absolute truncate text-right"
          style={{ top: u(29.5), right: "8%", fontSize: fs(8), maxWidth: "35%" }}
        >
          {category}
        </div>
        <div
          className="absolute left-[1.2%] truncate"
          style={{ top: u(33), fontSize: fs(8), maxWidth: "70%" }}
        >
          COLOUR : {color}
        </div>
        <div
          className="absolute font-bold tabular-nums leading-none"
          style={{
            right: "6%",
            bottom: u(5),
            fontSize: fs(sizeFs),
            maxWidth: `${dotsToMm(BOX_W - sizeLayout.x)}mm`,
          }}
        >
          {sizeLayout.text}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden font-sans text-black leading-none">
      <div
        className="absolute left-[2%] truncate font-medium"
        style={{ top: u(0.8), fontSize: fs(6), maxWidth: "96%" }}
      >
        {org}
      </div>
      <div className="absolute left-[2%] right-[2%]" style={{ top: u(2.8) }}>
        <svg ref={barcodeRef} className="block w-full" style={{ height: u(3.2) }} />
      </div>
      <div
        className="absolute left-[2%] font-mono tabular-nums truncate"
        style={{ top: u(6.2), fontSize: fs(5), maxWidth: "96%" }}
      >
        {fields.barcode}
      </div>
      <div className="absolute left-[2%] truncate" style={{ top: u(7.4), fontSize: fs(5) }}>
        Rs.{fields.mrp}/-
      </div>
      <div
        className="absolute left-[2%] font-semibold truncate"
        style={{ top: u(8.8), fontSize: fs(7), maxWidth: "62%" }}
      >
        {product}
      </div>
      <div
        className="absolute right-[2%] font-bold tabular-nums"
        style={{ top: u(8.8), fontSize: fs(9) }}
      >
        {size}
      </div>
      <div
        className="absolute left-[2%] truncate"
        style={{ top: u(10.8), fontSize: fs(5), maxWidth: "96%" }}
      >
        {style}
      </div>
      <div
        className="absolute left-[2%] truncate"
        style={{ top: u(12.2), fontSize: fs(5), maxWidth: "48%" }}
      >
        {brand}
      </div>
      <div
        className="absolute right-[2%] truncate text-right"
        style={{ top: u(12.2), fontSize: fs(5), maxWidth: "40%" }}
      >
        {category}
      </div>
      <div
        className="absolute left-[2%] truncate"
        style={{ top: u(13.6), fontSize: fs(5), maxWidth: "96%" }}
      >
        {color}
      </div>
    </div>
  );
}

export function PrecisionProTSCPreview({
  item,
  businessName,
  scaleFactor = 1.5,
  showBorder = true,
}: PrecisionProTSCPreviewProps) {
  const boxBarcodeRef = useRef<SVGSVGElement>(null);
  const pair1BarcodeRef = useRef<SVGSVGElement>(null);
  const pair2BarcodeRef = useRef<SVGSVGElement>(null);

  const barcode = item.barcode || "";
  const mrp = item.mrp ?? item.sale_price ?? 0;
  const boxNarrow = boxBarcodeNarrowBarWidth(barcode);

  const fields: PanelFields = {
    businessName,
    barcode,
    mrp,
    productName: item.product_name,
    style: item.style,
    brand: item.brand,
    category: item.category,
    color: item.color,
    size: item.size,
  };

  useBarcode(boxBarcodeRef, barcode, 28 * scaleFactor, boxNarrow === 2 ? 1.4 : 0.9);
  useBarcode(pair1BarcodeRef, barcode, 14 * scaleFactor, 0.9);
  useBarcode(pair2BarcodeRef, barcode, 14 * scaleFactor, 0.9);

  const u = (mm: number) => `${mm * scaleFactor}mm`;
  const fs = (pt: number) => `${pt * scaleFactor * 0.35}mm`;

  const boxWidthMm = dotsToMm(BOX_W);
  const pairWidthMm = dotsToMm(PAIR_COL_W);
  const gapMm = Math.max(
    0,
    PRECISION_PRO_TSC_WIDTH_MM - boxWidthMm - pairWidthMm,
  );
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
      <div
        className="relative shrink-0 h-full overflow-hidden"
        style={{ width: u(boxWidthMm) }}
      >
        <LabelPanel fields={fields} variant="box" u={u} fs={fs} barcodeRef={boxBarcodeRef} />
      </div>

      {PRECISION_PRO_DEBUG_DIVIDERS && gapMm > 0 && (
        <div className="shrink-0 bg-black" style={{ width: u(gapMm), height: "100%" }} />
      )}
      {!PRECISION_PRO_DEBUG_DIVIDERS && gapMm > 0 && (
        <div className="shrink-0" style={{ width: u(gapMm), height: "100%" }} />
      )}

      <div
        className="relative shrink-0 h-full overflow-hidden"
        style={{ width: u(pairWidthMm) }}
      >
        <div
          className="absolute left-0 right-0 overflow-hidden"
          style={{ top: u(pair1TopMm), height: u(pair1HMm) }}
        >
          <LabelPanel
            fields={fields}
            variant="pair"
            u={u}
            fs={fs}
            barcodeRef={pair1BarcodeRef}
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
          <LabelPanel
            fields={fields}
            variant="pair"
            u={u}
            fs={fs}
            barcodeRef={pair2BarcodeRef}
          />
        </div>
      </div>
    </div>
  );
}
