/**
 * Export and SEZ sale bills (Industrial mode, Phase 2 step 3b) in the GST returns.
 *
 * These supplies are zero-rated and always IGST (IGST Act s.7(5), s.16): GSTR-1 reports them
 * in EXP (6A) or in B2B as SEWP / SEWOP, and GSTR-3B in 3.1(b). Bills without a supply type
 * (every shop outside Industrial mode) never come in here.
 */
import { saleSupplyTypeOf, type SaleB2BDetails } from "@/utils/industrialMode";
import type { Gstr1ExportDetails, Gstr1SupplyType } from "@/utils/gstr1Json";

export type ZeroRatedSupply = { supplyType: Gstr1SupplyType; exportDetails: Gstr1ExportDetails | null };

/** GSTR-1 fields of a bill from its sales.b2b_details; null for a regular bill. */
export function gstr1SupplyOf(b2bDetails: unknown): ZeroRatedSupply | null {
  const supplyType = saleSupplyTypeOf(b2bDetails);
  if (supplyType === "B2B") return null;
  if (supplyType !== "EXPWP" && supplyType !== "EXPWOP") return { supplyType, exportDetails: null };
  const d = (b2bDetails && typeof b2bDetails === "object" ? b2bDetails : {}) as SaleB2BDetails;
  return {
    supplyType,
    exportDetails: {
      shipBillNo: d.ship_bill_no ?? null,
      shipBillDate: d.ship_bill_date ?? null,
      portCode: d.port_code ?? null,
    },
  };
}

export type ZeroRatedOutward = { taxable: number; igst: number; count: number };

/**
 * Taxable value and IGST of zero-rated bills, line by line with the same rule as the
 * get_gst_summary database function (line total; exclusive / no_gst / otherwise inclusive),
 * so GSTR-3B can move exactly that part of the outward total from CGST / SGST to IGST.
 */
export function zeroRatedOutward(
  bills: ReadonlyArray<{
    tax_type?: string | null;
    lines: ReadonlyArray<{ line_total?: number | null; gst_percent?: number | null }>;
  }>,
): ZeroRatedOutward {
  let taxable = 0;
  let igst = 0;
  for (const bill of bills) {
    const taxType = String(bill.tax_type ?? "");
    for (const line of bill.lines) {
      const total = Number(line.line_total) || 0;
      const rate = Number(line.gst_percent) || 0;
      if (taxType === "exclusive") {
        taxable += total;
        igst += (total * rate) / 100;
      } else if (taxType === "no_gst") {
        taxable += total;
      } else {
        const base = total / (1 + rate / 100);
        taxable += base;
        igst += (base * rate) / 100;
      }
    }
  }
  return { taxable, igst, count: bills.length };
}
