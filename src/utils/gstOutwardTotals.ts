import {
  isInterState,
  normalizeGstTaxType,
  resolvePosDefaultTaxType,
  resolveSaleDefaultTaxType,
  type GstTaxType,
  type SaleSettingsTaxDefaults,
} from "@/utils/gstRegisterUtils";

/**
 * GST line math and outward totals shared by GSTR-1 and GSTR-3B (GST Reports), so the two
 * returns can never be built from different rules (Plan Phase 3, B4).
 */

/** Taxable value and GST of one bill line (after its share of the bill discount). */
export function lineTaxableAndGst(
  lineTotal: number,
  rate: number,
  taxType: GstTaxType,
): { taxable: number; gst: number } {
  const total = lineTotal || 0;
  const gstPercent = rate || 0;
  if (taxType === "no_gst" || gstPercent <= 0) {
    return { taxable: total, gst: 0 };
  }
  if (taxType === "exclusive") {
    return { taxable: total, gst: total * (gstPercent / 100) };
  }
  const taxable = total / (1 + gstPercent / 100);
  return { taxable, gst: total - taxable };
}

/** Bill tax type: the bill's own, else the shop's POS / sale default from Sale Settings. */
export function resolveReportTaxType(
  saleTaxType: string | null | undefined,
  saleType: string | null | undefined,
  saleSettings?: SaleSettingsTaxDefaults | null,
): GstTaxType {
  const raw = String(saleTaxType ?? "").trim();
  if (raw) return normalizeGstTaxType(raw);
  if (String(saleType || "").toLowerCase() === "pos") {
    return resolvePosDefaultTaxType(saleSettings);
  }
  return resolveSaleDefaultTaxType(saleSettings);
}

export type OutwardBill = {
  id: string;
  sale_type?: string | null;
  tax_type?: string | null;
  /** Buyer GSTIN (blank for retail customers). */
  customerGstin?: string | null;
  /** Export / SEZ bill (Industrial mode): zero-rated, always IGST. */
  zeroRated?: boolean;
};

export type OutwardLine = {
  sale_id: string;
  line_total?: number | null;
  discount_share?: number | null;
  gst_percent?: number | null;
};

export type OutwardTotals = { taxable: number; igst: number; cgst: number; sgst: number };

/**
 * Outward supplies of the given bills, with the same rules as the GSTR-1 file: the bill
 * discount comes off each line before the GST split, the shop's default tax type applies to a
 * bill without one, and a sale to another state (or an export / SEZ bill) is IGST.
 * Pass only GST bills and non-DC lines (held / cancelled / debit-note bills and DC lines out).
 */
export function outwardTotalsFromBills(
  bills: readonly OutwardBill[],
  lines: readonly OutwardLine[],
  opts: { businessGstin: string; saleSettings?: SaleSettingsTaxDefaults | null },
): OutwardTotals {
  const linesByBill = new Map<string, OutwardLine[]>();
  for (const l of lines) {
    const key = String(l.sale_id);
    const list = linesByBill.get(key);
    if (list) list.push(l);
    else linesByBill.set(key, [l]);
  }
  const totals: OutwardTotals = { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
  for (const bill of bills) {
    const gstin = String(bill.customerGstin || "").trim().toUpperCase();
    const interState = bill.zeroRated === true || isInterState(opts.businessGstin, gstin);
    const taxType = resolveReportTaxType(bill.tax_type, bill.sale_type, opts.saleSettings);
    for (const line of linesByBill.get(String(bill.id)) || []) {
      const lineTotal = (Number(line.line_total) || 0) - (Number(line.discount_share) || 0);
      const { taxable, gst } = lineTaxableAndGst(lineTotal, Number(line.gst_percent) || 0, taxType);
      totals.taxable += taxable;
      if (interState) {
        totals.igst += gst;
      } else {
        totals.cgst += gst / 2;
        totals.sgst += gst / 2;
      }
    }
  }
  return totals;
}
