/**
 * Real-org equivalence: get_customer_financial_snapshot_batch (chunked)
 * vs get_customer_financial_snapshot_all (set-based). Exit 0 on match.
 *
 * Env (URL/key load from .env if present):
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
 *   SUPABASE_ACCESS_TOKEN (signed-in user JWT — session access_token, NOT Supabase
 *     account PAT from dashboard/account/tokens), ORG_ID
 * Optional: ORG_ID_2, ORG_ID_3, … or ORG_IDS=comma-separated uuid list.
 *
 * PowerShell:
 *   $env:SUPABASE_ACCESS_TOKEN="…"; $env:ORG_ID="…"; node scripts/prove-snapshot-all-equivalence.mjs
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
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const orgIds = (
  process.env.ORG_IDS
    ? process.env.ORG_IDS.split(",").map((s) => s.trim()).filter(Boolean)
    : [process.env.ORG_ID, process.env.ORG_ID_2, process.env.ORG_ID_3, process.env.ORG_ID_4].filter(Boolean)
);

if (!url || !key || !token || orgIds.length === 0) {
  console.error(
    "Missing env. Need VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (from .env),\n" +
      "plus SUPABASE_ACCESS_TOKEN (signed-in user JWT) and ORG_ID.\n" +
      "Optional ORG_ID_2 / ORG_ID_3 / ORG_ID_4 or ORG_IDS=uuid,uuid,… for multi-org runs.",
  );
  process.exit(2);
}

const supabase = createClient(url, key, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE = 1000;
const BATCH_CHUNK = 10;
/** Match client normalizeRow tolerances for float fields. */
const EPS_MONEY = 0.015;
const EPS_INT = 0.5;

async function fetchCustomersWithFinancialActivity(organizationId) {
  const ids = new Set();
  const [
    salesRes,
    advancesRes,
    returnsRes,
    adjustmentsRes,
    vouchersRes,
    openingBalanceRes,
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("customer_id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("customer_id", "is", null),
    supabase
      .from("customer_advances")
      .select("customer_id")
      .eq("organization_id", organizationId)
      .not("customer_id", "is", null),
    supabase
      .from("sale_returns")
      .select("customer_id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("customer_id", "is", null),
    supabase
      .from("customer_balance_adjustments")
      .select("customer_id")
      .eq("organization_id", organizationId)
      .not("customer_id", "is", null),
    supabase
      .from("voucher_entries")
      .select("reference_id")
      .eq("organization_id", organizationId)
      .eq("reference_type", "customer")
      .not("reference_id", "is", null),
    supabase
      .from("customers")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .neq("opening_balance", 0),
  ]);

  for (const row of salesRes.data || []) if (row.customer_id) ids.add(row.customer_id);
  for (const row of advancesRes.data || []) if (row.customer_id) ids.add(row.customer_id);
  for (const row of returnsRes.data || []) if (row.customer_id) ids.add(row.customer_id);
  for (const row of adjustmentsRes.data || []) if (row.customer_id) ids.add(row.customer_id);
  for (const row of vouchersRes.data || []) if (row.reference_id) ids.add(row.reference_id);
  for (const row of openingBalanceRes.data || []) if (row.id) ids.add(row.id);

  for (const res of [
    salesRes,
    advancesRes,
    returnsRes,
    adjustmentsRes,
    vouchersRes,
    openingBalanceRes,
  ]) {
    if (res.error) throw res.error;
  }

  return [...ids];
}

async function fetchBatchMap(organizationId, customerIds) {
  const map = new Map();
  for (let i = 0; i < customerIds.length; i += BATCH_CHUNK) {
    const chunk = customerIds.slice(i, i + BATCH_CHUNK);
    const { data, error } = await supabase.rpc("get_customer_financial_snapshot_batch", {
      p_organization_id: organizationId,
      p_customer_ids: chunk,
    });
    if (error) throw error;
    for (const row of data || []) {
      if (!row?.customer_id) continue;
      map.set(row.customer_id, {
        outstanding_dr: Number(row.outstanding_dr ?? 0),
        advance_available: Number(row.advance_available ?? 0),
        cn_available_total: Number(row.cn_available_total ?? 0),
        cn_pending_count: Number(row.cn_pending_count ?? 0),
      });
    }
  }
  for (const id of customerIds) {
    if (!map.has(id)) {
      map.set(id, {
        outstanding_dr: 0,
        advance_available: 0,
        cn_available_total: 0,
        cn_pending_count: 0,
      });
    }
  }
  return map;
}

async function fetchAllMap(organizationId) {
  const { data, error } = await supabase.rpc("get_customer_financial_snapshot_all", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const map = new Map();
  for (const row of data || []) {
    if (!row?.customer_id) continue;
    map.set(row.customer_id, {
      outstanding_dr: Number(row.outstanding_dr ?? 0),
      advance_available: Number(row.advance_available ?? 0),
      cn_available_total: Number(row.cn_available_total ?? 0),
      cn_pending_count: Number(row.cn_pending_count ?? 0),
    });
  }
  return map;
}

function near(a, b, eps) {
  return Math.abs(a - b) <= eps;
}

function compareMaps(batchMap, allMap, label) {
  const fields = [
    ["outstanding_dr", EPS_INT],
    ["advance_available", EPS_MONEY],
    ["cn_available_total", EPS_MONEY],
    ["cn_pending_count", EPS_INT],
  ];
  const diffs = [];
  const ids = new Set([...batchMap.keys(), ...allMap.keys()]);

  for (const id of ids) {
    const b = batchMap.get(id);
    const a = allMap.get(id);
    if (!b) {
      diffs.push({ customer_id: id, field: "(row)", batch: null, all: a });
      continue;
    }
    if (!a) {
      diffs.push({ customer_id: id, field: "(row)", batch: b, all: null });
      continue;
    }
    for (const [field, eps] of fields) {
      if (!near(b[field], a[field], eps)) {
        diffs.push({
          customer_id: id,
          field,
          batch: b[field],
          all: a[field],
        });
      }
    }
  }

  console.log(
    `[${label}] active=${batchMap.size} all_rows=${allMap.size} diffs=${diffs.length}`,
  );
  for (const d of diffs.slice(0, 40)) {
    console.error(
      `  ${d.customer_id} ${d.field}: batch=${JSON.stringify(d.batch)} all=${JSON.stringify(d.all)}`,
    );
  }
  if (diffs.length > 40) {
    console.error(`  … and ${diffs.length - 40} more`);
  }
  return diffs.length;
}

async function proveOrg(organizationId) {
  console.log(`\n=== ORG ${organizationId} ===`);
  const t0 = Date.now();
  const ids = await fetchCustomersWithFinancialActivity(organizationId);
  console.log(`financial-activity customers: ${ids.length}`);

  const tBatch0 = Date.now();
  const batchMap = await fetchBatchMap(organizationId, ids);
  const batchMs = Date.now() - tBatch0;
  console.log(`batch path: ${batchMs}ms (${Math.ceil(ids.length / BATCH_CHUNK)} RPCs)`);

  const tAll0 = Date.now();
  const allMap = await fetchAllMap(organizationId);
  const allMs = Date.now() - tAll0;
  console.log(`snapshot_all: ${allMs}ms (1 RPC)`);

  const n = compareMaps(batchMap, allMap, organizationId);
  console.log(`wall ${Date.now() - t0}ms`);
  return n;
}

let totalDiffs = 0;
for (const orgId of orgIds) {
  try {
    totalDiffs += await proveOrg(orgId);
  } catch (err) {
    console.error(`ORG ${orgId} failed:`, err?.message || err);
    process.exit(1);
  }
}

if (totalDiffs > 0) {
  console.error(`\nFAIL: ${totalDiffs} field difference(s). Do not switch callers.`);
  process.exit(1);
}

console.log("\nOK: zero differences across", orgIds.length, "org(s).");
process.exit(0);
