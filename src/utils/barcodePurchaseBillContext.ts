import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "barcode_source_purchase_bill";
/** Pending Print-Barcode payload — survives tab-cache + router state clears. */
const PENDING_ITEMS_KEY = "barcode_pending_purchase_items";

export type BarcodePurchaseBillContext = {
  organizationId: string;
  billId: string;
  billNumber?: string;
  updatedAt: number;
};

export type BarcodePendingPurchaseNav = {
  navKey: string;
  billId?: string;
  items: unknown[];
  ts: number;
};

function safeGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // quota / private mode
  }
}

function safeRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Remember which purchase bill barcode printing was opened from (survives tab switch). */
export function persistBarcodePurchaseBillContext(
  organizationId: string,
  input: { billId: string; billNumber?: string },
): void {
  if (!organizationId || !input.billId) return;
  const ctx: BarcodePurchaseBillContext = {
    organizationId,
    billId: input.billId,
    billNumber: input.billNumber?.trim() || undefined,
    updatedAt: Date.now(),
  };
  safeSet(STORAGE_KEY, JSON.stringify(ctx));
}

export function readBarcodePurchaseBillContext(
  organizationId: string | undefined,
): BarcodePurchaseBillContext | null {
  if (!organizationId) return null;
  const raw = safeGet(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BarcodePurchaseBillContext;
    if (parsed.organizationId !== organizationId || !parsed.billId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearBarcodePurchaseBillContext(): void {
  safeRemove(STORAGE_KEY);
}

/** Stash purchase→barcode items so Print Barcode can replace the list even if router state is cleared. */
export function queueBarcodePurchaseItems(input: {
  navKey: string;
  billId?: string;
  items: unknown[];
}): void {
  if (!input.navKey || !input.items?.length) return;
  const payload: BarcodePendingPurchaseNav = {
    navKey: input.navKey,
    billId: input.billId,
    items: input.items,
    ts: Date.now(),
  };
  safeSet(PENDING_ITEMS_KEY, JSON.stringify(payload));
}

export function peekBarcodePurchaseItems(): BarcodePendingPurchaseNav | null {
  const raw = safeGet(PENDING_ITEMS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BarcodePendingPurchaseNav;
    if (!parsed?.navKey || !parsed.items?.length) return null;
    if (Date.now() - parsed.ts > 120_000) {
      safeRemove(PENDING_ITEMS_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function consumeBarcodePurchaseItems(navKey?: string | null): BarcodePendingPurchaseNav | null {
  const pending = peekBarcodePurchaseItems();
  if (!pending) return null;
  if (navKey && pending.navKey !== navKey) return null;
  safeRemove(PENDING_ITEMS_KEY);
  return pending;
}

export function clearBarcodePurchaseItems(): void {
  safeRemove(PENDING_ITEMS_KEY);
}

/** True when Print Barcode is in-flight (history state or session queue). */
export function hasPendingBarcodePurchaseItems(): boolean {
  try {
    const hist = window.history.state as { purchaseItems?: unknown[] } | null;
    if (hist?.purchaseItems?.length) return true;
  } catch {
    /* ignore */
  }
  return peekBarcodePurchaseItems() != null;
}

/** Latest saved purchase bill for the org (matches Purchase Entry "Last" navigation). */
export async function fetchLatestPurchaseBillId(
  organizationId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("purchase_bills")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("fetchLatestPurchaseBillId:", error);
    return null;
  }
  return data?.id ?? null;
}

async function lookupPurchaseBillIdByNumber(
  organizationId: string,
  billNumber: string,
): Promise<string | null> {
  const trimmed = billNumber.trim();
  if (!trimmed) return null;

  const base = () =>
    supabase
      .from("purchase_bills")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

  const { data: bySoftware, error: softwareError } = await base()
    .eq("software_bill_no", trimmed)
    .maybeSingle();
  if (softwareError) {
    console.error("lookupPurchaseBillIdByNumber (software):", softwareError);
  }
  if (bySoftware?.id) return bySoftware.id;

  const { data: bySupplier, error: supplierError } = await base()
    .eq("supplier_invoice_no", trimmed)
    .maybeSingle();
  if (supplierError) {
    console.error("lookupPurchaseBillIdByNumber (supplier):", supplierError);
  }
  return bySupplier?.id ?? null;
}

/**
 * Resolve which purchase bill to reopen from barcode printing.
 * Priority: explicit billId → bill number on labels → latest org bill.
 */
export async function resolvePurchaseBillIdForBarcodeReturn(
  organizationId: string,
  options: { billId?: string | null; billNumber?: string | null },
): Promise<string | null> {
  if (options.billId) return options.billId;

  const fromNumber = options.billNumber
    ? await lookupPurchaseBillIdByNumber(organizationId, options.billNumber)
    : null;
  if (fromNumber) return fromNumber;

  return fetchLatestPurchaseBillId(organizationId);
}
