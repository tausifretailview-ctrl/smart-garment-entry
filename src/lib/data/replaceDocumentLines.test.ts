// @vitest-environment jsdom
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  calls: [] as { op: string; arg?: unknown }[],
  fail: {} as Record<string, unknown>,
  previous: [] as Record<string, unknown>[],
  insertCount: 0,
  rpc: { data: null as unknown, error: null as unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: unknown) => (db.calls.push({ op: `rpc:${name}`, arg: args }), db.rpc),
    from: (table: string) => ({
      update: (patch: unknown) => ({
        eq: () => ({
          eq: async () => (db.calls.push({ op: `update:${table}`, arg: patch }), { error: db.fail.update ?? null }),
        }),
      }),
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

import { replaceDocumentLines, saveDocumentWithLines } from "@/lib/data/replaceDocumentLines";
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

/** An edited document's header and lines are saved together (one transaction when the SQL is in). */
describe("saveDocumentWithLines", () => {
  const doc = { kind: "quotation" as const, organizationId: "org1", documentId: "q1", header: { net_amount: 10 }, rows: [{ product_id: "p1" }] };
  beforeEach(() => {
    db.calls = [];
    db.fail = {};
    db.previous = [{ id: "old1" }];
    db.insertCount = 0;
    db.rpc = { data: { success: true }, error: null };
  });

  it("uses the one-step function when it is in the database", async () => {
    await expect(saveDocumentWithLines(doc)).resolves.toBe("one-step");
    expect(db.calls.map((c) => c.op)).toEqual(["rpc:save_document_with_lines"]);
    expect(db.calls[0].arg).toEqual({
      p_kind: "quotation",
      p_organization_id: "org1",
      p_document_id: "q1",
      p_header: { net_amount: 10 },
      p_lines: [{ product_id: "p1" }],
    });
  });

  it("an error from the function is reported; nothing else is written", async () => {
    db.rpc = { data: null, error: { code: "P0002", message: "Document not found" } };
    await expect(saveDocumentWithLines(doc)).rejects.toMatchObject({ message: "Document not found" });
    expect(db.calls.map((c) => c.op)).toEqual(["rpc:save_document_with_lines"]);
  });

  it("falls back to header update + checked line replace while the SQL is missing", async () => {
    db.rpc = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
    await expect(saveDocumentWithLines(doc)).resolves.toBe("steps");
    expect(db.calls.map((c) => c.op)).toEqual(["rpc:save_document_with_lines", "update:quotations", "select", "delete", "insert"]);
  });

  it("fallback: a failed header update stops before the lines are touched", async () => {
    db.rpc = { data: null, error: { code: "42883", message: "function does not exist" } };
    db.fail.update = { message: "denied" };
    await expect(saveDocumentWithLines(doc)).rejects.toMatchObject({ message: "denied" });
    expect(db.calls.map((c) => c.op)).toEqual(["rpc:save_document_with_lines", "update:quotations"]);
  });
});

/**
 * Writes whose error is never checked (a failed save looks like success). The count may only
 * go down: fix one, then lower the baseline. Run `node scripts/count-unchecked-writes.mjs` to list them.
 */
const UNCHECKED_WRITES_BASELINE = 0;

describe("unchecked database writes (ratchet)", () => {
  it(`stay at or below ${UNCHECKED_WRITES_BASELINE}`, () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const hits: string[] = findUncheckedWrites(src);
    expect(hits.length, hits.join("\n")).toBeLessThanOrEqual(UNCHECKED_WRITES_BASELINE);
  });
});
