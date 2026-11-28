import { beforeEach, describe, expect, it } from "vitest";
import {
  addExtraBarcode,
  findVariantIdByExtraBarcode,
  looksLikeBarcode,
  resetVariantBarcodesStateForTests,
  type VariantBarcodesDb,
} from "./variantBarcodes";

/** Extra barcodes per item (supermarket go-live, Nov 2026). */
function fakeDb(opts: { rows?: Array<{ variant_id: string }>; error?: { code?: string; message?: string } | null; insertError?: { code?: string; message?: string } | null } = {}) {
  let reads = 0;
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => {
              reads++;
              return Promise.resolve({ data: opts.error ? null : opts.rows ?? [], error: opts.error ?? null });
            },
          }),
          in: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null }) }) }),
        }),
      }),
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: () =>
            Promise.resolve(
              opts.insertError
                ? { data: null, error: opts.insertError }
                : { data: { id: "x", variant_id: row.variant_id, barcode: row.barcode }, error: null },
            ),
        }),
      }),
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }),
  } as unknown as VariantBarcodesDb;
  return { db, reads: () => reads };
}

beforeEach(() => resetVariantBarcodesStateForTests());

describe("extra barcode lookup", () => {
  it("finds the item an extra barcode belongs to", async () => {
    const { db } = fakeDb({ rows: [{ variant_id: "v-1" }] });
    await expect(findVariantIdByExtraBarcode(db, "org", "8901058000023")).resolves.toBe("v-1");
  });

  it("typed product names never cost a lookup", async () => {
    const { db, reads } = fakeDb();
    expect(looksLikeBarcode("tata salt")).toBe(false);
    await expect(findVariantIdByExtraBarcode(db, "org", "tata salt")).resolves.toBeNull();
    expect(reads()).toBe(0);
  });

  it("before the SQL is run: not found, and it stops asking", async () => {
    const { db, reads } = fakeDb({ error: { code: "42P01", message: 'relation "variant_barcodes" does not exist' } });
    await expect(findVariantIdByExtraBarcode(db, "org", "8901058000023")).resolves.toBeNull();
    await expect(findVariantIdByExtraBarcode(db, "org", "8901058000030")).resolves.toBeNull();
    expect(reads()).toBe(1);
  });

  it("other read errors are a miss, never a crash at the counter", async () => {
    const { db } = fakeDb({ error: { code: "57014", message: "timeout" } });
    await expect(findVariantIdByExtraBarcode(db, "org", "8901058000023")).resolves.toBeNull();
  });
});

describe("adding an extra barcode", () => {
  it("explains a barcode already in use", async () => {
    const main = fakeDb({ insertError: { code: "23505", message: "Barcode 890 is already the main barcode of another item" } });
    await expect(addExtraBarcode(main.db, "org", "v-1", "890")).rejects.toThrow("already another item's main barcode");
    const dup = fakeDb({ insertError: { code: "23505", message: "duplicate key value violates unique constraint" } });
    await expect(addExtraBarcode(dup.db, "org", "v-1", "890")).rejects.toThrow("already an extra barcode");
    await expect(addExtraBarcode(dup.db, "org", "v-1", "  ")).rejects.toThrow("Type or scan");
  });
});
