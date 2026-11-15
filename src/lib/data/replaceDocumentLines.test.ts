// @vitest-environment jsdom
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  calls: [] as { op: string; arg?: unknown }[],
  fail: {} as Record<string, unknown>,
  previous: [] as Record<string, unknown>[],
  insertCount: 0,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: async () => (db.calls.push({ op: "select" }), { data: db.previous, error: db.fail.select ?? null }) }),
      delete: () => ({ eq: async () => (db.calls.push({ op: "delete" }), { error: db.fail.delete ?? null }) }),
      insert: async (rows: unknown) => {
        db.calls.push({ op: "insert", arg: rows });
        db.insertCount += 1;
        // first insert = new lines; second = restore of the old lines
        return { error: db.insertCount === 1 ? db.fail.insert ?? null : null };
      },
    }),
  },
}));

import { replaceDocumentLines } from "@/lib/data/replaceDocumentLines";
// @ts-expect-error -- plain .mjs helper shared with the CLI
import { findUncheckedWrites } from "../../../scripts/count-unchecked-writes.mjs";

const opts = { table: "sale_order_items" as const, parentColumn: "order_id", parentId: "o1", rows: [{ id: "n1" }] };

/** Plan Phase 4, R6: replacing a document's lines never doubles or empties them silently. */
describe("replaceDocumentLines", () => {
  beforeEach(() => {
    db.calls = [];
    db.fail = {};
    db.previous = [{ id: "old1" }, { id: "old2" }];
    db.insertCount = 0;
  });

  it("reads the old lines, deletes them, inserts the new ones", async () => {
    await replaceDocumentLines(opts);
    expect(db.calls.map((c) => c.op)).toEqual(["select", "delete", "insert"]);
    expect(db.calls[2].arg).toEqual([{ id: "n1" }]);
  });

  it("a failed delete stops before inserting (no doubled lines)", async () => {
    db.fail.delete = { message: "denied" };
    await expect(replaceDocumentLines(opts)).rejects.toMatchObject({ message: "denied" });
    expect(db.calls.map((c) => c.op)).toEqual(["select", "delete"]);
  });

  it("a failed insert puts the old lines back and reports the error (no empty document)", async () => {
    db.fail.insert = { message: "network" };
    await expect(replaceDocumentLines(opts)).rejects.toMatchObject({ message: "network" });
    expect(db.calls.map((c) => c.op)).toEqual(["select", "delete", "insert", "insert"]);
    expect(db.calls[3].arg).toEqual([{ id: "old1" }, { id: "old2" }]);
  });
});

/**
 * Writes whose error is never checked (a failed save looks like success). The count may only
 * go down: fix one, then lower the baseline. Run `node scripts/count-unchecked-writes.mjs` to list them.
 */
const UNCHECKED_WRITES_BASELINE = 46;

describe("unchecked database writes (ratchet)", () => {
  it(`stay at or below ${UNCHECKED_WRITES_BASELINE}`, () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const hits: string[] = findUncheckedWrites(src);
    expect(hits.length, hits.join("\n")).toBeLessThanOrEqual(UNCHECKED_WRITES_BASELINE);
  });
});
