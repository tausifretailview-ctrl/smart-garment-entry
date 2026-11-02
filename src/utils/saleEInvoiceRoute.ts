import { supabase } from "@/integrations/supabase/client";
import { isSaleSupplyType, saleSupplyTypeOf, type SaleSupplyType } from "@/utils/industrialMode";

/**
 * Industrial mode, Phase 2 step 3: export and SEZ bills get their IRN from the
 * einvoice-note service (kind "invoice"); every other bill keeps generate-einvoice.
 * Shops without Industrial mode never take the new path and make no extra query.
 */

export type SaleEInvoiceReply = { success?: boolean; error?: string; message?: string; irn?: string; duplicate?: boolean };

/** Supply type of each export / SEZ bill among the given ids (regular bills are left out). */
export async function fetchSaleSupplyTypes(
  organizationId: string,
  saleIds: string[],
): Promise<Map<string, SaleSupplyType>> {
  const out = new Map<string, SaleSupplyType>();
  const unique = Array.from(new Set(saleIds.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, b2b_details")
      .eq("organization_id", organizationId)
      .in("id", unique.slice(i, i + 200))
      .not("b2b_details", "is", null);
    if (error) throw error;
    for (const row of data ?? []) {
      const t = saleSupplyTypeOf((row as { b2b_details?: unknown }).b2b_details);
      if (t !== "B2B") out.set(String(row.id), t);
    }
  }
  return out;
}

/**
 * Generate the IRN of one sale bill through the right service.
 * `supplyType` when the caller already knows it; otherwise, with Industrial mode on, it is read here.
 */
export async function invokeSaleEInvoice(opts: {
  saleId: string;
  organizationId: string;
  testMode: boolean;
  industrial: boolean;
  supplyType?: SaleSupplyType | null;
}): Promise<{ data: SaleEInvoiceReply | null; error: Error | null }> {
  let supplyType: SaleSupplyType = isSaleSupplyType(opts.supplyType) ? opts.supplyType : "B2B";
  if (opts.industrial && !opts.supplyType) {
    supplyType = (await fetchSaleSupplyTypes(opts.organizationId, [opts.saleId])).get(opts.saleId) ?? "B2B";
  }
  if (opts.industrial && supplyType !== "B2B") {
    const { data, error } = await supabase.functions.invoke("einvoice-note", {
      body: {
        action: "generate",
        kind: "invoice",
        noteId: opts.saleId,
        organizationId: opts.organizationId,
        testMode: opts.testMode,
      },
    });
    return { data: (data ?? null) as SaleEInvoiceReply | null, error: (error as Error | null) ?? null };
  }
  const { data, error } = await supabase.functions.invoke("generate-einvoice", {
    body: { saleId: opts.saleId, organizationId: opts.organizationId, testMode: opts.testMode },
  });
  return { data: (data ?? null) as SaleEInvoiceReply | null, error: (error as Error | null) ?? null };
}
