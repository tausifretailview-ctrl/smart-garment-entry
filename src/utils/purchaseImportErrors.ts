/**
 * Plain-language reasons for Purchase Excel import rows that could not be added,
 * so the result popup can say what went wrong per Excel row instead of
 * "Check console for details".
 */

export type ImportRowFailure = {
  /** 1-based Excel row number (header row + data offset). */
  excelRow: number;
  productName: string;
  reason: string;
};

type DbErrorLike = { message?: string; code?: string; details?: string; hint?: string } | null | undefined;

const ALLOWED_GST = [0, 5, 12, 18, 28];

/**
 * GST % from an Excel cell. Percent-formatted cells can arrive as fractions
 * (0.05 / 0.18) when read raw; product GST is a whole-number slab.
 */
export function normalizeImportGstPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const pct = value < 1 ? value * 100 : value;
  return Math.round(pct * 100) / 100;
}

/** Turn a Supabase/Postgres insert error into a short reason a shop user can act on. */
export function describeImportDbError(
  error: DbErrorLike | unknown,
  ctx: { what: "product" | "item"; gstPer?: number } = { what: "item" },
): string {
  if (!error) return ctx.what === "product" ? "Product could not be created" : "Item could not be created";
  const e = error as { message?: string; code?: string; details?: string };
  const message = String(e.message ?? error ?? "");
  const all = `${message} ${e.details ?? ""}`;
  const code = e.code ?? "";

  if (code === "23514" || /violates check constraint/i.test(all)) {
    if (/gst/i.test(all)) {
      const got = ctx.gstPer !== undefined ? ` ${ctx.gstPer}` : "";
      return `GST %${got} is not allowed (use ${ALLOWED_GST.join(", ")})`;
    }
    if (/price|mrp/i.test(all)) return "Price cannot be negative";
    return `Value rejected by the database (${message})`;
  }
  if (code === "23505" || /duplicate key|unique/i.test(all)) {
    if (/barcode/i.test(all)) return "This barcode with the same size/colour already exists on another price or product";
    if (/product_name/i.test(all)) return "A product with this name already exists";
    return "Duplicate of an existing item";
  }
  if (code === "22P02" || /invalid input syntax/i.test(all)) {
    const m = /invalid input syntax for type (\w+): "([^"]*)"/i.exec(all);
    return m ? `"${m[2]}" is not a valid ${m[1] === "integer" ? "whole number" : "number"}` : "A number column has text in it";
  }
  if (code === "22003" || /out of range/i.test(all)) return "A number is too large";
  if (code === "42501" || /row-level security|permission denied/i.test(all)) {
    return "No permission to create products for this shop";
  }
  if (/timeout|statement timeout|57014/i.test(all) || code === "57014") return "Server was busy (timeout), import this row again";
  if (/failed to fetch|network/i.test(all)) return "Network problem, import this row again";
  return message || (ctx.what === "product" ? "Product could not be created" : "Item could not be created");
}

/** Multi-line summary: one line per failed row (first `max` rows), grouped hint at the end. */
export function formatImportFailureSummary(failures: ImportRowFailure[], max = 12): string {
  if (failures.length === 0) return "";
  const sorted = [...failures].sort((a, b) => a.excelRow - b.excelRow);
  const lines = sorted.slice(0, max).map((f) => {
    const name = f.productName.length > 28 ? `${f.productName.slice(0, 27)}…` : f.productName;
    return `Row ${f.excelRow}: ${name ? `${name} · ` : ""}${f.reason}`;
  });
  if (sorted.length > max) lines.push(`…and ${sorted.length - max} more rows`);
  return lines.join("\n");
}
