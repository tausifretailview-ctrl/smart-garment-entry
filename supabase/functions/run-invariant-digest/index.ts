import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Daily accounting-invariant digest.
 * 1. Snapshots public.v_accounting_invariants into invariant_daily_snapshot.
 * 2. Reads get_invariant_digest() — today's counts vs the previous snapshot.
 * 3. Emails INTEGRITY_DIGEST_EMAIL_TO when configured (change + open totals).
 * 4. WhatsApps PLATFORM_ADMIN_WHATSAPP whenever paid_diverges_from_receipts has a
 *    non-zero absolute count (not only delta) — understated/overstated paid after
 *    bulk repairs must reach a person within a day even if other checks are flat.
 * Detection always runs even if the alert step is skipped or fails.
 */
type DigestRow = {
  check_name: string;
  organization_id: string | null;
  organization_name: string | null;
  violation_count: number;
  total_detail: number;
  prev_count: number;
  delta: number;
};

type MismatchOrg = {
  organization_id: string;
  organization_name: string | null;
  failing_count: number;
  total_abs_discrepancy: number;
  worst_rows?: Array<{
    sale_number: string | null;
    recorded_paid: number;
    expected_paid: number;
    discrepancy: number;
  }>;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const mailTo = Deno.env.get("INTEGRITY_DIGEST_EMAIL_TO")?.trim();
  const mailFrom = Deno.env.get("INTEGRITY_DIGEST_EMAIL_FROM")?.trim() || "onboarding@resend.dev";
  const adminPhone = Deno.env.get("PLATFORM_ADMIN_WHATSAPP")?.trim();
  const adminOrgId = Deno.env.get("PLATFORM_ADMIN_ORG_ID")?.trim();

  try {
    const { data: snap, error: snapErr } = await supabase.rpc("snapshot_accounting_invariants", {});
    if (snapErr) throw snapErr;

    const { data, error } = await supabase.rpc("get_invariant_digest", {});
    if (error) throw error;
    const rows = ((data || []) as DigestRow[]);

    // Roll up per check across orgs.
    const byCheck = new Map<string, { count: number; prev: number; delta: number; orgs: number }>();
    for (const r of rows) {
      const e = byCheck.get(r.check_name) || { count: 0, prev: 0, delta: 0, orgs: 0 };
      e.count += Number(r.violation_count || 0);
      e.prev += Number(r.prev_count || 0);
      e.delta += Number(r.delta || 0);
      if (Number(r.violation_count || 0) > 0) e.orgs += 1;
      byCheck.set(r.check_name, e);
    }

    const totals = {
      violations: [...byCheck.values()].reduce((s, e) => s + e.count, 0),
      delta: [...byCheck.values()].reduce((s, e) => s + e.delta, 0),
    };
    const regressions = rows.filter((r) => Number(r.delta || 0) > 0);
    const paidMismatch = byCheck.get("paid_diverges_from_receipts");
    const paidMismatchCount = paidMismatch?.count ?? 0;

    let paidDigest: {
      total_failing?: number;
      organizations?: MismatchOrg[];
    } | null = null;
    if (paidMismatchCount > 0) {
      const { data: dig, error: digErr } = await supabase.rpc(
        "get_paid_settlement_mismatch_digest",
        {},
      );
      if (digErr) {
        console.error("[run-invariant-digest] paid mismatch digest failed", digErr);
      } else {
        paidDigest = dig as typeof paidDigest;
      }
    }

    let alertSent = false;
    let alertSkippedReason: string | null = null;
    let whatsappSent = false;
    let whatsappSkippedReason: string | null = null;

    if (!resendKey || !mailTo) {
      alertSkippedReason = "RESEND_API_KEY or INTEGRITY_DIGEST_EMAIL_TO not configured";
    } else {
      const lines: string[] = [];
      if (paidMismatchCount > 0) {
        lines.push(
          `PAID vs SETTLEMENT MISMATCH: ${paidMismatchCount} invoice(s) — paid_amount ≠ compute_sale_settlement`,
        );
        lines.push("");
        for (const org of (paidDigest?.organizations || []).slice(0, 20)) {
          lines.push(
            `${org.organization_name || org.organization_id}: ${org.failing_count} rows, ₹${org.total_abs_discrepancy} abs`,
          );
          for (const w of (org.worst_rows || []).slice(0, 5)) {
            lines.push(
              `  - ${w.sale_number}: recorded ${w.recorded_paid} expected ${w.expected_paid} (Δ ${w.discrepancy})`,
            );
          }
        }
        lines.push("");
      }
      lines.push(
        regressions.length > 0
          ? "NEW violations today"
          : "No new violations since the previous snapshot",
      );
      lines.push("");
      for (const [name, e] of [...byCheck.entries()].sort((a, b) => b[1].delta - a[1].delta || b[1].count - a[1].count)) {
        const arrow = e.delta > 0 ? `+${e.delta}` : e.delta < 0 ? `${e.delta}` : "0";
        lines.push(`${name}: ${e.count} (${arrow} vs prev ${e.prev})`);
      }
      if (regressions.length > 0) {
        lines.push("");
        lines.push("New today, by organisation:");
        for (const r of regressions.slice(0, 50)) {
          lines.push(`- ${r.organization_name || "unassigned"} | ${r.check_name} +${r.delta} (now ${r.violation_count})`);
        }
        if (regressions.length > 50) lines.push(`...and ${regressions.length - 50} more`);
      }
      lines.push("");
      lines.push("Platform Admin > Data Integrity > Invariants.");

      const subject =
        paidMismatchCount > 0
          ? `[EzzyERP] PAID SETTLEMENT MISMATCH: ${paidMismatchCount} open`
          : regressions.length > 0
          ? `[EzzyERP] Accounting invariants: +${totals.delta} new (${totals.violations} open)`
          : `[EzzyERP] Accounting invariants: ${totals.violations} open, no change`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: mailFrom,
          to: mailTo.split(",").map((s) => s.trim()).filter(Boolean),
          subject,
          text: lines.join("\n"),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        alertSkippedReason = `email send failed [${res.status}]: ${body}`;
        console.error("[run-invariant-digest]", alertSkippedReason);
      } else {
        alertSent = true;
      }
    }

    // Absolute non-zero for paid settlement — do not wait for a delta vs yesterday.
    if (paidMismatchCount > 0) {
      if (!adminPhone || !adminOrgId) {
        whatsappSkippedReason =
          "PLATFORM_ADMIN_WHATSAPP or PLATFORM_ADMIN_ORG_ID not configured";
      } else {
        const orgLines = (paidDigest?.organizations || [])
          .slice(0, 8)
          .map(
            (o) =>
              `${o.organization_name || "org"}: ${o.failing_count} (₹${o.total_abs_discrepancy})`,
          )
          .join("\n");
        const message =
          `⚠️ Paid amount ≠ settlement\n` +
          `${paidMismatchCount} invoice(s) where paid_amount ≠ compute_sale_settlement\n` +
          `${orgLines}\n\n` +
          `Open Platform Admin → Data Integrity → Invariants.\n` +
          `Do not bulk-repair money rows until dry-run + hand-check protocol is followed.`;

        const { error: sendErr } = await supabase.functions.invoke("send-whatsapp", {
          body: {
            organizationId: adminOrgId,
            phone: adminPhone,
            message,
            messageType: "text",
          },
        });
        if (sendErr) {
          whatsappSkippedReason = String(sendErr.message || sendErr);
          console.error("[run-invariant-digest] WhatsApp failed", sendErr);
        } else {
          whatsappSent = true;
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        snapshot: snap,
        totals,
        checks: Object.fromEntries(byCheck),
        regressions: regressions.length,
        paid_settlement_mismatches: paidMismatchCount,
        paid_digest: paidDigest,
        alert_sent: alertSent,
        alert_skipped_reason: alertSkippedReason,
        whatsapp_sent: whatsappSent,
        whatsapp_skipped_reason: whatsappSkippedReason,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[run-invariant-digest] failed", err);
    return new Response(JSON.stringify({ ok: false, error: String((err as Error)?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
