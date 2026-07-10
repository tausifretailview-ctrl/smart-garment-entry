import { PrecisionLabelCell } from "./PrecisionLabelCell";
import { LabelDesignConfig, LabelItem } from "@/types/labelTypes";
import type { ProductFieldsConfig } from "@/utils/productFieldSettingsForLabels";

const MM_TO_PX = 3.7795275591;

export interface PrecisionThermalRowPreviewProps {
  items: LabelItem[];
  labelWidth: number;
  labelHeight: number;
  xOffset?: number;
  yOffset?: number;
  horizontalGap?: number;
  thermalCols?: number;
  config?: LabelDesignConfig;
  scaleFactor?: number;
  showBorder?: boolean;
  productFieldSettings?: ProductFieldsConfig | null;
}

/**
 * Screen preview row matching {@link PrecisionThermalPrint} flex layout (2-up gap + offsets).
 */
export function PrecisionThermalRowPreview({
  items,
  labelWidth,
  labelHeight,
  xOffset = 0,
  yOffset = 0,
  horizontalGap = 0,
  thermalCols = 1,
  config,
  scaleFactor,
  showBorder = false,
  productFieldSettings = null,
}: PrecisionThermalRowPreviewProps) {
  const cols = Math.max(1, thermalCols);
  const pageWidth = labelWidth * cols + horizontalGap * Math.max(0, cols - 1);

  const rowStyle = scaleFactor
    ? {
        width: pageWidth * MM_TO_PX * scaleFactor,
        height: labelHeight * MM_TO_PX * scaleFactor,
        gap: horizontalGap * MM_TO_PX * scaleFactor,
      }
    : {
        width: `${pageWidth}mm`,
        height: `${labelHeight}mm`,
        gap: `${horizontalGap}mm`,
      };

  return (
    <div
      className="precision-thermal-row-preview"
      style={{
        ...rowStyle,
        display: "flex",
        flexWrap: "nowrap",
        alignItems: "stretch",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {items.slice(0, cols).map((item, idx) => (
        <PrecisionLabelCell
          key={idx}
          item={item}
          width={labelWidth}
          height={labelHeight}
          xOffset={xOffset}
          yOffset={yOffset}
          config={config}
          scaleFactor={scaleFactor}
          showBorder={showBorder}
          productFieldSettings={productFieldSettings}
        />
      ))}
    </div>
  );
}
