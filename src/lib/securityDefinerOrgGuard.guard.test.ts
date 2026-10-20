/**
 * SECURITY DEFINER functions skip Row Level Security. The 27 Sep 2026 guard pass
 * (20261231120100) put a shop check into every one that takes a shop or record id,
 * but a later CREATE OR REPLACE writes the body without it, and the
 * revoke_public_execute_on_new_functions event trigger then grants EXECUTE to every
 * logged-in user again. October's stock transfer SQL did exactly that to
 * reset_stock_from_transactions (any user could reset another shop's stock).
 *
 * Every function (re)defined after the guard pass must check membership itself,
 * revoke EXECUTE from authenticated, or be named in the re-guard migration.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS = join(root, "supabase/migrations");
const GUARD_PASS = "20261231120100_security_org_guards_on_definer_functions.sql";
const REGUARD = "20270211120000_security_reguard_october_definer_functions.sql";

/** Called by logged-out website / login pages on purpose; they scope by slug themselves. */
const PUBLIC_BY_DESIGN = new Set([
  "submit_public_storefront_enquiry",
  "get_public_storefront_customer_perks",
  "check_public_storefront_offer_code",
]);

const ID_PARAM =
  /\b(p_organization_id|p_org_id|p_org|p_sale_id|p_bill_id|p_return_id|p_voucher_id|p_order_id|p_quotation_id|p_challan_id|p_product_id|p_target_product_id|p_source_product_id|p_supplier_id|p_target_supplier_id|p_source_supplier_id|p_customer_id|p_variant_id|p_advance_id|p_payment_link_id)\s+uuid\b/i;
const MEMBERSHIP_CHECK =
  /organization_members|user_belongs_to_org|get_user_organization_ids|has_org_role|is_org_admin|_assert_org_access|_assert_row_org_access|assert_org_member|platform_admin/i;
const FUNCTION_DEF =
  /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\)\s*returns([\s\S]*?)(\$\w*\$)([\s\S]*?)\4([\s\S]*?);/gi;

type Def = { file: string; args: string; header: string; body: string };

function latestDefinitions(files: string[]): Map<string, Def> {
  const defs = new Map<string, Def>();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const m of sql.matchAll(FUNCTION_DEF)) {
      defs.set(m[1].toLowerCase(), { file, args: m[2], header: `${m[3]} ${m[6]}`, body: m[5] });
    }
  }
  return defs;
}

describe("SECURITY DEFINER functions keep their shop check", () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  const defs = latestDefinitions(files);
  const reguardSql = readFileSync(join(MIGRATIONS, REGUARD), "utf8");

  it("every definer function with a shop/record id defined after the guard pass is guarded or not callable", () => {
    const unguarded: string[] = [];
    for (const [name, def] of defs) {
      if (def.file <= GUARD_PASS) continue;
      if (!/security\s+definer/i.test(def.header)) continue;
      if (/returns\s+trigger/i.test(`returns${def.header}`)) continue;
      if (!ID_PARAM.test(def.args)) continue;
      if (MEMBERSHIP_CHECK.test(def.body) || PUBLIC_BY_DESIGN.has(name)) continue;
      if (reguardSql.includes(`'${name}'`)) continue;
      const revokedFromUsers = files
        .filter((f) => f >= def.file)
        .some((f) =>
          new RegExp(`revoke[^;]*\\b${name}\\b[^;]*from[^;]*\\bauthenticated\\b`, "i").test(
            readFileSync(join(MIGRATIONS, f), "utf8"),
          ),
        );
      if (!revokedFromUsers) unguarded.push(`${name} (${def.file})`);
    }
    expect(unguarded).toEqual([]);
  });

  it("re-guard migration guards reset_stock_from_transactions by the caller's shop", () => {
    expect(reguardSql).toContain("PERFORM public._assert_org_access(p_organization_id);");
    expect(reguardSql).toMatch(/p\.proname = 'reset_stock_from_transactions'/);
  });
});
