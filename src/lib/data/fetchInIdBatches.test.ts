import { describe, expect, it } from "vitest";
import { fetchInIdBatches } from "@/lib/data/fetchInIdBatches";

describe("fetchInIdBatches", () => {
  it("splits ids into batches, drops duplicates / blanks, joins the rows", async () => {
    const seen: number[] = [];
    const ids = [...Array.from({ length: 450 }, (_, i) => `id${i}`), "id1", ""];
    const rows = await fetchInIdBatches(ids, async (batch) => {
      seen.push(batch.length);
      return { data: batch.map((id) => ({ id })), error: null };
    });
    expect(seen).toEqual([200, 200, 50]);
    expect(rows).toHaveLength(450);
  });

  it("no ids: no request", async () => {
    let called = false;
    expect(await fetchInIdBatches([], async () => ((called = true), { data: [], error: null }))).toEqual([]);
    expect(called).toBe(false);
  });

  it("a failed batch throws", async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `id${i}`);
    await expect(
      fetchInIdBatches(ids, async (batch) => ({ data: null, error: batch[0] === "id200" ? { message: "too long" } : null })),
    ).rejects.toMatchObject({ message: "too long" });
  });
});
