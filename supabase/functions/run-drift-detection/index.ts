import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Nightly (or on-demand) settlement drift detector.
 * - Calls public.detect_settlement_drift(NULL) — read-only scan across all orgs.
 * - If any CRITICAL drift was recorded in this run, sends a WhatsApp alert to
 *   PLATFORM_ADMIN_WHATSAPP via the existing send-whatsapp function, using
 *   PLATFORM_ADMIN_ORG_ID as the sending org's WhatsApp config.
 *   If either secret is missing, the alert step is skipped (detection still runs).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminPhone = Deno.env.get("PLATFORM_ADMIN_WHATSAPP")?.trim();
  const adminOrgId = Deno.env.get("PLATFORM_ADMIN_ORG_ID")?.trim();

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { error: rpcError } = await supabase.rpc("detect_settlement_drift", {
      p_organization_id: null,
    });
    if (rpcError) throw rpcError;

    // Read the most recent run summary this function just created
    const { data: runRow, error: runErr } = await supabase
      .from("drift_detection_runs")
      .select("id, run_at, drifts_found, critical_count, duration_ms")
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (runErr) console.error("[run-drift-detection] run log read failed", runErr);

    const critical = runRow?.critical_count ?? 0;
    let alertSent = false;

    if (critical > 0 && adminPhone && adminOrgId) {
      // Which orgs have open critical drift right now?
      const { data: byOrg } = await supabase
        .from("settlement_drift_log")
        .select("organization_id")
        .eq("severity", "critical")
        .is("resolved_at", null);

      const orgIds = Array.from(new Set((byOrg || []).map((r) => r.organization_id)));
      const { data: orgs } = orgIds.length
        ? await supabase.from("organizations").select("id, name").in("id", orgIds)
        : { data: [] as { id: string; name: string }[] };
      const orgNames = (orgs || []).map((o) => o.name).sort().join(", ");

      const message =
        `⚠️ Settlement drift detected\n` +
        `${critical} critical invoice(s) across ${orgIds.length} organisation(s):\n` +
        `${orgNames}\n\n` +
        `Review in Platform Admin → Data Integrity.`;

      const { error: sendErr } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          organizationId: adminOrgId,
          phone: adminPhone,
          message,
          messageType: "text",
        },
      });
      if (sendErr) {
        console.error("[run-drift-detection] alert send failed", sendErr);
      } else {
        alertSent = true;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        run: runRow,
        alert_sent: alertSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[run-drift-detection] failed", err);
    return new Response(
      JSON.stringify({ ok: false, error: String((err as Error)?.message || err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});