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

export async function generateOrgSaleNumber(
  organizationId: string,
  saleSettings: Record<string, unknown> | null | undefined,
  kind: "sale" | "pos" = "sale",
): Promise<string> {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const formatKey = kind === "pos" ? "pos_numbering_format" : "invoice_numbering_format";
  const seriesKey = kind === "pos" ? "pos_series_start" : "invoice_series_start";
  const rawFormat = (saleSettings?.[formatKey] as string) || (saleSettings?.[seriesKey] as string);
  const rawSeriesStart = saleSettings?.[seriesKey] as string | undefined;

  if (rawFormat) {
    const correctedFormat = autoCorrectFY(rawFormat);
    const correctedStart = rawSeriesStart ? autoCorrectFY(rawSeriesStart) : rawSeriesStart;

    let minSequence = 1;
    if (correctedStart?.trim()) {
      const startMatches = correctedStart.match(/(\d+)$/);
      if (startMatches) minSequence = parseInt(startMatches[1], 10);
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

    const rpcName = kind === "pos" ? "generate_custom_pos_number" : "generate_custom_sale_number";
    const { data, error } = await supabase.rpc(rpcName as any, {
      p_organization_id: organizationId,
      p_format: safeFormat,
      p_year: year,
      p_month: month,
      p_min_sequence: minSequence,
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
