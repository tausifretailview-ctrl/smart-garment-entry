import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  batchMissing: false,
  batchError: null as unknown,
  next: 100,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.calls.push({ name, args });
      if (name === "generate_next_barcodes") {
        if (db.batchMissing) return { data: null, error: { code: "PGRST202", message: "not found" } };
        if (db.batchError) return { data: null, error: db.batchError };
        const n = Number(args.p_count);
        return { data: Array.from({ length: n }, () => String(db.next++)), error: null };
      }
      return { data: String(db.next++), error: null };
    },
  },
}));

import { BARCODE_BATCH_SIZE, generateNextBarcodes } from "@/lib/data/barcodeSeries";

describe("generateNextBarcodes", () => {
  beforeEach(() => {
    db.calls = [];
    db.batchMissing = false;
    db.batchError = null;
    db.next = 100;
  });

  it("asks for many barcodes in one request, in series order", async () => {
    expect(await generateNextBarcodes("org-1", 3)).toEqual(["100", "101", "102"]);
    expect(db.calls).toEqual([{ name: "generate_next_barcodes", args: { p_organization_id: "org-1", p_count: 3 } }]);
  });

  it("splits very large imports into requests of BARCODE_BATCH_SIZE", async () => {
    const done: number[] = [];
    const codes = await generateNextBarcodes("org-1", BARCODE_BATCH_SIZE + 5, (n) => done.push(n));
    expect(codes).toHaveLength(BARCODE_BATCH_SIZE + 5);
    expect(db.calls.map((c) => c.args.p_count)).toEqual([BARCODE_BATCH_SIZE, 5]);
    expect(done).toEqual([BARCODE_BATCH_SIZE, BARCODE_BATCH_SIZE + 5]);
  });

  it("falls back to one call per barcode, in order, while the SQL is missing", async () => {
    db.batchMissing = true;
    expect(await generateNextBarcodes("org-1", 3)).toEqual(["100", "101", "102"]);
    expect(db.calls.map((c) => c.name)).toEqual([
      "generate_next_barcodes",
      "generate_next_barcode",
      "generate_next_barcode",
      "generate_next_barcode",
    ]);
  });

  it("any other batch error is reported", async () => {
    db.batchError = { code: "42501", message: "Not authorized" };
    await expect(generateNextBarcodes("org-1", 2)).rejects.toMatchObject({ code: "42501" });
  });

  it("nothing asked for: no request", async () => {
    expect(await generateNextBarcodes("org-1", 0)).toEqual([]);
    expect(db.calls).toEqual([]);
  });
});
