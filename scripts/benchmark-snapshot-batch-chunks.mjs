/**
 * Benchmark get_customer_financial_snapshot_batch at various chunk sizes (authenticated).
 * Uses SUPABASE_ACCESS_TOKEN + ORG_ID. Helps pick client chunk size under 8s timeout.
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
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const orgId = process.env.ORG_ID || "3fdca631-1e0c-4417-9704-421f5129ff67";
const chunkSizes = (process.env.CHUNK_SIZES || "10,25,50,100,150,200")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);

if (!url || !key || !token) {
  console.error("Need VITE_SUPABASE_URL, publishable key, SUPABASE_ACCESS_TOKEN");
  process.exit(2);
}

const supabase = createClient(url, key, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchCustomerIds() {
  const ids = new Set();
  const tables = [
    { table: "sales", col: "customer_id", deleted: true },
    { table: "customer_advances", col: "customer_id", deleted: false },
    { table: "sale_returns", col: "customer_id", deleted: true },
    { table: "customer_balance_adjustments", col: "customer_id", deleted: false },
  ];
  for (const { table, col, deleted } of tables) {
    let q = supabase.from(table).select(col).eq("organization_id", orgId).not(col, "is", null);
    if (deleted) q = q.is("deleted_at", null);
    const { data, error } = await q;
    if (error) throw error;
    for (const row of data || []) if (row[col]) ids.add(row[col]);
  }
  const { data: vouchers } = await supabase
    .from("voucher_entries")
    .select("reference_id")
    .eq("organization_id", orgId)
    .eq("reference_type", "customer")
    .not("reference_id", "is", null);
  for (const row of vouchers || []) if (row.reference_id) ids.add(row.reference_id);

  const { data: ob } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .neq("opening_balance", 0);
  for (const row of ob || []) if (row.id) ids.add(row.id);

  return [...ids];
}

async function timeBatch(ids, chunkSize) {
  const t0 = Date.now();
  let calls = 0;
  let rows = 0;
  let maxChunkMs = 0;
  let slowestChunk = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const c0 = Date.now();
    const { data, error } = await supabase.rpc("get_customer_financial_snapshot_batch", {
      p_organization_id: orgId,
      p_customer_ids: chunk,
    });
    const cMs = Date.now() - c0;
    if (error) {
      return { ok: false, error: error.message, calls, chunkSize, elapsedMs: Date.now() - t0 };
    }
    calls += 1;
    rows += (data || []).length;
    if (cMs > maxChunkMs) {
      maxChunkMs = cMs;
      slowestChunk = chunk.length;
    }
  }
  return {
    ok: true,
    chunkSize,
    customers: ids.length,
    calls,
    rows,
    totalMs: Date.now() - t0,
    maxChunkMs,
    slowestChunk,
    avgChunkMs: Math.round((Date.now() - t0) / calls),
  };
}

async function timeSnapshotAll() {
  const t0 = Date.now();
  const { data, error } = await supabase.rpc("get_customer_financial_snapshot_all", {
    p_organization_id: orgId,
  });
  const ms = Date.now() - t0;
  if (error) return { ok: false, ms, error: error.message };
  return { ok: true, ms, rows: (data || []).length };
}

console.log("Org:", orgId);
const ids = await fetchCustomerIds();
console.log("financial-activity customers:", ids.length);

const allResult = await timeSnapshotAll();
console.log("\nsnapshot_all (single RPC):", allResult);

console.log("\nBatch chunk benchmark:");
for (const size of chunkSizes) {
  const r = await timeBatch(ids, size);
  console.log(JSON.stringify(r));
  if (!r.ok) break;
}
