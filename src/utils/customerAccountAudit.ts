import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read-only per-customer integrity report sourced from `v_accounting_invariants`.
 * Never writes. Shopkeeper-facing language; contact support for repair.
 */

export type CustomerAccountAuditFinding = {
  checkName: string;
  severity: "warning" | "info";
  headline: string;
  detail: string;
  entityRef: string | null;
};

export type CustomerAccountAuditReport = {
  customerId: string;
  customerName: string;
  findings: CustomerAccountAuditFinding[];
  clean: boolean;
};

const WATCHED_CHECKS = [
  "rapid_duplicate_receipt",
  "receipts_exceed_invoice",
  "duplicate_voucher_number",
  "paid_amount_drift",
  "advance_over_application",
] as const;

function fmtInr(n: number): string {
  return `₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
}

function plainLanguageFinding(row: {
  check_name: string | null;
  detail: number | null;
  entity_ref: string | null;
}): CustomerAccountAuditFinding | null {
  const check = String(row.check_name || "");
  const ref = row.entity_ref ? String(row.entity_ref) : null;
  const detail = Number(row.detail || 0);

  if (check === "receipts_exceed_invoice") {
    return {
      checkName: check,
      severity: "warning",
      headline: ref
        ? `Invoice ${ref} has more payments than the bill amount`
        : "An invoice has more payments than its bill amount",
      detail: ref
        ? `Receipts against ${ref} exceed the invoice total` +
          (detail > 0 ? ` by about ${fmtInr(detail)}` : "") +
          `. This can happen when the same payment was entered more than once. Contact support to review — do not delete receipts yourself.`
        : `Receipts exceed an invoice total` +
          (detail > 0 ? ` by about ${fmtInr(detail)}` : "") +
          `. Contact support to review.`,
      entityRef: ref,
    };
  }

  if (check === "rapid_duplicate_receipt") {
    return {
      checkName: check,
      severity: "warning",
      headline: ref
        ? `Possible repeated payments on ${ref}`
        : "Possible repeated payments on an invoice",
      detail: ref
        ? `${ref} has payments that look like repeats of the same amount/method close together. Contact support to review which ones are genuine.`
        : `Payments look like repeats of the same amount/method. Contact support to review.`,
      entityRef: ref,
    };
  }

  if (check === "duplicate_voucher_number") {
    return {
      checkName: check,
      severity: "warning",
      headline: ref
        ? `Duplicate receipt number ${ref}`
        : "Duplicate receipt numbers found",
      detail:
        "Two or more receipts share the same voucher number. Contact support — this needs a careful fix.",
      entityRef: ref,
    };
  }

  if (check === "paid_amount_drift" || check.includes("paid") && check.includes("drift")) {
    return {
      checkName: check,
      severity: "warning",
      headline: ref
        ? `Paid amount on ${ref} does not match its receipts`
        : "An invoice paid amount does not match its receipts",
      detail:
        "The bill’s paid figure and the receipt list disagree. Contact support to reconcile — do not re-enter payments to “fix” it.",
      entityRef: ref,
    };
  }

  if (check === "advance_over_application" || check.includes("advance")) {
    return {
      checkName: check,
      severity: "warning",
      headline: ref
        ? `Advance applied beyond the bill on ${ref}`
        : "Advance applied beyond an invoice total",
      detail:
        "More advance was applied to an invoice than its net amount allows. Contact support to review.",
      entityRef: ref,
    };
  }

  // Unknown check from the view — still surface plainly.
  if (check) {
    return {
      checkName: check,
      severity: "info",
      headline: ref ? `${check.replace(/_/g, " ")} on ${ref}` : check.replace(/_/g, " "),
      detail:
        detail > 0
          ? `Detail value ${fmtInr(detail)}. Contact support if this looks wrong.`
          : "Contact support if this looks wrong.",
      entityRef: ref,
    };
  }
  return null;
}

/**
 * Scope `v_accounting_invariants` to one customer via their sale ids / sale numbers.
 * Read-only — never mutates.
 */
export async function runCustomerAccountAudit(
  client: SupabaseClient,
  params: {
    organizationId: string;
    customerId: string;
    customerName?: string;
  },
): Promise<CustomerAccountAuditReport> {
  const { organizationId, customerId } = params;
  let customerName = (params.customerName || "").trim();

  if (!customerName) {
    const { data: cust } = await client
      .from("customers")
      .select("customer_name")
      .eq("id", customerId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    customerName = String(cust?.customer_name || "").trim() || "Customer";
  }

  const { data: sales, error: salesErr } = await client
    .from("sales")
    .select("id, sale_number")
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .is("deleted_at", null);
  if (salesErr) throw salesErr;

  const saleIds = new Set((sales || []).map((s) => String(s.id)));
  const saleNumbers = new Set(
    (sales || []).map((s) => String(s.sale_number || "").trim()).filter(Boolean),
  );

  // Org-scoped pull of watched checks; filter client-side to this customer's sales.
  // View may be large — cap and filter. Prefer entity_id match, then entity_ref sale number.
  const { data: rows, error: invErr } = await client
    .from("v_accounting_invariants")
    .select("check_name, detail, entity_id, entity_ref, organization_id")
    .eq("organization_id", organizationId)
    .in("check_name", [...WATCHED_CHECKS])
    .limit(5000);
  if (invErr) throw invErr;

  const matched = (rows || []).filter((row) => {
    const eid = row.entity_id ? String(row.entity_id) : "";
    if (eid && saleIds.has(eid)) return true;
    const ref = row.entity_ref ? String(row.entity_ref) : "";
    if (!ref) return false;
    if (saleNumbers.has(ref)) return true;
    // entity_ref may be "INV/26-27/1653 · RCP/…" — match any known sale number substring carefully
    for (const sn of saleNumbers) {
      if (sn.length >= 6 && ref.includes(sn)) return true;
    }
    return false;
  });

  const findings: CustomerAccountAuditFinding[] = [];
  const seen = new Set<string>();
  for (const row of matched) {
    const finding = plainLanguageFinding(row);
    if (!finding) continue;
    const key = `${finding.checkName}|${finding.entityRef || ""}|${finding.headline}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(finding);
  }

  findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "warning" ? -1 : 1;
    return a.headline.localeCompare(b.headline);
  });

  return {
    customerId,
    customerName,
    findings,
    clean: findings.length === 0,
  };
}
