/**
 * Step 3 party vs snapshot_all parity + snapshot_all timing (single org).
 * Usage: ORG_ID=uuid [ORG_LABEL=name] node scripts/step3-party-snapshot-parity.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const orgId = process.env.ORG_ID;
const label = process.env.ORG_LABEL || orgId;

if (!url || !key || !token || !orgId) {
  console.error("Need VITE_SUPABASE_URL, key, SUPABASE_ACCESS_TOKEN, ORG_ID");
  process.exit(2);
}

const supabase = createClient(url, key, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

const EPS = 0.01;

async function main() {
  console.log(`\n=== ${label} (${orgId}) ===`);

  const t0 = Date.now();
  const { data: snapRows, error: snapErr } = await supabase.rpc(
    "get_customer_financial_snapshot_all",
    { p_organization_id: orgId },
  );
  const snapMs = Date.now() - t0;

  if (snapErr) {
    console.log(`snapshot_all: FAIL ${snapMs}ms — ${snapErr.message}`);
    process.exit(1);
  }

  console.log(`snapshot_all: ${snapMs}ms (${(snapRows || []).length} rows)`);

  const t1 = Date.now();
  const { data: partyRows, error: partyErr } = await supabase.rpc(
    "get_customer_party_balances",
    { p_organization_id: orgId },
  );
  const partyMs = Date.now() - t1;

  if (partyErr) {
    console.log(`party: FAIL ${partyMs}ms — ${partyErr.message}`);
    process.exit(1);
  }

  console.log(`party RPC: ${partyMs}ms (${(partyRows || []).length} rows)`);

  const partyMap = new Map(
    (partyRows || []).map((r) => [
      r.customer_id,
      {
        signed: Number(r.signed_balance ?? 0),
        advance: Number(r.advance_available ?? 0),
        name: r.customer_name,
      },
    ]),
  );

  let diffRows = 0;
  let maxOutstanding = 0;
  let maxAdvance = 0;
  const samples = [];

  for (const row of snapRows || []) {
    const p = partyMap.get(row.customer_id);
    if (!p) continue;
    const dOut = Math.abs(Number(row.outstanding_dr ?? 0) - p.signed);
    const dAdv = Math.abs(Number(row.advance_available ?? 0) - p.advance);
    if (dOut > EPS || dAdv > EPS) {
      diffRows++;
      maxOutstanding = Math.max(maxOutstanding, dOut);
      maxAdvance = Math.max(maxAdvance, dAdv);
      if (samples.length < 5) {
        samples.push({
          name: p.name,
          party: p.signed,
          snap: Number(row.outstanding_dr ?? 0),
          dOut,
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        org_id: orgId,
        label,
        active_customers: (snapRows || []).length,
        diff_rows: diffRows,
        max_outstanding_delta: maxOutstanding,
        max_advance_delta: maxAdvance,
        snapshot_all_ms: snapMs,
        party_ms: partyMs,
      },
      null,
      2,
    ),
  );

  if (samples.length) {
    console.log("sample drifts:", samples);
  }

  process.exit(diffRows > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
