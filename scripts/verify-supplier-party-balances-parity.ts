/**
 * Parity gate: get_supplier_party_balances RPC vs fetchSupplierBalanceSnapshotsForOrg (canonical TS).
 *
 * Usage:
 *   npx tsx scripts/verify-supplier-party-balances-parity.ts
 *   npx tsx scripts/verify-supplier-party-balances-parity.ts --org 3fdca631-1e0c-4417-9704-421f5129ff67
 *
 * Requires .env with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or service role).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { fetchSupplierBalanceSnapshotsForOrg } from "../src/utils/supplierBalanceUtils";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const DEFAULT_ORG = "3fdca631-1e0c-4417-9704-421f5129ff67";

const SIGNOFF_NAMES = [
  /srk\s*telelink/i,
  /telelink/i,
];

function parseOrgId(): string {
  const idx = process.argv.indexOf("--org");
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return DEFAULT_ORG;
}

type RpcRow = {
  supplier_id: string;
  supplier_name: string;
  signed_balance: number;
  direction: string;
  total_cr: number;
  total_dr: number;
  net_payable: number;
};

async function fetchAllRpcRows(supabase: ReturnType<typeof createClient>, orgId: string): Promise<RpcRow[]> {
  const rows: RpcRow[] = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.rpc("get_supplier_party_balances", {
      p_organization_id: orgId,
    }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    const chunk = (data ?? []) as RpcRow[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error("Missing VITE_SUPABASE_URL or API key in environment.");
    process.exit(1);
  }

  const orgId = parseOrgId();
  const supabase = createClient(url, key);

  const { data: fnCheck, error: fnErr } = await supabase.rpc("get_supplier_party_balances", {
    p_organization_id: orgId,
  }).limit(1);
  if (fnErr) {
    console.error("RPC not available — apply migration 20260910120000_get_supplier_party_balances.sql first.");
    console.error(fnErr.message);
    process.exit(1);
  }
  void fnCheck;

  console.log(`\nSupplier party balance parity — org ${orgId}\n`);

  const [rpcRows, canonMap] = await Promise.all([
    fetchAllRpcRows(supabase, orgId),
    fetchSupplierBalanceSnapshotsForOrg(supabase, orgId),
  ]);

  const drifts: {
    name: string;
    id: string;
    rpc: number;
    canon: number;
    drift: number;
  }[] = [];

  const rpcById = new Map(rpcRows.map((r) => [r.supplier_id, r]));
  const allIds = new Set([...rpcById.keys(), ...canonMap.keys()]);

  for (const id of allIds) {
    const rpc = rpcById.get(id);
    const canon = canonMap.get(id);
    const rpcBal = Number(rpc?.signed_balance ?? 0);
    const canonBal = Number(canon?.balance ?? 0);
    const drift = Math.round((rpcBal - canonBal) * 100) / 100;
    if (Math.abs(drift) > 0.01) {
      drifts.push({
        id,
        name: rpc?.supplier_name ?? canon?.supplierId ?? id,
        rpc: rpcBal,
        canon: canonBal,
        drift,
      });
    }
  }

  console.log(`RPC rows: ${rpcRows.length} | Canonical snapshots: ${canonMap.size}`);

  if (rpcRows.length > 0) {
    const first = rpcRows[0];
    console.log(
      `Grand totals — payable Cr: ${first.total_cr}, advance Dr: ${first.total_dr}, net: ${first.net_payable}`,
    );
  }

  console.log("\n--- Sign-off suppliers ---");
  for (const row of rpcRows) {
    if (SIGNOFF_NAMES.some((re) => re.test(row.supplier_name))) {
      const canon = canonMap.get(row.supplier_id);
      const canonBal = Number(canon?.balance ?? 0);
      const drift = Math.round((row.signed_balance - canonBal) * 100) / 100;
      const ok = Math.abs(drift) <= 0.01 ? "OK" : "DRIFT";
      console.log(
        `  [${ok}] ${row.supplier_name}: RPC=${row.signed_balance} canon=${canonBal} drift=${drift} dir=${row.direction}`,
      );
      if (canon) {
        console.log(
          `       components: purchases=${canon.totalPurchases} paid=${canon.totalPaid} cnNet=${canon.totalCreditNotesNet} unrefRet=${canon.unreflectedReturns} refunds=${canon.refundsReceived}`,
        );
      }
    }
  }

  const payable = rpcRows.filter((r) => r.signed_balance > 0.5).slice(0, 3);
  const advance = rpcRows.filter((r) => r.signed_balance < -0.5).slice(0, 3);
  console.log("\n--- Sample payable (Cr) ---");
  for (const row of payable) {
    const canon = canonMap.get(row.supplier_id);
    const drift = Math.round((row.signed_balance - Number(canon?.balance ?? 0)) * 100) / 100;
    console.log(`  ${row.supplier_name}: RPC=${row.signed_balance} canon=${canon?.balance ?? 0} drift=${drift}`);
  }
  console.log("\n--- Sample advance (Dr) ---");
  for (const row of advance) {
    const canon = canonMap.get(row.supplier_id);
    const drift = Math.round((row.signed_balance - Number(canon?.balance ?? 0)) * 100) / 100;
    console.log(`  ${row.supplier_name}: RPC=${row.signed_balance} canon=${canon?.balance ?? 0} drift=${drift}`);
  }

  if (drifts.length === 0) {
    console.log("\n✓ PARITY PASSED — zero drift across all suppliers.\n");
    process.exit(0);
  }

  console.log(`\n✗ PARITY FAILED — ${drifts.length} supplier(s) with |drift| > 0.01:\n`);
  drifts
    .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))
    .slice(0, 30)
    .forEach((d) => {
      console.log(`  ${d.name}: RPC=${d.rpc} canon=${d.canon} drift=${d.drift}`);
    });
  if (drifts.length > 30) console.log(`  … and ${drifts.length - 30} more`);
  console.log("");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
