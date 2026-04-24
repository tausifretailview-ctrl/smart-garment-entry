import { forwardRef } from "react";
import { PrecisionLabelPreview } from "./PrecisionLabelPreview";
import { PrecisionPrintCSS } from "./PrecisionPrintCSS";
import { LabelItem, LabelDesignConfig } from "@/types/labelTypes";

interface PrecisionThermalPrintProps {
  items: LabelItem[];
  labelWidth: number;
  labelHeight: number;
  xOffset: number;
  yOffset: number;
  vGap?: number;
  config?: LabelDesignConfig;
  thermalCols?: number;
  horizontalGap?: number;
}

export const PrecisionThermalPrint = forwardRef<HTMLDivElement, PrecisionThermalPrintProps>(
  ({ items, labelWidth, labelHeight, xOffset, yOffset, vGap = 0, config, thermalCols = 1, horizontalGap = 0 }, ref) => {
    const expandedItems: LabelItem[] = [];
    items.forEach((item) => {
      const qty = item.qty && item.qty > 0 ? item.qty : 0;
      for (let i = 0; i < qty; i++) {
        expandedItems.push(item);
      }
    });

    const cols = Math.max(1, thermalCols);
    const pageWidth = (labelWidth * cols) + (horizontalGap * Math.max(0, cols - 1));

    // For multi-column, group items into rows
    if (cols > 1) {
      const rows: LabelItem[][] = [];
      for (let i = 0; i < expandedItems.length; i += cols) {
        rows.push(expandedItems.slice(i, i + cols));
      }

      return (
        <>
          <PrecisionPrintCSS labelWidth={pageWidth} labelHeight={labelHeight + vGap} mode="thermal" />
          <div ref={ref} className="precision-print-area">
            {rows.map((row, rowIdx) => (
              <div
                key={rowIdx}
                style={{
                  width: `${pageWidth}mm`,
                  height: `${labelHeight + vGap}mm`,
                  padding: 0,
                  margin: 0,
                  boxSizing: "border-box",
                  overflow: "hidden",
                  display: "flex",
                  gap: `${horizontalGap}mm`,
                  position: "relative",
                  pageBreakAfter: "always",
                  breakAfter: "page",
                  pageBreakInside: "avoid",
                  breakInside: "avoid",
                }}
              >
                {row.map((item, colIdx) => (
                  <div key={colIdx} style={{ width: `${labelWidth}mm`, height: `${labelHeight}mm`, flexShrink: 0, overflow: 'clip', position: 'relative', padding: 0, margin: 0, boxSizing: 'border-box' }}>
                    <PrecisionLabelPreview
                      item={item}
                      width={labelWidth}
                      height={labelHeight}
                      xOffset={xOffset}
                      yOffset={yOffset}
                      config={config}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      );
    }

    // Single column (original behavior)
    return (
      <>
        <PrecisionPrintCSS labelWidth={labelWidth} labelHeight={labelHeight + vGap} mode="thermal" />
        <div ref={ref} className="precision-print-area">
          {expandedItems.map((item, idx) => (
            <div
              key={idx}
              style={{
                width: `${labelWidth}mm`,
                height: `${labelHeight + vGap}mm`,
                padding: 0,
                margin: 0,
                boxSizing: "border-box",
                overflow: "hidden",
                display: "block",
                position: "relative",
                pageBreakAfter: "always",
                breakAfter: "page",
                pageBreakInside: "avoid",
                breakInside: "avoid",
              }}
            >
              <PrecisionLabelPreview
                item={item}
                width={labelWidth}
                height={labelHeight}
                xOffset={xOffset}
                yOffset={yOffset}
                config={config}
              />
            </div>
          ))}
        </div>
      </>
    );
  }
);

PrecisionThermalPrint.displayName = "PrecisionThermalPrint";
