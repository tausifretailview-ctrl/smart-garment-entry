import { forwardRef } from "react";
import { PrecisionLabelPreview } from "./PrecisionLabelPreview";
import { PrecisionPrintCSS } from "./PrecisionPrintCSS";
import { LabelItem, LabelDesignConfig } from "@/types/labelTypes";
import type { ProductFieldsConfig } from "@/utils/productFieldSettingsForLabels";
import {
  computeA4SheetMargins,
  resolveA4LayoutGap,
  resolveA4LabelWidthMm,
  resolveA4PitchMm,
  a4LabelCellOriginMm,
  novaJetBrandFromSheetType,
  A4_PAGE_WIDTH_MM,
  A4_PAGE_HEIGHT_MM,
  type NovaJetSheetBrand,
} from "@/utils/a4SheetLayout";

interface PrecisionA4SheetPrintProps {
  items: LabelItem[];
  labelWidth: number;
  labelHeight: number;
  cols: number;
  rows: number;
  /** Nudge from manufacturer/centered origin (mm). Positive X = right, positive Y = down. */
  xOffset: number;
  yOffset: number;
  /** Legacy row gap — only used to derive pitch when pitchY is omitted. */
  vGap: number;
  /** Legacy column gap — only used to derive pitch when pitchX is omitted. */
  columnGap?: number;
  /**
   * Independent column pitch (mm). Default = labelWidth (+ gap).
   * MPL 40L starts at 39.0 — raise in 0.1mm steps if column 5 drifts left.
   */
  pitchX?: number | null;
  /**
   * Independent row pitch (mm). Default = labelHeight (+ gap).
   * MPL 40L starts at 35.0 — raise in 0.1mm steps if lower rows drift up.
   */
  pitchY?: number | null;
  config?: LabelDesignConfig;
  /** 1-based slot on the first page to begin printing (default 1). */
  startPosition?: number;
  /** Gate the global `<style>` injection so it only happens during an active print job. */
  active?: boolean;
  productFieldSettings?: ProductFieldsConfig | null;
  /** BarcodePrinting sheetType — gates NovaJet manufacturer overrides. */
  sheetType?: string | null;
  /** Explicit brand when sheetType is unavailable. */
  novaJetBrand?: NovaJetSheetBrand | null;
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
      pitchX: pitchXProp = null,
      pitchY: pitchYProp = null,
      config,
      startPosition = 1,
      active = false,
      productFieldSettings = null,
      sheetType = null,
      novaJetBrand: novaJetBrandOpt = undefined,
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

    const novaJetBrand =
      novaJetBrandOpt !== undefined ? novaJetBrandOpt : novaJetBrandFromSheetType(sheetType);

    // Prefer sheet column gap; fall back to vGap when only one is set.
    // NovaJet MPL 48L/40L → gap 0 / 39mm width only when sheetType is that brand.
    const requestedGap = Math.max(0, columnGap || vGap || 0);
    const layoutGap = resolveA4LayoutGap(
      cols,
      rows,
      labelWidth,
      labelHeight,
      requestedGap,
      novaJetBrand,
    );
    const layoutWidth = resolveA4LabelWidthMm(
      cols,
      rows,
      labelWidth,
      labelHeight,
      requestedGap,
      novaJetBrand,
    );
    const { pitchXMm, pitchYMm } = resolveA4PitchMm({
      labelWidthMm: layoutWidth,
      labelHeightMm: labelHeight,
      gapMm: layoutGap,
      pitchXMm: pitchXProp,
      pitchYMm: pitchYProp,
      novaJetBrand,
    });
    // Sheet origin (offset). Pitch advances are independent of CSS gap.
    const { marginTop, marginLeft } = computeA4SheetMargins(
      cols,
      rows,
      layoutWidth,
      labelHeight,
      layoutGap,
      { top: yOffset, left: xOffset },
      novaJetBrand,
    );

    return (
      <>
        <PrecisionPrintCSS labelWidth={layoutWidth} labelHeight={labelHeight} mode="a4" active={active} />
        <div ref={ref} className="precision-print-area">
          {pages.map((pageItems, pageIdx) => (
            <div
              key={pageIdx}
              style={{
                width: `${A4_PAGE_WIDTH_MM}mm`,
                height: `${A4_PAGE_HEIGHT_MM}mm`,
                boxSizing: "border-box",
                position: "relative",
                pageBreakAfter: pageIdx < pages.length - 1 ? "always" : "auto",
                // Exact mm pitch — no CSS gap / space-between / scale.
                ["--offset-x" as string]: `${marginLeft}mm`,
                ["--offset-y" as string]: `${marginTop}mm`,
                ["--pitch-x" as string]: `${pitchXMm}mm`,
                ["--pitch-y" as string]: `${pitchYMm}mm`,
                padding: 0,
                margin: 0,
                overflow: "hidden",
              }}
            >
              {pageItems.map((item, idx) => {
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                const { xMm, yMm } = a4LabelCellOriginMm(
                  col,
                  row,
                  marginLeft,
                  marginTop,
                  pitchXMm,
                  pitchYMm,
                );
                return item ? (
                  <div
                    key={idx}
                    style={{
                      position: "absolute",
                      left: `${xMm}mm`,
                      top: `${yMm}mm`,
                      width: `${layoutWidth}mm`,
                      height: `${labelHeight}mm`,
                      overflow: "hidden",
                    }}
                  >
                    <PrecisionLabelPreview
                      item={item}
                      width={layoutWidth}
                      height={labelHeight}
                      showBorder={false}
                      config={config}
                      productFieldSettings={productFieldSettings}
                    />
                  </div>
                ) : (
                  <div
                    key={idx}
                    style={{
                      position: "absolute",
                      left: `${xMm}mm`,
                      top: `${yMm}mm`,
                      width: `${layoutWidth}mm`,
                      height: `${labelHeight}mm`,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </>
    );
  },
);

PrecisionA4SheetPrint.displayName = "PrecisionA4SheetPrint";
