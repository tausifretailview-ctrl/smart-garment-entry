import { useEffect, useMemo, useRef } from "react";
import JsBarcode from "jsbarcode";
import { LabelItem, LabelDesignConfig, FieldKey } from "@/types/labelTypes";
import { getUOMLabel } from "@/constants/uom";
import { getCustomTextFields, usesCustomTextFields } from "@/utils/labelCustomText";
import type { ProductFieldsConfig } from "@/utils/productFieldSettingsForLabels";
import {
  filterLabelFieldKeys,
  isLabelFieldAllowedByProductSettings,
} from "@/utils/productFieldSettingsForLabels";
import {
  computeLabelBarcodeLayout,
  type LabelData,
  type TSPLTemplateConfig,
} from "@/utils/tsplGenerator";

interface PrecisionLabelPreviewProps {
  item: LabelItem;
  width: number; // mm
  height: number; // mm
  xOffset?: number; // mm
  yOffset?: number; // mm
  showBorder?: boolean;
  config?: LabelDesignConfig;
  scaleFactor?: number; // multiplier for px-based preview (1mm = 3.7795px * scaleFactor)
  productFieldSettings?: ProductFieldsConfig | null;
}

// Map field keys to item data
const getFieldContent = (key: FieldKey, item: LabelItem, customTextValue?: string): string => {
  switch (key) {
    case "productName": return (item.product_name || "").toUpperCase();
    case "brand": return item.brand || "";
    case "category": return item.category || "";
    case "color": return item.color || "";
    case "style": return item.style || "";
    case "size": return item.size || "";
    case "price": return `Rs.${item.sale_price}`;
    case "qty": return item.qty ? `${item.qty} ${getUOMLabel(item.uom)}` : "";
    case "mrp": return item.mrp ? `MRP: ${item.mrp}` : "";
    case "barcodeText": return item.barcode || "";
    case "billNumber": return item.bill_number || "";
    case "supplierCode": return item.supplier_code || "";
    case "purchaseCode": return item.purchase_code || "";
    case "customText": return customTextValue || "";
    case "businessName": return item.businessName || "";
    case "supplierInvoiceNo": return item.supplier_invoice_no ? `Inv: ${item.supplier_invoice_no}` : "";
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
  productFieldSettings = null,
}: PrecisionLabelPreviewProps) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  const barcodeLineWidth = config?.barcodeWidth ?? 1.5;

  const labelData = useMemo((): LabelData => ({
    productName: item.product_name,
    brand: item.brand,
    category: item.category,
    style: item.style,
    color: item.color,
    size: item.size,
    mrp: item.mrp,
    salePrice: item.sale_price,
    barcode: item.barcode,
    billNumber: item.bill_number,
    purchaseCode: item.purchase_code,
    supplierCode: item.supplier_code,
    supplierInvoiceNo: item.supplier_invoice_no,
    businessName: item.businessName,
  }), [item]);

  const barcodeLayout = useMemo(() => {
    if (!config) return null;
    const hasAbsolutePos = (config.fieldOrder || []).some((fieldKey) => {
      const field = config[fieldKey as FieldKey];
      return field && (field.x !== undefined || field.y !== undefined);
    });
    const isCompactLabel = width <= 40 && height <= 25;
    const applyCompactAdjustments = isCompactLabel && !hasAbsolutePos;
    return computeLabelBarcodeLayout(
      { width, height, gap: 2 },
      config as unknown as TSPLTemplateConfig,
      labelData,
      {
        dpi: 203,
        hasAbsolutePos,
        applyCompactAdjustments,
        compactBottomPaddingDots: applyCompactAdjustments ? Math.round(0.8 * (203 / 25.4)) : Math.round(0.5 * (203 / 25.4)),
      },
    );
  }, [config, width, height, labelData]);

  const barcodeHeightMm = barcodeLayout?.barcodeHeightMm
    ?? ((config?.barcodeHeight ?? Math.max(15, height * 0.3 * 3.78)) * 0.35) / 3.7795;

  useEffect(() => {
    if (barcodeRef.current && item.barcode) {
      try {
        JsBarcode(barcodeRef.current, item.barcode, {
          format: "CODE128",
          height: barcodeHeightMm * 3.7795,
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
  }, [item.barcode, barcodeHeightMm, barcodeLineWidth]);

  // Unit helper: when scaleFactor is set, use px-based sizing instead of CSS mm
  const u = (mm: number) => scaleFactor ? `${mm * 3.7795 * scaleFactor}px` : `${mm}mm`;

  // Font size helper: ensures WYSIWYG between preview and print
  // In preview: fontSize * scaleFactor px, where 1mm = 3.7795 * scaleFactor px
  // In print: convert fontSize to mm using the same ratio so proportions match exactly
  const fs = (fontSize: number) => scaleFactor ? `${fontSize * scaleFactor}px` : `${fontSize / 3.7795}mm`;

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
        transform: xOffset || yOffset ? `translate(${u(xOffset)}, ${u(yOffset)})` : undefined,
        border: showBorder ? "0.5px dashed #ccc" : "none",
          boxSizing: "border-box",
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          color: "#000000",
          WebkitFontSmoothing: "none",
        }}
      >
        <div style={{ position: "absolute", top: u(1), left: u(1), right: u(1), fontSize: fs(Math.max(8, Math.min(12, width * 0.22))), fontWeight: 900, textAlign: "center", lineHeight: 1.2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", letterSpacing: "0.2px" }}>
          {item.product_name?.toUpperCase()}
        </div>
        <div style={{ position: "absolute", top: u(height * 0.2), left: u(1), right: u(1), display: "flex", justifyContent: "space-between", fontSize: fs(Math.max(8, Math.min(11, width * 0.2))), fontWeight: 800 }}>
          <span>{item.size}</span>
          <span>Rs.{item.sale_price}</span>
        </div>
        {item.barcode && (
          <div style={{ position: "absolute", top: u(height * 0.35), left: u(1), right: u(1), display: "flex", justifyContent: "center" }}>
            <svg ref={barcodeRef} className="precision-barcode-svg" style={{ maxWidth: u(width - 2), imageRendering: "pixelated" }} />
          </div>
        )}
        <div style={{ position: "absolute", bottom: u(0.5), left: u(1), right: u(1), fontSize: fs(Math.max(7, Math.min(9, width * 0.16))), textAlign: "center", letterSpacing: "0.5px", fontWeight: 700 }}>
          {item.barcode}
        </div>
      </div>
    );
  }

  const customTextSlots = getCustomTextFields(config);
  const skipLegacyCustomText = usesCustomTextFields(config);

  // Config-driven rendering
  const fieldKeys: FieldKey[] = filterLabelFieldKeys(
    (config.fieldOrder || []).filter(
      (k) => k !== "barcode" && config[k]?.show && !(k === "customText" && skipLegacyCustomText),
    ),
    productFieldSettings,
  );

  const barcodeConfig = config.barcode;
  const showBarcode =
    barcodeConfig?.show &&
    item.barcode &&
    isLabelFieldAllowedByProductSettings("barcode", productFieldSettings);

  return (
    <div
      className="precision-label-container"
      style={{
        width: u(width),
        height: u(height),
        position: "relative",
        overflow: "hidden",
        transform: xOffset || yOffset ? `translate(${u(xOffset)}, ${u(yOffset)})` : undefined,
        border: showBorder ? "0.5px dashed #ccc" : "none",
        boxSizing: "border-box",
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
        WebkitFontSmoothing: "none",
        color: "#000000",
      }}
    >
      {/* Render text fields */}
      {fieldKeys.map((key) => {
        const field = config[key];
        if (!field) return null;
        const content = getFieldContent(key, item, config.customTextValue);
        if (!content) return null;

        // Use field-level fontFamily if set, else default
        const fieldFont = field.fontFamily || '"Helvetica Neue", Helvetica, Arial, sans-serif';
        const fieldX = field.x ?? 0;
        const maxFieldW = Math.max(0.5, width - fieldX);
        const fieldW = field.width ? Math.min(field.width, maxFieldW) : maxFieldW;
        const derivedYMm = barcodeLayout?.derivedFieldYDots[key] != null
          ? barcodeLayout.derivedFieldYDots[key]! / (203 / 25.4)
          : undefined;

        return (
          <div
            key={key}
            style={{
              position: "absolute",
              top: u(derivedYMm ?? field.y ?? 0),
              left: u(field.x ?? 0),
              width: u(fieldW),
              fontSize: fs(field.fontSize),
              fontWeight: field.bold ? 900 : 600,
              fontFamily: fieldFont,
              textAlign: (field.textAlign as any) || "left",
              lineHeight: field.lineHeight ?? 1.2,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              color: "#000000",
              letterSpacing: "0.2px",
              textDecoration: "none",
              WebkitTextStroke: field.bold ? "0.3px #000" : "none",
            }}
          >
            {content}
            {field.strikethrough && (
               <span style={{
                 position: "absolute",
                 left: `${(100 - (field.strikethroughWidth ?? 100)) / 2}%`,
                 width: `${field.strikethroughWidth ?? 100}%`,
                 top: `calc(50% + ${field.strikethroughOffsetY ?? 0}%)`,
                 height: `${field.strikethroughThickness ?? 1}px`,
                 backgroundColor: "#000",
                 transform: "translateY(-50%)",
                pointerEvents: "none",
              }} />
            )}
          </div>
        );
      })}

      {customTextSlots.map((slot) => {
        if (!slot.show || !slot.value.trim()) return null;
        const fieldX = slot.x ?? 0;
        const maxFieldW = Math.max(0.5, width - fieldX);
        const fieldW = slot.width ? Math.min(slot.width, maxFieldW) : maxFieldW;

        return (
          <div
            key={slot.id}
            style={{
              position: "absolute",
              top: u(slot.y ?? 0),
              left: u(slot.x ?? 0),
              width: u(fieldW),
              fontSize: fs(slot.fontSize),
              fontWeight: slot.bold ? 900 : 600,
              textAlign: (slot.textAlign as "left" | "center" | "right") || "left",
              lineHeight: 1.2,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              color: "#000000",
              letterSpacing: "0.2px",
            }}
          >
            {slot.value}
            {slot.strikethrough && (
              <span
                style={{
                  position: "absolute",
                  left: `${(100 - (slot.strikethroughWidth ?? 100)) / 2}%`,
                  width: `${slot.strikethroughWidth ?? 100}%`,
                  top: `calc(50% + ${slot.strikethroughOffsetY ?? 0}%)`,
                  height: `${slot.strikethroughThickness ?? 1}px`,
                  backgroundColor: "#000",
                  transform: "translateY(-50%)",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
        );
      })}

      {/* Barcode SVG */}
      {showBarcode && (
        <div
          style={{
            position: "absolute",
            top: u(barcodeConfig.y ?? height * 0.35),
            left: u(barcodeConfig.x ?? 0),
            width: barcodeConfig.width ? u(barcodeConfig.width) : "auto",
            display: "flex",
            alignItems: "flex-start",
            overflow: "hidden",
            marginTop: u(1),
          }}
        >
          <svg
            ref={barcodeRef}
            className="precision-barcode-svg"
            style={{
              maxWidth: barcodeConfig.width ? u(barcodeConfig.width) : u(width - 2),
              height: u(barcodeHeightMm),
              imageRendering: "pixelated",
            }}
          />
        </div>
      )}

      {/* Render lines */}
      {config.lines?.map((line, idx) => {
        if (!line.show) return null;
        const isHorizontal = line.orientation === 'horizontal';
        return (
          <div
            key={`line-${idx}`}
            style={{
              position: "absolute",
              top: u(line.y ?? 0),
              left: u(line.x ?? 0),
              width: isHorizontal ? u(line.length ?? 10) : u(line.thickness ?? 0.3),
              height: isHorizontal ? u(line.thickness ?? 0.3) : u(line.length ?? 10),
              backgroundColor: "#000000",
            }}
          />
        );
      })}
    </div>
  );
}
