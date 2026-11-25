import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * F7 Hold saves pay_later + "hold". The pay-later guard trigger was rewritten in May/June 2026
 * and forced every pay_later bill to "pending", so held carts became unpaid credit bills and
 * customers' outstanding included carts they never bought (VELVET, Hold/26-27/2, Nov 2026).
 * The latest migration that defines the guard must keep "hold".
 */
const migrations = resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations");

describe("enforce_pay_later_zero_paid keeps held bills on hold", () => {
  it("the latest definition passes a hold bill through before forcing pending", () => {
    const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort();
    const defining = files.filter((f) =>
      /CREATE OR REPLACE FUNCTION public\.enforce_pay_later_zero_paid\(\)/.test(readFileSync(resolve(migrations, f), "utf8")),
    );
    const latest = defining[defining.length - 1];
    expect(latest).toBeDefined();
    const sql = readFileSync(resolve(migrations, latest!), "utf8");
    const holdCheck = sql.indexOf("COALESCE(NEW.payment_status, '') = 'hold'");
    expect(holdCheck).toBeGreaterThan(-1);
    expect(holdCheck).toBeLessThan(sql.indexOf("NEW.payment_status := 'pending'"));
  });
});
