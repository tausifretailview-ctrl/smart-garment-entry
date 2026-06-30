import { useEffect, useRef, type RefObject } from "react";
import JsBarcode from "jsbarcode";
import type { LabelItem } from "@/types/labelTypes";

/** 102×50mm @ 203 DPI — matches precisionProTSPL.ts dot layout (816×400). */
const LABEL_W_DOTS = 816;
const LABEL_H_DOTS = 400;
const BOX_W_DOTS = 495;

export interface PrecisionProTSCPreviewProps {
  item: LabelItem;
  businessName: string;
  /** Screen scale multiplier (default 1.5). */
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

function PairLabelPanel({
  item,
  u,
  fs,
  barcodeRef,
}: {
  item: LabelItem;
  u: (mm: number) => string;
  fs: (pt: number) => string;
  barcodeRef: RefObject<SVGSVGElement | null>;
}) {
  const productTrunc = trunc(item.product_name, 12);
  const brandTrunc = trunc(item.brand, 10);
  const colorTrunc = trunc(item.color, 10);

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden font-sans text-black leading-tight">
      <div className="absolute left-[3%] top-[2%] right-[3%]">
        <svg ref={barcodeRef} className="block w-full max-h-full" style={{ height: u(4.5) }} />
      </div>
      <div
        className="absolute left-[3%] right-[3%] font-mono tabular-nums"
        style={{ top: u(5.8), fontSize: fs(6) }}
      >
        {item.barcode}
      </div>
      <div
        className="absolute left-[3%] right-[3%] flex justify-between items-baseline gap-1"
        style={{ top: u(8.5), fontSize: fs(8) }}
      >
        <span className="font-semibold truncate">{productTrunc}</span>
        <span className="font-bold tabular-nums shrink-0">{item.size}</span>
      </div>
      <div className="absolute left-[3%] truncate" style={{ top: u(11.5), fontSize: fs(7) }}>
        {brandTrunc}
      </div>
      <div className="absolute left-[3%] truncate" style={{ top: u(14), fontSize: fs(7) }}>
        {colorTrunc}
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

  useBarcode(boxBarcodeRef, barcode, 28 * scaleFactor, 1.4);
  useBarcode(pair1BarcodeRef, barcode, 18 * scaleFactor, 1.1);
  useBarcode(pair2BarcodeRef, barcode, 18 * scaleFactor, 1.1);

  const u = (mm: number) => `${mm * scaleFactor}mm`;
  const fs = (pt: number) => `${pt * scaleFactor * 0.35}mm`;

  const orgTrunc = trunc(businessName, 20);
  const productTrunc = trunc(item.product_name, 12);
  const styleTrunc = trunc(item.style, 18);
  const brandTrunc = trunc(item.brand, 10);
  const colorTrunc = trunc(item.color, 10);
  const categoryTrunc = trunc(item.category, 8);

  const boxWidthMm = (BOX_W_DOTS / LABEL_W_DOTS) * 102;
  const rightWidthMm = 102 - boxWidthMm;
  const dividerMm = (2 / LABEL_W_DOTS) * 102;

  return (
    <div
      className="relative flex bg-white text-black font-sans overflow-hidden box-border"
      style={{
        width: u(102),
        height: u(50),
        border: showBorder ? "1px dashed hsl(var(--border))" : undefined,
      }}
    >
      {/* Box label (left) */}
      <div className="relative shrink-0 h-full overflow-hidden" style={{ width: u(boxWidthMm) }}>
        <div
          className="absolute left-[1.2%] font-medium truncate"
          style={{ top: u(1.2), fontSize: fs(11), maxWidth: "95%" }}
        >
          {orgTrunc}
        </div>

        <div className="absolute left-[1.2%] right-[2%]" style={{ top: u(5.5) }}>
          <svg ref={boxBarcodeRef} className="block w-full" style={{ height: u(7) }} />
        </div>

        <div
          className="absolute left-[1.2%] font-mono tabular-nums"
          style={{ top: u(14), fontSize: fs(8) }}
        >
          {barcode}
        </div>
        <div
          className="absolute left-[1.2%]"
          style={{ top: u(17), fontSize: fs(8) }}
        >
          MRP: Rs.{mrp}/-
        </div>

        <div
          className="absolute left-[1.2%] font-bold truncate"
          style={{ top: u(20), fontSize: fs(14), maxWidth: "90%" }}
        >
          {productTrunc}
        </div>

        <div
          className="absolute left-[1.2%] truncate"
          style={{ top: u(25), fontSize: fs(10), maxWidth: "85%" }}
        >
          {styleTrunc}
        </div>

        <div
          className="absolute left-[1.2%] truncate"
          style={{ top: u(29), fontSize: fs(8), maxWidth: "45%" }}
        >
          {brandTrunc}
        </div>
        <div
          className="absolute truncate text-right"
          style={{ top: u(29), right: "8%", fontSize: fs(8), maxWidth: "35%" }}
        >
          {categoryTrunc}
        </div>

        <div
          className="absolute left-[1.2%] truncate"
          style={{ top: u(32.5), fontSize: fs(8), maxWidth: "50%" }}
        >
          {colorTrunc}
        </div>

        <div
          className="absolute font-bold tabular-nums leading-none"
          style={{ right: "6%", bottom: u(6), fontSize: fs(22) }}
        >
          {item.size}
        </div>
      </div>

      {/* Vertical divider */}
      <div className="shrink-0 bg-black" style={{ width: u(dividerMm), height: "100%" }} />

      {/* Pair labels (right, stacked) */}
      <div className="flex flex-col min-w-0 h-full" style={{ width: u(rightWidthMm - dividerMm) }}>
        <PairLabelPanel item={item} u={u} fs={fs} barcodeRef={pair1BarcodeRef} />
        <div className="shrink-0 bg-black" style={{ height: u((2 / LABEL_H_DOTS) * 50) }} />
        <PairLabelPanel item={item} u={u} fs={fs} barcodeRef={pair2BarcodeRef} />
      </div>
    </div>
  );
}
