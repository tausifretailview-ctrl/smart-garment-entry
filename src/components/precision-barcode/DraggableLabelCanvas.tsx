import { useRef, useState, useCallback, useEffect } from "react";
import JsBarcode from "jsbarcode";
import { LabelDesignConfig, LabelFieldConfig, FieldKey, LabelItem } from "@/types/labelTypes";

interface DraggableLabelCanvasProps {
  item: LabelItem;
  width: number;  // mm
  height: number; // mm
  config: LabelDesignConfig;
  zoom: number;
  activeField: FieldKey | null;
  onFieldSelect: (key: FieldKey | null) => void;
  onFieldDrag: (key: FieldKey, x: number, y: number) => void;
}

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
    case "businessName": return "";
    default: return "";
  }
};

// 1mm ≈ 3.7795px at 96dpi
const MM_TO_PX = 3.7795;

export function DraggableLabelCanvas({
  item,
  width,
  height,
  config,
  zoom,
  activeField,
  onFieldSelect,
  onFieldDrag,
}: DraggableLabelCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{ key: FieldKey; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const barcodeHeight = config.barcodeHeight ?? 30;
  const barcodeLineWidth = config.barcodeWidth ?? 1.5;

  useEffect(() => {
    if (barcodeRef.current && item.barcode && config.barcode?.show) {
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
      } catch {}
    }
  }, [item.barcode, barcodeHeight, barcodeLineWidth, config.barcode?.show]);

  const pxWidth = width * MM_TO_PX;
  const pxHeight = height * MM_TO_PX;

  const handleMouseDown = useCallback((e: React.MouseEvent, key: FieldKey) => {
    e.stopPropagation();
    e.preventDefault();
    onFieldSelect(key);
    const field = config[key] as LabelFieldConfig;
    if (!field) return;
    setDragging({
      key,
      startX: e.clientX,
      startY: e.clientY,
      origX: field.x ?? 0,
      origY: field.y ?? 0,
    });
  }, [config, onFieldSelect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = (e.clientX - dragging.startX) / zoom / MM_TO_PX;
    const dy = (e.clientY - dragging.startY) / zoom / MM_TO_PX;
    const newX = Math.max(0, Math.min(width, dragging.origX + dx));
    const newY = Math.max(0, Math.min(height, dragging.origY + dy));
    onFieldDrag(dragging.key, newX, newY);
  }, [dragging, zoom, width, height, onFieldDrag]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const fieldKeys: FieldKey[] = (config.fieldOrder || []).filter(
    (k) => k !== "barcode" && config[k]?.show
  );
  const barcodeConfig = config.barcode;
  const showBarcode = barcodeConfig?.show && item.barcode;

  return (
    <div
      className="border rounded-lg overflow-auto bg-muted/20 p-4 flex items-center justify-center"
      style={{ minHeight: 160 }}
    >
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={() => !dragging && onFieldSelect(null)}
        style={{
          width: pxWidth * zoom,
          height: pxHeight * zoom,
          position: "relative",
          backgroundColor: "#ffffff",
          border: "1px dashed hsl(var(--border))",
          cursor: dragging ? "grabbing" : "default",
          flexShrink: 0,
        }}
      >
        {/* Grid lines for guidance */}
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          {/* 5mm grid */}
          {Array.from({ length: Math.floor(width / 5) }, (_, i) => (
            <line
              key={`vg${i}`}
              x1={(i + 1) * 5 * MM_TO_PX * zoom}
              y1={0}
              x2={(i + 1) * 5 * MM_TO_PX * zoom}
              y2={pxHeight * zoom}
              stroke="#e5e7eb"
              strokeWidth={0.5}
            />
          ))}
          {Array.from({ length: Math.floor(height / 5) }, (_, i) => (
            <line
              key={`hg${i}`}
              x1={0}
              y1={(i + 1) * 5 * MM_TO_PX * zoom}
              x2={pxWidth * zoom}
              y2={(i + 1) * 5 * MM_TO_PX * zoom}
              stroke="#e5e7eb"
              strokeWidth={0.5}
            />
          ))}
        </svg>

        {/* Text fields */}
        {fieldKeys.map((key) => {
          const field = config[key] as LabelFieldConfig;
          if (!field) return null;
          const content = getFieldContent(key, item, config.customTextValue);
          if (!content) return null;
          const isSelected = activeField === key;

          return (
            <div
              key={key}
              onMouseDown={(e) => handleMouseDown(e, key)}
              style={{
                position: "absolute",
                top: (field.y ?? 0) * MM_TO_PX * zoom,
                left: (field.x ?? 0) * MM_TO_PX * zoom,
                width: field.width ? field.width * MM_TO_PX * zoom : "auto",
                fontSize: field.fontSize * zoom,
                fontWeight: field.bold ? 700 : 400,
                textAlign: (field.textAlign as any) || "left",
                lineHeight: 1.15,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                cursor: "grab",
                outline: isSelected ? "2px solid hsl(var(--primary))" : "1px dashed transparent",
                outlineOffset: 1,
                borderRadius: 2,
                backgroundColor: isSelected ? "hsl(var(--primary) / 0.08)" : "transparent",
                transition: "outline 0.15s, background-color 0.15s",
                fontFamily: "Arial, Helvetica, sans-serif",
                color: "#000000",
                userSelect: "none",
              }}
              title={`${key}: drag to reposition`}
            >
              {content}
            </div>
          );
        })}

        {/* Barcode */}
        {showBarcode && (
          <div
            onMouseDown={(e) => handleMouseDown(e, "barcode")}
            style={{
              position: "absolute",
              top: (barcodeConfig.y ?? height * 0.35) * MM_TO_PX * zoom,
              left: (barcodeConfig.x ?? 1) * MM_TO_PX * zoom,
              width: barcodeConfig.width ? barcodeConfig.width * MM_TO_PX * zoom : "auto",
              display: "flex",
              justifyContent: "center",
              cursor: "grab",
              outline: activeField === "barcode" ? "2px solid hsl(var(--primary))" : "1px dashed transparent",
              outlineOffset: 1,
              borderRadius: 2,
              backgroundColor: activeField === "barcode" ? "hsl(var(--primary) / 0.08)" : "transparent",
              userSelect: "none",
            }}
            title="barcode: drag to reposition"
          >
            <svg
              ref={barcodeRef}
              style={{
                maxWidth: "100%",
                height: barcodeHeight * zoom * 0.35,
                imageRendering: "pixelated",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
