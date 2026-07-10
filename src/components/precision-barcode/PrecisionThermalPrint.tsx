import { forwardRef } from "react";
import { PrecisionLabelCell } from "./PrecisionLabelCell";
import { PrecisionPrintCSS } from "./PrecisionPrintCSS";
import { LabelItem, LabelDesignConfig } from "@/types/labelTypes";
import type { ProductFieldsConfig } from "@/utils/productFieldSettingsForLabels";

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
  /** Gate the global `<style>` injection so it only happens during an active print job. */
  active?: boolean;
  productFieldSettings?: ProductFieldsConfig | null;
}

export const PrecisionThermalPrint = forwardRef<HTMLDivElement, PrecisionThermalPrintProps>(
  ({ items, labelWidth, labelHeight, xOffset, yOffset, vGap = 0, config, thermalCols = 1, horizontalGap = 0, active = false, productFieldSettings = null }, ref) => {
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
          <PrecisionPrintCSS labelWidth={pageWidth} labelHeight={labelHeight} mode="thermal" thermalCols={cols} active={active} />
          <div ref={ref} className="precision-print-area">
            {rows.map((row, rowIdx) => (
              <div
                key={rowIdx}
                className="precision-thermal-page precision-thermal-page-2up"
                style={{
                  width: `${pageWidth}mm`,
                  height: `${labelHeight}mm`,
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
                  <PrecisionLabelCell
                    key={colIdx}
                    item={item}
                    width={labelWidth}
                    height={labelHeight}
                    xOffset={xOffset}
                    yOffset={yOffset}
                    config={config}
                    productFieldSettings={productFieldSettings}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      );
    }

    // Single column: each @page is exactly labelWidth × labelHeight (physical sticker size).
    // vGap is roll spacing only — do not inflate page height (causes first-label drift vs driver).
    return (
      <>
        <PrecisionPrintCSS labelWidth={labelWidth} labelHeight={labelHeight} mode="thermal" active={active} />
        <div ref={ref} className="precision-print-area">
          {expandedItems.map((item, idx) => (
            <div
              key={idx}
              className="precision-thermal-page"
              style={{
                width: `${labelWidth}mm`,
                height: `${labelHeight}mm`,
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
              <PrecisionLabelCell
                item={item}
                width={labelWidth}
                height={labelHeight}
                xOffset={xOffset}
                yOffset={yOffset}
                config={config}
                productFieldSettings={productFieldSettings}
              />
            </div>
          ))}
        </div>
      </>
    );
  }
);

PrecisionThermalPrint.displayName = "PrecisionThermalPrint";
