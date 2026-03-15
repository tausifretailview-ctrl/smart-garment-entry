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
}

export const PrecisionThermalPrint = forwardRef<HTMLDivElement, PrecisionThermalPrintProps>(
  ({ items, labelWidth, labelHeight, xOffset, yOffset, vGap = 0, config }, ref) => {
    const expandedItems: LabelItem[] = [];
    items.forEach((item) => {
      const qty = item.qty || 1;
      for (let i = 0; i < qty; i++) {
        expandedItems.push(item);
      }
    });

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
                overflow: "visible",
                position: "relative",
                paddingTop: yOffset ? `${yOffset}mm` : undefined,
                paddingLeft: xOffset ? `${xOffset}mm` : undefined,
                boxSizing: "border-box",
              }}
            >
              <PrecisionLabelPreview
                item={item}
                width={labelWidth}
                height={labelHeight}
                xOffset={0}
                yOffset={0}
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
