import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import {
  insertProductsPreferringPurchaseFlag,
  isMissingCreatedInPurchaseColumn,
  omitCreatedInPurchaseField,
} from "./productCreatedInPurchaseColumn";

const SCHEMA_CACHE_ERROR = {
  code: "PGRST204",
  message: "Could not find the 'created_in_purchase' column of 'products' in the schema cache",
};

function mockProductInsert(handler: (rows: unknown) => { data: unknown; error: unknown }) {
  vi.mocked(supabase.from).mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    chain.insert = (rows: unknown) => {
      const result = handler(rows);
      chain.single = () => Promise.resolve(result);
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject);
      return chain;
    };
    chain.select = () => chain;
    return chain as never;
  });
}

describe("isMissingCreatedInPurchaseColumn", () => {
  it("matches the live Purchase Entry schema-cache error", () => {
    expect(
      isMissingCreatedInPurchaseColumn({
        code: "PGRST204",
        message: "Could not find the 'created_in_purchase' column of 'products' in the schema cache",
      }),
    ).toBe(true);
  });

  it("matches Postgres undefined-column from REST", () => {
    expect(
      isMissingCreatedInPurchaseColumn({
        code: "42703",
        message: "column products.created_in_purchase does not exist",
      }),
    ).toBe(true);
  });

  it("ignores unrelated product errors", () => {
    expect(
      isMissingCreatedInPurchaseColumn({
        message: "duplicate key value violates unique constraint",
      }),
    ).toBe(false);
  });
});

describe("omitCreatedInPurchaseField", () => {
  it("strips only the pending flag", () => {
    expect(
      omitCreatedInPurchaseField({
        product_name: "TEE",
        created_in_purchase: true,
        status: "active",
      }),
    ).toEqual({ product_name: "TEE", status: "active" });
  });
});

describe("insertProductsPreferringPurchaseFlag", () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
  });

  it("retries without the flag after the live schema-cache error", async () => {
    const payloads: unknown[] = [];
    mockProductInsert((rows) => {
      payloads.push(rows);
      const list = rows as Array<Record<string, unknown>>;
      if (list.some((row) => "created_in_purchase" in row)) {
        return { data: null, error: SCHEMA_CACHE_ERROR };
      }
      return { data: { id: "p1" }, error: null };
    });

    const { data, error } = await insertProductsPreferringPurchaseFlag(
      [{ product_name: "TEE", created_in_purchase: true }],
      { select: "id", single: true },
    );

    expect(error).toBeNull();
    expect(data).toEqual({ id: "p1" });
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toEqual([{ product_name: "TEE", created_in_purchase: true }]);
    expect(payloads[1]).toEqual([{ product_name: "TEE" }]);
  });

  it("does not retry unrelated insert errors", async () => {
    const payloads: unknown[] = [];
    mockProductInsert((rows) => {
      payloads.push(rows);
      return { data: null, error: { message: "duplicate key value violates unique constraint" } };
    });

    const { data, error } = await insertProductsPreferringPurchaseFlag(
      [{ product_name: "TEE", created_in_purchase: true }],
      { select: "id", single: true },
    );

    expect(data).toBeNull();
    expect(error).toEqual({ message: "duplicate key value violates unique constraint" });
    expect(payloads).toHaveLength(1);
  });
});
