import { forwardRef } from "react";
import { PrecisionLabelPreview } from "./PrecisionLabelPreview";
import { PrecisionPrintCSS } from "./PrecisionPrintCSS";
import { LabelItem, LabelDesignConfig } from "@/types/labelTypes";
import { computeA4SheetMargins, A4_PAGE_WIDTH_MM, A4_PAGE_HEIGHT_MM } from "@/utils/a4SheetLayout";

interface PrecisionA4SheetPrintProps {
  items: LabelItem[];
  labelWidth: number;
  labelHeight: number;
  cols: number;
  rows: number;
  /** Nudge from auto-centered position (mm). Positive X = right, positive Y = down. */
  xOffset: number;
  yOffset: number;
  /** Row gap between labels on the sheet (mm). */
  vGap: number;
  /** Column gap between labels (mm). Default 0 for die-cut A4 sheets. */
  columnGap?: number;
  config?: LabelDesignConfig;
  /** 1-based slot on the first page to begin printing (default 1). */
  startPosition?: number;
}

export const PrecisionA4SheetPrint = forwardRef<HTMLDivElement, PrecisionA4SheetPrintProps>(
  (
    {
      items,
      labelWidth,
      labelHeight,
      cols,
      rows,
      xOffset,
      yOffset,
      vGap,
      columnGap = 0,
      config,
      startPosition = 1,
    },
    ref,
  ) => {
    const labelsPerPage = cols * rows;
    const skipSlots = Math.min(labelsPerPage, Math.max(0, Math.floor((startPosition || 1) - 1)));
    const expandedItems: (LabelItem | null)[] = [];
    for (let s = 0; s < skipSlots; s++) expandedItems.push(null);
    items.forEach((item) => {
      const qty = item.qty && item.qty > 0 ? item.qty : 0;
      for (let i = 0; i < qty; i++) {
        expandedItems.push(item);
      }
    });

    const pages: (LabelItem | null)[][] = [];
    for (let i = 0; i < expandedItems.length; i += labelsPerPage) {
      pages.push(expandedItems.slice(i, i + labelsPerPage));
    }

    const rowGap = Math.max(0, vGap);
    const colGap = Math.max(0, columnGap);
    const { marginTop, marginLeft, marginRight, marginBottom } = computeA4SheetMargins(
      cols,
      rows,
      labelWidth,
      labelHeight,
      colGap,
      { top: yOffset, left: xOffset },
    );

    return (
      <>
        <PrecisionPrintCSS labelWidth={labelWidth} labelHeight={labelHeight} mode="a4" />
        <div ref={ref} className="precision-print-area">
          {pages.map((pageItems, pageIdx) => (
            <div
              key={pageIdx}
              style={{
                width: `${A4_PAGE_WIDTH_MM}mm`,
                height: `${A4_PAGE_HEIGHT_MM}mm`,
                boxSizing: "border-box",
                pageBreakAfter: pageIdx < pages.length - 1 ? "always" : "auto",
                padding: `${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm`,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, ${labelWidth}mm)`,
                  gridTemplateRows: `repeat(${rows}, ${labelHeight}mm)`,
                  columnGap: `${colGap}mm`,
                  rowGap: `${rowGap}mm`,
                  width: `${cols * labelWidth + Math.max(0, cols - 1) * colGap}mm`,
                }}
              >
                {pageItems.map((item, idx) =>
                  item ? (
                    <PrecisionLabelPreview
                      key={idx}
                      item={item}
                      width={labelWidth}
                      height={labelHeight}
                      showBorder
                      config={config}
                    />
                  ) : (
                    <div
                      key={idx}
                      style={{ width: `${labelWidth}mm`, height: `${labelHeight}mm` }}
                    />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  },
);

PrecisionA4SheetPrint.displayName = "PrecisionA4SheetPrint";
