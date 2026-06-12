import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "barcode_source_purchase_bill";

export type BarcodePurchaseBillContext = {
  organizationId: string;
  billId: string;
  billNumber?: string;
  updatedAt: number;
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
