import type { PosThermalPaper } from "@/utils/invoicePrintFormat";

/** 80mm particulars can use the space up to Qty; CSS ellipsis clips at the column edge. */
export const KIDS_MAX_NAME_LEN_80 = 36;
export const KIDS_MAX_NAME_LEN_58 = 14;

export type KidsThermalParticularsItem = {
  particulars: string;
  size?: string;
  mrp?: number;
  rate: number;
};

export function kidsLayoutForPaper(paper: PosThermalPaper) {
  const is58 = paper === "58mm";
  return {
    paperWidth: is58 ? "48mm" : "72mm",
    padding: is58 ? "1mm 0.5mm 1mm 1mm" : "1mm 2mm 1mm 3mm",
    baseFont: is58 ? "11px" : "14px",
    headerFont: is58 ? "14px" : "18px",
    titleFont: is58 ? "12px" : "15px",
    itemFont: is58 ? "10px" : "13px",
    footerFont: is58 ? "10px" : "13px",
    grandFont: is58 ? "15px" : "20px",
    maxNameLen: is58 ? KIDS_MAX_NAME_LEN_58 : KIDS_MAX_NAME_LEN_80,
    /** Qty / N.Amt stay compact so Particulars runs up to Qty. */
    colQtyFlex: is58 ? "0 0 11%" : "0 0 8mm",
    colAmtFlex: is58 ? "0 0 24%" : "0 0 16mm",
    itemGap: is58 ? "1mm" : "1mm",
    stackTotals: is58,
  };
}

export function formatKidsMrp(n: number): string {
  return n.toFixed(3);
}

/** One-line: short name - size - [MRP] (no box, no wrap). */
export function formatKidsParticularsLine(
  item: KidsThermalParticularsItem,
  maxNameLen: number,
  showMrp: boolean,
): string {
  let name = item.particulars.trim();
  if (name.length > maxNameLen) {
    name = `${name.slice(0, maxNameLen - 2)}..`;
  }
  const rawSize = item.size?.trim() || "";
  // Guard placeholder sizes/colors ("None", "N/A", "-") from printing as product detail.
  const size = /^(none|n\/a|na|null|undefined|-|\.)$/i.test(rawSize) ? "" : rawSize;
  const mrpVal = Number(item.mrp) || Number(item.rate) || 0;
  const parts = [name];
  if (size) parts.push(size);
  if (showMrp && mrpVal > 0) parts.push(formatKidsMrp(mrpVal));
  return parts.join(" - ");
}
