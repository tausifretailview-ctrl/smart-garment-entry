import { describe, expect, it } from "vitest";
import { fetchInIdBatches } from "@/lib/data/fetchInIdBatches";

/** A fake query: `rowsFor(batch)` rows, served `range` by `range`. */
const fakeQuery = (rowsFor: (batch: string[]) => unknown[], log: Array<[number, number, number]>, fail?: (b: string[]) => boolean) =>
  (batch: string[]) => ({
    range: async (from: number, to: number) => {
      log.push([batch.length, from, to]);
      if (fail?.(batch)) return { data: null, error: { message: "too long" } };
      return { data: rowsFor(batch).slice(from, to + 1), error: null };
    },
  });

describe("fetchInIdBatches", () => {
  it("splits ids into batches of 200, drops duplicates / blanks, joins the rows", async () => {
    const log: Array<[number, number, number]> = [];
    const ids = [...Array.from({ length: 450 }, (_, i) => `id${i}`), "id1", ""];
    const rows = await fetchInIdBatches(ids, fakeQuery((b) => b.map((id) => ({ id })), log));
    expect(log.map((l) => l[0])).toEqual([200, 200, 50]);
    expect(rows).toHaveLength(450);
  });

  it("reads every row past the 1,000-row server cap", async () => {
    const log: Array<[number, number, number]> = [];
    const rows = await fetchInIdBatches(["a", "b"], fakeQuery(() => Array.from({ length: 2300 }, (_, i) => i), log));
    expect(rows).toHaveLength(2300);
    expect(log.map((l) => l[1])).toEqual([0, 1000, 2000]);
  });

  it("no ids: no request; a failed request throws", async () => {
    const log: Array<[number, number, number]> = [];
    expect(await fetchInIdBatches([], fakeQuery(() => [], log))).toEqual([]);
    expect(log).toEqual([]);
    const ids = Array.from({ length: 300 }, (_, i) => `id${i}`);
    await expect(fetchInIdBatches(ids, fakeQuery(() => [], log, (b) => b[0] === "id200"))).rejects.toMatchObject({
      message: "too long",
    });
  });
});

/**
 * `.in(column, someIds)` reads whose id list is not batched (URL too long for a big shop,
 * rows past 1,000 dropped). The count may only go down: move a read onto fetchInIdBatches /
 * fetchAllRows, then lower the baseline. `node scripts/count-unbatched-id-lists.mjs` lists them.
 */
const UNBATCHED_ID_LISTS_BASELINE = 91;

describe("unbatched id-list reads (ratchet)", () => {
  it(`stay at or below ${UNBATCHED_ID_LISTS_BASELINE}`, async () => {
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    // @ts-expect-error -- plain .mjs helper shared with the CLI
    const { findUnbatchedIdLists } = await import("../../../scripts/count-unbatched-id-lists.mjs");
    const src = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const hits: string[] = findUnbatchedIdLists(src);
    expect(hits.length, hits.join("\n")).toBeLessThanOrEqual(UNBATCHED_ID_LISTS_BASELINE);
  });

  it("the scanner sees a new unbatched read and skips batched ones", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    // @ts-expect-error -- plain .mjs helper shared with the CLI
    const { findUnbatchedIdLists } = await import("../../../scripts/count-unbatched-id-lists.mjs");
    const dir = mkdtempSync(join(tmpdir(), "ub-"));
    writeFileSync(
      join(dir, "sample.ts"),
      [
        'const { data } = await supabase.from("sales").select("id").in("id", saleIds);',
        "",
        "const rows = await fetchInIdBatches(billIds, (ids) =>",
        '  supabase.from("purchase_items").select("id").in("bill_id", ids));',
      ].join("\n"),
    );
    expect(findUnbatchedIdLists(dir).map((h: string) => h.replace(/^.*sample\.ts:/, ""))).toEqual(["1 .in(id, saleIds)"]);
  });
});
