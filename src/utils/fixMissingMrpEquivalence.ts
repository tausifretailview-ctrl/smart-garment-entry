import type { SupabaseClient } from "@supabase/supabase-js";

/** One purchase_items row that would receive pv.mrp. */
export type MrpBackfillRow = {
  purchaseItemId: string;
  currentMrp: number | null;
  targetMrp: number;
};

export type MrpBackfillCrossOrgRow = MrpBackfillRow & {
  billOrgId: string;
  variantOrgId: string;
};

export type FixMissingMrpEquivalenceReport = {
  organizationId: string;
  /** Safe to cut over when true (no value drift; RPC is loop-equivalent for this org). */
  passed: boolean;
  summary: string;
  loopRowCount: number;
  rpcRowCount: number;
  crossOrgRowCount: number;
  /** Loop would update these; RPC would not (expected when variant org != bill org). */
  loopOnlyRows: MrpBackfillRow[];
  /** RPC would update these; loop would not — should always be empty. */
  rpcOnlyRows: MrpBackfillRow[];
  /** Same id in both sets but different target_mrp — hard failure. */
  valueMismatches: Array<{
    purchaseItemId: string;
    loopTargetMrp: number;
    rpcTargetMrp: number;
  }>;
  crossOrgRows: MrpBackfillCrossOrgRow[];
};

const PAGE_SIZE = 1000;

function coerceMrp(value: unknown): number {
  return Number(value) || 0;
}

function normalizeRowMap(rows: MrpBackfillRow[]): Map<string, MrpBackfillRow> {
  return new Map(rows.map((row) => [row.purchaseItemId, row]));
}

/** Pure compare — unit-testable without Supabase. */
export function compareMrpBackfillRowSets(
  loopRows: MrpBackfillRow[],
  rpcRows: MrpBackfillRow[],
  crossOrgRows: MrpBackfillCrossOrgRow[],
  organizationId: string,
): FixMissingMrpEquivalenceReport {
  const loopMap = normalizeRowMap(loopRows);
  const rpcMap = normalizeRowMap(rpcRows);
  const crossOrgIds = new Set(crossOrgRows.map((row) => row.purchaseItemId));

  const loopOnlyRows: MrpBackfillRow[] = [];
  const rpcOnlyRows: MrpBackfillRow[] = [];
  const valueMismatches: FixMissingMrpEquivalenceReport["valueMismatches"] = [];

  for (const [id, loopRow] of loopMap) {
    const rpcRow = rpcMap.get(id);
    if (!rpcRow) {
      loopOnlyRows.push(loopRow);
      continue;
    }
    if (loopRow.targetMrp !== rpcRow.targetMrp) {
      valueMismatches.push({
        purchaseItemId: id,
        loopTargetMrp: loopRow.targetMrp,
        rpcTargetMrp: rpcRow.targetMrp,
      });
    }
  }

  for (const [id, rpcRow] of rpcMap) {
    if (!loopMap.has(id)) {
      rpcOnlyRows.push(rpcRow);
    }
  }

  const unexplainedLoopOnly = loopOnlyRows.filter((row) => !crossOrgIds.has(row.purchaseItemId));
  const passed = valueMismatches.length === 0 && rpcOnlyRows.length === 0 && unexplainedLoopOnly.length === 0;

  let summary: string;
  if (passed) {
    if (crossOrgRows.length > 0) {
      summary =
        `Match: ${rpcRowCountSummary(rpcRows.length)} RPC rows = loop minus ${crossOrgRows.length} cross-org SKU row(s) (intentional org hardening).`;
    } else {
      summary = `Match: ${rpcRowCountSummary(rpcRows.length)} row(s); loop and RPC agree for this org.`;
    }
  } else {
    const parts: string[] = [];
    if (valueMismatches.length > 0) {
      parts.push(`${valueMismatches.length} value mismatch(es)`);
    }
    if (rpcOnlyRows.length > 0) {
      parts.push(`${rpcOnlyRows.length} RPC-only row(s)`);
    }
    if (unexplainedLoopOnly.length > 0) {
      parts.push(`${unexplainedLoopOnly.length} loop-only row(s) not explained by cross-org SKUs`);
    }
    summary = `Mismatch: ${parts.join("; ")}. See console for details.`;
  }

  return {
    organizationId,
    passed,
    summary,
    loopRowCount: loopRows.length,
    rpcRowCount: rpcRows.length,
    crossOrgRowCount: crossOrgRows.length,
    loopOnlyRows,
    rpcOnlyRows,
    valueMismatches,
    crossOrgRows,
  };
}

function rpcRowCountSummary(count: number): string {
  return count === 1 ? "1" : String(count);
}

/**
 * Org-scoped simulation of handleFixMissingMrp loop logic (paginated, no 1000-row cap).
 * Mirrors the JS filter: skip item mrp > 0; skip master mrp <= 0.
 */
export async function fetchLoopEquivalentMrpBackfillRows(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<MrpBackfillRow[]> {
  const rows: MrpBackfillRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("purchase_items")
      .select(
        `
        id,
        mrp,
        product_variants!inner (
          mrp
        ),
        purchase_bills!inner (
          organization_id
        )
      `,
      )
      .eq("purchase_bills.organization_id", organizationId)
      .or("mrp.is.null,mrp.eq.0")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.length) {
      break;
    }

    for (const item of data) {
      const itemMrp = coerceMrp(item.mrp);
      if (itemMrp > 0) continue;

      const variant = item.product_variants as { mrp?: unknown } | null;
      const masterMrp = coerceMrp(variant?.mrp);
      if (masterMrp <= 0) continue;

      rows.push({
        purchaseItemId: item.id,
        currentMrp: item.mrp == null ? null : coerceMrp(item.mrp),
        targetMrp: masterMrp,
      });
    }

    if (data.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return rows;
}

export async function fetchRpcPreviewMrpBackfillRows(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<MrpBackfillRow[]> {
  const { data, error } = await supabase.rpc("preview_fix_missing_mrp_for_org", {
    p_org_id: organizationId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row: { purchase_item_id: string; current_mrp: unknown; target_mrp: unknown }) => ({
    purchaseItemId: row.purchase_item_id,
    currentMrp: row.current_mrp == null ? null : coerceMrp(row.current_mrp),
    targetMrp: coerceMrp(row.target_mrp),
  }));
}

export async function fetchCrossOrgMrpBackfillRows(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<MrpBackfillCrossOrgRow[]> {
  const { data, error } = await supabase.rpc("preview_fix_missing_mrp_cross_org_for_org", {
    p_org_id: organizationId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(
    (row: {
      purchase_item_id: string;
      bill_org_id: string;
      variant_org_id: string;
      current_mrp: unknown;
      target_mrp: unknown;
    }) => ({
      purchaseItemId: row.purchase_item_id,
      billOrgId: row.bill_org_id,
      variantOrgId: row.variant_org_id,
      currentMrp: row.current_mrp == null ? null : coerceMrp(row.current_mrp),
      targetMrp: coerceMrp(row.target_mrp),
    }),
  );
}

/** Phase 2 dry-run: compare loop simulation vs preview RPC for one org. Does not write. */
export async function runFixMissingMrpEquivalenceCheck(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<FixMissingMrpEquivalenceReport> {
  if (!organizationId) {
    throw new Error("organization_id is required");
  }

  const [loopRows, rpcRows, crossOrgRows] = await Promise.all([
    fetchLoopEquivalentMrpBackfillRows(supabase, organizationId),
    fetchRpcPreviewMrpBackfillRows(supabase, organizationId),
    fetchCrossOrgMrpBackfillRows(supabase, organizationId),
  ]);

  return compareMrpBackfillRowSets(loopRows, rpcRows, crossOrgRows, organizationId);
}
