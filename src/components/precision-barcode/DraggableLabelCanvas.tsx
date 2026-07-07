import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { LabelDesignConfig, LabelFieldConfig, FieldKey, LabelItem } from "@/types/labelTypes";
import { getUOMLabel } from "@/constants/uom";
import { getCustomTextFields, usesCustomTextFields } from "@/utils/labelCustomText";
import type { ProductFieldsConfig } from "@/utils/productFieldSettingsForLabels";
import {
  filterLabelFieldKeys,
  isLabelFieldAllowedByProductSettings,
} from "@/utils/productFieldSettingsForLabels";
import { applyJsBarcodeToElement, BARCODE_MM_TO_PX, resolveBarcodeSlotMm } from "@/utils/barcodeLabelLayout";
import type { LabelData, TSPLTemplateConfig } from "@/utils/tsplGenerator";

interface DraggableLabelCanvasProps {
  item: LabelItem;
  width: number;  // mm
  height: number; // mm
  config: LabelDesignConfig;
  zoom: number;
  productFieldSettings?: ProductFieldsConfig | null;
  activeField: FieldKey | null;
  activeLineIndex: number | null;
  activeCustomTextIndex: number | null;
  onFieldSelect: (key: FieldKey | null) => void;
  onFieldDrag: (key: FieldKey, x: number, y: number) => void;
  onLineSelect: (index: number | null) => void;
  onLineDrag: (index: number, x: number, y: number) => void;
  onLineDelete?: (index: number) => void;
  onCustomTextSelect: (index: number | null) => void;
  onCustomTextDrag: (index: number, x: number, y: number) => void;
  onCustomTextDelete?: (index: number) => void;
}

const getFieldContent = (key: FieldKey, item: LabelItem, customTextValue?: string): string => {
  switch (key) {
    case "productName": return item.product_name || "";
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
  activeLineIndex,
  activeCustomTextIndex,
  onFieldSelect,
  onFieldDrag,
  onLineSelect,
  onLineDrag,
  onLineDelete,
  onCustomTextSelect,
  onCustomTextDrag,
  onCustomTextDelete,
  productFieldSettings = null,
}: DraggableLabelCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{
    type: "field" | "line" | "customText";
    key?: FieldKey;
    lineIndex?: number;
    customTextIndex?: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const barcodeLineWidth = config.barcodeWidth ?? 1.5;

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

  const barcodeSlot = useMemo(
    () => resolveBarcodeSlotMm({ width, height, gap: 2 }, config as unknown as TSPLTemplateConfig, labelData),
    [config, width, height, labelData],
  );

  useEffect(() => {
    if (barcodeRef.current && item.barcode && config.barcode?.show) {
      try {
        applyJsBarcodeToElement(
          barcodeRef.current,
          item.barcode,
          barcodeSlot.widthMm,
          barcodeSlot.heightMm,
          barcodeLineWidth,
        );
      } catch {}
    }
  }, [item.barcode, barcodeSlot, barcodeLineWidth, config.barcode?.show]);

  const pxWidth = width * MM_TO_PX;
  const pxHeight = height * MM_TO_PX;

  const handleFieldMouseDown = useCallback((e: React.MouseEvent, key: FieldKey) => {
    e.stopPropagation();
    e.preventDefault();
    onFieldSelect(key);
    onLineSelect(null);
    onCustomTextSelect(null);
    const field = config[key] as LabelFieldConfig;
    if (!field) return;
    setDragging({
      type: 'field',
      key,
      startX: e.clientX,
      startY: e.clientY,
      origX: field.x ?? 0,
      origY: field.y ?? 0,
    });
  }, [config, onFieldSelect, onLineSelect]);

  const handleLineMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    onLineSelect(index);
    onFieldSelect(null);
    onCustomTextSelect(null);
    const line = config.lines?.[index];
    if (!line) return;
    setDragging({
      type: 'line',
      lineIndex: index,
      startX: e.clientX,
      startY: e.clientY,
      origX: line.x ?? 0,
      origY: line.y ?? 0,
    });
  }, [config.lines, onLineSelect, onFieldSelect, onCustomTextSelect]);

  const handleCustomTextMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    onCustomTextSelect(index);
    onFieldSelect(null);
    onLineSelect(null);
    const slot = getCustomTextFields(config)[index];
    if (!slot) return;
    setDragging({
      type: "customText",
      customTextIndex: index,
      startX: e.clientX,
      startY: e.clientY,
      origX: slot.x ?? 0,
      origY: slot.y ?? 0,
    });
  }, [config, onCustomTextSelect, onFieldSelect, onLineSelect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = (e.clientX - dragging.startX) / zoom / MM_TO_PX;
    const dy = (e.clientY - dragging.startY) / zoom / MM_TO_PX;
    const newX = Math.max(0, Math.min(width, dragging.origX + dx));
    const newY = Math.max(0, Math.min(height, dragging.origY + dy));

    if (dragging.type === 'field' && dragging.key) {
      onFieldDrag(dragging.key, newX, newY);
    } else if (dragging.type === "line" && dragging.lineIndex !== undefined) {
      onLineDrag(dragging.lineIndex, newX, newY);
    } else if (dragging.type === "customText" && dragging.customTextIndex !== undefined) {
      onCustomTextDrag(dragging.customTextIndex, newX, newY);
    }
  }, [dragging, zoom, width, height, onFieldDrag, onLineDrag, onCustomTextDrag]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (activeLineIndex !== null && onLineDelete) {
        e.preventDefault();
        onLineDelete(activeLineIndex);
      }
      if (activeCustomTextIndex !== null && onCustomTextDelete) {
        e.preventDefault();
        onCustomTextDelete(activeCustomTextIndex);
      }
    }
  }, [activeLineIndex, activeCustomTextIndex, onLineDelete, onCustomTextDelete]);

  const customTextSlots = getCustomTextFields(config);
  const skipLegacyCustomText = usesCustomTextFields(config);

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
      className="border rounded-md overflow-auto bg-muted/20 p-2 flex items-center justify-center flex-1 min-h-[120px] max-h-full"
      style={{ minHeight: 120 }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={() => {
          if (!dragging) {
            onFieldSelect(null);
            onLineSelect(null);
            onCustomTextSelect(null);
          }
        }}
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
              onMouseDown={(e) => handleFieldMouseDown(e, key)}
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
                textDecoration: "none",
                userSelect: "none",
              }}
              title={`${key}: drag to reposition`}
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

        {/* Render lines/separators - now selectable & draggable */}
        {config.lines?.map((line, idx) => {
          if (!line.show) return null;
          const isHorizontal = line.orientation === 'horizontal';
          const isSelected = activeLineIndex === idx;
          return (
            <div
              key={`line-${idx}`}
              onMouseDown={(e) => handleLineMouseDown(e, idx)}
              style={{
                position: "absolute",
                top: (line.y ?? 0) * MM_TO_PX * zoom,
                left: (line.x ?? 0) * MM_TO_PX * zoom,
                width: isHorizontal ? (line.length ?? 10) * MM_TO_PX * zoom : Math.max((line.thickness ?? 0.3) * MM_TO_PX * zoom, 6),
                height: isHorizontal ? Math.max((line.thickness ?? 0.3) * MM_TO_PX * zoom, 6) : (line.length ?? 10) * MM_TO_PX * zoom,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "grab",
                outline: isSelected ? "2px solid hsl(var(--primary))" : "none",
                outlineOffset: 2,
                borderRadius: 1,
              }}
              title={`Line ${idx + 1}: drag to reposition (Delete key to remove)`}
            >
              <div style={{
                width: isHorizontal ? "100%" : (line.thickness ?? 0.3) * MM_TO_PX * zoom,
                height: isHorizontal ? (line.thickness ?? 0.3) * MM_TO_PX * zoom : "100%",
                backgroundColor: "#000000",
              }} />
            </div>
          );
        })}

        {customTextSlots.map((slot, idx) => {
          if (!slot.show) return null;
          const isSelected = activeCustomTextIndex === idx;
          const display = slot.value.trim() || `Custom ${idx + 1}`;

          return (
            <div
              key={slot.id}
              onMouseDown={(e) => handleCustomTextMouseDown(e, idx)}
              style={{
                position: "absolute",
                top: (slot.y ?? 0) * MM_TO_PX * zoom,
                left: (slot.x ?? 0) * MM_TO_PX * zoom,
                width: slot.width ? slot.width * MM_TO_PX * zoom : "auto",
                fontSize: slot.fontSize * zoom,
                fontWeight: slot.bold ? 700 : 400,
                textAlign: (slot.textAlign as "left" | "center" | "right") || "left",
                lineHeight: 1.15,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                cursor: "grab",
                outline: isSelected ? "2px solid hsl(var(--primary))" : "1px dashed transparent",
                outlineOffset: 1,
                borderRadius: 2,
                backgroundColor: isSelected ? "hsl(var(--primary) / 0.08)" : "transparent",
                fontFamily: "Arial, Helvetica, sans-serif",
                color: slot.value.trim() ? "#000000" : "hsl(var(--muted-foreground))",
                fontStyle: slot.value.trim() ? "normal" : "italic",
                userSelect: "none",
              }}
              title={`Custom text ${idx + 1}: drag to reposition`}
            >
              {display}
            </div>
          );
        })}

        {/* Barcode */}
        {showBarcode && (
          <div
            onMouseDown={(e) => handleFieldMouseDown(e, "barcode")}
            style={{
              position: "absolute",
              top: (barcodeConfig.y ?? height * 0.35) * MM_TO_PX * zoom,
              left: (barcodeConfig.x ?? 1) * MM_TO_PX * zoom,
              width: barcodeSlot.widthMm * MM_TO_PX * zoom,
              height: barcodeSlot.heightMm * MM_TO_PX * zoom,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              overflow: "hidden",
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
                height: barcodeSlot.heightMm * BARCODE_MM_TO_PX * zoom,
                width: "auto",
                maxWidth: barcodeSlot.widthMm * MM_TO_PX * zoom,
                flexShrink: 0,
                imageRendering: "pixelated",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
