import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { LabelItem, LabelDesignConfig, FieldKey } from "@/types/labelTypes";

interface PrecisionLabelPreviewProps {
  item: LabelItem;
  width: number; // mm
  height: number; // mm
  xOffset?: number; // mm
  yOffset?: number; // mm
  showBorder?: boolean;
  config?: LabelDesignConfig;
  scaleFactor?: number; // multiplier for px-based preview (1mm = 3.7795px * scaleFactor)
}

// Map field keys to item data
const getFieldContent = (key: FieldKey, item: LabelItem, customTextValue?: string): string => {
  switch (key) {
    case "productName": return item.product_name || "";
    case "brand": return item.brand || "";
    case "category": return item.category || "";
    case "color": return item.color || "";
    case "style": return item.style || "";
    case "size": return `Size: ${item.size || ""}`;
    case "price": return `₹${item.sale_price}`;
    case "mrp": return item.mrp ? `MRP: ₹${item.mrp}` : "";
    case "barcodeText": return item.barcode || "";
    case "billNumber": return item.bill_number || "";
    case "supplierCode": return item.supplier_code || "";
    case "purchaseCode": return item.purchase_code || "";
    case "customText": return customTextValue || "";
    case "businessName": return ""; // filled from settings externally
    default: return "";
  }
};

export function PrecisionLabelPreview({
  item,
  width,
  height,
  xOffset = 0,
  yOffset = 0,
  showBorder = false,
  config,
  scaleFactor,
}: PrecisionLabelPreviewProps) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  const barcodeHeight = config?.barcodeHeight ?? Math.max(15, height * 0.3 * 3.78);
  const barcodeLineWidth = config?.barcodeWidth ?? 1.5;

  useEffect(() => {
    if (barcodeRef.current && item.barcode) {
      try {
        JsBarcode(barcodeRef.current, item.barcode, {
          format: "CODE128",
          height: barcodeHeight,
          width: barcodeLineWidth,
          displayValue: false,
          margin: 0,
          background: "transparent",
          lineColor: "#000000",
        });
      } catch {
        // invalid barcode
      }
    }
  }, [item.barcode, barcodeHeight, barcodeLineWidth]);

  // Unit helper: when scaleFactor is set, use px-based sizing instead of CSS mm
  const u = (mm: number) => scaleFactor ? `${mm * 3.7795 * scaleFactor}px` : `${mm}mm`;

  // If no config provided, render legacy hardcoded layout
  if (!config) {
    return (
      <div
        className="precision-label-container"
        style={{
          width: u(width),
          height: u(height),
          position: "relative",
          overflow: "hidden",
          transform: `translate(${u(xOffset)}, ${u(yOffset)})`,
          border: showBorder ? "0.5px dashed #ccc" : "none",
          boxSizing: "border-box",
        }}
      >
        <div style={{ position: "absolute", top: u(1), left: u(1), right: u(1), fontSize: scaleFactor ? `${Math.max(7, Math.min(10, width * 0.18)) * scaleFactor}px` : `${Math.max(7, Math.min(10, width * 0.18))}pt`, fontWeight: 700, textAlign: "center", lineHeight: 1.1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {item.product_name}
        </div>
        <div style={{ position: "absolute", top: u(height * 0.2), left: u(1), right: u(1), display: "flex", justifyContent: "space-between", fontSize: scaleFactor ? `${Math.max(7, Math.min(9, width * 0.16)) * scaleFactor}px` : `${Math.max(7, Math.min(9, width * 0.16))}pt`, fontWeight: 600 }}>
          <span>Size: {item.size}</span>
          <span>₹{item.sale_price}</span>
        </div>
        {item.barcode && (
          <div style={{ position: "absolute", top: u(height * 0.35), left: u(1), right: u(1), display: "flex", justifyContent: "center" }}>
            <svg ref={barcodeRef} className="precision-barcode-svg" style={{ maxWidth: u(width - 2), imageRendering: "pixelated" }} />
          </div>
        )}
        <div style={{ position: "absolute", bottom: u(0.5), left: u(1), right: u(1), fontSize: scaleFactor ? `${Math.max(6, Math.min(8, width * 0.14)) * scaleFactor}px` : `${Math.max(6, Math.min(8, width * 0.14))}pt`, textAlign: "center", letterSpacing: "0.5px" }}>
          {item.barcode}
        </div>
      </div>
    );
  }

  // Config-driven rendering
  const fieldKeys: FieldKey[] = (config.fieldOrder || []).filter(
    (k) => k !== "barcode" && config[k]?.show
  );

  const barcodeConfig = config.barcode;
  const showBarcode = barcodeConfig?.show && item.barcode;

  return (
    <div
      className="precision-label-container"
      style={{
        width: u(width),
        height: u(height),
        position: "relative",
        overflow: "hidden",
        transform: `translate(${u(xOffset)}, ${u(yOffset)})`,
        border: showBorder ? "0.5px dashed #ccc" : "none",
        boxSizing: "border-box",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {/* Render text fields */}
      {fieldKeys.map((key) => {
        const field = config[key];
        if (!field) return null;
        const content = getFieldContent(key, item, config.customTextValue);
        if (!content) return null;

        return (
          <div
            key={key}
            style={{
              position: "absolute",
              top: u(field.y ?? 0),
              left: u(field.x ?? 0),
              width: field.width ? u(field.width) : "auto",
              fontSize: scaleFactor ? `${field.fontSize * scaleFactor}px` : `${field.fontSize}pt`,
              fontWeight: field.bold ? 700 : 400,
              textAlign: (field.textAlign as any) || "left",
              lineHeight: 1.15,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {content}
          </div>
        );
      })}

      {/* Barcode SVG */}
      {showBarcode && (
        <div
          style={{
            position: "absolute",
            top: u(barcodeConfig.y ?? height * 0.35),
            left: u(barcodeConfig.x ?? 1),
            width: barcodeConfig.width ? u(barcodeConfig.width) : "auto",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <svg
            ref={barcodeRef}
            className="precision-barcode-svg"
            style={{
              maxWidth: barcodeConfig.width ? u(barcodeConfig.width) : u(width - 2),
              imageRendering: "pixelated",
            }}
          />
        </div>
      )}
    </div>
  );
}
