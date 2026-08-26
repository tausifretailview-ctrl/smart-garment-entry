/**
 * Real-org equivalence: client segment index vs get_customer_segment_counts
 * and get_customer_segment_index. Exit 0 on match; non-zero on divergence.
 *
 * Env (URL/key load from .env if present):
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY,
 *   SUPABASE_ACCESS_TOKEN (signed-in user JWT — session access_token, NOT Supabase
 *     account PAT from dashboard/account/tokens), ORG_ID
 *
 * PowerShell:
 *   $env:SUPABASE_ACCESS_TOKEN="…"; $env:ORG_ID="…"; node scripts/prove-customer-segment-equivalence.mjs
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
const orgId = process.env.ORG_ID;

if (!url || !key || !token || !orgId) {
  console.error(
    "Missing env. Need VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (from .env),\n" +
      "plus SUPABASE_ACCESS_TOKEN (signed-in user JWT) and ORG_ID.",
  );
  process.exit(2);
}

const supabase = createClient(url, key, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE = 1000;
const RULES = { vipRecencyDays: 90, riskRecencyDays: 365, vipMinOrders: 5, vipMinRevenue: 50_000 };

function daysSince(ymd) {
  const t = new Date(ymd + "T12:00:00").getTime();
  return Math.floor((Date.now() - t) / 86400000);
}

function classify(stats) {
  if (!stats?.lastSaleDate) return "regular";
  const d = daysSince(stats.lastSaleDate);
  if (d > RULES.riskRecencyDays) return "lost";
  if (d > RULES.vipRecencyDays) return "risk";
  if (stats.orders >= RULES.vipMinOrders || stats.revenue >= RULES.vipMinRevenue) return "vip";
  return "regular";
}

function shouldSkip(row) {
  if (row.is_cancelled === true) return true;
  const st = String(row.payment_status || "").toLowerCase();
  return st === "cancelled" || st === "hold";
}

async function fetchAllCustomerIds() {
  const ids = new Set();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) ids.add(r.id);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return ids;
}

async function fetchAllSales() {
  const all = [];
  let offset = 0;
  let useCancelled = true;
  for (;;) {
    const { data, error } = await supabase
      .from("sales")
      .select(
        useCancelled
          ? "customer_id, sale_date, net_amount, payment_status, is_cancelled"
          : "customer_id, sale_date, net_amount, payment_status",
      )
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .not("customer_id", "is", null)
      .order("sale_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error && useCancelled) {
      useCancelled = false;
      offset = 0;
      all.length = 0;
      continue;
    }
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function clientIndex() {
  const customerIds = await fetchAllCustomerIds();
  const sales = await fetchAllSales();
  const stats = {};
  for (const row of sales) {
    if (shouldSkip(row)) continue;
    const cid = row.customer_id;
    if (!customerIds.has(cid)) continue;
    const sd = String(row.sale_date || "").slice(0, 10);
    if (!sd) continue;
    const prev = stats[cid] || { orders: 0, revenue: 0, lastSaleDate: null };
    stats[cid] = {
      lastSaleDate: !prev.lastSaleDate || sd > prev.lastSaleDate ? sd : prev.lastSaleDate,
      orders: prev.orders + 1,
      revenue: prev.revenue + Number(row.net_amount || 0),
    };
  }
  const segments = {};
  const counts = { vip: 0, regular: 0, risk: 0, lost: 0, total: customerIds.size };
  for (const cid of customerIds) {
    const seg = classify(stats[cid]);
    segments[cid] = seg;
    counts[seg] += 1;
  }
  return { counts, segments };
}

async function main() {
  console.log("Org:", orgId);
  const client = await clientIndex();
  console.log("Client counts:", client.counts);

  const { data: countsData, error: countsErr } = await supabase.rpc(
    "get_customer_segment_counts",
    { p_org_id: orgId },
  );
  if (countsErr) throw countsErr;
  const row = Array.isArray(countsData) ? countsData[0] : countsData;
  const rpcCounts = {
    vip: Number(row?.vip_count ?? 0),
    regular: Number(row?.regular_count ?? 0),
    risk: Number(row?.risk_count ?? 0),
    lost: Number(row?.lost_count ?? 0),
  };
  rpcCounts.total = rpcCounts.vip + rpcCounts.regular + rpcCounts.risk + rpcCounts.lost;
  console.log("RPC counts:", rpcCounts);

  const countDiff = {};
  for (const k of ["vip", "regular", "risk", "lost", "total"]) {
    if (client.counts[k] !== rpcCounts[k]) {
      countDiff[k] = { client: client.counts[k], rpc: rpcCounts[k] };
    }
  }

  const { data: indexData, error: indexErr } = await supabase.rpc(
    "get_customer_segment_index",
    { p_org_id: orgId },
  );

  let segmentMismatchCount = 0;
  const samples = [];
  if (indexErr) {
    console.warn("Index RPC unavailable (migration pending?):", indexErr.message);
  } else {
    const rpcSeg = {};
    for (const r of indexData || []) {
      rpcSeg[r.customer_id] = String(r.segment || "").toLowerCase();
    }
    const ids = new Set([...Object.keys(client.segments), ...Object.keys(rpcSeg)]);
    for (const id of ids) {
      const c = client.segments[id] || "regular";
      const r = rpcSeg[id] || "regular";
      if (c !== r) {
        segmentMismatchCount += 1;
        if (samples.length < 20) samples.push({ id, client: c, rpc: r });
      }
    }
    console.log("Per-customer mismatches:", segmentMismatchCount);
    if (samples.length) console.log("Samples:", samples);
  }

  if (Object.keys(countDiff).length || segmentMismatchCount > 0) {
    console.error("DIVERGENCE — STOP. Do not prefer either side.", { countDiff, segmentMismatchCount });
    process.exit(1);
  }

  console.log("EQUIVALENT — counts (and index if available) match.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
