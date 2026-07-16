import { PrecisionLabelPreview } from "./PrecisionLabelPreview";
import { LabelDesignConfig, LabelItem } from "@/types/labelTypes";
import type { ProductFieldsConfig } from "@/utils/productFieldSettingsForLabels";

const MM_TO_PX = 3.7795275591;

export interface PrecisionLabelCellProps {
  item: LabelItem;
  width: number;
  height: number;
  xOffset?: number;
  yOffset?: number;
  config?: LabelDesignConfig;
  scaleFactor?: number;
  showBorder?: boolean;
  productFieldSettings?: ProductFieldsConfig | null;
}

/**
 * One physical label slot — offsets applied as padding (same as thermal print),
 * not CSS transform, so preview matches print / PDF.
 */
export function PrecisionLabelCell({
  item,
  width,
  height,
  xOffset = 0,
  yOffset = 0,
  config,
  scaleFactor,
  showBorder = false,
  productFieldSettings = null,
}: PrecisionLabelCellProps) {
  const innerWidth = Math.max(1, width - xOffset);
  const innerHeight = Math.max(1, height - yOffset);

  const outerStyle = scaleFactor
    ? {
        width: width * MM_TO_PX * scaleFactor,
        height: height * MM_TO_PX * scaleFactor,
        paddingTop: yOffset * MM_TO_PX * scaleFactor,
        paddingLeft: xOffset * MM_TO_PX * scaleFactor,
      }
    : {
        width: `${width}mm`,
        height: `${height}mm`,
        paddingTop: `${yOffset}mm`,
        paddingLeft: `${xOffset}mm`,
      };

  return (
    <div
      style={{
        ...outerStyle,
        boxSizing: "border-box",
        overflow: "hidden",
        flexShrink: 0,
        position: "relative",
        margin: 0,
      }}
    >
      <PrecisionLabelPreview
        item={item}
        width={innerWidth}
        height={innerHeight}
        xOffset={0}
        yOffset={0}
        showBorder={showBorder}
        config={config}
        scaleFactor={scaleFactor}
        productFieldSettings={productFieldSettings}
      />
    </div>
  );
}
