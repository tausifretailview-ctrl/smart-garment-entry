/** Kids Camp 80mm GST invoice — helpers matching the boxed DOS thermal slip. */

export const KIDS_CAMP_GST_SLABS = [5, 18, 28] as const;

export const KIDS_CAMP_DEFAULT_TERMS = [
  "WITHOUT BILL & PRICE TAG NO EXC.",
  "FIRST WASH DRY CLEAN ONLY.",
  "Exchange time 12 P.M. to 4 P.M.",
  "No Refund only Exchange within 5 Days,NO EXC. BORNBABY PRODUCTS.",
];

export type KidsCampGstRateEntry = {
  rate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
};

export type KidsCampGstTaxRow = {
  rateLabel: string;
  taxable: number;
  cgst: number;
  sgst: number;
};

export function fmtKidsCampAmt(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return value.toFixed(2);
}

/** Instagram handle only — sample prints `kidscamp_wapmen`, not the URL. */
export function instagramHandleFromLink(raw: string | null | undefined): string {
  const v = String(raw || "").trim();
  if (!v) return "";
  const strippedAt = v.replace(/^@/, "");
  if (!/instagram\.com/i.test(strippedAt) && !/^https?:\/\//i.test(v)) {
    return strippedAt.split(/[/?#]/).filter(Boolean)[0] || "";
  }
  try {
    const withProto = /^https?:\/\//i.test(v) ? v : `https://${strippedAt}`;
    const u = new URL(withProto);
    if (/instagram\.com$/i.test(u.hostname.replace(/^www\./i, ""))) {
      return u.pathname.split("/").filter(Boolean)[0] || "";
    }
  } catch {
    /* fall through */
  }
  return strippedAt
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^(www\.)?instagram\.com\//i, "")
    .split(/[/?#]/)
    .filter(Boolean)[0] || "";
}

/** Sample Mobile line uses +91 when the stored number is 10 digits. */
export function formatKidsCampMobile(raw: string | null | undefined): string {
  const original = String(raw || "").trim();
  if (!original) return "";
  const digits = original.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("091")) return `+91${digits.slice(3)}`;
  return original.startsWith("+") ? original : original;
}

export function kidsCampLineDiscAmt(item: {
  rate: number;
  qty: number;
  total: number;
  discountPercent?: number;
}): number {
  if (item.discountPercent && item.discountPercent > 0) {
    return (Number(item.rate) || 0) * (Number(item.qty) || 0) * item.discountPercent / 100;
  }
  const gross = (Number(item.rate) || 0) * (Number(item.qty) || 0);
  const total = Number(item.total) || 0;
  if (total + 0.005 < gross) return gross - total;
  return 0;
}

/**
 * Inclusive GST extract from line totals — same formula as the sample
 * (₹3500 @ 5% → taxable 3333.33, CGST/SGST 83.33 each).
 */
export function kidsCampGstFromInclusiveTotal(lineTotal: number, gstPercent: number): {
  taxable: number;
  tax: number;
} {
  const gst = Number(gstPercent) || 0;
  const total = Number(lineTotal) || 0;
  if (gst <= 0 || total === 0) return { taxable: total, tax: 0 };
  const tax = (total * gst) / (100 + gst);
  return { taxable: total - tax, tax };
}

export function buildKidsCampGstRateBreakdown(
  items: Array<{ total: number; gstPercent?: number }>,
): KidsCampGstRateEntry[] {
  const rateMap = new Map<number, { taxable: number; tax: number }>();
  for (const item of items) {
    const gstPct = item.gstPercent || 0;
    if (gstPct <= 0) continue;
    const { taxable, tax } = kidsCampGstFromInclusiveTotal(item.total, gstPct);
    const existing = rateMap.get(gstPct) || { taxable: 0, tax: 0 };
    rateMap.set(gstPct, { taxable: existing.taxable + taxable, tax: existing.tax + tax });
  }
  return Array.from(rateMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, { taxable, tax }]) => ({
      rate,
      taxableAmount: taxable,
      cgst: tax / 2,
      sgst: tax / 2,
    }));
}

/** Always print 5% / 18% / 28% (zeros when unused), plus any other billed rate. */
export function buildKidsCampGstTaxRows(
  breakdown: KidsCampGstRateEntry[] | undefined,
): KidsCampGstTaxRow[] {
  const byRate = new Map((breakdown || []).map((b) => [b.rate, b]));
  const rows: KidsCampGstTaxRow[] = KIDS_CAMP_GST_SLABS.map((rate) => {
    const b = byRate.get(rate);
    return {
      rateLabel: `${rate}%`,
      taxable: b?.taxableAmount ?? 0,
      cgst: b?.cgst ?? 0,
      sgst: b?.sgst ?? 0,
    };
  });
  for (const b of breakdown || []) {
    if ((KIDS_CAMP_GST_SLABS as readonly number[]).includes(b.rate)) continue;
    if (!b.taxableAmount && !b.cgst && !b.sgst) continue;
    rows.push({
      rateLabel: `${b.rate}%`,
      taxable: b.taxableAmount,
      cgst: b.cgst,
      sgst: b.sgst,
    });
  }
  return rows;
}

export function sumKidsCampGstTaxRows(rows: KidsCampGstTaxRow[]): {
  taxable: number;
  cgst: number;
  sgst: number;
} {
  return rows.reduce(
    (acc, row) => ({
      taxable: acc.taxable + row.taxable,
      cgst: acc.cgst + row.cgst,
      sgst: acc.sgst + row.sgst,
    }),
    { taxable: 0, cgst: 0, sgst: 0 },
  );
}

export function kidsCampTermLines(termsList?: string[] | null): string[] {
  const custom = (termsList || []).map((t) => (t || "").trim()).filter(Boolean);
  return custom.length > 0 ? custom : KIDS_CAMP_DEFAULT_TERMS;
}
