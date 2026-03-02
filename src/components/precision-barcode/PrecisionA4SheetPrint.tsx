import { forwardRef } from "react";
import { PrecisionLabelPreview } from "./PrecisionLabelPreview";
import { PrecisionPrintCSS } from "./PrecisionPrintCSS";
import { LabelItem, LabelDesignConfig } from "@/types/labelTypes";

interface PrecisionA4SheetPrintProps {
  items: LabelItem[];
  labelWidth: number;
  labelHeight: number;
  cols: number;
  rows: number;
  xOffset: number;
  yOffset: number;
  vGap: number;
  config?: LabelDesignConfig;
}

export const PrecisionA4SheetPrint = forwardRef<HTMLDivElement, PrecisionA4SheetPrintProps>(
  ({ items, labelWidth, labelHeight, cols, rows, xOffset, yOffset, vGap, config }, ref) => {
    const expandedItems: LabelItem[] = [];
    items.forEach((item) => {
      const qty = item.qty || 1;
      for (let i = 0; i < qty; i++) {
        expandedItems.push(item);
      }
    });

    const labelsPerPage = cols * rows;
    const pages: LabelItem[][] = [];
    for (let i = 0; i < expandedItems.length; i += labelsPerPage) {
      pages.push(expandedItems.slice(i, i + labelsPerPage));
    }

    return (
      <>
        <PrecisionPrintCSS labelWidth={labelWidth} labelHeight={labelHeight} mode="a4" />
        <div ref={ref} className="precision-print-area">
          {pages.map((pageItems, pageIdx) => (
            <div
              key={pageIdx}
              style={{
                width: "210mm",
                height: "297mm",
                padding: `${yOffset}mm ${xOffset}mm`,
                boxSizing: "border-box",
                pageBreakAfter: pageIdx < pages.length - 1 ? "always" : "auto",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, ${labelWidth}mm)`,
                  rowGap: `${vGap}mm`,
                  columnGap: `${Math.max(0, (210 - xOffset * 2 - cols * labelWidth) / Math.max(1, cols - 1))}mm`,
                  justifyContent: "center",
                }}
              >
                {pageItems.map((item, idx) => (
                  <PrecisionLabelPreview
                    key={idx}
                    item={item}
                    width={labelWidth}
                    height={labelHeight}
                    showBorder
                    config={config}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }
);

PrecisionA4SheetPrint.displayName = "PrecisionA4SheetPrint";
