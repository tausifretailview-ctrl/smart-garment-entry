import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { LabelItem } from "@/types/labelTypes";

interface PrecisionLabelPreviewProps {
  item: LabelItem;
  width: number; // mm
  height: number; // mm
  xOffset?: number; // mm
  yOffset?: number; // mm
  showBorder?: boolean;
}

export function PrecisionLabelPreview({
  item,
  width,
  height,
  xOffset = 0,
  yOffset = 0,
  showBorder = false,
}: PrecisionLabelPreviewProps) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (barcodeRef.current && item.barcode) {
      try {
        JsBarcode(barcodeRef.current, item.barcode, {
          format: "CODE128",
          height: Math.max(15, height * 0.3 * 3.78), // ~30% of label height, convert mm to px approx
          width: 1.5,
          displayValue: false,
          margin: 0,
          background: "transparent",
          lineColor: "#000000",
        });
      } catch {
        // invalid barcode
      }
    }
  }, [item.barcode, height]);

  return (
    <div
      className="precision-label-container"
      style={{
        width: `${width}mm`,
        height: `${height}mm`,
        position: "relative",
        overflow: "hidden",
        transform: `translate(${xOffset}mm, ${yOffset}mm)`,
        border: showBorder ? "0.5px dashed #ccc" : "none",
        boxSizing: "border-box",
      }}
    >
      {/* Product Name - top */}
      <div
        style={{
          position: "absolute",
          top: "1mm",
          left: "1mm",
          right: "1mm",
          fontSize: `${Math.max(7, Math.min(10, width * 0.18))}pt`,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.1,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        {item.product_name}
      </div>

      {/* Size & Price row */}
      <div
        style={{
          position: "absolute",
          top: `${height * 0.2}mm`,
          left: "1mm",
          right: "1mm",
          display: "flex",
          justifyContent: "space-between",
          fontSize: `${Math.max(7, Math.min(9, width * 0.16))}pt`,
          fontWeight: 600,
        }}
      >
        <span>Size: {item.size}</span>
        <span>₹{item.sale_price}</span>
      </div>

      {/* Barcode SVG - center */}
      {item.barcode && (
        <div
          style={{
            position: "absolute",
            top: `${height * 0.35}mm`,
            left: "1mm",
            right: "1mm",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <svg
            ref={barcodeRef}
            className="precision-barcode-svg"
            style={{
              maxWidth: `${width - 2}mm`,
              imageRendering: "pixelated",
            }}
          />
        </div>
      )}

      {/* Barcode text - bottom */}
      <div
        style={{
          position: "absolute",
          bottom: "0.5mm",
          left: "1mm",
          right: "1mm",
          fontSize: `${Math.max(6, Math.min(8, width * 0.14))}pt`,
          textAlign: "center",
          letterSpacing: "0.5px",
        }}
      >
        {item.barcode}
      </div>
    </div>
  );
}
