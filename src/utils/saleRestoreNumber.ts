import { supabase } from "@/integrations/supabase/client";
import { generateOrgSaleNumber } from "@/utils/saleNumber";

/** Postgres unique index: one active (organization_id, sale_number). */
export function isSaleNumberActiveUniqueViolation(error: unknown): boolean {
  const e = error as { message?: string; code?: string } | null;
  const msg = String(e?.message ?? "");
  return e?.code === "23505" || /uq_sales_org_number_active/i.test(msg);
}

export function saleRestoreNumberKind(saleType?: string | null): "pos" | "sale" {
  const t = String(saleType || "").toLowerCase();
  return t === "pos" || t === "delivery_challan" ? "pos" : "sale";
}

/**
 * After a mistaken delete, a newer POS bill often reuses the freed number.
 * The older (deleted) bill keeps the original number; the newer bill moves.
 */
export function shouldKeepOriginalSaleNumber(
  deletedCreatedAt: string | null | undefined,
  conflictingCreatedAt: string | null | undefined,
): boolean {
  const deletedAt = deletedCreatedAt ? Date.parse(deletedCreatedAt) : Number.NaN;
  const conflictAt = conflictingCreatedAt ? Date.parse(conflictingCreatedAt) : Number.NaN;
  if (!Number.isFinite(deletedAt) || !Number.isFinite(conflictAt)) return true;
  return conflictAt > deletedAt;
}

export function formatSaleRestoreNumberNote(plan: {
  keepOriginal: boolean;
  originalNumber: string;
  reassignedNumber: string;
  saleDate?: string | null;
}): string {
  const dateBit = plan.saleDate ? ` dated ${String(plan.saleDate).slice(0, 10)}` : "";
  if (plan.keepOriginal) {
    return `Restored ${plan.originalNumber}${dateBit}. A newer bill had reused that number and is now ${plan.reassignedNumber}.`;
  }
  return `Restored as ${plan.reassignedNumber}${dateBit} because ${plan.originalNumber} is already used by another bill.`;
}

export function friendlySaleNumberRestoreError(originalNumber?: string | null): string {
  const n = String(originalNumber || "").trim();
  if (n) {
    return `Cannot restore ${n}: that bill number is already used by an active invoice. Try Restore again — the app will keep this bill's original date and free the number.`;
  }
  return "Cannot restore: that bill number is already used by an active invoice. Try Restore again.";
}

export type SaleRestoreNumberNote = string | null;

type SaleRestoreRow = {
  id: string;
  organization_id: string;
  sale_number: string | null;
  sale_date: string | null;
  sale_type: string | null;
  created_at: string | null;
  deleted_at: string | null;
};

/**
 * If an active sale already owns this bill number, move one number so
 * restore_sale can undelete without hitting uq_sales_org_number_active.
 * Sale date is never changed. Rolls back the number move if `runRestore` throws.
 */
export async function withSaleRestoreNumberResolution(
  saleId: string,
  runRestore: () => Promise<void>,
): Promise<SaleRestoreNumberNote> {
  const { data: sale, error: saleErr } = await supabase
    .from("sales")
    .select("id, organization_id, sale_number, sale_date, sale_type, created_at, deleted_at")
    .eq("id", saleId)
    .maybeSingle();
  if (saleErr) throw saleErr;
  const row = sale as SaleRestoreRow | null;
  if (!row?.organization_id) {
    await runRestore();
    return null;
  }
  if (!row.deleted_at) {
    await runRestore();
    return null;
  }

  const originalNumber = String(row.sale_number || "").trim();
  if (!originalNumber) {
    await runRestore();
    return null;
  }

  const { data: conflict, error: conflictErr } = await supabase
    .from("sales")
    .select("id, created_at, sale_number")
    .eq("organization_id", row.organization_id)
    .eq("sale_number", originalNumber)
    .is("deleted_at", null)
    .neq("id", saleId)
    .maybeSingle();
  if (conflictErr) throw conflictErr;
  if (!conflict) {
    await runRestore();
    return null;
  }

  const { data: settingsRow } = await supabase
    .from("settings")
    .select("sale_settings")
    .eq("organization_id", row.organization_id)
    .maybeSingle();
  const saleSettings = (settingsRow?.sale_settings ?? null) as Record<string, unknown> | null;
  const nextNumber = await generateOrgSaleNumber(
    row.organization_id,
    saleSettings,
    saleRestoreNumberKind(row.sale_type),
  );

  let keepOriginal = shouldKeepOriginalSaleNumber(row.created_at, conflict.created_at);
  let movedId = keepOriginal ? conflict.id : saleId;
  const movedWasDeleted = !keepOriginal;

  const applyMove = async (id: string, number: string, onlyDeleted: boolean) => {
    let q = supabase
      .from("sales")
      .update({ sale_number: number })
      .eq("id", id)
      .eq("organization_id", row.organization_id);
    q = onlyDeleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
    return q;
  };

  let { error: moveErr } = await applyMove(movedId, nextNumber, movedWasDeleted);
  if (moveErr && keepOriginal) {
    keepOriginal = false;
    movedId = saleId;
    ({ error: moveErr } = await applyMove(movedId, nextNumber, true));
  }
  if (moveErr) throw moveErr;

  try {
    await runRestore();
  } catch (err) {
    await applyMove(movedId, originalNumber, keepOriginal ? false : true);
    throw err;
  }

  return formatSaleRestoreNumberNote({
    keepOriginal,
    originalNumber,
    reassignedNumber: nextNumber,
    saleDate: row.sale_date,
  });
}
