import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import {
  ensureFreshGeneratedBarcode,
  ensureFreshGeneratedBarcodes,
  insertGeneratedProductVariant,
  isBarcodeCollisionError,
} from "./barcodeCollisionGuard";

const ORG = "org-1";

function mockLookup(taken: Set<string>) {
  vi.mocked(supabase.from).mockImplementation(() => {
    let barcode = "";
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, val: string) => {
      if (col === "barcode") barcode = val;
      return chain;
    };
    chain.is = () => chain;
    chain.limit = () =>
      Promise.resolve({
        data: taken.has(barcode) ? [{ id: "existing" }] : [],
        error: null,
      });
    return chain as never;
  });
}

describe("isBarcodeCollisionError", () => {
  it("detects postgres unique_violation", () => {
    expect(isBarcodeCollisionError({ code: "23505", message: "duplicate key" })).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isBarcodeCollisionError({ code: "42501", message: "not authorized" })).toBe(false);
    expect(isBarcodeCollisionError(null)).toBe(false);
  });
});

describe("ensureFreshGeneratedBarcode", () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  it("returns the candidate when it is still free", async () => {
    mockLookup(new Set());
    await expect(ensureFreshGeneratedBarcode(ORG, "450006772")).resolves.toBe("450006772");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("regenerates when a stale candidate is already on another variant (JEANS collision)", async () => {
    mockLookup(new Set(["450006772"]));
    vi.mocked(supabase.rpc).mockResolvedValue({ data: "450006780", error: null } as never);

    await expect(ensureFreshGeneratedBarcode(ORG, "450006772")).resolves.toBe("450006780");
    expect(supabase.rpc).toHaveBeenCalledWith("generate_next_barcode", {
      p_organization_id: ORG,
    });
  });

  it("does not treat an empty candidate as safe — allocates a fresh barcode", async () => {
    mockLookup(new Set());
    vi.mocked(supabase.rpc).mockResolvedValue({ data: "450006781", error: null } as never);
    await expect(ensureFreshGeneratedBarcode(ORG, "  ")).resolves.toBe("450006781");
  });

  it("keeps two rows in one batch from receiving the same still-free candidate", async () => {
    mockLookup(new Set());
    vi.mocked(supabase.rpc).mockResolvedValue({ data: "450006790", error: null } as never);

    const claimed = new Set<string>();
    const first = await ensureFreshGeneratedBarcode(ORG, "450006772", claimed);
    const second = await ensureFreshGeneratedBarcode(ORG, "450006772", claimed);

    expect(first).toBe("450006772");
    expect(second).toBe("450006790");
  });

  it("throws after 5 failed regenerations", async () => {
    mockLookup(new Set(["stuck"]));
    vi.mocked(supabase.rpc).mockResolvedValue({ data: "stuck", error: null } as never);

    await expect(ensureFreshGeneratedBarcode(ORG, "stuck")).rejects.toThrow(
      /free generated barcode after 5 attempts/,
    );
  });
});

describe("ensureFreshGeneratedBarcodes", () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  it("refreshes only the taken values in a size grid", async () => {
    mockLookup(new Set(["450006772"]));
    vi.mocked(supabase.rpc).mockResolvedValue({ data: "450006800", error: null } as never);

    await expect(
      ensureFreshGeneratedBarcodes(ORG, ["450006772", "450006773"]),
    ).resolves.toEqual(["450006800", "450006773"]);
  });
});

describe("insertGeneratedProductVariant", () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  it("retries the insert once with a fresh barcode on unique violation", async () => {
    const taken = new Set<string>();
    let barcodeSeen = "";
    let insertCalls = 0;
    vi.mocked(supabase.from).mockImplementation(() => {
      let mode: "lookup" | "insert" = "lookup";
      let barcode = "";
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: string) => {
        if (col === "barcode") barcode = val;
        return chain;
      };
      chain.is = () => chain;
      chain.limit = () =>
        Promise.resolve({
          data: taken.has(barcode) ? [{ id: "existing" }] : [],
          error: null,
        });
      chain.insert = (row: { barcode: string }) => {
        mode = "insert";
        barcodeSeen = row.barcode;
        insertCalls += 1;
        if (insertCalls === 1) taken.add(row.barcode);
        return chain;
      };
      chain.single = () => {
        if (mode === "insert" && insertCalls === 1) {
          return Promise.resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value" },
          });
        }
        return Promise.resolve({ data: { id: "v-new" }, error: null });
      };
      return chain as never;
    });
    vi.mocked(supabase.rpc).mockResolvedValue({ data: "450006801", error: null } as never);

    const result = await insertGeneratedProductVariant({
      organization_id: ORG,
      product_id: "p1",
      barcode: "450006772",
    });

    expect(insertCalls).toBe(2);
    expect(result.barcode).toBe("450006801");
    expect(result.data).toEqual({ id: "v-new" });
    expect(barcodeSeen).toBe("450006801");
  });
});
