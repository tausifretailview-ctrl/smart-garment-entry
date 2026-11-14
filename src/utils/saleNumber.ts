import { supabase } from "@/integrations/supabase/client";

/**
 * Auto-correct FY year in literal formats like "INV/25-26/1" → "INV/26-27/1"
 */
export function autoCorrectFY(format: string): string {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const m = ist.getMonth() + 1;
  const y = ist.getFullYear();
  const fyStart = m >= 4 ? y : y - 1;
  const currentFY = `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`;
  return format.replace(/\/(\d{2})-(\d{2})\//, `/${currentFY}/`);
}

/** Trailing numeric sequence from INV/26-27/18 → 18 (never concatenate FY digits). */
export function trailingSaleSequence(saleNumber?: string | null): number | null {
  const trimmed = String(saleNumber || "").trim();
  if (!trimmed) return null;
  const m = trimmed.match(/\/(\d+)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/** Settings "Series Start From" = last bill already used → next number is at least last + 1. */
export function minSequenceFromSeriesStart(seriesStart?: string | null): number {
  const seq = trailingSaleSequence(seriesStart);
  if (seq == null) {
    const trimmed = (seriesStart || "").trim();
    if (!trimmed) return 1;
    const m = trimmed.match(/(\d+)$/);
    if (!m) return 1;
    return parseInt(m[1], 10) + 1;
  }
  return seq + 1;
}

/** Build a LIKE prefix from a format with {###} placeholder, e.g. POS/26-27/{###} → POS/26-27/% */
export function saleFormatToLikePattern(format: string): string {
  if (/\{#+\}/.test(format)) {
    return format.replace(/\{#+\}/, "%");
  }
  return format.replace(/\d+$/, "%");
}

/**
 * What the database needs to take the next bill number: a custom format from Settings, or
 * null for the default POS/YY-YY/N or INV/YY-YY/N series. Shared by generateOrgSaleNumber
 * (number first, then save) and the one-step save (number taken inside the save).
 */
export type SaleNumberRequest = {
  kind: "sale" | "pos";
  format: string | null;
  year: string;
  month: string;
  min_sequence: number;
};

export function buildSaleNumberRequest(
  saleSettings: Record<string, unknown> | null | undefined,
  kind: "sale" | "pos" = "sale",
  now: Date = new Date(),
): SaleNumberRequest {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const formatKey = kind === "pos" ? "pos_numbering_format" : "invoice_numbering_format";
  const seriesKey = kind === "pos" ? "pos_series_start" : "invoice_series_start";
  const rawFormat = (saleSettings?.[formatKey] as string) || (saleSettings?.[seriesKey] as string);
  const rawSeriesStart = saleSettings?.[seriesKey] as string | undefined;

  if (!rawFormat) {
    return { kind, format: null, year, month, min_sequence: 1 };
  }

  const correctedFormat = autoCorrectFY(rawFormat);
  const correctedStart = rawSeriesStart ? autoCorrectFY(rawSeriesStart) : rawSeriesStart;

  let minSequence = 1;
  if (correctedStart?.trim()) {
    minSequence = minSequenceFromSeriesStart(correctedStart);
  }

  // If the format has no number placeholder (user only set "Series Start From"
  // like "INV/26-27/7"), derive a real format by replacing the trailing digits
  // with {###}. Without this the Postgres RPC would loop forever once that
  // literal sale_number already exists, causing a statement_timeout on save.
  let safeFormat = correctedFormat;
  if (!/\{#+\}/.test(safeFormat)) {
    if (/\d+$/.test(safeFormat)) {
      safeFormat = safeFormat.replace(/\d+$/, "{###}");
    } else {
      safeFormat = `${safeFormat}{###}`;
    }
  }

  return { kind, format: safeFormat, year, month, min_sequence: minSequence };
}

export async function generateOrgSaleNumber(
  organizationId: string,
  saleSettings: Record<string, unknown> | null | undefined,
  kind: "sale" | "pos" = "sale",
): Promise<string> {
  const req = buildSaleNumberRequest(saleSettings, kind);

  if (req.format) {
    const rpcName = kind === "pos" ? "generate_custom_pos_number" : "generate_custom_sale_number";
    const { data, error } = await supabase.rpc(rpcName as any, {
      p_organization_id: organizationId,
      p_format: req.format,
      p_year: req.year,
      p_month: req.month,
      p_min_sequence: req.min_sequence,
    } as any);
    if (error) throw error;
    return data as string;
  }

  const atomicRpc = kind === "pos" ? "generate_pos_number_atomic" : "generate_sale_number_atomic";
  const { data: defaultNumber, error: numberError } = await supabase.rpc(atomicRpc as any, {
    p_organization_id: organizationId,
  } as any);
  if (numberError) throw numberError;
  return defaultNumber as string;
}

/** POS estimate print — separate EST/YY-YY/N series (does not consume INV/POS numbers). */
export async function generateOrgEstimateNumber(organizationId: string): Promise<string> {
  const { data, error } = await supabase.rpc("generate_sale_number_atomic", {
    p_organization_id: organizationId,
    p_prefix: "EST",
  });
  if (error) throw error;
  return data as string;
}

/**
 * How to preview the next invoice number for these sale settings: the LIKE pattern that finds
 * the series' existing numbers, the lowest allowed sequence, and how to print a sequence.
 * Shared by every numbering style (custom format with {###}, literal format, default
 * INV/YY-YY/N), which Sales Invoice used to compute in three near-identical copies.
 */
export function planSaleNumberPreview(
  saleSettings: { invoice_numbering_format?: string | null; invoice_series_start?: string | null } | null | undefined,
  now: Date = new Date(),
): { likePattern: string; minSequence: number; render: (sequence: number) => string } {
  const rawFormat = saleSettings?.invoice_numbering_format || saleSettings?.invoice_series_start;
  if (rawFormat) {
    const rawSeriesStart = saleSettings?.invoice_series_start;
    const format = autoCorrectFY(rawFormat);
    const seriesStart = rawSeriesStart ? autoCorrectFY(rawSeriesStart) : rawSeriesStart;
    let safeFormat = format;
    if (!/\{#+\}/.test(safeFormat)) {
      safeFormat = /\d+$/.test(safeFormat) ? safeFormat.replace(/\d+$/, "{###}") : `${safeFormat}{###}`;
    }
    const basePattern = safeFormat.replace(/\{#+\}/, "");
    const padLen = safeFormat.match(/\{(#+)\}/)?.[1]?.length ?? 0;
    return {
      likePattern: saleFormatToLikePattern(safeFormat),
      minSequence: minSequenceFromSeriesStart(seriesStart),
      render: (sequence) => `${basePattern}${padLen > 0 ? String(sequence).padStart(padLen, "0") : String(sequence)}`,
    };
  }
  // Default INV/YY-YY/N series for the current Indian financial year (April–March).
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const fyStart = ist.getMonth() + 1 >= 4 ? ist.getFullYear() : ist.getFullYear() - 1;
  const series = `INV/${String(fyStart).slice(2)}-${String(fyStart + 1).slice(2)}`;
  return { likePattern: `${series}/%`, minSequence: 1, render: (sequence) => `${series}/${sequence}` };
}

/** Highest trailing number among these sale numbers, + 1, never below minSequence. */
export function nextSequenceFrom(saleNumbers: readonly string[], minSequence: number): number {
  let maxSeq = 0;
  for (const n of saleNumbers) {
    const m = n.match(/(\d+)$/);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return Math.max(maxSeq + 1, minSequence);
}

/**
 * The next invoice number this shop will get, without taking it (matches
 * generate_sale_number_atomic: highest active number in the series + 1). Throws on a failed read.
 */
export async function fetchNextSaleNumberPreview(
  orgId: string,
  saleSettings: Parameters<typeof planSaleNumberPreview>[0],
  now: Date = new Date(),
): Promise<string> {
  const plan = planSaleNumberPreview(saleSettings, now);
  const { data, error } = await supabase
    .from("sales")
    .select("sale_number")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .like("sale_number", plan.likePattern)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return plan.render(nextSequenceFrom((data || []).map((s) => s.sale_number), plan.minSequence));
}
