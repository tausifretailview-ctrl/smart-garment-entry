import { uqcForUnit } from "../../supabase/functions/_shared/uqc";

export interface GstHsnReportRow {
  hsnCode: string;
  description: string;
  uqc: string;
  totalQty: number;
  totalValue: number;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  rate: number;
}

/** Product-detail report, not the statutory GSTR-1 HSN aggregation. */
export function addGstHsnReportLine(
  rows: Map<string, GstHsnReportRow>,
  line: {
    hsn?: string | null;
    description?: string | null;
    uom?: string | null;
    qty: number;
    rate: number;
    taxable: number;
    gst: number;
    interState: boolean;
  },
): void {
  const hsnCode = String(line.hsn ?? "").trim();
  const description = String(line.description ?? "").trim();
  const uqc = uqcForUnit(line.uom) || "OTH";
  const key = JSON.stringify([hsnCode, description, line.rate, uqc]);
  const row = rows.get(key) ?? {
    hsnCode, description, uqc, rate: line.rate,
    totalQty: 0, totalValue: 0, taxableValue: 0, igst: 0, cgst: 0, sgst: 0,
  };
  row.totalQty += line.qty;
  row.taxableValue += line.taxable;
  row.totalValue += line.taxable + line.gst;
  if (line.interState) row.igst += line.gst;
  else {
    row.cgst += line.gst / 2;
    row.sgst += line.gst / 2;
  }
  rows.set(key, row);
}