/**
 * Batch and expiry (supermarket phase 2, Nov 2026), migration 20270611120000.
 *
 * - Purchase lines carry batch / expiry; saved right after the bill (set_purchase_line_batches).
 * - Expiry report: lots on hand that expire soon or have expired (get_expiry_report).
 * - Billing check: when the lot that sells next (oldest purchase first) expires
 *   (get_variant_expiry_status), cached per item for a few minutes so a counter scanning the
 *   same items does not read again and again.
 */
type DbError = { code?: string; message?: string } | null;
export type BatchExpiryDb = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: DbError }>;
};

export type ExpiredStockAction = "off" | "warn" | "block";

export type ExpirySettings = { trackOnPurchase: boolean; action: ExpiredStockAction };

/** Settings → Purchase "Batch & expiry on purchase lines"; Settings → Sale "Expired stock at billing". */
export function readExpirySettings(settings: unknown): ExpirySettings {
  const s = (settings ?? {}) as { purchase_settings?: { track_batch_expiry?: unknown }; sale_settings?: { expired_stock_action?: unknown } };
  const trackOnPurchase = s.purchase_settings?.track_batch_expiry === true;
  const raw = s.sale_settings?.expired_stock_action;
  const action: ExpiredStockAction = raw === "off" || raw === "warn" || raw === "block" ? raw : trackOnPurchase ? "warn" : "off";
  return { trackOnPurchase, action };
}

export function isMissingExpirySchema(err: DbError): boolean {
  if (!err) return false;
  if (["PGRST202", "42883", "42703", "PGRST204"].includes(String(err.code))) return true;
  return /get_expiry_report|get_variant_expiry_status|set_purchase_line_batches|write_off_expired_lot|record_stock_wastage|expiry_date/i.test(String(err.message || "")) &&
    /does not exist|schema cache|not find/i.test(String(err.message || ""));
}

export type PurchaseLineBatch = { sku_id?: string | null; barcode?: string | null; batch_no?: string | null; expiry_date?: string | null; mfg_date?: string | null };

const hasBatchInfo = (l: PurchaseLineBatch) =>
  !!((l.batch_no ?? "").trim() || (l.expiry_date ?? "").trim() || (l.mfg_date ?? "").trim());

/**
 * Lines for set_purchase_line_batches. A new bill sends the lines that have a batch or expiry.
 * An edited bill whose lines had one before (`hadBatchInfoBefore`) sends every line, so a
 * cleared box is cleared in the database too.
 */
export function batchLinesForSave(lines: readonly PurchaseLineBatch[], hadBatchInfoBefore = false): PurchaseLineBatch[] {
  const anyNow = lines.some(hasBatchInfo);
  if (!anyNow && !hadBatchInfoBefore) return [];
  return lines
    .filter((l) => hadBatchInfoBefore || hasBatchInfo(l))
    .filter((l) => l.sku_id || l.barcode)
    .map((l) => ({
      sku_id: l.sku_id || null,
      barcode: l.sku_id ? null : l.barcode || null,
      batch_no: (l.batch_no ?? "").trim() || null,
      expiry_date: (l.expiry_date ?? "").trim() || null,
      mfg_date: (l.mfg_date ?? "").trim() || null,
    }));
}

export function linesHaveBatchInfo(lines: readonly PurchaseLineBatch[]): boolean {
  return lines.some(hasBatchInfo);
}

export async function setPurchaseLineBatches(
  db: BatchExpiryDb,
  orgId: string,
  billId: string,
  lines: readonly PurchaseLineBatch[],
  hadBatchInfoBefore = false,
): Promise<void> {
  const payload = batchLinesForSave(lines, hadBatchInfoBefore);
  if (payload.length === 0) return;
  const { error } = await db.rpc("set_purchase_line_batches", { p_organization_id: orgId, p_bill_id: billId, p_lines: payload });
  if (error) {
    if (isMissingExpirySchema(error)) throw new Error("Run SQL 74 (batch & expiry) to keep batch and expiry dates.");
    throw new Error(error.message || "Batch / expiry not saved");
  }
  clearExpiryStatusCache();
}

export type ExpiryReportRow = {
  variant_id: string;
  purchase_bill_id: string;
  product_name: string;
  brand: string | null;
  size: string | null;
  barcode: string | null;
  bill_number: string;
  purchase_date: string;
  supplier_name: string | null;
  batch_no: string | null;
  expiry_date: string;
  days_left: number;
  lot_qty: number;
  unit_cost: number;
  cost_value: number;
};

/** null while the SQL has not been run. */
export async function fetchExpiryReport(db: BatchExpiryDb, orgId: string, withinDays: number): Promise<ExpiryReportRow[] | null> {
  const { data, error } = await db.rpc("get_expiry_report", { p_org_id: orgId, p_within_days: withinDays });
  if (error) {
    if (isMissingExpirySchema(error)) return null;
    throw new Error(error.message || "Could not load expiry report");
  }
  return ((data ?? []) as ExpiryReportRow[]).map((r) => ({
    ...r,
    days_left: Number(r.days_left),
    lot_qty: Number(r.lot_qty) || 0,
    unit_cost: Number(r.unit_cost) || 0,
    cost_value: Number(r.cost_value) || 0,
  }));
}

/** Write the lot off as expired wastage and empty it (write_off_expired_lot). */
export async function writeOffExpiredLot(
  db: BatchExpiryDb,
  orgId: string,
  row: Pick<ExpiryReportRow, "purchase_bill_id" | "variant_id" | "batch_no" | "expiry_date" | "bill_number">,
  quantity?: number,
): Promise<{ docNumber: string; totalQty: number; totalCost: number }> {
  const notes = [row.batch_no ? `Batch ${row.batch_no}` : "", `exp ${dmy(row.expiry_date)}`, row.bill_number].filter(Boolean).join(" · ");
  const { data, error } = await db.rpc("write_off_expired_lot", {
    p_organization_id: orgId,
    p_bill_id: row.purchase_bill_id,
    p_variant_id: row.variant_id,
    p_quantity: quantity ?? null,
    p_notes: notes,
  });
  if (error) {
    if (isMissingExpirySchema(error)) {
      throw new Error("Run SQL 72 (wastage) and SQL 74 (batch & expiry) first.");
    }
    throw new Error(error.message || "Write-off not saved");
  }
  clearExpiryStatusCache();
  const r = (data ?? {}) as Record<string, unknown>;
  return { docNumber: String(r.doc_number ?? ""), totalQty: Number(r.total_qty) || 0, totalCost: Number(r.total_cost) || 0 };
}

// ── Billing check ───────────────────────────────────────────────────────────────────────────

export type ExpiryStatus = { nextLotExpiry: string | null; earliestExpiry: string | null };

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; status: ExpiryStatus }>();
let schemaMissing = false;

/** Status of one item (cached). Never throws; null when unknown. */
export async function getExpiryStatus(db: BatchExpiryDb, orgId: string, variantId: string, now = Date.now()): Promise<ExpiryStatus | null> {
  if (schemaMissing || !variantId) return null;
  const key = `${orgId}:${variantId}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.status;
  try {
    const { data, error } = await db.rpc("get_variant_expiry_status", { p_org_id: orgId, p_variant_ids: [variantId] });
    if (error) {
      if (isMissingExpirySchema(error)) schemaMissing = true;
      return null;
    }
    const row = ((data ?? []) as Array<{ next_lot_expiry: string | null; earliest_expiry: string | null }>)[0];
    const status: ExpiryStatus = { nextLotExpiry: row?.next_lot_expiry ?? null, earliestExpiry: row?.earliest_expiry ?? null };
    cache.set(key, { at: now, status });
    return status;
  } catch {
    return null;
  }
}

/** Forget cached statuses (after a purchase or wastage changes the lots). */
export function clearExpiryStatusCache(): void {
  cache.clear();
}

/** Tests only. */
export function resetExpiryStateForTests(): void {
  cache.clear();
  warnedAt.clear();
  schemaMissing = false;
}

/** dd/mm/yyyy for messages. */
export function dmy(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return d && m && y ? `${d}/${m}/${y}` : ymd;
}

/** What to tell the cashier about the stock that sells next; null when nothing to say. */
export function expiryNotice(status: ExpiryStatus | null, todayYmd: string, productName: string): { expired: boolean; message: string } | null {
  const next = status?.nextLotExpiry;
  if (!next) return null;
  if (next < todayYmd) return { expired: true, message: `${productName}: the stock that sells next expired on ${dmy(next)}.` };
  return null;
}

const warnedAt = new Map<string, number>();
const WARN_AGAIN_MS = 60 * 1000;

/**
 * Billing gate (POS / Sale Bill), before an item goes on the bill.
 * - off (default unless batch & expiry is on): nothing is read.
 * - warn: the item is added at once; the check runs alongside and warns (once a minute per item).
 * - block: waits for the check (cached after the first look) and refuses expired stock.
 * Never throws; when the check cannot run the item is allowed.
 */
export async function expiredStockGate(opts: {
  db: BatchExpiryDb;
  orgId: string | null | undefined;
  settings: unknown;
  variantId: string | null | undefined;
  productName: string;
  todayYmd: string;
  notify: (kind: "warn" | "block", message: string) => void;
  now?: number;
}): Promise<boolean> {
  const { db, orgId, settings, variantId, productName, todayYmd, notify } = opts;
  const { action } = readExpirySettings(settings);
  if (action === "off" || !orgId || !variantId) return true;
  const check = async () => expiryNotice(await getExpiryStatus(db, orgId, variantId, opts.now), todayYmd, productName);
  if (action === "warn") {
    void check().then((n) => {
      if (!n) return;
      const t = opts.now ?? Date.now();
      const last = warnedAt.get(variantId);
      if (last !== undefined && t - last < WARN_AGAIN_MS) return;
      warnedAt.set(variantId, t);
      notify("warn", n.message);
    });
    return true;
  }
  const n = await check();
  if (!n) return true;
  notify("block", `${n.message} Write it off in Inventory → Expiry, or change Settings → Purchase → Expired stock at billing.`);
  return false;
}
