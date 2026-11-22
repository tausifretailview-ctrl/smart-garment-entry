import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { op: string; table?: string; arg?: unknown };
const db = vi.hoisted(() => ({
  calls: [] as Call[],
  rpc: { data: null as unknown, error: null as unknown },
  previous: [] as Record<string, unknown>[],
  /** 1-based index of the line insert that fails (0 = none). */
  failInsertAt: 0,
  insertError: { message: "Insufficient stock" } as unknown,
  inserts: 0,
  /** 1-based index of the delete that fails (0 = none). */
  failDeleteAt: 0,
  deletes: 0,
  headerError: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string, args: unknown) => (db.calls.push({ op: `rpc:${name}`, arg: args }), db.rpc),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: async () => (db.calls.push({ op: "select", table }), { data: db.previous, error: null }),
          }),
        }),
      }),
      delete: () => ({
        eq: async () => {
          db.deletes += 1;
          db.calls.push({ op: "delete", table });
          return { error: db.deletes === db.failDeleteAt ? { message: "delete refused" } : null };
        },
      }),
      insert: async (rows: unknown) => {
        db.inserts += 1;
        db.calls.push({ op: "insert", table, arg: rows });
        return { error: db.inserts === db.failInsertAt ? db.insertError : null };
      },
      update: (patch: unknown) => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              single: async () => (
                db.calls.push({ op: "update", table, arg: patch }),
                { data: db.headerError ? null : { id: "s1", net_amount: 150 }, error: db.headerError }
              ),
            }),
          }),
        }),
      }),
    }),
  },
}));

import { SaleLinesNotRestoredError, saveSaleEditWithLines, shouldSaveSaleEditInSteps } from "@/lib/data/saveSaleEdit";

const line = (n: number) => ({ sale_id: "s1", product_name: `P${n}`, quantity: 1 });
const sale = { kind: "sale" as const, organizationId: "org1", documentId: "s1", header: { net_amount: 150 } };
const ops = () => db.calls.map((c) => (c.table ? `${c.op}:${c.table}` : c.op));

beforeEach(() => {
  db.calls = [];
  db.rpc = { data: { success: true, lines_deleted: 2, lines_inserted: 1, header: { id: "s1", net_amount: 150 } }, error: null };
  db.previous = [
    { id: "old1", created_at: "t", sale_id: "s1", product_name: "OLD1", quantity: 2 },
    { id: "old2", created_at: "t", sale_id: "s1", product_name: "OLD2", quantity: 1 },
  ];
  db.failInsertAt = 0;
  db.insertError = { message: "Insufficient stock" };
  db.inserts = 0;
  db.failDeleteAt = 0;
  db.deletes = 0;
  db.headerError = null;
});

/** Review items B1, B2, B4: an edited bill is saved all at once, or left exactly as it was. */
describe("saveSaleEditWithLines", () => {
  it("saves lines and header in one request and returns the saved header", async () => {
    const res = await saveSaleEditWithLines({ ...sale, rows: [line(1)] });
    expect(res).toEqual({ mode: "one-step", header: { id: "s1", net_amount: 150 }, salesmanColumnMissing: false });
    expect(ops()).toEqual(["rpc:save_document_with_lines"]);
    expect(db.calls[0].arg).toEqual({
      p_kind: "sale",
      p_organization_id: "org1",
      p_document_id: "s1",
      p_header: { net_amount: 150 },
      p_lines: [line(1)],
    });
  });

  it("a refused line (e.g. no stock) fails the save without touching the bill from the browser", async () => {
    db.rpc = { data: null, error: { code: "P0001", message: "Insufficient stock" } };
    await expect(saveSaleEditWithLines({ ...sale, rows: [line(1)] })).rejects.toMatchObject({ message: "Insufficient stock" });
    expect(ops()).toEqual(["rpc:save_document_with_lines"]);
  });

  it("an answer without success is an error, not a silent save", async () => {
    db.rpc = { data: null, error: null };
    await expect(saveSaleEditWithLines({ ...sale, rows: [line(1)] })).rejects.toThrow(/not saved/);
  });

  it.each([
    ["the SQL has not been run", { code: "PGRST202", message: "Could not find the function" }],
    ["the database has the earlier version", { code: "22023", message: "Unknown document kind sale" }],
    ["one statement was too slow", { code: "57014", message: "canceling statement due to statement timeout" }],
  ])("uses the old steps when %s", async (_why, error) => {
    db.rpc = { data: null, error };
    const res = await saveSaleEditWithLines({ ...sale, rows: [line(1), line(2)] });
    expect(res.mode).toBe("steps");
    expect(res.header).toEqual({ id: "s1", net_amount: 150 });
    expect(ops()).toEqual([
      "rpc:save_document_with_lines",
      "select:sale_items",
      "delete:sale_items",
      "insert:sale_items",
      "update:sales",
    ]);
  });

  it("steps: when new lines fail part way, the saved part is cleared before the old lines go back", async () => {
    db.rpc = { data: null, error: { code: "PGRST202", message: "missing" } };
    // 7 lines = two inserts of 5 and 2; the second fails after the first saved.
    db.failInsertAt = 2;
    const rows = Array.from({ length: 7 }, (_, i) => line(i + 1));
    await expect(saveSaleEditWithLines({ ...sale, rows })).rejects.toMatchObject({ message: "Insufficient stock" });
    expect(ops()).toEqual([
      "rpc:save_document_with_lines",
      "select:sale_items",
      "delete:sale_items",
      "insert:sale_items", // 5 new lines saved
      "insert:sale_items", // next 2 fail
      "delete:sale_items", // clear the 5, or they would stay next to the old lines
      "insert:sale_items", // old lines back
    ]);
    // Old lines return without their id / created_at; the header is not touched.
    expect(db.calls.at(-1)?.arg).toEqual([
      { sale_id: "s1", product_name: "OLD1", quantity: 2 },
      { sale_id: "s1", product_name: "OLD2", quantity: 1 },
    ]);
  });

  it("steps: says so when the bill could not be put back", async () => {
    db.rpc = { data: null, error: { code: "PGRST202", message: "missing" } };
    db.failInsertAt = 1;
    db.failDeleteAt = 2; // the clear after the failed insert
    await expect(saveSaleEditWithLines({ ...sale, rows: [line(1)] })).rejects.toBeInstanceOf(SaleLinesNotRestoredError);
    expect(ops()).not.toContain("update:sales");
  });

  it("steps: a failed first delete stops before anything is inserted", async () => {
    db.rpc = { data: null, error: { code: "PGRST202", message: "missing" } };
    db.failDeleteAt = 1;
    await expect(saveSaleEditWithLines({ ...sale, rows: [line(1)] })).rejects.toMatchObject({ message: "delete refused" });
    expect(ops()).toEqual(["rpc:save_document_with_lines", "select:sale_items", "delete:sale_items"]);
  });

  it("sale return: same save, its own tables", async () => {
    await saveSaleEditWithLines({ kind: "sale_return", organizationId: "org1", documentId: "r1", header: { notes: "x" }, rows: [{ return_id: "r1" }] });
    expect((db.calls[0].arg as { p_kind: string }).p_kind).toBe("sale_return");

    db.calls = [];
    db.rpc = { data: null, error: { code: "PGRST202", message: "missing" } };
    db.failInsertAt = 1;
    await expect(
      saveSaleEditWithLines({ kind: "sale_return", organizationId: "org1", documentId: "r1", header: { notes: "x" }, rows: [{ return_id: "r1" }] }),
    ).rejects.toMatchObject({ message: "Insufficient stock" });
    // The return keeps its old lines instead of ending with none.
    expect(ops()).toEqual([
      "rpc:save_document_with_lines",
      "select:sale_return_items",
      "delete:sale_return_items",
      "insert:sale_return_items",
      "delete:sale_return_items",
      "insert:sale_return_items",
    ]);
  });
});

describe("shouldSaveSaleEditInSteps", () => {
  it("only for a missing / older function or a timeout", () => {
    expect(shouldSaveSaleEditInSteps(null)).toBe(false);
    expect(shouldSaveSaleEditInSteps({ code: "42883", message: "function does not exist" })).toBe(true);
    expect(shouldSaveSaleEditInSteps({ code: "22023", message: "lines must be an array" })).toBe(false);
    expect(shouldSaveSaleEditInSteps({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(shouldSaveSaleEditInSteps({ code: "42501", message: "Not authorized for this organization" })).toBe(false);
    expect(shouldSaveSaleEditInSteps({ code: "P0002", message: "Document not found" })).toBe(false);
  });
});
