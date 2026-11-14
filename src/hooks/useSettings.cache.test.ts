// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reads = vi.hoisted(() => ({ count: 0, row: { business_name: "ACME", sale_settings: {} } as Record<string, unknown> | null, fail: false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            reads.count += 1;
            return reads.fail ? { data: null, error: { message: "boom" } } : { data: reads.row, error: null };
          },
        }),
      }),
    }),
  },
}));

import { getOrgSettingsRow, orgSettingsQueryKey, refreshOrgSettingsCache } from "@/hooks/useSettings";

/** Plan Phase 4, D6 (settings area): one cached settings row for the whole app. */
describe("shared settings row", () => {
  beforeEach(() => {
    reads.count = 0;
    reads.fail = false;
  });

  it("handlers and screens share one read", async () => {
    const qc = new QueryClient();
    expect(await getOrgSettingsRow(qc, "org-1")).toMatchObject({ business_name: "ACME" });
    await getOrgSettingsRow(qc, "org-1");
    expect(reads.count).toBe(1);
    // What useSettings() renders from.
    expect(qc.getQueryData(orgSettingsQueryKey("org-1"))).toMatchObject({ business_name: "ACME" });
    await getOrgSettingsRow(qc, "org-2");
    expect(reads.count).toBe(2);
  });

  it("a save refreshes the cache so the next read sees it", async () => {
    const qc = new QueryClient();
    await getOrgSettingsRow(qc, "org-1");
    reads.row = { business_name: "NEW NAME" };
    await refreshOrgSettingsCache(qc, "org-1");
    expect(await getOrgSettingsRow(qc, "org-1")).toMatchObject({ business_name: "NEW NAME" });
    expect(reads.count).toBe(2);
    reads.row = { business_name: "ACME", sale_settings: {} };
  });

  it("a failed read throws and is not cached", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    reads.fail = true;
    await expect(getOrgSettingsRow(qc, "org-1")).rejects.toMatchObject({ message: "boom" });
    reads.fail = false;
    expect(await getOrgSettingsRow(qc, "org-1")).toMatchObject({ business_name: "ACME" });
  });
});

/**
 * New screens read settings through useSettings() / getOrgSettingsRow(), not their own
 * `.from("settings")` query. The count may only go down. Writes, read-before-write paths,
 * logged-out pages (portal / field-sales login) and the accounting flag module keep theirs.
 */
const SETTINGS_TABLE_REFS_BASELINE = 42;

describe("direct settings table queries (ratchet)", () => {
  it(`stay at or below ${SETTINGS_TABLE_REFS_BASELINE}`, () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), "..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const n = (readFileSync(p, "utf8").match(/\.from\(\s*["']settings["']\s*\)/g) || []).length;
          if (n) hits.push(`${relative(src, p)}: ${n}`);
        }
      }
    };
    walk(src);
    const total = hits.reduce((sum, h) => sum + Number(h.split(": ")[1]), 0);
    expect(total, hits.join("\n")).toBeLessThanOrEqual(SETTINGS_TABLE_REFS_BASELINE);
  });
});
