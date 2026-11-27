import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Stock Transfer accept (Nov 2026): an item the receiving shop already had kept its old sale
 * price, so a scan there showed the price from before the sender edited the purchase bill.
 */
const sql = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../supabase/migrations/20270603120000_stock_transfer_accept_sender_price.sql",
  ),
  "utf8",
);
const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../pages/StockTransfer.tsx"), "utf8");

describe("accept_stock_transfer takes the sender's price", () => {
  it("an existing item is set to the sender's sale price and MRP, not its purchase price", () => {
    expect(sql).toContain("IF NOT v_created AND COALESCE(v_src.sale_price, 0) > 0 THEN");
    const update = sql.slice(sql.indexOf("IF NOT v_created AND"), sql.indexOf("END IF;", sql.indexOf("IF NOT v_created AND")));
    expect(update).toContain("SET sale_price = v_src.sale_price");
    expect(update).toMatch(/mrp = CASE WHEN COALESCE\(v_src\.mrp, 0\) > 0/);
    expect(update).not.toMatch(/pur_price\s*=/);
  });

  it("among price tiers of one barcode, the one at the sender's price receives the stock", () => {
    expect(sql).toContain("(pv.sale_price IS NOT DISTINCT FROM v_src.sale_price) DESC,");
  });

  it("keeps the permissions and the receiving-shop check", () => {
    expect(sql).toContain("public._stock_transfer_can_receive(v_uid, v_t.to_organization_id)");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.accept_stock_transfer(uuid) FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.accept_stock_transfer(uuid) TO authenticated;");
  });

  it("the screen says how many prices changed and reloads product lists", () => {
    expect(sql).toContain("'prices_updated', v_price_updates");
    expect(page).toContain("res.prices_updated");
    expect(page).toContain('queryKey: ["pos-products"]');
  });
});
