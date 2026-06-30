import { useEffect, useRef, type RefObject } from "react";
import JsBarcode from "jsbarcode";
import type { LabelItem } from "@/types/labelTypes";
import {
  PRECISION_PRO_TSC_HEIGHT_MM,
  PRECISION_PRO_TSC_WIDTH_MM,
} from "@/utils/labels/precisionProTSPL";

/** 102×53mm @ 203 DPI — matches precisionProTSPL.ts (816×424 dots). */
const LABEL_W_DOTS = 816;
const LABEL_H_DOTS = 424;
const BOX_W_DOTS = 495;

export interface PrecisionProTSCPreviewProps {
  item: LabelItem;
  businessName: string;
  scaleFactor?: number;
  showBorder?: boolean;
}

const trunc = (s: string, max: number) => (s || "").slice(0, max);

function useBarcode(ref: RefObject<SVGSVGElement | null>, code: string, height: number, width: number) {
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
  const orgMax = isBox ? 20 : 12;
  const productMax = isBox ? 12 : 10;
  const styleMax = isBox ? 18 : 14;

  const org = trunc(fields.businessName, orgMax);
  const product = trunc(fields.productName, productMax);
  const style = trunc(fields.style, styleMax);
  const brand = trunc(fields.brand, isBox ? 10 : 8);
  const category = trunc(fields.category, isBox ? 8 : 6);
  const color = trunc(fields.color, isBox ? 10 : 8);

  if (isBox) {
    return (
      <div className="relative h-full w-full overflow-hidden font-sans text-black leading-tight">
        <div className="absolute left-[1.2%] font-medium truncate" style={{ top: u(1.2), fontSize: fs(11), maxWidth: "95%" }}>
          {org}
        </div>
        <div className="absolute left-[1.2%] right-[2%]" style={{ top: u(5.5) }}>
          <svg ref={barcodeRef} className="block w-full" style={{ height: u(7) }} />
        </div>
        <div className="absolute left-[1.2%] font-mono tabular-nums" style={{ top: u(14.5), fontSize: fs(8) }}>
          {fields.barcode}
        </div>
        <div className="absolute left-[1.2%]" style={{ top: u(17.5), fontSize: fs(8) }}>
          MRP: Rs.{fields.mrp}/-
        </div>
        <div className="absolute left-[1.2%] font-bold truncate" style={{ top: u(20.5), fontSize: fs(14), maxWidth: "90%" }}>
          {product}
        </div>
        <div className="absolute left-[1.2%] truncate" style={{ top: u(25.5), fontSize: fs(10), maxWidth: "85%" }}>
          {style}
        </div>
        <div className="absolute left-[1.2%] truncate" style={{ top: u(29.5), fontSize: fs(8), maxWidth: "45%" }}>
          {brand}
        </div>
        <div className="absolute truncate text-right" style={{ top: u(29.5), right: "8%", fontSize: fs(8), maxWidth: "35%" }}>
          {category}
        </div>
        <div className="absolute left-[1.2%] truncate" style={{ top: u(33), fontSize: fs(8), maxWidth: "50%" }}>
          {color}
        </div>
        <div className="absolute font-bold tabular-nums leading-none" style={{ right: "6%", bottom: u(5), fontSize: fs(22) }}>
          {fields.size}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden font-sans text-black leading-none">
      <div className="absolute left-[2%] truncate font-medium" style={{ top: u(0.8), fontSize: fs(6), maxWidth: "96%" }}>
        {org}
      </div>
      <div className="absolute left-[2%] right-[2%]" style={{ top: u(2.8) }}>
        <svg ref={barcodeRef} className="block w-full" style={{ height: u(3.2) }} />
      </div>
      <div className="absolute left-[2%] font-mono tabular-nums truncate" style={{ top: u(6.2), fontSize: fs(5), maxWidth: "96%" }}>
        {fields.barcode}
      </div>
      <div className="absolute left-[2%] truncate" style={{ top: u(7.4), fontSize: fs(5) }}>
        MRP: Rs.{fields.mrp}/-
      </div>
      <div className="absolute left-[2%] font-semibold truncate" style={{ top: u(8.8), fontSize: fs(7), maxWidth: "62%" }}>
        {product}
      </div>
      <div className="absolute right-[2%] font-bold tabular-nums" style={{ top: u(8.8), fontSize: fs(9) }}>
        {fields.size}
      </div>
      <div className="absolute left-[2%] truncate" style={{ top: u(10.8), fontSize: fs(5), maxWidth: "96%" }}>
        {style}
      </div>
      <div className="absolute left-[2%] truncate" style={{ top: u(12.2), fontSize: fs(5), maxWidth: "48%" }}>
        {brand}
      </div>
      <div className="absolute right-[2%] truncate text-right" style={{ top: u(12.2), fontSize: fs(5), maxWidth: "40%" }}>
        {category}
      </div>
      <div className="absolute left-[2%] truncate" style={{ top: u(13.6), fontSize: fs(5), maxWidth: "96%" }}>
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

  useBarcode(boxBarcodeRef, barcode, 28 * scaleFactor, 1.4);
  useBarcode(pair1BarcodeRef, barcode, 14 * scaleFactor, 0.9);
  useBarcode(pair2BarcodeRef, barcode, 14 * scaleFactor, 0.9);

  const u = (mm: number) => `${mm * scaleFactor}mm`;
  const fs = (pt: number) => `${pt * scaleFactor * 0.35}mm`;

  const boxWidthMm = (BOX_W_DOTS / LABEL_W_DOTS) * PRECISION_PRO_TSC_WIDTH_MM;
  const rightWidthMm = PRECISION_PRO_TSC_WIDTH_MM - boxWidthMm;
  const dividerMm = (2 / LABEL_W_DOTS) * PRECISION_PRO_TSC_WIDTH_MM;
  const hDividerMm = (2 / LABEL_H_DOTS) * PRECISION_PRO_TSC_HEIGHT_MM;

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
        <LabelPanel fields={fields} variant="box" u={u} fs={fs} barcodeRef={boxBarcodeRef} />
      </div>

      <div className="shrink-0 bg-black" style={{ width: u(dividerMm), height: "100%" }} />

      <div className="flex flex-col min-w-0 h-full" style={{ width: u(rightWidthMm - dividerMm) }}>
        <LabelPanel fields={fields} variant="pair" u={u} fs={fs} barcodeRef={pair1BarcodeRef} />
        <div className="shrink-0 bg-black" style={{ height: u(hDividerMm) }} />
        <LabelPanel fields={fields} variant="pair" u={u} fs={fs} barcodeRef={pair2BarcodeRef} />
      </div>
    </div>
  );
}
