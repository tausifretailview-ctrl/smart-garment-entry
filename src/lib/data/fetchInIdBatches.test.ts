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
