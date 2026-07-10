import type { SkeletonTableColumn } from "@/components/skeletons/SkeletonTableRows";

/** Sales Invoice Dashboard — default visible columns. */
export const SALES_INVOICE_TABLE_SKELETON_COLUMNS: SkeletonTableColumn[] = [
  { variant: "checkbox", width: "16px", align: "center" },
  { variant: "icon", width: "16px", align: "center" },
  { width: "88px", variant: "barcode" },
  { width: "96px" },
  { width: "72px" },
  { width: "64px" },
  { width: "36px", align: "center" },
  { width: "48px", align: "right", variant: "amount" },
  { width: "64px", align: "right", variant: "amount" },
  { variant: "pill", align: "left" },
  { width: "56px", align: "right", variant: "amount" },
  { width: "72px" },
  { width: "80px", align: "right" },
];

/** Purchase Bill Dashboard — typical visible ERPTable columns. */
export const PURCHASE_BILL_TABLE_SKELETON_COLUMNS: SkeletonTableColumn[] = [
  { variant: "checkbox", width: "16px", align: "center" },
  { width: "28px", align: "center" },
  { width: "88px", variant: "barcode" },
  { width: "80px" },
  { width: "72px" },
  { width: "100px" },
  { width: "72px", align: "right", variant: "amount" },
  { width: "72px", align: "right", variant: "amount" },
  { width: "72px", align: "right", variant: "amount" },
  { width: "64px", align: "right", variant: "amount" },
  { variant: "pill" },
  { width: "64px", align: "right" },
];

/** Stock Report — core columns (subset of full 19-col grid). */
export const STOCK_REPORT_TABLE_SKELETON_COLUMNS: SkeletonTableColumn[] = [
  { width: "24px", align: "center" },
  { width: "72px" },
  { width: "80px" },
  { width: "120px" },
  { width: "64px" },
  { width: "40px", align: "center" },
  { width: "48px" },
  { width: "56px" },
  { width: "80px", variant: "barcode" },
  { width: "48px", align: "right", variant: "amount" },
  { width: "48px", align: "right", variant: "amount" },
  { width: "48px", align: "right", variant: "amount" },
  { width: "52px", align: "right", variant: "amount" },
  { variant: "pill" },
];
