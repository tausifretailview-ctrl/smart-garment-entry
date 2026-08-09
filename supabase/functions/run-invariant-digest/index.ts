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
 * 3. Sends a WhatsApp digest to PLATFORM_ADMIN_WHATSAPP reporting CHANGE, not
 *    just totals (a flat 706 is noise; 706 -> 712 is a live regression), with a
 *    per-organisation breakdown for anything that moved.
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
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

    let alertSent = false;
    if (adminPhone && adminOrgId && (totals.violations > 0 || regressions.length > 0)) {
      const lines: string[] = [];
      lines.push(
        regressions.length > 0
          ? "🚨 Accounting invariants — NEW violations today"
          : "📋 Accounting invariants — daily digest",
      );
      lines.push("");
      for (const [name, e] of [...byCheck.entries()].sort((a, b) => b[1].delta - a[1].delta || b[1].count - a[1].count)) {
        const arrow = e.delta > 0 ? `▲ +${e.delta}` : e.delta < 0 ? `▼ ${e.delta}` : "· 0";
        lines.push(`${name}: ${e.count} (${arrow} vs prev ${e.prev})`);
      }
      if (regressions.length > 0) {
        lines.push("");
        lines.push("New today, by organisation:");
        for (const r of regressions.slice(0, 15)) {
          lines.push(`• ${r.organization_name || "unassigned"} — ${r.check_name} +${r.delta} (now ${r.violation_count})`);
        }
        if (regressions.length > 15) lines.push(`…and ${regressions.length - 15} more`);
      }
      lines.push("");
      lines.push("Platform Admin → Data Integrity → Invariants.");

      const { error: sendErr } = await supabase.functions.invoke("send-whatsapp", {
        body: { organizationId: adminOrgId, phone: adminPhone, message: lines.join("\n"), messageType: "text" },
      });
      if (sendErr) console.error("[run-invariant-digest] alert send failed", sendErr);
      else alertSent = true;
    }

    return new Response(
      JSON.stringify({ ok: true, snapshot: snap, totals, checks: Object.fromEntries(byCheck), regressions: regressions.length, alert_sent: alertSent }),
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
