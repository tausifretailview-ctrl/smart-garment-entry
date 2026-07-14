import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { LabelDesignConfig, LabelFieldConfig, FieldKey, LabelItem } from "@/types/labelTypes";
import { getCustomTextFields, usesCustomTextFields } from "@/utils/labelCustomText";
import type { ProductFieldsConfig } from "@/utils/productFieldSettingsForLabels";
import {
  filterLabelFieldKeys,
  isLabelFieldAllowedByProductSettings,
} from "@/utils/productFieldSettingsForLabels";
import { applyJsBarcodeToElement, BARCODE_MM_TO_PX, labelFieldAllowsMultiline, legacyBarcodeHeightMm, resolveBarcodeSlotMm } from "@/utils/barcodeLabelLayout";
import type { LabelData, TSPLTemplateConfig } from "@/utils/tsplGenerator";
import {
  collectEnabledDesignerFieldKeys,
  getLabelDesignerFieldDisplay,
  resolveLabelDesignerFieldLabel,
} from "@/utils/labelDesignerPlaceholders";

interface DraggableLabelCanvasProps {
  item: LabelItem;
  width: number;  // mm
  height: number; // mm
  config: LabelDesignConfig;
  zoom: number;
  productFieldSettings?: ProductFieldsConfig | null;
  /** Human-readable field names for designer-only placeholders */
  fieldLabels?: Partial<Record<FieldKey, string>>;
  defaultUom?: string;
  /**
   * When false (multi-up row), keep natural label width instead of flex-filling
   * a squeezed cell that clips the left edge via overflow+centering.
   */
  fillAvailable?: boolean;
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
  fieldLabels,
  defaultUom = "NOS",
  fillAvailable = true,
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
  const barcodeConfig = config.barcode;

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
    () => resolveBarcodeSlotMm({ width, height }, config as unknown as TSPLTemplateConfig, labelData),
    [config, width, height, labelData],
  );

  const designerBarcodeHeightMm =
    barcodeSlot.layout?.barcodeHeightMm ?? legacyBarcodeHeightMm(config.barcodeHeight, height);
  const designerBarcodeWidthMm = barcodeSlot.widthMm;

  useEffect(() => {
    if (barcodeRef.current && item.barcode && barcodeConfig?.show) {
      try {
        applyJsBarcodeToElement(
          barcodeRef.current,
          item.barcode,
          designerBarcodeWidthMm,
          designerBarcodeHeightMm,
          barcodeLineWidth,
        );
      } catch {}
    }
  }, [item.barcode, designerBarcodeWidthMm, designerBarcodeHeightMm, barcodeLineWidth, barcodeConfig?.show]);

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
    let maxY = height;
    if (dragging.type === "field" && dragging.key === "barcode") {
      maxY = Math.max(0, height - designerBarcodeHeightMm);
    }
    const newY = Math.max(0, Math.min(maxY, dragging.origY + dy));

    if (dragging.type === 'field' && dragging.key) {
      onFieldDrag(dragging.key, newX, newY);
    } else if (dragging.type === "line" && dragging.lineIndex !== undefined) {
      onLineDrag(dragging.lineIndex, newX, newY);
    } else if (dragging.type === "customText" && dragging.customTextIndex !== undefined) {
      onCustomTextDrag(dragging.customTextIndex, newX, newY);
    }
  }, [dragging, zoom, width, height, designerBarcodeHeightMm, onFieldDrag, onLineDrag, onCustomTextDrag]);

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
    collectEnabledDesignerFieldKeys(config, {
      excludeBarcode: true,
      skipLegacyCustomText,
    }),
    productFieldSettings,
  );
  const barcodeFieldEnabled =
    barcodeConfig?.show &&
    isLabelFieldAllowedByProductSettings("barcode", productFieldSettings);
  const showBarcode = barcodeFieldEnabled && !!item.barcode;
  const showBarcodePlaceholder = barcodeFieldEnabled && !item.barcode;

  // Avoid flex + justify-center + overflow-auto on the same box: when the zoomed
  // label is wider than the cell, that combo clips the left edge and makes it
  // unreachable via scroll (classic CSS overflow centering bug).
  // `safe center` falls back to start alignment when content overflows.
  return (
    <div
      className={
        fillAvailable
          ? "border rounded-md overflow-auto bg-muted/20 p-2 flex flex-1 min-h-[120px] max-h-full min-w-0"
          : "border rounded-md overflow-visible bg-muted/20 p-2 shrink-0"
      }
      style={
        fillAvailable
          ? { minHeight: 120, justifyContent: "safe center", alignItems: "safe center" }
          : { minHeight: 120 }
      }
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
          const { text: displayText, isPlaceholder } = getLabelDesignerFieldDisplay(key, item, {
            customTextValue: config.customTextValue,
            fieldLabels,
            defaultUom,
          });
          const isSelected = activeField === key;
          const fieldX = field.x ?? 0;
          const maxFieldW = Math.max(0.5, width - fieldX);
          const fieldW = field.width ? Math.min(field.width, maxFieldW) : maxFieldW;

          return (
            <div
              key={key}
              onMouseDown={(e) => handleFieldMouseDown(e, key)}
              style={{
                position: "absolute",
                top: (field.y ?? 0) * MM_TO_PX * zoom,
                left: (field.x ?? 0) * MM_TO_PX * zoom,
                width: fieldW * MM_TO_PX * zoom,
                fontSize: field.fontSize * zoom,
                fontWeight: field.bold ? 700 : 400,
                textAlign: (field.textAlign as any) || "left",
                lineHeight: field.lineHeight ?? 1.2,
                overflow: "hidden",
                whiteSpace: labelFieldAllowsMultiline(field) ? "normal" : "nowrap",
                wordBreak: labelFieldAllowsMultiline(field) ? "break-word" : undefined,
                textOverflow: labelFieldAllowsMultiline(field) ? undefined : "ellipsis",
                cursor: "grab",
                outline: isSelected ? "2px solid hsl(var(--primary))" : "1px dashed transparent",
                outlineOffset: 1,
                borderRadius: 2,
                backgroundColor: isSelected ? "hsl(var(--primary) / 0.08)" : "transparent",
                transition: "outline 0.15s, background-color 0.15s",
                fontFamily: "Arial, Helvetica, sans-serif",
                color: isPlaceholder ? "hsl(var(--muted-foreground))" : "#000000",
                fontStyle: isPlaceholder ? "italic" : "normal",
                textDecoration: "none",
                userSelect: "none",
              }}
              title={`${resolveLabelDesignerFieldLabel(key, fieldLabels, defaultUom)}: drag to reposition`}
            >
              {displayText}
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
        {(showBarcode || showBarcodePlaceholder) && (
          <div
            onMouseDown={(e) => handleFieldMouseDown(e, "barcode")}
            style={{
              position: "absolute",
              top: (barcodeConfig.y ?? 0) * MM_TO_PX * zoom,
              left: (barcodeConfig.x ?? 1) * MM_TO_PX * zoom,
              width: designerBarcodeWidthMm * MM_TO_PX * zoom,
              height: designerBarcodeHeightMm * MM_TO_PX * zoom,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              overflow: "hidden",
              cursor: "grab",
              outline: activeField === "barcode" ? "2px solid hsl(var(--primary))" : "1px dashed hsl(var(--border))",
              outlineOffset: 1,
              borderRadius: 2,
              backgroundColor: activeField === "barcode" ? "hsl(var(--primary) / 0.08)" : "hsl(var(--muted) / 0.25)",
              userSelect: "none",
            }}
            title={`${resolveLabelDesignerFieldLabel("barcode", fieldLabels, defaultUom)}: drag to reposition`}
          >
            {showBarcode ? (
              <svg
                ref={barcodeRef}
                style={{
                  height: designerBarcodeHeightMm * BARCODE_MM_TO_PX * zoom,
                  width: "auto",
                  maxWidth: designerBarcodeWidthMm * MM_TO_PX * zoom,
                  flexShrink: 0,
                  imageRendering: "pixelated",
                }}
              />
            ) : (
              <span
                style={{
                  fontSize: Math.max(8, 7 * zoom),
                  color: "hsl(var(--muted-foreground))",
                  fontStyle: "italic",
                  fontFamily: "Arial, Helvetica, sans-serif",
                }}
              >
                {resolveLabelDesignerFieldLabel("barcode", fieldLabels, defaultUom)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
