import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TAB_PAGE_REGISTRY } from "../../src/lib/tabPageRegistry";
import { computeExchangeRefundDue } from "../../src/utils/saleSettlement";
import { parseMigrationVersion } from "../../scripts/lib/schema-migration-versions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("Electron does not steal POS F5 / F11", () => {
  it("window.cjs intercepts Ctrl+R only — never F5 or F11", async () => {
    const src = await readFile(path.join(ROOT, "electron/window.cjs"), "utf8");
    expect(src).toMatch(/before-input-event/);
    expect(src).toMatch(/Do NOT intercept F5\/F11/);
    expect(src).toMatch(/input\.key === 'r' \|\| input\.key === 'R'/);
    expect(src).not.toMatch(/input\.key === ['"]F5['"]/);
    expect(src).not.toMatch(/input\.key === ['"]F11['"]/);
    expect(src).not.toMatch(/accelerator:\s*['"]F5['"]/);
  });

  it("File → Refresh App is CmdOrCtrl+R, not F5", async () => {
    const src = await readFile(path.join(ROOT, "electron/main.cjs"), "utf8");
    expect(src).toMatch(/label:\s*['"]Refresh App['"]/);
    expect(src).toMatch(/accelerator:\s*['"]CmdOrCtrl\+R['"]/);
    expect(src).not.toMatch(/accelerator:\s*['"]F5['"]/);
    expect(src).not.toMatch(/accelerator:\s*['"]F11['"]/);
  });
});

describe("purchase line-qty edit keeps the sold-qty stock floor", () => {
  it("latest handle_purchase_item_update rewrite still asserts before decreasing stock", async () => {
    const dir = path.join(ROOT, "supabase/migrations");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const rewrites: { version: string; file: string; body: string }[] = [];
    for (const file of files) {
      const version = parseMigrationVersion(file);
      if (!version) continue;
      const body = await readFile(path.join(dir, file), "utf8");
      if (!/CREATE OR REPLACE FUNCTION\s+(public\.)?handle_purchase_item_update\s*\(/i.test(body)) {
        continue;
      }
      rewrites.push({ version, file, body });
    }
    expect(rewrites.length).toBeGreaterThan(0);
    const latest = rewrites.reduce((a, b) => (a.version > b.version ? a : b));
    expect(latest.version).toBe("20261001140000");
    expect(latest.file).toBe("20261001140000_purchase_stock_floor_on_qty_decrease.sql");
    expect(latest.body).toMatch(/assert_variant_stock_decrease_allowed/);
    expect(latest.body).toMatch(/net_sold_qty_for_variant/);
  });
});

describe("POS DC does not share the POS Sales tab-cache layout", () => {
  it("pos-delivery-challan uses pos-dc, pos-sales uses pos", () => {
    expect(TAB_PAGE_REGISTRY["pos-delivery-challan"]?.layout).toBe("pos-dc");
    expect(TAB_PAGE_REGISTRY["pos-sales"]?.layout).toBe("pos");
  });

  it("TabCachedPages wraps pos-dc with PosDeliveryChallanLayout", async () => {
    const src = await readFile(path.join(ROOT, "src/components/TabCachedPages.tsx"), "utf8");
    expect(src).toMatch(/case "pos-dc":/);
    expect(src).toMatch(/<PosDeliveryChallanLayout>/);
    expect(src).toMatch(/case "pos":/);
    expect(src).toMatch(/<POSLayout>/);
  });
});

describe("POS exchange refund is not clamped to zero", () => {
  it("computeExchangeRefundDue returns the unapplied return excess", () => {
    const result = computeExchangeRefundDue({
      netAmount: -300,
      saleReturnAdjust: 500,
      explicitRefundAmount: 0,
    });
    expect(result.refundDue).toBe(300);
    expect(result.isExchangeRefund).toBe(true);
  });

  it("save-sale and POS still pass settleExcess so bill caps cannot starve the refund", async () => {
    const saveSale = await readFile(path.join(ROOT, "src/hooks/useSaveSale.tsx"), "utf8");
    const pos = await readFile(path.join(ROOT, "src/pages/POSSales.tsx"), "utf8");
    expect(saveSale).toMatch(/settleExcess/);
    expect(saveSale).toMatch(/computeExchangeRefundDue/);
    expect(pos).toMatch(/exchangeRefundDue/);
    expect(pos).toMatch(/setRefundAmount/);
  });
});
