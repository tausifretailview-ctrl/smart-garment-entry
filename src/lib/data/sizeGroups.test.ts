// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  reads: 0,
  rows: [] as { id: string; group_name: string; sizes: string[]; organization_id: string }[],
  fail: false,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => {
            db.reads += 1;
            return db.fail ? { data: null, error: { message: "boom", code: "500" } } : { data: [...db.rows], error: null };
          },
        }),
      }),
    }),
  },
}));

import { getSizeGroups, getSizeGroupsByIds, readSizeGroups, refreshSizeGroupsCache } from "@/lib/data/sizeGroups";

const g = (id: string, name: string) => ({ id, group_name: name, sizes: ["S", "M"], organization_id: "org-1" });

/** Plan Phase 4, D6: one cached size-group list per shop. */
describe("size groups data module", () => {
  beforeEach(() => {
    db.reads = 0;
    db.fail = false;
    db.rows = [g("sg-1", "SHIRTS"), g("sg-2", "KIDS")];
  });

  it("screens and searches share one read", async () => {
    const qc = new QueryClient();
    await getSizeGroups(qc, "org-1");
    const byId = await getSizeGroupsByIds(qc, "org-1", ["sg-2", "sg-2", ""]);
    expect([...byId.keys()]).toEqual(["sg-2"]);
    expect(byId.get("sg-2")?.group_name).toBe("KIDS");
    expect(db.reads).toBe(1);
  });

  it("an id missing from the cached list re-reads once (group made elsewhere)", async () => {
    const qc = new QueryClient();
    await getSizeGroups(qc, "org-1");
    db.rows.push(g("sg-3", "NEW"));
    const byId = await getSizeGroupsByIds(qc, "org-1", ["sg-1", "sg-3"]);
    expect(byId.get("sg-3")?.group_name).toBe("NEW");
    expect(db.reads).toBe(2);
  });

  it("a save refreshes the list", async () => {
    const qc = new QueryClient();
    await getSizeGroups(qc, "org-1");
    db.rows = [g("sg-1", "RENAMED")];
    await refreshSizeGroupsCache(qc, "org-1");
    expect((await getSizeGroups(qc, "org-1"))[0].group_name).toBe("RENAMED");
  });

  it("readSizeGroups keeps the { data, error } shape and does not cache a failure", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    db.fail = true;
    const failed = await readSizeGroups(qc, "org-1");
    expect(failed.data).toBeNull();
    expect(failed.error?.message).toBe("boom");
    db.fail = false;
    expect((await readSizeGroups(qc, "org-1")).data).toHaveLength(2);
  });
});

/** New code uses the module; direct size_groups reads may only go down. */
const SIZE_GROUP_TABLE_REFS_BASELINE = 9;

describe("direct size_groups queries (ratchet)", () => {
  it(`stay at or below ${SIZE_GROUP_TABLE_REFS_BASELINE}`, () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const hits: string[] = [];
    let total = 0;
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const n = (readFileSync(p, "utf8").match(/\.from\(\s*["']size_groups["']\s*\)/g) || []).length;
          if (n) {
            total += n;
            hits.push(`${relative(src, p)}: ${n}`);
          }
        }
      }
    };
    walk(src);
    expect(total, hits.join("\n")).toBeLessThanOrEqual(SIZE_GROUP_TABLE_REFS_BASELINE);
  });
});
