import type { LabelItem } from "@/types/labelTypes";
import { A4_PAGE_HEIGHT_MM, A4_PAGE_WIDTH_MM } from "@/utils/a4SheetLayout";

/**
 * Full Page Designer (Barcode Printing, Standard A4 sheets): which label sits in each
 * slot of one A4 page, and whether the grid fits on the page. Same slot order as the
 * printed PDF (`generateA4LabelPdf`): row by row, `startPosition - 1` used slots first.
 */
export type FullPageSlot =
  | { kind: "label"; item: LabelItem }
  /** Already used on a partly used sheet (before Start position). */
  | { kind: "skip" }
  /** Nothing printed here on this page. */
  | { kind: "empty" };

/** "print" = exactly what Print puts on this page; "fill" = the whole sheet filled to judge the design. */
export type FullPageMode = "print" | "fill";

export interface FullPageSlotsInput {
  items: LabelItem[];
  slotsPerPage: number;
  startPosition?: number;
  mode: FullPageMode;
  /** 0-based page (print mode only). */
  page?: number;
}

export interface FullPageSlotsResult {
  slots: FullPageSlot[];
  pageCount: number;
  /** Labels the current print would use (sum of qty). */
  totalLabels: number;
}

/** Labels in print order: each item repeated by its qty (qty < 1 prints nothing). */
export function expandLabelsByQty(items: LabelItem[]): LabelItem[] {
  const out: LabelItem[] = [];
  for (const item of items) {
    const qty = Math.max(0, Math.floor(Number(item.qty) || 0));
    for (let i = 0; i < qty; i++) out.push(item);
  }
  return out;
}

export function buildFullPageSlots(input: FullPageSlotsInput): FullPageSlotsResult {
  const slotsPerPage = Math.max(1, Math.floor(input.slotsPerPage) || 1);
  const labels = expandLabelsByQty(input.items);
  const totalLabels = labels.length;

  if (input.mode === "fill") {
    // Whole sheet, labels repeated in order (a single product fills every slot).
    const source = labels.length > 0 ? labels : input.items.slice(0, 1);
    const slots: FullPageSlot[] = Array.from({ length: slotsPerPage }, (_, i) =>
      source.length > 0 ? { kind: "label", item: source[i % source.length] } : { kind: "empty" },
    );
    return { slots, pageCount: 1, totalLabels };
  }

  const start = Math.min(slotsPerPage, Math.max(1, Math.floor(input.startPosition || 1)));
  const sequence: (LabelItem | null)[] = [
    ...Array.from({ length: start - 1 }, () => null),
    ...labels,
  ];
  const pageCount = Math.max(1, Math.ceil(sequence.length / slotsPerPage));
  const page = Math.min(pageCount - 1, Math.max(0, Math.floor(input.page || 0)));
  const slice = sequence.slice(page * slotsPerPage, (page + 1) * slotsPerPage);
  const slots: FullPageSlot[] = Array.from({ length: slotsPerPage }, (_, i) => {
    if (i >= slice.length) return { kind: "empty" };
    const item = slice[i];
    return item ? { kind: "label", item } : { kind: "skip" };
  });
  return { slots, pageCount, totalLabels };
}

export interface SheetFitInput {
  cols: number;
  rows: number;
  widthMm: number;
  heightMm: number;
  gapMm: number;
  marginTopMm: number;
  marginLeftMm: number;
}

export interface SheetFitResult {
  contentWidthMm: number;
  contentHeightMm: number;
  /** Space left to the right / below the last label (negative = runs off the page). */
  rightMm: number;
  bottomMm: number;
  overflowXMm: number;
  overflowYMm: number;
  /** Grid starts above / left of the page edge. */
  offPageTopLeft: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10 || 0;

export function computeSheetFit(s: SheetFitInput): SheetFitResult {
  const contentWidthMm = s.cols * s.widthMm + Math.max(0, s.cols - 1) * s.gapMm;
  const contentHeightMm = s.rows * s.heightMm + Math.max(0, s.rows - 1) * s.gapMm;
  const rightMm = A4_PAGE_WIDTH_MM - s.marginLeftMm - contentWidthMm;
  const bottomMm = A4_PAGE_HEIGHT_MM - s.marginTopMm - contentHeightMm;
  return {
    contentWidthMm: r1(contentWidthMm),
    contentHeightMm: r1(contentHeightMm),
    rightMm: r1(rightMm),
    bottomMm: r1(bottomMm),
    overflowXMm: r1(Math.max(0, -rightMm)),
    overflowYMm: r1(Math.max(0, -bottomMm)),
    offPageTopLeft: s.marginTopMm < 0 || s.marginLeftMm < 0,
  };
}

/** Zoom that fits a whole A4 page inside the given box (px), never above 2×. */
export function fitA4PageZoom(boxWidthPx: number, boxHeightPx: number, pxPerMm = 3.7795): number {
  if (!(boxWidthPx > 0) || !(boxHeightPx > 0)) return 0.5;
  const z = Math.min(boxWidthPx / (A4_PAGE_WIDTH_MM * pxPerMm), boxHeightPx / (A4_PAGE_HEIGHT_MM * pxPerMm));
  return Math.max(0.2, Math.min(2, Math.floor(z * 100) / 100));
}
