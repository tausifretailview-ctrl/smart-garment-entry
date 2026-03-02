import { forwardRef } from "react";
import { PrecisionLabelPreview } from "./PrecisionLabelPreview";
import { PrecisionPrintCSS } from "./PrecisionPrintCSS";
import { LabelItem } from "@/types/labelTypes";

interface PrecisionThermalPrintProps {
  items: LabelItem[];
  labelWidth: number;
  labelHeight: number;
  xOffset: number;
  yOffset: number;
}

export const PrecisionThermalPrint = forwardRef<HTMLDivElement, PrecisionThermalPrintProps>(
  ({ items, labelWidth, labelHeight, xOffset, yOffset }, ref) => {
    // Expand items by qty
    const expandedItems: LabelItem[] = [];
    items.forEach((item) => {
      const qty = item.qty || 1;
      for (let i = 0; i < qty; i++) {
        expandedItems.push(item);
      }
    });

    return (
      <>
        <PrecisionPrintCSS labelWidth={labelWidth} labelHeight={labelHeight} mode="thermal" />
        <div ref={ref} className="precision-print-area">
          {expandedItems.map((item, idx) => (
            <div
              key={idx}
              style={{
                width: `${labelWidth}mm`,
                height: `${labelHeight}mm`,
                pageBreakAfter: idx < expandedItems.length - 1 ? "always" : "auto",
              }}
            >
              <PrecisionLabelPreview
                item={item}
                width={labelWidth}
                height={labelHeight}
                xOffset={xOffset}
                yOffset={yOffset}
              />
            </div>
          ))}
        </div>
      </>
    );
  }
);

PrecisionThermalPrint.displayName = "PrecisionThermalPrint";
