import type { SupabaseClient } from "@supabase/supabase-js";
import type { SaleNumberRequest } from "@/utils/saleNumber";
import { SALE_REQUEST_ID_KEY } from "@/lib/saleRequestId";

/**
 * Plan Phase 2, step 1: save a bill header and its lines in one database transaction
 * (save_sale_with_items_atomic). On for every shop by default; a shop can turn it off in
 * Settings → POS "One-step bill save" (sale_settings.atomic_bill_save = false).
 *
 * Returns null when the database function is not there yet, so the caller uses the
 * old two-step insert. Any other error is thrown: the transaction rolled back, so no
 * header or lines were saved and the cashier can safely press save again.
 */

/** On unless the shop explicitly turned it off (missing setting = on). */
export function isAtomicBillSaveEnabled(
  saleSettings: { atomic_bill_save?: unknown } | null | undefined,
): boolean {
  return saleSettings?.atomic_bill_save !== false;
}

/** Lines are built before the bill id exists; the database sets the real sale_id. */
export const ATOMIC_SALE_ID_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

export type AtomicSaleSaveResult = {
  sale: Record<string, unknown> & { id: string };
  itemsInserted: number;
  droppedSaleKeys: string[];
  droppedItemKeys: string[];
  /** paid_amount / payment_status already settled in the same transaction (step 3 SQL). */
  settledInSave: boolean;
  /** This bill was already in the database from an earlier attempt whose reply was lost. */
  recovered?: boolean;
};

type RpcError = { code?: string; message?: string; hint?: string } | null;

export function isMissingAtomicSaleSaveRpc(err: RpcError): boolean {
  return (
    err?.code === "PGRST202" ||
    err?.code === "42883" ||
    /save_sale_with_items_(atomic|numbered)/i.test(String(err?.message || err?.hint || "")) && /not find|does not exist/i.test(String(err?.message || ""))
  );
}

/** The unique rule on sales (organization_id, client_request_id), migration 20270514120000. */
export const SALE_REQUEST_INDEX = "uq_sales_client_request";

/** A bill with this request id is already saved (the reply of that save was lost). */
export function isDuplicateSaleRequest(err: unknown): boolean {
  const e = err as { code?: string; message?: string; details?: string | null } | null;
  if (!e || e.code !== "23505") return false;
  return `${e.message || ""} ${e.details || ""}`.includes(SALE_REQUEST_INDEX);
}

/**
 * What to do when the bill being saved was already saved under the same request id.
 * The cashier decides, because the cart may also be a new sale that only looks the same
 * (same item, walk-in, cash) rung after the first one was found in the list.
 */
export type DuplicateSaleHandling = {
  /** True = it is the same bill: use the saved one, write nothing. False = save a new bill. */
  isSameBill: (existing: Record<string, unknown>) => boolean | Promise<boolean>;
  /** A new request id for "save a new bill". */
  freshRequestId: () => string;
};

type LooseClient = {
  from: (table: string) => {
    select: (cols: string, opts?: { count?: "exact"; head?: boolean }) => {
      eq: (k: string, v: string) => {
        eq: (k: string, v: string) => { maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: unknown }> };
        is: (k: string, v: null) => PromiseLike<{ count: number | null; error: unknown }>;
      };
    };
  };
};

/** The bill saved under this request id and how many lines it holds; null when there is none. */
export async function findSaleByRequestId(
  client: SupabaseClient,
  organizationId: string,
  requestId: string,
): Promise<{ sale: Record<string, unknown> & { id: string }; lines: number } | null> {
  const db = client as unknown as LooseClient;
  const { data: sale, error } = await db
    .from("sales")
    .select("*")
    .eq("organization_id", organizationId)
    .eq(SALE_REQUEST_ID_KEY, requestId)
    .maybeSingle();
  if (error) throw error;
  if (!sale || typeof sale.id !== "string") return null;
  const { count, error: countError } = await db
    .from("sale_items")
    .select("id", { count: "exact", head: true })
    .eq("sale_id", sale.id)
    .is("deleted_at", null);
  if (countError) throw countError;
  return { sale: sale as Record<string, unknown> & { id: string }, lines: count ?? 0 };
}

export function parseAtomicSaleSaveResult(data: unknown, expectedLines: number): AtomicSaleSaveResult {
  const r = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const sale = r.sale as AtomicSaleSaveResult["sale"] | undefined;
  if (!sale || typeof sale !== "object" || typeof sale.id !== "string") {
    throw new Error("Bill save returned no bill. Nothing was saved; please try again.");
  }
  const itemsInserted = Number(r.items_inserted) || 0;
  if (itemsInserted !== expectedLines) {
    // The transaction would have failed rather than save part of a bill; this guards the reply.
    throw new Error(`Bill save stored ${itemsInserted} of ${expectedLines} lines. Check the bill before saving again.`);
  }
  const keys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);
  return {
    sale,
    itemsInserted,
    droppedSaleKeys: keys(r.dropped_sale_keys),
    droppedItemKeys: keys(r.dropped_item_keys),
    settledInSave: r.settled === true,
  };
}

export async function saveSaleWithItemsAtomic(
  client: SupabaseClient,
  organizationId: string,
  sale: Record<string, unknown>,
  items: Record<string, unknown>[],
): Promise<AtomicSaleSaveResult | null> {
  const { data, error } = await client.rpc("save_sale_with_items_atomic" as never, {
    p_organization_id: organizationId,
    p_sale: sale,
    p_items: items,
  } as never);
  if (error) {
    if (isMissingAtomicSaleSaveRpc(error as RpcError)) return null;
    throw error;
  }
  return parseAtomicSaleSaveResult(data, items.length);
}

/**
 * Plan Phase 2, step 2: the database takes the next POS/INV number inside the same
 * transaction as the bill (save_sale_with_items_numbered), so two counters can never get
 * the same number and a failed save does not use one up. Returns null when that function
 * is not applied yet: the caller then takes the number first, as before.
 */
export async function saveSaleWithItemsNumbered(
  client: SupabaseClient,
  organizationId: string,
  sale: Record<string, unknown>,
  items: Record<string, unknown>[],
  numbering: SaleNumberRequest,
  duplicate?: DuplicateSaleHandling,
): Promise<(AtomicSaleSaveResult & { saleNumber: string }) | null> {
  const save = (row: Record<string, unknown>) =>
    client.rpc("save_sale_with_items_numbered" as never, {
      p_organization_id: organizationId,
      p_sale: row,
      p_items: items,
      p_numbering: numbering,
    } as never);

  let parsed: AtomicSaleSaveResult;
  const { data, error } = await save(sale);
  if (!error) {
    parsed = parseAtomicSaleSaveResult(data, items.length);
  } else {
    if (isMissingAtomicSaleSaveRpc(error as RpcError)) return null;
    const requestId = typeof sale[SALE_REQUEST_ID_KEY] === "string" ? (sale[SALE_REQUEST_ID_KEY] as string) : "";
    if (!(requestId && duplicate && isDuplicateSaleRequest(error))) throw error;

    // An earlier attempt saved a bill under this request id and its reply never arrived.
    // Nothing was written now (the whole save rolled back, no number was used).
    const existing = await findSaleByRequestId(client, organizationId, requestId);
    const same = !!existing && existing.lines === items.length && (await duplicate.isSameBill(existing.sale));
    if (same && existing) {
      parsed = {
        sale: existing.sale,
        itemsInserted: existing.lines,
        droppedSaleKeys: [],
        droppedItemKeys: [],
        // Not known for the earlier attempt: the caller settles again (same result when repeated).
        settledInSave: false,
        recovered: true,
      };
    } else {
      // A different sale that only looks the same: save it as a new bill.
      const retry = await save({ ...sale, [SALE_REQUEST_ID_KEY]: duplicate.freshRequestId() });
      if (retry.error) throw retry.error;
      parsed = parseAtomicSaleSaveResult(retry.data, items.length);
    }
  }
  const saleNumber = String(parsed.sale.sale_number ?? "").trim();
  if (!saleNumber) {
    throw new Error("Bill save returned no bill number. Check the sales list before saving again.");
  }
  return { ...parsed, saleNumber };
}

/**
 * The one-step save settles paid / status from the cash, UPI and card columns
 * (compute_sale_settlement). A Sales invoice paid partly by bank transfer or finance is paid
 * beyond those columns, so it keeps the old save steps and its paid amount stays as entered.
 */
export function invoiceTenderCoversPaid(
  payment: { cashAmount?: number; upiAmount?: number; cardAmount?: number; totalPaid?: number } | null | undefined,
): boolean {
  if (!payment) return true;
  const tender = (payment.cashAmount || 0) + (payment.upiAmount || 0) + (payment.cardAmount || 0);
  return Math.abs(tender - (payment.totalPaid || 0)) <= 0.01;
}
