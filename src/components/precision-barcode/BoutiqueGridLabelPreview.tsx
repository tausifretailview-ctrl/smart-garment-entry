import { useEffect, useRef } from "react";
import type { LabelItem, LabelDesignConfig } from "@/types/labelTypes";
import {
  applyJsBarcodeToElement,
  legacyBarcodeHeightMm,
} from "@/utils/barcodeLabelLayout";
import type { ProductFieldsConfig } from "@/utils/productFieldSettingsForLabels";
import { isLabelFieldAllowedByProductSettings } from "@/utils/productFieldSettingsForLabels";

/** Condensed thermal / BarTender-like stack — used only by Boutique Grid. */
const BOUTIQUE_FONT =
  '"Lucida Console", "Courier New", Consolas, "Liberation Mono", monospace';

type GridRowKey =
  | "productName"
  | "style"
  | "brand"
  | "category"
  | "color"
  | "size"
  | "mrp"
  | "price";

const GRID_ROWS: { key: GridRowKey; label: string; mrpSuffix?: boolean }[] = [
  { key: "productName", label: "ITEM" },
  { key: "style", label: "D.NO" },
  { key: "brand", label: "BRAND" },
  { key: "category", label: "CATEGORY" },
  { key: "color", label: "COLOUR" },
  { key: "size", label: "SIZE" },
  { key: "mrp", label: "MRP", mrpSuffix: true },
  { key: "price", label: "RATE" },
];

function rowValue(key: GridRowKey, item: LabelItem): string {
  switch (key) {
    case "productName":
      return (item.product_name || "").toUpperCase();
    case "style":
      return (item.style || "").toUpperCase();
    case "brand":
      return (item.brand || "").toUpperCase();
    case "category":
      return (item.category || "").toUpperCase();
    case "color":
      return (item.color || "").toUpperCase();
    case "size":
      return (item.size || "").toUpperCase();
    case "mrp":
      return item.mrp != null && item.mrp > 0 ? String(item.mrp) : "";
    case "price":
      return item.sale_price != null ? String(item.sale_price) : "";
    default:
      return "";
  }
}

export interface BoutiqueGridLabelPreviewProps {
  item: LabelItem;
  width: number;
  height: number;
  showBorder?: boolean;
  config: LabelDesignConfig;
  scaleFactor?: number;
  productFieldSettings?: ProductFieldsConfig | null;
}

/**
 * Isolated STYLE BOUTIQUE / BarTender-style KEY : VALUE grid.
 * Not used unless labelStyle === "boutique-grid".
 */
export function BoutiqueGridLabelPreview({
  item,
  width,
  height,
  showBorder = false,
  config,
  scaleFactor,
  productFieldSettings = null,
}: BoutiqueGridLabelPreviewProps) {
  const barcodeRef = useRef<SVGSVGElement>(null);

  const u = (mm: number) =>
    scaleFactor ? `${mm * 3.7795 * scaleFactor}px` : `${mm}mm`;
  const fs = (fontSize: number) =>
    scaleFactor ? `${fontSize * scaleFactor}px` : `${fontSize / 3.7795}mm`;

  const padRight = Math.max(3.5, width * 0.1);
  const contentWidth = Math.max(8, width - padRight - 1.5);

  const showShop =
    config.businessName?.show !== false &&
    Boolean(item.businessName?.trim()) &&
    isLabelFieldAllowedByProductSettings("businessName", productFieldSettings);

  const visibleRows = GRID_ROWS.filter(({ key }) => {
    const field = config[key];
    if (!field?.show) return false;
    if (!isLabelFieldAllowedByProductSettings(key, productFieldSettings)) return false;
    return Boolean(rowValue(key, item));
  });

  const showBarcode =
    config.barcode?.show !== false &&
    Boolean(item.barcode) &&
    isLabelFieldAllowedByProductSettings("barcode", productFieldSettings);

  const showBarcodeText =
    config.barcodeText?.show !== false &&
    Boolean(item.barcode) &&
    isLabelFieldAllowedByProductSettings("barcodeText", productFieldSettings);

  const sideCode =
    config.purchaseCode?.show &&
    item.purchase_code?.trim() &&
    isLabelFieldAllowedByProductSettings("purchaseCode", productFieldSettings)
      ? item.purchase_code.trim().toUpperCase()
      : "";

  const headerFs = Math.max(9, Math.min(13, width * 0.22));
  const rowFs = Math.max(7, Math.min(9, width * 0.16));
  const mrpFs = Math.max(10, Math.min(14, width * 0.24));
  const barcodeTextFs = Math.max(7, Math.min(9, width * 0.15));

  const headerH = showShop ? height * 0.12 : height * 0.02;
  const gridTop = headerH + height * 0.02;
  const gridRowH = Math.min(height * 0.07, 2.8);
  const gridH = visibleRows.length * gridRowH;
  const barcodeTop = Math.min(gridTop + gridH + height * 0.02, height * 0.52);
  const barcodeH = legacyBarcodeHeightMm(config.barcodeHeight, height);
  const barcodeW = Math.max(8, contentWidth - 1);

  useEffect(() => {
    if (!barcodeRef.current || !item.barcode || !showBarcode) return;
    try {
      applyJsBarcodeToElement(
        barcodeRef.current,
        item.barcode,
        barcodeW,
        barcodeH,
        config.barcodeWidth ?? 2,
      );
    } catch {
      /* invalid barcode */
    }
  }, [item.barcode, barcodeH, barcodeW, config.barcodeWidth, showBarcode]);

  return (
    <div
      className="precision-label-container boutique-grid-label"
      style={{
        width: u(width),
        height: u(height),
        position: "relative",
        overflow: "hidden",
        border: showBorder ? "0.5px dashed #ccc" : "none",
        boxSizing: "border-box",
        fontFamily: BOUTIQUE_FONT,
        color: "#000000",
        WebkitFontSmoothing: "none",
        background: "#fff",
      }}
    >
      {showShop && (
        <div
          style={{
            position: "absolute",
            top: u(0.4),
            left: u(1),
            width: u(contentWidth),
            fontSize: fs(headerFs),
            fontWeight: 900,
            textAlign: "center",
            textTransform: "uppercase",
            letterSpacing: "0.02em",
            lineHeight: 1.1,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            WebkitTextStroke: "0.35px #000",
          }}
        >
          {item.businessName!.toUpperCase()}
        </div>
      )}

      <div
        style={{
          position: "absolute",
          top: u(gridTop),
          left: u(1.2),
          width: u(contentWidth),
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {visibleRows.map(({ key, label, mrpSuffix }) => {
          const value = rowValue(key, item);
          const isMrp = key === "mrp";
          return (
            <div
              key={key}
              style={{
                display: "grid",
                gridTemplateColumns: "7.5ch 1.2ch 1fr",
                alignItems: "baseline",
                height: u(gridRowH),
                fontSize: fs(isMrp ? mrpFs : rowFs),
                fontWeight: isMrp ? 900 : 700,
                lineHeight: 1.05,
                textTransform: "uppercase",
                letterSpacing: "0.01em",
                WebkitTextStroke: isMrp ? "0.35px #000" : "0.2px #000",
              }}
            >
              <span style={{ overflow: "hidden", whiteSpace: "nowrap" }}>{label}</span>
              <span>:</span>
              <span
                style={{
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  paddingLeft: "0.15em",
                }}
              >
                {mrpSuffix ? `${value} /_` : value}
              </span>
            </div>
          );
        })}
      </div>

      {showBarcode && (
        <div
          style={{
            position: "absolute",
            top: u(barcodeTop),
            left: u(1.5),
            width: u(barcodeW),
            height: u(barcodeH),
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            overflow: "hidden",
          }}
        >
          <svg
            ref={barcodeRef}
            className="precision-barcode-svg"
            style={{
              height: u(barcodeH),
              width: "auto",
              maxWidth: u(barcodeW),
              flexShrink: 0,
              imageRendering: "pixelated",
            }}
          />
        </div>
      )}

      {showBarcodeText && (
        <div
          style={{
            position: "absolute",
            top: u(barcodeTop + barcodeH + 0.3),
            left: u(1),
            width: u(contentWidth),
            fontSize: fs(barcodeTextFs),
            fontWeight: 700,
            textAlign: "center",
            letterSpacing: "0.06em",
            fontFamily: BOUTIQUE_FONT,
          }}
        >
          {item.barcode}
        </div>
      )}

      {sideCode && (
        <div
          style={{
            position: "absolute",
            right: u(0.3),
            top: "50%",
            transform: "translateY(-50%) rotate(90deg)",
            transformOrigin: "center center",
            fontSize: fs(Math.max(6, Math.min(8, width * 0.12))),
            fontWeight: 700,
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            fontFamily: BOUTIQUE_FONT,
          }}
        >
          {sideCode}
        </div>
      )}
    </div>
  );
}
