import { describe, expect, it } from "vitest";
import {
  isMissingSaleOrderNumberRpc,
  isSaleOrderNumberConflict,
  saleOrderFyPrefixIst,
} from "./saleOrderNumber";

describe("isSaleOrderNumberConflict", () => {
  it("matches the sale_orders unique on order_number", () => {
    expect(
      isSaleOrderNumberConflict({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "sale_orders_organization_order_number_key"',
      }),
    ).toBe(true);
  });

  it("does not treat sale_order_items unique failures as an order-number conflict", () => {
    expect(
      isSaleOrderNumberConflict({
        code: "23505",
        message: 'duplicate key value violates unique constraint "sale_order_items_pkey"',
      }),
    ).toBe(false);
  });

  it("ignores non-unique errors", () => {
    expect(isSaleOrderNumberConflict({ code: "42501", message: "Not authorized" })).toBe(false);
    expect(isSaleOrderNumberConflict(null)).toBe(false);
  });
});

describe("isMissingSaleOrderNumberRpc", () => {
  it("detects PostgREST missing-function codes so preview can fall back until SQL is applied", () => {
    expect(isMissingSaleOrderNumberRpc({ code: "PGRST202", message: "Could not find the function" })).toBe(
      true,
    );
    expect(isMissingSaleOrderNumberRpc({ code: "42883", message: "function does not exist" })).toBe(true);
    expect(isMissingSaleOrderNumberRpc({ code: "23505", message: "duplicate key" })).toBe(false);
  });
});

describe("saleOrderFyPrefixIst", () => {
  it("uses IST April–March like generate_sale_order_number", () => {
    expect(saleOrderFyPrefixIst(new Date("2026-06-15T12:00:00Z"))).toBe("SO/26-27/");
    expect(saleOrderFyPrefixIst(new Date("2026-01-15T12:00:00Z"))).toBe("SO/25-26/");
  });
});
